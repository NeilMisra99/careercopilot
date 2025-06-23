import { logger, schedules, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import createClient from "./create-client";
import { processJobEmail } from "./email-processor";
import { saveJobApplication } from "./save-application";
import { TokenManager } from "./token-manager";

// Integration data schema
const EmailIntegrationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  email_address: z.string(),
  provider: z.string(),
  access_token_encrypted: z.string().nullable(),
  refresh_token_encrypted: z.string().nullable(),
  access_token_expires_at: z.string().nullable(),
  scopes: z.array(z.string()).nullable(),
  sync_status: z.enum(["active", "error", "disabled", "paused"]),
  last_history_id: z.string().nullable(),
  last_history_synced_at: z.string().nullable(),
});

// Constants from Cloudflare Workers
const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users";
const MAX_RESULTS_PER_PAGE = 50;
const INITIAL_FETCH_MAX_MESSAGES = 20;
const INITIAL_FETCH_MAX_DAYS = 30;

// Helper function to update sync progress in database using Supabase client
async function updateSyncProgress(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  integrationId: string,
  progress: {
    status:
      | "preparing"
      | "starting"
      | "processing"
      | "completing"
      | "completed"
      | "error";
    emailsProcessed?: number;
    applicationsFound?: number;
    error?: string;
    currentStep?: string;
  },
) {
  try {
    const now = new Date().toISOString();

    // Update integration sync status and metadata
    const integrationUpdate: {
      sync_in_progress?: boolean;
      sync_error_message?: string | null;
      last_sync_started_at?: string;
      last_sync_completed_at?: string;
      first_sync_completed?: boolean;
      last_sync_summary?: {
        emails_processed: number;
        emails_analyzed: number;
        applications_found: number;
        sync_type: string;
        status: string;
      };
    } = {
      sync_in_progress: !["completed", "error"].includes(progress.status),
      sync_error_message: progress.error || null,
    };

    if (progress.status === "preparing") {
      integrationUpdate.last_sync_started_at = now;
    }

    // 🔥 INCREMENTAL UPDATES: Update progress during processing state too
    if (
      progress.status === "processing" &&
      (progress.emailsProcessed !== undefined ||
        progress.applicationsFound !== undefined)
    ) {
      integrationUpdate.last_sync_summary = {
        emails_processed: progress.emailsProcessed || 0,
        emails_analyzed: progress.emailsProcessed || 0, // Use same value for both fields
        applications_found: progress.applicationsFound || 0,
        sync_type: "manual",
        status: "processing", // Indicate it's still in progress
      };
    }

    // 🔥 ENHANCED: Update summary for all active sync states to support frontend status detection
    if (
      ["preparing", "starting", "completing"].includes(progress.status) &&
      (progress.emailsProcessed !== undefined ||
        progress.applicationsFound !== undefined)
    ) {
      integrationUpdate.last_sync_summary = {
        emails_processed: progress.emailsProcessed || 0,
        emails_analyzed: progress.emailsProcessed || 0,
        applications_found: progress.applicationsFound || 0,
        sync_type: "manual",
        status: progress.status, // Use the actual status
      };
    }

    if (progress.status === "completed") {
      integrationUpdate.last_sync_completed_at = now;
      integrationUpdate.first_sync_completed = true;
      integrationUpdate.last_sync_summary = {
        emails_processed: progress.emailsProcessed || 0,
        emails_analyzed: progress.emailsProcessed || 0,
        applications_found: progress.applicationsFound || 0,
        sync_type: "manual",
        status: "completed",
      };
    }

    // Update integration record (triggers real-time updates)
    const { error: updateError } = await supabase
      .from("user_email_integrations")
      .update(integrationUpdate)
      .eq("id", integrationId);

    if (updateError) {
      logger.error("Failed to update integration", {
        error: updateError.message,
        integrationId,
      });
    }

    logger.info("Updated sync progress via Supabase client", {
      userId,
      status: progress.status,
      emailsProcessed: progress.emailsProcessed,
      applicationsFound: progress.applicationsFound,
    });
  } catch (error) {
    logger.error("Failed to update sync progress", { error, userId });
  }
}

