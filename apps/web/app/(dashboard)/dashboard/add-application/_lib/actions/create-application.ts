"use server";

import { CACHE_TAGS } from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApplicationFormData } from "../types";

interface CreateApplicationResult {
  success?: boolean;
  error?: string;
  data?: {
    id: string;
    company_name: string;
    role: string;
    status: string;
    application_date: string;
    applied_at: string;
    job_url?: string | null;
    location?: string | null;
    salary_range?: string | null;
    notes?: string | null;
  };
}

export async function createApplicationAction(
  formData: ApplicationFormData,
): Promise<CreateApplicationResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        companyName: formData.companyName,
        jobTitle: formData.jobTitle,
        status: formData.status,
        applicationDate: formData.applicationDate,
        jobUrl: formData.jobUrl,
        location: formData.location,
        salary: formData.salary,
        notes: formData.notes,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to create application: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    if (result.success && result.data) {
      // Trigger auto-enrichment for new application
      try {
        const { autoEnrichNewApplication } = await import(
          "@/app/trigger/company-enrichment"
        );

        await autoEnrichNewApplication.trigger({
          applicationId: result.data.id,
          companyName: formData.companyName,
          priority: "high", // New manual applications get high priority
        });
      } catch (error) {
        console.error("Failed to trigger auto-enrichment:", error);
        // Don't fail the whole operation if enrichment trigger fails
      }

      // Revalidate relevant data and redirect
      revalidateTag(CACHE_TAGS.APPLICATIONS_DATA);
      revalidateTag(CACHE_TAGS.DASHBOARD_DATA);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/board");

      redirect("/dashboard/board");
    } else {
      return {
        error: result.error || "Failed to create application",
      };
    }
  } catch {
    return {
      success: false,
      error: "Unexpected error occurred",
    };
  }
}
