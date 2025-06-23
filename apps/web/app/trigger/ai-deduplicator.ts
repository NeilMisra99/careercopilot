import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const model = google("gemini-2.0-flash");

// === AI Duplicate Detection Schema ===

const DuplicateDetectionSchema = z.object({
  isDuplicate: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  mergeStrategy: z
    .object({
      fieldsToUpdate: z.array(z.string()).optional(),
      notesToAdd: z.string().optional(),
    })
    .optional(),
});

export type DuplicateDetectionResult = z.infer<typeof DuplicateDetectionSchema>;

// === Application Interface for Comparison ===

export interface ApplicationForComparison {
  id?: string;
  company_name: string;
  role: string;
  status: string;
  application_date: string;
  job_url?: string | null;
  location?: string | null;
  salary_range?: string | null;
  notes?: string | null;
  source_email_id?: string | null;
  source_thread_id?: string | null;
  manual_entry?: boolean;
}

// === Email Context Interface ===

export interface EmailToParse {
  userId: string;
  integrationId: string;
  emailProvider: "gmail";
  gmailMessage: {
    id: string;
    threadId: string;
    historyId: string;
    snippet?: string;
    subject?: string;
    from?: string;
    date?: string;
    bodyHtml?: string | null;
    bodyText?: string | null;
  };
}

// === AI Prompt Creation ===

function createDuplicateDetectionPrompt(
  existingApp: ApplicationForComparison,
  newApp: ApplicationForComparison,
  emailContext?: EmailToParse,
): string {
  const emailInfo = emailContext
    ? `
EMAIL CONTEXT:
- Subject: ${emailContext.gmailMessage.subject || "Unknown"}
- From: ${emailContext.gmailMessage.from || "Unknown"}
- Date: ${emailContext.gmailMessage.date || "Unknown"}
- Snippet: ${emailContext.gmailMessage.snippet || "No snippet"}
`
    : "";

  return `You are an AI expert at detecting duplicate job applications. Your task is to determine if two job applications refer to the same opportunity.

EXISTING APPLICATION:
- Company: ${existingApp.company_name}
- Role: ${existingApp.role}
- Status: ${existingApp.status}
- Application Date: ${existingApp.application_date}
- Location: ${existingApp.location || "Not specified"}
- Salary: ${existingApp.salary_range || "Not specified"}
- Job URL: ${existingApp.job_url || "Not specified"}
- Notes: ${existingApp.notes || "None"}
- Manual Entry: ${existingApp.manual_entry ? "Yes" : "No"}

NEW APPLICATION:
- Company: ${newApp.company_name}
- Role: ${newApp.role}
- Status: ${newApp.status}
- Application Date: ${newApp.application_date}
- Location: ${newApp.location || "Not specified"}
- Salary: ${newApp.salary_range || "Not specified"}
- Job URL: ${newApp.job_url || "Not specified"}
- Notes: ${newApp.notes || "None"}
${emailInfo}

ANALYSIS CRITERIA:
1. **Company Match**: Consider variations like "Google Inc." vs "Google", "Microsoft Corp" vs "Microsoft Corporation"
2. **Role Similarity**: "Software Engineer" vs "Software Developer", "Frontend Engineer" vs "Front-end Developer"
3. **Timeline**: Applications within 30 days for the same company/role are likely duplicates
4. **Status Progression**: Later status updates (like "Interviewing" after "Applied") suggest the same application
5. **Location Consistency**: Same city/remote status suggests same opportunity
6. **URL Matching**: Same job posting URL is strong evidence

DECISION RULES:
- **HIGH CONFIDENCE (0.8+)**: Exact company + similar role + reasonable timeline
- **MEDIUM CONFIDENCE (0.6-0.8)**: Similar company + exact role OR exact company + different role
- **LOW CONFIDENCE (0.4-0.6)**: Fuzzy matches requiring human review
- **NOT DUPLICATE (<0.4)**: Different companies or clearly different opportunities

MERGE STRATEGY (if duplicate):
- Suggest which fields to update from the new application
- Provide notes to add explaining the merge

Respond with ONLY the JSON in this exact format:

<json>
{
  "isDuplicate": boolean,
  "confidence": number_between_0_and_1,
  "reasoning": "detailed_explanation_of_your_decision",
  "mergeStrategy": {
    "fieldsToUpdate": ["field1", "field2"],
    "notesToAdd": "Additional context from new email"
  }
}
</json>`;
}

