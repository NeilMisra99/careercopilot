// Main exports for the email-fetcher module
export { syncGmailIntegration } from './sync-engine';
export { processEmailWithAI } from './ai-processor';
export { getValidGmailAccessToken } from './token-manager';
export { extractBodyParts, fetchAttachment, base64UrlDecode, getEmailHeader } from './gmail-api';

// Type exports
export type {
	ScheduledWorkerEnv,
	UserEmailIntegrationForFetcher,
	GmailApiMessage,
	GmailApiMessagePayloadPart,
	FetchErrorData,
	SyncSummary,
	SyncOptions,
	AIProcessingResult,
} from './types';

// Constants
export {
	GMAIL_API_BASE_URL,
	MAX_RESULTS_PER_PAGE,
	INITIAL_FETCH_MAX_MESSAGES,
	INITIAL_FETCH_MAX_DAYS,
	SYNC_INTERVAL_MINUTES,
} from './types';
