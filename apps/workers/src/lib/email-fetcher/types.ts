import type { Queue } from '@cloudflare/workers-types';
import type postgres from 'postgres';
import type { Ai } from '@cloudflare/workers-types';
import type { TokenRepository } from '../token-repository';
import type { QueueMessage } from '../types';

// === Gmail API Types ===
export interface GmailApiMessagePayloadPart {
	partId: string;
	mimeType: string;
	filename: string;
	headers: { name: string; value: string }[];
	body: {
		attachmentId?: string;
		size: number;
		data?: string; // base64url encoded
	};
	parts?: GmailApiMessagePayloadPart[];
}

export interface GmailApiMessage {
	id: string;
	threadId: string;
	labelIds?: string[];
	snippet?: string;
	historyId: string;
	internalDate?: string; // Unix epoch ms, stringified
	payload?: GmailApiMessagePayloadPart;
	raw?: string; // base64url encoded, if format=RAW
	sizeEstimate?: number;
}

// === Environment Types ===
export interface ScheduledWorkerEnv {
	HYPERDRIVE_SUPABASE: Hyperdrive;
	TOKEN_ENCRYPTION_KEY: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	WORKER_GOOGLE_REDIRECT_URI: string;
	TOKEN_BACKEND?: 'supabase' | 'kv';
	TOKEN_KV?: KVNamespace; // Required if TOKEN_BACKEND is 'kv'
	EMAIL_PARSE_QUEUE: Queue<QueueMessage>;
	AI: Ai; // AI binding for direct email processing

	// Variables that might be set by middleware or context
	db?: postgres.Sql;
	tokenRepository?: TokenRepository;

	// For testing/dev
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_SUPABASE?: string;
}

// === Database Types ===
export interface UserEmailIntegrationForFetcher {
	id: string;
	user_id: string;
	email_address: string;
	provider: string; // e.g., 'gmail'
	access_token_encrypted: string | null;
	refresh_token_encrypted: string | null;
	access_token_expires_at: string | null; // ISO string
	scopes: string[] | null;
	sync_status: 'active' | 'error' | 'disabled' | 'paused';
	last_history_id: string | null; // Gmail history ID is a string representing a large number
	last_history_synced_at: string | null; // ISO string
}

// === Error Types ===
export interface FetchErrorData {
	error?: { message?: string } | string;
	message?: string;
	error_description?: string;
}

// === Sync Types ===
export interface SyncSummary {
	emails_processed: number;
	emails_sent_to_queue: number;
	emails_analyzed: number;
	applications_found: number;
	error: string | null;
	sync_type: 'manual' | 'scheduled';
	status: string;
}

export interface SyncOptions {
	forceSync?: boolean;
	maxMessages?: number;
	maxDays?: number;
}

// === AI Processing Types ===
export interface AIProcessingResult {
	aiResult: any;
	classificationResult: any;
}

// === Constants ===
export const GMAIL_API_BASE_URL = 'https://www.googleapis.com/gmail/v1/users';
export const MAX_RESULTS_PER_PAGE = 100;
export const INITIAL_FETCH_MAX_MESSAGES = 500;
export const INITIAL_FETCH_MAX_DAYS = 30;
export const SYNC_INTERVAL_MINUTES = 4;
