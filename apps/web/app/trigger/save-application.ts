import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  addEmailSourceToApplication,
  findPotentialDuplicates,
  getExistingApplications,
  type ApplicationForComparison,
  type EmailToParse,
} from "./ai-deduplicator";
import createClient from "./create-client";
import { saveFailedEmail } from "./failed-email-handler";

// Updated schema
const SaveApplicationSchema = z.object({
  userId: z.string(),
  integrationId: z.string(),
  emailData: z.object({
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
  aiResult: z.object({
    isJobRelated: z.boolean(),
    companyName: z.string().nullable(),
    jobTitle: z.string().nullable(),
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
      .nullable(),
    applicationDate: z.string().nullable(),
    location: z.string().nullable(),
    salary: z.string().nullable(),
    confidence: z.number(),
    keyEvidence: z.string().nullable(),
    reasoning: z.string(),
  }),
});

export const saveJobApplication = task({
  id: "save-job-application",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: z.infer<typeof SaveApplicationSchema>) => {
    const validatedPayload = SaveApplicationSchema.parse(payload);
    const supabase = createClient();

    logger.info("Saving job application", {
      userId: validatedPayload.userId,
      emailId: validatedPayload.emailData.id,
      company: validatedPayload.aiResult.companyName,
      role: validatedPayload.aiResult.jobTitle,
      confidence: validatedPayload.aiResult.confidence,
    });

    try {
      // Only save if it's job-related and has company name
      if (
        !validatedPayload.aiResult.isJobRelated ||
        !validatedPayload.aiResult.companyName
      ) {
        logger.info("Skipping save - not job-related or missing company name", {
          isJobRelated: validatedPayload.aiResult.isJobRelated,
          hasCompanyName: !!validatedPayload.aiResult.companyName,
        });
        return {
          success: true,
          skipped: true,
          reason: "Not job-related or missing company name",
        };
      }

      // Get existing applications for duplicate detection
      logger.info("Fetching existing applications for duplicate detection");
      const existingApps = await getExistingApplications(
        supabase,
        validatedPayload.userId,
      );

      // Convert email data to proper format for duplicate detection
      const emailContext: EmailToParse = {
        userId: validatedPayload.userId,
        integrationId: validatedPayload.integrationId,
        emailProvider: "gmail",
        gmailMessage: {
          id: validatedPayload.emailData.id,
          threadId: validatedPayload.emailData.threadId || "",
          historyId: validatedPayload.emailData.historyId,
          subject: validatedPayload.emailData.subject,
          from: validatedPayload.emailData.from,
          date: validatedPayload.emailData.date,
          snippet: validatedPayload.emailData.snippet,
          bodyHtml: validatedPayload.emailData.bodyHtml,
          bodyText: validatedPayload.emailData.bodyText,
        },
      };

      // Create new application object for comparison
      const newApplication: ApplicationForComparison = {
        company_name: validatedPayload.aiResult.companyName,
        role: validatedPayload.aiResult.jobTitle || "Unknown Role",
        status: validatedPayload.aiResult.status || "Applied",
        application_date:
          validatedPayload.aiResult.applicationDate ||
          (validatedPayload.emailData.date
            ? new Date(validatedPayload.emailData.date)
                .toISOString()
                .split("T")[0]
            : new Date().toISOString().split("T")[0]), // Only use current date as last resort
        location: validatedPayload.aiResult.location,
        salary_range: validatedPayload.aiResult.salary,
        notes: `AI Analysis (${validatedPayload.aiResult.confidence?.toFixed(2)} confidence): ${validatedPayload.aiResult.reasoning}`,
        source_email_id: validatedPayload.emailData.id,
        source_thread_id: validatedPayload.emailData.threadId,
        manual_entry: false,
      };

      // Check for potential duplicates if there are existing applications
      if (existingApps.length > 0) {
        logger.info("Checking for potential duplicates", {
          existingCount: existingApps.length,
        });

        const duplicateMatches = await findPotentialDuplicates(
          newApplication,
          existingApps,
          emailContext,
        );

        if (duplicateMatches.length > 0) {
          const bestMatch = duplicateMatches[0];

          if (bestMatch.analysis.confidence > 0.8) {
            logger.info("High confidence duplicate detected", {
              existingApplicationId: bestMatch.app.id,
              confidence: bestMatch.analysis.confidence,
            });

            // Add email to application sources instead of creating new
            if (bestMatch.app.id) {
              await addEmailSourceToApplication(
                supabase,
                bestMatch.app.id,
                validatedPayload.emailData.id,
                validatedPayload.emailData.threadId || "",
                validatedPayload.emailData.date || new Date().toISOString(),
                validatedPayload.aiResult.status || "Applied",
                validatedPayload.aiResult.confidence || 0,
              );

              return {
                success: true,
                isDuplicate: true,
                existingApplicationId: bestMatch.app.id,
                confidence: bestMatch.analysis.confidence,
                message: "Email added to existing application sources",
              };
            }
          }
        }
      }

      // No high-confidence duplicate found, create new application
      logger.info("Creating new application");

      const { data: newApp, error: insertError } = await supabase
        .from("applications")
        .insert({
          user_id: validatedPayload.userId,
          company_name: validatedPayload.aiResult.companyName,
          role: validatedPayload.aiResult.jobTitle || "Unknown Role",
          status: validatedPayload.aiResult.status || "Applied",
          application_date:
            validatedPayload.aiResult.applicationDate ||
            (validatedPayload.emailData.date
              ? new Date(validatedPayload.emailData.date)
                  .toISOString()
                  .split("T")[0]
              : new Date().toISOString().split("T")[0]), // Only use current date as last resort
          location: validatedPayload.aiResult.location,
          salary_range: validatedPayload.aiResult.salary,
          notes: `AI Analysis (${validatedPayload.aiResult.confidence?.toFixed(2)} confidence): ${validatedPayload.aiResult.reasoning}`,
          source_email_id: validatedPayload.emailData.id,
          source_thread_id: validatedPayload.emailData.threadId,
          ai_confidence: validatedPayload.aiResult.confidence,
          ai_reasoning: validatedPayload.aiResult.reasoning,
          manual_entry: false,
          // 🔍 USER REVIEW FLAGS: All synced applications require user review
          needs_user_review: true, // All AI-detected applications need user review
          ai_suggested: true, // Mark as AI-suggested for filtering purposes
        })
        .select("id, company_name, role, status")
        .single();

      if (insertError) {
        logger.error("Failed to insert application", {
          error: insertError.message,
        });
        throw insertError;
      }

      logger.info("Successfully created new application", {
        applicationId: newApp.id,
        company: newApp.company_name,
        role: newApp.role,
        status: newApp.status,
        needsUserReview: true, // All synced applications require review
        aiSuggested: true,
      });

      // Trigger auto-enrichment for AI-discovered application
      try {
        const { autoEnrichNewApplication } = await import(
          "./company-enrichment"
        );

        await autoEnrichNewApplication.trigger({
          applicationId: newApp.id,
          companyName: newApp.company_name,
        });

        logger.info("Triggered auto-enrichment for AI application", {
          applicationId: newApp.id,
          companyName: newApp.company_name,
        });
      } catch (error) {
        logger.error("Failed to trigger auto-enrichment for AI application", {
          error,
          applicationId: newApp.id,
          companyName: newApp.company_name,
        });
        // Don't fail the save operation if enrichment trigger fails
      }

      return {
        success: true,
        isDuplicate: false,
        applicationId: newApp.id,
        message: "New application created successfully",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error("Error saving job application", {
        error: errorMessage,
        userId: validatedPayload.userId,
        company: validatedPayload.aiResult.companyName,
      });

      // Save to failed emails for manual processing on final failure
      await saveFailedEmail.triggerAndWait({
        userId: validatedPayload.userId,
        integrationId: validatedPayload.integrationId,
        emailData: {
          id: validatedPayload.emailData.id,
          threadId: validatedPayload.emailData.threadId,
          subject: validatedPayload.emailData.subject,
          from: validatedPayload.emailData.from,
          date: validatedPayload.emailData.date,
          snippet: validatedPayload.emailData.snippet,
          bodyText: validatedPayload.emailData.bodyText || undefined,
          bodyHtml: validatedPayload.emailData.bodyHtml || undefined,
        },
        failureReason: `Application save failed: ${errorMessage}`,
        retryCount: 1,
        originalError: errorMessage,
        lastRetryAt: new Date().toISOString(),
      });

      throw error;
    }
  },
});
