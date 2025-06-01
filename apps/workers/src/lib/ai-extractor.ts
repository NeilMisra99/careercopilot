import { createWorkersAI } from 'workers-ai-provider';
import { generateText } from 'ai';
import { z } from 'zod';
import type { Ai } from '@cloudflare/workers-types';
import type { EmailToParse } from './types';

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
	// Safety check: Ensure gmailMessage exists
	if (!emailData.gmailMessage || typeof emailData.gmailMessage !== 'object') {
		console.error('[ai-extractor] Error: gmailMessage is missing or invalid');
		return 'Error: Invalid email data structure';
	}

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
- If from a job board, look for the actual company name in the body, not the job board name

JOB TITLE:
- Extract the specific role title as mentioned in the email
- Include relevant qualifiers: "Senior Software Engineer" not just "Software Engineer"
- If multiple roles mentioned, extract the specific one this email relates to

APPLICATION STATUS CLASSIFICATION (CRITICAL):
- **Applied**: Initial confirmations, "thank you for applying", "we received your application"
- **Screening**: "reviewing your application", "under review", "being considered", "in review process"
- **Interviewing**: "schedule an interview", "next step is an interview", "interview invitation"
- **Offer**: "pleased to offer", "job offer", "we would like to extend an offer"
- **Rejected**: ANY of these patterns indicate rejection:
  * "decided to progress/proceed with other candidates" ← ALWAYS REJECTION
  * "decided to progress with other candidates" ← ALWAYS REJECTION
  * "have decided to progress with other candidates" ← ALWAYS REJECTION
  * "not moving forward", "will not be moving forward"
  * "unfortunately", "we regret", "sorry to inform"
  * "after careful consideration" + negative outcome
  * "chosen another candidate", "selected another applicant"
  * "do not match", "not a fit", "different direction"
  * "application was unsuccessful", "not successful this time"
  * "position has been filled", "role has been filled"
  * Any phrase indicating the candidate was not selected
  * Any email that indicates they decided on OTHER candidates = rejection
- **Withdrawn**: Candidate withdrew their application

IMPORTANT ANALYSIS RULES:
1. **Context Matters**: If email content appears truncated (contains "... [truncated] ..."), be extra careful about status classification
2. **Decision Language**: Phrases like "decided to progress with other candidates" or "chosen another candidate" are ALWAYS rejections, regardless of other content
3. **Temporal Clues**: Past tense often indicates completed decisions ("has been reviewed" = decision made, likely screening or rejection)
4. **Emotional Indicators**: "Unfortunately", "regret", "sorry" typically precede negative news
5. **Positive vs Negative**: "Pleased" and "excited" indicate positive outcomes; "unfortunately" and "regret" indicate negative

IMPORTANT: 
- Extract exact names/titles as they appear in the email
- Be conservative - use null if uncertain
- Company name is REQUIRED - if you can't find it clearly, the email might not be job-related
- For MULTI-LANGUAGE emails: Look for rejection/status signals in ALL languages present
- Rejection signals can appear in English, French, or other languages - check the entire email content
- **Pay special attention to decision-making language that indicates finality**

IMPORTANT STATUS DISTINCTION:
- Future tense (confirmation): "will review", "will be in touch" = Applied
- Past tense (action completed): "was viewed", "has been reviewed" = Screening 
- Present tense (ongoing): "are reviewing", "currently reviewing" = Screening
- **Decision language**: "decided", "chosen", "selected" = Final outcome (offer/rejection)
- Pay attention to progression: if email indicates viewing/reviewing has happened or is happening, status is likely Screening or beyond

Return ONLY valid JSON wrapped in <json>...</json> tags.

EXAMPLE OUTPUTS:

<json>
{
  "companyName": "Amazon",
  "jobTitle": "Front-End Engineer, GenAI",
  "status": "Rejected"
}
</json>

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
  "status": "Screening"
}
</json>

Now extract data from the email above:`;
}

export async function extractEmailData(emailData: EmailToParse, aiBinding: Ai): Promise<AIParsedDataFromExtractor | null> {
	// Safety check: Ensure emailData is valid
	if (!emailData.gmailMessage || typeof emailData.gmailMessage !== 'object') {
		console.error('[ai-extractor] Error: Invalid emailData structure - gmailMessage is missing');
		return null;
	}

	const workersai = createWorkersAI({ binding: aiBinding as any });
	const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any);

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
