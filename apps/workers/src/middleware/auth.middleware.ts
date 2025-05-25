import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Context, MiddlewareHandler } from 'hono';
import { env } from 'hono/adapter';
import { setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';

declare module 'hono' {
	interface ContextVariableMap {
		supabase: SupabaseClient;
	}
}

export const getSupabase = (c: Context) => {
	return c.get('supabase');
};

type SupabaseEnv = {
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
};

export const supabaseMiddleware = (): MiddlewareHandler => {
	return async (c, next) => {
		const supabaseEnv = env<SupabaseEnv>(c);
		const supabaseUrl = supabaseEnv.SUPABASE_URL;
		const supabaseAnonKey = supabaseEnv.SUPABASE_ANON_KEY;

		if (!supabaseUrl) {
			throw new Error('SUPABASE_URL missing!');
		}

		if (!supabaseAnonKey) {
			throw new Error('SUPABASE_ANON_KEY missing!');
		}

		const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
			//   cookieOptions: {
			//     domain: environment === "development" ? "localhost" : ".summations.com",
			//     secure: environment === "development" ? false : true,
			//     sameSite: "lax",
			//     path: "/",
			//     maxAge: 60 * 60 * 24 * 30,
			//   },
			cookies: {
				getAll() {
					const cookieHeader = c.req.header('Cookie') ?? '';
					const cookies = parseCookieHeader(cookieHeader);
					return cookies.map((cookie) => ({
						...cookie,
						value: cookie.value ?? '',
					}));
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value, options }) => {
						setCookie(c, name, value, options as CookieOptions);
					});
				},
			},
		});

		c.set('supabase', supabase);

		await next();
	};
};
