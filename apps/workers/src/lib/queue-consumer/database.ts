import type postgres from 'postgres';
import type { EmailToParse } from '../types';
import type { StuckSync } from './types';

/**
 * Database Operations
 * Centralized database operations for queue consumer
 */

/**
 * Save failed email to failed_email_reviews table
 */
export async function saveFailedEmail(db: postgres.Sql, emailToParse: EmailToParse, reason: string, retryCount: number): Promise<void> {
	try {
		// Handle both AI-first structure (emailMetadata) and regular structure (gmailMessage)
		const emailId = emailToParse.gmailMessage?.id || (emailToParse as any).emailMetadata?.id;
		const emailThreadId = emailToParse.gmailMessage?.threadId || (emailToParse as any).emailMetadata?.threadId;
		const emailSubject = emailToParse.gmailMessage?.subject || (emailToParse as any).emailMetadata?.subject;
		const emailFrom = emailToParse.gmailMessage?.from || (emailToParse as any).emailMetadata?.from;
		const emailDate = emailToParse.gmailMessage?.date || (emailToParse as any).emailMetadata?.date;
		const emailSnippet = emailToParse.gmailMessage?.snippet || (emailToParse as any).emailMetadata?.snippet;
		const emailBody = emailToParse.gmailMessage?.bodyText || null;

		if (!emailId) {
			console.error(`[queue-consumer] Cannot save failed email: missing email ID in both gmailMessage and emailMetadata structures`);
			return;
		}

		await db`
			INSERT INTO public.failed_email_reviews (
				user_id, integration_id, email_id, email_thread_id, 
				email_subject, email_from, email_date, email_snippet, email_body,
				failure_reason, failure_count
			)
			VALUES (
				${emailToParse.userId},
				${emailToParse.integrationId},
				${emailId},
				${emailThreadId},
				${emailSubject || null},
				${emailFrom || null},
				${emailDate ? new Date(emailDate).toISOString() : null},
				${emailSnippet || null},
				${emailBody || null},
				${reason},
				${retryCount}
			)
			ON CONFLICT (user_id, email_id) DO UPDATE SET
				failure_reason = EXCLUDED.failure_reason,
				failure_count = EXCLUDED.failure_count,
				failed_at = NOW()
		`;
		console.log(`[queue-consumer] 📝 Saved failed email to failed_email_reviews: ${emailId}`);
	} catch (error: any) {
		console.error(`[queue-consumer] Failed to save failed email: ${error.message}`);
	}
}

/**
 * Update email analyzed count in sync summary - ATOMIC to prevent race conditions
 */
export async function updateEmailAnalyzedCount(db: postgres.Sql, userId: string): Promise<void> {
	try {
		// Use atomic JSON increment with proper isolation to prevent race conditions
		const result = await db`
			UPDATE public.user_email_integrations
			SET last_sync_summary = 
				CASE 
					WHEN last_sync_summary IS NULL THEN 
						jsonb_build_object('emails_analyzed', 1)
					ELSE 
						last_sync_summary || jsonb_build_object(
							'emails_analyzed', 
							COALESCE((last_sync_summary->>'emails_analyzed')::int, 0) + 1
						)
				END
			WHERE user_id = ${userId} 
				AND provider = 'gmail' 
				AND sync_status = 'active'
			RETURNING id, (last_sync_summary->>'emails_analyzed')::int as new_count
		`;

		if (result.length > 0) {
			console.log(`[queue-consumer] ✅ Atomically incremented emails_analyzed for user ${userId} to ${result[0].new_count}`);
		}
	} catch (error: any) {
		console.warn(`[queue-consumer] Failed to update emails_analyzed count: ${error.message}`);
	}
}

/**
 * Update sync summary with application found status - ATOMIC to prevent race conditions
 */
