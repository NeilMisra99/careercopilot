"use server";

import type { syncGmailIntegrations } from "@/app/trigger/gmail-sync";
import {
  revalidateAllCacheAndPages,
  revalidateApplicationData,
  revalidateGmailData,
} from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";

interface SyncResponse {
  success: boolean;
  message: string;
  error?: string;
  taskId?: string;
}

interface SyncStatusResponse {
  success: boolean;
  data?: {
    integration?: {
      id: string;
      email: string;
      firstSyncCompleted?: boolean;
      syncStatus?: string;
    };
    sync?: {
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
    rateLimit?: {
      canSyncNow: boolean;
      rateLimitedUntil: string | null;
      lastManualSync?: string | null;
      rateLimitMinutes?: number;
    };
    // Trigger.dev task status
    taskStatus?: {
      id: string;
      status: string;
      isCompleted: boolean;
      isSuccess: boolean;
      isFailed: boolean;
      output?: unknown;
      error?: unknown;
    };
  };
  error?: string;
}

export async function getSyncStatusAction(): Promise<SyncStatusResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    // Get Gmail integration from database with rate limiting fields
    const { data: integration, error: integrationError } = await supabase
      .from("user_email_integrations")
      .select(
        `
        *,
        last_manual_sync_at,
        next_sync_allowed_at,
        sync_rate_limit_minutes
      `,
      )
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .single();

    if (integrationError || !integration) {
      return {
        success: false,
        error: "Gmail integration not found",
      };
    }

    // Check rate limiting using the database function
    const { data: canSyncData, error: rateLimitError } = await supabase.rpc(
      "can_user_sync_now",
      {
        p_user_id: user.id,
        p_provider: "gmail",
      },
    );

    if (rateLimitError) {
      console.error("Error checking rate limit:", rateLimitError);
    }

    const canSyncNow = rateLimitError ? true : canSyncData; // Default to true if error
    const rateLimitedUntil = integration.next_sync_allowed_at;

    // Get sync summary data
    const { data: syncSummary, error: syncError } = await supabase
      .from("sync_summaries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Format response
    const response = {
      integration: {
        id: integration.id,
        email: integration.email_address,
        firstSyncCompleted: integration.first_sync_completed || false,
        syncStatus: integration.sync_status,
      },
      sync: {
        inProgress: integration.sync_in_progress,
        lastStarted: integration.last_sync_started_at,
        lastCompleted: integration.last_sync_completed_at,
        lastSummary:
          integration.last_sync_summary ||
          (syncError
            ? null
            : {
                emails_processed: syncSummary?.emails_processed || 0,
                applications_found: syncSummary?.applications_found || 0,
                error: syncSummary?.error || null,
                sync_type: syncSummary?.sync_type || "unknown",
              }),
        lastSuccessfulSync: integration.last_sync_completed_at,
      },
      rateLimit: {
        canSyncNow: canSyncNow,
        rateLimitedUntil: rateLimitedUntil,
        lastManualSync: integration.last_manual_sync_at,
        rateLimitMinutes: integration.sync_rate_limit_minutes || 5,
      },
    };

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    console.error("Error getting sync status:", error);
    return {
      success: false,
      error: "Failed to get sync status",
    };
  }
}

export async function syncGmailNowAction(): Promise<SyncResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        message: "User not authenticated",
        error: "Authentication required",
      };
    }

    // Check rate limiting using the database function
    const { data: canSyncNow, error: rateLimitError } = await supabase.rpc(
      "can_user_sync_now",
      {
        p_user_id: user.id,
        p_provider: "gmail",
      },
    );

    if (rateLimitError) {
      console.error("Error checking rate limit:", rateLimitError);
      return {
        success: false,
        message: "Failed to check rate limit",
        error: "Rate limit check failed",
      };
    }

    if (!canSyncNow) {
      // Get the rate limit info for a proper error message
      const { data: integration } = await supabase
        .from("user_email_integrations")
        .select("next_sync_allowed_at, sync_rate_limit_minutes")
        .eq("user_id", user.id)
        .eq("provider", "gmail")
        .single();

      const rateLimitMinutes = integration?.sync_rate_limit_minutes || 5;

      return {
        success: false,
        message: "Rate limit exceeded",
        error: `You can only sync once every ${rateLimitMinutes} minutes. Please wait before trying again.`,
      };
    }

    // Set rate limit before triggering sync
    const { error: setRateLimitError } = await supabase.rpc(
      "set_sync_rate_limit",
      {
        p_user_id: user.id,
        p_provider: "gmail",
      },
    );

    if (setRateLimitError) {
      console.error("Error setting rate limit:", setRateLimitError);
      // Continue anyway - rate limiting failure shouldn't block sync
    }

    // Trigger the Gmail sync task for this user
    const handle = await tasks.trigger<typeof syncGmailIntegrations>(
      "sync-gmail-integrations",
      {
        forceSync: true,
        userId: user.id,
      },
    );

    // Gmail sync initiated successfully - revalidate related data
    revalidateGmailData();
    revalidateApplicationData();

    return {
      success: true,
      message: "Gmail sync initiated successfully",
      taskId: handle.id,
    };
  } catch (error) {
    console.error("Error triggering Gmail sync:", error);
    return {
      success: false,
      message: "Unexpected error occurred",
      error: "Failed to initiate sync",
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

// 🚀 NEW: Server action to check Trigger.dev task status
export async function getTaskStatusAction(
  taskId: string,
): Promise<SyncStatusResponse> {
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

    // This would need to be implemented with Trigger.dev management SDK
    // For now, returning a placeholder
    return {
      success: true,
      data: {
        taskStatus: {
          id: taskId,
          status: "COMPLETED",
          isCompleted: true,
          isSuccess: true,
          isFailed: false,
        },
      },
    };
  } catch {
    return {
      success: false,
      error: "Unexpected error occurred",
    };
  }
}
