import { createWorkersAI } from 'workers-ai-provider';
import { generateObject } from 'ai'; // Added
import { z } from 'zod';
import type { Ai } from '@cloudflare/workers-types';
import type { EmailToParse } from './types';

export const JobEmailClassificationSchema = z.object({
	isJobApplicationRelated: z
		.boolean()
		.describe(
			"True if the email is directly related to a user's specific job application (e.g., confirmation, update, interview request, rejection). False if it's a general job alert, newsletter, promotional email, or not about a specific application the user has made.",
		),
	reasoning: z.string().optional().describe('Brief explanation for the classification decision, especially if false.'),
});

export type JobEmailClassification = z.infer<typeof JobEmailClassificationSchema>;

// Manually created JSON schema - REMOVED as generateObject uses Zod schema directly
// const JobEmailClassificationJsonSchema = { ... };

export async function classifyEmail(emailData: EmailToParse, aiBinding: Ai): Promise<JobEmailClassification | null> {
	// Return type changed to include null for errors
	const workersai = createWorkersAI({ binding: aiBinding as any });
	const model = workersai('@cf/meta/llama-3.1-8b-instruct-fast' as any); // Consistent model name

	const classificationPromptContent = `You are an expert at identifying job application-related emails. Analyze this email and determine if it's directly about a specific job application the recipient has already submitted.

EMAIL TO ANALYZE:
Subject: ${emailData.gmailMessage.subject || '(No subject)'}
From: ${emailData.gmailMessage.from || '(Unknown sender)'}
Snippet: ${emailData.gmailMessage.snippet || '(No snippet)'}
Body: ${(emailData.gmailMessage.bodyText || emailData.gmailMessage.snippet || '(No content)').substring(0, 800)}

CLASSIFICATION RULES:
✅ TRUE - Email is job application related if:
- Thank you/confirmation for submitting an application: "Thanks for applying to [Company]"
- Status updates from the hiring company: "Update on your [Role] application at [Company]"
- Interview requests/scheduling: "Interview for [Role] position at [Company]"
- Job offer or rejection letters from the company
- Any follow-up communication about a specific application you submitted
- Emails FROM the actual company you applied to (not job boards)

❌ FALSE - Email is NOT job application related if:
- Job alerts/notifications from job boards: "New [Role] jobs at [Company]" from LinkedIn/Indeed
- Newsletters from job platforms: "Weekly job digest", "Jobs you might like"
- Promotional emails: "Apply to [Company] now!", "We're hiring!"
- General recruiting outreach: "Would you be interested in [Role]?"
- Career advice or blog content
- Job board confirmations of SAVED jobs (not applied jobs)
- Emails FROM job platforms (LinkedIn, Indeed, Glassdoor) about job opportunities

KEY DISTINCTION: 
- FROM the company → likely TRUE
- FROM job platforms/recruiters → likely FALSE
- ABOUT a specific application you submitted → TRUE  
- ABOUT job opportunities to consider → FALSE

Analyze the sender domain and email content carefully. Company emails usually come from @company.com, while job board emails come from @linkedin.com, @indeed.com, etc.

Return your answer according to the JSON schema with clear reasoning.`;

	console.log(
		`[ai-classifier] Generating classification for email subject: "${emailData.gmailMessage.subject}" from: "${emailData.gmailMessage.from}"`,
	);

	try {
		// Add timeout protection for AI calls
		// @ts-ignore
		const aiPromise = generateObject({
			model: model,
			prompt: classificationPromptContent,
			schema: JobEmailClassificationSchema,
		});

		// 30-second timeout for AI classification
		const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI classification timeout (30s)')), 30000));

		// @ts-ignore
		const result = (await Promise.race([aiPromise, timeoutPromise])) as { object: JobEmailClassification };

		console.log('[ai-classifier] Raw AI Response from generateObject:', JSON.stringify(result, null, 2));

		// @ts-ignore
		if (result && result.object) {
			return result.object;
		} else {
			console.error('[ai-classifier] AI response did not contain the expected object. Full response logged above.');
			return null;
		}
	} catch (error: any) {
		console.error(
			`[ai-classifier] Error during AI classification for subject "${emailData.gmailMessage.subject}" from "${emailData.gmailMessage.from}":`,
			error.message,
			error.stack ? error.stack : '',
		);
		if (error instanceof z.ZodError) {
			// This should ideally not be hit if generateObject successfully returns an object that passes its own schema validation
			console.error('[ai-classifier] Zod validation error (from generateObject result):', error.errors);
		}
		// Log additional error details if available (e.g. from NoObjectGeneratedError in 'ai' package)
		if (error.cause) {
			console.error('[ai-classifier] Cause of error:', error.cause);
		}
		return null; // Return null on error
	}
}
