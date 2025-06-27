"use server";

import { linkedinScraper } from "@/app/trigger/linkedin-scraper";
import { revalidateJobDiscoveryData } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";

interface JobDiscoveryResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Manual Search Rate Limiting Types
// ═══════════════════════════════════════════════════════════════════════════

interface ManualSearchLimitCheck {
  can_search: boolean;
  searches_used: number;
  daily_limit: number;
  subscription_tier: string;
  resets_at: string;
}

interface ManualSearchUsageResult {
  success: boolean;
  searches_used: number;
  daily_limit: number;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Trigger Actions (Background Jobs)
// ═══════════════════════════════════════════════════════════════════════════

export async function triggerJobScrapingAction(params: {
  keywords: string;
  location?: string;
  geoId?: string;
  filters?: {
    timeRange?: "past-24h" | "past-week" | "past-month" | "any";
    jobType?:
      | "full-time"
      | "part-time"
      | "contract"
      | "temporary"
      | "internship";
    experienceLevel?:
      | "internship"
      | "entry"
      | "associate"
      | "mid-senior"
      | "director"
      | "executive";
    remote?: "remote" | "on-site" | "hybrid" | "any";
    company?: string;
  };
}): Promise<JobDiscoveryResult> {
  try {
    // Get current user from Supabase
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    // ❶ Check manual search rate limits
    const { data: limitCheck, error: limitError } = await supabase
      .rpc("check_manual_search_limit", { p_user_id: user.id })
      .returns<ManualSearchLimitCheck[]>()
      .single();

    if (limitError) {
      console.error("Error checking manual search limits:", limitError);
      return {
        success: false,
        error: "Failed to check search limits",
      };
    }

    if (!limitCheck.can_search) {
      return {
        success: false,
        error: `Daily search limit reached (${limitCheck.searches_used}/${limitCheck.daily_limit})`,
        message: `You've reached your daily limit of ${limitCheck.daily_limit} manual searches. ${
          limitCheck.subscription_tier === "free"
            ? "Upgrade to Pro (50/day) or Executive (200/day) for more searches."
            : "Limit resets tomorrow."
        }`,
      };
    }

    // Define page limits based on subscription tier
    const getPageLimit = (tier: string) => {
      switch (tier) {
        case "executive":
          return 10;
        case "pro":
          return 5;
        default:
          return 1;
      }
    };

    // ❷ Trigger the background job with ScrapingDog API structure
    const handle = await linkedinScraper.trigger({
      userId: user.id,
      keywords: params.keywords,
      location: params.location,
      geoId: params.geoId, // Let LinkedIn scraper handle geoId mapping from location
      pages: getPageLimit(limitCheck.subscription_tier), // ScrapingDog pagination based on tier
      datePosted: params.filters?.timeRange || "any",
      jobType: params.filters?.jobType || "any",
      experienceLevel: params.filters?.experienceLevel || "any",
      remoteFilter: params.filters?.remote || "any",
      autoSave: false, // Manual searches should NEVER auto-save applications
    });

    // ❸ Increment manual search usage (only after successful trigger)
    const { data: usageResult, error: usageError } = await supabase
      .rpc("increment_manual_search_usage", { p_user_id: user.id })
      .returns<ManualSearchUsageResult[]>()
      .single();

    if (usageError) {
      console.error("Error incrementing manual search usage:", usageError);
      // Don't fail the request, just log the error
    }

    // Revalidate cache
    revalidateJobDiscoveryData();

    return {
      success: true,
      data: {
        taskId: handle.id,
        runId: handle.id,
        searchesUsed:
          usageResult?.searches_used || limitCheck.searches_used + 1,
        dailyLimit: usageResult?.daily_limit || limitCheck.daily_limit,
        subscriptionTier: limitCheck.subscription_tier,
      },
      message: `Job scraping started successfully! (${usageResult?.searches_used || limitCheck.searches_used + 1}/${usageResult?.daily_limit || limitCheck.daily_limit} searches used today)`,
    };
  } catch (error) {
    console.error("Error triggering job scraping:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Manual Search Limit Actions
// ═══════════════════════════════════════════════════════════════════════════

export async function getManualSearchLimitsAction(): Promise<JobDiscoveryResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    const { data: limitCheck, error: limitError } = await supabase
      .rpc("check_manual_search_limit", { p_user_id: user.id })
      .returns<ManualSearchLimitCheck[]>()
      .single();

    if (limitError) {
      return {
        success: false,
        error: "Failed to check search limits",
      };
    }

    return {
      success: true,
      data: limitCheck,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Manual trigger for full job-discovery pipeline (Bright Data + ScrapingDog)
// ═══════════════════════════════════════════════════════════════════════════

export async function runDiscoveryNowAction(
  testMode = false,
): Promise<JobDiscoveryResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Dynamic import to avoid circular deps in Next.js bundler
    const { triggerManualJobDiscovery } = await import(
      "@/app/trigger/universal-job-discovery"
    );

    const handle = await triggerManualJobDiscovery.trigger({
      userId: user.id,
      testMode,
    });

    // Revalidate cache so UI refresh picks up new jobs once finished
    revalidateJobDiscoveryData();

    return {
      success: true,
      data: { taskId: handle.id },
      message: "Job discovery has started. Refresh in a minute to see results.",
    };
  } catch (error) {
    console.error("Error triggering runDiscoveryNowAction", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD Actions (Worker API Calls)
// ═══════════════════════════════════════════════════════════════════════════

export async function getJobsAction(params?: {
  limit?: number;
  page?: number;
  status?: string;
}): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    // Build query parameters
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.status) searchParams.append("status", params.status);

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/job-discovery/jobs?${searchParams.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch jobs: ${response.status}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: {
        jobs: result.jobs || [],
        pagination: result.pagination || {
          page: 1,
          limit: 25,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function updateJobStatusAction(
  jobId: string,
  updates: {
    status: "discovered" | "saved" | "ignored" | "applied";
    notes?: string;
  },
): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/job-discovery/jobs/${jobId}/status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to update job status: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate cache
    revalidateJobDiscoveryData();

    return {
      success: true,
      data: result.job,
      message: result.message as string,
    };
  } catch (error) {
    console.error("Error updating job status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getScrapeRunsAction(params?: {
  page?: number;
  limit?: number;
}): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());

    const cookieStore = await cookies();
    const url = `${workerUrl}/api/job-discovery/runs${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch scrape runs: ${response.status}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error fetching scrape runs:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function saveJobToApplicationsAction(
  jobId: string,
): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/job-discovery/jobs/${jobId}/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to save job to applications: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate cache
    revalidateJobDiscoveryData();
    revalidateTag("applications"); // Also revalidate applications since we added one

    return {
      success: true,
      data: result,
      message: result.message as string,
    };
  } catch (error) {
    console.error("Error saving job to applications:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getJobDiscoveryStatsAction(): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/job-discovery/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch stats: ${response.status}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error fetching job discovery stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache Actions
// ═══════════════════════════════════════════════════════════════════════════

export async function revalidateJobDiscoveryCacheAction() {
  try {
    revalidateJobDiscoveryData();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function refreshJobDiscoveryDataAction(): Promise<JobDiscoveryResult> {
  try {
    // Revalidate all job discovery related cache tags
    revalidateJobDiscoveryData();
    return {
      success: true,
      message: "Job discovery data refreshed successfully",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Job Discovery Preferences Actions
// ═══════════════════════════════════════════════════════════════════════════

export async function getJobDiscoveryPreferencesAction(): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/job-discovery/preferences`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch preferences: ${response.status}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error fetching job discovery preferences:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function updateJobDiscoveryPreferencesAction(preferences: {
  target_roles?: string[];
  target_companies?: string[];
  target_locations?: string[];
  excluded_companies?: string[];
  excluded_keywords?: string[];
  salary_min?: number;
  salary_max?: number;
  remote_preference?: "remote_only" | "hybrid" | "on_site" | "any";
  job_types?: string[];
  experience_levels?: string[];
  auto_save_discovered_jobs?: boolean;
  is_active?: boolean;
}): Promise<JobDiscoveryResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/job-discovery/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to update preferences: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate cache
    revalidateJobDiscoveryData();

    return {
      success: true,
      data: result.preferences,
      message: result.message as string,
    };
  } catch (error) {
    console.error("Error updating job discovery preferences:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
