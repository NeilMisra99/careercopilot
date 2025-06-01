import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getKeyMaterial, encryptToken, decryptToken } from '../../crypto';
import type { Env, GoogleTokenResponse, GoogleUserInfoResponse } from '../types';

/**
 * Get a valid Gmail access token for a user, refreshing if necessary
 */
export async function getValidGmailAccessToken(c: Context<Env>, userId: string, cryptoKey: CryptoKey): Promise<string | null> {
	try {
		console.log(`Attempting to get valid Gmail access token for user: ${userId}`);
		const tokenRepository = c.var.tokenRepository;

		if (!tokenRepository) {
			console.error('Token repository not available in context.');
			c.res = new Response(null, { status: 500 });
			return null;
		}

		const tokenData = await tokenRepository.get(userId, 'gmail');
		if (!tokenData) {
			console.log(`No Gmail integration found for user ${userId}.`);
			c.res = new Response(null, { status: 404 });
			return null;
		}

		const { accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt } = tokenData;

		// Check if access token is still valid (with 5-minute buffer)
		const expiresAt = new Date(accessTokenExpiresAt);
		const now = new Date();
		const bufferTime = 5 * 60 * 1000; // 5 minutes in ms

		if (now.getTime() < expiresAt.getTime() - bufferTime) {
			console.log(`Using existing valid access token for user ${userId}.`);
			return await decryptToken(accessTokenEncrypted, cryptoKey);
		}

		console.log(`Access token expired or expiring soon for user ${userId}. Attempting refresh.`);

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

		// Update Supabase metadata if using Supabase backend
		if (c.env.TOKEN_BACKEND === 'supabase') {
			const db = c.var.db;
			if (db) {
				try {
					await db`
						UPDATE user_email_integrations
						SET 
							access_token_encrypted = ${newAccessTokenEncrypted},
							access_token_expires_at = ${newExpiresAt},
							refresh_token_encrypted = ${refreshData.refresh_token ? await encryptToken(refreshData.refresh_token, cryptoKey) : refreshTokenEncrypted},
							updated_at = NOW()
						WHERE user_id = ${userId} AND provider = 'gmail';
					`;
				} catch (dbError: any) {
					console.error(`Failed to update token metadata in database for user ${userId}:`, dbError.message);
				}
			}
		}

		console.log(`Successfully refreshed access token for user ${userId}.`);
		return refreshData.access_token;
	} catch (error: any) {
		console.error(`Error getting valid Gmail access token for user ${userId}:`, error.message, error.stack);
		c.res = new Response(null, { status: 500 });
		return null;
	}
}

/**
 * Generate OAuth state for CSRF protection
 */
export function generateOAuthState(): string {
	return crypto.randomUUID();
}

/**
 * Set OAuth state using KV storage instead of cookies
 */
export async function setOAuthStateKV(c: Context<Env>, state: string): Promise<void> {
	const isLocalhost = c.req.url.startsWith('http://localhost') || c.req.url.includes('127.0.0.1');

	console.log(`[OAuth] Setting OAuth state in KV: ${state.substring(0, 8)}... (localhost: ${isLocalhost})`);

	// Store in KV with 10 minute expiration
	const kv = c.env.TOKEN_KV;
	if (kv) {
		await kv.put(
			`oauth_state:${state}`,
			JSON.stringify({
				timestamp: Date.now(),
				state: state,
			}),
			{ expirationTtl: 600 },
		); // 10 minutes
		console.log(`[OAuth] State stored in KV successfully`);
	} else {
		console.error(`[OAuth] TOKEN_KV not available, falling back to cookie`);
		// Fallback to cookie for development/testing
		setOAuthStateCookie(c, state);
	}
}

/**
 * Validate OAuth state from KV storage
 */
export async function validateOAuthStateKV(c: Context<Env>, receivedState: string): Promise<boolean> {
	const isLocalhost = c.req.url.startsWith('http://localhost') || c.req.url.includes('127.0.0.1');

	console.log(`[OAuth] Validating OAuth state from KV:`);
	console.log(`[OAuth] Received state: ${receivedState ? receivedState.substring(0, 8) + '...' : 'null'}`);
	console.log(`[OAuth] Environment: ${isLocalhost ? 'localhost' : 'production'}`);

	if (!receivedState) {
		console.log(`[OAuth] No state received`);
		return false;
	}

	const kv = c.env.TOKEN_KV;
	if (kv) {
		try {
			const storedData = await kv.get(`oauth_state:${receivedState}`);
			console.log(`[OAuth] KV lookup result: ${storedData ? 'found' : 'not found'}`);

			if (storedData) {
				// Clean up the used state
				await kv.delete(`oauth_state:${receivedState}`);
				console.log(`[OAuth] State validated successfully and cleaned up`);
				return true;
			} else {
				console.log(`[OAuth] State not found in KV - may have expired or been used`);
				return false;
			}
		} catch (error) {
			console.error(`[OAuth] Error validating state from KV:`, error);
			return false;
		}
	} else {
		console.log(`[OAuth] TOKEN_KV not available, falling back to cookie validation`);
		// Fallback to cookie validation
		return validateOAuthState(c, receivedState);
	}
}

