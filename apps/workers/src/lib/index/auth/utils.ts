import type { Context } from 'hono';
import { encryptToken, decryptToken } from '../../crypto';
import type { Env, GoogleTokenResponse } from '../types';

/**
 * Get a valid Gmail access token for a user, refreshing if necessary
 */
export async function getValidGmailAccessToken(c: Context<Env>, userId: string, cryptoKey: CryptoKey): Promise<string | null> {
	try {
		const tokenRepository = c.var.tokenRepository;

		if (!tokenRepository) {
			console.error('Token repository not available in context.');
			c.res = new Response(null, { status: 500 });
			return null;
		}

		const tokenData = await tokenRepository.get(userId, 'gmail');
		if (!tokenData) {
			c.res = new Response(null, { status: 404 });
			return null;
		}

		const { accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt } = tokenData;

		// Check if access token is still valid (with 5-minute buffer)
		const expiresAt = new Date(accessTokenExpiresAt);
		const now = new Date();
		const bufferTime = 5 * 60 * 1000; // 5 minutes in ms

		if (now.getTime() < expiresAt.getTime() - bufferTime) {
			return await decryptToken(accessTokenEncrypted, cryptoKey);
		}

		if (!refreshTokenEncrypted) {
			console.error(`No refresh token available for user ${userId}.`);
			c.res = new Response(null, { status: 401 });
			return null;
		}

		// Refresh the access token
		const refreshToken = await decryptToken(refreshTokenEncrypted, cryptoKey);

		const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				refresh_token: refreshToken,
				client_id: c.env.GOOGLE_CLIENT_ID,
				client_secret: c.env.GOOGLE_CLIENT_SECRET,
				grant_type: 'refresh_token',
			}),
		});

		const refreshData = (await refreshResponse.json()) as GoogleTokenResponse;

		if (!refreshResponse.ok || refreshData.error) {
			console.error(`Failed to refresh token for user ${userId}:`, refreshData.error_description || refreshData.error);
			c.res = new Response(null, { status: 401 });
			return null;
		}

		// Update stored tokens
		const newAccessTokenEncrypted = await encryptToken(refreshData.access_token, cryptoKey);
		const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3599) * 1000).toISOString();

		const updatedTokenData = {
			...tokenData,
			accessTokenEncrypted: newAccessTokenEncrypted,
			accessTokenExpiresAt: newExpiresAt,
		};

		// If a new refresh token is provided, update it too
		if (refreshData.refresh_token) {
			updatedTokenData.refreshTokenEncrypted = await encryptToken(refreshData.refresh_token, cryptoKey);
		}

		await tokenRepository.put(userId, 'gmail', updatedTokenData);

		return refreshData.access_token;
	} catch (error: any) {
		c.res = new Response(null, { status: 500 });
		return null;
	}
}
