import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env } from '../types';

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
