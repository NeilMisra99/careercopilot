// apps/workers/src/lib/index/index.ts
// Main exports for the refactored index module

// Type exports
export type {
	Env,
	GoogleTokenResponse,
	GoogleUserInfoResponse,
	GmailMessageMetadata,
	ApplicationUpdateRequest,
	ApplicationCreateRequest,
	ApplicationReviewAction,
} from './types';

// Value exports
export { VALID_APPLICATION_STATUSES } from './types';

// Middleware exports
export { setupCors, setupPrettyJSON, setupSupabaseAuth, setupHyperdrive, setupTokenRepository } from './middleware/setup';

// Gmail route exports
export { getGmailMessages, getFailedEmails, processFailedEmail } from './routes/gmail';

// Application route exports
export {
	getApplicationsPendingReview,
	reviewApplication,
	getApplications,
	updateApplication,
	createApplication,
	getApplicationSources,
} from './routes/applications';

// Company enrichment route exports
export { storeCompanyEnrichment, getCompanyEnrichment, deleteCompanyEnrichment } from './routes/company-enrichment';

// Debug route exports
export { healthCheck, getCurrentUser, sayHello } from './routes/debug';

// Auth utility exports
export { getValidGmailAccessToken } from './auth/utils';

// Job discovery route exports
export {
	getJobDiscoveryJobs,
	updateJobDiscoveryJobStatus,
	getJobDiscoveryRuns,
	saveJobToApplications,
	getJobDiscoveryStats,
	getJobDiscoveryPreferences,
	updateJobDiscoveryPreferences,
	testAutoDiscovery,
	getJSearchQuotaStatus,
	checkJSearchUsageLimits,
} from './routes/job-discovery';

// Interview prep route exports
export {
	getInterviewSessions,
	createInterviewSession,
	getInterviewSessionDetails,
	getCompleteSessionData,
	updateInterviewSession,
	deleteInterviewSession,
	getInterviewQuestions,
	getInterviewBrief,
	getStarStories,
	updateStarStory,
	deleteStarStory,
} from './routes/interview-prep';

// ... rest of the file remains unchanged ...
