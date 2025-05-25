"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";

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
      console.error(
        "User not authenticated for sync status action:",
        userError
      );
      return {
        success: false,
        error: "Authentication required",
      };
    }

    const cookieStore = await cookies();
    const token = cookieStore.toString();

    const response = await fetch(`/api/worker_proxy/gmail/sync-status`, {
      method: "GET",
      headers: {
        Cookie: token, // Pass Supabase JWT cookies
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Worker sync status error:", response.status, data);
      return {
        success: false,
        error: data.message || "Failed to get sync status",
      };
    }

    return {
      success: true,
      data: data,
    };
  } catch (error: unknown) {
    console.error(
      "Error in sync status action:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return {
      success: false,
      error: "Network error while checking sync status",
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
      console.error("User not authenticated for Gmail sync action:", userError);
      return {
        success: false,
        message: "Authentication required",
        error: "Please log in to sync your emails.",
      };
    }

    const cookieStore = await cookies();
    const token = cookieStore.toString();

    const response = await fetch(`/api/worker_proxy/sync/gmail`, {
      method: "POST",
      headers: {
        Cookie: token, // Pass Supabase JWT cookies
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Worker sync error:", response.status, data);

      if (response.status === 429) {
        return {
          success: false,
          message: "Rate limit exceeded",
          error: data.message || "Please wait before trying again.",
        };
      } else if (response.status === 404) {
        return {
          success: false,
          message: "Gmail not connected",
          error: data.message || "Please connect your Gmail account first.",
        };
      } else {
        return {
          success: false,
          message: "Sync failed",
          error: data.message || "An unexpected error occurred.",
        };
      }
    }

    // Revalidate cache tags for dashboard data
    revalidateTag("applications");
    revalidateTag("gmail-messages");

    console.log("Gmail sync initiated successfully for user:", user.id);

    return {
      success: true,
      message: "Emails synced! Your emails are being processed.",
    };
  } catch (error: unknown) {
    console.error(
      "Error in Gmail sync action:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return {
      success: false,
      message: "Network error",
      error: "Failed to connect to the server. Please try again.",
    };
  }
}

export async function revalidateSyncDataAction(): Promise<{
  success: boolean;
}> {
  try {
    console.log("[SYNC REVALIDATION] Starting cache revalidation...");

    // Revalidate all cache tags related to sync data
    console.log("[SYNC REVALIDATION] Revalidating 'applications' tag...");
    revalidateTag("applications");

    console.log("[SYNC REVALIDATION] Revalidating 'applications-board' tag...");
    revalidateTag("applications-board");

    console.log("[SYNC REVALIDATION] Revalidating 'suggestions' tag...");
    revalidateTag("suggestions");

    console.log("[SYNC REVALIDATION] Revalidating 'gmail-messages' tag...");
    revalidateTag("gmail-messages");

    console.log(
      "[SYNC REVALIDATION] Cache revalidation completed successfully"
    );
    return { success: true };
  } catch (error) {
    console.error("[SYNC REVALIDATION] Error revalidating sync data:", error);
    return { success: false };
  }
}
