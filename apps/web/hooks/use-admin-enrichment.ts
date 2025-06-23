import {
  getEnrichmentStatsAction,
  refreshCompanyEnrichmentAction,
  triggerBulkEnrichmentAction,
} from "@/app/(dashboard)/dashboard/_lib/actions/admin-actions";
import { useCallback, useState } from "react";

interface EnrichmentStats {
  totalApplications: number;
  enrichedApplications: number;
  pendingEnrichment: number;
  processingEnrichment: number;
  failedEnrichment: number;
  totalCompaniesEnriched: number;
  staleEnrichments: number;
}

interface BulkEnrichmentOptions {
  batchSize?: number;
  priorityCompanies?: string[];
}

interface AdminEnrichmentResult {
  // Bulk enrichment
  triggerBulkEnrichment: (
    options?: BulkEnrichmentOptions,
  ) => Promise<{
    success: boolean;
    taskId?: string;
    message: string;
    error?: string;
  }>;
  isBulkEnriching: boolean;

  // Statistics
  getStats: () => Promise<EnrichmentStats | null>;
  isLoadingStats: boolean;
  stats: EnrichmentStats | null;

  // Company refresh
  refreshCompanies: (
    companyNames: string[],
  ) => Promise<{
    success: boolean;
    taskId?: string;
    message: string;
    error?: string;
  }>;
  isRefreshing: boolean;

  // General state
  error: string | null;
  clearError: () => void;
}

export function useAdminEnrichment(): AdminEnrichmentResult {
  const [isBulkEnriching, setIsBulkEnriching] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<EnrichmentStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const triggerBulkEnrichment = useCallback(
    async (options: BulkEnrichmentOptions = {}) => {
      console.log(`🚀 [ADMIN HOOK] Starting bulk enrichment`, options);
      setIsBulkEnriching(true);
      setError(null);

      try {
        const result = await triggerBulkEnrichmentAction(
          options.batchSize || 50,
          options.priorityCompanies || [],
        );

        console.log(`📥 [ADMIN HOOK] Bulk enrichment result:`, {
          success: result.success,
          taskId: result.taskId,
          message: result.message,
        });

        if (!result.success) {
          setError(result.error || "Failed to start bulk enrichment");
        }

        return {
          success: result.success,
          taskId: result.taskId,
          message: result.message,
          error: result.error,
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error(`❌ [ADMIN HOOK] Bulk enrichment error:`, errorMessage);
        setError(errorMessage);
        return {
          success: false,
          message: "Failed to start bulk enrichment",
          error: errorMessage,
        };
      } finally {
        setIsBulkEnriching(false);
      }
    },
    [],
  );

  const getStats = useCallback(async (): Promise<EnrichmentStats | null> => {
    console.log(`📊 [ADMIN HOOK] Fetching enrichment statistics`);
    setIsLoadingStats(true);
    setError(null);

    try {
      const result = await getEnrichmentStatsAction();

      console.log(`📊 [ADMIN HOOK] Statistics result:`, {
        success: result.success,
        hasData: !!result.data,
      });

      if (result.success && result.data) {
        setStats(result.data);
        return result.data;
      } else {
        setError(result.error || "Failed to fetch statistics");
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`❌ [ADMIN HOOK] Statistics error:`, errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const refreshCompanies = useCallback(async (companyNames: string[]) => {
    console.log(`🔄 [ADMIN HOOK] Refreshing companies:`, companyNames);
    setIsRefreshing(true);
    setError(null);

    try {
      const result = await refreshCompanyEnrichmentAction(companyNames);

      console.log(`🔄 [ADMIN HOOK] Company refresh result:`, {
        success: result.success,
        taskId: result.taskId,
        message: result.message,
      });

      if (!result.success) {
        setError(result.error || "Failed to refresh companies");
      }

      return {
        success: result.success,
        taskId: result.taskId,
        message: result.message,
        error: result.error,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`❌ [ADMIN HOOK] Company refresh error:`, errorMessage);
      setError(errorMessage);
      return {
        success: false,
        message: "Failed to refresh companies",
        error: errorMessage,
      };
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return {
    triggerBulkEnrichment,
    isBulkEnriching,
    getStats,
    isLoadingStats,
    stats,
    refreshCompanies,
    isRefreshing,
    error,
    clearError,
  };
}