// === AI Duplicate Detection Function ===

export async function detectDuplicateApplication(
  existingApp: ApplicationForComparison,
  newApp: ApplicationForComparison,
  emailContext?: EmailToParse,
): Promise<DuplicateDetectionResult | null> {
  console.log(
    `[ai-deduplicator] 🤖 DUPLICATE DETECTION: Comparing "${existingApp.company_name} - ${existingApp.role}" vs "${newApp.company_name} - ${newApp.role}"`,
  );

  const prompt = createDuplicateDetectionPrompt(
    existingApp,
    newApp,
    emailContext,
  );

  try {
    // Use AI SDK with Gemini 2.0 Flash (same pattern as email-processor.ts)
    const response = await generateText({
      model: model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert AI assistant that detects duplicate job applications. Always respond with valid JSON matching the required schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId: "detect-duplicate-application",
      },
    });

    console.log(
      `[ai-deduplicator] ✅ AI duplicate detection completed successfully`,
    );
    console.log(
      `[ai-deduplicator] 📊 Raw AI result:`,
      JSON.stringify(response, null, 2),
    );

    // Parse the AI response (same pattern as email-processor.ts)
    let parsedResponse;
    try {
      const rawText = response.text;
      const jsonStartTag = "<json>";
      const jsonEndTag = "</json>";

      const startIndex = rawText.indexOf(jsonStartTag);
      const endIndex = rawText.indexOf(jsonEndTag);

      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const jsonString = rawText
          .substring(startIndex + jsonStartTag.length, endIndex)
          .trim();
        parsedResponse = JSON.parse(jsonString);
      } else {
        // Fallback: try to parse without tags (remove any markdown formatting)
        const cleanResponse = rawText.replace(/```json\n?|\n?```/g, "").trim();
        parsedResponse = JSON.parse(cleanResponse);
      }
    } catch (parseError) {
      console.error(
        "[ai-deduplicator] Failed to parse AI response as JSON:",
        parseError,
      );
      console.error("[ai-deduplicator] Raw response:", response.text);
      return null;
    }

    // Validate the response against our schema
    const validatedData = DuplicateDetectionSchema.parse(parsedResponse);

    console.log(
      `[ai-deduplicator] 🎯 DUPLICATE DETECTION RESULT: isDuplicate=${validatedData.isDuplicate}, confidence=${validatedData.confidence}, reasoning="${validatedData.reasoning?.substring(0, 100)}..."`,
    );
    console.log(`[ai-deduplicator] ✅ Duplicate detection successful`);
    return validatedData;
  } catch (error: unknown) {
    const err = error as Error;
    console.error(
      `[ai-deduplicator] ❌ ERROR during AI duplicate detection:`,
      err.message,
    );
    console.error(
      `[ai-deduplicator] ❌ Error stack:`,
      err.stack || "No stack trace",
    );

    if (error instanceof z.ZodError) {
      console.error("[ai-deduplicator] ❌ Zod validation error:", error.errors);
    }
    if ("cause" in err) {
      console.error("[ai-deduplicator] ❌ Cause of error:", err.cause);
    }
    return null;
  }
}

// === Find Potential Duplicates ===

export async function findPotentialDuplicates(
  newApp: ApplicationForComparison,
  existingApps: ApplicationForComparison[],
  emailContext?: EmailToParse,
): Promise<
  Array<{ app: ApplicationForComparison; analysis: DuplicateDetectionResult }>
