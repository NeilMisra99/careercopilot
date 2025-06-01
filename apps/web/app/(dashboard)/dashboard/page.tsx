import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { workerClient } from "@/lib/worker-client";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardWithRealtime } from "./_components/dashboard-with-realtime";

// Interfaces for Gmail data, aligned with worker response
interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  error?: string; // In case a specific message fetch failed within the batch
  details?: string; // For additional error details from worker
}

interface GmailMessagesApiResponse {
  messages?: EmailMessage[];
  message?: string; // For "No messages found" type messages from worker
  error?: string; // For overall errors from the worker endpoint
  details?: string; // For additional error details from worker
  integratedGmailAddress?: string | null; // Added field
}

// Interface for applications data
interface Application {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  source_email_id?: string;
  source_thread_id?: string;
}

interface ApplicationsApiResponse {
  data?: Application[];
  error?: string;
  details?: string;
}

interface PendingApplication {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  ai_suggested: boolean;
  ai_confidence: number;
  ai_reasoning: string;
  needs_user_review: boolean;
  source_email_id?: string;
  source_thread_id?: string;
  job_url?: string;
  location?: string;
  salary_range?: string;
  notes?: string;
}

// Cached Gmail messages fetcher - cookies moved outside
const getCachedGmailMessages = unstable_cache(
  async (cookieString: string): Promise<GmailMessagesApiResponse> => {
    try {
      const result = await workerClient.getGmailMessages(cookieString);

      if (result.error) {
        return {
          error: result.error,
          details: result.details,
        };
      }

      // The Worker returns messages and integratedGmailAddress directly
      const gmailResponse = result as unknown as GmailMessagesApiResponse;
      const messages = gmailResponse.messages || [];
      const integratedGmailAddress = gmailResponse.integratedGmailAddress;

      return {
        messages,
        integratedGmailAddress,
      };
    } catch (error: unknown) {
      return {
        error: "Failed to fetch Gmail messages",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  [CACHE_TAGS.GMAIL_MESSAGES],
  {
    tags: [CACHE_TAGS.GMAIL_MESSAGES, CACHE_TAGS.DASHBOARD_DATA],
    revalidate: CACHE_CONFIG.MEDIUM.revalidate,
  },
);

async function getGmailMessages(
  cookieString: string,
): Promise<GmailMessagesApiResponse> {
  return getCachedGmailMessages(cookieString);
}

// Cached applications data fetcher - cookies moved outside
const getCachedApplicationsData = unstable_cache(
  async (cookieString: string): Promise<ApplicationsApiResponse> => {
    try {
      const result = await workerClient.getApplications(cookieString);

      if (result.error) {
        return {
          error: result.error,
          details: result.details,
        };
      }

      // Worker returns { data: [...] } for applications
      const applications = result.data || [];

      return { data: applications as Application[] };
    } catch (error: unknown) {
      return {
        error: "Failed to fetch applications",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  [CACHE_TAGS.APPLICATIONS_DATA],
  {
    tags: [CACHE_TAGS.APPLICATIONS_DATA, CACHE_TAGS.DASHBOARD_DATA],
    revalidate: CACHE_CONFIG.MEDIUM.revalidate,
  },
);

// Function to fetch applications data from Cloudflare Worker
async function getApplicationsData(
  cookieString: string,
): Promise<ApplicationsApiResponse> {
  return getCachedApplicationsData(cookieString);
}

// Cached pending applications data fetcher - cookies moved outside
const getCachedPendingApplicationsData = unstable_cache(
  async (
    cookieString: string,
  ): Promise<{
    data?: PendingApplication[];
    error?: string;
    details?: string;
  }> => {
    try {
      const result = await workerClient.getPendingApplications(cookieString);

      if (result.error) {
        return {
          error: result.error,
          details: result.details,
        };
      }

      // Worker returns { data: [...] } for pending applications
      const pendingApplications = result.data || [];

      return { data: pendingApplications as PendingApplication[] };
    } catch (error: unknown) {
      return {
        error: "Failed to fetch pending applications",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  [CACHE_TAGS.PENDING_APPLICATIONS],
  {
    tags: [CACHE_TAGS.PENDING_APPLICATIONS, CACHE_TAGS.DASHBOARD_DATA],
    revalidate: CACHE_CONFIG.SHORT.revalidate,
  },
);

// Function to fetch pending applications from Cloudflare Worker
async function getPendingApplicationsData(cookieString: string): Promise<{
  data?: PendingApplication[];
  error?: string;
  details?: string;
}> {
  return getCachedPendingApplicationsData(cookieString);
}

// Cached dashboard data aggregator - cookies moved outside
const getCachedDashboardData = unstable_cache(
  async (
    cookieString: string,
  ): Promise<{
    totalApplications: number;
    interviewsScheduled: number;
    offersReceived: number;
    recentActivity: Array<{
      id: string;
      type:
        | "application_created"
        | "status_update"
        | "interview_scheduled"
        | "email_sync"
        | "offer_received"
        | "application_rejected";
      title: string;
      description: string;
      timestamp: string;
      metadata?: {
        company?: string;
        role?: string;
        previousStatus?: string;
        newStatus?: string;
        interviewDate?: string;
        interviewType?: string;
        location?: string;
        salary?: string;
        emailCount?: number;
        applicationsFound?: number;
      };
    }>;
    rawApplications: Application[];
    rawPendingApplications: PendingApplication[];
    errors: {
      applications?: string;
      pendingApplications?: string;
    };
  }> => {
    console.log("FRESH DATA - Dashboard data fetched from API");

    const [applicationsResult, pendingApplicationsResult] = await Promise.all([
      getApplicationsData(cookieString),
      getPendingApplicationsData(cookieString),
    ]);

    const applications = applicationsResult.data || [];
    const pendingApplications = pendingApplicationsResult.data || [];

    // Calculate metrics
    const totalApplications = applications.length + pendingApplications.length;
    const interviewsScheduled = applications.filter(
      (app) => app.status === "Interviewing",
    ).length;
    const offersReceived = applications.filter(
      (app) => app.status === "Offer",
    ).length;

    // Create recent activity feed
    const recentActivity: Array<{
      id: string;
      type:
        | "application_created"
        | "status_update"
        | "interview_scheduled"
        | "email_sync"
        | "offer_received"
        | "application_rejected";
      title: string;
      description: string;
      timestamp: string;
      metadata?: {
        company?: string;
        role?: string;
        previousStatus?: string;
        newStatus?: string;
        interviewDate?: string;
        interviewType?: string;
        location?: string;
        salary?: string;
        emailCount?: number;
        applicationsFound?: number;
      };
    }> = [];

    // Add application events to recent activity
    [...applications, ...pendingApplications]
      .sort(
        (a, b) =>
          new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime(),
      )
      .slice(0, 10)
      .forEach((app) => {
        const baseActivity = {
          id: `app-${app.id}`,
          timestamp: app.applied_at,
          metadata: {
            company: app.company_name,
            role: app.role,
          },
        };

        if (app.status === "Offer") {
          recentActivity.push({
            ...baseActivity,
            type: "offer_received",
            title: "Offer Received",
            description: `Received an offer from ${app.company_name} for ${app.role}`,
          });
        } else if (app.status === "Rejected") {
          recentActivity.push({
            ...baseActivity,
            type: "application_rejected",
            title: "Application Update",
            description: `Application to ${app.company_name} was not successful`,
          });
        } else if (app.status === "Interviewing") {
          recentActivity.push({
            ...baseActivity,
            type: "interview_scheduled",
            title: "Interview Scheduled",
            description: `Interview scheduled with ${app.company_name}`,
          });
        } else {
          recentActivity.push({
            ...baseActivity,
            type: "application_created",
            title: "New Application",
            description: `Applied to ${app.company_name} for ${app.role}`,
          });
        }
      });

    // Sort by timestamp (most recent first)
    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const errors: { applications?: string; pendingApplications?: string } = {};
    if (applicationsResult.error) {
      errors.applications = applicationsResult.error;
    }
    if (pendingApplicationsResult.error) {
      errors.pendingApplications = pendingApplicationsResult.error;
    }

    return {
      totalApplications,
      interviewsScheduled,
      offersReceived,
      recentActivity,
      rawApplications: applications,
      rawPendingApplications: pendingApplications,
      errors,
    };
  },
  [CACHE_TAGS.DASHBOARD_DATA],
  {
    tags: [CACHE_TAGS.DASHBOARD_DATA],
    revalidate: CACHE_CONFIG.MEDIUM.revalidate,
  },
);

async function getDashboardData(cookieString: string): Promise<{
  totalApplications: number;
  interviewsScheduled: number;
  offersReceived: number;
  recentActivity: Array<{
    id: string;
    type:
      | "application_created"
      | "status_update"
      | "interview_scheduled"
      | "email_sync"
      | "offer_received"
      | "application_rejected";
    title: string;
    description: string;
    timestamp: string;
    metadata?: {
      company?: string;
      role?: string;
      previousStatus?: string;
      newStatus?: string;
      interviewDate?: string;
      interviewType?: string;
      location?: string;
      salary?: string;
      emailCount?: number;
      applicationsFound?: number;
    };
  }>;
  rawApplications: Application[];
  rawPendingApplications: PendingApplication[];
  errors: {
    applications?: string;
    pendingApplications?: string;
  };
}> {
  return getCachedDashboardData(cookieString);
}

export default async function DashboardPage() {
  // Get cookies outside of cached functions
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  const [dashboardData, gmailData] = await Promise.all([
    getDashboardData(cookieString),
    getGmailMessages(cookieString),
  ]);

  return (
    <DashboardWithRealtime
      user={user}
      initialData={dashboardData}
      gmailData={gmailData}
      integrationEmail={gmailData.integratedGmailAddress}
    />
  );
}