// Extract email headers
function getEmailHeader(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

// Extract body parts (simplified version)
async function extractBodyParts(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{
    mimeType?: string;
    body?: { data?: string };
  }>;
}): Promise<{ text: string | null; html: string | null }> {
  // Simplified extraction - in production, implement full extraction logic
  let text = null;
  let html = null;

  if (payload?.body?.data) {
    // Single part message
    if (payload.mimeType?.includes("text/plain")) {
      text = Buffer.from(payload.body.data, "base64url").toString();
    } else if (payload.mimeType?.includes("text/html")) {
      html = Buffer.from(payload.body.data, "base64url").toString();
    }
  } else if (payload?.parts) {
    // Multi-part message
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        text = Buffer.from(part.body.data, "base64url").toString();
      } else if (part.mimeType === "text/html" && part.body?.data) {
        html = Buffer.from(part.body.data, "base64url").toString();
      }
    }
  }

  return { text, html };
}

// Main Gmail sync task
export const syncGmailIntegrations = task({
  id: "sync-gmail-integrations",
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: { forceSync?: boolean; userId?: string }, { ctx }) => {
    logger.info("Starting Gmail sync", {
      forceSync: payload.forceSync,
      userId: payload.userId,
      runId: ctx.run.id,
    });

    // Create Supabase client with service role
    const supabase = createClient();

    let totalEmailsProcessed = 0;
    let totalApplicationsFound = 0;

    try {
      // Get active Gmail integrations using Supabase client
      let query = supabase
        .from("user_email_integrations")
        .select("*")
        .eq("provider", "gmail")
        .eq("sync_status", "active");

      if (payload.userId) {
        query = query.eq("user_id", payload.userId);
      }

      const { data: integrations, error: integrationsError } = await query;

      if (integrationsError) {
        throw new Error(
          `Failed to fetch integrations: ${integrationsError.message}`,
        );
      }

      logger.info(`Found ${integrations?.length || 0} integrations to sync`);

      if (!integrations || integrations.length === 0) {
        return {
          emailsProcessed: 0,
          applicationsFound: 0,
          integrationsProcessed: 0,
        };
      }

      // Process each integration
      for (const integration of integrations) {
        try {
          const validatedIntegration =
            EmailIntegrationSchema.parse(integration);

          logger.info(`Processing Gmail integration`, {
            userId: validatedIntegration.user_id,
            email: validatedIntegration.email_address,
            integrationId: validatedIntegration.id,
          });

          // 🔥 CONSISTENT: Initialize local counters at integration level
          let emailsAnalyzedCount = 0; // Track all emails analyzed for this integration
          let applicationsFoundCount = 0; // Track job applications found for this integration

          // Update status: Preparing (triggers real-time update)
          await updateSyncProgress(
            supabase,
            validatedIntegration.user_id,
            validatedIntegration.id,
            {
              status: "preparing",
              currentStep: "Initializing Gmail sync...",
            },
          );

          // Initialize token manager for secure token handling
          const tokenManager = new TokenManager();

          // Check if user has valid tokens
          const hasValidTokens = await tokenManager.hasValidTokens(
            validatedIntegration.user_id,
            validatedIntegration.provider,
          );

          if (!hasValidTokens) {
            logger.warn(
              `No valid tokens for integration ${validatedIntegration.id}`,
            );

            await updateSyncProgress(
              supabase,
              validatedIntegration.user_id,
              validatedIntegration.id,
              {
                status: "error",
                error:
                  "No valid access token available. Please reconnect your Gmail account.",
              },
            );
            continue;
          }

          // Get valid access token (auto-refreshes if needed)
          const accessToken = await tokenManager.getAccessToken(
            validatedIntegration.user_id,
            validatedIntegration.provider,
          );

          if (!accessToken) {
            logger.error(
              `Failed to get access token for integration ${validatedIntegration.id}`,
            );

            await updateSyncProgress(
              supabase,
              validatedIntegration.user_id,
              validatedIntegration.id,
              {
                status: "error",
                error:
                  "Failed to refresh access token. Please reconnect your Gmail account.",
              },
            );
            continue;
          }

          // Update status: Starting (triggers real-time update)
          await updateSyncProgress(
            supabase,
            validatedIntegration.user_id,
            validatedIntegration.id,
            {
              status: "starting",
              currentStep: "Fetching Gmail messages...",
            },
          );

          // Fetch Gmail messages
          const daysAgo = new Date();
          daysAgo.setDate(daysAgo.getDate() - INITIAL_FETCH_MAX_DAYS);
          const queryDate = Math.floor(daysAgo.getTime() / 1000);

          let messagesFetched = 0;
          let nextPageToken: string | undefined = undefined;

          // Update status: Processing (triggers real-time update)
          await updateSyncProgress(
            supabase,
            validatedIntegration.user_id,
            validatedIntegration.id,
            {
              status: "processing",
              currentStep: "Analyzing emails for job applications...",
              emailsProcessed: 0,
              applicationsFound: 0,
            },
          );

          while (messagesFetched < INITIAL_FETCH_MAX_MESSAGES) {
            const listUrl = new URL(`${GMAIL_API_BASE_URL}/me/messages`);
            listUrl.searchParams.append(
              "maxResults",
              String(
                Math.min(
                  MAX_RESULTS_PER_PAGE,
                  INITIAL_FETCH_MAX_MESSAGES - messagesFetched,
                ),
              ),
            );
            listUrl.searchParams.append(
              "q",
              `after:${queryDate} -category:social -category:promotions -category:forums`,
            );
            listUrl.searchParams.append("labelIds", "INBOX");
            if (nextPageToken)
              listUrl.searchParams.append("pageToken", nextPageToken);

            // Use the validated access token
            const listResponse = await fetch(listUrl.toString(), {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!listResponse.ok) {
              const errorText = await listResponse.text();
              logger.error(
                `Gmail API error for integration ${validatedIntegration.id}:`,
                {
                  status: listResponse.status,
                  statusText: listResponse.statusText,
                  error: errorText,
                },
              );

              // If token error, mark integration as needing reauth
              if (listResponse.status === 401) {
                await updateSyncProgress(
                  supabase,
                  validatedIntegration.user_id,
                  validatedIntegration.id,
                  {
                    status: "error",
                    error:
                      "Gmail authentication expired. Please reconnect your account.",
                  },
                );
              }
              break;
            }

            const listResult = await listResponse.json();

            if (!listResult.messages || listResult.messages.length === 0) {
              logger.info(
                `No more messages for integration ${validatedIntegration.id}`,
              );
              break;
            }

            // Process each message
            for (const msgMeta of listResult.messages) {
              messagesFetched++;
              emailsAnalyzedCount++; // Count every email we analyze (moved to match processing order)

              try {
                // Fetch full message details
                const messageDetailUrl = `${GMAIL_API_BASE_URL}/me/messages/${msgMeta.id}?format=full`;
                const messageDetailResponse = await fetch(messageDetailUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (!messageDetailResponse.ok) {
                  logger.warn(`Failed to fetch message ${msgMeta.id}:`, {
                    status: messageDetailResponse.status,
                  });
                  // Still count this as analyzed even if fetching failed
                  continue;
                }

                const fullMsg = await messageDetailResponse.json();

                // Extract email content
                const { text: bodyText, html: bodyHtml } =
                  await extractBodyParts(fullMsg.payload);

                // Extract headers
                const headers = fullMsg.payload?.headers || [];
                const subject = getEmailHeader(headers, "subject");
                const from = getEmailHeader(headers, "from");
                const date = getEmailHeader(headers, "date");

                // Create email data for processing
                const emailData = {
                  userId: validatedIntegration.user_id,
                  integrationId: validatedIntegration.id,
                  emailProvider: "gmail" as const,
                  gmailMessage: {
                    id: fullMsg.id,
                    threadId: fullMsg.threadId,
                    historyId: fullMsg.historyId,
                    snippet: fullMsg.snippet,
                    subject,
                    from,
                    date,
                    bodyHtml,
                    bodyText,
                  },
                };

                // Trigger email processing task
                const processingResult =
                  await processJobEmail.triggerAndWait(emailData);

                if (
                  processingResult.ok &&
                  processingResult.output?.isJobRelated
                ) {
                  // If job-related, trigger save application task
                  const saveResult = await saveJobApplication.triggerAndWait({
                    userId: validatedIntegration.user_id,
                    integrationId: validatedIntegration.id,
                    emailData: {
                      id: fullMsg.id,
                      threadId: fullMsg.threadId,
                      historyId: fullMsg.historyId,
                      snippet: fullMsg.snippet,
                      subject,
                      from,
                      date,
                      bodyHtml,
                      bodyText,
                    },
                    aiResult: processingResult.output,
                  });

                  if (!saveResult.ok) {
                    throw new Error(
                      `Error saving application: ${saveResult.error}`,
                    );
                  }

                  applicationsFoundCount++; // Count applications found
                  totalApplicationsFound++;
                }

                totalEmailsProcessed++; // 🔥 CONSISTENT: Always increment global counter after processing

                // 🔥 FIXED REALTIME PROGRESS UPDATES: Update every 3 emails to reduce race conditions
                // This balances realtime feedback with database write frequency
                if (emailsAnalyzedCount % 3 === 0) {
                  await updateSyncProgress(
                    supabase,
                    validatedIntegration.user_id,
                    validatedIntegration.id,
                    {
                      status: "processing",
                      currentStep: `Analyzed ${emailsAnalyzedCount} emails, found ${applicationsFoundCount} applications...`,
                      emailsProcessed: emailsAnalyzedCount, // 🔥 CONSISTENT: Always use local counter
                      applicationsFound: applicationsFoundCount,
                    },
                  );
                }
              } catch (error) {
                logger.error(`Error processing message ${msgMeta.id}:`, {
                  error,
                });

                // 🔥 FIXED: Use consistent local counters in error handling too
                // Less frequent error updates to avoid spam
                if (emailsAnalyzedCount % 5 === 0) {
                  await updateSyncProgress(
                    supabase,
                    validatedIntegration.user_id,
                    validatedIntegration.id,
                    {
                      status: "processing", // Continue processing despite individual email errors
                      currentStep: `Processing emails (${emailsAnalyzedCount} analyzed, ${applicationsFoundCount} applications found)...`,
                      emailsProcessed: emailsAnalyzedCount, // 🔥 CONSISTENT: Use local counter
                      applicationsFound: applicationsFoundCount, // 🔥 CONSISTENT: Use local counter
                    },
                  );
                }
                continue;
              }
            }

            nextPageToken = listResult.nextPageToken;
            if (!nextPageToken) break;
          }

          // Update status: Completing (triggers real-time update)
          await updateSyncProgress(
            supabase,
            validatedIntegration.user_id,
            validatedIntegration.id,
            {
              status: "completing",
              currentStep: "Finalizing sync...",
              emailsProcessed: emailsAnalyzedCount, // Use local counter for this integration
              applicationsFound: applicationsFoundCount, // Use local counter for this integration
            },
          );

          // Update status: Completed (triggers real-time update)
          await updateSyncProgress(
            supabase,
            validatedIntegration.user_id,
            validatedIntegration.id,
            {
              status: "completed",
              currentStep: "Sync completed successfully!",
              emailsProcessed: emailsAnalyzedCount, // Use local counter for this integration
              applicationsFound: applicationsFoundCount, // Use local counter for this integration
            },
          );

          logger.info(
            `Completed sync for integration ${validatedIntegration.id}`,
            {
              messagesFetched,
              emailsAnalyzed: emailsAnalyzedCount,
              applicationsFound: applicationsFoundCount,
              userId: validatedIntegration.user_id,
            },
          );
        } catch (error) {
          logger.error(`Error processing integration:`, {
            error,
            integrationId: integration.id,
          });

          // 🔥 FIXED: Use global counters for integration-level errors since local vars might not be initialized
          await updateSyncProgress(
            supabase,
            integration.user_id,
            integration.id,
            {
              status: "error",
              error: error instanceof Error ? error.message : "Unknown error",
              emailsProcessed: totalEmailsProcessed, // Use global counter for integration-level errors
              applicationsFound: totalApplicationsFound, // Use global counter for integration-level errors
            },
          );
          continue;
        }
      }

      logger.info("Gmail sync completed", {
        totalEmailsProcessed,
        totalApplicationsFound,
        integrationsProcessed: integrations.length,
      });

      return {
        emailsProcessed: totalEmailsProcessed,
        applicationsFound: totalApplicationsFound,
        integrationsProcessed: integrations.length,
      };
    } catch (error) {
      logger.error("Gmail sync failed", { error });

      // Update error status for user if we have userId (triggers real-time update)
      if (payload.userId) {
        // Get the user's integration to update error status
        const { data: userIntegrations } = await supabase
          .from("user_email_integrations")
          .select("id")
          .eq("user_id", payload.userId)
          .eq("provider", "gmail")
          .limit(1);

        if (userIntegrations && userIntegrations.length > 0) {
          await updateSyncProgress(
            supabase,
            payload.userId,
            userIntegrations[0].id,
            {
              status: "error",
              error: error instanceof Error ? error.message : "Unknown error",
              emailsProcessed: totalEmailsProcessed,
              applicationsFound: totalApplicationsFound,
            },
          );
        }
      }

      throw error;
    }
  },
});

// Scheduled Gmail sync task (runs every 30 minutes)
export const scheduledGmailSync = schedules.task({
  id: "scheduled-gmail-sync",
  cron: "*/30 * * * *", // Every 30 minutes
  run: async () => {
    logger.info("Starting scheduled Gmail sync");

    // Trigger the main sync task without user filter (sync all active integrations)
    const result = await syncGmailIntegrations.trigger({
      forceSync: false,
    });

    logger.info("Scheduled Gmail sync initiated", { taskId: result.id });

    return { taskId: result.id };
  },
});
