"use server";

import { CACHE_TAGS } from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";
import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";

export interface UpdateApplicationData {
  companyName?: string;
  jobTitle?: string;
  status?: string;
  applicationDate?: string;
  jobUrl?: string | null;
  location?: string | null;
  salary?: string | null;
  notes?: string | null;
}

export interface UpdateApplicationResult {
  success: boolean;
  error?: string;
  details?: string;
  data?: {
    id: string;
    company_name: string;
    role: string;
    status: string;
    applied_at: string;
    application_date?: string;
    job_url?: string | null;
    location?: string | null;
    salary_range?: string | null;
    notes?: string | null;
    updated_at?: string;
  };
}

export async function updateApplicationAction(
  applicationId: string,
  updateData: UpdateApplicationData,
): Promise<UpdateApplicationResult> {
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
      `${workerUrl}/api/applications/${applicationId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
        body: JSON.stringify(updateData),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to update application: ${response.status}`,
        details: response.statusText,
      };
    }

    const result = await response.json();

    if (result.error) {
      return {
        success: false,
        error: result.error,
        details: result.details,
      };
    }

    // Revalidate cache tags after successful update
    revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD);
    revalidateTag(CACHE_TAGS.BOARD_DATA);
    revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS);

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Failed to update application",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