> {
  console.log(
    `[ai-deduplicator] 🔎 FINDING POTENTIAL DUPLICATES for "${newApp.company_name} - ${newApp.role}" among ${existingApps.length} existing applications`,
  );

  const duplicates: Array<{
    app: ApplicationForComparison;
    analysis: DuplicateDetectionResult;
  }> = [];

  // First, do a quick filter based on company name similarity to reduce AI calls
  const candidateApps = existingApps.filter((app) => {
    // Normalize company names for comparison
    const normalizeCompanyName = (name: string): string => {
      return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ") // Normalize multiple spaces to single space
        .replace(/[^\w\s-]/g, "") // Remove special characters except hyphens and spaces
        .replace(/\s*-\s*/g, "-"); // Normalize hyphens (remove spaces around them)
    };

    const newCompany = normalizeCompanyName(newApp.company_name);
    const existingCompany = normalizeCompanyName(app.company_name);

    // Check for obvious matches or partial matches
    if (newCompany === existingCompany) {
      return true; // Always check exact company matches
    }

    // Failsafe: Check original names without normalization too
    if (
      newApp.company_name.toLowerCase().trim() ===
      app.company_name.toLowerCase().trim()
    ) {
      return true;
    }

    // Check for partial matches (one contains the other)
    if (
      newCompany.includes(existingCompany) ||
      existingCompany.includes(newCompany)
    ) {
      return true;
    }

    // Additional check: If company names are similar, also check role similarity
    const maxLength = Math.max(newCompany.length, existingCompany.length);
    const companyThreshold = Math.min(maxLength * 0.4, 5);
    const companyDistance = levenshteinDistance(newCompany, existingCompany);

    if (companyDistance <= companyThreshold) {
      // Company names are similar, check if roles are also similar
      const newRole = newApp.role.toLowerCase().trim();
      const existingRole = app.role.toLowerCase().trim();
      const roleDistance = levenshteinDistance(newRole, existingRole);
      const roleThreshold = Math.min(
        Math.max(newRole.length, existingRole.length) * 0.5,
        8,
      );

      if (roleDistance <= roleThreshold) {
        return true;
      }
    }

    // Use Levenshtein distance for fuzzy matching (more lenient threshold)
    const distance = levenshteinDistance(newCompany, existingCompany);

    if (distance <= companyThreshold) {
      return true;
    }

    return false;
  });

  console.log(
    `[ai-deduplicator] 📋 Filtered ${existingApps.length} apps to ${candidateApps.length} candidates for AI analysis`,
  );

  // Analyze each candidate with AI
  for (const candidate of candidateApps) {
    const analysis = await detectDuplicateApplication(
      candidate,
      newApp,
      emailContext,
    );

    if (analysis && analysis.isDuplicate && analysis.confidence > 0.7) {
      duplicates.push({ app: candidate, analysis });
    }
  }

  // Sort by confidence (highest first)
  duplicates.sort((a, b) => b.analysis.confidence - a.analysis.confidence);

  console.log(
    `[ai-deduplicator] 🎯 Found ${duplicates.length} confident duplicates (>0.7 confidence)`,
  );

  return duplicates;
}

// === Utility Functions ===

// Simple Levenshtein distance function for quick filtering
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

// Function to merge application data based on AI analysis
export function mergeApplicationData(
  primaryApp: ApplicationForComparison,
  secondaryApp: ApplicationForComparison,
  mergeStrategy: DuplicateDetectionResult["mergeStrategy"],
): ApplicationForComparison {
  if (!mergeStrategy) return primaryApp;

  const merged = { ...primaryApp };

  // Update fields based on merge strategy
  if (mergeStrategy.fieldsToUpdate) {
    for (const field of mergeStrategy.fieldsToUpdate) {
      // Type-safe property access using known keys
      if (field in secondaryApp && field in merged) {
        const secondaryValue =
          secondaryApp[field as keyof ApplicationForComparison];
        const currentValue = merged[field as keyof ApplicationForComparison];

        if (
          secondaryValue &&
          (!currentValue || currentValue === "Unknown Role")
        ) {
          // Create a type-safe assignment using Object.assign
          Object.assign(merged, { [field]: secondaryValue });
        }
      }
    }
  }

  // Merge notes if both have content
  if (mergeStrategy.notesToAdd) {
    const existingNotes = merged.notes || "";
    const separator = existingNotes ? "\n\n" : "";
    merged.notes = existingNotes + separator + mergeStrategy.notesToAdd;
  }

  // Always use the more recent application date
  if (
    new Date(secondaryApp.application_date) >
    new Date(primaryApp.application_date)
  ) {
    merged.application_date = secondaryApp.application_date;
  }

  return merged;
}

