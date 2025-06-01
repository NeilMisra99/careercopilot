import postgres from 'postgres';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

// Function to get a Supabase client, configured for server-side/admin tasks
export function getSupabaseClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('Supabase URL or Service Role Key is missing for creating admin client.');
	}
	// console.log("Creating Supabase admin client for worker");
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
		global: {
			headers: { 'X-Client-Info': 'trackflow-worker/1.0.0' }, // Identify the client
			// Custom fetch with timeout for Supabase client requests
			fetch: async (url, options = {}) => {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

				const fetchPromise = fetch(url, {
					...options,
					signal: controller.signal,
					cf: { cacheTtl: 0, cacheEverything: false }, // Ensure no caching for API calls via client
				});

				return fetchPromise.finally(() => {
					clearTimeout(timeoutId);
				});
			},
		},
	});
}

// Function to get a direct Hyperdrive connection (non-pooled for typical cron usage)
export function getHyperdriveNonPooled(connectionString: string): postgres.Sql {
	if (!connectionString) {
		throw new Error('Hyperdrive connection string is undefined or empty.');
	}

	const options: postgres.Options<Record<string, postgres.PostgresType>> = {
		max: 3, // Lower for transaction pooler to avoid overwhelming it
		fetch_types: false, // Avoid additional round-trip if not using array types
		prepare: false, // Disable prepared statements for transaction pooler
		connect_timeout: 10, // Slightly longer for pooler connection establishment
		idle_timeout: 20, // Shorter idle timeout for transaction pooler
		max_lifetime: 5 * 60, // Shorter lifetime for transaction pooler (5 minutes)
		// SSL options will be set conditionally below
	};

	// If the connection string does NOT point to a local database, then enforce SSL.
	// Local database connection strings used for Hyperdrive local proxy typically contain 127.0.0.1 or localhost.
	if (!connectionString.includes('127.0.0.1') && !connectionString.includes('localhost')) {
		options.ssl = 'require'; // Enforce SSL for actual Supabase via Hyperdrive or other remote PG
		console.log("[getHyperdriveNonPooled] Non-local connection string detected. Using SSL 'require'.");
	} else {
		console.log(
			"[getHyperdriveNonPooled] Local connection string detected. SSL 'require' NOT enforced by client options (will connect plain if server allows).",
		);
		// For local PostgreSQL (often via Hyperdrive proxy in dev), SSL is typically not enabled by default on the PG server.
		// By not setting options.ssl, postgres.js will attempt a plain connection if the server doesn't force SSL.
	}

	console.log('Creating Hyperdrive connection optimized for Supabase Transaction Pooler:', {
		max: options.max,
		fetch_types: options.fetch_types,
		prepare: options.prepare,
		connect_timeout: options.connect_timeout,
	});

	const sql = postgres(connectionString, options);

	// Add connection event logging for debugging
	sql.listen('connect', () => {
		console.log('[DB] Successfully connected to Hyperdrive');
	});

	sql.listen('disconnect', () => {
		console.log('[DB] Disconnected from Hyperdrive');
	});

	sql.listen('error', (error: any) => {
		console.error('[DB] Hyperdrive connection error:', {
			message: error?.message || error,
			code: error?.code,
			timeout: error?.message?.includes('timeout') || error?.code === 'CONNECT_TIMEOUT',
		});
	});

	return sql;
}
