/**
 * Shared utility for getting the Cloudflare Worker URL
 * Used by server components and server actions to call the worker directly
 */
import { cookies } from "next/headers";
import { getWorkerUrl } from "./worker-utils";

interface WorkerRequestOptions {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown> | unknown[];
  params?: Record<string, string | number | boolean>;
  cookieString?: string; // Optional cookie string parameter
}

interface WorkerResponse<T = any> {
  data?: T;
  error?: string;
  details?: string;
  message?: string;
  // Allow any additional fields for cases where Worker returns data directly
  [key: string]: any;
}

// Export the getWorkerUrl function from the shared utils
export { getWorkerUrl } from "./worker-utils";

// Create authenticated headers with Supabase session cookies
async function createAuthenticatedHeaders(
  cookieString?: string
): Promise<HeadersInit> {
  let finalCookieString = cookieString;

  if (!finalCookieString) {
    const cookieStore = await cookies();
    finalCookieString = cookieStore.toString();
  }

  return {
    "Content-Type": "application/json",
    Cookie: finalCookieString,
    "User-Agent": "TrackFlow-NextJS/1.0",
  };
}

// Main function to make authenticated requests to the Worker
export async function callWorker<T = any>(
  options: WorkerRequestOptions
): Promise<WorkerResponse<T>> {
  const { endpoint, method = "GET", body, params, cookieString } = options;

  try {
    const workerUrl = getWorkerUrl();
    const url = new URL(`${workerUrl}${endpoint}`);

    // Add query parameters if provided
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const headers = await createAuthenticatedHeaders(cookieString);

    const requestOptions: RequestInit = {
      method,
      headers,
    };

    // Add body for non-GET requests
    if (body && method !== "GET") {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), requestOptions);

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        error: errorData.error || `Worker request failed: ${response.status}`,
        details: errorData.details || errorData.message || response.statusText,
      };
    }

    const result = await response.json();

    return result;
  } catch (error: any) {
    return {
      error: "Network error calling Worker",
      details: error.message,
    };
  }
}

// Convenience methods for common operations
export const workerClient = {
  // Gmail operations
  async getGmailMessages(cookieString?: string) {
    return callWorker<any[]>({ endpoint: "/api/gmail/messages", cookieString });
  },

  async getGmailUserInfo(cookieString?: string) {
    return callWorker({ endpoint: "/api/gmail/user-info", cookieString });
  },

  async getGmailSyncStatus(cookieString?: string) {
    return callWorker({ endpoint: "/api/gmail/sync-status", cookieString });
  },

  async triggerGmailSync(cookieString?: string) {
    return callWorker({
      endpoint: "/api/gmail/sync-now",
      method: "POST",
      cookieString,
    });
  },

  // Application operations
  async getApplications(cookieString?: string) {
    return callWorker({ endpoint: "/api/applications", cookieString });
  },

  async getPendingApplications(cookieString?: string) {
    return callWorker({
      endpoint: "/api/applications/pending-review",
      cookieString,
    });
  },

  async reviewApplication(
    applicationId: string,
    action: "approve" | "delete",
    cookieString?: string
  ) {
    return callWorker({
      endpoint: `/api/applications/${applicationId}/review`,
      method: "POST",
      body: { action },
      cookieString,
    });
  },

  async updateApplication(
    applicationId: string,
    updates: Record<string, any>,
    cookieString?: string
  ) {
    return callWorker({
      endpoint: `/api/applications/${applicationId}`,
      method: "POST",
      body: updates,
      cookieString,
    });
  },

  async getApplicationEmailSources(
    applicationId: string,
    cookieString?: string
  ) {
    return callWorker({
      endpoint: `/api/applications/${applicationId}/sources`,
      cookieString,
    });
  },

  async createApplication(
    applicationData: Record<string, any>,
    cookieString?: string
  ) {
    return callWorker({
      endpoint: "/api/applications",
      method: "POST",
      body: applicationData,
      cookieString,
    });
  },

  // Job board operations
  async scrapeJobUrl(url: string, cookieString?: string) {
    return callWorker({
      endpoint: "/api/job-boards/scrape",
      params: { url },
      cookieString,
    });
  },

  // Failed email operations
  async getFailedEmails(cookieString?: string) {
    return callWorker({ endpoint: "/api/gmail/failed-emails", cookieString });
  },

  async processFailedEmail(
    emailData: Record<string, any>,
    cookieString?: string
  ) {
    return callWorker({
      endpoint: "/api/gmail/process-failed-email",
      method: "POST",
      body: emailData,
      cookieString,
    });
  },
};
