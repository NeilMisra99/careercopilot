import type { ExecutionContext, MessageBatch, Message } from '@cloudflare/workers-types';
import type { QueueMessage, EmailToParse } from '../types';
import type { QueueConsumerEnv } from './types';
import { MAX_RETRIES } from './types';
import { getHyperdriveNonPooled } from '../supabase';
import { classifyEmail } from '../ai-classifier';
import { extractEmailData } from '../ai-extractor';
import { calculateAIConfidence, shouldAutoApprove } from '../ai-confidence';
import { rateLimitedAICall } from './ai-utils';
import { saveFailedEmail, updateEmailAnalyzedCount, updateSyncSummary, checkAndCompleteStuckSyncs } from './database';
import { handleForceSyncMessage } from './force-sync-handler';
import { processRegularEmail, processAIFirstEmail, handleConstraintViolation } from './application-processor';
import postgres from 'postgres';

/**
 * Main Batch Processor
 * Handles processing of queue message batches
 */

/**
 * Sort messages by date (newest first) to prioritize recent emails for faster user feedback
 */
function sortMessagesByDate(messages: readonly Message<QueueMessage>[]): Message<QueueMessage>[] {
	return [...messages].sort((a, b) => {
		const aEmail = a.body as EmailToParse;
		const bEmail = b.body as EmailToParse;

		// Extract dates for comparison
		const aDate = aEmail.gmailMessage?.date ? new Date(aEmail.gmailMessage.date).getTime() : 0;
		const bDate = bEmail.gmailMessage?.date ? new Date(bEmail.gmailMessage.date).getTime() : 0;

		return bDate - aDate; // Newest first
	});
}

/**
 * Initialize database connection with hyperdrive support
 */
function initializeDatabase(env: QueueConsumerEnv) {
	const rawConnectionString = env.HYPERDRIVE_SUPABASE.connectionString;
	let connectionString = rawConnectionString;

	if (connectionString.includes('.hyperdrive.local') && env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE) {
		console.log('[queue-consumer] Detected local Hyperdrive hostname. Switching to local connection string override.');
		connectionString = env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE;
	}

	return getHyperdriveNonPooled(connectionString);
}

/**
 * Process a single force sync message
 */
async function processForceSyncMessage(message: Message<QueueMessage>, env: QueueConsumerEnv, db: any): Promise<void> {
	await handleForceSyncMessage(message, env, db);
}

/**
 * Process a single AI-first processed email message
 */
async function processAIFirstMessage(message: Message<QueueMessage>, env: QueueConsumerEnv, db: any): Promise<void> {
	const queueMessage = message.body as any; // Cast to any to access AI-first specific properties

	console.log(
		`[queue-consumer] 🚀 Processing AI-first processed email for user ${queueMessage.userId}, email ${queueMessage.emailMetadata.id}`,
	);

	try {
		const { aiResult, classificationResult } = queueMessage;

		if (!aiResult || !classificationResult.isJobApplicationRelated) {
			console.log(`[queue-consumer] 📧 Skipping non-job-related email ${queueMessage.emailMetadata.id}`);
			await updateEmailAnalyzedCount(db, queueMessage.userId);
			message.ack();
			return;
		}

		const { applicationId, wasNewApplication } = await processAIFirstEmail(db, queueMessage, env.AI);

		console.log(
			`[queue-consumer] ✅ AI-first application ${wasNewApplication ? 'created' : 'updated'}: ${applicationId} for email ${queueMessage.emailMetadata.id}`,
		);
		await updateSyncSummary(db, queueMessage.userId, wasNewApplication);
		await updateEmailAnalyzedCount(db, queueMessage.userId);
		message.ack();
	} catch (error: any) {
		console.error(`[queue-consumer] ❌ Error processing AI-first email ${queueMessage.emailMetadata.id}:`, error.message);
		message.retry();
	}
}

/**
 * Process a single regular email parsing message
 */
