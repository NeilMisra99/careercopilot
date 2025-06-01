"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";

export interface FailedEmail {
  id: string;
  email_id: string;
  email_thread_id: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_date: string | null;
  email_snippet: string | null;
  email_body: string | null;
  failure_reason: string;
  failure_count: number;
  failed_at: string;
  needs_review: boolean;
}

export interface FailedEmailsResponse {
  success: boolean;
  data?: FailedEmail[];
  error?: string;
  message?: string;
}

export interface ManualCorrectionRequest {
  emailId: string;
  companyName: string;
  jobTitle?: string;
  status?: string;
  notes?: string;
}

export interface ManualCorrectionResponse {
  success: boolean;
  message: string;
  error?: string;
  applicationId?: string;
}

export async function getFailedEmailsAction(): Promise<FailedEmailsResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    // Call worker directly
    const cookieStore = await cookies();
    const token = cookieStore.toString();

    const workerUrl = getWorkerUrl();
    const response = await fetch(`${workerUrl}/api/gmail/failed-emails`, {
      headers: {
        Cookie: token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: result.failedEmails || [],
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function submitManualCorrectionAction(
  correction: ManualCorrectionRequest
): Promise<ManualCorrectionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        message: "Not authenticated",
        error: "User session not found",
      };
    }

    // Validate required fields
    if (!correction.emailId || !correction.companyName) {
      return {
        success: false,
        message: "Email ID and company name are required",
        error: "Missing required fields",
      };
    }

    // Call worker directly
    const cookieStore = await cookies();
    const token = cookieStore.toString();

    const workerUrl = getWorkerUrl();
    const response = await fetch(
      `${workerUrl}/api/gmail/process-failed-email`,
      {
        method: "POST",
        headers: {
          Cookie: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(correction),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: "Failed to process email",
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const result = await response.json();

    // Revalidate all relevant caches
    revalidateTag("applications-data");
    revalidateTag("applications-board");
    revalidateTag("failed-emails");
    revalidateTag("dashboard-data");
    revalidateTag("board-data");

    // Revalidate pages to reflect changes
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/board");

    return {
      success: result.success,
      message: result.message || "Application created from failed email",
      applicationId: result.application?.id,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to process email",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
