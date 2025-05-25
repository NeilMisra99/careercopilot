"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";

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

    // Call worker API for failed emails
    const cookieStore = await cookies();
    const token = cookieStore.toString();

    const response = await fetch(`/api/worker_proxy/gmail/failed-emails`, {
      headers: {
        Cookie: token,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 60, // Cache for 1 minute
        tags: ["failed-emails"],
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
    console.error("Error in getFailedEmailsAction:", error);
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

    // Call worker API to process failed email manually
    const cookieStore = await cookies();
    const token = cookieStore.toString();

    const response = await fetch(
      `/api/worker_proxy/gmail/process-failed-email`,
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

    // Revalidate relevant caches
    revalidateTag("applications");
    revalidateTag("applications-board");
    revalidateTag("failed-emails");

    return {
      success: result.success,
      message: result.message || "Application created from failed email",
      applicationId: result.application?.id,
    };
  } catch (error) {
    console.error("Error in submitManualCorrectionAction:", error);
    return {
      success: false,
      message: "Failed to process email",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
