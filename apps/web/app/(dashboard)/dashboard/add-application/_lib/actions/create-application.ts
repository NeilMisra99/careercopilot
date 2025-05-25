"use server";

import { type ApplicationFormData } from "../types";

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
  formData: ApplicationFormData
): Promise<CreateApplicationResult> {
  try {
    // Get the base URL for API calls (works both in dev and production)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/worker_proxy/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      return {
        error: errorData.error || "Failed to create application",
      };
    }

    const result = await response.json();

    if (result.error) {
      return {
        error: result.error,
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error in createApplicationAction:", error);
    return {
      error: "An unexpected error occurred while creating the application",
    };
  }
}