/**
 * Set OAuth state cookie (original implementation for fallback)
 */
export function setOAuthStateCookie(c: Context<Env>, state: string): void {
	const cookieMaxAge = 10 * 60; // 10 minutes in seconds
	const isLocalhost = c.req.url.startsWith('http://localhost') || c.req.url.includes('127.0.0.1');
	const isSecure = !isLocalhost;

	console.log(`[OAuth] Setting OAuth state cookie: ${state.substring(0, 8)}... (secure: ${isSecure}, localhost: ${isLocalhost})`);
	console.log(`[OAuth] Request URL for context: ${c.req.url}`);

	// Set cookie with different configurations to handle edge cases
	const cookieOptions = {
		path: '/',
		secure: isSecure,
		httpOnly: true,
		maxAge: cookieMaxAge,
		sameSite: isLocalhost ? ('Lax' as const) : ('None' as const),
	};

	console.log(`[OAuth] Cookie options:`, cookieOptions);
	setCookie(c, 'oauth_state_csrf', state, cookieOptions);

	// Also try setting a backup cookie without SameSite restrictions for debugging
	if (!isLocalhost) {
		setCookie(c, 'oauth_state_backup', state, {
			path: '/',
			secure: isSecure,
			httpOnly: false, // Allow JS access for debugging
			maxAge: cookieMaxAge,
			// No sameSite restriction
		});
		console.log(`[OAuth] Set backup cookie for debugging`);
	}
}

/**
 * Create Google OAuth authorization URL
 */
export function createAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
	const scopes = [
		'https://www.googleapis.com/auth/gmail.readonly',
		'https://www.googleapis.com/auth/userinfo.email',
		'https://www.googleapis.com/auth/userinfo.profile',
	].join(' ');

	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	authUrl.searchParams.append('client_id', clientId);
	authUrl.searchParams.append('redirect_uri', redirectUri);
	authUrl.searchParams.append('response_type', 'code');
	authUrl.searchParams.append('scope', scopes);
	authUrl.searchParams.append('access_type', 'offline');
	authUrl.searchParams.append('prompt', 'consent');
	authUrl.searchParams.append('state', state);

	return authUrl.toString();
}

/**
 * Exchange OAuth code for tokens
 */
export async function exchangeOAuthCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string,
): Promise<GoogleTokenResponse> {
	const tokenParams = new URLSearchParams();
	tokenParams.append('code', code);
	tokenParams.append('client_id', clientId);
	tokenParams.append('client_secret', clientSecret);
	tokenParams.append('redirect_uri', redirectUri);
	tokenParams.append('grant_type', 'authorization_code');

	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: tokenParams,
	});

	return await tokenResponse.json<GoogleTokenResponse>();
}

/**
 * Fetch Google user info using access token
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfoResponse> {
	const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	return await userInfoResponse.json<GoogleUserInfoResponse>();
}

/**
 * Validate OAuth state and clean up cookie (original implementation for fallback)
 */
export function validateOAuthState(c: Context<Env>, receivedState: string): boolean {
	const storedState = getCookie(c, 'oauth_state_csrf');
	const backupState = getCookie(c, 'oauth_state_backup');
	const isLocalhost = c.req.url.startsWith('http://localhost') || c.req.url.includes('127.0.0.1');

	console.log(`[OAuth] Validating OAuth state from cookies:`);
	console.log(`[OAuth] Received state: ${receivedState ? receivedState.substring(0, 8) + '...' : 'null'}`);
	console.log(`[OAuth] Stored state: ${storedState ? storedState.substring(0, 8) + '...' : 'null'}`);
	console.log(`[OAuth] Backup state: ${backupState ? backupState.substring(0, 8) + '...' : 'null'}`);
	console.log(`[OAuth] Environment: ${isLocalhost ? 'localhost' : 'production'}`);
	console.log(`[OAuth] All request cookies: ${c.req.raw.headers.get('cookie') || 'none'}`);

	// Clean up cookies
	deleteCookie(c, 'oauth_state_csrf', {
		path: '/',
		secure: !isLocalhost,
		httpOnly: true,
		sameSite: isLocalhost ? ('Lax' as const) : ('None' as const),
	});

	if (!isLocalhost) {
		deleteCookie(c, 'oauth_state_backup', {
			path: '/',
			secure: true,
			httpOnly: false,
		});
	}

	// Try both primary and backup state validation
	const primaryValid = !!(receivedState && storedState && receivedState === storedState);
	const backupValid = !!(receivedState && backupState && receivedState === backupState);
	const isValid = primaryValid || backupValid;

	console.log(`[OAuth] Primary validation result: ${primaryValid}`);
	console.log(`[OAuth] Backup validation result: ${backupValid}`);
	console.log(`[OAuth] Final validation result: ${isValid}`);

	return isValid;
}
