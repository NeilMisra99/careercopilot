import { logger, schedules } from "@trigger.dev/sdk/v3";
import {
  cleanupFailedEmails,
  getFailedEmailStats,
} from "./failed-email-handler";

// Daily maintenance task for error handling system
export const errorHandlingMaintenance = schedules.task({
  id: "error-handling-maintenance",
  cron: "0 2 * * *", // Run daily at 2 AM UTC
  run: async () => {
    logger.info("Starting daily error handling maintenance");

    try {
      // 1. Cleanup old resolved failed emails (older than 30 days)
      logger.info("Cleaning up old resolved failed emails");
      const cleanupResult = await cleanupFailedEmails.triggerAndWait({
        olderThanDays: 30,
      });

      if (!cleanupResult.ok) {
        logger.error("Cleanup failed", {
          error: cleanupResult.error,
        });
        throw new Error("Failed to cleanup old emails");
      }

      logger.info("Cleanup completed", {
        deletedCount: cleanupResult.output.deletedCount,
        cutoffDate: cleanupResult.output.cutoffDate,
      });

      // 2. Get overall system statistics
      logger.info("Gathering failed email statistics");
      const overallStatsResult = await getFailedEmailStats.triggerAndWait({});

      if (!overallStatsResult.ok) {
        logger.error("Failed to get statistics", {
          error: overallStatsResult.error,
        });
        throw new Error("Failed to get failed email statistics");
      }

      const overallStats = overallStatsResult.output;

      // 3. Alert if error rates are high
      const errorRate =
        overallStats.totalFailed /
        Math.max(overallStats.totalFailed + overallStats.reviewed, 1);

      if (errorRate > 0.1) {
        // Alert if more than 10% of emails are failing
        logger.warn("High error rate detected", {
          errorRate: (errorRate * 100).toFixed(2) + "%",
          totalFailed: overallStats.totalFailed,
          needingReview: overallStats.needingReview,
          reasonBreakdown: overallStats.reasonBreakdown,
        });
      }

      // 4. Log daily health summary
      logger.info("Daily error handling health summary", {
        totalFailedEmails: overallStats.totalFailed,
        emailsNeedingReview: overallStats.needingReview,
        reviewedEmails: overallStats.reviewed,
        averageRetryCount: overallStats.avgRetryCount,
        oldEmailsCleanedUp: cleanupResult.output.deletedCount,
        errorRate: (errorRate * 100).toFixed(2) + "%",
        topFailureReasons: Object.entries(overallStats.reasonBreakdown)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([reason, count]) => ({ reason, count })),
      });

      return {
        success: true,
        summary: {
          cleanedUpEmails: cleanupResult.output.deletedCount,
          totalFailedEmails: overallStats.totalFailed,
          emailsNeedingReview: overallStats.needingReview,
          errorRate: errorRate,
          healthStatus:
            errorRate < 0.05
              ? "excellent"
              : errorRate < 0.1
                ? "good"
                : "needs_attention",
        },
      };
    } catch (error) {
      logger.error("Error during maintenance", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  },
});

// Weekly detailed error analysis
export const weeklyErrorAnalysis = schedules.task({
  id: "weekly-error-analysis",
  cron: "0 3 * * 1", // Run every Monday at 3 AM UTC
  run: async () => {
    logger.info("Starting weekly error analysis");

    try {
      // Get detailed statistics
      const statsResult = await getFailedEmailStats.triggerAndWait({});

      if (!statsResult.ok) {
        logger.error("Failed to get statistics for weekly analysis", {
          error: statsResult.error,
        });
        throw new Error("Failed to get failed email statistics");
      }

      const stats = statsResult.output;

      // Analyze error patterns
      const errorAnalysis = {
        totalFailures: stats.totalFailed,
        activeFailures: stats.needingReview,
        resolvedFailures: stats.reviewed,
        avgRetryCount: stats.avgRetryCount,
        topErrorCategories: Object.entries(stats.reasonBreakdown)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 10)
          .map(([reason, count], index) => ({
            rank: index + 1,
            reason,
            count,
            percentage:
              (((count as number) / stats.totalFailed) * 100).toFixed(1) + "%",
          })),
      };

      // Generate recommendations
      const recommendations: string[] = [];

      if (stats.avgRetryCount > 2) {
        recommendations.push(
          "Consider improving retry strategies - high average retry count detected",
        );
      }

      if (stats.needingReview > stats.reviewed) {
        recommendations.push(
          "Manual review queue is growing - consider reviewing failed emails",
        );
      }

      const aiErrors = Object.keys(stats.reasonBreakdown).filter(
        (reason) =>
          reason.toLowerCase().includes("ai") ||
          reason.toLowerCase().includes("timeout") ||
          reason.toLowerCase().includes("quota"),
      ).length;

      if (aiErrors > 0) {
        recommendations.push(
          "AI-related errors detected - review AI service configuration",
        );
      }

      logger.info("Weekly error analysis completed", {
        analysis: errorAnalysis,
        recommendations,
        weekNumber: Math.ceil(new Date().getDate() / 7),
        month: new Date().toLocaleString("default", { month: "long" }),
        year: new Date().getFullYear(),
      });

      return {
        success: true,
        analysis: errorAnalysis,
        recommendations,
        actionItems: [
          ...(recommendations.length > 0
            ? ["Review and act on recommendations"]
            : []),
          "Monitor error trends over time",
          "Update retry strategies if needed",
          "Review manual correction workflows",
        ],
      };
    } catch (error) {
      logger.error("Error during weekly analysis", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  },
});