export async function updateSyncSummary(db: postgres.Sql, userId: string, wasNewApplication: boolean): Promise<void> {
	console.log(`[database.ts] 🔍 updateSyncSummary called - userId: ${userId}, wasNewApplication: ${wasNewApplication}`);

	try {
		if (wasNewApplication) {
			console.log(`[database.ts] 📈 About to increment applications_found for user ${userId}`);

			// First, let's check what the current state is BEFORE the update
			const preUpdateCheck = await db`
				SELECT id, user_id, provider, sync_status, sync_in_progress, last_sync_summary
				FROM public.user_email_integrations 
				WHERE user_id = ${userId} AND provider = 'gmail' AND sync_status = 'active'
			`;

			console.log(
				`[database.ts] 🔍 PRE-UPDATE: Found ${preUpdateCheck.length} matching integrations for user ${userId}:`,
				preUpdateCheck.map((row) => ({
					id: row.id,
					sync_status: row.sync_status,
					sync_in_progress: row.sync_in_progress,
					applications_found: row.last_sync_summary?.applications_found || 0,
					status: row.last_sync_summary?.status,
				})),
			);

			const result = await db`
				UPDATE public.user_email_integrations
				SET last_sync_summary = 
					CASE 
						WHEN last_sync_summary IS NULL THEN 
							jsonb_build_object('applications_found', 1, 'emails_analyzed', 1)
						ELSE 
							last_sync_summary || jsonb_build_object(
								'applications_found', COALESCE((last_sync_summary->>'applications_found')::int, 0) + 1,
								'emails_analyzed', COALESCE((last_sync_summary->>'emails_analyzed')::int, 0) + 1
							)
					END
				WHERE user_id = ${userId} 
					AND provider = 'gmail' 
					AND sync_status = 'active'
				RETURNING id, (last_sync_summary->>'applications_found')::int as app_count, (last_sync_summary->>'emails_analyzed')::int as email_count, (last_sync_summary->>'emails_sent_to_queue')::int as queue_count
			`;

			console.log(`[database.ts] 🔍 Update result:`, {
				rowsAffected: result.count,
				data: result.count > 0 ? 'Updated successfully' : 'No rows returned',
			});

			if (result.count === 0) {
				console.log(`[database.ts] ⚠️ No rows were updated! This means either: user not found, not gmail provider, or not active`);

				// Debug: Check what the current integration state is AFTER failed update
				const debugIntegration = await db`
					SELECT id, user_id, provider, sync_status, sync_in_progress, last_sync_summary 
					FROM public.user_email_integrations 
					WHERE user_id = ${userId}
				`;
				console.log(
					`[database.ts] 🐛 POST-UPDATE DEBUG - Current integration state for user ${userId}:`,
					debugIntegration.map((row) => ({
						id: row.id,
						user_id: row.user_id,
						provider: row.provider,
						sync_status: row.sync_status,
						sync_in_progress: row.sync_in_progress,
						last_sync_summary: row.last_sync_summary,
						whyFailed: {
							hasUser: !!row.user_id,
							isGmail: row.provider === 'gmail',
							isActive: row.sync_status === 'active',
						},
					})),
				);
			}

			if (result.length > 0) {
				console.log(
					`[database.ts] ✅ SUCCESSFULLY incremented applications_found for user ${userId} to ${result[0].app_count}, emails_analyzed to ${result[0].email_count}, emails_sent_to_queue: ${result[0].queue_count}`,
				);
			}
		} else {
			console.log(`[database.ts] 📧 No new application, just updating emails_analyzed for user ${userId}`);
			await updateEmailAnalyzedCount(db, userId);
		}
	} catch (error: any) {
		console.error(`[database.ts] ❌ Failed to update sync summary for user ${userId}:`, error.message, error.stack);
	}
}

/**
 * Add additional email source to application
 */
export async function addEmailSourceToApplication(
	db: postgres.Sql,
	applicationId: string,
	emailId: string,
	emailThreadId: string,
	emailDate: string,
	status: string,
	confidence: number,
): Promise<void> {
	try {
		await db`
			INSERT INTO public.application_sources (
				application_id, source_type, source_email_id, source_thread_id, 
				email_date, source_notes
			)
			VALUES (
				${applicationId}, 'email', ${emailId}, ${emailThreadId},
				${emailDate}::timestamptz, ${'Additional email: ' + status + ' (confidence: ' + confidence + ')'}
			)
			ON CONFLICT (application_id, source_type, source_email_id) DO UPDATE SET
				email_date = EXCLUDED.email_date,
				source_notes = EXCLUDED.source_notes,
				updated_at = NOW()
		`;
		console.log(`[queue-consumer] 📎 Added additional email to application_sources`);
	} catch (error: any) {
		console.error(`[queue-consumer] Failed to add email source to application: ${error.message}`);
	}
}

/**
 * Get existing applications for duplicate detection
 */
