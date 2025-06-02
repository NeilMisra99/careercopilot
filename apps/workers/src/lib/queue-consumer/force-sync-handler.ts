import type postgres from 'postgres';
import type { Message } from '@cloudflare/workers-types';
import type { ForceSyncMessage, QueueMessage } from '../types';
import type { QueueConsumerEnv } from './types';
import { syncGmailIntegration } from '../email-fetcher/sync-engine';
import { getKeyMaterial } from '../crypto';
import { SupabaseTokenRepository } from '../supabase-token-repository';
import { KvTokenRepository } from '../kv-token-repository';
import type { TokenRepository } from '../token-repository';

/**
 * Force Sync Handler
 * Handles force sync requests from the queue
 */

/**
 * Handle force sync message
 */
export async function handleForceSyncMessage(message: Message<QueueMessage>, env: QueueConsumerEnv, db: postgres.Sql): Promise<void> {
	const queueMessage = message.body as ForceSyncMessage;

	console.log(`[queue-consumer] Processing force sync request for user ${queueMessage.userId}, integration ${queueMessage.integrationId}`);

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
				return;
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
			console.error(`[queue-consumer] Integration ${queueMessage.integrationId} not found or not active for user ${queueMessage.userId}`);
			message.ack(); // Don't retry - integration doesn't exist or isn't active
			return;
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
			AI: env.AI as any,
		};

		// Perform the force sync (will re-fetch emails from Gmail)
		await syncGmailIntegration(integrationForSync, syncEnv, db, cryptoKey, tokenRepository, { forceSync: true });

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
}
