import type { Ai } from '@cloudflare/workers-types';
import type postgres from 'postgres';
import type { EmailToParse } from '../types';
import type { AIParsedDataFromExtractor } from '../ai-extractor';
import type { JobEmailClassification } from '../ai-classifier';
import type { ConfidenceResult } from '../ai-confidence';
import { calculateAIConfidence } from '../ai-confidence';
import type { EmailData, SavedApplication, ApplicationFromDB } from './types';
import { createComprehensiveAIReasoning, updateAIReasoningForExistingApplication } from './ai-utils';
import { addEmailSourceToApplication, getExistingApplications } from './database';
import { checkAndHandleDuplicates, handleAIFirstDuplicates } from './duplicate-handler';

/**
 * Application Processing
 * Functions for creating and updating job applications from emails
 */

/**
 * Create a new application from email data
 */
export async function createNewApplication(
	db: postgres.Sql,
	emailData: EmailData,
	needs_user_review: boolean = true,
): Promise<SavedApplication> {
	console.log(
		`[application-processor.ts] 🆕 Creating new application for ${emailData.company_name} - ${emailData.role}, user: ${emailData.user_id}`,
	);

	// Ensure ai_reasoning is resolved if it's a Promise
	const resolvedReasoning = await emailData.ai_reasoning;

	const result = await db`
		INSERT INTO public.applications (
			user_id, company_name, role, status, application_date, 
			source_email_id, source_thread_id, applied_at, ai_confidence, ai_reasoning, needs_user_review
		)
		VALUES (
			${emailData.user_id}, ${emailData.company_name}, ${emailData.role}, ${emailData.status}, 
			${emailData.application_date}::date, ${emailData.email_id}, ${emailData.email_thread_id}, 
			${emailData.email_date}::timestamptz, ${emailData.ai_confidence}, ${resolvedReasoning}, ${needs_user_review}
		)
		RETURNING id, status
	`;

	if (result.length === 0) {
		throw new Error('Failed to insert new application');
	}

	const newApplication = result[0];
	console.log(`[application-processor.ts] ✅ New application created successfully: ${newApplication.id} for user ${emailData.user_id}`);

	return {
		id: newApplication.id,
		status: newApplication.status,
		operation_type: 'INSERT',
	};
}

/**
 * Upsert application with simple dedupe_key approach (fallback)
 */
export async function upsertApplication(db: postgres.Sql, emailData: EmailData, needs_user_review: boolean): Promise<SavedApplication> {
	console.log(`[queue-consumer] 💾 Upserting application: ${emailData.company_name} - ${emailData.role} (${emailData.application_date})`);

	const result = await db`
		INSERT INTO public.applications (
			user_id, company_name, role, status, applied_at, application_date,
			source_email_id, source_thread_id, ai_suggested, ai_confidence, 
			ai_reasoning, needs_user_review
		)
		VALUES (
			${emailData.user_id}, ${emailData.company_name}, ${emailData.role},
			${emailData.status}, ${emailData.email_date}::timestamptz, ${emailData.application_date}::date,
			${emailData.email_id}, ${emailData.email_thread_id}, ${true}, 
			${emailData.ai_confidence}, ${await emailData.ai_reasoning}, ${needs_user_review}
		)
		ON CONFLICT (user_id, dedupe_key) DO UPDATE SET
			status = CASE 
				-- Status priority: Wishlist(0), Opportunity(0.5), Applied(1), Screening(2), Interviewing(3), Offer(4), Rejected(5), Withdrawn(5)
				-- Only update to higher priority status or allow terminal states
				WHEN (
					(EXCLUDED.status = 'Rejected' OR EXCLUDED.status = 'Withdrawn') OR
					(applications.status = 'Wishlist' AND EXCLUDED.status IN ('Opportunity', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn')) OR
					(applications.status = 'Opportunity' AND EXCLUDED.status IN ('Applied', 'Screening', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn')) OR
					(applications.status = 'Applied' AND EXCLUDED.status IN ('Screening', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn')) OR
					(applications.status = 'Screening' AND EXCLUDED.status IN ('Interviewing', 'Offer', 'Rejected', 'Withdrawn')) OR
					(applications.status = 'Interviewing' AND EXCLUDED.status IN ('Offer', 'Rejected', 'Withdrawn')) OR
					(applications.status = 'Offer' AND EXCLUDED.status IN ('Rejected', 'Withdrawn'))
				) THEN EXCLUDED.status
				ELSE applications.status
			END,
			ai_confidence = GREATEST(applications.ai_confidence, ${emailData.ai_confidence}),
			ai_reasoning = ${await emailData.ai_reasoning},
			updated_at = NOW()
		RETURNING id, status, 
			CASE 
				WHEN xmax = 0 THEN 'INSERT'
				ELSE 'UPDATE'
			END as operation_type
	`;

	if (!result || result.length === 0) {
		throw new Error('Failed to upsert application');
	}

	return result[0] as SavedApplication;
}