async function processRegularEmailMessage(message: Message<QueueMessage>, env: QueueConsumerEnv, db: any): Promise<void> {
	const emailToParse = message.body as EmailToParse;
	const maxRetries = MAX_RETRIES;
	const retryCount = message.attempts || 1;

	// Safety check: Ensure gmailMessage is properly structured
	if (!emailToParse.gmailMessage || typeof emailToParse.gmailMessage !== 'object') {
		console.error(`[queue-consumer] ❌ Invalid email structure for message ${message.id}: gmailMessage is missing or invalid`);
		await saveFailedEmail(db, emailToParse, 'Invalid email structure: gmailMessage missing', retryCount);
		await updateEmailAnalyzedCount(db, emailToParse.userId);
		message.ack();
		return;
	}

	if (retryCount > maxRetries) {
		console.error(`[queue-consumer] ❌ Max retries (${maxRetries}) exceeded for message ${message.id}. Saving to failed_email_reviews.`);
		await saveFailedEmail(db, emailToParse, `Max retries exceeded after ${retryCount} attempts`, retryCount);
		await updateEmailAnalyzedCount(db, emailToParse.userId);
		message.ack();
		return;
	}

	try {
		// 1. Classification step with error handling
		let classificationResult;
		try {
			classificationResult = await rateLimitedAICall(() => classifyEmail(emailToParse, env.AI));
		} catch (error: any) {
			console.error(`[queue-consumer] ❌ Classification error for message ${message.id}:`, error.message);
			if (retryCount >= maxRetries) {
				await saveFailedEmail(db, emailToParse, `AI classification failed: ${error.message}`, retryCount);
				await updateEmailAnalyzedCount(db, emailToParse.userId);
				message.ack();
			} else {
				message.retry();
			}
			return;
		}

		if (!classificationResult) {
			console.error(`[queue-consumer] ❌ Classification returned null for message ${message.id}`);
			if (retryCount >= maxRetries) {
				await saveFailedEmail(db, emailToParse, 'AI classification returned null result', retryCount);
				await updateEmailAnalyzedCount(db, emailToParse.userId);
				message.ack();
			} else {
				message.retry();
			}
			return;
		}

		console.log(`[queue-consumer] 🔍 Classification result for message ${message.id}:`, classificationResult);

		if (!classificationResult.isJobApplicationRelated) {
			console.log(
				`[queue-consumer] ⏭️ Skipping non-job email (reason: ${classificationResult.reasoning || 'N/A'}). Message ID: ${message.id}`,
			);
			await updateEmailAnalyzedCount(db, emailToParse.userId);
			message.ack();
			return;
		}

		console.log(`[queue-consumer] ✅ Email classified as job-related. Proceeding to extraction. Message ID: ${message.id}`);

		// 2. Extract structured data using AI
		console.log(`[queue-consumer] 🤖 Extracting structured data from email...`);
		const extractedData = await extractEmailData(emailToParse, env.AI);

		if (!extractedData) {
			console.error(`[queue-consumer] ❌ AI data extraction failed for message ${message.id}`);
			await saveFailedEmail(db, emailToParse, 'AI data extraction failed', retryCount);
			await updateEmailAnalyzedCount(db, emailToParse.userId);
			message.retry();
			return;
		}

		console.log(`[queue-consumer] 📊 AI extracted data:`, {
			company: extractedData.companyName,
			role: extractedData.jobTitle,
			status: extractedData.status,
		});

		// 3. Calculate AI confidence using the new system
		console.log(`[queue-consumer] 🧮 Calculating AI confidence...`);
		const confidenceResult = calculateAIConfidence(classificationResult, extractedData, emailToParse);

		console.log(`[queue-consumer] 🎯 AI Confidence Score: ${(confidenceResult.overall * 100).toFixed(1)}%`, {
			overall: confidenceResult.overall,
			factors: confidenceResult.factors,
			reasoning: confidenceResult.reasoning,
		});

		// 4. Process the email to create/update application with calculated confidence
		const { applicationId, wasNewApplication } = await processRegularEmail(
			db,
			emailToParse,
			extractedData,
			classificationResult,
			confidenceResult,
			env.AI,
		);

		// Update sync summary
		await updateSyncSummary(db, emailToParse.userId, wasNewApplication);
		await updateEmailAnalyzedCount(db, emailToParse.userId);

		console.log(`[queue-consumer] ✅ Successfully processed email ${emailToParse.gmailMessage.id}`);
		message.ack();
	} catch (dbError: any) {
		console.error(`[queue-consumer] ❌ Database error for message ${message.id}:`, dbError.message);

		// Handle duplicate key violations gracefully
		if (dbError.message && dbError.message.includes('duplicate key value violates unique constraint')) {
			try {
				const userId = emailToParse.userId;
				const emailDate = emailToParse.gmailMessage.date ? new Date(emailToParse.gmailMessage.date) : new Date();
				const applicationDateString = emailDate.toISOString().split('T')[0];
				const appliedAtTimestamp = emailDate.toISOString();

				// Get the extracted data first
				const extractedData = await extractEmailData(emailToParse, env.AI);
				if (!extractedData) {
					throw new Error('Failed to extract data for constraint violation handling');
				}

				// Get classification result for confidence calculation
				const classificationResult = await classifyEmail(emailToParse, env.AI);
				if (!classificationResult) {
					throw new Error('Failed to classify email for constraint violation handling');
				}

				// Calculate confidence for constraint violation handling
				const confidenceResult = calculateAIConfidence(classificationResult, extractedData, emailToParse);

				const emailData = {
					user_id: userId,
					company_name: extractedData.companyName?.trim() || 'Unknown Company',
					role: extractedData.jobTitle?.trim() || 'Unknown Role',
					status: extractedData.status || 'Applied',
					application_date: applicationDateString,
					email_id: emailToParse.gmailMessage.id,
					email_thread_id: emailToParse.gmailMessage.threadId,
					email_date: appliedAtTimestamp,
					ai_confidence: confidenceResult.overall,
					ai_reasoning: `Constraint violation handling: ${confidenceResult.reasoning}`,
				};

				await handleConstraintViolation(db, emailData, userId, dbError);
				await updateEmailAnalyzedCount(db, userId);
				message.ack();
			} catch (findError: any) {
				console.error(`[queue-consumer] ❌ Error handling duplicate key violation:`, findError.message);
				if (retryCount < maxRetries) {
					console.log(`[queue-consumer] 🔄 Retrying message ${message.id} (attempt ${retryCount + 1}/${maxRetries})`);
					message.retry();
				} else {
					await saveFailedEmail(db, emailToParse, `Database constraint error: ${dbError.message}`, retryCount);
					await updateEmailAnalyzedCount(db, emailToParse.userId);
					message.ack();
				}
			}
		} else {
			// Other database errors
			if (retryCount < maxRetries) {
				console.log(`[queue-consumer] 🔄 Retrying message ${message.id} due to database error (attempt ${retryCount + 1}/${maxRetries})`);
				message.retry();
			} else {
				console.error(`[queue-consumer] ❌ Max retries exceeded for database error. Saving to failed_email_reviews.`);
				await saveFailedEmail(db, emailToParse, `Database error: ${dbError.message}`, retryCount);
				await updateEmailAnalyzedCount(db, emailToParse.userId);
				message.ack();
			}
		}
	}
}

