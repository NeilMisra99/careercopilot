import { createWorkersAI } from 'workers-ai-provider';
import { generateText } from 'ai';
import { z } from 'zod';
import type { Ai } from '@cloudflare/workers-types';
import type { EmailToParse, AIParsedApplicationStatus } from './types';

const AIParsedApplicationStatusEnum = z.enum([
	'Applied',
	'Screening',
	'Interviewing',
	'Offer Extended',
	'Offer Accepted',
	'Offer Declined',
	'Rejected',
	'Withdrawn',
	'On Hold',
]);

export const AIParsedDataSchema = z.object({
	companyName: z.string().nullable().describe('The name of the company mentioned in the application.'),
	jobTitle: z.string().nullable().describe('The job title for the application.'),
	status: AIParsedApplicationStatusEnum.nullable().describe('The current status of the job application.'),
});

export type AIParsedDataFromExtractor = z.infer<typeof AIParsedDataSchema>;

function createAIExtractionPrompt(emailData: EmailToParse): string {
	const { subject, snippet, from, date, bodyText } = emailData.gmailMessage;

	return `You are an expert at extracting job application data from emails. Extract the company name, job title, and application status from this job-related email.

EMAIL DETAILS:
Subject: ${subject || '(No subject)'}
From: ${from || '(Unknown sender)'}
Date: ${date || '(Unknown date)'}
Body:
${bodyText || snippet || '(No content available)'}

EXTRACTION GUIDELINES:

COMPANY NAME:
- Look for company names in the email signature, "from" address, or body text
- Clean up formatting: "Coalition, Inc." not "Coalition Inc"
- If from a job board, look for the actual company mentioned in the job description
- Common patterns: "Thank you for applying to [Company]", "Team at [Company]", "[Company] Careers"
- Avoid: job board names (LinkedIn, Indeed, etc.) unless they're the actual employer

JOB TITLE:
- Look for specific role titles mentioned in the email
- Common patterns: "for the [Role] position", "your application for [Role]", "[Role] at [Company]"
- Keep original formatting: "Senior Frontend Engineer", "Data Scientist - ML"
- If multiple roles mentioned, pick the one the email is primarily about
- Use null if no specific role is mentioned

STATUS:
- Applied: Confirmation emails, "thank you for applying"
- Screening: "We're reviewing your application", "under review"
- Interviewing: "interview", "next round", "schedule a call"
- Offer Extended: "pleased to offer", "job offer", "we'd like to extend"
- Rejected: "unfortunately", "not moving forward", "other candidates"
- Withdrawn: if the candidate withdrew
- On Hold: "on hold", "paused", "will contact you later"

IMPORTANT: 
- Extract exact names/titles as they appear in the email
- Be conservative - use null if uncertain
- Company name is REQUIRED - if you can't find it clearly, the email might not be job-related

Return ONLY valid JSON wrapped in <json>...</json> tags.

EXAMPLE OUTPUTS:

<json>
{
  "companyName": "Stripe",
  "jobTitle": "Senior Software Engineer",
  "status": "Applied"
}
</json>

<json>
{
  "companyName": "Anthropic",
  "jobTitle": "AI Safety Researcher",
  "status": "Interviewing"
}
</json>

<json>
{
  "companyName": "OpenAI",
  "jobTitle": null,
  "status": "Rejected"
}
</json>

Now extract data from the email above:`;
}

export async function extractEmailData(emailData: EmailToParse, aiBinding: Ai): Promise<AIParsedDataFromExtractor | null> {
	const workersai = createWorkersAI({ binding: aiBinding as any });
	const model = workersai('@cf/meta/llama-3.1-8b-instruct-fp8' as any);

	const extractionPrompt = createAIExtractionPrompt(emailData);
	console.log(
		`[ai-extractor] Generating extraction for email subject: "${emailData.gmailMessage.subject}" from: "${emailData.gmailMessage.from}"`,
	);

	try {
		// Add timeout protection for AI calls
		const aiPromise = generateText({
			model: model,
			prompt: extractionPrompt,
			// No schema needed for generateText directly
		});

		// 45-second timeout for AI extraction (longer than classification due to more complex processing)
		const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI extraction timeout (45s)')), 45000));

		const result = (await Promise.race([aiPromise, timeoutPromise])) as { text: string };

		console.log('[ai-extractor] Raw AI Response from generateText:', result.text);

		const rawText = result.text;
		const jsonStartTag = '<json>';
		const jsonEndTag = '</json>';

		const startIndex = rawText.indexOf(jsonStartTag);
		const endIndex = rawText.indexOf(jsonEndTag);

		if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
			const jsonString = rawText.substring(startIndex + jsonStartTag.length, endIndex).trim();
			console.log('[ai-extractor] Extracted JSON string:', jsonString);
			try {
				const parsedJson = JSON.parse(jsonString);
				// Now validate with Zod schema
				const validatedData = AIParsedDataSchema.parse(parsedJson);
				console.log('[ai-extractor] Successfully parsed and validated JSON from AI response:', validatedData);
				return validatedData;
			} catch (parseOrValidationError: any) {
				console.error('[ai-extractor] Failed to parse or validate the extracted JSON string:', parseOrValidationError.message);
				if (parseOrValidationError instanceof z.ZodError) {
					console.error('[ai-extractor] Zod validation errors:', parseOrValidationError.errors);
				}
				console.error('[ai-extractor] Original string that failed parsing/validation:', jsonString);
				return null;
			}
		} else {
			console.error('[ai-extractor] Could not find <json>...</json> tags in AI response. Raw text logged above.');
			return null;
		}
	} catch (error: any) {
		console.error(
			`[ai-extractor] Error during AI data extraction for subject "${emailData.gmailMessage.subject}" using generateText:`,
			error.message,
			error.stack ? error.stack : '',
		);

		// Check if it's an AI SDK error related to object generation
		// The specific error might be AI_NoObjectGeneratedError or AI_TypeValidationError
		// We can check for common properties these errors might have from the 'ai' package.
		if (error.name === 'AI_NoObjectGeneratedError' || error.name === 'AI_TypeValidationError') {
			console.error('[ai-extractor] AI SDK Error Details:');
			if (error.text) console.error('[ai-extractor] AI Raw Output Text:', error.text);
			if (error.finishReason) console.error('[ai-extractor] AI Finish Reason:', error.finishReason);
			if (error.response) console.error('[ai-extractor] AI Full Response Object:', JSON.stringify(error.response, null, 2));
		}

		if (error instanceof z.ZodError) {
			console.error('[ai-extractor] Zod validation error (from generateText result if parsing failed internally):', error.errors);
		}
		if (error.cause) {
			console.error('[ai-extractor] Cause of error:', error.cause);
		}
		return null;
	}
}
