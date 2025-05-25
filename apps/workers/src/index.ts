/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import postgres from 'postgres';
import type { Hyperdrive } from '@cloudflare/workers-types';
import { supabaseMiddleware, getSupabase } from './middleware/auth.middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TokenRepository, TokenData } from './lib/token-repository';
import { SupabaseTokenRepository } from './lib/supabase-token-repository';
import { KvTokenRepository } from './lib/kv-token-repository';
import type { KVNamespace, MessageBatch, ExecutionContext, Queue, Ai } from '@cloudflare/workers-types';

// Import crypto helpers from the new location
import { getKeyMaterial, encryptToken, decryptToken } from './lib/crypto';

// Import shared types if you have any, e.g.:
// import type { Application } from '@trackflow/shared';
import type { EmailToParse, QueueMessage } from './lib/types';

// Import the queue handling logic
import { handleEmailParseQueueBatch, type QueueConsumerEnv } from './queue-consumer';
import { handleDLQBatch } from './dlq-consumer';

// Import the scheduled handler from email-fetcher
import emailFetcher from './email-fetcher';

// Import the job board scrapers
import { scrapeJobUrl } from './lib/job-board-scrapers';
import puppeteer from '@cloudflare/puppeteer';

// Define the environment bindings and variables
// These should align with your wrangler.jsonc
interface Env {
	Bindings: {
		SUPABASE_URL: string; // Still needed for hono/adapter env(c) in middleware
		SUPABASE_ANON_KEY: string; // Still needed for hono/adapter env(c) in middleware
		HYPERDRIVE_SUPABASE: Hyperdrive;
		GOOGLE_CLIENT_ID: string; // Added
		WORKER_GOOGLE_REDIRECT_URI: string; // Added for the worker's own callback
		GOOGLE_CLIENT_SECRET: string; // Added for token exchange
		TOKEN_ENCRYPTION_KEY: string; // Added for encrypting refresh tokens
		APP_BASE_URL: string; // Added for frontend redirects
		TOKEN_KV?: KVNamespace; // ADDED: For KV backend
		TOKEN_BACKEND?: 'supabase' | 'kv'; // ADDED: To choose backend
		EMAIL_PARSE_QUEUE: Queue<QueueMessage>; // Producer binding, already present from email-fetcher setup but good to have it here too for clarity
		AI?: Ai; // ADDED: Workers AI binding
		SUPABASE_SERVICE_ROLE_KEY?: string; // ADDED: For when queue consumer needs admin client
		EMAIL_SYNC_RATE_KV: KVNamespace; // ADDED: For rate limiting sync requests
		BROWSER: Fetcher; // ADDED: Browser Rendering API binding
		SCRAPING_CACHE_KV: KVNamespace; // ADDED: For caching scraping results
	};
	Variables: {
		supabase: SupabaseClient; // Set by supabaseMiddleware
		db?: postgres.Sql; // Set by Hyperdrive middleware in index.ts
		tokenRepository: TokenRepository; // ADDED: Injected by new middleware
	};
}

// Define interfaces for Google API responses for better typing
interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string; // Optional, as it's not always returned
	expires_in: number;
	scope: string;
	token_type: string;
	id_token?: string; // if openid scope was included
	error?: string;
	error_description?: string;
}

interface GoogleUserInfoResponse {
	id: string;
	email: string;
	verified_email: boolean;
	name?: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
	locale?: string;
	error?: {
		code: number;
		message: string;
		status: string;
	};
}

// === User Email Integration Type ===
interface UserEmailIntegration {
	id: string;
	user_id: string;
	email_address: string;
	refresh_token_encrypted: string | null;
	access_token_encrypted: string;
	access_token_expires_at: string; // ISO string format
	scopes: string | null;
}

// === Gmail Message Interface (for metadata) ===
interface GmailMessageMetadata {
	id: string;
	threadId: string;
	snippet: string;
	payload: {
		headers: { name: string; value: string }[];
	};
	// Add other fields if needed, like labelIds, historyId, internalDate
}

// === Helper: Get Valid Gmail Access Token ===
async function getValidGmailAccessToken(c: Context<Env>, userId: string, cryptoKey: CryptoKey): Promise<string | null> {
	const tokenRepository = c.var.tokenRepository;

	const tokenData = await tokenRepository.get(userId, 'gmail');

	if (!tokenData) {
		c.status(404);
		console.error(`Gmail token data not found for user ${userId} via repository.`);
		return null;
	}

	let accessToken = await decryptToken(tokenData.accessTokenEncrypted, cryptoKey);
	const refreshTokenString = tokenData.refreshTokenEncrypted ? await decryptToken(tokenData.refreshTokenEncrypted, cryptoKey) : null;

	const now = Math.floor(Date.now() / 1000);
	const expiresAt = Math.floor(new Date(tokenData.accessTokenExpiresAt).getTime() / 1000);
	const fiveMinutes = 5 * 60;

	if (now >= expiresAt - fiveMinutes) {
		console.log(`Access token for user ${userId} (provider: gmail) requires refresh.`);
		if (!refreshTokenString) {
			console.error(`Refresh token not available for user ${userId} (provider: gmail). Re-auth needed.`);
			c.status(401);
			return null;
		}

		const tokenParams = new URLSearchParams();
		tokenParams.append('client_id', c.env.GOOGLE_CLIENT_ID);
		tokenParams.append('client_secret', c.env.GOOGLE_CLIENT_SECRET);
		tokenParams.append('refresh_token', refreshTokenString);
		tokenParams.append('grant_type', 'refresh_token');

		const googleTokenResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: tokenParams,
		});

		const newTokens: GoogleTokenResponse = await googleTokenResponse.json();

		if (!googleTokenResponse.ok || newTokens.error) {
			const errorMessage = `Failed to refresh Google token: ${newTokens.error_description || newTokens.error}.`;
			console.error(errorMessage + ` (User: ${userId}, Provider: gmail)`);
			c.status(500);
			return null;
		}

		accessToken = newTokens.access_token;
		const newEncryptedAccessToken = await encryptToken(accessToken, cryptoKey);
		const newExpiresIn = newTokens.expires_in;
		const newAccessTokenExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString();
		let newEncryptedRefreshToken = tokenData.refreshTokenEncrypted;

		if (newTokens.refresh_token) {
			console.log(`Received new refresh token for user ${userId} (provider: gmail).`);
			newEncryptedRefreshToken = await encryptToken(newTokens.refresh_token, cryptoKey);
		}

		const updatedTokenData: TokenData = {
			refreshTokenEncrypted: newEncryptedRefreshToken,
			accessTokenEncrypted: newEncryptedAccessToken,
			accessTokenExpiresAt: newAccessTokenExpiresAt,
			scopes: newTokens.scope ? newTokens.scope.split(' ') : tokenData.scopes,
		};

		await tokenRepository.put(userId, 'gmail', updatedTokenData);
		console.log(`Access token refreshed and stored successfully for user ${userId} (provider: gmail) via repository.`);
	}
	return accessToken;
}

