import type { Sql } from 'postgres'; // MODIFIED: Changed import for postgres Sql type
import type { TokenData, TokenRepository } from './token-repository';

/**
 * An implementation of TokenRepository that uses Supabase (Postgres) for storage.
 * This implementation assumes that the `user_email_integrations` table still exists
 * for storing metadata and, for this adapter, also the encrypted tokens.
 */
export class SupabaseTokenRepository implements TokenRepository {
	private db: Sql; // MODIFIED: Used Sql type

	constructor(db: Sql) {
		// MODIFIED: Used Sql type
		if (!db) {
			throw new Error('SupabaseTokenRepository: Database client (sql) is required.');
		}
		this.db = db;
	}

	async get(userId: string, provider: string): Promise<TokenData | null> {
		const result = await this.db<any[]>` -- Using any[] as UserEmailIntegration might not be defined here or fully match
      SELECT refresh_token_encrypted, access_token_encrypted, access_token_expires_at, scopes
      FROM user_email_integrations
      WHERE user_id = ${userId} AND provider = ${provider}
      LIMIT 1;
    `;

		if (!result || result.length === 0) {
			return null;
		}

		const record = result[0];
		return {
			refreshTokenEncrypted: record.refresh_token_encrypted,
			accessTokenEncrypted: record.access_token_encrypted,
			accessTokenExpiresAt: record.access_token_expires_at,
			scopes: typeof record.scopes === 'string' ? JSON.parse(record.scopes) : record.scopes, // Assuming scopes are stored as JSON string
		};
	}

	async put(userId: string, provider: string, tokenData: TokenData): Promise<void> {
		// This repository only handles token fields. Metadata (like email_address) should be set elsewhere
		// if this table is primarily for tokens. If it's the main integrations table,
		// this PUT might need to be an UPSERT that also handles email_address.
		// For now, assuming it updates existing records primarily for tokens.

		// Note: The user_email_integrations table needs user_id, provider, and email_address
		// for its primary key or unique constraint if it's being upserted.
		// This simplified 'put' assumes an entry might already exist or that token fields are nullable if only inserting tokens.
		// A more robust version would handle UPSERT logic if this is the sole writer to user_email_integrations.

		await this.db`
      UPDATE user_email_integrations
      SET 
        refresh_token_encrypted = ${tokenData.refreshTokenEncrypted},
        access_token_encrypted = ${tokenData.accessTokenEncrypted},
        access_token_expires_at = ${tokenData.accessTokenExpiresAt},
        scopes = ${tokenData.scopes ? JSON.stringify(tokenData.scopes) : null},
        updated_at = NOW()
      WHERE user_id = ${userId} AND provider = ${provider};
      -- If no row was updated (e.g., it's a new integration not yet in the metadata table),
      -- this won't insert. The OAuth callback needs to ensure the metadata row exists first.
    `;
		// Consider adding logic to check result.count to see if a row was updated.
		// If not, it implies the main metadata row for (userId, provider) doesn't exist, which is an issue.
	}

	async delete(userId: string, provider: string): Promise<void> {
		// This would typically nullify token fields rather than deleting the row,
		// if the row also contains other important metadata.
		// If this table is ONLY for tokens that are separate from metadata, then DELETE is fine.
		await this.db`
      UPDATE user_email_integrations
      SET 
        refresh_token_encrypted = NULL,
        access_token_encrypted = NULL, 
        access_token_expires_at = NULL,
        scopes = NULL,
        updated_at = NOW()
      WHERE user_id = ${userId} AND provider = ${provider};
    `;
	}
}
