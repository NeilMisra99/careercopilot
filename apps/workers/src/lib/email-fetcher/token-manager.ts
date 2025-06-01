import type postgres from 'postgres';
import type { ScheduledWorkerEnv, UserEmailIntegrationForFetcher, FetchErrorData } from './types';
import type { TokenRepository } from '../token-repository';
import { encryptToken, decryptToken } from '../crypto';

/**
 * Get a valid Gmail access token, refreshing if necessary
 */
export async function getValidGmailAccessToken(
	env: ScheduledWorkerEnv,
	integration: UserEmailIntegrationForFetcher,
	cryptoKey: CryptoKey,
	db: postgres.Sql,
	tokenRepository: TokenRepository,
): Promise<string | null> {
	console.log(
		`[token-manager] getValidGmailAccessToken called for user ${integration.user_id}, email: ${integration.email_address} using TokenRepository`,
	);

	const tokenData = await tokenRepository.get(integration.user_id, 'gmail');

	if (!tokenData || !tokenData.refreshTokenEncrypted) {
		console.error(
			`[token-manager] User ${integration.user_id} (${integration.email_address}) missing token data or refresh token via TokenRepository. Marking as error.`,
		);
		await db`UPDATE public.user_email_integrations SET sync_status = 'error', sync_error_message = 'Missing refresh token via repository' WHERE id = ${integration.id}`;
		return null;
	}

	let accessToken: string | null = null;
	const now = new Date();
	const expiresAt = tokenData.accessTokenExpiresAt ? new Date(tokenData.accessTokenExpiresAt) : null;

	if (tokenData.accessTokenEncrypted && expiresAt && expiresAt > now) {
		console.log(`[token-manager] Access token for user ${integration.user_id} (from repo) appears current. Attempting decryption.`);
		try {
			accessToken = await decryptToken(tokenData.accessTokenEncrypted, cryptoKey);
			console.log(`[token-manager] Successfully decrypted existing access token for user ${integration.user_id} (from repo).`);
		} catch (decryptionError: any) {
			console.error(`[token-manager] Failed to decrypt access token (from repo) for user ${integration.user_id}:`, decryptionError.message);
			await db`UPDATE public.user_email_integrations SET sync_status = 'error', sync_error_message = ${`Failed to decrypt access token from repo: ${decryptionError.message}`.substring(0, 255)} WHERE id = ${integration.id}`;
			accessToken = null; // Force refresh
		}
	}

	if (!accessToken) {
		console.log(`[token-manager] Access token needs refresh for user ${integration.user_id} (from repo). Decrypting refresh token.`);
		const refreshToken = await decryptToken(tokenData.refreshTokenEncrypted, cryptoKey);
		console.log(
			`[token-manager] Refresh token decrypted for user ${integration.user_id} (from repo). Requesting new access token from Google.`,
		);

		const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: env.GOOGLE_CLIENT_ID,
				client_secret: env.GOOGLE_CLIENT_SECRET,
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
			}),
		});

		if (!tokenResponse.ok) {
			let caughtError: any = { error: 'Unknown error refreshing token' };
			try {
				caughtError = await tokenResponse.json();
			} catch (e) {
				console.error(`[token-manager] Failed to parse JSON from error response during token refresh for ${integration.user_id}:`, e);
			}
			const errorData: FetchErrorData =
				typeof caughtError === 'object' && caughtError !== null ? caughtError : { error: 'Unknown error refreshing token' };
			console.error(
				`[token-manager] Error refreshing token for ${integration.user_id} (${integration.email_address}): ${tokenResponse.status}`,
				errorData,
			);

			if (tokenResponse.status === 400 || tokenResponse.status === 401) {
				// e.g. invalid_grant - This often means the refresh token is no longer valid.
				// We should clear the tokens from the repository and mark the integration as error, requiring re-authentication.
				console.warn(
					`[token-manager] Token refresh failed with ${tokenResponse.status} (likely invalid_grant) for ${integration.user_id}. Clearing tokens from repository. User needs to re-authenticate.`,
				);
				try {
					await tokenRepository.delete(integration.user_id, 'gmail');
				} catch (repoDeleteError: any) {
					console.error(
						`[token-manager] Failed to delete tokens from repository for user ${integration.user_id} after invalid_grant:`,
						repoDeleteError.message,
					);
				}
				await db`UPDATE public.user_email_integrations SET sync_status = 'error', sync_error_message = 'Failed to refresh token (invalid_grant - re-auth required)', access_token_encrypted = NULL, access_token_expires_at = NULL, refresh_token_encrypted = NULL WHERE id = ${integration.id}`;
			} else {
				const errorMessage =
					typeof errorData.error === 'string'
						? errorData.error
						: (typeof errorData.error === 'object' && errorData.error?.message) ||
							errorData.message ||
							errorData.error_description ||
							tokenResponse.statusText;
				await db`UPDATE public.user_email_integrations SET sync_status = 'error', sync_error_message = ${`Token refresh failed: ${errorMessage}`} WHERE id = ${integration.id}`;
			}
			return null;
		}

		const newTokensFromGoogle: {
			access_token: string;
			expires_in: number;
			scope: string;
			id_token?: string;
			refresh_token?: string;
		} = await tokenResponse.json();

		accessToken = newTokensFromGoogle.access_token;
		console.log(`[token-manager] Successfully refreshed access token for user ${integration.user_id} (from repo).`);
		const newExpiresAt = new Date(now.getTime() + newTokensFromGoogle.expires_in * 1000);

		const newEncryptedAccessToken = await encryptToken(newTokensFromGoogle.access_token, cryptoKey);
		let finalEncryptedRefreshToken = tokenData.refreshTokenEncrypted!;

		if (newTokensFromGoogle.refresh_token && newTokensFromGoogle.refresh_token !== refreshToken) {
			console.log(`[token-manager] Received new refresh token for user ${integration.user_id} (from repo). Updating.`);
			finalEncryptedRefreshToken = await encryptToken(newTokensFromGoogle.refresh_token, cryptoKey);
		}

		await tokenRepository.put(integration.user_id, 'gmail', {
			accessTokenEncrypted: newEncryptedAccessToken,
			refreshTokenEncrypted: finalEncryptedRefreshToken,
			accessTokenExpiresAt: newExpiresAt.toISOString(),
			scopes: newTokensFromGoogle.scope.split(' '),
		});

		// Update metadata in user_email_integrations table
		// This ensures sync_status is active and error messages are cleared.
		// Also updates access_token_expires_at and scopes for metadata consistency, regardless of where tokens are stored.
		await db`
            UPDATE public.user_email_integrations
            SET
                access_token_expires_at = ${newExpiresAt.toISOString()},
                scopes = ${newTokensFromGoogle.scope.split(' ')},
                sync_error_message = NULL,
                sync_status = 'active'
            WHERE id = ${integration.id}
        `;
		console.log(`[token-manager] Updated token data via repo and DB metadata for user ${integration.user_id}.`);
	}

	return accessToken;
}
