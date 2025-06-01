"use server";

import {
  revalidateAllCacheAndPages,
  revalidateApplicationData,
  revalidateGmailData,
} from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";

interface SyncResponse {
  success: boolean;
  message: string;
  error?: string;
}

interface SyncStatusResponse {
  success: boolean;
  data?: {
    integration: {
      id: string;
      email: string;
    };
    sync: {
      inProgress: boolean;
      lastStarted: string | null;
      lastCompleted: string | null;
      lastSummary: {
        emails_processed: number;
        applications_found: number;
        error: string | null;
        sync_type: "manual" | "scheduled";
      } | null;
      lastSuccessfulSync: string | null;
    };
    rateLimit: {
      canSyncNow: boolean;
      rateLimitedUntil: string | null;
    };
  };
  error?: string;
}

export async function getSyncStatusAction(): Promise<SyncStatusResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/gmail/sync-status`, {
      method: "GET",
      headers: {
        Cookie: cookieStore.toString(),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to get sync status: ${response.status}`,
      };
    }

    const result = await response.json();

    if (result.error) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: result,
    };
  } catch {
    return {
      success: false,
      error: "Unexpected error occurred",
    };
  }
}

export async function syncGmailNowAction(): Promise<SyncResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        message: "User not authenticated",
        error: "Authentication required",
      };
    }

    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        message: "Configuration error",
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/gmail/sync-now`, {
      method: "POST",
      headers: {
        Cookie: cookieStore.toString(),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 429) {
        return {
          success: false,
          message: "Rate limit exceeded",
          error:
            "You can only sync once every 5 minutes. Please wait before trying again.",
        };
      }

      return {
        success: false,
        message: "Sync request failed",
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();

    if (!result.queued && result.error) {
      return {
        success: false,
        message: result.message || "Sync failed",
        error: result.error,
      };
    }

    // Gmail sync initiated successfully - revalidate related data
    revalidateGmailData();
    revalidateApplicationData();

    return {
      success: true,
      message: result.message || "Gmail sync initiated successfully",
    };
  } catch {
    return {
      success: false,
      message: "Unexpected error occurred",
      error: "Unexpected error occurred",
    };
  }
}

export async function revalidateSyncDataAction(): Promise<{
  success: boolean;
}> {
  try {
    // Revalidate all relevant cache data
    revalidateAllCacheAndPages();

    return { success: true };
  } catch {
    return { success: false };
  }
}
