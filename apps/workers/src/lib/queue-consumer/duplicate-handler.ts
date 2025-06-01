import type { Ai } from '@cloudflare/workers-types';
import type postgres from 'postgres';
import type { EmailToParse } from '../types';
import type { EmailData, ApplicationFromDB } from './types';
import { shouldUpdateApplicationStatus, updateAIReasoningForExistingApplication } from './ai-utils';
import { addEmailSourceToApplication } from './database';
import { findPotentialDuplicates, type ApplicationForComparison } from '../ai-deduplicator';
import type { ConfidenceResult } from '../ai-confidence';

/**
 * Duplicate Detection and Handling
 * Functions for detecting and handling duplicate applications
 */

/**
 * Check for duplicates and handle them appropriately
 * Returns the application ID if a duplicate was found and handled, null otherwise
 */
export async function checkAndHandleDuplicates(
	db: postgres.Sql,
	emailData: EmailData,
	existingApps: ApplicationFromDB[],
	aiBinding: Ai,
	emailToParse: EmailToParse,
	extractedData: any,
	classificationResult: any,
	confidenceResult: ConfidenceResult,
): Promise<string | null> {
	if (existingApps.length === 0) {
		console.log(`[queue-consumer] ❌ No existing applications found - proceeding with new application`);
		return null;
	}

	const newApplication = {
		company_name: emailData.company_name,
		role: emailData.role,
		status: emailData.status,
		application_date: emailData.application_date,
	};

	console.log(`[queue-consumer] 🤖 Running AI duplicate detection for "${newApplication.company_name}" - "${newApplication.role}"`);
	console.log(
		`[queue-consumer] 📋 Existing applications to check:`,
		`(${existingApps.length})`,
		existingApps.map((app) => `${app.company_name} - ${app.role} (${new Date(app.application_date)})`),
	);

	// Convert database rows to ApplicationForComparison type
	const existingApplications: ApplicationForComparison[] = existingApps.map((app) => ({
		id: app.id,
		company_name: app.company_name,
		role: app.role,
		status: app.status,
		application_date: app.application_date,
		job_url: app.job_url,
		location: app.location,
		salary_range: app.salary_range,
		notes: app.notes,
		source_email_id: app.source_email_id,
		source_thread_id: app.source_thread_id,
		manual_entry: app.manual_entry || false,
	}));

	const potentialDuplicates = await findPotentialDuplicates(newApplication, existingApplications, aiBinding, emailToParse);

	if (potentialDuplicates.length === 0) {
		console.log(`[queue-consumer] ❌ No potential duplicates found - proceeding with new application`);
		return null;
	}

	console.log(`[queue-consumer] 🎯 Found ${potentialDuplicates.length} potential duplicate(s)`);

	const bestMatch = potentialDuplicates[0]; // Take the highest confidence match
	const duplicateAnalysis = bestMatch.analysis;

	if (!duplicateAnalysis.isDuplicate || duplicateAnalysis.confidence <= 0.7) {
		console.log(`[queue-consumer] ❌ No confident duplicates found - creating new application`);
		return null;
	}

	console.log(`[queue-consumer] ✅ Confirmed duplicate: ${duplicateAnalysis.reasoning} (confidence: ${duplicateAnalysis.confidence})`);

	const existingApplicationId = bestMatch.app.id;
	if (!existingApplicationId) {
		console.error(`[queue-consumer] ❌ Missing application ID in duplicate match`);
		return null;
	}

	// Add this email as additional source to existing application
	console.log(`[queue-consumer] 📧 Adding additional email to application_sources for existing application ${existingApplicationId}`);

	await addEmailSourceToApplication(
		db,
		existingApplicationId,
		emailData.email_id,
		emailData.email_thread_id,
		emailData.email_date,
		emailData.status,
		emailData.ai_confidence,
	);

	console.log(`[queue-consumer] 📎 Added additional email to application_sources (AI detected duplicate)`);

	// Update status if appropriate
	const shouldUpdate = shouldUpdateApplicationStatus(bestMatch.app.status, emailData.status);
	if (shouldUpdate) {
		await db`
			UPDATE public.applications 
			SET 
				status = ${emailData.status},
				ai_confidence = GREATEST(ai_confidence, ${emailData.ai_confidence}),
				updated_at = NOW()
			WHERE id = ${existingApplicationId}
		`;
		console.log(`[queue-consumer] 🔄 Updated status from ${bestMatch.app.status} to ${emailData.status}`);
	}

	// Update AI reasoning to reflect multiple emails
	await updateAIReasoningForExistingApplication(
		db,
		existingApplicationId,
		emailToParse,
		extractedData,
		classificationResult,
		confidenceResult,
	);

	return existingApplicationId;
}

