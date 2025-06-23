import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { generateText } from "ai";
import { z } from "zod";

import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const model = google("gemini-2.0-flash");

// Email data schema for input validation
const EmailToParseSchema = z.object({
  userId: z.string(),
  integrationId: z.string(),
  emailProvider: z.literal("gmail"),
  gmailMessage: z.object({
    id: z.string(),
    threadId: z.string(),
    historyId: z.string(),
    snippet: z.string().optional(),
    subject: z.string().optional(),
    from: z.string().optional(),
    date: z.string().optional(),
    bodyHtml: z.string().nullable().optional(),
    bodyText: z.string().nullable().optional(),
  }),
});

// UNIFIED SCHEMA - Replaces 3 separate AI modules from Cloudflare Workers (excluding duplicate detection)
const UnifiedJobEmailSchema = z.object({
  // Classification (replaces ai-classifier.ts)
  isJobRelated: z
    .boolean()
    .describe("Whether this email is related to job applications"),

  // Extraction (replaces ai-extractor.ts)
  companyName: z
    .string()
    .nullable()
    .describe("The company name mentioned in the email"),
  jobTitle: z.string().nullable().describe("The job title for the application"),
  status: z
    .enum([
      "Opportunity",
      "Applied",
      "Screening",
      "Interviewing",
      "Offer Extended",
      "Offer Accepted",
      "Offer Declined",
      "Rejected",
      "Withdrawn",
      "On Hold",
    ])
    .nullable()
    .describe("The current status of the job application"),

  // Additional extracted fields
  applicationDate: z
    .string()
    .nullable()
    .describe("Date of application in ISO format"),
  location: z.string().nullable().describe("Job location if mentioned"),
  salary: z.string().nullable().describe("Salary range if mentioned"),

  // Confidence (replaces ai-confidence.ts)
  confidence: z.number().min(0).max(1).describe("Confidence score from 0-1"),

  // Evidence & Reasoning
  keyEvidence: z
    .string()
    .nullable()
    .describe("Direct quote from email supporting the status"),
  reasoning: z
    .string()
    .describe("Brief explanation of the classification decision"),
});

export type UnifiedJobEmailData = z.infer<typeof UnifiedJobEmailSchema>;

