import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { ScheduledWorkerEnv, UserEmailIntegrationForFetcher } from './lib/email-fetcher/types';
import { SYNC_INTERVAL_MINUTES } from './lib/email-fetcher/types';
import { getKeyMaterial } from './lib/crypto';
import { getHyperdriveNonPooled } from './lib/supabase';
import { SupabaseTokenRepository } from './lib/supabase-token-repository';
import { KvTokenRepository } from './lib/kv-token-repository';
import { syncGmailIntegration } from './lib/email-fetcher/sync-engine';

// Export the sync function for use by other modules (like queue-consumer for force sync)
export { syncGmailIntegration } from './lib/email-fetcher/sync-engine';

/**
 * Scheduled worker for syncing Gmail integrations
 * This is the main entry point for the email fetcher cron job
 */
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
                    access_token_encrypted, refresh_token_encrypted, access_token_expires_at,
                    scopes, sync_status, last_history_id, last_history_synced_at
                FROM public.user_email_integrations
                WHERE
                    provider = 'gmail'
                    AND sync_status = 'active'
                    AND (last_history_synced_at IS NULL OR last_history_synced_at < ${syncThreshold})
                ORDER BY last_history_synced_at ASC NULLS FIRST
                LIMIT 100;
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
						first_sync_completed = TRUE,
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
