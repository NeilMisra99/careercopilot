import type { Context } from 'hono';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { getSupabase } from '../../../middleware/auth.middleware';
import { getKeyMaterial, encryptToken, decryptToken } from '../../crypto';
import emailFetcher from '../../../email-fetcher';
import type { Env } from '../types';

/**
 * Debug encryption test endpoint
 */
export async function testEncryption(c: Context<Env>) {
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
}

/**
 * Development-only manual sync trigger
 */
export async function triggerManualSync(c: Context<Env>) {
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
}

/**
 * Simple health check
 */
export async function healthCheck(c: Context<Env>) {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
}

/**
 * Get current user info
 */
export async function getCurrentUser(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		return c.json({ error: 'Not authenticated', details: error?.message }, 401);
	}
	return c.json({ id: user.id, email: user.email, created_at: user.created_at });
}

/**
 * Simple hello endpoint for testing Next.js app integration
 */
export async function sayHello(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		return c.json({ error: 'Not authenticated or user data not available', details: error?.message }, 401);
	}
	return c.json({ message: `Hello, ${user.email}! This message is from your Cloudflare Worker.` });
}
