import type { ExecutionContext, MessageBatch, Hyperdrive } from '@cloudflare/workers-types';
import type { QueueMessage } from './lib/types';
import { getHyperdriveNonPooled } from './lib/supabase';
import postgres from 'postgres';

interface DLQConsumerEnv {
	HYPERDRIVE_SUPABASE: Hyperdrive;
	NODE_ENV?: string; // Environment detection for local development
}

export async function handleDLQBatch(batch: MessageBatch<QueueMessage>, env: DLQConsumerEnv, ctx: ExecutionContext): Promise<void> {
	console.log(`[dlq-consumer] DLQ consumer invoked. Batch size: ${batch.messages.length}`);

	const connectionString = env.HYPERDRIVE_SUPABASE.connectionString;
	const db = getHyperdriveNonPooled(connectionString, env);
	console.log('DB', db);

	for (const message of batch.messages) {
		const queueMessage: QueueMessage = message.body;

		try {
			// Skip force sync messages in DLQ - they don't need user review
			if ('type' in queueMessage && queueMessage.type === 'force_sync') {
				console.log(`[dlq-consumer] Skipping force sync message in DLQ`);
				message.ack();
				continue;
			}

			// Handle failed email parsing messages
			const emailToParse = queueMessage as any; // DLQ messages should only be EmailToParse type
			const gmailMessage = emailToParse.gmailMessage;

			console.log(`[dlq-consumer] Storing failed email for user review: ${gmailMessage.id}`);

			// Store failed email in database for user review
			await db`
				INSERT INTO public.failed_email_reviews (
					user_id, integration_id, email_id, email_thread_id,
					email_subject, email_from, email_date, email_snippet, email_body,
					failure_reason, failure_count, failed_at, needs_review
				)
				VALUES (
					${emailToParse.userId},
					${emailToParse.integrationId},
					${gmailMessage.id},
					${gmailMessage.threadId},
					${gmailMessage.subject || 'No Subject'},
					${gmailMessage.from || 'Unknown Sender'},
					${gmailMessage.date || new Date().toISOString()},
					${gmailMessage.snippet || ''},
					${gmailMessage.bodyText || ''},
					'AI parsing failed after maximum retries',
					4,
					NOW(),
					TRUE
				)
				ON CONFLICT (user_id, email_id) DO UPDATE SET
					failure_count = EXCLUDED.failure_count,
					failed_at = EXCLUDED.failed_at,
					failure_reason = EXCLUDED.failure_reason,
					needs_review = TRUE
			`;

			console.log(`[dlq-consumer] Stored failed email ${gmailMessage.id} for user ${emailToParse.userId} review`);
			message.ack();
		} catch (error: any) {
			console.error(`[dlq-consumer] Error processing DLQ message:`, error.message);
			// Don't retry DLQ messages - just log and ack
			message.ack();
		}
	}

	ctx.waitUntil(db.end().then(() => console.log('[dlq-consumer] Database connection closed after DLQ batch.')));
}
