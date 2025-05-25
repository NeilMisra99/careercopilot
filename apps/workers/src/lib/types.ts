// apps/workers/src/lib/types.ts

// Data structure for Gmail messages, focused on what the fetcher retrieves
export interface GmailMessageData {
	id: string;
	threadId: string;
	historyId: string; // historyId of the message itself
	snippet?: string;
	subject?: string;
	from?: string;
	date?: string; // Consider storing as ISO string or epoch
	bodyHtml?: string | null;
	bodyText?: string | null;
	// raw?: string; // Consider if full raw content is needed or specific parts
	// bodyHtml?: string;
	// bodyText?: string;
}

// Payload for the EMAIL_PARSE_QUEUE
export interface EmailToParse {
	userId: string;
	integrationId: string; // ID of the user_email_integrations record
	emailProvider: 'gmail'; // Or other providers later
	gmailMessage: GmailMessageData;
}

// Force sync message for manual sync requests
export interface ForceSyncMessage {
	type: 'force_sync';
	userId: string;
	integrationId: string;
	requestedAt: string; // ISO timestamp
}

// Union type for all queue message types
export type QueueMessage = EmailToParse | ForceSyncMessage;

// === AI Parsing & Suggestion Types ===

/**
 * Represents the type of suggestion the AI is making.
 */
export type AISuggestionType =
	| 'new_application_detected' // Email suggests a new job application was sent/confirmed
	| 'application_status_update' // Email suggests a change in an existing application's status (e.g., rejection, interview)
	| 'interview_schedule' // Email specifically about an interview being scheduled
	| 'meeting_schedule' // General meeting related to job search
	| 'offer_extended' // Email suggests a job offer
	| 'other_job_search_communication'; // Other relevant communication that doesn't fit above

/**
 * Potential statuses an application can have, derived from AI parsing.
 */
export type AIParsedApplicationStatus =
	| 'Applied'
	| 'Screening'
	| 'Interviewing'
	| 'Offer Extended'
	| 'Offer Accepted'
	| 'Offer Declined'
	| 'Rejected'
	| 'Withdrawn'
	| 'On Hold';

/**
 * Structure of the data we expect the AI to extract from an email.
 * This will be the primary content of an AISuggestion.
 */
export interface AIParsedData {
	companyName?: string | null;
	jobTitle?: string | null;
	applicationDate?: string | null; // ISO 8601 date string (e.g., "2024-05-20")
	status?: AIParsedApplicationStatus | null;
	extractedSalary?: string | null; // e.g., "$120,000 - $140,000 per year", "£60k"
	location?: string | null; // e.g., "Remote", "San Francisco, CA"
	jobPostingUrl?: string | null;
	interviewDate?: string | null; // ISO 8601 datetime string if specific time, else date string
	interviewType?: string | null; // e.g., "Phone Screen", "Technical Interview", "On-site"
	contactName?: string | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	notes?: string | null; // Any other relevant details extracted by AI
	sourceEmailId?: string; // Gmail message ID (from EmailToParse.gmailMessage.id)
	sourceThreadId?: string; // Gmail thread ID
}

/**
 * Represents an AI-generated suggestion to be stored in Supabase and shown to the user.
 */
export interface AISuggestion {
	userId: string; // From EmailToParse.userId
	integrationId: string; // From EmailToParse.integrationId
	suggestionType: AISuggestionType;
	parsedData: AIParsedData; // The core structured information extracted
	originalEmailSnippet: string; // Snippet of the source email for context
	confidenceScore?: number | null; // Optional: AI's confidence in this suggestion (0.0 - 1.0)
	requiresUserConfirmation: boolean; // Usually true for new applications/major status changes
	// Supabase columns (auto-generated or managed by DB):
	// id: string (uuid)
	// created_at: string (timestamptz)
	// updated_at: string (timestamptz)
	// related_application_id: string (uuid) | null - To link if it's an update
	// status: 'pending' | 'confirmed' | 'dismissed' - Lifecycle of the suggestion itself
}

// Add other shared types here as needed, for example, for AI parsing results etc.