// === Helper Functions for Database Operations ===

/**
 * Add additional email source to application_sources table
 * Also updates the application's application_date if this email is chronologically earlier
 */
export async function addEmailSourceToApplication(
  supabase: SupabaseClient,
  applicationId: string,
  emailId: string,
  emailThreadId: string,
  emailDate: string,
  status: string,
  confidence: number,
): Promise<void> {
  try {
    // Parse and normalize the email date
    // Gmail provides dates in format: "Sun, 1 Jun 2025 22:02:25 +0000 (UTC)"
    // We need to convert this to a valid ISO timestamp for PostgreSQL
    let normalizedEmailDate: string;

    try {
      // Try to parse the email date string
      const parsedDate = new Date(emailDate);

      // Check if the date is valid
      if (isNaN(parsedDate.getTime())) {
        console.warn(
          `[ai-deduplicator] Invalid email date format: ${emailDate}, using current time`,
        );
        normalizedEmailDate = new Date().toISOString();
      } else {
        normalizedEmailDate = parsedDate.toISOString();
      }
    } catch {
      console.warn(
        `[ai-deduplicator] Failed to parse email date: ${emailDate}, using current time`,
      );
      normalizedEmailDate = new Date().toISOString();
    }

    // Get the current application to check if we need to update the application_date
    const { data: currentApp, error: fetchError } = await supabase
      .from("applications")
      .select("application_date")
      .eq("id", applicationId)
      .single();

    if (fetchError) {
      console.warn(
        `[ai-deduplicator] Could not fetch current application date: ${fetchError.message}`,
      );
    }

    // Add to application_sources table
    const { error } = await supabase.from("application_sources").upsert(
      {
        application_id: applicationId,
        source_type: "email",
        source_email_id: emailId,
        source_thread_id: emailThreadId,
        email_date: normalizedEmailDate,
        source_notes: `Additional email: ${status} (confidence: ${confidence})`,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "application_id,source_type,source_email_id",
        ignoreDuplicates: false,
      },
    );

    if (error) {
      throw new Error(`Failed to add email source: ${error.message}`);
    }

    // Check if we should update the application_date to use the earlier email date
    if (currentApp?.application_date) {
      const currentAppDate = new Date(currentApp.application_date);
      const newEmailDate = new Date(normalizedEmailDate);

      // If the email is chronologically earlier, update the application date
      if (newEmailDate < currentAppDate) {
        const { error: updateError } = await supabase
          .from("applications")
          .update({
            application_date: normalizedEmailDate.split("T")[0], // Use date portion only
          })
          .eq("id", applicationId);

        if (updateError) {
          console.warn(
            `[ai-deduplicator] Failed to update application date: ${updateError.message}`,
          );
        } else {
          console.log(
            `[ai-deduplicator] 📅 Updated application date from ${currentApp.application_date} to ${normalizedEmailDate.split("T")[0]} (earlier email found)`,
          );
        }
      }
    }

    console.log(
      `[ai-deduplicator] 📎 Added additional email to application_sources with date: ${normalizedEmailDate}`,
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error(
      `[ai-deduplicator] Failed to add email source to application: ${err.message}`,
    );
    throw error;
  }
}

/**
 * Get existing applications for duplicate detection
 */
export async function getExistingApplications(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApplicationForComparison[]> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      `
      id, company_name, role, status, application_date,
      job_url, location, salary_range, notes, 
      source_email_id, source_thread_id, manual_entry
    `,
    )
    .eq("user_id", userId)
    .order("application_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to get existing applications: ${error.message}`);
  }

  return data || [];
}
