"use server";

import {
  revalidateMatchData,
  revalidateRecommendationsData,
} from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";

interface MatchResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

export async function getMatchesAction(params?: {
  page?: number;
  limit?: number;
  minScore?: number;
  maxScore?: number;
  applicationId?: string;
  resumeId?: string;
  sortBy?: string;
  sortOrder?: string;
}): Promise<MatchResult> {
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
    if (params?.minScore)
      queryParams.append("minScore", params.minScore.toString());
    if (params?.maxScore)
      queryParams.append("maxScore", params.maxScore.toString());
    if (params?.applicationId)
      queryParams.append("applicationId", params.applicationId);
    if (params?.resumeId) queryParams.append("resumeId", params.resumeId);
    if (params?.sortBy) queryParams.append("sortBy", params.sortBy);
    if (params?.sortOrder) queryParams.append("sortOrder", params.sortOrder);

    const cookieStore = await cookies();
    const url = `${workerUrl}/api/matches${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch matches: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching matches:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getMatchDetailsAction(
  matchId: string,
): Promise<MatchResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/matches/${matchId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch match details: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching match details:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function triggerMatchingAction(
  applicationId: string,
  resumeId: string,
  forceRefresh = false,
): Promise<MatchResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/matches/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        applicationId,
        resumeId,
        forceRefresh,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to trigger matching: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate matches cache using proper cache functions
    revalidateMatchData();

    return {
      success: true,
      data: result.data,
      message: result.message as string,
    };
  } catch (error) {
    console.error("Error triggering matching:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getMatchStatsAction(): Promise<MatchResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/matches/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch match stats: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching match stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getRecommendationsAction(params?: {
  resumeId?: string;
  applicationId?: string;
  type?: string;
  onlyPending?: boolean;
}): Promise<MatchResult> {
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
    if (params?.resumeId) queryParams.append("resumeId", params.resumeId);
    if (params?.applicationId)
      queryParams.append("applicationId", params.applicationId);
    if (params?.type) queryParams.append("type", params.type);
    if (params?.onlyPending)
      queryParams.append("onlyPending", params.onlyPending.toString());

    const cookieStore = await cookies();
    const url = `${workerUrl}/api/recommendations${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch recommendations: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function updateRecommendationAction(
  recommendationId: string,
  updates: {
    isApplied?: boolean;
    userFeedback?: string;
  },
): Promise<MatchResult> {
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
      `${workerUrl}/api/recommendations/${recommendationId}`,
      {
        method: "POST",
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
        error: `Failed to update recommendation: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate recommendations cache
    revalidateRecommendationsData();

    return {
      success: true,
      data: result.data,
      message: result.message as string,
    };
  } catch (error) {
    console.error("Error updating recommendation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Trigger bulk matching for all user applications and resumes
 */
export async function triggerBulkMatchingAction(): Promise<MatchResult> {
  try {
    const { matchJobToResume } = await import(
      "@/app/trigger/job-resume-matcher"
    );
    const { createClient } = await import("@/lib/supabase/server");

    const supabase = await createClient();

    // Get current user
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

    // Get all applications with job descriptions
    const { data: applications, error: appsError } = await supabase
      .from("applications")
      .select("id, notes, company_name, role")
      .eq("user_id", user.id)
      .not("notes", "is", null)
      .neq("notes", "")
      .order("created_at", { ascending: false }); // Get applications starting with most recent

    if (appsError) {
      return {
        success: false,
        error: `Failed to fetch applications: ${appsError.message}`,
      };
    }

    if (!applications || applications.length === 0) {
      return {
        success: false,
        error:
          "No applications with job descriptions found. Add job descriptions to your applications first.",
      };
    }

    // Get all completed resumes
    const { data: resumes, error: resumesError } = await supabase
      .from("resumes")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("parsing_status", "completed");

    if (resumesError) {
      return {
        success: false,
        error: `Failed to fetch resumes: ${resumesError.message}`,
      };
    }

    if (!resumes || resumes.length === 0) {
      return {
        success: false,
        error: "No completed resumes found. Upload and process resumes first.",
      };
    }

    // Trigger matching for each combination of application and resume
    const matchingPromises = [];
    let triggeredCount = 0;

    for (const application of applications) {
      for (const resume of resumes) {
        try {
          const promise = matchJobToResume.trigger({
            applicationId: application.id,
            resumeId: resume.id,
            jobDescription: application.notes || "",
            companyName: application.company_name,
            jobTitle: application.role,
            userId: user.id,
            forceRefresh: true, // Force refresh to regenerate matches
          });

          matchingPromises.push(promise);
          triggeredCount++;
        } catch (error) {
          console.error(
            `Failed to trigger matching for app ${application.id} and resume ${resume.id}:`,
            error,
          );
        }
      }
    }

    if (triggeredCount === 0) {
      return {
        success: false,
        error: "Failed to trigger any matching tasks",
      };
    }

    // Wait for all triggers to be sent (but not for completion)
    await Promise.allSettled(matchingPromises);

    // Revalidate matches cache
    revalidateMatchData();

    return {
      success: true,
      message: `Successfully triggered ${triggeredCount} matching task(s). Results will be available in 1-2 minutes.`,
      data: {
        triggeredTasks: triggeredCount,
        applications: applications.length,
        resumes: resumes.length,
      },
    };
  } catch (error) {
    console.error("Error triggering bulk matching:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to trigger bulk matching",
    };
  }
}
