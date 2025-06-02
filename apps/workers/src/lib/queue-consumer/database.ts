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
				AND sync_in_progress = TRUE
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
	try {
		if (wasNewApplication) {
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
					AND sync_in_progress = TRUE
				RETURNING id, (last_sync_summary->>'applications_found')::int as app_count, (last_sync_summary->>'emails_analyzed')::int as email_count
			`;

			if (result.length > 0) {
				console.log(
					`[queue-consumer] ✅ Atomically incremented applications_found for user ${userId} to ${result[0].app_count}, emails_analyzed to ${result[0].email_count}`,
				);
			}
		} else {
			await updateEmailAnalyzedCount(db, userId);
		}
	} catch (error: any) {
		console.warn(`[queue-consumer] Failed to update sync summary: ${error.message}`);
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
		console.log(`[queue-consumer] Checking for syncs that should be completed after batch processing`);

		const stuckSyncs: StuckSync[] = await db`
			SELECT id, user_id, email_address, last_sync_summary, last_sync_started_at
			FROM public.user_email_integrations
			WHERE 
				provider = 'gmail'
				AND sync_status = 'active'
				AND sync_in_progress = TRUE
				AND last_sync_summary->>'status' = 'ai_processing'
				AND (
					-- All emails have been analyzed (processed or failed)
					(
						(last_sync_summary->>'emails_sent_to_queue')::int > 0 
						AND (last_sync_summary->>'emails_analyzed')::int >= (last_sync_summary->>'emails_sent_to_queue')::int
					)
					OR
					-- Or it's been too long since sync started (>3 minutes)
					(
						last_sync_started_at IS NOT NULL
						AND last_sync_started_at < NOW() - INTERVAL '3 minutes'
					)
				)
		`;

		console.log(`[queue-consumer] Found ${stuckSyncs.length} syncs that should be completed`);

		for (const integration of stuckSyncs) {
			const summary = integration.last_sync_summary || {};
			console.log(`[queue-consumer] Completing sync for user ${integration.user_id} (${integration.email_address}). Summary:`, {
				emails_sent_to_queue: summary.emails_sent_to_queue,
				emails_analyzed: summary.emails_analyzed,
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

			console.log(`[queue-consumer] ✅ Completed sync for integration ${integration.id} (${integration.email_address})`);
		}

		if (stuckSyncs.length > 0) {
			console.log(`[queue-consumer] ✅ Completed ${stuckSyncs.length} stuck syncs`);
		}
	} catch (syncCompletionError: any) {
		console.warn(`[queue-consumer] Error checking for stuck syncs: ${syncCompletionError.message}`);
	}
}
