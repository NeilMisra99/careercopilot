import postgres from 'postgres';
import { SupabaseClient } from '@supabase/supabase-js'; // Assuming this type is available or we define a relevant subset
import { getKeyMaterial, encryptToken, decryptToken } from './lib/crypto'; // Assuming crypto functions are moved here
import { getSupabaseClient, getHyperdriveNonPooled } from './lib/supabase'; // Assuming supabase client helper
import { TokenRepository, type TokenData } from './lib/token-repository'; // SupabaseTokenRepository and KvTokenRepository are not directly used here, rather instantiated in index.ts or similar main entry
import { SupabaseTokenRepository } from './lib/supabase-token-repository'; // ADDED
import { KvTokenRepository } from './lib/kv-token-repository'; // ADDED

// Import shared types from the new location
import type { GmailMessageData, EmailToParse, QueueMessage } from './lib/types';

// === Helper: Decode base64url string ===
function base64UrlDecode(input: string): string {
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	// Pad with '=' characters if necessary
	while (base64.length % 4) {
		base64 += '=';
	}
	try {
		return atob(base64);
	} catch (e: any) {
		console.error(
			'[email-fetcher] base64UrlDecode: Failed to decode base64url string (atob failed):',
			e.message,
			'Input was:',
			input.substring(0, 100),
		);
		try {
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch (e2: any) {
			console.error('[email-fetcher] base64UrlDecode: UTF-8 decoding fallback also failed:', e2.message);
			return '';
		}
	}
}

// === Helper: Extract Email Body Parts ===
// Simplified extractor focusing on text/plain and text/html.
// A more robust version would recursively search through nested parts.
function extractBodyParts(payload: any): { text: string | null; html: string | null } {
	let textBody: string | null = null;
	let htmlBody: string | null = null;
	// console.log('[email-fetcher] extractBodyParts: Starting extraction for payload:', JSON.stringify(payload, null, 2).substring(0, 500)); // Can be very verbose

	const parts = payload.parts;
	if (parts) {
		// console.log(`[email-fetcher] extractBodyParts: Payload has ${parts.length} parts.`);
		for (const part of parts) {
			// console.log(`[email-fetcher] extractBodyParts: Processing part with mimeType: ${part.mimeType}`);
			if (part.mimeType === 'text/plain' && part.body?.data) {
				// console.log('[email-fetcher] extractBodyParts: Found text/plain part.');
				textBody = base64UrlDecode(part.body.data);
			} else if (part.mimeType === 'text/html' && part.body?.data) {
				// console.log('[email-fetcher] extractBodyParts: Found text/html part.');
				htmlBody = base64UrlDecode(part.body.data);
			} else if (part.mimeType.startsWith('multipart/') && part.parts) {
				// console.log('[email-fetcher] extractBodyParts: Found multipart, recursing.');
				const nestedParts = extractBodyParts(part);
				if (nestedParts.text && !textBody) textBody = nestedParts.text;
				if (nestedParts.html && !htmlBody) htmlBody = nestedParts.html;
			}
		}
	} else if (payload.body?.data) {
		// console.log(`[email-fetcher] extractBodyParts: Payload has no 'parts', checking direct body with mimeType: ${payload.mimeType}`);
		if (payload.mimeType === 'text/plain') {
			textBody = base64UrlDecode(payload.body.data);
		} else if (payload.mimeType === 'text/html') {
			htmlBody = base64UrlDecode(payload.body.data);
		}
	}
	// console.log(`[email-fetcher] extractBodyParts: Finished. Text found: ${!!textBody}, HTML found: ${!!htmlBody}`);
	return { text: textBody, html: htmlBody };
}

// Define a more specific Env for this scheduled worker
// This will be a subset of the main Env in index.ts, plus the EMAIL_PARSE_QUEUE

// Interface for Gmail API Message resource (format=full)
// See: https://developers.google.com/gmail/api/reference/rest/v1/users.messages#Message
interface GmailApiMessagePayloadPart {
	partId: string;
	mimeType: string;
	filename: string;
	headers: { name: string; value: string }[];
	body: {
		// MessagePartBody
		attachmentId?: string;
		size: number;
		data?: string; // base64url encoded
	};
	parts?: GmailApiMessagePayloadPart[];
}

interface GmailApiMessage {
	id: string;
	threadId: string;
	labelIds?: string[];
	snippet?: string;
	historyId: string;
	internalDate?: string; // Unix epoch ms, stringified
	payload?: GmailApiMessagePayloadPart;
	raw?: string; // base64url encoded, if format=RAW
	sizeEstimate?: number;
}

interface ScheduledWorkerEnv {
	HYPERDRIVE_SUPABASE: Hyperdrive;
	TOKEN_ENCRYPTION_KEY: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	// WORKER_GOOGLE_REDIRECT_URI might not be directly needed by the fetcher, but for consistency
	WORKER_GOOGLE_REDIRECT_URI: string;
	TOKEN_BACKEND?: 'supabase' | 'kv';
	TOKEN_KV?: KVNamespace; // Required if TOKEN_BACKEND is 'kv'
	EMAIL_PARSE_QUEUE: Queue<QueueMessage>;

	// Variables that might be set by middleware or context, if we adapt the main app structure
	// For a standalone cron worker, these might be initialized directly if no complex middleware chain is used.
	// supabase?: SupabaseClient; // Admin client for Supabase operations NOT using user's session
	db?: postgres.Sql;
	tokenRepository?: TokenRepository;

	// For testing/dev
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE?: string;
}

interface UserEmailIntegrationForFetcher {
	id: string;
	user_id: string;
	email_address: string;
	provider: string; // e.g., 'gmail'
	access_token_encrypted: string | null;
	refresh_token_encrypted: string | null;
	access_token_expires_at: string | null; // ISO string
	scopes: string[] | null;
	sync_status: 'active' | 'error' | 'disabled' | 'paused';
	last_history_id: string | null; // Gmail history ID is a string representing a large number
	last_history_synced_at: string | null; // ISO string
}

const GMAIL_API_BASE_URL = 'https://www.googleapis.com/gmail/v1/users';
const MAX_RESULTS_PER_PAGE = 100; // Gmail API messages.list maxResults
const INITIAL_FETCH_MAX_MESSAGES = 500; // Increased from 150 to 500 for better first-time experience
const INITIAL_FETCH_MAX_DAYS = 30;
const SYNC_INTERVAL_MINUTES = 4; // Fetch for users not synced in the last 4 minutes

interface FetchErrorData {
	error?: { message?: string } | string;
	message?: string;
	// Add other potential error fields if known, e.g., error_description from OAuth
	error_description?: string;
}

async function getValidGmailAccessToken(
	env: ScheduledWorkerEnv,
	integration: UserEmailIntegrationForFetcher,
	cryptoKey: CryptoKey,
	db: postgres.Sql,
	tokenRepository: TokenRepository, // ADDED
): Promise<string | null> {
	console.log(
		`[email-fetcher] getValidGmailAccessToken called for user ${integration.user_id}, email: ${integration.email_address} using TokenRepository`,
	);

	const tokenData = await tokenRepository.get(integration.user_id, 'gmail');

	if (!tokenData || !tokenData.refreshTokenEncrypted) {
		console.error(
			`[email-fetcher] User ${integration.user_id} (${integration.email_address}) missing token data or refresh token via TokenRepository. Marking as error.`,
		);
		await db`UPDATE public.user_email_integrations SET sync_status = 'error', sync_error_message = 'Missing refresh token via repository' WHERE id = ${integration.id}`;
		return null;
	}

	let accessToken: string | null = null;
	const now = new Date();
	const expiresAt = tokenData.accessTokenExpiresAt ? new Date(tokenData.accessTokenExpiresAt) : null;

	if (tokenData.accessTokenEncrypted && expiresAt && expiresAt > now) {
		console.log(`[email-fetcher] Access token for user ${integration.user_id} (from repo) appears current. Attempting decryption.`);
		try {
			accessToken = await decryptToken(tokenData.accessTokenEncrypted, cryptoKey);
			console.log(`[email-fetcher] Successfully decrypted existing access token for user ${integration.user_id} (from repo).`);
		} catch (decryptionError: any) {
			console.error(`[email-fetcher] Failed to decrypt access token (from repo) for user ${integration.user_id}:`, decryptionError.message);
			await db`UPDATE public.user_email_integrations SET sync_status = 'error', sync_error_message = ${`Failed to decrypt access token from repo: ${decryptionError.message}`.substring(0, 255)} WHERE id = ${integration.id}`;
			accessToken = null; // Force refresh
		}
	}

	if (!accessToken) {
		console.log(`[email-fetcher] Access token needs refresh for user ${integration.user_id} (from repo). Decrypting refresh token.`);
		const refreshToken = await decryptToken(tokenData.refreshTokenEncrypted, cryptoKey);
		console.log(
			`[email-fetcher] Refresh token decrypted for user ${integration.user_id} (from repo). Requesting new access token from Google.`,
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
				console.error(`[email-fetcher] Failed to parse JSON from error response during token refresh for ${integration.user_id}:`, e);
			}
			const errorData: FetchErrorData =
				typeof caughtError === 'object' && caughtError !== null ? caughtError : { error: 'Unknown error refreshing token' };
			console.error(
				`[email-fetcher] Error refreshing token for ${integration.user_id} (${integration.email_address}): ${tokenResponse.status}`,
				errorData,
			);
			if (tokenResponse.status === 400 || tokenResponse.status === 401) {
				// e.g. invalid_grant - This often means the refresh token is no longer valid.
				// We should clear the tokens from the repository and mark the integration as error, requiring re-authentication.
				console.warn(
					`[email-fetcher] Token refresh failed with ${tokenResponse.status} (likely invalid_grant) for ${integration.user_id}. Clearing tokens from repository. User needs to re-authenticate.`,
				);
				try {
					await tokenRepository.delete(integration.user_id, 'gmail');
				} catch (repoDeleteError: any) {
					console.error(
						`[email-fetcher] Failed to delete tokens from repository for user ${integration.user_id} after invalid_grant:`,
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

		const newTokensFromGoogle: { access_token: string; expires_in: number; scope: string; id_token?: string; refresh_token?: string } =
			await tokenResponse.json();
		accessToken = newTokensFromGoogle.access_token;
		console.log(`[email-fetcher] Successfully refreshed access token for user ${integration.user_id} (from repo).`);
		const newExpiresAt = new Date(now.getTime() + newTokensFromGoogle.expires_in * 1000);

		const newEncryptedAccessToken = await encryptToken(newTokensFromGoogle.access_token, cryptoKey);
		let finalEncryptedRefreshToken = tokenData.refreshTokenEncrypted!;

		if (newTokensFromGoogle.refresh_token && newTokensFromGoogle.refresh_token !== refreshToken) {
			console.log(`[email-fetcher] Received new refresh token for user ${integration.user_id} (from repo). Updating.`);
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
		console.log(`[email-fetcher] Updated token data via repo and DB metadata for user ${integration.user_id}.`);
	}
	return accessToken;
}

// === Helper: Sync Gmail Integration ===
// Extracted core logic for syncing a single Gmail integration
// Can be called from both cron job and force sync
export async function syncGmailIntegration(
	integration: UserEmailIntegrationForFetcher,
	env: ScheduledWorkerEnv,
	db: postgres.Sql,
	cryptoKey: CryptoKey,
	tokenRepository: TokenRepository,
	forceSync = false,
): Promise<void> {
	console.log(
		`[email-fetcher] === PROCESSING INTEGRATION START: User ID ${integration.user_id}, Email: ${integration.email_address}, Integration ID: ${integration.id} ${forceSync ? '(FORCE SYNC)' : ''} ===`,
	);

	// Mark sync as in progress IMMEDIATELY when we start
	await db`
		UPDATE public.user_email_integrations
		SET sync_in_progress = TRUE, last_sync_started_at = NOW()
		WHERE id = ${integration.id}
	`;
	console.log(`[email-fetcher] Marked integration ${integration.id} as sync in progress`);

	let syncSummary = {
		emails_processed: 0,
		emails_sent_to_queue: 0,
		emails_analyzed: 0,
		applications_found: 0,
		error: null as string | null,
		sync_type: forceSync ? 'manual' : 'scheduled',
		status: 'email_fetching' as string,
	};

	// Update status to show we're starting email fetch
	await db`
		UPDATE public.user_email_integrations
		SET last_sync_summary = ${db.json(syncSummary)}
		WHERE id = ${integration.id}
	`;

	try {
		const accessToken = await getValidGmailAccessToken(env, integration, cryptoKey, db, tokenRepository);

		if (!accessToken) {
			console.warn(
				`[email-fetcher] Skipping user ${integration.user_id} (Integration ID: ${integration.id}) due to missing or invalid access token.`,
			);
			syncSummary.error = 'Failed to obtain valid access token';
			return;
		}
		console.log(`[email-fetcher] Successfully obtained valid Gmail access token for integration ID ${integration.id}.`);

		let newMessagesToQueue: QueueMessage[] = [];
		let latestHistoryIdProcessed = integration.last_history_id;
		let messagesFetchedCount = 0; // Declare at function level
		let syncType: string;

		if (!integration.last_history_id) {
			// Only do initial sync if no history exists (true first-time sync)
			syncType = forceSync ? 'FORCE SYNC (INITIAL - NO HISTORY)' : 'INITIAL SYNC';
			console.log(`[email-fetcher] Starting ${syncType} for integration ID ${integration.id} (Email: ${integration.email_address})`);
		} else if (forceSync) {
			// Force sync with existing history - use incremental approach but log it clearly
			syncType = 'FORCE SYNC (INCREMENTAL)';
			console.log(
				`[email-fetcher] Starting ${syncType} for integration ID ${integration.id} (Email: ${integration.email_address}) from historyId: ${integration.last_history_id}`,
			);
		} else {
			// Regular incremental sync
			syncType = 'INCREMENTAL SYNC';
		}

		if (!integration.last_history_id) {
			// Initial Sync: Fetch recent messages
			console.log(`${syncType} for ${integration.email_address}`);
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - INITIAL_FETCH_MAX_DAYS);
			const queryDate = Math.floor(thirtyDaysAgo.getTime() / 1000);

			let nextPageToken: string | undefined = undefined;
			let fetchedMessageIds = new Set<string>();
			let prevPageToken: string | undefined;

			pageLoop: while (messagesFetchedCount < INITIAL_FETCH_MAX_MESSAGES) {
				const prevFetchedCount = messagesFetchedCount;
				const listUrl = new URL(`${GMAIL_API_BASE_URL}/me/messages`);
				listUrl.searchParams.append(
					'maxResults',
					String(Math.min(MAX_RESULTS_PER_PAGE, INITIAL_FETCH_MAX_MESSAGES - messagesFetchedCount)),
				);
				listUrl.searchParams.append('q', `after:${queryDate} -category:social -category:promotions -category:forums`); // Exclude common non-job related emails
				listUrl.searchParams.append('labelIds', 'INBOX'); // Only INBOX for now
				if (nextPageToken) listUrl.searchParams.append('pageToken', nextPageToken);

				console.log(`[email-fetcher] ${syncType}: Fetching message list. URL: ${listUrl.toString()}`);
				const listResponse = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
				console.log(
					`[email-fetcher] ${syncType}: Message list response status: ${listResponse.status} for integration ID ${integration.id}`,
				);

				if (!listResponse.ok) {
					let caughtError: any = {};
					try {
						caughtError = await listResponse.json();
					} catch {}
					const errorData: FetchErrorData = typeof caughtError === 'object' && caughtError !== null ? caughtError : {};
					console.error(
						`[email-fetcher] ${syncType}: Gmail API error (messages.list) for ${integration.email_address} (ID: ${integration.id}): ${listResponse.status}`,
						errorData,
					);
					const errorMessage =
						typeof errorData.error === 'string'
							? errorData.error
							: (typeof errorData.error === 'object' && errorData.error?.message) || errorData.message || listResponse.statusText;
					await db`UPDATE public.user_email_integrations SET sync_error_message = ${`Gmail API error (messages.list): ${errorMessage}`.substring(0, 255)}, sync_status = 'error' WHERE id = ${integration.id}`;
					break pageLoop;
				}
				const listResult: { messages?: { id: string; threadId: string }[]; nextPageToken?: string; resultSizeEstimate?: number } =
					await listResponse.json();
				console.log(
					`[email-fetcher] ${syncType}: List result for integration ID ${integration.id}: ${listResult.messages?.length || 0} messages, nextPageToken: ${!!listResult.nextPageToken}`,
				);

				if (listResult.messages && listResult.messages.length > 0) {
					console.log(
						`[email-fetcher] ${syncType}: Processing ${listResult.messages.length} messages for integration ID ${integration.id}.`,
					);
					for (const msgMeta of listResult.messages) {
						if (fetchedMessageIds.has(msgMeta.id)) continue; // Should not happen with page tokens but for safety

						// Fetch full message details including body
						const messageDetailUrl = `${GMAIL_API_BASE_URL}/me/messages/${msgMeta.id}?format=full`;
						console.log(
							`[email-fetcher] ${syncType}: Fetching full message details. URL: ${messageDetailUrl} for integration ID ${integration.id}`,
						);
						const messageDetailResponse = await fetch(messageDetailUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
						console.log(
							`[email-fetcher] ${syncType}: Message detail response status: ${messageDetailResponse.status} for message ID ${msgMeta.id}, integration ID ${integration.id}`,
						);

						if (!messageDetailResponse.ok) {
							let errorData: FetchErrorData = { error: 'Unknown error fetching message details' };
							try {
								errorData = await messageDetailResponse.json();
							} catch {}
							console.warn(
								`[email-fetcher] ${syncType}: Failed to fetch details for message ID ${msgMeta.id} for ${integration.email_address}. Status: ${messageDetailResponse.status}`,
								errorData,
							);
							continue; // Skip this message on error
						}

						const fullMsg: GmailApiMessage = await messageDetailResponse.json(); // CASTED
						console.log(
							`[email-fetcher] ${syncType}: Received full message for ID ${fullMsg.id}, historyId ${fullMsg.historyId}, integration ID ${integration.id}.`,
						);
						const getHeader = (name: string) =>
							fullMsg.payload?.headers?.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value;

						let { text: bodyText, html: bodyHtml } = extractBodyParts(fullMsg.payload);

						// Truncate bodyText to capture start and end while respecting queue size; drop HTML entirely
						const MAX_BODY_LENGTH = 5000; // Approx 5KB
						const TRUNCATION_MARKER = '... [truncated] ...';
						if (bodyText && bodyText.length > MAX_BODY_LENGTH) {
							const marker = TRUNCATION_MARKER;
							const half = Math.floor((MAX_BODY_LENGTH - marker.length) / 2);
							const start = bodyText.substring(0, half);
							const end = bodyText.substring(bodyText.length - half);
							console.warn(
								`[email-fetcher] ${syncType}: Truncating bodyText for message ${fullMsg.id}: keeping first ${half} and last ${half} chars.`,
							);
							bodyText = `${start}${marker}${end}`;
						}
						// Drop HTML payload to minimize message size
						bodyHtml = null;

						const messageDataForQueue: GmailMessageData = {
							id: fullMsg.id,
							threadId: fullMsg.threadId,
							historyId: fullMsg.historyId, // historyId of the message
							snippet: fullMsg.snippet,
							subject: getHeader('subject'),
							from: getHeader('from'),
							date: getHeader('date'),
							bodyText: bodyText,
							bodyHtml: null, // HTML dropped to avoid large payloads
						};
						console.log(`[email-fetcher] ${syncType}: Prepared message ${fullMsg.id} for queue. Integration ID: ${integration.id}`);

						// Send immediately to queue for parallel processing
						const queueMessage: QueueMessage = {
							userId: integration.user_id,
							integrationId: integration.id,
							emailProvider: 'gmail' as const,
							gmailMessage: messageDataForQueue,
						};

						// Add to queue messages array for batch sending
						newMessagesToQueue.push(queueMessage);
						console.log(`[email-fetcher] ${syncType}: Prepared message ${fullMsg.id} for queue. Integration ID: ${integration.id}`);

						latestHistoryIdProcessed = fullMsg.historyId; // Keep track of the most recent historyId
						messagesFetchedCount++;

						// Send queued messages in batches of 10 for better parallelism
						if (newMessagesToQueue.length >= 10) {
							const batchToSend = newMessagesToQueue.splice(0, 10);
							try {
								const messagesForBatch = batchToSend.map((msg) => ({ body: msg }));
								await env.EMAIL_PARSE_QUEUE.sendBatch(messagesForBatch);
								console.log(
									`[email-fetcher] ${syncType}: Sent batch of ${batchToSend.length} messages to queue for integration ${integration.id}`,
								);
							} catch (batchError: any) {
								console.error(`[email-fetcher] ${syncType}: Failed to send batch:`, batchError);
								// Add failed messages back to queue for retry at the end
								newMessagesToQueue.push(...batchToSend);
							}
						}

						// Update progress every 10 messages during email fetching
						if (messagesFetchedCount % 10 === 0) {
							// Read current summary to preserve applications_found count set by queue consumer
							const currentIntegration = await db`
								SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
							`;
							const currentSummary = currentIntegration[0]?.last_sync_summary || {};

							const progressSummary = {
								...currentSummary,
								emails_processed: messagesFetchedCount,
								emails_sent_to_queue: messagesFetchedCount,
								status: 'email_fetching',
								sync_type: forceSync ? 'manual' : 'scheduled',
							};
							await db`
								UPDATE public.user_email_integrations
								SET last_sync_summary = ${db.json(progressSummary)}
								WHERE id = ${integration.id}
							`;
							console.log(
								`[email-fetcher] ${syncType}: Progress update - ${messagesFetchedCount} messages fetched and queued for integration ${integration.id}`,
							);
						}

						if (messagesFetchedCount >= INITIAL_FETCH_MAX_MESSAGES) break;
					}
				}
				nextPageToken = listResult.nextPageToken;
				if (nextPageToken === prevPageToken) {
					console.log(`nextPageToken did not change for ${integration.email_address}. Breaking initial sync loop.`);
					break pageLoop;
				}
				prevPageToken = nextPageToken;
				if (!nextPageToken || !listResult.messages || listResult.messages.length === 0) {
					break pageLoop;
				}
				if (messagesFetchedCount === prevFetchedCount) {
					console.log(`No new messages fetched in this iteration for ${integration.email_address}. Breaking initial sync loop.`);
					break pageLoop;
				}
			}
			console.log(
				`[email-fetcher] ${syncType} for ${integration.email_address} (ID: ${integration.id}) fetched ${messagesFetchedCount} messages. Latest historyId: ${latestHistoryIdProcessed}`,
			);
		} else {
			console.log(
				`[email-fetcher] Starting INCREMENTAL SYNC for integration ID ${integration.id} (Email: ${integration.email_address}), from historyId: ${integration.last_history_id}`,
			);
			// Incremental Sync: Fetch changes since last_history_id
			console.log(`Incremental sync for ${integration.email_address} starting from historyId: ${integration.last_history_id}`);
			let nextPageToken: string | undefined = undefined;
			const fetchedMessageIds = new Set<string>(); // Track message IDs within this history pull
			let prevHistoryPageToken: string | undefined;

			historyPageLoop: while (true) {
				const prevNewMsgCount = newMessagesToQueue.length;
				const historyUrl = new URL(`${GMAIL_API_BASE_URL}/me/history`);
				historyUrl.searchParams.append('startHistoryId', integration.last_history_id!);
				historyUrl.searchParams.append('historyTypes', 'messageAdded'); // Only interested in new messages for now
				if (nextPageToken) historyUrl.searchParams.append('pageToken', nextPageToken);

				console.log(`[email-fetcher] Incremental Sync: Fetching history. URL: ${historyUrl.toString()}`);
				const historyResponse = await fetch(historyUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
				console.log(
					`[email-fetcher] Incremental Sync: History response status: ${historyResponse.status} for integration ID ${integration.id}`,
				);

				if (!historyResponse.ok) {
					let caughtError: any = {};
					try {
						caughtError = await historyResponse.json();
					} catch {}
					const errorData: FetchErrorData = typeof caughtError === 'object' && caughtError !== null ? caughtError : {};
					console.error(
						`[email-fetcher] Incremental Sync: Gmail API error (history.list) for ${integration.email_address} (ID: ${integration.id}): ${historyResponse.status}`,
						errorData,
					);
					// If historyId is too old, Gmail might return 404.
					// In this case, we might need to fall back to a full list and find the new historyId.
					// Or, if user hasn't synced in a very long time, consider it an initial sync again after an error state.
					if (historyResponse.status === 404 && integration.last_history_id) {
						console.warn(
							`[email-fetcher] Incremental Sync: History ID ${integration.last_history_id} not found for ${integration.email_address}. Resetting for full sync on next run. Integration ID: ${integration.id}`,
						);
						await db`UPDATE public.user_email_integrations SET last_history_id = NULL, sync_error_message = 'History ID expired/not found. Will attempt full sync.' WHERE id = ${integration.id}`;
					} else {
						const errorMessage =
							typeof errorData.error === 'string'
								? errorData.error
								: (typeof errorData.error === 'object' && errorData.error?.message) || errorData.message || historyResponse.statusText;
						await db`UPDATE public.user_email_integrations SET sync_error_message = ${`Gmail API error (history.list): ${errorMessage}`.substring(0, 255)}, sync_status = 'error' WHERE id = ${integration.id}`;
					}
					break historyPageLoop;
				}

				const historyResult: {
					history?: { id: string; messagesAdded?: { message: { id: string; threadId: string; historyId: string } }[] }[];
					nextPageToken?: string;
					historyId?: string;
				} = await historyResponse.json();
				console.log(
					`[email-fetcher] Incremental Sync: History result for integration ID ${integration.id}: ${historyResult.history?.length || 0} history entries, nextPageToken: ${!!historyResult.nextPageToken}, new historyId: ${historyResult.historyId}`,
				);

				if (historyResult.history) {
					console.log(
						`[email-fetcher] Incremental Sync: Processing ${historyResult.history.length} history entries for integration ID ${integration.id}.`,
					);
					for (const histEntry of historyResult.history) {
						if (histEntry.messagesAdded) {
							console.log(
								`[email-fetcher] Incremental Sync: Found ${histEntry.messagesAdded.length} messagesAdded in history entry for integration ID ${integration.id}.`,
							);
							for (const addedMsg of histEntry.messagesAdded) {
								// Avoid processing same message ID multiple times if it appears in multiple history entries (unlikely for messageAdded)
								if (fetchedMessageIds.has(addedMsg.message.id)) continue;

								// For history, we get message.id and threadId. Need to fetch metadata.
								const msgDetailUrl = `${GMAIL_API_BASE_URL}/me/messages/${addedMsg.message.id}?format=full`;
								console.log(
									`[email-fetcher] Incremental Sync: Fetching full message details for added message ID ${addedMsg.message.id}. URL: ${msgDetailUrl}, Integration ID: ${integration.id}`,
								);
								const msgResponse = await fetch(msgDetailUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
								console.log(
									`[email-fetcher] Incremental Sync: Message detail response status: ${msgResponse.status} for message ID ${addedMsg.message.id}, integration ID ${integration.id}`,
								);

								if (!msgResponse.ok) {
									console.warn(
										`[email-fetcher] Incremental Sync: Failed to fetch message ${addedMsg.message.id} details (from history) for ${integration.email_address}. Status: ${msgResponse.status}, Integration ID: ${integration.id}`,
									);
									continue;
								}
								const fullMsg: GmailApiMessage = await msgResponse.json();
								console.log(
									`[email-fetcher] Incremental Sync: Received full message for ID ${fullMsg.id} (from history), historyId ${fullMsg.historyId}, integration ID ${integration.id}.`,
								);
								fetchedMessageIds.add(fullMsg.id);

								const getHeader = (name: string) =>
									fullMsg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

								let { text: bodyText, html: bodyHtml } = extractBodyParts(fullMsg.payload);

								// Truncate bodyText to capture start and end while respecting queue size; drop HTML entirely
								const MAX_BODY_LENGTH = 5000; // Approx 5KB
								const TRUNCATION_MARKER = '... [truncated] ...';
								if (bodyText && bodyText.length > MAX_BODY_LENGTH) {
									const marker = TRUNCATION_MARKER;
									const half = Math.floor((MAX_BODY_LENGTH - marker.length) / 2);
									const start = bodyText.substring(0, half);
									const end = bodyText.substring(bodyText.length - half);
									console.warn(
										`[email-fetcher] Incremental Sync: Truncating bodyText for message ${fullMsg.id}: keeping first ${half} and last ${half} chars.`,
									);
									bodyText = `${start}${marker}${end}`;
								}
								// Drop HTML payload to minimize queue size
								bodyHtml = null;

								const messageDataForQueue: GmailMessageData = {
									id: fullMsg.id,
									threadId: fullMsg.threadId,
									historyId: fullMsg.historyId,
									snippet: fullMsg.snippet,
									subject: getHeader('subject'),
									from: getHeader('from'),
									date: getHeader('date'),
									bodyText: bodyText,
									bodyHtml: null, // HTML dropped to avoid large payloads
								};
								console.log(
									`[email-fetcher] Incremental Sync: Prepared message ${fullMsg.id} for queue. Integration ID: ${integration.id}`,
								);
								const queueMessage: QueueMessage = {
									userId: integration.user_id,
									integrationId: integration.id,
									emailProvider: 'gmail' as const,
									gmailMessage: messageDataForQueue,
								};

								// Add to queue messages array for batch sending
								newMessagesToQueue.push(queueMessage);
								console.log(
									`[email-fetcher] Incremental Sync: Prepared message ${fullMsg.id} for queue. Integration ID: ${integration.id}`,
								);

								// Send queued messages in batches of 10 for better parallelism
								if (newMessagesToQueue.length >= 10) {
									const batchToSend = newMessagesToQueue.splice(0, 10);
									try {
										const messagesForBatch = batchToSend.map((msg) => ({ body: msg }));
										await env.EMAIL_PARSE_QUEUE.sendBatch(messagesForBatch);
										console.log(
											`[email-fetcher] Incremental Sync: Sent batch of ${batchToSend.length} messages to queue for integration ${integration.id}`,
										);
									} catch (batchError: any) {
										console.error(`[email-fetcher] Incremental Sync: Failed to send batch:`, batchError);
										// Add failed messages back to queue for retry at the end
										newMessagesToQueue.push(...batchToSend);
									}
								}

								// Update progress periodically during incremental sync too
								const totalProcessed = messagesFetchedCount + newMessagesToQueue.length;
								if (totalProcessed % 5 === 0) {
									// Read current summary to preserve applications_found count set by queue consumer
									const currentIntegration = await db`
										SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
									`;
									const currentSummary = currentIntegration[0]?.last_sync_summary || {};

									const progressSummary = {
										...currentSummary,
										emails_processed: totalProcessed,
										emails_sent_to_queue: totalProcessed,
										status: 'email_fetching',
										sync_type: forceSync ? 'manual' : 'scheduled',
									};
									await db`
										UPDATE public.user_email_integrations
										SET last_sync_summary = ${db.json(progressSummary)}
										WHERE id = ${integration.id}
									`;
									console.log(
										`[email-fetcher] Incremental Sync: Progress update - ${totalProcessed} new messages found for integration ${integration.id}`,
									);
								}
							}
						}
					}
				}
				// The historyId from the history.list response is the new high-water mark
				latestHistoryIdProcessed = historyResult.historyId || latestHistoryIdProcessed;
				nextPageToken = historyResult.nextPageToken;
				if (nextPageToken === prevHistoryPageToken) {
					console.log(`Incremental sync: history nextPageToken did not change for ${integration.email_address}. Breaking loop.`);
					break historyPageLoop;
				}
				prevHistoryPageToken = nextPageToken;
				if (!nextPageToken) {
					break historyPageLoop;
				}
				if (newMessagesToQueue.length === prevNewMsgCount) {
					console.log(`No new messages added in incremental sync iteration for ${integration.email_address}. Breaking loop.`);
					break historyPageLoop;
				}
			}
			console.log(
				`[email-fetcher] Incremental sync for ${integration.email_address} (ID: ${integration.id}) found ${newMessagesToQueue.length} new messages. New historyId: ${latestHistoryIdProcessed}`,
			);
		}

		// Send any remaining messages that failed immediate sending to queue
		if (newMessagesToQueue.length > 0) {
			console.log(
				`[email-fetcher] Sending ${newMessagesToQueue.length} fallback messages to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
			);
			syncSummary.emails_processed = messagesFetchedCount; // Total messages processed

			const queueBatchSize = 5;
			for (let i = 0; i < newMessagesToQueue.length; i += queueBatchSize) {
				const batchToSend = newMessagesToQueue.slice(i, i + queueBatchSize);
				console.log(
					`[email-fetcher] Sending fallback batch of ${batchToSend.length} messages to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
				);
				const messagesForBatch = batchToSend.map((msg) => ({ body: msg }));
				await env.EMAIL_PARSE_QUEUE.sendBatch(messagesForBatch);
				console.log(
					`[email-fetcher] Successfully sent fallback batch of ${batchToSend.length} messages to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
				);
			}
			console.log(
				`[email-fetcher] Successfully sent all ${newMessagesToQueue.length} fallback messages to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
			);
		}

		// Update final sync status
		if (messagesFetchedCount > 0) {
			// Keep sync_in_progress = TRUE when we have messages queued for AI processing
			console.log(
				`[email-fetcher] Keeping sync_in_progress = TRUE for integration (ID: ${integration.id}) - AI processing pending for ${messagesFetchedCount} messages`,
			);

			// First, get the current summary to preserve any existing data like applications_found
			const currentIntegration = await db`
				SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
			`;
			const currentSummary = currentIntegration[0]?.last_sync_summary || {};

			await db`
				UPDATE public.user_email_integrations
				SET
					last_history_id = ${latestHistoryIdProcessed},
					last_history_synced_at = ${new Date().toISOString()},
					sync_error_message = NULL,
					sync_status = 'active',
					sync_in_progress = TRUE,
					last_sync_started_at = COALESCE(last_sync_started_at, NOW()),
					last_sync_summary = ${db.json({
						...currentSummary,
						emails_processed: messagesFetchedCount,
						emails_sent_to_queue: messagesFetchedCount,
						status: 'ai_processing',
						sync_type: forceSync ? 'manual' : 'scheduled',
					})}
				WHERE id = ${integration.id}
			`;
		} else {
			console.log(`[email-fetcher] No new messages to queue for integration ID ${integration.id}.`);
			// Complete sync immediately if no AI processing needed
			console.log(`[email-fetcher] Completing sync for integration (ID: ${integration.id}) - no AI processing needed`);

			// Get current summary to preserve applications_found count
			const currentIntegration = await db`
				SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
			`;
			const currentSummary = currentIntegration[0]?.last_sync_summary || {};

			await db`
				UPDATE public.user_email_integrations
				SET
					last_history_id = ${latestHistoryIdProcessed},
					last_history_synced_at = ${new Date().toISOString()},
					sync_error_message = NULL,
					sync_status = 'active',
					sync_in_progress = FALSE,
					last_sync_completed_at = NOW(),
					last_sync_summary = ${db.json({
						...currentSummary,
						emails_processed: messagesFetchedCount,
						status: 'completed',
						sync_type: forceSync ? 'manual' : 'scheduled',
					})}
				WHERE id = ${integration.id}
			`;
		}

		console.log(
			`[email-fetcher] Successfully processed integration (ID: ${integration.id}). Sync state managed based on AI processing requirements.`,
		);
	} catch (syncError: any) {
		console.error(
			`[email-fetcher] Error during sync for integration ID ${integration.id} (${integration.email_address}): ${syncError.message}`,
			syncError.stack,
		);
		syncSummary.error = syncError.message;
		await db`
			UPDATE public.user_email_integrations
			SET 
				sync_error_message = ${syncError.message.substring(0, 255)}, 
				sync_status = 'error',
				sync_in_progress = FALSE,
				last_sync_completed_at = NOW(),
				last_sync_summary = ${db.json(syncSummary)}
			WHERE id = ${integration.id}
		`;
		console.log(`[email-fetcher] Marked integration ID ${integration.id} as error in DB due to sync error.`);
	}

	console.log(
		`[email-fetcher] === PROCESSING INTEGRATION END: User ID ${integration.user_id}, Email: ${integration.email_address}, Integration ID: ${integration.id} ===`,
	);
}

export default {
	async scheduled(controller: ScheduledController, env: ScheduledWorkerEnv, ctx: ExecutionContext): Promise<void> {
		console.log(`[email-fetcher] Scheduled function START. Invoked at: ${new Date().toISOString()}, cron: ${controller.cron}`);

		// Initialize DB client
		let connectionString = env.HYPERDRIVE_SUPABASE.connectionString;
		if (connectionString.includes('.hyperdrive.local') && env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE) {
			connectionString = env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE;
		}
		const db = getHyperdriveNonPooled(connectionString);
		env.db = db;
		console.log(
			`[email-fetcher] Database client initialized. Using: ${connectionString.includes('.hyperdrive.local') || connectionString.includes('127.0.0.1') || connectionString.includes('localhost') ? 'local Hyperdrive config' : 'production Hyperdrive config'}`,
		);

		// Initialize TokenRepository on env
		const backendType = env.TOKEN_BACKEND || 'supabase';
		if (backendType === 'kv') {
			if (!env.TOKEN_KV) {
				console.error("[email-fetcher] TOKEN_BACKEND is 'kv' but TOKEN_KV binding is not available. Cannot proceed.");
				ctx.waitUntil(db.end());
				return;
			}
			env.tokenRepository = new KvTokenRepository(env.TOKEN_KV);
			console.log('[email-fetcher] Using KvTokenRepository for token storage.');
		} else {
			env.tokenRepository = new SupabaseTokenRepository(db);
			console.log('[email-fetcher] Using SupabaseTokenRepository for token storage.');
		}

		const cryptoKey = await getKeyMaterial(env.TOKEN_ENCRYPTION_KEY);
		console.log(`[email-fetcher] Crypto key material initialized.`);

		const syncThreshold = new Date(Date.now() - SYNC_INTERVAL_MINUTES * 60 * 1000).toISOString();
		console.log(`[email-fetcher] Sync threshold set to: ${syncThreshold}`);

		try {
			console.log(`[email-fetcher] Querying for integrations to sync...`);
			const integrationsToSync: UserEmailIntegrationForFetcher[] = await db<UserEmailIntegrationForFetcher[]>`
                SELECT
                    id, user_id, email_address, provider,
                    access_token_encrypted, refresh_token_encrypted, access_token_expires_at, -- These DB columns are mostly for SupabaseTokenRepository or historical data
                    scopes, sync_status, last_history_id, last_history_synced_at
                FROM public.user_email_integrations
                WHERE
                    provider = 'gmail'
                    AND sync_status = 'active'
                    AND (last_history_synced_at IS NULL OR last_history_synced_at < ${syncThreshold})
                ORDER BY last_history_synced_at ASC NULLS FIRST -- Process oldest first
                LIMIT 100; -- Process in batches to avoid long-running workers
            `;
			console.log(`[email-fetcher] Found ${integrationsToSync.length} integrations to sync.`);

			for (const integration of integrationsToSync) {
				await syncGmailIntegration(integration, env, db, cryptoKey, env.tokenRepository);
			}

			// Check for integrations stuck in AI processing and complete them if enough time has passed
			console.log(`[email-fetcher] Checking for integrations stuck in AI processing...`);
			const stuckIntegrations = await db`
				SELECT id, user_id, email_address, last_sync_summary
				FROM public.user_email_integrations
				WHERE 
					provider = 'gmail'
					AND sync_status = 'active'
					AND sync_in_progress = TRUE
					AND last_sync_summary->>'status' = 'ai_processing'
					AND (
						last_sync_summary->>'last_ai_processing_at' IS NULL
						OR (last_sync_summary->>'last_ai_processing_at')::timestamp < NOW() - INTERVAL '30 seconds'
					)
			`;

			console.log(`[email-fetcher] Found ${stuckIntegrations.length} integrations stuck in AI processing`);

			for (const integration of stuckIntegrations) {
				console.log(`[email-fetcher] Completing stuck AI processing for integration ${integration.id} (${integration.email_address})`);

				const currentSummary = integration.last_sync_summary || {};
				const completedSummary = {
					...currentSummary,
					status: 'completed',
					completed_at: new Date().toISOString(),
				};

				await db`
					UPDATE public.user_email_integrations
					SET 
						sync_in_progress = FALSE,
						last_sync_completed_at = NOW(),
						last_sync_summary = ${db.json(completedSummary)}
					WHERE id = ${integration.id}
				`;

				console.log(`[email-fetcher] Completed stuck sync for integration ${integration.id}`);
			}
		} catch (error: any) {
			console.error(`[email-fetcher] Error during scheduled function: ${error.message}`, error.stack);
		} finally {
			ctx.waitUntil(db.end());
		}
	},
};