function createUnifiedPrompt(
  emailData: z.infer<typeof EmailToParseSchema>,
): string {
  const { subject, snippet, from, date, bodyText, bodyHtml } =
    emailData.gmailMessage;

  // Clean HTML content if bodyText is not available (same logic as ai-classifier.ts)
  let emailContent = bodyText;
  if (!emailContent && bodyHtml) {
    try {
      emailContent = bodyHtml
        .replace(/=\r?\n/g, "") // Remove soft line breaks
        .replace(/=([0-9A-F]{2})/g, (match, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        ) // Decode =XX
        .replace(/=3D/g, "=") // Common quoted-printable sequences
        .replace(/=20/g, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove style blocks
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove script blocks
        .replace(/<[^>]+>/g, " ") // Remove all HTML tags
        .replace(/&nbsp;/g, " ") // Convert HTML entities
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ") // Multiple spaces to single space
        .trim();
    } catch (error) {
      logger.warn(`Error cleaning HTML:`, { error });
      emailContent = bodyHtml;
    }
  }
  if (!emailContent) {
    emailContent = snippet || "(No content)";
  }

  // Use full email content for AI processing to avoid missing important details
  const contentForAI = emailContent;

  return `You are an expert AI assistant that analyzes emails for job application tracking. You must perform COMPREHENSIVE analysis combining classification, extraction, and confidence assessment in a SINGLE response.

EMAIL TO ANALYZE:
Subject: ${subject || "(No subject provided)"}
From: ${from || "(Unknown sender)"}
Date: ${date || "(Unknown date)"}
Snippet: ${snippet || "(No snippet)"}
Body: ${contentForAI}

=== TASK 1: CLASSIFICATION ===

You are an expert at identifying job application-related emails. Determine if this email is directly about a specific job application the recipient has already submitted.

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

=== TASK 2: DATA EXTRACTION ===

If the email is job application related, extract the following data with EXTREME PRECISION:

STATUS CLASSIFICATION - Use these EXACT definitions:

**Opportunity**: Recruiting outreach, talent sourcing:
  * "I have an opportunity for you"
  * "Would you be interested in discussing"
  * "I'd like to present you with"
  * Recruiter/talent acquisition emails presenting roles
  * Cold outreach about job opportunities

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

**Offer Extended**: "pleased to offer", "job offer", "we would like to extend an offer"

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
- **Interviewing**: Active requests for participation ("take-home challenge", "schedule interview", "coding test")
- **KEY RULE**: If the email asks you to DO anything (submit code, take assessment, schedule time), it's Interviewing
- **KEY RULE**: If it mentions "interview", "assessment", "challenge", "test", "assignment" → Interviewing
- **KEY RULE**: If it only mentions "review", "consideration", "looking at" → Screening

IMPORTANT ANALYSIS RULES:
1. **Technical Assessments = Interviewing**: Take-home challenges, coding tests, assessments are ALWAYS Interviewing
2. **Action Required = Interviewing**: If they want you to do something beyond wait, it's Interviewing
3. **Recruiter Detection**: Look for recruiting company domains, phrases like "recruiter", "talent acquisition", "recruiting agency", "staffing"
4. **Context Matters**: If email content appears truncated (contains "... [truncated] ..."), be extra careful about status classification
5. **Decision Language**: Phrases like "decided to progress with other candidates" are ALWAYS rejections
6. **Temporal Clues**: Past tense often indicates completed decisions
7. **Emotional Indicators**: "Unfortunately", "regret", "sorry" typically precede negative news
8. **Positive vs Negative**: "Pleased" and "excited" indicate positive outcomes; "unfortunately" and "regret" indicate negative

EXTRACTION REQUIREMENTS:
- Extract exact names/titles as they appear in the email
- Be conservative - use null if uncertain
- Company name is REQUIRED - if you can't find it clearly, the email might not be job-related
- **KEY EVIDENCE**: Include the specific text/phrase from the email that most clearly indicates the status

=== TASK 3: CONFIDENCE ASSESSMENT ===

Calculate confidence score 0.0-1.0 based on:

**Classification Confidence:**
- Clear job-related language with company names (0.8-1.0)
- Some job indicators but ambiguous sender (0.5-0.7)
- Minimal job connection, unclear context (0.2-0.4)
- No job relation indicators (0.0-0.1)

**Extraction Confidence:**
- All fields clearly extracted from email (0.8-1.0)
- Most fields extracted, some uncertain (0.6-0.8)
- Basic fields only, much inference (0.4-0.6)
- Minimal extraction possible (0.2-0.4)

**Data Quality:**
- Professional email format, clear content (0.8-1.0)
- Standard format, some unclear parts (0.6-0.8)
- Basic email, minimal job details (0.4-0.6)
- Poor format, very limited info (0.2-0.4)

=== OUTPUT FORMAT ===

Return ONLY valid JSON wrapped in <json>...</json> tags with this exact structure:

<json>
{
  "isJobRelated": boolean,
  "companyName": "Company Name" | null,
  "jobTitle": "Job Title" | null,
  "status": "Opportunity" | "Applied" | "Screening" | "Interviewing" | "Offer Extended" | "Offer Accepted" | "Offer Declined" | "Rejected" | "Withdrawn" | "On Hold" | null,
  "applicationDate": "YYYY-MM-DD" | null,
  "location": "Location" | null,
  "salary": "Salary range" | null,
  "confidence": 0.95,
  "keyEvidence": "Direct quote from email supporting the status",
  "reasoning": "Brief explanation of the classification decision"
}
</json>

EXAMPLE OUTPUTS:

<json>
{
  "isJobRelated": true,
  "companyName": "Ministry of Public and Business Service Delivery",
  "jobTitle": "Data Science Developer - Senior",
  "status": "Opportunity",
  "applicationDate": null,
  "location": null,
  "salary": null,
  "confidence": 0.85,
  "keyEvidence": "Please see job description given below and let me know if you are interested",
  "reasoning": "Clear recruiting outreach presenting a job opportunity"
}
</json>

<json>
{
  "isJobRelated": true,
  "companyName": "1851Labs",
  "jobTitle": "Software Engineer",
  "status": "Interviewing",
  "applicationDate": null,
  "location": null,
  "salary": null,
  "confidence": 0.92,
  "keyEvidence": "The next step is a small take-home interview",
  "reasoning": "Clear technical assessment request indicates interviewing phase"
}
</json>

<json>
{
  "isJobRelated": true,
  "companyName": "Amazon",
  "jobTitle": "Front-End Engineer",
  "status": "Screening",
  "applicationDate": null,
  "location": null,
  "salary": null,
  "confidence": 0.88,
  "keyEvidence": "your application is currently under review",
  "reasoning": "Passive review status without specific next steps"
}
</json>

<json>
{
  "isJobRelated": true,
  "companyName": "Google",
  "jobTitle": "Senior Software Engineer",
  "status": "Applied",
  "applicationDate": null,
  "location": null,
  "salary": null,
  "confidence": 0.90,
  "keyEvidence": "thank you for your application",
  "reasoning": "Clear application confirmation"
}
</json>

<json>
{
  "isJobRelated": false,
  "companyName": null,
  "jobTitle": null,
  "status": null,
  "applicationDate": null,
  "location": null,
  "salary": null,
  "confidence": 0.95,
  "keyEvidence": "Weekly job digest from LinkedIn",
  "reasoning": "Job board newsletter, not related to specific application"
}
</json>

Now analyze the email above and provide comprehensive results:`;
}

export const processJobEmail = schemaTask({
  id: "process-job-email",
  description: "Process and analyze job application emails using unified AI",
  schema: EmailToParseSchema,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (emailData) => {
    logger.info("Starting unified email processing", {
      userId: emailData.userId,
      emailId: emailData.gmailMessage.id,
      subject: emailData.gmailMessage.subject,
    });

    try {
      const prompt = createUnifiedPrompt(emailData);

      const response = await generateText({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert AI assistant that analyzes emails for job application tracking. Always respond with valid JSON matching the required schema.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        experimental_telemetry: {
          isEnabled: true,
          functionId: "process-job-email",
        },
      });

      // Parse the AI response as JSON
      let parsedResponse;
      try {
        const rawText = response.text;

        // Try 1: Handle <json>...</json> tags
        const jsonStartTag = "<json>";
        const jsonEndTag = "</json>";
        const xmlStartIndex = rawText.indexOf(jsonStartTag);
        const xmlEndIndex = rawText.indexOf(jsonEndTag);

        if (
          xmlStartIndex !== -1 &&
          xmlEndIndex !== -1 &&
          xmlEndIndex > xmlStartIndex
        ) {
          const jsonString = rawText
            .substring(xmlStartIndex + jsonStartTag.length, xmlEndIndex)
            .trim();
          parsedResponse = JSON.parse(jsonString);
        } else {
          // Try 2: Handle ```json ... ``` markdown blocks
          const codeBlockRegex = /```json\s*\n?([\s\S]*?)\n?\s*```/;
          const codeBlockMatch = rawText.match(codeBlockRegex);

          if (codeBlockMatch && codeBlockMatch[1]) {
            const jsonString = codeBlockMatch[1].trim();
            parsedResponse = JSON.parse(jsonString);
          } else {
            // Try 3: Fallback - parse entire response after cleaning
            const cleanResponse = rawText
              .replace(/```json\n?|\n?```/g, "")
              .trim();
            parsedResponse = JSON.parse(cleanResponse);
          }
        }
      } catch (parseError) {
        logger.error("Failed to parse AI response as JSON", {
          error: parseError,
          response: response.text,
        });
        throw new Error("Invalid AI response format");
      }

      // Validate the response against our schema
      const validatedResult = UnifiedJobEmailSchema.parse(parsedResponse);

      logger.info("Email processing completed", {
        userId: emailData.userId,
        emailId: emailData.gmailMessage.id,
        isJobRelated: validatedResult.isJobRelated,
        status: validatedResult.status,
        confidence: validatedResult.confidence,
      });

      return validatedResult;
    } catch (error) {
      logger.error("Error processing email with unified AI", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: emailData.userId,
        emailId: emailData.gmailMessage.id,
      });
      throw error;
    }
  },
});