const app = new Hono<Env>();

// === Middleware ===

// CORS - adjust origin as needed for your Next.js app
app.use(
	'/api/*',
	cors({
		origin: (origin) => {
			const allowedOrigins = [
				'http://localhost:3000',
				'https://your-nextjs-app.vercel.app', // Replace with your actual Vercel URL
			];
			if (allowedOrigins.includes(origin)) {
				return origin;
			}
			return null;
		},
		allowHeaders: ['Authorization', 'Content-Type'],
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		credentials: true,
	}),
);

// Pretty JSON for all responses
app.use(prettyJSON());

// New Supabase Auth Middleware (handles client creation and user retrieval)
app.use('/api/*', supabaseMiddleware());

// Hyperdrive Initializer Middleware
app.use('/api/*', async (c, next: Next) => {
	if (!c.env.HYPERDRIVE_SUPABASE) {
		console.error('Hyperdrive binding HYPERDRIVE_SUPABASE not found.');
		return c.json({ error: 'Database not configured' }, 500);
	}
	try {
		const sql = postgres(c.env.HYPERDRIVE_SUPABASE.connectionString);
		c.set('db', sql);
	} catch (err: any) {
		console.error('Failed to connect to Hyperdrive:', err.message);
		return c.json({ error: 'Database connection error', details: err.message }, 500);
	}
	await next();
	// const dbClient = c.get('db');
	// if (dbClient && typeof dbClient.end === 'function') {
	//   c.executionCtx.waitUntil(dbClient.end());
	// }
});

// Token Repository Initializer Middleware
app.use('/api/*', async (c, next: Next) => {
	const backendType = c.env.TOKEN_BACKEND || 'supabase'; // Default to supabase
	let repository: TokenRepository;

	if (backendType === 'kv') {
		if (!c.env.TOKEN_KV) {
			console.error("TOKEN_BACKEND is set to 'kv' but TOKEN_KV binding is not available.");
			return c.json({ error: 'Token storage (KV) not configured.' }, 500);
		}
		repository = new KvTokenRepository(c.env.TOKEN_KV);
		console.log('Using KvTokenRepository for token storage.');
	} else {
		const db = c.var.db;
		if (!db) {
			console.error("TOKEN_BACKEND is set to 'supabase' but database client (db) is not available.");
			return c.json({ error: 'Token storage (DB) not configured.' }, 500);
		}
		repository = new SupabaseTokenRepository(db);
		console.log('Using SupabaseTokenRepository for token storage.');
	}
	c.set('tokenRepository', repository);
	await next();
});

// === API Routes ===

