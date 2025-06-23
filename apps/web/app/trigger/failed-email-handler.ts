import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import createClient from "./create-client";

// Schema for failed email data
const FailedEmailSchema = z.object({
  userId: z.string(),
  integrationId: z.string(),
  emailData: z.object({
    id: z.string(),
    threadId: z.string().optional(),
    subject: z.string().optional(),
    from: z.string().optional(),
    date: z.string().optional(),
    snippet: z.string().optional(),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
  }),
  failureReason: z.string(),
  retryCount: z.number().default(1),
  originalError: z.string().optional(),
  lastRetryAt: z.string().optional(),
});

export type FailedEmailData = z.infer<typeof FailedEmailSchema>;

// Advanced Error Categories for better handling
export enum ErrorCategory {
  AI_TIMEOUT = "ai_timeout",
  AI_RATE_LIMIT = "ai_rate_limit",
  AI_QUOTA_EXCEEDED = "ai_quota_exceeded",
  AI_INVALID_RESPONSE = "ai_invalid_response",
  DATABASE_CONNECTION = "database_connection",
  DATABASE_CONSTRAINT = "database_constraint",
  TOKEN_EXPIRED = "token_expired",
  TOKEN_INVALID = "token_invalid",
  GMAIL_API_ERROR = "gmail_api_error",
  GMAIL_RATE_LIMIT = "gmail_rate_limit",
  PARSING_ERROR = "parsing_error",
  VALIDATION_ERROR = "validation_error",
  UNKNOWN_ERROR = "unknown_error",
}

// Retry strategy configuration
const RETRY_STRATEGIES = {
  [ErrorCategory.AI_TIMEOUT]: { maxRetries: 3, backoffMs: 5000 },
  [ErrorCategory.AI_RATE_LIMIT]: { maxRetries: 5, backoffMs: 30000 },
  [ErrorCategory.AI_QUOTA_EXCEEDED]: { maxRetries: 0, backoffMs: 0 }, // Don't retry quota issues
  [ErrorCategory.AI_INVALID_RESPONSE]: { maxRetries: 2, backoffMs: 1000 },
  [ErrorCategory.DATABASE_CONNECTION]: { maxRetries: 3, backoffMs: 2000 },
  [ErrorCategory.DATABASE_CONSTRAINT]: { maxRetries: 1, backoffMs: 1000 },
  [ErrorCategory.TOKEN_EXPIRED]: { maxRetries: 1, backoffMs: 0 }, // Immediate retry after refresh
  [ErrorCategory.TOKEN_INVALID]: { maxRetries: 0, backoffMs: 0 }, // Don't retry invalid tokens
  [ErrorCategory.GMAIL_API_ERROR]: { maxRetries: 2, backoffMs: 3000 },
  [ErrorCategory.GMAIL_RATE_LIMIT]: { maxRetries: 4, backoffMs: 60000 },
  [ErrorCategory.PARSING_ERROR]: { maxRetries: 1, backoffMs: 1000 },
  [ErrorCategory.VALIDATION_ERROR]: { maxRetries: 0, backoffMs: 0 }, // Don't retry validation errors
  [ErrorCategory.UNKNOWN_ERROR]: { maxRetries: 2, backoffMs: 5000 },
};

/**
 * Categorize error for appropriate retry strategy
 */
export function categorizeError(error: Error | string): ErrorCategory {
  const errorMessage = typeof error === "string" ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();

  // AI-related errors
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return ErrorCategory.AI_TIMEOUT;
  }
  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests")
  ) {
    return ErrorCategory.AI_RATE_LIMIT;
  }
  if (lowerMessage.includes("quota") || lowerMessage.includes("billing")) {
    return ErrorCategory.AI_QUOTA_EXCEEDED;
  }
  if (
    lowerMessage.includes("invalid response") ||
    lowerMessage.includes("json")
  ) {
    return ErrorCategory.AI_INVALID_RESPONSE;
  }

  // Database errors
  if (
    lowerMessage.includes("connection") ||
    lowerMessage.includes("econnrefused")
  ) {
    return ErrorCategory.DATABASE_CONNECTION;
  }
  if (
    lowerMessage.includes("constraint") ||
    lowerMessage.includes("duplicate key")
  ) {
    return ErrorCategory.DATABASE_CONSTRAINT;
  }

  // Token errors
  if (
    lowerMessage.includes("token expired") ||
    lowerMessage.includes("unauthorized")
  ) {
    return ErrorCategory.TOKEN_EXPIRED;
  }
  if (
    lowerMessage.includes("invalid token") ||
    lowerMessage.includes("invalid_grant")
  ) {
    return ErrorCategory.TOKEN_INVALID;
  }

  // Gmail API errors
  if (lowerMessage.includes("gmail") || lowerMessage.includes("google api")) {
    return ErrorCategory.GMAIL_API_ERROR;
  }

  // Parsing errors
  if (lowerMessage.includes("parse") || lowerMessage.includes("validation")) {
    return ErrorCategory.PARSING_ERROR;
  }

  return ErrorCategory.UNKNOWN_ERROR;
}

