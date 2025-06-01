/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Hono } from 'hono';
import type { MessageBatch, ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import type { QueueMessage } from './lib/types';
import { handleEmailParseQueueBatch } from './lib/queue-consumer';
import type { QueueConsumerEnv } from './lib/queue-consumer';
import emailFetcher from './email-fetcher';
import type { Env } from './lib/index/types';

// Import middleware setup functions
import { setupCors, setupPrettyJSON, setupSupabaseAuth, setupHyperdrive, setupTokenRepository } from './lib/index/middleware/setup';

// Import route handlers
import {
	initiateGmailOAuth,
	exchangeGmailOAuthCode,
	getGmailUserInfo,
	getGmailMessages,
	initiateGmailSync,
	getGmailSyncStatus,
	getFailedEmails,
	processFailedEmail,
} from './lib/index/routes/gmail';

import {
	getApplicationsPendingReview,
	reviewApplication,
	getApplications,
	updateApplication,
	createApplication,
	getApplicationSources,
} from './lib/index/routes/applications';

import { handleJobScraping } from './lib/index/routes/scraping';

import { testEncryption, triggerManualSync, healthCheck, getCurrentUser, sayHello } from './lib/index/routes/debug';

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

// === Gmail OAuth Routes ===
app.post('/api/auth/gmail/initiate', initiateGmailOAuth);
app.post('/api/auth/gmail/exchange', exchangeGmailOAuthCode);

// === Gmail API Routes ===
app.get('/api/gmail/user-info', getGmailUserInfo);
app.get('/api/gmail/messages', getGmailMessages);
app.post('/api/gmail/sync-now', initiateGmailSync);
app.get('/api/gmail/sync-status', getGmailSyncStatus);
app.get('/api/gmail/failed-emails', getFailedEmails);
app.post('/api/gmail/process-failed-email', processFailedEmail);

// === Application Management Routes ===
app.get('/api/applications/pending-review', getApplicationsPendingReview);
app.post('/api/applications/:id/review', reviewApplication);
app.get('/api/applications', getApplications);
app.post('/api/applications/:id', updateApplication);
app.post('/api/applications', createApplication);
app.get('/api/applications/:id/sources', getApplicationSources);

// === Web Scraping Routes ===
app.get('/api/job-boards/scrape', handleJobScraping);

// === Debug/Development Routes ===
app.get('/api/debug/test-encryption', testEncryption);
app.post('/api/dev/trigger-sync', triggerManualSync);
app.get('/api/me', getCurrentUser);
app.get('/api/hello', sayHello);

// === Error Handling ===
app.onError((err, c) => {
	console.error(`Hono Error: ${err}`);
	return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

app.notFound((c) => {
	return c.json({ error: 'Not Found', message: `The path ${c.req.url} was not found.` }, 404);
});

// === Worker Handlers ===
export default {
	fetch: app.fetch,

	/**
	 * Queue handler for processing email messages
	 */
	async queue(batch: MessageBatch<QueueMessage>, env: Env['Bindings'], ctx: ExecutionContext): Promise<void> {
		console.log(`Main queue handler in index.ts invoked for queue: ${batch.queue}`);
		console.log('Routing to main email parse queue consumer');
		await handleEmailParseQueueBatch(batch, env as QueueConsumerEnv, ctx);
	},

	/**
	 * Scheduled handler for email fetching cron jobs
	 */
	async scheduled(controller: ScheduledController, env: Env['Bindings'], ctx: ExecutionContext): Promise<void> {
		console.log('Main scheduled handler in index.ts invoked by cron trigger.');
		await emailFetcher.scheduled(controller, env as any, ctx);
	},
};
