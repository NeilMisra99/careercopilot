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
	ScrapingResult,
} from './types';

// Value exports
export { VALID_APPLICATION_STATUSES } from './types';

// Middleware exports
export { setupCors, setupPrettyJSON, setupSupabaseAuth, setupHyperdrive, setupTokenRepository } from './middleware/setup';

// Gmail route exports
export {
	initiateGmailOAuth,
	handleGmailOAuthCallback,
	getGmailUserInfo,
	getGmailMessages,
	initiateGmailSync,
	getGmailSyncStatus,
	getFailedEmails,
	processFailedEmail,
} from './routes/gmail';

// Application route exports
export {
	getApplicationsPendingReview,
	reviewApplication,
	getApplications,
	updateApplication,
	createApplication,
	getApplicationSources,
} from './routes/applications';

// Scraping route exports
export { handleJobScraping } from './routes/scraping';

// Debug route exports
export { testEncryption, triggerManualSync, healthCheck, getCurrentUser, sayHello } from './routes/debug';

// Auth utility exports
export {
	getValidGmailAccessToken,
	generateOAuthState,
	setOAuthStateCookie,
	validateOAuthState,
	createAuthorizationUrl,
	exchangeOAuthCode,
	fetchGoogleUserInfo,
} from './auth/utils';

// ... rest of the file remains unchanged ...
