import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import postgres from 'postgres';
import { supabaseMiddleware } from '../../../middleware/auth.middleware';
import { SupabaseTokenRepository } from '../../supabase-token-repository';
import type { Env } from '../types';
import type { TokenRepository } from '../../supabase-token-repository';

/**
 * Setup CORS middleware
 */
export function setupCors() {
	return cors({
		origin: (origin) => {
			const allowedOrigins = ['http://localhost:3000', 'https://careercopilot-web.vercel.app', `https://careercopilot.app`];
			if (allowedOrigins.includes(origin)) {
				return origin;
			}
			return null;
		},
		allowHeaders: ['Authorization', 'Content-Type'],
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		credentials: true,
	});
}

/**
 * Setup pretty JSON middleware
 */
export function setupPrettyJSON() {
	return prettyJSON();
}

/**
 * Setup Supabase auth middleware
 */
export function setupSupabaseAuth() {
	return supabaseMiddleware();
}

/**
 * OPTIMIZED: Setup Hyperdrive database middleware with latency optimizations
 */
export function setupHyperdrive() {
	return async (c: Context<Env>, next: Next) => {
		if (!c.env.HYPERDRIVE) {
			console.error('Hyperdrive binding HYPERDRIVE not found.');
			return c.json({ error: 'Database not configured' }, 500);
		}
		try {
			// LATENCY OPTIMIZED: Enhanced configuration for faster queries
			const sql = postgres(c.env.HYPERDRIVE.connectionString, {
				prepare: false, // Critical for transaction pooler - prevents prepared statement conflicts
				max: 5, // Increased from 3 - more connections for better concurrency
				connect_timeout: 5, // Reduced from 10 - faster connection timeout
				idle_timeout: 20, // Reduced from 30 - faster cleanup of idle connections
				max_lifetime: 5 * 60, // Reduced from 10 minutes - faster connection cycling
				transform: {
					// PERFORMANCE: Optimize common column transformations
					undefined: null,
				},
				// LATENCY: Add connection-level optimizations
				connection: {
					application_name: 'careercopilot-worker-optimized',
				},
				// PERFORMANCE: Enable connection warming
				onnotice: () => {}, // Suppress notice messages for performance
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
 * 🚀 OPTIMIZED: Supabase Token Repository with enhanced performance
 * Updated to use Supabase for token storage to align with the auth flow that stores tokens in Supabase
 */
export function setupTokenRepository() {
	return async (c: Context<Env>, next: Next) => {
		const db = c.get('db');
		if (!db) {
			console.error('Database connection not available - required for Supabase token storage.');
			return c.json({ error: 'Database not configured for token storage.' }, 500);
		}

		// Use Supabase token repository to match the auth flow and Trigger.dev setup
		const repository: TokenRepository = new SupabaseTokenRepository(db);
		c.set('tokenRepository', repository);

		await next();
	};
}