/**
 * Handle AI-first processed emails with duplicate detection
 */
export async function handleAIFirstDuplicates(
	db: postgres.Sql,
	emailData: EmailData,
	existingApps: ApplicationFromDB[],
	aiBinding: Ai,
	userId: string,
): Promise<{ applicationId: string | null; wasNewApplication: boolean }> {
	if (existingApps.length === 0) {
		return { applicationId: null, wasNewApplication: false };
	}

	// Use AI deduplicator to check for potential matches
	const newApplication = {
		company_name: emailData.company_name,
		role: emailData.role,
		status: emailData.status,
		application_date: emailData.application_date,
	};

	console.log(`[queue-consumer] 🤖 AI-first: Running duplicate detection for "${newApplication.company_name}" - "${newApplication.role}"`);

	// Convert database rows to ApplicationForComparison type
	const existingApps2: ApplicationForComparison[] = existingApps.map((app) => ({
		id: app.id,
		company_name: app.company_name,
		role: app.role,
		status: app.status,
		application_date: app.application_date,
		job_url: app.job_url,
		location: app.location,
		salary_range: app.salary_range,
		notes: app.notes,
		source_email_id: app.source_email_id,
		source_thread_id: app.source_thread_id,
		manual_entry: app.manual_entry || false,
	}));

	const potentialDuplicates = await findPotentialDuplicates(newApplication, existingApps2, aiBinding);

	if (potentialDuplicates.length > 0) {
		const bestMatch = potentialDuplicates[0];
		const duplicateAnalysis = bestMatch.analysis;

		if (duplicateAnalysis.isDuplicate && duplicateAnalysis.confidence > 0.7) {
			console.log(`[queue-consumer] ✅ AI-first: Confirmed duplicate (confidence: ${duplicateAnalysis.confidence})`);
			const applicationId = bestMatch.app.id!;

			// Update status if appropriate
			const shouldUpdate = shouldUpdateApplicationStatus(bestMatch.app.status, emailData.status);
			if (shouldUpdate) {
				await db`
					UPDATE public.applications 
					SET 
						status = ${emailData.status},
						ai_confidence = GREATEST(ai_confidence, ${emailData.ai_confidence}),
						updated_at = NOW()
					WHERE id = ${applicationId}
				`;
				console.log(`[queue-consumer] 🔄 AI-first: Updated status to ${emailData.status}`);
			}

			// Add this email as additional source (since application already exists)
			console.log(`[queue-consumer] 📧 Adding additional email to application_sources for existing application ${applicationId}`);

			await addEmailSourceToApplication(
				db,
				applicationId,
				emailData.email_id,
				emailData.email_thread_id,
				emailData.email_date,
				emailData.status,
				emailData.ai_confidence,
			);

			console.log(`[queue-consumer] 📎 Added additional email to application_sources (multiple emails for same application)`);

			return { applicationId, wasNewApplication: false };
		} else {
			console.log(`[queue-consumer] ❌ AI-first: No confident duplicates found - creating new application`);
		}
	} else {
		console.log(`[queue-consumer] ❌ AI-first: No potential duplicates found - creating new application`);
	}

	return { applicationId: null, wasNewApplication: false };
}
