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
		connect_timeout: 5, // 5 seconds, as per recommendation
		idle_timeout: 15, // 15 seconds (converted from 15_000 ms in recommendation)
		max_lifetime: 10 * 60, // 10 minutes (converted from 10 * 60_000 ms)
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

	// console.log("Creating non-pooled Hyperdrive connection for worker with options:", options);
	return postgres(connectionString, options);
}
