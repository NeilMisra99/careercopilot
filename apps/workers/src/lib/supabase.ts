import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

// Global connection cache to prevent recreating connections
const connectionCache = new Map<string, postgres.Sql>();

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

// Function to get a cached or new Hyperdrive connection
export function getHyperdriveNonPooled(connectionString: string): postgres.Sql {
	if (!connectionString) {
		throw new Error('Hyperdrive connection string is undefined or empty.');
	}

	// Use connection string as cache key
	const cacheKey = connectionString;

	// Return cached connection if it exists and is still alive
	if (connectionCache.has(cacheKey)) {
		const cachedConnection = connectionCache.get(cacheKey)!;
		console.log('[DB] Reusing cached Hyperdrive connection');
		return cachedConnection;
	}

	console.log('[DB] Creating new Hyperdrive connection');

	const options: postgres.Options<Record<string, postgres.PostgresType>> = {
		max: 1, // Reduce to 1 for singleton pattern
		fetch_types: false, // Avoid additional round-trip if not using array types
		prepare: false, // Critical: Disable prepared statements for transaction pooler
		connect_timeout: 15, // Increase timeout for more reliability
		idle_timeout: 30, // Keep connections alive longer
		max_lifetime: 10 * 60, // 10 minutes lifetime
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
		// Remove from cache when disconnected
		connectionCache.delete(cacheKey);
	});

	sql.listen('error', (error: any) => {
		console.error('[DB] Hyperdrive connection error:', {
			message: error?.message || error,
			code: error?.code,
			timeout: error?.message?.includes('timeout') || error?.code === 'CONNECT_TIMEOUT',
		});
		// Remove from cache on error
		connectionCache.delete(cacheKey);
	});

	// Cache the connection
	connectionCache.set(cacheKey, sql);

	return sql;
}