// Simple health check route (public - should be defined BEFORE auth middleware if truly public)
// For now, placing it here means it will attempt auth. If it needs to be public, move it before app.use('/api/*', supabaseMiddleware());
app.get('/api/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// === Gmail OAuth Routes ===
app.get('/api/auth/gmail/initiate', (c) => {
	const clientId = c.env.GOOGLE_CLIENT_ID;
	const redirectUri = c.env.WORKER_GOOGLE_REDIRECT_URI;

	if (!clientId || !redirectUri) {
		console.error('Google OAuth environment variables for worker are not set.');
		return c.json({ message: 'OAuth configuration error on server.' }, 500);
	}

	const state = crypto.randomUUID();
	const cookieMaxAge = 10 * 60; // 10 minutes in seconds

	const isLocalhost = c.req.url.startsWith('http://localhost');
	setCookie(c, 'oauth_state_csrf', state, {
		path: '/',
		secure: !isLocalhost, // Use Secure cookies only over HTTPS in prod; allow HTTP on localhost during dev
		httpOnly: true,
		maxAge: cookieMaxAge,
		sameSite: 'Lax',
	});

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

	return c.json({ authorizeUrl: authUrl.toString() });
});

app.get('/api/auth/gmail/callback', async (c) => {
	const code = c.req.query('code');
	const receivedState = c.req.query('state');
	const storedState = getCookie(c, 'oauth_state_csrf');
	const appBaseUrl = c.env.APP_BASE_URL || 'http://localhost:3000';

	deleteCookie(c, 'oauth_state_csrf', { path: '/', secure: !c.req.url.startsWith('http://localhost'), httpOnly: true, sameSite: 'Lax' });

	if (!code) {
		return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?error=missing_code`, 302);
	}

	if (!receivedState || !storedState || receivedState !== storedState) {
		console.error('Invalid OAuth state. Potential CSRF attack.');
		return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?error=invalid_state`, 302);
	}

	const supabase = getSupabase(c);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		console.error('User not authenticated during OAuth callback.');
		return c.redirect(`${appBaseUrl}/auth/login?error=session_expired_oauth`, 302);
	}

	try {
		const tokenParams = new URLSearchParams();
		tokenParams.append('code', code);
		tokenParams.append('client_id', c.env.GOOGLE_CLIENT_ID);
		tokenParams.append('client_secret', c.env.GOOGLE_CLIENT_SECRET);
		tokenParams.append('redirect_uri', c.env.WORKER_GOOGLE_REDIRECT_URI);
		tokenParams.append('grant_type', 'authorization_code');

		const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: tokenParams,
		});

		const tokenDataFromGoogle = await tokenResponse.json<GoogleTokenResponse>();

		if (!tokenResponse.ok || tokenDataFromGoogle.error) {
			console.error('Google token exchange error:', tokenDataFromGoogle.error_description || tokenDataFromGoogle.error || 'Unknown error');
			return c.redirect(
				`${appBaseUrl}/auth/onboarding/connect-email?error=token_exchange_failed&details=${encodeURIComponent(tokenDataFromGoogle.error_description || tokenDataFromGoogle.error || 'Unknown error')}`,
				302,
			);
		}

		const accessToken = tokenDataFromGoogle.access_token;
		const refreshToken = tokenDataFromGoogle.refresh_token;
		const expiresIn = tokenDataFromGoogle.expires_in;

		if (!refreshToken) {
			console.warn('Refresh token not received from Google.');
			return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?error=no_refresh_token`, 302);
		}

		const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		const userInfo = await userInfoResponse.json<GoogleUserInfoResponse>();

		if (userInfo.error || !userInfo.email) {
			console.error('Could not fetch user email from Google:', userInfo.error?.message);
			return c.redirect(
				`${appBaseUrl}/auth/onboarding/connect-email?error=email_fetch_failed&details=${encodeURIComponent(userInfo.error?.message || 'Unknown error')}`,
				302,
			);
		}
		const userEmail = userInfo.email;

		const encryptionKey = await getKeyMaterial(c.env.TOKEN_ENCRYPTION_KEY);
		const encryptedRefreshToken = await encryptToken(refreshToken, encryptionKey);
		const encryptedAccessToken = await encryptToken(accessToken, encryptionKey);
		const accessTokenExpiresAt = new Date(Date.now() + (expiresIn || 3599) * 1000).toISOString();
		const scopes = tokenDataFromGoogle.scope ? tokenDataFromGoogle.scope.split(' ') : null;

		const newAuthTokenData: TokenData = {
			refreshTokenEncrypted: encryptedRefreshToken,
			accessTokenEncrypted: encryptedAccessToken,
			accessTokenExpiresAt: accessTokenExpiresAt,
			scopes: scopes,
		};

		const tokenRepository = c.var.tokenRepository;
		await tokenRepository.put(user.id, 'gmail', newAuthTokenData);

		// Ensure metadata is in Supabase user_email_integrations table
		const db = c.var.db;
		if (!db) {
			console.error('Database not available during OAuth callback for metadata write.');
			return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?error=db_unavailable_metadata`, 302);
		}

		const backendType = c.env.TOKEN_BACKEND || 'supabase';

		if (backendType === 'kv') {
			// When tokens are stored in KV we still want a metadata row, but without the token columns.
			await db`
				INSERT INTO user_email_integrations (user_id, provider, email_address, sync_status, updated_at, created_at)
				VALUES (${user.id}, 'gmail', ${userEmail}, 'active', NOW(), NOW())
				ON CONFLICT (user_id, provider, email_address) DO UPDATE SET
					email_address = EXCLUDED.email_address,
					sync_status = 'active',
					updated_at = NOW();
			`;
		} else {
			// Supabase backend → tokens live in this table too.
			await db`
				INSERT INTO user_email_integrations (
					user_id,
					provider,
					email_address,
					refresh_token_encrypted,
					access_token_encrypted,
					access_token_expires_at,
					scopes,
					sync_status,
					updated_at,
					created_at
				) VALUES (
					${user.id},
					'gmail',
					${userEmail},
					${encryptedRefreshToken},
					${encryptedAccessToken},
					${accessTokenExpiresAt},
					${scopes ? JSON.stringify(scopes) : null},
					'active',
					NOW(),
					NOW()
				)
				ON CONFLICT (user_id, provider, email_address) DO UPDATE SET
					refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
					access_token_encrypted = EXCLUDED.access_token_encrypted,
					access_token_expires_at = EXCLUDED.access_token_expires_at,
					scopes = EXCLUDED.scopes,
					sync_status = 'active',
					updated_at = NOW();
			`;
		}

		console.log(`Gmail OAuth successful for ${userEmail}. Tokens stored via repository, metadata updated in Supabase.`);
		return c.redirect(`${appBaseUrl}/dashboard?gmail_connected=true`, 302);
	} catch (err: any) {
		console.error('Error in Gmail OAuth callback:', err);
		let errorMessage = 'An unexpected error occurred during Gmail connection.';
		if (err instanceof Error) {
			errorMessage = err.message;
		}
		if (err.message && (err.message.includes('database') || err.message.includes('relation') || err.message.includes('constraint'))) {
			errorMessage = `Database operation failed: ${err.message}`;
			return c.redirect(
				`${appBaseUrl}/auth/onboarding/connect-email?error=db_operation_failed&details=${encodeURIComponent(errorMessage)}`,
				302,
			);
		}
		return c.redirect(
			`${appBaseUrl}/auth/onboarding/connect-email?error=callback_exception&details=${encodeURIComponent(errorMessage)}`,
			302,
		);
	}
});

// === Gmail API Interaction Route ===
app.get('/api/gmail/user-info', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		console.error('User not authenticated for /api/gmail/user-info:', userError);
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const tokenEncryptionKeyString = c.env.TOKEN_ENCRYPTION_KEY;
	if (!tokenEncryptionKeyString) {
		console.error('TOKEN_ENCRYPTION_KEY is not set.');
		return c.json({ error: 'Server configuration error: Missing encryption key.' }, 500);
	}

	try {
		const cryptoKey = await getKeyMaterial(tokenEncryptionKeyString);
		const accessToken = await getValidGmailAccessToken(c, user.id, cryptoKey);

		if (!accessToken) {
			if (c.res.status === 404) return c.json({ error: 'Gmail integration not found for this user.' }, 404);
			if (c.res.status === 401) return c.json({ error: 'Access token expired, re-authentication required.' }, 401);
			return c.json({ error: 'Failed to obtain valid Gmail access token.' }, (c.res.status || 500) as any);
		}

		// Use the access token to fetch user info from Google
		const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!userInfoResponse.ok) {
			const parsedJson = (await userInfoResponse.json()) as GoogleUserInfoResponse;
			const errorData = parsedJson.error;
			console.error(`Failed to fetch Google user info for user ${user.id}: `, errorData?.message || userInfoResponse.statusText);
			return c.json(
				{ error: 'Failed to fetch user info from Google.', details: errorData || userInfoResponse.statusText },
				userInfoResponse.status as any,
			);
		}

		const userInfo: GoogleUserInfoResponse = await userInfoResponse.json();

		// Fetch email_address from Supabase metadata table for the response
		const db = c.var.db;
		let integrationEmail = userInfo.email; // Fallback to Google's email
		if (db) {
			const integrationsResult = await db<any[]>`
				SELECT email_address FROM user_email_integrations WHERE user_id = ${user.id} AND provider = 'gmail' LIMIT 1;
			`;
			if (integrationsResult?.[0]?.email_address) {
				integrationEmail = integrationsResult[0].email_address;
			}
		} else {
			console.warn('DB client not available for fetching integration email in /api/gmail/user-info. Using email from Google API.');
		}

		console.log(`Successfully fetched Google user info for user ${user.id}.`);
		return c.json({
			message: 'Successfully fetched user info using Gmail token.',
			data: {
				providerEmail: integrationEmail,
				retrievedEmail: userInfo.email,
				userInfoFromGoogle: userInfo,
			},
		});
	} catch (error: any) {
		console.error('Error in /api/gmail/user-info:', error.message, error.stack);
		return c.json({ error: 'An unexpected error occurred.', details: error.message }, 500);
	}
});

