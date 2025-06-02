import { createWorkersAI } from 'workers-ai-provider';
import { generateText } from 'ai';
import { z } from 'zod';
import type { Ai } from '@cloudflare/workers-types';
import type { EmailToParse } from './types';

const AIParsedApplicationStatusEnum = z.enum([
	'Opportunity',
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
	keyEvidence: z
		.string()
		.nullable()
		.describe(
			'The specific text/phrase from the email that most clearly indicates the status. Should be a direct quote from the email content that supports the status determination.',
		),
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
- For recruiter emails, extract the company the recruiter is reaching out about (the hiring company)

JOB TITLE:
- Extract the specific role title as mentioned in the email
- Include relevant qualifiers: "Senior Software Engineer" not just "Software Engineer"
- If multiple roles mentioned, extract the specific one this email relates to

APPLICATION STATUS CLASSIFICATION (CRITICAL - BE PRECISE):

**Opportunity**: Recruiter outreach, talent sourcing, or job opportunity emails where:
  * Recruiters reach out about positions: "I have an opportunity that may interest you"
  * "Please see job description below and let me know if you are interested"
  * Recruiting agencies presenting roles: "Hope you are doing well! Please see job description..."
  * Talent acquisition teams reaching out with roles
  * Any email where YOU haven't applied yet but someone is presenting you an opportunity
  * Emails from recruiting companies/agencies about open positions

**Applied**: Initial confirmations only:
  * "Thank you for applying"
  * "We received your application"
  * "Your application has been submitted"
  * "Application confirmation"
  * Simple acknowledgment of application receipt

**Screening**: Passive review status only:
  * "We are reviewing your application"
  * "Your application is under review"  
  * "Currently reviewing applications"
  * "Being considered"
  * "Application is being reviewed"
  * General review/consideration language WITHOUT specific next steps

**Interviewing**: ANY active interview process or technical assessment:
  * **Technical Assessments**: "take-home", "coding challenge", "technical test", "assessment", "coding exercise"
  * **Interview Scheduling**: "schedule an interview", "interview invitation", "would like to interview you"
  * **Interview Types**: "phone screen", "technical interview", "behavioral interview", "panel interview"
  * **Next Steps**: "next step is an interview", "proceed to interview", "interview process"
  * **Assignment/Challenge**: ANY request for work samples, coding solutions, projects
  * Key phrase: If they're asking you to DO SOMETHING (code, assess, interview), it's Interviewing

**Offer**: "pleased to offer", "job offer", "we would like to extend an offer"

**Rejected**: ANY of these patterns indicate rejection:
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

**Withdrawn**: Candidate withdrew their application

CRITICAL SCREENING vs INTERVIEWING DISTINCTION:
- **Screening**: Passive status updates about review ("we are reviewing", "under consideration")
- **Interviewing**: Active requests for participation ("take-home challenge", "schedule interview", "coding test", "next step is...")
- **KEY RULE**: If the email asks you to DO anything (submit code, take assessment, schedule time), it's Interviewing
- **KEY RULE**: If it mentions "interview", "assessment", "challenge", "test", "assignment" → Interviewing
- **KEY RULE**: If it only mentions "review", "consideration", "looking at" → Screening

IMPORTANT ANALYSIS RULES:
1. **Technical Assessments = Interviewing**: Take-home challenges, coding tests, assessments are ALWAYS Interviewing
2. **Action Required = Interviewing**: If they want you to do something beyond wait, it's Interviewing
3. **Recruiter Detection**: Look for recruiting company domains, phrases like "recruiter", "talent acquisition", "recruiting agency", "staffing", and emails presenting opportunities rather than responding to applications
4. **Context Matters**: If email content appears truncated (contains "... [truncated] ..."), be extra careful about status classification
5. **Decision Language**: Phrases like "decided to progress with other candidates" or "chosen another candidate" are ALWAYS rejections, regardless of other content
6. **Temporal Clues**: Past tense often indicates completed decisions ("has been reviewed" = decision made, likely screening or rejection)
7. **Emotional Indicators**: "Unfortunately", "regret", "sorry" typically precede negative news
8. **Positive vs Negative**: "Pleased" and "excited" indicate positive outcomes; "unfortunately" and "regret" indicate negative

IMPORTANT: 
- Extract exact names/titles as they appear in the email
- Be conservative - use null if uncertain
- Company name is REQUIRED - if you can't find it clearly, the email might not be job-related
- For MULTI-LANGUAGE emails: Look for rejection/status signals in ALL languages present
- Rejection signals can appear in English, French, or other languages - check the entire email content
- **Pay special attention to decision-making language that indicates finality**
- **KEY EVIDENCE**: Include the specific text/phrase from the email that most clearly indicates the status. This should be a direct quote that supports your status determination.

IMPORTANT STATUS DISTINCTION:
- **Opportunity vs Applied**: If the email is presenting you with a role to consider = Opportunity. If you already applied and they're responding = Applied+
- Future tense (confirmation): "will review", "will be in touch" = Applied
- Past tense (action completed): "was viewed", "has been reviewed" = Screening 
- Present tense (ongoing): "are reviewing", "currently reviewing" = Screening
- **Decision language**: "decided", "chosen", "selected" = Final outcome (offer/rejection)
- Pay attention to progression: if email indicates viewing/reviewing has happened or is happening, status is likely Screening or beyond

Return ONLY valid JSON wrapped in <json>...</json> tags.

EXAMPLE OUTPUTS:

<json>
{
  "companyName": "Ministry of Public and Business Service Delivery",
  "jobTitle": "Data Science Developer - Senior",
  "status": "Opportunity",
  "keyEvidence": "Please see job description given below and let me know if you are interested"
}
</json>

<json>
{
  "companyName": "1851Labs",
  "jobTitle": "Software Engineer",
  "status": "Interviewing",
  "keyEvidence": "The next step is a small take-home interview"
}
</json>

<json>
{
  "companyName": "Amazon",
  "jobTitle": "Front-End Engineer",
  "status": "Screening",
  "keyEvidence": "your application is currently under review"
}
</json>

<json>
{
  "companyName": "Google",
  "jobTitle": "Senior Software Engineer", 
  "status": "Applied",
  "keyEvidence": "thank you for your application"
}
</json>

Now extract data from the email above:
`;
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
