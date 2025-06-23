"use server";

import { enrichExistingApplications } from "@/app/trigger/company-enrichment";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface BulkEnrichmentResult {
  success: boolean;
  taskId?: string;
  message: string;
  batchSize?: number;
  priorityCompanies?: string[];
  error?: string;
}

interface EnrichmentStats {
  success: boolean;
  data?: {
    totalApplications: number;
    enrichedApplications: number;
    pendingEnrichment: number;
    processingEnrichment: number;
    failedEnrichment: number;
    totalCompaniesEnriched: number;
    staleEnrichments: number;
  };
  error?: string;
}

/**
 * Server Action: Trigger bulk enrichment of existing applications
 */
export async function triggerBulkEnrichmentAction(
  batchSize: number = 50,
  priorityCompanies: string[] = [],
): Promise<BulkEnrichmentResult> {
  try {
    console.log(`📋 [ADMIN ACTION] Starting bulk enrichment`, {
      batchSize,
      priorityCompanies: priorityCompanies.length,
    });

    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Authentication required",
        message: "You must be logged in to perform this action",
      };
    }

    // Validate batch size
    if (batchSize < 1 || batchSize > 500) {
      return {
        success: false,
        error: "Invalid batch size",
        message: "Batch size must be between 1 and 500",
      };
    }

    // Validate priority companies if provided
    if (!Array.isArray(priorityCompanies)) {
      return {
        success: false,
        error: "Invalid priority companies",
        message: "Priority companies must be an array",
      };
    }

    console.log(`📋 [ADMIN ACTION] Triggering enrichment task`, {
      batchSize,
      priorityCompaniesCount: priorityCompanies.length,
    });

    // Trigger the bulk enrichment task
    const taskHandle = await enrichExistingApplications.trigger({
      batchSize,
      priorityCompanies,
    });

    console.log(`✅ [ADMIN ACTION] Bulk enrichment task started`, {
      taskId: taskHandle.id,
    });

    // Revalidate dashboard to reflect changes
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/admin");

    return {
      success: true,
      taskId: taskHandle.id,
      message: `Bulk enrichment started for up to ${batchSize} applications`,
      batchSize,
      priorityCompanies:
        priorityCompanies.length > 0 ? priorityCompanies : undefined,
    };
  } catch (error) {
    console.error(`❌ [ADMIN ACTION] Bulk enrichment trigger error:`, error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to start bulk enrichment",
      message: "An error occurred while starting the enrichment process",
    };
  }
}

/**
 * Server Action: Get enrichment statistics
 */
export async function getEnrichmentStatsAction(): Promise<EnrichmentStats> {
  try {
    console.log(`📊 [ADMIN ACTION] Fetching enrichment statistics`);

    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Authentication required",
      };
    }

    // Get enrichment statistics
    const [applicationsResult, enrichmentResult] = await Promise.all([
      supabase
        .from("applications")
        .select("enrichment_status, enriched_company_id")
        .eq("user_id", user.id),

      supabase.from("company_enrichment").select("id, last_enriched_at"),
    ]);

    if (applicationsResult.error || enrichmentResult.error) {
      throw new Error(
        `Database query failed: ${applicationsResult.error?.message || enrichmentResult.error?.message}`,
      );
    }

    const applications = applicationsResult.data || [];
    const enrichments = enrichmentResult.data || [];

    const stats = {
      totalApplications: applications.length,
      enrichedApplications: applications.filter(
        (app) =>
          app.enriched_company_id && app.enrichment_status === "completed",
      ).length,
      pendingEnrichment: applications.filter(
        (app) => app.enrichment_status === "pending" || !app.enrichment_status,
      ).length,
      processingEnrichment: applications.filter(
        (app) => app.enrichment_status === "processing",
      ).length,
      failedEnrichment: applications.filter(
        (app) => app.enrichment_status === "failed",
      ).length,
      totalCompaniesEnriched: enrichments.length,
      staleEnrichments: enrichments.filter((enrichment) => {
        const lastEnriched = new Date(enrichment.last_enriched_at);
        const isStale =
          Date.now() - lastEnriched.getTime() > 7 * 24 * 60 * 60 * 1000; // 7 days
        return isStale;
      }).length,
    };

    console.log(`📊 [ADMIN ACTION] Enrichment statistics:`, stats);

    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    console.error(`❌ [ADMIN ACTION] Enrichment statistics error:`, error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch enrichment statistics",
    };
  }
}

/**
 * Server Action: Refresh company enrichment data for specific companies
 */
export async function refreshCompanyEnrichmentAction(
  companyNames: string[],
): Promise<BulkEnrichmentResult> {
  try {
    console.log(`🔄 [ADMIN ACTION] Refreshing company enrichment`, {
      companies: companyNames.length,
    });

    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Authentication required",
        message: "You must be logged in to perform this action",
      };
    }

    // Validate input
    if (!Array.isArray(companyNames) || companyNames.length === 0) {
      return {
        success: false,
        error: "Invalid company names",
        message: "At least one company name is required",
      };
    }

    if (companyNames.length > 50) {
      return {
        success: false,
        error: "Too many companies",
        message: "Maximum 50 companies can be refreshed at once",
      };
    }

    // Trigger enrichment for these specific companies
    const taskHandle = await enrichExistingApplications.trigger({
      batchSize: 100, // Higher batch size since we're targeting specific companies
      priorityCompanies: companyNames,
    });

    console.log(`✅ [ADMIN ACTION] Company refresh task started`, {
      taskId: taskHandle.id,
      companies: companyNames.length,
    });

    // Revalidate dashboard
    revalidatePath("/dashboard");

    return {
      success: true,
      taskId: taskHandle.id,
      message: `Started refresh for ${companyNames.length} companies`,
      priorityCompanies: companyNames,
    };
  } catch (error) {
    console.error(`❌ [ADMIN ACTION] Company refresh error:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to refresh companies",
      message: "An error occurred while refreshing company data",
    };
  }
}