// === Gmail API Interaction Route - Fetch Messages ===
app.get('/api/gmail/messages', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const tokenEncryptionKeyString = c.env.TOKEN_ENCRYPTION_KEY;
	if (!tokenEncryptionKeyString) {
		return c.json({ error: 'Server configuration error: Missing encryption key.' }, 500);
	}

	try {
		const cryptoKey = await getKeyMaterial(tokenEncryptionKeyString);
		const accessToken = await getValidGmailAccessToken(c, user.id, cryptoKey);

		if (!accessToken) {
			if (c.res.status === 404) return c.json({ error: 'Gmail integration not found.' }, 404);
			if (c.res.status === 401) return c.json({ error: 'Re-authentication required for Gmail.' }, 401);
			return c.json({ error: 'Failed to get Gmail access token.' }, (c.res.status || 500) as any);
		}

		// Fetch the integrated Gmail address
		let integratedGmailAddress: string | null = null;
		const db = c.var.db;
		if (db) {
			try {
				const integrationResult = await db<any[]>`
					SELECT email_address FROM user_email_integrations
					WHERE user_id = ${user.id} AND provider = 'gmail' LIMIT 1;
				`;
				if (integrationResult && integrationResult.length > 0 && integrationResult[0].email_address) {
					integratedGmailAddress = integrationResult[0].email_address;
				}
			} catch (dbError: any) {
				console.error(`Error fetching integrated Gmail address for user ${user.id}:`, dbError.message);
				// Do not fail the whole request, just log and proceed without it
			}
		} else {
			console.warn(`Database client not available when fetching integrated Gmail address for user ${user.id}.`);
		}

		// 1. List last 5 messages (excluding social/promotions)
		const listMessagesResponse = await fetch(
			`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=-category:social -category:promotions -category:forums`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);

		if (!listMessagesResponse.ok) {
			const errorData = await listMessagesResponse.json();
			console.error('Gmail API error (list messages):', errorData);
			return c.json({ error: 'Failed to list Gmail messages.', details: errorData }, listMessagesResponse.status as any);
		}

		const listData = (await listMessagesResponse.json()) as {
			messages?: { id: string; threadId: string }[];
			nextPageToken?: string;
			resultSizeEstimate?: number;
		};

		if (!listData.messages || listData.messages.length === 0) {
			return c.json({ messages: [], message: 'No messages found or no new messages matching criteria.' });
		}

		// 2. Fetch details for each message
		// Using Promise.all to fetch details concurrently
		const messageDetailsPromises = listData.messages.map(async (msg) => {
			const detailResponse = await fetch(
				`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
				{ headers: { Authorization: `Bearer ${accessToken}` } },
			);
			if (!detailResponse.ok) {
				console.warn(`Failed to fetch details for message ID ${msg.id}: ${detailResponse.status}`);
				return { id: msg.id, error: `Failed to fetch details (${detailResponse.status})` };
			}
			const detailData = (await detailResponse.json()) as GmailMessageMetadata;

			// Helper to extract header value
			const getHeader = (headers: { name: string; value: string }[], name: string) => headers.find((h) => h.name === name)?.value || '';

			return {
				id: detailData.id,
				threadId: detailData.threadId,
				snippet: detailData.snippet, // Snippet is usually included with metadata format
				subject: getHeader(detailData.payload.headers, 'Subject'),
				from: getHeader(detailData.payload.headers, 'From'),
				date: getHeader(detailData.payload.headers, 'Date'),
			};
		});

		const messages = await Promise.all(messageDetailsPromises);

		return c.json({ messages, integratedGmailAddress });
	} catch (error: any) {
		console.error('Error in /api/gmail/messages:', error.message, error.stack);
		return c.json({ error: 'An unexpected error occurred while fetching emails.', details: error.message }, 500);
	}
});

// === Gmail Manual Sync Route ===
app.post('/api/gmail/sync-now', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		console.error('User not authenticated for /api/gmail/sync-now:', userError);
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const db = c.var.db;
	if (!db) {
		console.error('Database not available for /api/gmail/sync-now');
		return c.json({ error: 'Database not available' }, 500);
	}

	try {
		// Check rate limiting (1 sync per 5 minutes per user)
		const rateLimitKey = `sync-rate:${user.id}`;
		const existingRateLimit = await c.env.EMAIL_SYNC_RATE_KV.get(rateLimitKey);

		if (existingRateLimit) {
			console.log(`Rate limit exceeded for user ${user.id}. Last sync: ${existingRateLimit}`);
			return c.json(
				{
					error: 'Rate limit exceeded',
					message: 'You can only manually sync once every 5 minutes. Please wait before trying again.',
					retryAfter: 300, // 5 minutes in seconds
				},
				429,
			);
		}

		// Check if user has active Gmail integration
		const integrations = await db<any[]>`
			SELECT id, email_address, sync_status 
			FROM user_email_integrations 
			WHERE user_id = ${user.id} AND provider = 'gmail' AND sync_status = 'active'
			LIMIT 1;
		`;

		if (!integrations || integrations.length === 0) {
			console.log(`No active Gmail integration found for user ${user.id}`);
			return c.json(
				{
					error: 'Gmail integration not found',
					message: 'Please connect your Gmail account first.',
				},
				404,
			);
		}

		const integration = integrations[0];
		console.log(`Found active Gmail integration for user ${user.id}: ${integration.email_address}`);

		// Enqueue force sync message
		const forceSyncMessage = {
			type: 'force_sync' as const,
			userId: user.id,
			integrationId: integration.id,
			requestedAt: new Date().toISOString(),
		};

		await c.env.EMAIL_PARSE_QUEUE.send(forceSyncMessage);
		console.log(`Enqueued force sync for user ${user.id}, integration ${integration.id}`);

		// Note: Rate limit will be set after sync completes successfully in queue consumer

		return c.json(
			{
				queued: true,
				message: 'Email sync initiated. Your emails will be processed shortly.',
				integration: {
					email: integration.email_address,
				},
			},
			202,
		);
	} catch (error: any) {
		console.error('Error in /api/gmail/sync-now:', error.message, error.stack);
		return c.json(
			{
				error: 'An unexpected error occurred while initiating sync.',
				details: error.message,
			},
			500,
		);
	}
});

// === Gmail Sync Status Route ===
app.get('/api/gmail/sync-status', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		console.error('User not authenticated for /api/gmail/sync-status:', userError);
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const db = c.var.db;
	if (!db) {
		console.error('Database not available for /api/gmail/sync-status');
		return c.json({ error: 'Database not available' }, 500);
	}

	try {
		// Get Gmail integration with sync status
		const integrations = await db<any[]>`
			SELECT 
				id, email_address, sync_status, sync_in_progress,
				last_sync_started_at, last_sync_completed_at, last_sync_summary,
				last_history_synced_at
			FROM user_email_integrations 
			WHERE user_id = ${user.id} AND provider = 'gmail' AND sync_status = 'active'
			LIMIT 1;
		`;

		if (!integrations || integrations.length === 0) {
			return c.json(
				{
					error: 'Gmail integration not found',
					message: 'No active Gmail integration found.',
				},
				404,
			);
		}

		const integration = integrations[0];

		// Check rate limiting status
		const rateLimitKey = `sync-rate:${user.id}`;
		const existingRateLimit = await c.env.EMAIL_SYNC_RATE_KV.get(rateLimitKey);
		const rateLimitExpiresAt = existingRateLimit ? new Date(existingRateLimit).getTime() + 5 * 60 * 1000 : null;
		const canSyncNow = !existingRateLimit || (rateLimitExpiresAt !== null && Date.now() > rateLimitExpiresAt);

		return c.json({
			integration: {
				id: integration.id,
				email: integration.email_address,
			},
			sync: {
				inProgress: integration.sync_in_progress,
				lastStarted: integration.last_sync_started_at,
				lastCompleted: integration.last_sync_completed_at,
				lastSummary: integration.last_sync_summary,
				lastSuccessfulSync: integration.last_history_synced_at,
			},
			rateLimit: {
				canSyncNow,
				rateLimitedUntil: rateLimitExpiresAt ? new Date(rateLimitExpiresAt).toISOString() : null,
			},
		});
	} catch (error: any) {
		console.error('Error in /api/gmail/sync-status:', error.message, error.stack);
		return c.json(
			{
				error: 'An unexpected error occurred while fetching sync status.',
				details: error.message,
			},
			500,
		);
	}
});

// === Development-only Manual Sync Trigger ===
app.post('/api/dev/trigger-sync', async (c) => {
	// Only allow in development environments
	const isDev = c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1') || c.req.url.includes('.local');
	if (!isDev) {
		return c.json({ error: 'This endpoint is only available in development' }, 403);
	}

	try {
		console.log('[DEV] Manual sync trigger requested via API endpoint');

		// Create a mock ScheduledController
		const mockController = {
			cron: 'manual-trigger',
			scheduledTime: Date.now(),
			noRetry: () => {},
		};

		// Get environment compatible with emailFetcher
		const scheduledEnv = {
			HYPERDRIVE_SUPABASE: c.env.HYPERDRIVE_SUPABASE,
			TOKEN_ENCRYPTION_KEY: c.env.TOKEN_ENCRYPTION_KEY,
			GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
			WORKER_GOOGLE_REDIRECT_URI: c.env.WORKER_GOOGLE_REDIRECT_URI,
			TOKEN_BACKEND: c.env.TOKEN_BACKEND,
			TOKEN_KV: c.env.TOKEN_KV,
			EMAIL_PARSE_QUEUE: c.env.EMAIL_PARSE_QUEUE,
			WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE:
				process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE,
		};

		// Execute the scheduled handler
		await emailFetcher.scheduled(mockController as any, scheduledEnv as any, {} as ExecutionContext);

		return c.json({
			success: true,
			message: 'Manual sync triggered successfully',
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error('[DEV] Error triggering manual sync:', error);
		return c.json(
			{
				error: 'Failed to trigger sync',
				details: error.message,
				timestamp: new Date().toISOString(),
			},
			500,
		);
	}
});

// Example protected route that uses the authenticated user
app.get('/api/me', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		return c.json({ error: 'Not authenticated', details: error?.message }, 401);
	}
	return c.json({ id: user.id, email: user.email, created_at: user.created_at });
});

// Example route using Hyperdrive
app.get('/api/applications', async (c) => {
	console.log(`[WORKER LOG] /api/applications hit at ${new Date().toISOString()}`);
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const applications =
			await db`SELECT id, company_name, role, status, applied_at, order_in_column FROM applications WHERE user_id = ${user.id} ORDER BY order_in_column ASC, applied_at DESC`;
		return c.json({ data: applications });
	} catch (err: any) {
		console.error('Error querying database:', err.message);
		return c.json({ error: 'Failed to fetch applications', details: err.message }, 500);
	}
});

// === AI Suggestions Endpoints ===

// GET /api/suggestions - Fetch AI suggestions for the user
app.get('/api/suggestions', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	const { status: lifecycleStatus } = c.req.query();

	try {
		let query;
		if (lifecycleStatus) {
			query = db`SELECT * FROM public.ai_suggestions WHERE user_id = ${user.id} AND suggestion_lifecycle_status = ${lifecycleStatus} ORDER BY created_at DESC`;
		} else {
			query = db`SELECT * FROM public.ai_suggestions WHERE user_id = ${user.id} ORDER BY created_at DESC`;
		}

		const suggestions = await query;
		return c.json({ data: suggestions });
	} catch (err: any) {
		console.error('Error fetching AI suggestions:', err.message);
		return c.json({ error: 'Failed to fetch AI suggestions', details: err.message }, 500);
	}
});

// PATCH /api/suggestions/:id - Update an AI suggestion (e.g., confirm, reject)
app.patch('/api/suggestions/:id', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const suggestionId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!suggestionId) return c.json({ error: 'Suggestion ID is required' }, 400);

	try {
		const { suggestion_lifecycle_status } = await c.req.json();

		if (!suggestion_lifecycle_status || !['Confirmed', 'Rejected', 'Pending'].includes(suggestion_lifecycle_status)) {
			return c.json({ error: 'Invalid suggestion_lifecycle_status. Must be Confirmed, Rejected, or Pending.' }, 400);
		}

		// If confirming, we need to create the actual application
		if (suggestion_lifecycle_status === 'Confirmed') {
			// Start a transaction to update suggestion and create application
			const result = await db.begin(async (tx) => {
				// First, get the suggestion details
				const suggestion = await tx`
					SELECT * FROM public.ai_suggestions
					WHERE id = ${suggestionId} AND user_id = ${user.id}
					LIMIT 1
				`;

				if (!suggestion || suggestion.length === 0) {
					throw new Error('Suggestion not found or user not authorized');
				}

				const suggestionData = suggestion[0] as any;
				const suggestionDetails = suggestionData.suggestion_details || {};
				const extractedData = suggestionDetails.extracted_data || {};
				const applicationDate = suggestionDetails.application_date || new Date().toISOString().split('T')[0];

				// Create the application
				const applicationResult = await tx`
					INSERT INTO public.applications (
						user_id, company_name, role, status, application_date, applied_at,
						source_email_id, source_thread_id
					)
					VALUES (
						${user.id}, 
						${suggestionData.suggested_company_name}, 
						${suggestionData.suggested_role},
						${suggestionData.suggested_status},
						${applicationDate}::date,
						${applicationDate}::date,
						${suggestionData.raw_email_data?.email_id || null},
						${suggestionData.raw_email_data?.email_thread_id || null}
					)
					ON CONFLICT (user_id, dedupe_key) DO UPDATE
					SET
						role = COALESCE(EXCLUDED.role, public.applications.role),
						status = EXCLUDED.status,
						applied_at = EXCLUDED.applied_at,
						source_email_id = EXCLUDED.source_email_id,
						source_thread_id = EXCLUDED.source_thread_id,
						updated_at = NOW()
					RETURNING *;
				`;

				// Update the suggestion
				const updatedSuggestion = await tx`
					UPDATE public.ai_suggestions
					SET 
						suggestion_lifecycle_status = 'Confirmed',
						is_confirmed = TRUE,
						is_rejected = FALSE,
						processed_at = NOW(),
						updated_at = NOW(),
						related_application_id = ${applicationResult[0].id}
					WHERE id = ${suggestionId} AND user_id = ${user.id}
					RETURNING *;
				`;

				return {
					suggestion: updatedSuggestion[0],
					application: applicationResult[0],
				};
			});

			return c.json({
				data: result.suggestion,
				application: result.application,
				message: 'Suggestion confirmed and application created successfully',
			});
		} else {
			// Just update the suggestion status for reject/pending
			const isConfirmed = suggestion_lifecycle_status === 'Confirmed';
			const isRejected = suggestion_lifecycle_status === 'Rejected';

			const result = await db`
				UPDATE public.ai_suggestions
				SET 
					suggestion_lifecycle_status = ${suggestion_lifecycle_status},
					is_confirmed = ${isConfirmed},
					is_rejected = ${isRejected},
					processed_at = ${isRejected ? 'NOW()' : null},
					updated_at = NOW()
				WHERE id = ${suggestionId} AND user_id = ${user.id}
				RETURNING *;
			`;

			if (result.count === 0) {
				return c.json({ error: 'Suggestion not found or user not authorized to update.' }, 404);
			}

			return c.json({ data: result[0], message: 'Suggestion updated successfully' });
		}
	} catch (err: any) {
		console.error(`Error updating AI suggestion ${suggestionId}:`, err.message);
		// Check for JSON parsing errors specifically
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body.' }, 400);
		}
		return c.json({ error: 'Failed to update AI suggestion', details: err.message }, 500);
	}
});

// POST /api/suggestions/bulk-action - Bulk confirm/reject multiple suggestions
app.post('/api/suggestions/bulk-action', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const { suggestion_ids, action } = await c.req.json();

		if (!suggestion_ids || !Array.isArray(suggestion_ids) || suggestion_ids.length === 0) {
			return c.json({ error: 'suggestion_ids array is required and must not be empty' }, 400);
		}

		if (!action || !['confirm', 'reject'].includes(action)) {
			return c.json({ error: 'action must be either "confirm" or "reject"' }, 400);
		}

		const results = {
			confirmed: [] as any[],
			rejected: [] as any[],
			applications_created: [] as any[],
			errors: [] as any[],
		};

		// Process each suggestion
		for (const suggestionId of suggestion_ids) {
			try {
				if (action === 'confirm') {
					// Confirm and create application
					const result = await db.begin(async (tx) => {
						// Get suggestion details
						const suggestion = await tx`
							SELECT * FROM public.ai_suggestions
							WHERE id = ${suggestionId} AND user_id = ${user.id}
							AND suggestion_lifecycle_status = 'Pending'
							LIMIT 1
						`;

						if (!suggestion || suggestion.length === 0) {
							throw new Error(`Suggestion ${suggestionId} not found or not pending`);
						}

						const suggestionData = suggestion[0] as any;
						const suggestionDetails = suggestionData.suggestion_details || {};
						const applicationDate = suggestionDetails.application_date || new Date().toISOString().split('T')[0];

						// Create application
						const applicationResult = await tx`
							INSERT INTO public.applications (
								user_id, company_name, role, status, application_date, applied_at,
								source_email_id, source_thread_id
							)
							VALUES (
								${user.id}, 
								${suggestionData.suggested_company_name}, 
								${suggestionData.suggested_role},
								${suggestionData.suggested_status},
								${applicationDate}::date,
								${applicationDate}::date,
								${suggestionData.raw_email_data?.email_id || null},
								${suggestionData.raw_email_data?.email_thread_id || null}
							)
							ON CONFLICT (user_id, dedupe_key) DO UPDATE
							SET
								role = COALESCE(EXCLUDED.role, public.applications.role),
								status = EXCLUDED.status,
								updated_at = NOW()
							RETURNING *;
						`;

						// Update suggestion
						const updatedSuggestion = await tx`
							UPDATE public.ai_suggestions
							SET 
								suggestion_lifecycle_status = 'Confirmed',
								is_confirmed = TRUE,
								processed_at = NOW(),
								updated_at = NOW(),
								related_application_id = ${applicationResult[0].id}
							WHERE id = ${suggestionId}
							RETURNING *;
						`;

						return {
							suggestion: updatedSuggestion[0],
							application: applicationResult[0],
						};
					});

					results.confirmed.push(result.suggestion);
					results.applications_created.push(result.application);
				} else {
					// Reject suggestion
					const rejectedSuggestion = await db`
						UPDATE public.ai_suggestions
						SET 
							suggestion_lifecycle_status = 'Rejected',
							is_rejected = TRUE,
							processed_at = NOW(),
							updated_at = NOW()
						WHERE id = ${suggestionId} AND user_id = ${user.id}
						AND suggestion_lifecycle_status = 'Pending'
						RETURNING *;
					`;

					if (rejectedSuggestion && rejectedSuggestion.length > 0) {
						results.rejected.push(rejectedSuggestion[0]);
					} else {
						results.errors.push({ suggestion_id: suggestionId, error: 'Suggestion not found or not pending' });
					}
				}
			} catch (error: any) {
				console.error(`Error processing suggestion ${suggestionId}:`, error.message);
				results.errors.push({ suggestion_id: suggestionId, error: error.message });
			}
		}

		return c.json({
			success: true,
			message: `Bulk ${action} completed`,
			results,
			summary: {
				total_processed: suggestion_ids.length,
				confirmed: results.confirmed.length,
				rejected: results.rejected.length,
				applications_created: results.applications_created.length,
				errors: results.errors.length,
			},
		});
	} catch (err: any) {
		console.error('Error in bulk suggestion action:', err.message);
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to process bulk action', details: err.message }, 500);
	}
});

// New route for the Next.js app to call
app.get('/api/hello', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		return c.json({ error: 'Not authenticated or user data not available', details: error?.message }, 401);
	}
	return c.json({ message: `Hello, ${user.email}! This message is from your Cloudflare Worker.` });
});

// === Temporary Debug Endpoint for Encryption Testing ===
app.get('/api/debug/test-encryption', async (c) => {
	// IMPORTANT: This endpoint is for debugging only. Remove or secure before production.
	if (!c.req.url.includes('localhost') && !c.req.url.includes('127.0.0.1')) {
		return c.json({ error: 'Debug endpoint not available in this environment.' }, 403);
	}

	const tokenEncryptionKeyString = c.env.TOKEN_ENCRYPTION_KEY;
	if (!tokenEncryptionKeyString) {
		console.error('[DEBUG] TOKEN_ENCRYPTION_KEY is not set.');
		return c.json({ error: 'Server configuration error: Missing encryption key.' }, 500);
	}

	try {
		const testToken = 'this-is-a-super-secret-test-token-value-!@#$%';
		const cryptoKey = await getKeyMaterial(tokenEncryptionKeyString);

		const encrypted = await encryptToken(testToken, cryptoKey);
		const decrypted = await decryptToken(encrypted, cryptoKey);

		return c.json({
			original: testToken,
			encrypted_format_iv_ciphertext: encrypted,
			decrypted: decrypted,
			matches: testToken === decrypted,
			key_present: !!tokenEncryptionKeyString,
		});
	} catch (error: any) {
		console.error('[DEBUG] Error in test-encryption:', error.message, error.stack);
		return c.json({ error: 'Encryption/decryption test failed.', details: error.message }, 500);
	}
});

// PATCH /api/applications/:id - Update an application's status
app.patch('/api/applications/:id', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const applicationId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!applicationId) return c.json({ error: 'Application ID is required' }, 400);

	try {
		const { status, notes } = await c.req.json();

		// Validate status is one of the enum values
		const validStatuses = ['Wishlist', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'];
		if (status && !validStatuses.includes(status)) {
			return c.json({ error: 'Invalid status value' }, 400);
		}

		// Create update object with only provided fields
		const updateData: Record<string, any> = {};
		if (status) updateData.status = status;
		if (notes !== undefined) updateData.notes = notes;

		// Only update if there's something to update
		if (Object.keys(updateData).length === 0) {
			return c.json({ error: 'No update data provided' }, 400);
		}

		// Update the application
		const result = await db`
			UPDATE applications
			SET ${db(updateData)}
			WHERE id = ${applicationId} AND user_id = ${user.id}
			RETURNING id, company_name, role, status, applied_at, notes, job_url
		`;

		if (result.count === 0) {
			return c.json({ error: 'Application not found or not authorized to update' }, 404);
		}

		return c.json({ data: result[0], message: 'Application updated successfully' });
	} catch (err: any) {
		console.error(`Error updating application ${applicationId}:`, err.message);
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to update application', details: err.message }, 500);
	}
});

// POST /api/applications - Create a new application manually
app.post('/api/applications', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const requestData = await c.req.json();
		const { companyName, jobTitle, status = 'Applied', applicationDate, jobUrl, location, salary, notes } = requestData;

		// Validate required fields
		if (!companyName || !jobTitle) {
			return c.json({ error: 'Company name and job title are required' }, 400);
		}

		// Validate status
		const validStatuses = ['Wishlist', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'];
		if (!validStatuses.includes(status)) {
			return c.json({ error: 'Invalid status value' }, 400);
		}

		// Parse and validate application date
		const appDate = applicationDate ? new Date(applicationDate) : new Date();
		if (isNaN(appDate.getTime())) {
			return c.json({ error: 'Invalid application date' }, 400);
		}

		// Prepare application data
		const applicationData = {
			user_id: user.id,
			company_name: companyName.trim(),
			role: jobTitle.trim(),
			status: status,
			application_date: appDate.toISOString().split('T')[0],
			applied_at: appDate.toISOString(),
			job_url: jobUrl?.trim() || null,
			location: location?.trim() || null,
			salary_range: salary?.trim() || null,
			notes: notes?.trim() || null,
			manual_entry: true,
		};

		// Insert the application
		const result = await db`
			INSERT INTO public.applications (
				user_id, company_name, role, status, application_date, applied_at,
				job_url, location, salary_range, notes, manual_entry
			)
			VALUES (
				${applicationData.user_id},
				${applicationData.company_name},
				${applicationData.role},
				${applicationData.status},
				${applicationData.application_date}::date,
				${applicationData.applied_at}::timestamptz,
				${applicationData.job_url},
				${applicationData.location},
				${applicationData.salary_range},
				${applicationData.notes},
				${applicationData.manual_entry}
			)
			ON CONFLICT (user_id, dedupe_key) DO UPDATE
			SET
				role = EXCLUDED.role,
				status = EXCLUDED.status,
				job_url = EXCLUDED.job_url,
				location = EXCLUDED.location,
				salary_range = EXCLUDED.salary_range,
				notes = EXCLUDED.notes,
				updated_at = NOW()
			RETURNING id, company_name, role, status, application_date, applied_at, job_url, location, salary_range, notes;
		`;

		if (result && result.count > 0) {
			console.log(`[worker] Manual application created for user ${user.id}: ${companyName} - ${jobTitle}`);
			return c.json({
				success: true,
				data: result[0],
				message: 'Application created successfully',
			});
		} else {
			return c.json({ error: 'Failed to create application' }, 500);
		}
	} catch (err: any) {
		console.error('Error creating manual application:', err.message);
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to create application', details: err.message }, 500);
	}
});

// === DLQ Review Endpoint ===
app.get('/api/gmail/failed-emails', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'Not authenticated' }, 401);
	}

	// Note: This is a placeholder for DLQ access
	// In a real implementation, you'd need to:
	// 1. Set up a DLQ consumer worker to store failed messages in a database
	// 2. Query that database here filtered by user_id
	// 3. Return the failed email data with error reasons

	try {
		const db = c.var.db;
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		// Fetch failed emails for the current user
		const failedEmails = await db`
			SELECT 
				id, email_id, email_thread_id, email_subject, email_from, 
				email_date, email_snippet, email_body, failure_reason,
				failure_count, failed_at, needs_review, reviewed_at
			FROM public.failed_email_reviews 
			WHERE user_id = ${user.id} AND needs_review = TRUE
			ORDER BY failed_at DESC
			LIMIT 50
		`;

		return c.json({
			failedEmails: failedEmails || [],
			message:
				failedEmails?.length > 0
					? `Found ${failedEmails.length} failed emails that need review`
					: 'No failed emails found - all your emails were processed successfully!',
		});
	} catch (error: any) {
		console.error('Error fetching failed emails:', error);
		return c.json({ error: 'Failed to fetch failed emails', details: error.message }, 500);
	}
});

// === Manual Email Processing Endpoint ===
app.post('/api/gmail/process-failed-email', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'Not authenticated' }, 401);
	}

	try {
		const { emailId, companyName, jobTitle, status, notes } = await c.req.json();

		if (!emailId || !companyName) {
			return c.json({ error: 'Email ID and company name are required' }, 400);
		}

		const db = c.var.db;
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		// Create application from manually provided data
		const applicationDate = new Date().toISOString().split('T')[0];

		const result = await db`
			INSERT INTO public.applications (
				user_id, company_name, role, status, application_date, notes,
				source_email_id, manual_entry
			)
			VALUES (
				${user.id}, 
				${companyName}, 
				${jobTitle || 'Unknown Role'},
				${status || 'Applied'},
				${applicationDate}::date,
				${notes || 'Manually entered from failed email parsing'},
				${emailId},
				TRUE
			)
			ON CONFLICT (user_id, dedupe_key) DO UPDATE
			SET
				role = EXCLUDED.role,
				status = EXCLUDED.status,
				notes = EXCLUDED.notes,
				updated_at = NOW()
			RETURNING *;
		`;

		if (result && result.count > 0) {
			return c.json({
				success: true,
				message: 'Application created from failed email',
				application: result[0],
			});
		} else {
			return c.json({ error: 'Failed to create application' }, 500);
		}
	} catch (error: any) {
		console.error('Error processing failed email manually:', error);
		return c.json({ error: 'Failed to process email', details: error.message }, 500);
	}
});

// === Smart URL Scraping Endpoint ===
app.get('/api/job-boards/scrape', async (c) => {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		console.error('User not authenticated for /api/job-boards/scrape:', userError);
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const url = c.req.query('url');
	if (!url) {
		return c.json({ error: 'URL parameter is required' }, 400);
	}

	try {
		// Validate URL format
		new URL(url);
	} catch {
		return c.json({ error: 'Invalid URL format' }, 400);
	}

	console.log(`[worker] Smart URL scraping requested for: ${url} by user ${user.id}`);

	let browser: any = null;

	try {
		// Launch browser using Browser Rendering API
		browser = await puppeteer.launch(c.env.BROWSER);
		console.log(`[worker] Browser launched for scraping: ${url}`);

		// Use the job board scraper
		const scrapingResult = await scrapeJobUrl(browser, url, c.env.SCRAPING_CACHE_KV);

		if (!scrapingResult.success) {
			console.error(`[worker] Scraping failed for ${url}:`, scrapingResult.error);
			return c.json(
				{
					success: false,
					error: scrapingResult.error || 'Failed to scrape job URL',
					source: scrapingResult.source,
					message: 'Unable to extract job details. Please enter them manually.',
				},
				400,
			);
		}

		console.log(`[worker] Smart URL scraping completed for: ${url}`, scrapingResult.data);

		return c.json({
			success: true,
			data: {
				companyName: scrapingResult.data?.companyName,
				jobTitle: scrapingResult.data?.jobTitle,
				location: scrapingResult.data?.location,
				salary: scrapingResult.data?.salary,
			},
			message: scrapingResult.cached ? 'Job details extracted successfully (cached)' : 'Job details extracted successfully',
			source: scrapingResult.source,
			cached: scrapingResult.cached,
		});
	} catch (error: any) {
		console.error(`[worker] Error during smart URL scraping for ${url}:`, error.message);
		return c.json(
			{
				success: false,
				error: 'Failed to scrape job URL',
				details: error.message,
				message: 'Unable to extract job details. Please enter them manually.',
			},
			500,
		);
	} finally {
		// Always close browser to free resources
		if (browser) {
			try {
				await browser.close();
				console.log(`[worker] Browser closed after scraping: ${url}`);
			} catch (closeError: any) {
				console.error(`[worker] Error closing browser:`, closeError.message);
			}
		}
	}
});

// === Error Handling ===
app.onError((err, c) => {
	console.error(`Hono Error: ${err}`);
	return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

app.notFound((c) => {
	return c.json({ error: 'Not Found', message: `The path ${c.req.url} was not found.` }, 404);
});

export default {
	fetch: app.fetch,

	async queue(
		batch: MessageBatch<QueueMessage>,
		// The env passed to the queue handler will be the main Env for this worker service.
		// We cast it or ensure it's compatible with what handleEmailParseQueueBatch expects.
		env: Env['Bindings'], // Pass the Bindings part of Env, aligning with QueueConsumerEnv needs
		ctx: ExecutionContext,
	): Promise<void> {
		console.log(`Main queue handler in index.ts invoked for queue: ${batch.queue}`);

		// Route to appropriate queue handler based on queue name
		if (batch.queue === 'email-parse-dlq') {
			console.log('Routing to DLQ consumer');
			await handleDLQBatch(batch, env as any, ctx);
		} else {
			console.log('Routing to main email parse queue consumer');
			// Ensure that the env passed to the specific handler matches its expectations.
			// Here, QueueConsumerEnv is a subset of or compatible with Env["Bindings"]
			await handleEmailParseQueueBatch(batch, env as QueueConsumerEnv, ctx);
		}
	},

	async scheduled(
		controller: ScheduledController,
		// The env passed to the scheduled handler will be the main Env for this worker service.
		// We cast it or ensure it's compatible with what emailFetcher.scheduled expects.
		env: Env['Bindings'], // Pass the Bindings part of Env
		ctx: ExecutionContext,
	): Promise<void> {
		console.log('Main scheduled handler in index.ts invoked by cron trigger.');
		// Delegate to the emailFetcher's scheduled function
		// Ensure the env type is compatible. ScheduledWorkerEnv is a subset of Env['Bindings']
		// or can derive its needs (like db client, token repo) internally as designed in email-fetcher.ts
		await emailFetcher.scheduled(controller, env as any, ctx);
	},
};