/**
 * Determine if error should be retried
 */
export function shouldRetryError(
  category: ErrorCategory,
  currentRetryCount: number,
): { shouldRetry: boolean; backoffMs: number } {
  const strategy = RETRY_STRATEGIES[category];

  return {
    shouldRetry: currentRetryCount < strategy.maxRetries,
    backoffMs: strategy.backoffMs * Math.pow(2, currentRetryCount), // Exponential backoff
  };
}

/**
 * Save failed email to database for manual review
 */
export const saveFailedEmail = task({
  id: "save-failed-email",
  retry: {
    maxAttempts: 2,
    factor: 1.5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: FailedEmailData) => {
    const validatedPayload = FailedEmailSchema.parse(payload);
    const supabase = createClient();

    logger.info("Saving failed email for manual review", {
      userId: validatedPayload.userId,
      emailId: validatedPayload.emailData.id,
      failureReason: validatedPayload.failureReason,
      retryCount: validatedPayload.retryCount,
    });

    try {
      // Insert or update failed email in database
      const { data, error } = await supabase
        .from("failed_email_reviews")
        .upsert(
          {
            user_id: validatedPayload.userId,
            integration_id: validatedPayload.integrationId,
            email_id: validatedPayload.emailData.id,
            email_thread_id: validatedPayload.emailData.threadId || null,
            email_subject: validatedPayload.emailData.subject || "No Subject",
            email_from: validatedPayload.emailData.from || "Unknown Sender",
            email_date: validatedPayload.emailData.date
              ? new Date(validatedPayload.emailData.date).toISOString()
              : new Date().toISOString(),
            email_snippet: validatedPayload.emailData.snippet || "",
            email_body:
              validatedPayload.emailData.bodyText ||
              validatedPayload.emailData.bodyHtml ||
              "",
            failure_reason: validatedPayload.failureReason,
            failure_count: validatedPayload.retryCount,
            failed_at: new Date().toISOString(),
            needs_review: true,
          },
          {
            onConflict: "user_id,email_id",
          },
        )
        .select("id");

      if (error) {
        logger.error("Failed to save failed email to database", {
          error: error.message,
          emailId: validatedPayload.emailData.id,
        });
        throw error;
      }

      logger.info("Successfully saved failed email for manual review", {
        failedEmailId: data?.[0]?.id,
        emailId: validatedPayload.emailData.id,
        userId: validatedPayload.userId,
      });

      return {
        success: true,
        failedEmailId: data?.[0]?.id,
        message: "Failed email saved for manual review",
      };
    } catch (error) {
      logger.error("Error saving failed email", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: validatedPayload.userId,
        emailId: validatedPayload.emailData.id,
      });
      throw error;
    }
  },
});

/**
 * Handle retry logic for failed tasks
 */
