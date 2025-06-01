import type postgres from 'postgres';
import type { Ai } from '@cloudflare/workers-types';
import type { EmailToParse } from '../types';
import type { AIParsedDataFromExtractor } from '../ai-extractor';
import type { JobEmailClassification } from '../ai-classifier';
import type { ConfidenceResult } from '../ai-confidence';
import { AI_CALL_DELAY_MS, STATUS_PRIORITY } from './types';

/**
 * AI Rate Limiting
 * Helper to enforce AI rate limiting to prevent overwhelming the AI service
 */
export async function rateLimitedAICall<T>(aiCall: () => Promise<T>): Promise<T> {
	const start = Date.now();
	const result = await aiCall();
	const elapsed = Date.now() - start;
	const remaining = AI_CALL_DELAY_MS - elapsed;

	if (remaining > 0) {
		console.log(`[queue-consumer] 🕒 AI rate limit: waiting ${remaining}ms`);
		await new Promise((resolve) => setTimeout(resolve, remaining));
	}

	return result;
}

/**
 * Application Status Management
 * Helper function to determine if application status should be updated based on priority
 */
export function shouldUpdateApplicationStatus(currentStatus: string, newStatus: string): boolean {
	const currentPriority = STATUS_PRIORITY[currentStatus] ?? 1;
	const newPriority = STATUS_PRIORITY[newStatus] ?? 1;

	// Allow updates to higher priority statuses, or if current is unknown
	// Also allow updates TO rejected/withdrawn (terminal states) regardless of current
	return newPriority > currentPriority || newStatus === 'Rejected' || newStatus === 'Withdrawn' || currentPriority === 1; // Unknown status, allow any update
}

/**
 * Create comprehensive AI reasoning with confidence information
 */
export async function createComprehensiveAIReasoning(
	db: postgres.Sql,
	existingReasoning: string,
	emailToParse: EmailToParse,
	extractedData: AIParsedDataFromExtractor,
	classificationResult: JobEmailClassification,
	confidenceResult: ConfidenceResult,
): Promise<string> {
	const reasoningParts = [];

	// Add confidence information
	reasoningParts.push(`AI Confidence: ${(confidenceResult.overall * 100).toFixed(1)}% - ${confidenceResult.reasoning}`);

	// Add classification reasoning
	if (classificationResult.reasoning) {
		reasoningParts.push(`Classification: ${classificationResult.reasoning}`);
	}

	// Add extraction details
	const extractionDetails = [];
	if (extractedData.companyName) extractionDetails.push(`Company: ${extractedData.companyName}`);
	if (extractedData.jobTitle) extractionDetails.push(`Role: ${extractedData.jobTitle}`);
	if (extractedData.status) extractionDetails.push(`Status: ${extractedData.status}`);

	if (extractionDetails.length > 0) {
		reasoningParts.push(`Extracted: ${extractionDetails.join(', ')}`);
	}

	// Add email metadata
	const emailInfo = `From: ${emailToParse.gmailMessage.from || 'Unknown'}, Subject: "${emailToParse.gmailMessage.subject || 'No subject'}"`;
	reasoningParts.push(`Email: ${emailInfo}`);

	// Add confidence factor breakdown
	const factors = confidenceResult.factors;
	const factorBreakdown = `Factors - Classification: ${(factors.classification * 100).toFixed(0)}%, Extraction: ${(factors.extraction * 100).toFixed(0)}%, Quality: ${(factors.dataQuality * 100).toFixed(0)}%, Consistency: ${(factors.consistency * 100).toFixed(0)}%`;
	reasoningParts.push(factorBreakdown);

	// Combine with existing reasoning if provided
	if (existingReasoning && existingReasoning.trim()) {
		reasoningParts.unshift(existingReasoning);
	}

	return reasoningParts.join(' | ');
}

/**
 * Update AI reasoning for existing application with confidence information
 */
export async function updateAIReasoningForExistingApplication(
	db: postgres.Sql,
	applicationId: string,
	emailToParse: EmailToParse,
	extractedData: AIParsedDataFromExtractor,
	classificationResult: JobEmailClassification,
	confidenceResult?: ConfidenceResult,
): Promise<void> {
	const additionalInfo = [];

	if (confidenceResult) {
		additionalInfo.push(`Additional email confidence: ${(confidenceResult.overall * 100).toFixed(1)}%`);
	}

	if (classificationResult.reasoning) {
		additionalInfo.push(`Classification: ${classificationResult.reasoning}`);
	}

	additionalInfo.push(`Additional email from: ${emailToParse.gmailMessage.from || 'Unknown'}`);
	additionalInfo.push(`Subject: "${emailToParse.gmailMessage.subject || 'No subject'}"`);

	if (extractedData.status) {
		additionalInfo.push(`Updated status: ${extractedData.status}`);
	}

	const additionalReasoning = additionalInfo.join(' | ');

	await db`
		UPDATE public.applications
		SET ai_reasoning = COALESCE(ai_reasoning, '') || ' | ' || ${additionalReasoning}
		WHERE id = ${applicationId}
	`;
}
