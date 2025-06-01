import { Context, Next } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env } from '../types';
import { SupabaseTokenRepository } from '../../supabase-token-repository';
import { KvTokenRepository } from '../../kv-token-repository';
import postgres from 'postgres';
import type { TokenRepository } from '../../token-repository';

/**
 * Sets up CORS headers for the response
 */
export function setupCors() {
	return async (c: Context, next: Next) => {
		// Set CORS headers for all requests
		c.res.headers.set('Access-Control-Allow-Origin', '*');
		c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

		// Handle preflight requests
		if (c.req.method === 'OPTIONS') {
			return c.text('', 200);
		}

		await next();
	};
}

/**
 * Sets up pretty JSON formatting for responses
 */
export function setupPrettyJSON() {
	return async (c: Context, next: Next) => {
		await next();
		c.res.headers.set('Content-Type', 'application/json; charset=utf-8');
	};
}

/**
 * Sets up Supabase auth for the context
 */
export function setupSupabaseAuth() {
	return async (c: Context, next: Next) => {
		const supabase = getSupabase(c);
		c.set('supabase', supabase);
		await next();
	};
}

/**
 * Sets up Hyperdrive database connection for the context
 */
export function setupHyperdrive() {
	return async (c: Context, next: Next) => {
		if (!c.env.HYPERDRIVE_SUPABASE) {
			console.error('Hyperdrive binding HYPERDRIVE_SUPABASE not found.');
			return c.json({ error: 'Database not configured' }, 500);
		}
		try {
			// Use Cloudflare-recommended settings for Workers
			const sql = postgres(c.env.HYPERDRIVE_SUPABASE.connectionString, {
				max: 5, // Limit connections due to Workers' limits on concurrent external connections
				fetch_types: false, // Avoid additional round-trip if not using array types
				connect_timeout: 5,
				idle_timeout: 15,
				max_lifetime: 10 * 60,
			});
			c.set('db', sql);
		} catch (err: any) {
			console.error('Failed to connect to Hyperdrive:', err.message);
			return c.json({ error: 'Database connection error', details: err.message }, 500);
		}
		await next();
	};
}

/**
 * Sets up the appropriate token repository based on environment configuration
 */
export function setupTokenRepository() {
	return async (c: Context<Env>, next: Next) => {
		try {
			const backend = c.env.TOKEN_BACKEND || 'supabase';
			console.log(`Using ${backend.toUpperCase()} for token storage.`);

			let tokenRepository: TokenRepository;

			if (backend === 'kv') {
				if (!c.env.TOKEN_KV) {
					console.error('TOKEN_BACKEND is set to "kv" but TOKEN_KV binding is not available');
					return c.json({ error: 'Token storage (KV) not configured.' }, 500);
				}
				tokenRepository = new KvTokenRepository(c.env.TOKEN_KV);
				console.log('Using KvTokenRepository for token storage.');
			} else {
				// Default to Supabase
				const db = c.var.db;
				if (!db) {
					console.error('TOKEN_BACKEND is set to "supabase" but database is not available');
					return c.json({ error: 'Token storage (DB) not configured.' }, 500);
				}
				tokenRepository = new SupabaseTokenRepository(db);
				console.log('Using SupabaseTokenRepository for token storage.');
			}

			c.set('tokenRepository', tokenRepository);
			await next();
		} catch (error: any) {
			console.error('Failed to setup token repository:', error.message);
			return c.json({ error: 'Token repository setup failed', details: error.message }, 500);
		}
	};
}
