// apps/workers/src/queue-consumer.ts
import type { ExecutionContext, MessageBatch, Hyperdrive, KVNamespace, Queue, Ai } from '@cloudflare/workers-types';
import type { EmailToParse, QueueMessage, ForceSyncMessage, AIParsedData, AISuggestionType, AISuggestion } from './lib/types';
import { getHyperdriveNonPooled } from './lib/supabase';
import { classifyEmail, type JobEmailClassification } from './lib/ai-classifier';
import { extractEmailData, AIParsedDataSchema as ExtractorDataSchema, type AIParsedDataFromExtractor } from './lib/ai-extractor';
import { z } from 'zod';
import postgres from 'postgres';
import { syncGmailIntegration } from './email-fetcher';
import { getKeyMaterial } from './lib/crypto';
import { SupabaseTokenRepository } from './lib/supabase-token-repository';
import { KvTokenRepository } from './lib/kv-token-repository';
import type { TokenRepository } from './lib/token-repository';

// Define a specific Env for this consumer logic
// This might be a subset or superset of the main Env, depending on its needs
export interface QueueConsumerEnv {
	HYPERDRIVE_SUPABASE: Hyperdrive;
	SUPABASE_URL?: string; // If using Supabase client for RPCs/admin tasks
	SUPABASE_SERVICE_ROLE_KEY?: string; // If using Supabase client
	AI: Ai; // Ensure AI binding is explicitly part of this Env for clarity with Vercel SDK
	WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE?: string; // Local Hyperdrive override

	// Added for force sync functionality
	TOKEN_ENCRYPTION_KEY: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	WORKER_GOOGLE_REDIRECT_URI: string;
	TOKEN_BACKEND?: 'supabase' | 'kv';
	TOKEN_KV?: KVNamespace;
	EMAIL_PARSE_QUEUE: Queue<QueueMessage>;
	EMAIL_SYNC_RATE_KV: KVNamespace; // For rate limiting force sync requests

	// Potentially other KV/R2 bindings if needed for parsing context or storing results
	// MY_KV_NAMESPACE?: KVNamespace;
}

// === Zod Schemas ===
const JobEmailClassificationSchema = z.object({
	isJobApplicationRelated: z
		.boolean()
		.describe(
			"True if the email is directly related to a user's specific job application (e.g., confirmation, update, interview request, rejection). False if it's a general job alert, newsletter, promotional email, or not about a specific application the user has made.",
		),
	reasoning: z.string().optional().describe('Brief explanation for the classification decision, especially if false.'),
});

const AIParsedApplicationStatusEnum = z.enum([
	'Applied',
	'Screening',
	'Interviewing',
	'Offer Extended',
	'Offer Accepted',
	'Offer Declined',
	'Rejected',
	'Withdrawn',
	'On Hold',
]);

const AIParsedDataSchema = z.object({
	companyName: z.string().nullable().describe('The name of the company mentioned in the application.'),
	jobTitle: z.string().nullable().describe('The job title for the application.'),
	applicationDate: z
		.string()
		.nullable()
		.describe('The date of application (YYYY-MM-DD). Extract from email body if mentioned, otherwise use email date.'),
	status: AIParsedApplicationStatusEnum.nullable().describe('The current status of the job application.'),
	extractedSalary: z.string().nullable().describe("Any salary information mentioned (e.g., '$100k - $120k')."),
	location: z.string().nullable().describe("The job location (e.g., 'Remote', 'San Francisco, CA')."),
	jobPostingUrl: z.string().url().nullable().describe('A direct URL to the job posting, if found.'),
	interviewDate: z
		.string()
		.nullable()
		.describe('The date and time of an interview (ISO 8601 format if possible, e.g., YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DD).'),
	interviewType: z.string().nullable().describe("Type of interview (e.g., 'Phone Screen', 'Technical Interview')."),
	contactName: z.string().nullable().describe('Name of a contact person, if mentioned.'),
	contactEmail: z.string().email().nullable().describe('Email address of a contact person.'),
	contactPhone: z.string().nullable().describe('Phone number of a contact person.'),
	notes: z.string().nullable().describe('Other relevant notes or details from the email.'),
	sourceEmailId: z.string().describe('The ID of the source email message.'), // Will be populated programmatically
	sourceThreadId: z.string().describe('The ID of the source email thread.'), // Will be populated programmatically
});