/**
 * Process regular email with AI classification and extraction
 */
export async function processRegularEmail(
	db: postgres.Sql,
	emailToParse: EmailToParse,
	extractedData: AIParsedDataFromExtractor,
	classificationResult: JobEmailClassification,
	confidenceResult: ConfidenceResult,
	aiBinding: Ai,
): Promise<{ applicationId: string; wasNewApplication: boolean }> {
	const userId = emailToParse.userId;
	const emailDate = emailToParse.gmailMessage.date ? new Date(emailToParse.gmailMessage.date) : new Date();
	const applicationDateString = emailDate.toISOString().split('T')[0]; // Date only for application_date
	const appliedAtTimestamp = emailDate.toISOString(); // Full timestamp for applied_at

	const emailData: EmailData = {
		user_id: userId,
		company_name: extractedData.companyName?.trim() || 'Unknown Company',
		role: extractedData.jobTitle?.trim() || 'Unknown Role',
		status: extractedData.status || 'Applied',
		application_date: applicationDateString,
		email_id: emailToParse.gmailMessage.id,
		email_thread_id: emailToParse.gmailMessage.threadId,
		email_date: appliedAtTimestamp,
		ai_confidence: confidenceResult.overall, // Use calculated confidence
		ai_reasoning: createComprehensiveAIReasoning(db, '', emailToParse, extractedData, classificationResult, confidenceResult),
	};

	// All applications require manual approval
	console.log(`[queue-consumer] 🎯 Application will require manual approval (confidence: ${(confidenceResult.overall * 100).toFixed(1)}%)`);

	// Fetch existing applications for duplicate detection
	console.log(`[queue-consumer] 🔍 Checking for potential duplicates...`);
	const existingApps = await getExistingApplications(db, userId);
	console.log(`[queue-consumer] 🔍 Found ${existingApps.length} existing applications to check for duplicates`);

	// Check for duplicates using AI deduplicator
	const duplicateApplicationId = await checkAndHandleDuplicates(
		db,
		emailData,
		existingApps as unknown as ApplicationFromDB[],
		aiBinding,
		emailToParse,
		extractedData,
		classificationResult,
		confidenceResult,
	);

	if (duplicateApplicationId) {
		return { applicationId: duplicateApplicationId, wasNewApplication: false };
	}

	// No duplicates found, create new application using simple upsert with dedupe_key approach
	console.log(`[queue-consumer] ✅ No duplicates found - proceeding with new application`);
	const savedApplication = await upsertApplication(db, emailData, true); // Always require review
	const wasNewApplication = savedApplication.operation_type === 'INSERT';

	console.log(
		`[queue-consumer] ✅ Application ${wasNewApplication ? 'created' : 'updated'}: ${savedApplication.id} for email ${emailToParse.gmailMessage.id}`,
	);

	// ONLY add to application_sources if this was an UPDATE (meaning there are now multiple emails)
	if (!wasNewApplication) {
		console.log(`[queue-consumer] 📧 Adding additional email to application_sources for existing application ${savedApplication.id}`);

		await addEmailSourceToApplication(
			db,
			savedApplication.id,
			emailData.email_id,
			emailData.email_thread_id,
			emailData.email_date,
			emailData.status,
			emailData.ai_confidence,
		);

		console.log(`[queue-consumer] 📎 Added additional email to application_sources (multiple emails for same application)`);

		// Update AI reasoning to reflect multiple emails
		await updateAIReasoningForExistingApplication(
			db,
			savedApplication.id,
			emailToParse,
			extractedData,
			classificationResult,
			confidenceResult,
		);
	} else {
		console.log(
			`[queue-consumer] 📧 New application created - primary email stored in applications.source_email_id (no application_sources entry needed)`,
		);
	}

	return { applicationId: savedApplication.id, wasNewApplication };
}

/**
 * Process AI-first processed email
 */
