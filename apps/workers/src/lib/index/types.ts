import type { Hyperdrive } from '@cloudflare/workers-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type postgres from 'postgres';
import type { TokenRepository } from '../supabase-token-repository';

/**
 * Main environment interface for the worker
 */
export interface Env {
	Bindings: {
		SUPABASE_URL: string; // Still needed for hono/adapter env(c) in middleware
		SUPABASE_ANON_KEY: string; // Still needed for hono/adapter env(c) in middleware
		HYPERDRIVE_SUPABASE: Hyperdrive;
		GOOGLE_CLIENT_ID: string; // Added
		GOOGLE_CLIENT_SECRET: string; // Added for token exchange
		TOKEN_ENCRYPTION_KEY: string; // Added for encrypting refresh tokens
		APP_BASE_URL: string; // Added for frontend redirects

		// 🚀 FEATURE FLAGS for simplified architecture testing
		NODE_ENV?: string; // Environment detection (development, production)
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