// === AI Rate Limiting ===
const AI_RATE_LIMIT_PER_MINUTE = 250; // Conservative limit (under 300)
const AI_CALL_DELAY_MS = Math.ceil(60000 / AI_RATE_LIMIT_PER_MINUTE); // ~240ms between calls

// Helper to enforce AI rate limiting
async function rateLimitedAICall<T>(aiCall: () => Promise<T>): Promise<T> {
	const start = Date.now();
	const result = await aiCall();
	const elapsed = Date.now() - start;
	const remaining = AI_CALL_DELAY_MS - elapsed;

	if (remaining > 0) {
		console.log(`[queue-consumer] 🕒 AI rate limit: waiting ${remaining}ms`);
		await new Promise((resolve) => setTimeout(resolve, remaining));
	}

	return result;
}

// Helper to generate the AI prompt for EXTRACTION (now uses Zod schema description)
function createAIExtractionPrompt(emailData: EmailToParse): string {
	const { subject, snippet, from, date, bodyText } = emailData.gmailMessage;

	const emailContentForPrompt = `Analyze the following email content regarding a job application. Your goal is to extract specific details.
Use the email's own date as the applicationDate if no other application date is explicitly mentioned in the body.

Email Subject: ${subject || 'N/A'}
From: ${from || 'N/A'}
Date: ${date || 'N/A'}

Email Body:
${bodyText || snippet || 'No body text available.'}
---
`;
	return emailContentForPrompt;
}

// Helper to determine suggestion type based on parsed AI data
// Note: AIParsedDataFromExtractor is the output from ai-extractor.ts
function inferSuggestionType(parsed: AIParsedDataFromExtractor): AISuggestionType {
	if (parsed.status && parsed.status !== 'Applied') return 'application_status_update';
	if (parsed.companyName && parsed.jobTitle && (parsed.status === 'Applied' || !parsed.status)) return 'new_application_detected';
	return 'other_job_search_communication'; // Default or fallback suggestion type
}

// Helper functions for error handling and sync tracking
async function saveFailedEmail(db: postgres.Sql, emailToParse: EmailToParse, reason: string, retryCount: number): Promise<void> {
	try {
		await db`
			INSERT INTO public.failed_email_reviews (
				user_id, integration_id, email_id, email_thread_id, 
				email_subject, email_from, email_date, email_snippet, email_body,
				failure_reason, failure_count
			)
			VALUES (
				${emailToParse.userId},
				${emailToParse.integrationId},
				${emailToParse.gmailMessage.id},
				${emailToParse.gmailMessage.threadId},
				${emailToParse.gmailMessage.subject || null},
				${emailToParse.gmailMessage.from || null},
				${emailToParse.gmailMessage.date ? new Date(emailToParse.gmailMessage.date).toISOString() : null},
				${emailToParse.gmailMessage.snippet || null},
				${emailToParse.gmailMessage.bodyText || null},
				${reason},
				${retryCount}
			)
			ON CONFLICT (user_id, email_id) DO UPDATE SET
				failure_reason = EXCLUDED.failure_reason,
				failure_count = EXCLUDED.failure_count,
				failed_at = NOW()
		`;
		console.log(`[queue-consumer] 📝 Saved failed email to failed_email_reviews: ${emailToParse.gmailMessage.id}`);
	} catch (error: any) {
		console.error(`[queue-consumer] Failed to save failed email: ${error.message}`);
	}
}

async function updateEmailAnalyzedCount(db: postgres.Sql, userId: string): Promise<void> {
	try {
		await db`
			UPDATE public.user_email_integrations
			SET last_sync_summary = 
				CASE 
					WHEN last_sync_summary IS NULL THEN jsonb_build_object('emails_analyzed', 1)
					ELSE jsonb_set(
						last_sync_summary, 
						'{emails_analyzed}', 
						to_jsonb(COALESCE((last_sync_summary->>'emails_analyzed')::int, 0) + 1)
					)
				END
			WHERE user_id = ${userId} AND provider = 'gmail' AND sync_status = 'active'
		`;
	} catch (error: any) {
		console.warn(`[queue-consumer] Failed to update emails_analyzed count: ${error.message}`);
	}
}

