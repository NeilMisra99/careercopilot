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
export function getHyperdriveNonPooled(connectionString: string, env?: any): postgres.Sql {
	if (!connectionString) {
		throw new Error('Hyperdrive connection string is undefined or empty.');
	}

	// Debug logging to see what environment is detected
	console.log(`[getHyperdriveNonPooled] NODE_ENV value: "${env?.NODE_ENV}"`);
	console.log(`[getHyperdriveNonPooled] Environment detection: ${env?.NODE_ENV === 'development' ? 'DEVELOPMENT' : 'PRODUCTION'}`);

	// For local development, use direct local connection to avoid proxy issues
	// Only override if explicitly in development mode
	let actualConnectionString = connectionString;

	if (env?.NODE_ENV === 'development') {
		console.log('[getHyperdriveNonPooled] Development environment detected. Using direct local connection to bypass Hyperdrive proxy.');
		actualConnectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
	} else {
		console.log('[getHyperdriveNonPooled] Production environment detected. Using Hyperdrive connection string.');
	}

	const options: postgres.Options<Record<string, postgres.PostgresType>> = {
		connect_timeout: 10, // Increased to 10 seconds for Hyperdrive
		idle_timeout: 30, // Increased to 30 seconds for better connection reuse
		max_lifetime: 10 * 60, // 10 minutes (converted from 10 * 60_000 ms)
		prepare: false, // Disable prepared statements for Cloudflare Workers/Hyperdrive compatibility
		// SSL options will be set conditionally below
	};

	// Check if the connection string contains SSL mode settings and respect them
	const sslModeDisabled = actualConnectionString.includes('sslmode=disable');
	const isLocalConnection = actualConnectionString.includes('127.0.0.1') || actualConnectionString.includes('localhost');

	if (sslModeDisabled) {
		console.log('[getHyperdriveNonPooled] Connection string has sslmode=disable. SSL disabled.');
		// Don't set SSL options when explicitly disabled
	} else if (isLocalConnection) {
		console.log(
			"[getHyperdriveNonPooled] Local connection string detected. SSL 'require' NOT enforced by client options (will connect plain if server allows).",
		);
		// For local PostgreSQL, SSL is typically not enabled by default
	} else {
		options.ssl = 'require'; // Enforce SSL for remote connections when not explicitly disabled
		console.log("[getHyperdriveNonPooled] Remote connection string detected. Using SSL 'require'.");
	}

	const envType = env?.NODE_ENV === 'development' ? 'local database' : 'remote database via Hyperdrive';
	console.log(`[getHyperdriveNonPooled] Creating connection to: ${envType}`);
	console.log(`[getHyperdriveNonPooled] Connection options:`, {
		connect_timeout: options.connect_timeout,
		idle_timeout: options.idle_timeout,
		ssl: options.ssl || 'not set',
	});

	return postgres(actualConnectionString, options);
}
