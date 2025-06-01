import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

// Global connection cache to prevent recreating connections
const connectionCache = new Map<string, postgres.Sql>();

// Function to get a Supabase client, configured for server-side/admin tasks
export function getSupabaseClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

// Function to get a direct Hyperdrive connection (non-pooled for typical cron usage)
export function getHyperdriveNonPooled(connectionString: string): postgres.Sql {
	if (!connectionString) {
		throw new Error('Hyperdrive connection string is undefined or empty.');
	}

	const options: postgres.Options<Record<string, postgres.PostgresType>> = {
		max: 5, // Cloudflare Workers limit on concurrent external connections
		fetch_types: false, // Avoid additional round-trip if not using array types
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

	console.log('Creating non-pooled Hyperdrive connection with Cloudflare-recommended options:', {
		max: options.max,
		fetch_types: options.fetch_types,
		connect_timeout: options.connect_timeout,
	});
	return postgres(connectionString, options);
}