async function updateSyncSummary(db: postgres.Sql, userId: string, wasNewApplication: boolean): Promise<void> {
	try {
		if (wasNewApplication) {
			await db`
				UPDATE public.user_email_integrations
				SET last_sync_summary = 
					CASE 
						WHEN last_sync_summary IS NULL THEN jsonb_build_object('applications_found', 1, 'emails_analyzed', 1)
						ELSE jsonb_set(
							jsonb_set(
								last_sync_summary, 
								'{applications_found}', 
								to_jsonb(COALESCE((last_sync_summary->>'applications_found')::int, 0) + 1)
							),
							'{emails_analyzed}',
							to_jsonb(COALESCE((last_sync_summary->>'emails_analyzed')::int, 0) + 1)
						)
					END
				WHERE user_id = ${userId} AND provider = 'gmail' AND sync_status = 'active'
			`;
		} else {
			await updateEmailAnalyzedCount(db, userId);
		}
	} catch (error: any) {
		console.warn(`[queue-consumer] Failed to update sync summary: ${error.message}`);
	}
}

export async function handleEmailParseQueueBatch(
	batch: MessageBatch<QueueMessage>,
	env: QueueConsumerEnv,
	ctx: ExecutionContext,
): Promise<void> {
	console.log(`[queue-consumer] Queue consumer invoked for queue: ${batch.queue}. Batch size: ${batch.messages.length}`);

	if (!env.AI) {
		console.error('[queue-consumer] AI binding not available. Retrying all messages in batch.');
		batch.messages.forEach((msg) => msg.retry());
		return;
	}

	// Sort messages by date (newest first) to prioritize recent emails for faster user feedback
	const sortedMessages = [...batch.messages].sort((a, b) => {
		const aEmail = a.body as EmailToParse;
		const bEmail = b.body as EmailToParse;

		// Extract dates for comparison
		const aDate = aEmail.gmailMessage?.date ? new Date(aEmail.gmailMessage.date).getTime() : 0;
		const bDate = bEmail.gmailMessage?.date ? new Date(bEmail.gmailMessage.date).getTime() : 0;

		return bDate - aDate; // Newest first
	});

	console.log(`[queue-consumer] Processing ${sortedMessages.length} messages in chronological order (newest first)`);

	const rawConnectionString = env.HYPERDRIVE_SUPABASE.connectionString;
	let connectionString = rawConnectionString;
	if (connectionString.includes('.hyperdrive.local') && env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE) {
		console.log('[queue-consumer] Detected local Hyperdrive hostname. Switching to local connection string override.');
		connectionString = env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE;
	}
	const db = getHyperdriveNonPooled(connectionString);

	for (const message of sortedMessages) {
		console.log(`[queue-consumer] Processing message ID: ${message.id}`);
		const queueMessage: QueueMessage = message.body;

		try {
			// Handle force sync messages
			if ('type' in queueMessage && queueMessage.type === 'force_sync') {
				console.log(
					`[queue-consumer] Processing force sync request for user ${queueMessage.userId}, integration ${queueMessage.integrationId}`,
				);

				try {
					// Initialize crypto key
					const cryptoKey = await getKeyMaterial(env.TOKEN_ENCRYPTION_KEY);

					// Initialize TokenRepository
					const backendType = env.TOKEN_BACKEND || 'supabase';
					let tokenRepository: TokenRepository;

					if (backendType === 'kv') {
						if (!env.TOKEN_KV) {
							console.error("[queue-consumer] TOKEN_BACKEND is 'kv' but TOKEN_KV binding is not available for force sync.");
							message.retry();
							continue;
						}
						tokenRepository = new KvTokenRepository(env.TOKEN_KV);
					} else {
						tokenRepository = new SupabaseTokenRepository(db);
					}

					// Fetch the integration from database
					const integrations = await db`
						SELECT id, user_id, email_address, provider, access_token_encrypted, 
							   refresh_token_encrypted, access_token_expires_at, scopes, 
							   sync_status, last_history_id, last_history_synced_at
						FROM public.user_email_integrations
						WHERE id = ${queueMessage.integrationId} 
						AND user_id = ${queueMessage.userId}
						AND provider = 'gmail'
						AND sync_status = 'active'
						LIMIT 1
					`;

					if (!integrations || integrations.length === 0) {
						console.error(
							`[queue-consumer] Integration ${queueMessage.integrationId} not found or not active for user ${queueMessage.userId}`,
						);
						message.ack(); // Don't retry - integration doesn't exist or isn't active
						continue;
					}

					const integration = integrations[0];
					console.log(`[queue-consumer] Found integration for force sync: ${integration.email_address}`);

					// Convert to the format expected by syncGmailIntegration
					const integrationForSync = {
						id: integration.id,
						user_id: integration.user_id,
						email_address: integration.email_address,
						provider: integration.provider,
						access_token_encrypted: integration.access_token_encrypted,
						refresh_token_encrypted: integration.refresh_token_encrypted,
						access_token_expires_at: integration.access_token_expires_at,
						scopes: integration.scopes,
						sync_status: integration.sync_status,
						last_history_id: integration.last_history_id,
						last_history_synced_at: integration.last_history_synced_at,
					};

					// Create env object compatible with syncGmailIntegration
					const syncEnv = {
						HYPERDRIVE_SUPABASE: env.HYPERDRIVE_SUPABASE,
						TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY,
						GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
						GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
						WORKER_GOOGLE_REDIRECT_URI: env.WORKER_GOOGLE_REDIRECT_URI,
						TOKEN_BACKEND: env.TOKEN_BACKEND,
						TOKEN_KV: env.TOKEN_KV,
						EMAIL_PARSE_QUEUE: env.EMAIL_PARSE_QUEUE,
						WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE:
							env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE,
					};

					// Perform the force sync (will re-fetch emails from Gmail)
					await syncGmailIntegration(integrationForSync, syncEnv, db, cryptoKey, tokenRepository, true);

					// Set rate limit after successful force sync completion (5 minutes from now)
					const rateLimitKey = `sync-rate:${queueMessage.userId}`;
					await env.EMAIL_SYNC_RATE_KV.put(rateLimitKey, new Date().toISOString(), { expirationTtl: 300 });

					console.log(
						`[queue-consumer] Force sync completed successfully for user ${queueMessage.userId}, integration ${queueMessage.integrationId}. Rate limit set for 5 minutes.`,
					);
					message.ack();
				} catch (error: any) {
					console.error(
						`[queue-consumer] Error during force sync for user ${queueMessage.userId}, integration ${queueMessage.integrationId}:`,
						error.message,
					);
					message.retry();
				}
				continue;
			}

			// Handle email parsing messages with retry limits and failed email tracking
			const emailToParse = queueMessage as EmailToParse;
			const maxRetries = 3;
			const retryCount = message.attempts || 1;

			if (retryCount > maxRetries) {
				console.error(
					`[queue-consumer] ❌ Max retries (${maxRetries}) exceeded for message ${message.id}. Saving to failed_email_reviews.`,
				);
				await saveFailedEmail(db, emailToParse, `Max retries exceeded after ${retryCount} attempts`, retryCount);
				message.ack(); // Remove from queue
				continue;
			}

			// 1. Classification step with error handling
			let classificationResult;
			try {
				classificationResult = await rateLimitedAICall(() => classifyEmail(emailToParse, env.AI));
			} catch (error: any) {
				console.error(`[queue-consumer] ❌ Classification error for message ${message.id}:`, error.message);
				if (retryCount >= maxRetries) {
					await saveFailedEmail(db, emailToParse, `AI classification failed: ${error.message}`, retryCount);
					message.ack();
				} else {
					message.retry();
				}
				continue;
			}

			if (!classificationResult) {
				console.error(`[queue-consumer] ❌ Classification returned null for message ${message.id}`);
				if (retryCount >= maxRetries) {
					await saveFailedEmail(db, emailToParse, 'AI classification returned null result', retryCount);
					message.ack();
				} else {
					message.retry();
				}
				continue;
			}

			console.log(`[queue-consumer] 🔍 Classification result for message ${message.id}:`, classificationResult);

			if (!classificationResult.isJobApplicationRelated) {
				console.log(
					`[queue-consumer] ⏭️ Skipping non-job email (reason: ${classificationResult.reasoning || 'N/A'}). Message ID: ${message.id}`,
				);
				await updateEmailAnalyzedCount(db, emailToParse.userId);
				message.ack();
				continue;
			}

			console.log(`[queue-consumer] ✅ Email classified as job-related. Proceeding to extraction. Message ID: ${message.id}`);

			// 2. Extraction step with error handling
			let extractedData;
			try {
				extractedData = await rateLimitedAICall(() => extractEmailData(emailToParse, env.AI));
			} catch (error: any) {
				console.error(`[queue-consumer] ❌ Extraction error for message ${message.id}:`, error.message);
				if (retryCount >= maxRetries) {
					await saveFailedEmail(db, emailToParse, `AI extraction failed: ${error.message}`, retryCount);
					message.ack();
				} else {
					message.retry();
				}
				continue;
			}

			if (!extractedData) {
				console.error(`[queue-consumer] ❌ Extraction returned null for message ${message.id}`);
				if (retryCount >= maxRetries) {
					await saveFailedEmail(db, emailToParse, 'AI extraction returned null result', retryCount);
					message.ack();
				} else {
					message.retry();
				}
				continue;
			}

			if (!extractedData.companyName) {
				console.error(`[queue-consumer] ❌ Missing company name from extraction for message ${message.id}`);
				if (retryCount >= maxRetries) {
					await saveFailedEmail(db, emailToParse, 'AI extraction missing required company name', retryCount);
					message.ack();
				} else {
					message.retry();
				}
				continue;
			}

			console.log(`[queue-consumer] 📊 Extraction result for message ${message.id}:`, extractedData);

			// 3. Create application with error handling (primary workflow)
			const userId = emailToParse.userId;
			const emailDate = emailToParse.gmailMessage.date ? new Date(emailToParse.gmailMessage.date) : new Date();
			const applicationDateString = emailDate.toISOString().split('T')[0]; // Date only for application_date
			const appliedAtTimestamp = emailDate.toISOString(); // Full timestamp for applied_at

			try {
				const result = await db`
					INSERT INTO public.applications (
						user_id, company_name, role, status, application_date, applied_at,
						source_email_id, source_thread_id
					)
					VALUES (
						${userId}, 
						${extractedData.companyName}, 
						${extractedData.jobTitle ?? 'Unknown Role'},
						${extractedData.status ?? 'Applied'},
						${applicationDateString}::date,
						${appliedAtTimestamp}::timestamptz,
						${emailToParse.gmailMessage.id},
						${emailToParse.gmailMessage.threadId}
					)
					ON CONFLICT (user_id, dedupe_key) DO UPDATE
					SET
						role = COALESCE(EXCLUDED.role, public.applications.role),
						status = EXCLUDED.status,
						applied_at = EXCLUDED.applied_at,
						source_email_id = EXCLUDED.source_email_id,
						source_thread_id = EXCLUDED.source_thread_id,
						updated_at = NOW()
					RETURNING *, 
						CASE WHEN xmax = 0 THEN 'INSERT' ELSE 'UPDATE' END as operation_type;
				`;

				if (result && result.count > 0 && result[0]) {
					const savedApplication = result[0] as any;
					const wasNewApplication = savedApplication.operation_type === 'INSERT';

					console.log(
						`[queue-consumer] ✅ Application ${wasNewApplication ? 'created' : 'updated'} for message ${message.id}. App ID: ${savedApplication.id}`,
					);

					// Create AI suggestion for both new applications and status updates
					const shouldCreateSuggestion =
						(wasNewApplication && extractedData.status === 'Applied') || // New applications
						(!wasNewApplication && extractedData.status && extractedData.status !== 'Applied'); // Status updates

					console.log(
						`[queue-consumer] 🔍 Suggestion creation check: wasNew=${wasNewApplication}, status="${extractedData.status}", shouldCreate=${shouldCreateSuggestion}`,
					);

					if (shouldCreateSuggestion) {
						try {
							const suggestionType = wasNewApplication ? 'new_application_detected' : 'application_status_update';

							await db`
								INSERT INTO public.ai_suggestions (
									user_id, 
									suggested_company_name, 
									suggested_role, 
									suggested_status,
									suggestion_type,
									suggestion_lifecycle_status,
									related_application_id,
									raw_email_data,
									suggestion_details,
									created_at
								)
								VALUES (
									${userId}, 
									${extractedData.companyName}, 
									${extractedData.jobTitle ?? 'Unknown Role'},
									${extractedData.status ?? 'Applied'},
									${suggestionType},
									'Pending',
									${savedApplication.id},
									${db.json({
										email_id: emailToParse.gmailMessage.id,
										email_thread_id: emailToParse.gmailMessage.threadId,
										email_subject: emailToParse.gmailMessage.subject,
										email_from: emailToParse.gmailMessage.from,
										email_date: emailToParse.gmailMessage.date,
										email_snippet: emailToParse.gmailMessage.snippet,
									})},
									${db.json({
										extracted_data: extractedData,
										previous_status: wasNewApplication ? null : savedApplication.status,
										suggested_status: extractedData.status,
										application_date: applicationDateString,
									})},
									NOW()
								)
								ON CONFLICT (related_application_id, suggestion_type, suggested_status) DO NOTHING;
							`;
							console.log(
								`[queue-consumer] 💡 Created AI suggestion for ${wasNewApplication ? 'new application' : 'status update'}: ${extractedData.status}`,
							);
						} catch (suggestionError: any) {
							console.warn(`[queue-consumer] Failed to create AI suggestion: ${suggestionError.message}`);
							// Don't fail the whole process if suggestion creation fails
						}
					} else {
						console.log(`[queue-consumer] ⏭️ Skipping suggestion creation (doesn't meet criteria)`);
					}

					await updateSyncSummary(db, userId, wasNewApplication);
					message.ack();
				} else {
					throw new Error('Database insert returned no results');
				}
			} catch (dbError: any) {
				console.error(`[queue-consumer] ❌ Database error for message ${message.id}:`, dbError.message);
				if (retryCount >= maxRetries) {
					await saveFailedEmail(db, emailToParse, `Database error: ${dbError.message}`, retryCount);
					message.ack();
				} else {
					message.retry();
				}
			}
		} catch (unexpectedError: any) {
			// Catch-all for any unexpected errors
			console.error(`[queue-consumer] ❌ Unexpected error processing message ${message.id}:`, unexpectedError.message);
			const emailToParse = queueMessage as EmailToParse;
			const retryCount = message.attempts || 1;

			if (retryCount >= 3) {
				await saveFailedEmail(db, emailToParse, `Unexpected error: ${unexpectedError.message}`, retryCount);
				message.ack();
			} else {
				message.retry();
			}
		}
	}

	// After processing all messages in the batch, check if any syncs should be completed
	// This handles cases where all messages failed and went to DLQ
	try {
		console.log(`[queue-consumer] Checking for syncs that should be completed after batch processing`);

		const stuckSyncs = await db`
			SELECT id, user_id, email_address, last_sync_summary
			FROM public.user_email_integrations
			WHERE 
				provider = 'gmail'
				AND sync_status = 'active'
				AND sync_in_progress = TRUE
				AND last_sync_summary->>'status' = 'ai_processing'
				AND (
					-- All emails have been analyzed (processed or failed)
					(
						(last_sync_summary->>'emails_sent_to_queue')::int > 0 
						AND (last_sync_summary->>'emails_analyzed')::int >= (last_sync_summary->>'emails_sent_to_queue')::int
					)
					OR
					-- Or it's been too long since sync started (>3 minutes)
					(
						last_sync_summary->>'last_sync_started_at' IS NOT NULL
						AND (last_sync_summary->>'last_sync_started_at')::timestamp < NOW() - INTERVAL '3 minutes'
					)
				)
		`;

		for (const integration of stuckSyncs) {
			console.log(`[queue-consumer] Completing stuck sync for user ${integration.user_id} (${integration.email_address})`);

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

			console.log(`[queue-consumer] Completed stuck sync for integration ${integration.id}`);
		}

		if (stuckSyncs.length > 0) {
			console.log(`[queue-consumer] Completed ${stuckSyncs.length} stuck syncs`);
		}
	} catch (syncCompletionError: any) {
		console.warn(`[queue-consumer] Error checking for stuck syncs: ${syncCompletionError.message}`);
	}
	ctx.waitUntil(db.end().then(() => console.log('[queue-consumer] Database connection closed after batch.')));
}
