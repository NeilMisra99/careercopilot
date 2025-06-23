import type { Sql } from 'postgres'; // MODIFIED: Changed import for postgres Sql type

/**
 * Represents the core token data that needs to be stored and retrieved.
 */
export interface TokenData {
	refreshTokenEncrypted: string | null;
	accessTokenEncrypted: string;
	accessTokenExpiresAt: string; // ISO string format
	scopes: string[] | null;
}

/**
 * Interface for a repository that handles storing and retrieving OAuth token data.
 */
export interface TokenRepository {
	/**
	 * Retrieves token data for a given user and provider.
	 * @param userId The ID of the user.
	 * @param provider The name of the OAuth provider (e.g., 'gmail').
	 * @returns A Promise that resolves to TokenData if found, otherwise null.
	 */
	get(userId: string, provider: string): Promise<TokenData | null>;

	/**
	 * Stores or updates token data for a given user and provider.
	 * @param userId The ID of the user.
	 * @param provider The name of the OAuth provider.
	 * @param tokenData The token data to store.
	 * @returns A Promise that resolves when the operation is complete.
	 */
	put(userId: string, provider: string, tokenData: TokenData): Promise<void>;

	/**
	 * Deletes token data for a given user and provider.
	 * @param userId The ID of the user.
	 * @param provider The name of the OAuth provider.
	 * @returns A Promise that resolves when the operation is complete.
	 */
	delete(userId: string, provider: string): Promise<void>;
}

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
		// Update existing integration records with new token data
		// The auth flow creates the initial record with email_address and other metadata
		// The workers only need to update token fields of existing integrations
		const result = await this.db`
			UPDATE user_email_integrations
			SET 
				refresh_token_encrypted = ${tokenData.refreshTokenEncrypted},
				access_token_encrypted = ${tokenData.accessTokenEncrypted},
				access_token_expires_at = ${tokenData.accessTokenExpiresAt},
				scopes = ${tokenData.scopes ? JSON.stringify(tokenData.scopes) : null},
				updated_at = NOW()
			WHERE user_id = ${userId} AND provider = ${provider};
		`;

		// Check if any row was updated
		if (result.count === 0) {
			throw new Error(`No integration found for user ${userId} and provider ${provider}. Please connect your account first.`);
		}
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
