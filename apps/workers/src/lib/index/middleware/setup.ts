import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import postgres from 'postgres';
import { supabaseMiddleware } from '../../../middleware/auth.middleware';
import { KvTokenRepository } from '../../kv-token-repository';
import { SupabaseTokenRepository } from '../../supabase-token-repository';
import type { Env } from '../types';
import type { TokenRepository } from '../../token-repository';
import { getHyperdriveNonPooled } from '../../supabase';

/**
 * Setup CORS middleware
 */
export function setupCors() {
	return cors({
		origin: (origin) => {
			const allowedOrigins = [
				'http://localhost:3000',
				'https://your-nextjs-app.vercel.app', // Replace with your actual Vercel URL
			];
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
 * Setup Hyperdrive database middleware
 */
export function setupHyperdrive() {
	return async (c: Context, next: Next) => {
		if (c.env.HYPERDRIVE_SUPABASE) {
			// Use the singleton connection from our utility function
			const db = getHyperdriveNonPooled(c.env.HYPERDRIVE_SUPABASE.connectionString);
			c.set('db', db);
			console.log('[DB] Hyperdrive middleware setup completed');
		} else {
			console.warn('HYPERDRIVE_SUPABASE binding not available');
		}
		await next();
	};
}

/**
 * Setup token repository middleware
 */
export function setupTokenRepository() {
	return async (c: Context<Env>, next: Next) => {
		const backendType = c.env.TOKEN_BACKEND || 'supabase'; // Default to supabase
		let repository: TokenRepository;

		if (backendType === 'kv') {
			if (!c.env.TOKEN_KV) {
				console.error("TOKEN_BACKEND is set to 'kv' but TOKEN_KV binding is not available.");
				return c.json({ error: 'Token storage (KV) not configured.' }, 500);
			}
			repository = new KvTokenRepository(c.env.TOKEN_KV);
			console.log('Using KvTokenRepository for token storage.');
		} else {
			const db = c.var.db;
			if (!db) {
				console.error("TOKEN_BACKEND is set to 'supabase' but database client (db) is not available.");
				return c.json({ error: 'Token storage (DB) not configured.' }, 500);
			}
			repository = new SupabaseTokenRepository(db);
			console.log('Using SupabaseTokenRepository for token storage.');
		}
		c.set('tokenRepository', repository);
		await next();
	};
}
