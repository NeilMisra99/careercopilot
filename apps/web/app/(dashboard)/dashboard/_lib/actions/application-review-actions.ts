"use server";

import { revalidateApplicationData } from "@/lib/cache";
import { workerClient } from "@/lib/worker-client";

export async function reviewApplication(
  applicationId: string,
  action: "approve" | "delete",
) {
  try {
    const result = await workerClient.reviewApplication(applicationId, action);

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
  } catch {
    return {
      success: false,
      error: "Unexpected error occurred",
    };
  }
}

export async function scrapeJobUrl(url: string) {
  try {
    const result = await workerClient.scrapeJobUrl(url);

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
  } catch {
    return {
      success: false,
      error: "Unexpected error occurred while scraping job URL",
    };
  }
}

// Fetch email sources for an application
export async function getApplicationEmailSources(applicationId: string) {
  try {
    const result = await workerClient.getApplicationEmailSources(applicationId);

    if (result.error) {
      throw new Error(result.error);
    }

    return {
      success: true,
      data: result.data,
    };
  } catch {
    return {
      success: false,
      error: "Unexpected error occurred while fetching email sources",
    };
  }
}