export const handleRetryableError = task({
  id: "handle-retryable-error",
  retry: {
    maxAttempts: 1, // This task itself shouldn't retry
  },
  run: async (payload: {
    originalTask: string;
    originalPayload: {
      userId?: string;
      integrationId?: string;
      emailData?: {
        id: string;
        threadId?: string;
        subject?: string;
        from?: string;
        date?: string;
        snippet?: string;
        bodyText?: string;
        bodyHtml?: string;
      };
      [key: string]: unknown;
    };
    error: string;
    retryCount: number;
    userId: string;
  }) => {
    logger.info("Handling retryable error", {
      originalTask: payload.originalTask,
      error: payload.error,
      retryCount: payload.retryCount,
      userId: payload.userId,
    });

    const errorCategory = categorizeError(payload.error);
    const { shouldRetry, backoffMs } = shouldRetryError(
      errorCategory,
      payload.retryCount,
    );

    logger.info("Error categorization result", {
      category: errorCategory,
      shouldRetry,
      backoffMs,
      currentRetryCount: payload.retryCount,
    });

    if (shouldRetry) {
      logger.info("Scheduling retry", {
        originalTask: payload.originalTask,
        retryCount: payload.retryCount + 1,
        backoffMs,
      });

      // Wait for backoff period
      if (backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      // Return retry instructions
      return {
        action: "retry",
        retryCount: payload.retryCount + 1,
        backoffMs,
        category: errorCategory,
      };
    } else {
      logger.warn("Max retries reached or non-retryable error", {
        originalTask: payload.originalTask,
        category: errorCategory,
        finalRetryCount: payload.retryCount,
      });

      // Extract email data if available and save to failed emails
      if (payload.originalPayload?.emailData) {
        await saveFailedEmail.triggerAndWait({
          userId: payload.userId,
          integrationId: payload.originalPayload.integrationId || "unknown",
          emailData: payload.originalPayload.emailData,
          failureReason: `${errorCategory}: ${payload.error}`,
          retryCount: payload.retryCount,
          originalError: payload.error,
          lastRetryAt: new Date().toISOString(),
        });
      }

      return {
        action: "failed",
        category: errorCategory,
        finalRetryCount: payload.retryCount,
        savedToFailedReviews: !!payload.originalPayload?.emailData,
      };
    }
  },
});

/**
 * Cleanup old failed emails that have been resolved
 */
export const cleanupFailedEmails = task({
  id: "cleanup-failed-emails",
  retry: {
    maxAttempts: 2,
    factor: 1.5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
  },
  run: async (payload: { olderThanDays?: number } = {}) => {
    const supabase = createClient();
    const olderThanDays = payload.olderThanDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    logger.info("Starting cleanup of old failed emails", {
      olderThanDays,
      cutoffDate: cutoffDate.toISOString(),
    });

    try {
      // Delete reviewed failed emails older than cutoff date
      const { data, error } = await supabase
        .from("failed_email_reviews")
        .delete()
        .lt("failed_at", cutoffDate.toISOString())
        .eq("needs_review", false)
        .select("id");

      if (error) {
        logger.error("Failed to cleanup old failed emails", {
          error: error.message,
        });
        throw error;
      }

      const deletedCount = data?.length || 0;
      logger.info("Completed cleanup of old failed emails", {
        deletedCount,
        olderThanDays,
      });

      return {
        success: true,
        deletedCount,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      logger.error("Error during failed email cleanup", {
        error: error instanceof Error ? error.message : "Unknown error",
        olderThanDays,
      });
      throw error;
    }
  },
});

/**
 * Get failed emails statistics for monitoring
 */
export const getFailedEmailStats = task({
  id: "get-failed-email-stats",
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: { userId?: string } = {}) => {
    const supabase = createClient();

    logger.info("Getting failed email statistics", { userId: payload.userId });

    try {
      let query = supabase
        .from("failed_email_reviews")
        .select("failure_reason, failure_count, needs_review, failed_at");

      if (payload.userId) {
        query = query.eq("user_id", payload.userId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Failed to get failed email stats", {
          error: error.message,
        });
        throw error;
      }

      // Calculate statistics
      const totalFailed = data?.length || 0;
      const needingReview =
        data?.filter((email) => email.needs_review).length || 0;
      const reviewed = totalFailed - needingReview;

      // Group by failure reason
      const reasonStats =
        data?.reduce(
          (acc, email) => {
            const reason = email.failure_reason || "unknown";
            acc[reason] = (acc[reason] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ) || {};

      // Calculate average retry count
      const avgRetryCount = data?.length
        ? data.reduce((sum, email) => sum + (email.failure_count || 0), 0) /
          data.length
        : 0;

      const stats = {
        totalFailed,
        needingReview,
        reviewed,
        avgRetryCount: Math.round(avgRetryCount * 100) / 100,
        reasonBreakdown: reasonStats,
        userId: payload.userId,
      };

      logger.info("Failed email statistics calculated", stats);

      return stats;
    } catch (error) {
      logger.error("Error getting failed email statistics", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: payload.userId,
      });
      throw error;
    }
  },
});
