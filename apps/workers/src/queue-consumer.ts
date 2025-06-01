// apps/workers/src/queue-consumer.ts
import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import type { QueueMessage } from './lib/types';
import { handleEmailParseQueueBatch, type QueueConsumerEnv } from './lib/queue-consumer';

/**
 * Queue Consumer Worker
 *
 * Processes email queue messages including:
 * - Regular email parsing and classification
 * - AI-first processed emails
 * - Force sync requests
 *
 * This file serves as the main entry point and delegates all processing
 * to the modular queue-consumer components in ./lib/queue-consumer/
 */

/**
 * Main queue consumer handler
 * Delegates all processing to the modular batch processor
 */
export async function handleQueue(batch: MessageBatch<QueueMessage>, env: QueueConsumerEnv, ctx: ExecutionContext): Promise<void> {
	return await handleEmailParseQueueBatch(batch, env, ctx);
}

// Export the main handler for compatibility
export { handleEmailParseQueueBatch } from './lib/queue-consumer';

// Export types for external usage
export type { QueueConsumerEnv } from './lib/queue-consumer';
