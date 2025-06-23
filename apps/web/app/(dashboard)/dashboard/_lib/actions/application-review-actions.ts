"use server";

import { revalidateApplicationData } from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";

export async function reviewApplication(
  applicationId: string,
  action: "approve" | "delete",
) {
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
      `${workerUrl}/api/applications/${applicationId}/review`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
        body: JSON.stringify({ action }),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to review application: ${response.status}`,
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

    // Revalidate cache using centralized utilities
    revalidateApplicationData();

    return {
      success: true,
      message: `Application ${action}d successfully`,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Unexpected error occurred",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function scrapeJobUrl(url: string) {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const queryParams = new URLSearchParams({ url });
    const response = await fetch(
      `${workerUrl}/api/job-boards/scrape?${queryParams.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to scrape job URL: ${response.status}`,
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

    return {
      success: true,
      data: result.data,
      message: result.message,
      cached: result.cached,
      extractionMethod: result.extractionMethod,
    };
  } catch (error) {
    return {
      success: false,
      error: "Unexpected error occurred while scraping job URL",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Fetch email sources for an application
export async function getApplicationEmailSources(applicationId: string) {
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
      `${workerUrl}/api/applications/${applicationId}/sources`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch email sources: ${response.status}`,
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

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Unexpected error occurred while fetching email sources",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