export async function getExistingApplications(db: postgres.Sql, userId: string) {
	return await db`
		SELECT id, company_name, role, status, application_date, 
			   job_url, location, salary_range, notes, source_email_id, 
			   source_thread_id, manual_entry
		FROM public.applications 
		WHERE user_id = ${userId} 
		ORDER BY application_date DESC
	`;
}

/**
 * Check for stuck syncs and complete them
 */
export async function checkAndCompleteStuckSyncs(db: postgres.Sql): Promise<void> {
	try {
		console.log(`[database.ts] 🔍 Checking for syncs that should be completed after batch processing`);

		// First, let's see all active syncs and their status
		const allActiveSyncs = await db`
			SELECT id, user_id, email_address, last_sync_summary, last_sync_started_at, sync_in_progress
			FROM public.user_email_integrations
			WHERE 
				provider = 'gmail'
				AND sync_status = 'active'
				AND sync_in_progress = TRUE
		`;

		console.log(
			`[database.ts] 🔍 Found ${allActiveSyncs.length} active syncs in progress:`,
			allActiveSyncs.map((sync) => ({
				user_id: sync.user_id,
				email: sync.email_address,
				summary: sync.last_sync_summary,
				started_at: sync.last_sync_started_at,
			})),
		);

		if (allActiveSyncs.length === 0) {
			console.log(`[database.ts] ✅ No active syncs in progress - nothing to complete`);
			return;
		}

		const stuckSyncs: StuckSync[] = await db`
			SELECT id, user_id, email_address, last_sync_summary, last_sync_started_at
			FROM public.user_email_integrations
			WHERE 
				provider = 'gmail'
				AND sync_status = 'active'
				AND sync_in_progress = TRUE
				AND last_sync_summary->>'status' = 'ai_first_processing'
				AND (
					-- Only complete if it's been enough time since sync started for queue processing to finish
					-- Give more time for applications to be processed from the queue
					(
						last_sync_started_at IS NOT NULL
						AND last_sync_started_at < NOW() - INTERVAL '5 minutes'
					)
				)
		`;

		console.log(`[database.ts] 🔍 Found ${stuckSyncs.length} syncs that should be completed`);

		// Log why each active sync is or isn't being completed
		for (const sync of allActiveSyncs) {
			const summary = sync.last_sync_summary || {};
			const emailsSentToQueue = summary.emails_sent_to_queue || 0;
			const emailsAnalyzed = summary.emails_analyzed || 0;
			const status = summary.status;
			const isTimeExpired = sync.last_sync_started_at && new Date(sync.last_sync_started_at) < new Date(Date.now() - 5 * 60 * 1000);

			const shouldComplete = status === 'ai_first_processing' && isTimeExpired;

			console.log(`[database.ts] 🔍 Sync analysis for user ${sync.user_id}:`, {
				status,
				emailsSentToQueue,
				emailsAnalyzed,
				isTimeExpired,
				shouldComplete,
				timeCondition: isTimeExpired ? 'TIME_EXPIRED' : 'TIME_OK',
				note: 'Completion based on time delay only, not email count',
			});
		}

		for (const integration of stuckSyncs) {
			const summary = integration.last_sync_summary || {};
			console.log(`[database.ts] 🚀 Completing sync for user ${integration.user_id} (${integration.email_address}). Summary:`, {
				emails_sent_to_queue: summary.emails_sent_to_queue,
				emails_analyzed: summary.emails_analyzed,
				applications_found: summary.applications_found,
				status: summary.status,
				last_sync_started_at: integration.last_sync_started_at,
			});

			const currentSummary = integration.last_sync_summary || {};
			const completedSummary = {
				...currentSummary,
				status: 'completed',
				completed_at: new Date().toISOString(),
			};

			await db`
				UPDATE public.user_email_integrations
				SET 
					sync_in_progress = FALSE,
					last_sync_completed_at = NOW(),
					first_sync_completed = TRUE,
					last_sync_summary = ${db.json(completedSummary)}
				WHERE id = ${integration.id}
			`;

			console.log(
				`[database.ts] ✅ Completed sync for integration ${integration.id} (${integration.email_address}) with final applications_found: ${completedSummary.applications_found}`,
			);
		}

		if (stuckSyncs.length > 0) {
			console.log(`[database.ts] ✅ Completed ${stuckSyncs.length} stuck syncs`);
		}
	} catch (syncCompletionError: any) {
		console.error(`[database.ts] ❌ Error checking for stuck syncs:`, syncCompletionError.message, syncCompletionError.stack);
	}
}
