import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import { getKeyMaterial } from '../../crypto';
import {
	getValidGmailAccessToken,
	generateOAuthState,
	setOAuthStateCookie,
	validateOAuthState,
	createAuthorizationUrl,
	exchangeOAuthCode,
	fetchGoogleUserInfo,
} from '../auth/utils';
import type { Env, GoogleTokenResponse, GoogleUserInfoResponse, GmailMessageMetadata } from '../types';
import type { TokenData } from '../../token-repository';

/**
 * Initiate Gmail OAuth flow
 */
export async function initiateGmailOAuth(c: Context<Env>) {
	const clientId = c.env.GOOGLE_CLIENT_ID;
	const redirectUri = c.env.WORKER_GOOGLE_REDIRECT_URI;

	console.log(`[OAuth Init] Starting OAuth initiation`);
	console.log(`[OAuth Init] Client ID: ${clientId ? 'present' : 'missing'}`);
	console.log(`[OAuth Init] Redirect URI: ${redirectUri}`);

	if (!clientId || !redirectUri) {
		console.error('Google OAuth environment variables for worker are not set.');
		return c.json({ message: 'OAuth configuration error on server.' }, 500);
	}

	const state = generateOAuthState();
	console.log(`[OAuth Init] Generated state: ${state}`);

	setOAuthStateCookie(c, state);
	console.log(`[OAuth Init] Cookie set, response headers:`, Object.fromEntries(c.res.headers.entries()));

	const authUrl = createAuthorizationUrl(clientId, redirectUri, state);
	console.log(`[OAuth Init] Authorization URL: ${authUrl}`);

	return c.json({ authorizeUrl: authUrl });
}

/**
 * Handle Gmail OAuth callback
 */
export async function handleGmailOAuthCallback(c: Context<Env>) {
	const code = c.req.query('code');
	const receivedState = c.req.query('state');
	const appBaseUrl = c.env.APP_BASE_URL || 'http://localhost:3000';

	// Debug logging for OAuth callback
	console.log(`[OAuth Callback] Starting OAuth callback process`);
	console.log(`[OAuth Callback] Request URL: ${c.req.url}`);
	console.log(`[OAuth Callback] Headers:`, Object.fromEntries(c.req.raw.headers.entries()));
	console.log(`[OAuth Callback] All cookies:`, c.req.raw.headers.get('cookie') || 'No cookies found');

	if (!code) {
		console.error('[OAuth Callback] Missing authorization code');
		return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?error=missing_code`, 302);
	}

	if (!validateOAuthState(c, receivedState || '')) {
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
		const tokenDataFromGoogle = await exchangeOAuthCode(
			code,
			c.env.GOOGLE_CLIENT_ID,
			c.env.GOOGLE_CLIENT_SECRET,
			c.env.WORKER_GOOGLE_REDIRECT_URI,
		);

		if (tokenDataFromGoogle.error) {
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

		const userInfo = await fetchGoogleUserInfo(accessToken);

		if (userInfo.error || !userInfo.email) {
			console.error('Could not fetch user email from Google:', userInfo.error?.message);
			return c.redirect(
				`${appBaseUrl}/auth/onboarding/connect-email?error=email_fetch_failed&details=${encodeURIComponent(userInfo.error?.message || 'Unknown error')}`,
				302,
			);
		}

		const userEmail = userInfo.email;
		const encryptionKey = await getKeyMaterial(c.env.TOKEN_ENCRYPTION_KEY);
		const { encryptToken } = await import('../../crypto');

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

		// Store metadata in Supabase
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
				) ON CONFLICT (user_id, provider, email_address) DO UPDATE SET
					refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
					access_token_encrypted = EXCLUDED.access_token_encrypted,
					access_token_expires_at = EXCLUDED.access_token_expires_at,
					scopes = EXCLUDED.scopes,
					sync_status = 'active',
					updated_at = NOW();
			`;
		}

		console.log(`Gmail OAuth integration completed successfully for user ${user.id} (${userEmail})`);
		return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?success=true`, 302);
	} catch (error: any) {
		console.error('Error in Gmail OAuth callback:', error.message, error.stack);
		return c.redirect(`${appBaseUrl}/auth/onboarding/connect-email?error=server_error`, 302);
	}
}

/**
 * Get Gmail user info
 */
export async function getGmailUserInfo(c: Context<Env>) {
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
}

/**
 * Fetch Gmail messages
 */
export async function getGmailMessages(c: Context<Env>) {
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
			}
		} else {
			console.warn(`Database client not available when fetching integrated Gmail address for user ${user.id}.`);
		}

		// List last 10 messages (excluding social/promotions)
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

		// Helper to extract header value
		const getHeader = (headers: { name: string; value: string }[], name: string) => headers.find((h) => h.name === name)?.value || '';

		// Fetch details for each message
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

			return {
				id: detailData.id,
				threadId: detailData.threadId,
				snippet: detailData.snippet,
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
}

/**
 * Initiate manual Gmail sync
 */
export async function initiateGmailSync(c: Context<Env>) {
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
			SELECT id, email_address, sync_status, sync_in_progress,
				last_sync_started_at, last_sync_completed_at, last_sync_summary,
				last_history_synced_at, first_sync_completed
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

		// Immediately update status to "preparing" for refresh state persistence
		const preparingSummary = {
			emails_processed: 0,
			emails_sent_to_queue: 0,
			emails_analyzed: 0,
			applications_found: 0,
			error: null,
			sync_type: 'manual',
			status: 'preparing',
			sync_requested_at: new Date().toISOString(),
		};

		await db`
			UPDATE public.user_email_integrations
			SET 
				sync_in_progress = TRUE,
				last_sync_started_at = NOW(),
				last_sync_summary = ${db.json(preparingSummary)}
			WHERE id = ${integration.id}
		`;

		// Enqueue force sync message
		const forceSyncMessage = {
			type: 'force_sync' as const,
			userId: user.id,
			integrationId: integration.id,
			requestedAt: new Date().toISOString(),
		};

		await c.env.EMAIL_PARSE_QUEUE.send(forceSyncMessage);
		console.log(`Enqueued force sync for user ${user.id}, integration ${integration.id}`);

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
}

/**
 * Get Gmail sync status
 */
export async function getGmailSyncStatus(c: Context<Env>) {
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
				last_history_synced_at, first_sync_completed
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
				firstSyncCompleted: integration.first_sync_completed,
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
}

/**
 * Get failed emails for review
 */
export async function getFailedEmails(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'Not authenticated' }, 401);
	}

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
}

/**
 * Process failed email manually
 */
export async function processFailedEmail(c: Context<Env>) {
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
}