/**
 * Main batch processor function
 */
export async function handleEmailParseQueueBatch(
	batch: MessageBatch<QueueMessage>,
	env: QueueConsumerEnv,
	ctx: ExecutionContext,
): Promise<void> {
	const batchId = `batch-${Date.now()}`;
	const batchSize = batch.messages.length;

	console.log(`[QUEUE:${batchId}] Processing batch with ${batchSize} messages`);

	if (!env.AI) {
		console.error('[queue-consumer] AI binding not available. Retrying all messages in batch.');
		batch.messages.forEach((msg) => msg.retry());
		return;
	}

	// Sort messages by date (newest first) to prioritize recent emails for faster user feedback
	const sortedMessages = sortMessagesByDate(batch.messages);
	console.log(`[queue-consumer] Processing ${sortedMessages.length} messages in chronological order (newest first)`);

	// Initialize database connection
	let db: postgres.Sql;
	try {
		db = initializeDatabase(env);
		console.log(`[QUEUE:${batchId}] Database connection established`);
	} catch (error: any) {
		console.error(`[QUEUE:${batchId}] Failed to initialize database:`, {
			message: error?.message,
			timeout: error?.message?.includes('timeout') || error?.code === 'CONNECT_TIMEOUT',
		});
		batch.retryAll();
		return;
	}

	for (const message of sortedMessages) {
		console.log(`[queue-consumer] Processing message ID: ${message.id}`);
		const queueMessage: QueueMessage = message.body;

		try {
			// Handle force sync messages
			if ('type' in queueMessage && queueMessage.type === 'force_sync') {
				await processForceSyncMessage(message, env, db);
				continue;
			}

			// Handle processed email messages (new AI-first architecture)
			if ('type' in queueMessage && queueMessage.type === 'processed_email') {
				await processAIFirstMessage(message, env, db);
				continue;
			}

			// Handle email parsing messages with retry limits and failed email tracking
			// Extra safety check: Skip AI-first messages that somehow reached this point
			if ('type' in queueMessage) {
				console.log(`[queue-consumer] ⏭️ Skipping AI-first message that reached regular processing path: ${message.id}`);
				message.ack();
				continue;
			}

			await processRegularEmailMessage(message, env, db);
		} catch (unexpectedError: any) {
			// Catch-all for any unexpected errors
			console.error(`[queue-consumer] ❌ Unexpected error processing message ${message.id}:`, unexpectedError.message);
			const emailToParse = queueMessage as EmailToParse;
			const retryCount = message.attempts || 1;

			if (retryCount >= 3) {
				await saveFailedEmail(db, emailToParse, `Unexpected error: ${unexpectedError.message}`, retryCount);
				await updateEmailAnalyzedCount(db, emailToParse.userId);
				message.ack();
			} else {
				message.retry();
			}
		}
	}

	// After processing all messages in the batch, check if any syncs should be completed
	await checkAndCompleteStuckSyncs(db);

	ctx.waitUntil(db.end().then(() => console.log('[queue-consumer] Database connection closed after batch.')));
}
