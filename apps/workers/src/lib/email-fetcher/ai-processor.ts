import type { Ai } from '@cloudflare/workers-types';
import type { GmailMessageData, EmailToParse } from '../types';
import type { AIProcessingResult } from './types';
import { extractEmailData } from '../ai-extractor';
import { classifyEmail } from '../ai-classifier';

/**
 * Process email with AI - performs classification and extraction if job-related
 */
export async function processEmailWithAI(
	messageData: GmailMessageData,
	userId: string,
	integrationId: string,
	aiBinding: Ai,
): Promise<AIProcessingResult | null> {
	try {
		console.log(`[ai-processor] 🧠 AI-FIRST PROCESSING: Starting full-content AI analysis for email ${messageData.id}`);

		const emailToParse: EmailToParse = {
			userId,
			integrationId,
			emailProvider: 'gmail',
			gmailMessage: messageData,
		};

		// BREAKTHROUGH: Process with full email content (no truncation!)
		const totalContentLength = (messageData.bodyText?.length || 0) + (messageData.bodyHtml?.length || 0);
		console.log(
			`[ai-processor] 🚀 FULL CONTENT LENGTH: ${totalContentLength} characters (text: ${messageData.bodyText?.length || 0}, html: ${messageData.bodyHtml?.length || 0}) - NO TRUNCATION!`,
		);

		// Step 1: AI Classification (reuse existing function that handles AI binding properly)
		console.log(`[ai-processor] 🎯 Step 1: AI Classification for email ${messageData.id}`);
		const classificationResult = await classifyEmail(emailToParse, aiBinding);

		if (!classificationResult) {
			console.warn(`[ai-processor] ⚠️ AI Classification failed for email ${messageData.id}`);
			return null;
		}

		// Step 2: AI Extraction (only if job-related) (reuse existing function)
		if (!classificationResult.isJobApplicationRelated) {
			console.log(`[ai-processor] 📧 Email ${messageData.id} is not job-related, skipping extraction`);
			return { aiResult: null, classificationResult };
		}

		console.log(`[ai-processor] 🎯 Step 2: AI Extraction for job-related email ${messageData.id}`);
		const aiResult = await extractEmailData(emailToParse, aiBinding);

		if (!aiResult) {
			console.warn(`[ai-processor] ⚠️ AI Extraction failed for email ${messageData.id}`);
			return null;
		}

		console.log(
			`[ai-processor] ✅ AI-FIRST SUCCESS: Processed email ${messageData.id} - Status: ${aiResult.status}, Company: ${aiResult.companyName}`,
		);

		return { aiResult, classificationResult };
	} catch (error: any) {
		console.error(`[ai-processor] ❌ AI-FIRST ERROR for email ${messageData.id}:`, error.message);
		return null;
	}
}
