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

// AI-processed email message (new AI-first architecture)
export interface ProcessedEmailMessage {
	type: 'processed_email';
	userId: string;
	integrationId: string;
	emailProvider: 'gmail';
	emailMetadata: {
		id: string;
		threadId: string;
		subject?: string;
		from?: string;
		date?: string;
	};
	aiResult: any; // AI extraction result
	classificationResult: any; // AI classification result
}

// Union type for all queue message types
export type QueueMessage = EmailToParse | ForceSyncMessage | ProcessedEmailMessage;
