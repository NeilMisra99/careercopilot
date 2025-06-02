import type { ExecutionContext, MessageBatch, Hyperdrive, KVNamespace, Queue, Ai } from '@cloudflare/workers-types';
import type { EmailToParse, QueueMessage, ForceSyncMessage } from '../types';
import type { TokenRepository } from '../token-repository';
import { z } from 'zod';
import type postgres from 'postgres';

// === Environment Types ===
export interface QueueConsumerEnv {
	HYPERDRIVE_SUPABASE: Hyperdrive;
	SUPABASE_URL?: string; // If using Supabase client for RPCs/admin tasks
	SUPABASE_SERVICE_ROLE_KEY?: string; // If using Supabase client
	AI: Ai; // Ensure AI binding is explicitly part of this Env for clarity with Vercel SDK
	NODE_ENV?: string; // Environment detection for local development

	// Added for force sync functionality
	TOKEN_ENCRYPTION_KEY: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	WORKER_GOOGLE_REDIRECT_URI: string;
	TOKEN_BACKEND?: 'supabase' | 'kv';
	TOKEN_KV?: KVNamespace;
	EMAIL_PARSE_QUEUE: Queue<QueueMessage>;
	EMAIL_SYNC_RATE_KV: KVNamespace; // For rate limiting force sync requests
}

// === Zod Schemas ===
export const JobEmailClassificationSchema = z.object({
	isJobApplicationRelated: z
		.boolean()
		.describe(
			"True if the email is directly related to a user's specific job application (e.g., confirmation, update, interview request, rejection). False if it's a general job alert, newsletter, promotional email, or not about a specific application the user has made.",
		),
	reasoning: z.string().optional().describe('Brief explanation for the classification decision, especially if false.'),
});

export const AIParsedApplicationStatusEnum = z.enum([
	'Applied',
	'Screening',
	'Interviewing',
	'Offer Extended',
	'Offer Accepted',
	'Offer Declined',
	'Rejected',
	'Withdrawn',
	'On Hold',
]);

export const AIParsedDataSchema = z.object({
	companyName: z.string().nullable().describe('The name of the company mentioned in the application.'),
	jobTitle: z.string().nullable().describe('The job title for the application.'),
	applicationDate: z
		.string()
		.nullable()
		.describe('The date of application (YYYY-MM-DD). Extract from email body if mentioned, otherwise use email date.'),
	status: AIParsedApplicationStatusEnum.nullable().describe('The current status of the job application.'),
	extractedSalary: z.string().nullable().describe("Any salary information mentioned (e.g., '$100k - $120k')."),
	location: z.string().nullable().describe("The job location (e.g., 'Remote', 'San Francisco, CA')."),
	jobPostingUrl: z.string().url().nullable().describe('A direct URL to the job posting, if found.'),
	interviewDate: z
		.string()
		.nullable()
		.describe('The date and time of an interview (ISO 8601 format if possible, e.g., YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DD).'),
	interviewType: z.string().nullable().describe("Type of interview (e.g., 'Phone Screen', 'Technical Interview')."),
	contactName: z.string().nullable().describe('Name of a contact person, if mentioned.'),
	contactEmail: z.string().email().nullable().describe('Email address of a contact person.'),
	contactPhone: z.string().nullable().describe('Phone number of a contact person.'),
	notes: z.string().nullable().describe('Other relevant notes or details from the email.'),
	sourceEmailId: z.string().describe('The ID of the source email message.'), // Will be populated programmatically
	sourceThreadId: z.string().describe('The ID of the source email thread.'), // Will be populated programmatically
});

// === Application Types ===
export interface EmailData {
	user_id: string;
	company_name: string;
	role: string;
	status: string;
	application_date: string;
	email_id: string;
	email_thread_id: string;
	email_date: string;
	ai_confidence: number;
	ai_reasoning: string | Promise<string>;
}

export interface SavedApplication {
	id: string;
	status: string;
	operation_type: 'INSERT' | 'UPDATE';
}

export interface ApplicationFromDB {
	id: string;
	company_name: string;
	role: string;
	status: string;
	application_date: string;
	job_url?: string | null;
	location?: string | null;
	salary_range?: string | null;
	notes?: string | null;
	source_email_id?: string | null;
	source_thread_id?: string | null;
	manual_entry?: boolean;
}

// === Processing Options ===
export interface ProcessingOptions {
	maxRetries?: number;
	retryCount?: number;
}

// === Sync Management Types ===
export interface StuckSync {
	id: string;
	user_id: string;
	email_address: string;
	last_sync_summary: any;
	last_sync_started_at: string;
}

// === Constants ===
export const AI_RATE_LIMIT_PER_MINUTE = 250; // Conservative limit (under 300)
export const AI_CALL_DELAY_MS = Math.ceil(60000 / AI_RATE_LIMIT_PER_MINUTE); // ~240ms between calls
export const MAX_RETRIES = 3;

// === Status Priority Map ===
export const STATUS_PRIORITY: Record<string, number> = {
	Wishlist: 0,
	Applied: 1,
	Screening: 2,
	Interviewing: 3,
	Offer: 4,
	Rejected: 5, // Terminal state
	Withdrawn: 5, // Terminal state
};
