/**
 * Queue Consumer Module
 * Main exports for the refactored queue consumer functionality
 */

// Main batch processor
export { handleEmailParseQueueBatch } from './batch-processor';

// Types and interfaces
export type { QueueConsumerEnv, EmailData, SavedApplication, ApplicationFromDB, ProcessingOptions, StuckSync } from './types';

// Constants
export { AI_RATE_LIMIT_PER_MINUTE, AI_CALL_DELAY_MS, MAX_RETRIES, STATUS_PRIORITY } from './types';

// AI utilities
export {
	rateLimitedAICall,
	shouldUpdateApplicationStatus,
	createComprehensiveAIReasoning,
	updateAIReasoningForExistingApplication,
} from './ai-utils';

// Content utilities
export { cleanHtmlContent } from './content-utils';

// Database operations
export {
	saveFailedEmail,
	updateEmailAnalyzedCount,
	updateSyncSummary,
	addEmailSourceToApplication,
	getExistingApplications,
	checkAndCompleteStuckSyncs,
} from './database';

// Duplicate handling
export { checkAndHandleDuplicates, handleAIFirstDuplicates } from './duplicate-handler';

// Application processing
export {
	createNewApplication,
	upsertApplication,
	processRegularEmail,
	processAIFirstEmail,
	handleConstraintViolation,
} from './application-processor';

// Force sync handling
export { handleForceSyncMessage } from './force-sync-handler';
