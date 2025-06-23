/**
 * Cloudflare Worker for CareerCopilot API endpoints
 *
 * This worker now handles only API routes for the frontend.
 * Background processing has been moved to Trigger.dev.
 */

import { Hono } from 'hono';
import type { Env } from './lib/index/types';

// Import middleware setup functions
import { setupCors, setupPrettyJSON, setupSupabaseAuth, setupHyperdrive, setupTokenRepository } from './lib/index/middleware/setup';

// Import route handlers
import { getGmailMessages, getFailedEmails, processFailedEmail } from './lib/index/routes/gmail';

import {
	getApplicationsPendingReview,
	reviewApplication,
	getApplications,
	updateApplication,
	createApplication,
	getApplicationSources,
} from './lib/index/routes/applications';

import {
	getJobDiscoveryJobs,
	updateJobDiscoveryJobStatus,
	getJobDiscoveryRuns,
	saveJobToApplications,
	getJobDiscoveryStats,
	getJobDiscoveryPreferences,
	updateJobDiscoveryPreferences,
	getJSearchQuotaStatus,
	checkJSearchUsageLimits,
} from './lib/index/routes/job-discovery';

import { storeCompanyEnrichment, getCompanyEnrichment, deleteCompanyEnrichment } from './lib/index/routes/company-enrichment';

import { healthCheck, getCurrentUser, sayHello } from './lib/index/routes/debug';

import { getResumes, getResumeDetails, setPrimaryResume, deleteResume } from './lib/index/routes/resumes';

import {
	getMatches,
	getMatchDetails,
	triggerMatching,
	getMatchStats,
	getRecommendations,
	updateRecommendation,
} from './lib/index/routes/matches';

import {
	getInterviewSessions,
	createInterviewSession,
	getInterviewSessionDetails,
	updateInterviewSession,
	deleteInterviewSession,
	getInterviewQuestions,
	getInterviewBrief,
	getStarStories,
	updateStarStory,
	deleteStarStory,
} from './lib/index/routes/interview-prep';

/**
 * Main Hono application
 */
const app = new Hono<Env>();

// === Middleware Setup ===
app.use('/api/*', setupCors());
app.use(setupPrettyJSON());
app.use('/api/*', setupSupabaseAuth());
app.use('/api/*', setupHyperdrive());
app.use('/api/*', setupTokenRepository());

// === API Routes ===

// Health check (public)
app.get('/api/health', healthCheck);

// === Gmail API Routes ===
app.get('/api/gmail/messages', getGmailMessages);
app.get('/api/gmail/failed-emails', getFailedEmails);
app.post('/api/gmail/process-failed-email', processFailedEmail);

// === Application Management Routes ===
app.get('/api/applications/pending-review', getApplicationsPendingReview);
app.post('/api/applications/:id/review', reviewApplication);
app.get('/api/applications', getApplications);
app.post('/api/applications/:id', updateApplication);
app.post('/api/applications', createApplication);
app.get('/api/applications/:id/sources', getApplicationSources);

// === Company Enrichment Routes ===
app.post('/api/company-enrichment', storeCompanyEnrichment);
app.get('/api/company-enrichment', getCompanyEnrichment);
app.delete('/api/company-enrichment/:id', deleteCompanyEnrichment);

// === Resume Management Routes ===
app.get('/api/resumes', getResumes);
app.get('/api/resumes/:id', getResumeDetails);
app.post('/api/resumes/:id/set-primary', setPrimaryResume);
app.delete('/api/resumes/:id', deleteResume);

// === Job-Resume Matching Routes ===
app.get('/api/matches', getMatches);
app.get('/api/matches/stats', getMatchStats);
app.get('/api/matches/:id', getMatchDetails);
app.post('/api/matches/trigger', triggerMatching);

// === Resume Recommendations Routes ===
app.get('/api/recommendations', getRecommendations);
app.post('/api/recommendations/:id', updateRecommendation);

// === Job Discovery Routes ===
app.get('/api/job-discovery/jobs', getJobDiscoveryJobs);
app.put('/api/job-discovery/jobs/:jobId/status', updateJobDiscoveryJobStatus);
app.get('/api/job-discovery/runs', getJobDiscoveryRuns);
app.post('/api/job-discovery/jobs/:jobId/save', saveJobToApplications);
app.get('/api/job-discovery/stats', getJobDiscoveryStats);

// Phase 1: Job Discovery Preferences
app.get('/api/job-discovery/preferences', getJobDiscoveryPreferences);
app.put('/api/job-discovery/preferences', updateJobDiscoveryPreferences);

// JSearch Quota Management
app.get('/api/job-discovery/jsearch/quota-status', getJSearchQuotaStatus);
app.get('/api/job-discovery/jsearch/usage-limits', checkJSearchUsageLimits);

// === Interview Prep Routes ===
app.get('/api/interview-prep/sessions', getInterviewSessions);
app.post('/api/interview-prep/sessions', createInterviewSession);
app.get('/api/interview-prep/sessions/:sessionId', getInterviewSessionDetails);
app.put('/api/interview-prep/sessions/:sessionId', updateInterviewSession);
app.delete('/api/interview-prep/sessions/:sessionId', deleteInterviewSession);
app.get('/api/interview-prep/sessions/:sessionId/questions', getInterviewQuestions);
app.get('/api/interview-prep/sessions/:sessionId/brief', getInterviewBrief);
app.get('/api/interview-prep/star-stories', getStarStories);
app.put('/api/interview-prep/star-stories/:storyId', updateStarStory);
app.delete('/api/interview-prep/star-stories/:storyId', deleteStarStory);

// === Debug/Development Routes ===
app.get('/api/me', getCurrentUser);
app.get('/api/hello', sayHello);

// === Error Handling ===
app.onError((err, c) => {
	console.error(`Hono Error: ${err}`);
	return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

/**
 * Worker export - only handles HTTP requests now
 * Background processing moved to Trigger.dev
 */
export default {
	fetch: app.fetch,
};
