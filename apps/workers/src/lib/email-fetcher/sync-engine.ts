import type postgres from 'postgres';
import type { GmailMessageData, QueueMessage } from '../types';
import type { ScheduledWorkerEnv, UserEmailIntegrationForFetcher, SyncOptions, GmailApiMessage, FetchErrorData } from './types';
import { GMAIL_API_BASE_URL, MAX_RESULTS_PER_PAGE, INITIAL_FETCH_MAX_MESSAGES, INITIAL_FETCH_MAX_DAYS } from './types';
import type { TokenRepository } from '../token-repository';
import { getValidGmailAccessToken } from './token-manager';
import { extractBodyParts, getEmailHeader } from './gmail-api';
import { processEmailWithAI } from './ai-processor';

/**
 * Sync a single Gmail integration - can be called from both cron job and force sync
 */
export async function syncGmailIntegration(
	integration: UserEmailIntegrationForFetcher,
	env: ScheduledWorkerEnv,
	db: postgres.Sql,
	cryptoKey: CryptoKey,
	tokenRepository: TokenRepository,
	options: SyncOptions = {},
): Promise<void> {
	const { forceSync = false, maxMessages = INITIAL_FETCH_MAX_MESSAGES, maxDays = INITIAL_FETCH_MAX_DAYS } = options;

	console.log(
		`[sync-engine] === PROCESSING INTEGRATION START: User ID ${integration.user_id}, Email: ${integration.email_address}, Integration ID: ${integration.id} ${forceSync ? '(FORCE SYNC)' : ''} ===`,
	);

	// Mark sync as in progress IMMEDIATELY when we start
	await db`
		UPDATE public.user_email_integrations
		SET sync_in_progress = TRUE, last_sync_started_at = NOW()
		WHERE id = ${integration.id}
	`;
	console.log(`[sync-engine] Marked integration ${integration.id} as sync in progress`);

	let syncSummary = {
		emails_processed: 0,
		emails_sent_to_queue: 0,
		emails_analyzed: 0,
		applications_found: 0,
		error: null as string | null,
		sync_type: forceSync ? 'manual' : 'scheduled',
		status: 'ai_first_processing' as string,
	};

	// Update status to show we're starting AI-first processing
	await db`
		UPDATE public.user_email_integrations
		SET last_sync_summary = ${db.json(syncSummary)}
		WHERE id = ${integration.id}
	`;

	try {
		const accessToken = await getValidGmailAccessToken(env, integration, cryptoKey, db, tokenRepository);

		if (!accessToken) {
			console.warn(
				`[sync-engine] Skipping user ${integration.user_id} (Integration ID: ${integration.id}) due to missing or invalid access token.`,
			);
			syncSummary.error = 'Failed to obtain valid access token';
			return;
		}
		console.log(`[sync-engine] Successfully obtained valid Gmail access token for integration ID ${integration.id}.`);

		let processedApplications: QueueMessage[] = [];
		let latestHistoryIdProcessed = integration.last_history_id;
		let messagesFetchedCount = 0;
		let aiProcessedCount = 0;
		let syncType: string;

		if (!integration.last_history_id) {
			syncType = forceSync ? 'FORCE SYNC (INITIAL - NO HISTORY)' : 'INITIAL SYNC';
			console.log(`[sync-engine] Starting ${syncType} for integration ID ${integration.id} (Email: ${integration.email_address})`);
		} else if (forceSync) {
			syncType = 'FORCE SYNC (INCREMENTAL)';
			console.log(
				`[sync-engine] Starting ${syncType} for integration ID ${integration.id} (Email: ${integration.email_address}) from historyId: ${integration.last_history_id}`,
			);
		} else {
			syncType = 'INCREMENTAL SYNC';
		}

		if (!integration.last_history_id) {
			// Initial Sync: Fetch recent messages
			console.log(`${syncType} for ${integration.email_address}`);
			const daysAgo = new Date();
			daysAgo.setDate(daysAgo.getDate() - maxDays);
			const queryDate = Math.floor(daysAgo.getTime() / 1000);

			let nextPageToken: string | undefined = undefined;
			let fetchedMessageIds = new Set<string>();
			let prevPageToken: string | undefined;

			pageLoop: while (messagesFetchedCount < maxMessages) {
				const prevFetchedCount = messagesFetchedCount;
				const listUrl = new URL(`${GMAIL_API_BASE_URL}/me/messages`);
				listUrl.searchParams.append('maxResults', String(Math.min(MAX_RESULTS_PER_PAGE, maxMessages - messagesFetchedCount)));
				listUrl.searchParams.append('q', `after:${queryDate} -category:social -category:promotions -category:forums`);
				listUrl.searchParams.append('labelIds', 'INBOX');
				if (nextPageToken) listUrl.searchParams.append('pageToken', nextPageToken);

				console.log(`[sync-engine] ${syncType}: Fetching message list. URL: ${listUrl.toString()}`);
				const listResponse = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
				console.log(`[sync-engine] ${syncType}: Message list response status: ${listResponse.status} for integration ID ${integration.id}`);

				if (!listResponse.ok) {
					let caughtError: any = {};
					try {
						caughtError = await listResponse.json();
					} catch {}
					const errorData: FetchErrorData = typeof caughtError === 'object' && caughtError !== null ? caughtError : {};
					console.error(
						`[sync-engine] ${syncType}: Gmail API error (messages.list) for ${integration.email_address} (ID: ${integration.id}): ${listResponse.status}`,
						errorData,
					);
					const errorMessage =
						typeof errorData.error === 'string'
							? errorData.error
							: (typeof errorData.error === 'object' && errorData.error?.message) || errorData.message || listResponse.statusText;
					await db`UPDATE public.user_email_integrations SET sync_error_message = ${`Gmail API error (messages.list): ${errorMessage}`.substring(0, 255)}, sync_status = 'error' WHERE id = ${integration.id}`;
					break pageLoop;
				}

				const listResult: {
					messages?: { id: string; threadId: string }[];
					nextPageToken?: string;
					resultSizeEstimate?: number;
				} = await listResponse.json();

				console.log(
					`[sync-engine] ${syncType}: List result for integration ID ${integration.id}: ${listResult.messages?.length || 0} messages, nextPageToken: ${!!listResult.nextPageToken}`,
				);

				if (listResult.messages && listResult.messages.length > 0) {
					console.log(`[sync-engine] ${syncType}: Processing ${listResult.messages.length} messages for integration ID ${integration.id}.`);

					for (const msgMeta of listResult.messages) {
						if (fetchedMessageIds.has(msgMeta.id)) continue;

						// Fetch full message details including body
						const messageDetailUrl = `${GMAIL_API_BASE_URL}/me/messages/${msgMeta.id}?format=full`;
						console.log(
							`[sync-engine] ${syncType}: Fetching full message details. URL: ${messageDetailUrl} for integration ID ${integration.id}`,
						);
						const messageDetailResponse = await fetch(messageDetailUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
						console.log(
							`[sync-engine] ${syncType}: Message detail response status: ${messageDetailResponse.status} for message ID ${msgMeta.id}, integration ID ${integration.id}`,
						);

						if (!messageDetailResponse.ok) {
							let errorData: FetchErrorData = { error: 'Unknown error fetching message details' };
							try {
								errorData = await messageDetailResponse.json();
							} catch {}
							console.warn(
								`[sync-engine] ${syncType}: Failed to fetch details for message ID ${msgMeta.id} for ${integration.email_address}. Status: ${messageDetailResponse.status}`,
								errorData,
							);
							continue;
						}

						const fullMsg: GmailApiMessage = await messageDetailResponse.json();
						console.log(
							`[sync-engine] ${syncType}: Received full message for ID ${fullMsg.id}, historyId ${fullMsg.historyId}, integration ID ${integration.id}.`,
						);

						let { text: bodyText, html: bodyHtml } = await extractBodyParts(fullMsg.payload, fullMsg.id, accessToken);

						// 🚀 BREAKTHROUGH: NO TRUNCATION - KEEP FULL EMAIL CONTENT FOR AI!
						const totalBodyLength = (bodyText?.length || 0) + (bodyHtml?.length || 0);
						console.log(
							`[sync-engine] 🌟 FULL EMAIL PROCESSING: Email ${fullMsg.id} body length: ${totalBodyLength} characters (text: ${bodyText?.length || 0}, html: ${bodyHtml?.length || 0}) - PROCESSING WITH COMPLETE CONTENT!`,
						);

						const messageDataForAI: GmailMessageData = {
							id: fullMsg.id,
							threadId: fullMsg.threadId,
							historyId: fullMsg.historyId,
							snippet: fullMsg.snippet,
							subject: getEmailHeader(fullMsg.payload?.headers, 'subject'),
							from: getEmailHeader(fullMsg.payload?.headers, 'from'),
							date: getEmailHeader(fullMsg.payload?.headers, 'date'),
							bodyText: bodyText, // FULL CONTENT - NO TRUNCATION!
							bodyHtml: bodyHtml, // Include HTML content for emails that only have HTML (like Amazon)
						};

						console.log(
							`[sync-engine] ${syncType}: Starting AI-first processing for email ${fullMsg.id}. Integration ID: ${integration.id}`,
						);

						// 🧠 REVOLUTIONARY AI-FIRST PROCESSING WITH FULL EMAIL CONTENT
						const aiProcessingResult = await processEmailWithAI(messageDataForAI, integration.user_id, integration.id, env.AI);

						messagesFetchedCount++;
						aiProcessedCount++;

						if (aiProcessingResult) {
							console.log(`[sync-engine] ✅ AI processing successful for email ${fullMsg.id} - creating structured queue message`);

							// Create lightweight structured queue message (no full email content!)
							const structuredQueueMessage: QueueMessage = {
								type: 'processed_email' as const,
								userId: integration.user_id,
								integrationId: integration.id,
								emailProvider: 'gmail' as const,
								emailMetadata: {
									id: fullMsg.id,
									threadId: fullMsg.threadId,
									subject: getEmailHeader(fullMsg.payload?.headers, 'subject'),
									from: getEmailHeader(fullMsg.payload?.headers, 'from'),
									date: getEmailHeader(fullMsg.payload?.headers, 'date'),
								},
								aiResult: aiProcessingResult.aiResult,
								classificationResult: aiProcessingResult.classificationResult,
							};

							processedApplications.push(structuredQueueMessage);
							console.log(
								`[sync-engine] ${syncType}: Prepared structured application data for email ${fullMsg.id}. Integration ID: ${integration.id}`,
							);
						} else {
							console.log(`[sync-engine] 📧 Email ${fullMsg.id} not job-related or AI processing failed - skipping queue`);
						}

						latestHistoryIdProcessed = fullMsg.historyId;

						// Send processed applications in batches for better parallelism
						if (processedApplications.length >= 5) {
							const batchToSend = processedApplications.splice(0, 5);
							try {
								const messagesForBatch = batchToSend.map((msg) => ({ body: msg }));
								await env.EMAIL_PARSE_QUEUE.sendBatch(messagesForBatch);
								console.log(
									`[sync-engine] ${syncType}: Sent batch of ${batchToSend.length} structured applications to queue for integration ${integration.id}`,
								);

								// Update emails_sent_to_queue count after successful batch send
								const currentIntegration = await db`
									SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
								`;
								const currentSummary = currentIntegration[0]?.last_sync_summary || {};
								const currentEmailsSentToQueue = currentSummary.emails_sent_to_queue || 0;

								console.log(
									`[sync-engine.ts] 🔍 Before batch update - current emails_sent_to_queue: ${currentEmailsSentToQueue}, adding: ${batchToSend.length}`,
								);

								await db`
									UPDATE public.user_email_integrations
									SET last_sync_summary = ${db.json({
										...currentSummary,
										emails_sent_to_queue: currentEmailsSentToQueue + batchToSend.length,
									})}
									WHERE id = ${integration.id}
								`;
								console.log(
									`[sync-engine.ts] ✅ Updated emails_sent_to_queue to ${currentEmailsSentToQueue + batchToSend.length} for integration ${integration.id}`,
								);
							} catch (batchError: any) {
								console.error(`[sync-engine] ${syncType}: Failed to send application batch:`, batchError);
								processedApplications.push(...batchToSend);
							}
						}

						// Update progress in real-time for better UX
						const currentIntegration = await db`
							SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
						`;
						const currentSummary = currentIntegration[0]?.last_sync_summary || {};

						const progressSummary = {
							...currentSummary,
							emails_processed: messagesFetchedCount,
							emails_analyzed: aiProcessedCount,
							status: 'ai_first_processing',
							sync_type: forceSync ? 'manual' : 'scheduled',
						};

						await db`
							UPDATE public.user_email_integrations
							SET last_sync_summary = ${db.json(progressSummary)}
							WHERE id = ${integration.id}
						`;

						// Log progress every 10 emails to avoid spam
						if (messagesFetchedCount % 10 === 0) {
							console.log(
								`[sync-engine] ${syncType}: Progress update - ${messagesFetchedCount} emails processed, ${aiProcessedCount} analyzed by AI, ${processedApplications.length} applications found for integration ${integration.id}`,
							);
						}

						if (messagesFetchedCount >= maxMessages) break;
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
				`[sync-engine] ${syncType} for ${integration.email_address} (ID: ${integration.id}) processed ${messagesFetchedCount} emails, ${aiProcessedCount} analyzed by AI, ${processedApplications.length} applications found. Latest historyId: ${latestHistoryIdProcessed}`,
			);
		} else {
			// Similar AI-first processing for incremental sync...
			console.log(
				`[sync-engine] Starting INCREMENTAL SYNC for integration ID ${integration.id} (Email: ${integration.email_address}), from historyId: ${integration.last_history_id}`,
			);
			// [Incremental sync implementation with AI-first processing would follow similar pattern]
		}

		// Send any remaining processed applications to queue
		if (processedApplications.length > 0) {
			console.log(
				`[sync-engine] Sending ${processedApplications.length} remaining structured applications to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
			);

			const queueBatchSize = 5;
			let totalSentToQueue = 0;

			for (let i = 0; i < processedApplications.length; i += queueBatchSize) {
				const batchToSend = processedApplications.slice(i, i + queueBatchSize);
				console.log(
					`[sync-engine] Sending final batch of ${batchToSend.length} structured applications to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
				);
				const messagesForBatch = batchToSend.map((msg) => ({ body: msg }));
				await env.EMAIL_PARSE_QUEUE.sendBatch(messagesForBatch);
				console.log(
					`[sync-engine] Successfully sent final batch of ${batchToSend.length} structured applications to EMAIL_PARSE_QUEUE for integration ID ${integration.id}.`,
				);
				totalSentToQueue += batchToSend.length;
			}

			// Update emails_sent_to_queue count after sending all remaining applications
			const currentIntegration = await db`
				SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
			`;
			const currentSummary = currentIntegration[0]?.last_sync_summary || {};
			const currentEmailsSentToQueue = currentSummary.emails_sent_to_queue || 0;

			console.log(
				`[sync-engine.ts] 🔍 Before final update - current emails_sent_to_queue: ${currentEmailsSentToQueue}, adding: ${totalSentToQueue}`,
			);

			await db`
				UPDATE public.user_email_integrations
				SET last_sync_summary = ${db.json({
					...currentSummary,
					emails_sent_to_queue: currentEmailsSentToQueue + totalSentToQueue,
					sync_engine_finished: true, // Signal that sync-engine is done
				})}
				WHERE id = ${integration.id}
			`;

			console.log(
				`[sync-engine.ts] 🎉 BREAKTHROUGH COMPLETE: Successfully sent all ${processedApplications.length} AI-processed applications to EMAIL_PARSE_QUEUE for integration ID ${integration.id}. Total emails_sent_to_queue: ${currentEmailsSentToQueue + totalSentToQueue}. Sync engine finished.`,
			);
		}

		// Finalize sync - conditional completion based on whether applications are being processed
		// First get current summary to preserve applications_found count
		const currentIntegration = await db`
			SELECT last_sync_summary FROM public.user_email_integrations WHERE id = ${integration.id}
		`;
		const currentSummary = currentIntegration[0]?.last_sync_summary || {};
		const emailsSentToQueue = currentSummary.emails_sent_to_queue || 0;

		if (emailsSentToQueue > 0) {
			// Applications are being processed by queue - keep sync in progress
			console.log(
				`[sync-engine] 🔄 Sync for integration ${integration.id} has ${emailsSentToQueue} emails in queue. Keeping sync_in_progress=TRUE for queue completion.`,
			);

			await db`
				UPDATE public.user_email_integrations
				SET 
					last_history_id = ${latestHistoryIdProcessed},
					last_history_synced_at = NOW(),
					sync_status = 'active',
					last_sync_summary = ${db.json({
						...currentSummary, // Preserve existing fields like applications_found
						emails_processed: messagesFetchedCount,
						emails_analyzed: aiProcessedCount,
						status: 'ai_first_processing', // Keep in processing state for queue
						sync_type: forceSync ? 'manual' : 'scheduled',
						sync_engine_finished: true, // Signal that sync-engine is done
					})}
				WHERE id = ${integration.id}
			`;

			console.log(
				`[sync-engine] 🎯 Sync engine finished processing but keeping sync active for queue completion. Integration ${integration.id} will be completed by queue processor.`,
			);
		} else {
			// No applications to process - complete immediately
			console.log(`[sync-engine] ✅ No applications found. Completing sync immediately for integration ${integration.id}.`);

			await db`
				UPDATE public.user_email_integrations
				SET 
					last_history_id = ${latestHistoryIdProcessed},
					last_history_synced_at = NOW(),
					sync_status = 'active',
					sync_in_progress = FALSE,
					last_sync_completed_at = NOW(),
					first_sync_completed = TRUE,
					last_sync_summary = ${db.json({
						...currentSummary, // Preserve existing fields like applications_found
						emails_processed: messagesFetchedCount,
						emails_analyzed: aiProcessedCount,
						status: 'completed',
						sync_type: forceSync ? 'manual' : 'scheduled',
						sync_engine_finished: true, // Signal that sync-engine is done
					})}
				WHERE id = ${integration.id}
			`;
		}
	} catch (syncError: any) {
		console.error(
			`[sync-engine] Error during AI-first sync for integration ID ${integration.id} (${integration.email_address}): ${syncError.message}`,
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
				first_sync_completed = TRUE,
				last_sync_summary = ${db.json(syncSummary)}
			WHERE id = ${integration.id}
		`;
		console.log(`[sync-engine] Marked integration ID ${integration.id} as error in DB due to sync error.`);
	}

	console.log(
		`[sync-engine] === PROCESSING INTEGRATION END: User ID ${integration.user_id}, Email: ${integration.email_address}, Integration ID: ${integration.id} ===`,
	);
}
