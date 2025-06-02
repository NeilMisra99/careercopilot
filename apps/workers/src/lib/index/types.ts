import type { Ai, Hyperdrive, KVNamespace, Queue } from '@cloudflare/workers-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueMessage } from '../types';
import type postgres from 'postgres';
import type { TokenRepository } from '../token-repository';

/**
 * Main environment interface for the worker
 */
export interface Env {
	Bindings: {
		SUPABASE_URL: string; // Still needed for hono/adapter env(c) in middleware
		SUPABASE_ANON_KEY: string; // Still needed for hono/adapter env(c) in middleware
		HYPERDRIVE_SUPABASE: Hyperdrive;
		GOOGLE_CLIENT_ID: string; // Added
		WORKER_GOOGLE_REDIRECT_URI: string; // Added for the worker's own callback
		GOOGLE_CLIENT_SECRET: string; // Added for token exchange
		TOKEN_ENCRYPTION_KEY: string; // Added for encrypting refresh tokens
		APP_BASE_URL: string; // Added for frontend redirects
		TOKEN_KV?: KVNamespace; // ADDED: For KV backend
		TOKEN_BACKEND?: 'supabase' | 'kv'; // ADDED: To choose backend
		EMAIL_PARSE_QUEUE: Queue<QueueMessage>; // Producer binding, already present from email-fetcher setup but good to have it here too for clarity
		AI?: Ai; // ADDED: Workers AI binding
		SUPABASE_SERVICE_ROLE_KEY?: string; // ADDED: For when queue consumer needs admin client
		EMAIL_SYNC_RATE_KV: KVNamespace; // ADDED: For rate limiting sync requests
		BROWSER: Fetcher; // ADDED: Browser Rendering API binding
		SCRAPING_CACHE_KV: KVNamespace; // ADDED: For caching scraping results
	};
	Variables: {
		supabase: SupabaseClient; // Set by supabaseMiddleware
		db?: postgres.Sql; // Set by Hyperdrive middleware in index.ts
		tokenRepository: TokenRepository; // ADDED: Injected by new middleware
	};
}

/**
 * Google OAuth token response interface
 */
export interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string; // Optional, as it's not always returned
	expires_in: number;
	scope: string;
	token_type: string;
	id_token?: string; // if openid scope was included
	error?: string;
	error_description?: string;
}

/**
 * Google user info response interface
 */
export interface GoogleUserInfoResponse {
	id: string;
	email: string;
	verified_email: boolean;
	name?: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
	locale?: string;
	error?: {
		code: number;
		message: string;
		status: string;
	};
}

/**
 * User email integration interface
 */
export interface UserEmailIntegration {
	id: string;
	user_id: string;
	email_address: string;
	refresh_token_encrypted: string | null;
	access_token_encrypted: string;
	access_token_expires_at: string; // ISO string format
	scopes: string | null;
}

/**
 * Gmail message metadata interface
 */
export interface GmailMessageMetadata {
	id: string;
	threadId: string;
	snippet: string;
	payload: {
		headers: { name: string; value: string }[];
	};
	// Add other fields if needed, like labelIds, historyId, internalDate
}

/**
 * Application update request interface
 */
export interface ApplicationUpdateRequest {
	status?: string;
	notes?: string;
	companyName?: string;
	jobTitle?: string;
	applicationDate?: string;
	jobUrl?: string;
	location?: string;
	salary?: string;
}

/**
 * Application creation request interface
 */
export interface ApplicationCreateRequest {
	companyName: string;
	jobTitle: string;
	status?: string;
	applicationDate?: string;
	jobUrl?: string;
	location?: string;
	salary?: string;
	notes?: string;
}

/**
 * Failed email review interface
 */
export interface FailedEmailReview {
	id: string;
	email_id: string;
	email_thread_id: string;
	email_subject: string;
	email_from: string;
	email_date: string;
	email_snippet: string;
	email_body: string;
	failure_reason: string;
	failure_count: number;
	failed_at: string;
	needs_review: boolean;
	reviewed_at?: string;
}

/**
 * Manual email processing request
 */
export interface ManualEmailProcessRequest {
	emailId: string;
	companyName: string;
	jobTitle?: string;
	status?: string;
	notes?: string;
}

/**
 * Scraping result interface
 */
export interface ScrapingResult {
	success: boolean;
	data?: {
		companyName?: string;
		jobTitle?: string;
		location?: string;
		salary?: string;
	};
	error?: string;
	source?: string;
	cached?: boolean;
	extractionMethod?: string;
}

/**
 * Application source interface
 */
export interface ApplicationSource {
	id: string;
	source_email_id: string;
	source_thread_id: string;
	source_notes: string;
	created_at: string;
	source_type: string;
	is_primary?: boolean;
}

/**
 * Application review action type
 */
export type ApplicationReviewAction = 'approve' | 'delete';

/**
 * Valid application statuses
 */
export const VALID_APPLICATION_STATUSES = [
	'Opportunity',
	'Wishlist',
	'Applied',
	'Screening',
	'Interviewing',
	'Offer',
	'Rejected',
	'Withdrawn',
] as const;

export type ApplicationStatus = (typeof VALID_APPLICATION_STATUSES)[number];
