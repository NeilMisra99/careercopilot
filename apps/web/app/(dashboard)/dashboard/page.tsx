import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
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

interface AISuggestion {
  id: string;
  suggested_company_name: string;
  suggested_role: string;
  suggested_status: string;
  suggestion_type: string;
  suggestion_lifecycle_status: string;
  raw_email_data?: {
    email_id?: string;
    email_thread_id?: string;
    email_subject?: string;
    email_from?: string;
    email_date?: string;
    email_snippet?: string;
  };
  suggestion_details?: {
    previous_status?: string;
    suggested_status?: string;
  };
  created_at: string;
}

// Helper function to parse error responses from the worker
async function parseWorkerErrorResponse(
  response: Response
): Promise<GmailMessagesApiResponse> {
  let errorData: { error?: string; message?: string; details?: string } = {};
  try {
    errorData = await response.json();
  } catch {
    // If JSON parsing fails, use statusText
    errorData = { error: response.statusText };
  }

  const error =
    errorData.error ||
    errorData.message ||
    `HTTP ${response.status}: ${response.statusText}`;

  return {
    error,
    details: errorData.details,
  };
}

async function getGmailMessages(
  accessToken: string
): Promise<GmailMessagesApiResponse> {
  try {
    const response = await fetch(`/api/worker_proxy/gmail/messages`, {
      headers: {
        Cookie: accessToken,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 600, // Cache for 10 minutes
        tags: ["gmail-messages"], // Add cache tag
      },
    });

    if (!response.ok) {
      return await parseWorkerErrorResponse(response);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching Gmail messages:", error);
    return {
      error: "Network error while fetching emails.",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Function to fetch applications data from Cloudflare Worker
async function getApplicationsData(
  accessToken: string
): Promise<ApplicationsApiResponse> {
  console.log(
    "[DASHBOARD DATA] Fetching applications data...",
    new Date().toISOString()
  );

  try {
    const response = await fetch(`/api/worker_proxy/applications`, {
      headers: {
        Cookie: accessToken,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
        tags: ["applications"], // Add cache tag
      },
    });

    if (!response.ok) {
      let errorData: { error?: string; message?: string; details?: string } =
        {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: response.statusText };
      }

      const error =
        errorData.error ||
        errorData.message ||
        `HTTP ${response.status}: ${response.statusText}`;

      return {
        error,
        details: errorData.details,
      };
    }

    const data = await response.json();
    console.log("[DASHBOARD DATA] Applications data fetched successfully:", {
      applicationCount: data.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return data;
  } catch (error) {
    console.error("[DASHBOARD DATA] Error fetching applications:", error);
    return {
      error: "Network error while fetching applications.",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Function to fetch AI suggestions from Cloudflare Worker
async function getSuggestionsData(accessToken: string): Promise<{
  data?: AISuggestion[];
  error?: string;
  details?: string;
}> {
  try {
    const response = await fetch(`/api/worker_proxy/suggestions`, {
      headers: {
        Cookie: accessToken,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
        tags: ["suggestions"], // Add cache tag
      },
    });

    if (!response.ok) {
      let errorData: { error?: string; message?: string; details?: string } =
        {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: response.statusText };
      }

      const error =
        errorData.error ||
        errorData.message ||
        `HTTP ${response.status}: ${response.statusText}`;

      return {
        error,
        details: errorData.details,
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return {
      error: "Network error while fetching suggestions.",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Update getDashboardData to accept nullable token
async function getDashboardData(accessToken: string): Promise<{
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
  rawSuggestions: AISuggestion[];
  errors: {
    applications?: string;
    suggestions?: string;
  };
}> {
  console.log(
    "[DASHBOARD DATA] Starting getDashboardData...",
    new Date().toISOString()
  );

  const [applicationsResult, suggestionsResult] = await Promise.all([
    getApplicationsData(accessToken),
    getSuggestionsData(accessToken),
  ]);

  const applications = applicationsResult.data || [];
  const suggestions = suggestionsResult.data || [];

  const totalApplications = applications.length;
  const interviewsScheduled = applications.filter((app) =>
    ["Screening", "Interviewing"].includes(app.status)
  ).length;
  const offersReceived = applications.filter(
    (app) => app.status === "Offer"
  ).length;

  // Generate meaningful recent activity from applications only (no AI suggestions)
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

  // Sort applications by most recent first
  const sortedApplications = applications.sort(
    (a, b) =>
      new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
  );

  // Add recent applications with detailed activity data
  sortedApplications.slice(0, 8).forEach((app) => {
    // Determine activity type based on status
    let activityType:
      | "application_created"
      | "status_update"
      | "interview_scheduled"
      | "email_sync"
      | "offer_received"
      | "application_rejected";
    let title: string;
    let description: string;

    switch (app.status) {
      case "Applied":
        activityType = "application_created";
        title = "New application detected";
        description = `Applied to ${app.role} position`;
        break;
      case "Screening":
        activityType = "status_update";
        title = "Application under review";
        description = `Your application is being reviewed`;
        break;
      case "Interviewing":
        activityType = "interview_scheduled";
        title = "Interview process started";
        description = `Interview process initiated for ${app.role}`;
        break;
      case "Offer":
        activityType = "offer_received";
        title = "Job offer received";
        description = `Congratulations! You received an offer`;
        break;
      case "Rejected":
        activityType = "application_rejected";
        title = "Application not selected";
        description = `Application was not selected for ${app.role}`;
        break;
      default:
        activityType = "status_update";
        title = "Application status updated";
        description = `Status changed to ${app.status}`;
    }

    recentActivity.push({
      id: `app-${app.id}`,
      type: activityType,
      title,
      description,
      timestamp: app.applied_at,
      metadata: {
        company: app.company_name,
        role: app.role,
        newStatus: app.status,
      },
    });
  });

  console.log("[DASHBOARD DATA] getDashboardData completed:", {
    totalApplications,
    timestamp: new Date().toISOString(),
    hasErrors: !!(applicationsResult.error || suggestionsResult.error),
  });

  return {
    totalApplications,
    interviewsScheduled,
    offersReceived,
    recentActivity: recentActivity.slice(0, 6), // Limit to 6 most recent items
    rawApplications: applications,
    rawSuggestions: suggestions,
    errors: {
      applications: applicationsResult.error,
      suggestions: suggestionsResult.error,
    },
  };
}

export default async function DashboardPage() {
  console.log(
    "[DASHBOARD PAGE] DashboardPage rendering started...",
    new Date().toISOString()
  );

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Dashboard: Authentication error:", userError);
    // Redirect is handled by middleware
    return null;
  }

  // Get the cookies for API authentication
  const cookieStore = await cookies();
  const accessToken = cookieStore.toString();

  // Fetch initial data for the dashboard
  console.log(
    "[DASHBOARD PAGE] Fetching dashboard and Gmail data...",
    new Date().toISOString()
  );
  const [dashboardData, gmailData] = await Promise.all([
    getDashboardData(accessToken),
    getGmailMessages(accessToken),
  ]);

  console.log(
    "[DASHBOARD PAGE] Data fetched, rendering DashboardWithRealtime...",
    {
      totalApplications: dashboardData.totalApplications,
      timestamp: new Date().toISOString(),
    }
  );

  return (
    <DashboardWithRealtime
      user={{
        id: user.id,
        email: user.email,
      }}
      initialData={dashboardData}
      gmailData={gmailData}
      integrationEmail={gmailData?.integratedGmailAddress || null}
    />
  );
}