export async function processAIFirstEmail(
	db: postgres.Sql,
	queueMessage: any,
	aiBinding: Ai,
): Promise<{ applicationId: string; wasNewApplication: boolean }> {
	const { aiResult, classificationResult, emailMetadata } = queueMessage;

	console.log(`[queue-consumer] 🎯 Creating application from AI-processed email ${emailMetadata.id}`);

	// Calculate confidence for AI-first emails
	const emailToParse: EmailToParse = {
		userId: queueMessage.userId,
		integrationId: queueMessage.integrationId || '',
		emailProvider: 'gmail',
		gmailMessage: {
			id: emailMetadata.id,
			threadId: emailMetadata.threadId,
			historyId: emailMetadata.historyId || '',
			subject: emailMetadata.subject || '',
			from: emailMetadata.from || '',
			date: emailMetadata.date || new Date().toISOString(),
			snippet: emailMetadata.snippet || '',
			bodyText: emailMetadata.bodyText || '',
			bodyHtml: emailMetadata.bodyHtml || '',
		},
	};

	const confidenceResult = calculateAIConfidence(classificationResult, aiResult, emailToParse);
	console.log(`[queue-consumer] 🎯 AI-First Confidence Score: ${(confidenceResult.overall * 100).toFixed(1)}%`);

	// All applications require manual approval
	console.log(
		`[queue-consumer] 🎯 AI-First application will require manual approval (confidence: ${(confidenceResult.overall * 100).toFixed(1)}%)`,
	);

	// First, check if application already exists using deduplication logic
	const applicationDate = new Date(emailMetadata.date || new Date()).toISOString().split('T')[0]; // Date only
	const emailData: EmailData = {
		user_id: queueMessage.userId,
		company_name: aiResult.companyName?.trim() || 'Unknown Company',
		role: aiResult.jobTitle?.trim() || 'Unknown Role',
		status: aiResult.status || 'Applied',
		application_date: applicationDate,
		email_id: emailMetadata.id,
		email_thread_id: emailMetadata.threadId,
		email_date: new Date(emailMetadata.date || new Date()).toISOString(),
		ai_confidence: confidenceResult.overall, // Use calculated confidence
		ai_reasoning: createComprehensiveAIReasoning(db, '', emailToParse, aiResult, classificationResult, confidenceResult),
	};

	// Check if there are existing applications with similar characteristics
	const existingApplications = await getExistingApplications(db, queueMessage.userId);

	if (existingApplications.length > 0) {
		const duplicateResult = await handleAIFirstDuplicates(
			db,
			emailData,
			existingApplications as unknown as ApplicationFromDB[],
			aiBinding,
			queueMessage.userId,
		);

		if (duplicateResult.applicationId) {
			return { applicationId: duplicateResult.applicationId, wasNewApplication: false };
		}
	}

	// Create new application - always require manual approval
	const savedApplication = await createNewApplication(db, emailData, true); // Always require review
	console.log(
		`[queue-consumer] 📧 AI-first: New application created - primary email stored ONLY in applications.source_email_id (original design)`,
	);

	return { applicationId: savedApplication.id, wasNewApplication: true };
}

/**
 * Handle constraint violations gracefully by finding existing application and adding email as source
 */
export async function handleConstraintViolation(db: postgres.Sql, emailData: EmailData, userId: string, dbError: any): Promise<void> {
	console.log(`[queue-consumer] 🔄 Handling constraint violation gracefully`);

	// Find the existing application and add this email as an additional source
	const existingApp = await db`
		SELECT id, company_name, role, application_date, dedupe_key
		FROM public.applications 
		WHERE user_id = ${userId} 
		AND dedupe_key = public.make_application_dedupe_key(${emailData.company_name}, ${emailData.role}, ${emailData.application_date}::date)
		LIMIT 1
	`;

	if (existingApp && existingApp.length > 0) {
		const app = existingApp[0];
		console.log(`[queue-consumer] 📧 Found existing application ${app.id} - adding email as additional source to application_sources`);

		// Add this email as an additional source (only for multiple emails)
		await addEmailSourceToApplication(
			db,
			app.id,
			emailData.email_id,
			emailData.email_thread_id,
			emailData.email_date,
			emailData.status,
			emailData.ai_confidence,
		);

		console.log(`[queue-consumer] ✅ Successfully added additional email source for existing application ${app.id}`);
	} else {
		throw new Error('Could not find existing application for duplicate key constraint');
	}
}
