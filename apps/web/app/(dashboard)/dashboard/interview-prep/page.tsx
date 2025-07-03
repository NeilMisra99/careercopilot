import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InterviewPrepErrorBoundary } from "./_components/error-boundary";
import { InterviewPrepPageContent } from "./_components/interview-prep-page-content";
import { InterviewPrepSkeleton } from "./_components/interview-prep-skeleton";
import type {
  Application,
  InterviewPrepStats,
  InterviewSession,
  Resume,
} from "./_lib/types";

export const metadata = {
  title: "Interview Prep | CareerCopilot",
  description:
    "AI-powered interview preparation with STAR stories, questions, and company research",
};

async function getInterviewPrepData(cookieString: string): Promise<{
  sessions: InterviewSession[];
  applications: Application[];
  resumes: Resume[];
  stats: InterviewPrepStats;
  errors: {
    sessions?: string;
    applications?: string;
    resumes?: string;
    stats?: string;
  };
}> {
  const workerUrl = getWorkerUrl();

  if (!workerUrl) {
    return {
      sessions: [],
      applications: [],
      resumes: [],
      stats: {
        totalSessions: 0,
        completedSessions: 0,
        preparingSessions: 0,
        readySessions: 0,
        totalQuestions: 0,
        totalStarStories: 0,
        averageConfidenceScore: 0,
        recentActivity: 0,
      },
      errors: {
        sessions: "Worker URL not configured",
        applications: "Worker URL not configured",
        resumes: "Worker URL not configured",
        stats: "Worker URL not configured",
      },
    };
  }

  const errors: {
    sessions?: string;
    applications?: string;
    resumes?: string;
    stats?: string;
  } = {};

  // Fetch interview sessions, applications, and resumes in parallel
  const [sessionsResult, applicationsResult, resumesResult] =
    await Promise.all([
      // Fetch interview sessions
      fetch(`${workerUrl}/api/interview-prep/sessions`, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
        next: {
          tags: [CACHE_TAGS.INTERVIEW_SESSIONS, CACHE_TAGS.INTERVIEW_PREP_DATA],
          revalidate: CACHE_CONFIG.MEDIUM.revalidate,
        },
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              return { sessions: data.data || [], error: null };
            } else {
              return {
                sessions: [],
                error: data.error || "Failed to fetch sessions",
              };
            }
          } else {
            return {
              sessions: [],
              error: `Failed to fetch sessions: ${response.status}`,
            };
          }
        })
        .catch((error) => ({
          sessions: [],
          error: error instanceof Error ? error.message : "Network error",
        })),

      // Fetch applications
      fetch(`${workerUrl}/api/applications`, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
        next: {
          tags: [CACHE_TAGS.APPLICATIONS_DATA, CACHE_TAGS.INTERVIEW_PREP_DATA],
          revalidate: CACHE_CONFIG.MEDIUM.revalidate,
        },
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            if (data.data) {
              return { applications: data.data, error: null };
            } else {
              return {
                applications: [],
                error: data.error || "Failed to fetch applications",
              };
            }
          } else {
            return {
              applications: [],
              error: `Failed to fetch applications: ${response.status}`,
            };
          }
        })
        .catch((error) => ({
          applications: [],
          error: error instanceof Error ? error.message : "Network error",
        })),

      // Fetch resumes
      fetch(`${workerUrl}/api/resumes`, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
        next: {
          tags: [CACHE_TAGS.RESUMES_DATA, CACHE_TAGS.INTERVIEW_PREP_DATA],
          revalidate: CACHE_CONFIG.MEDIUM.revalidate,
        },
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              return { resumes: data.data, error: null };
            } else {
              return {
                resumes: [],
                error: data.error || "Failed to fetch resumes",
              };
            }
          } else {
            return {
              resumes: [],
              error: `Failed to fetch resumes: ${response.status}`,
            };
          }
        })
        .catch((error) => ({
          resumes: [],
          error: error instanceof Error ? error.message : "Network error",
        })),
    ]);

  // Extract results
  const sessions = sessionsResult.sessions;
  const applications = applicationsResult.applications;
  const resumes = resumesResult.resumes;

  // Set errors
  if (sessionsResult.error) errors.sessions = sessionsResult.error;
  if (applicationsResult.error) errors.applications = applicationsResult.error;
  if (resumesResult.error) errors.resumes = resumesResult.error;

  // Calculate stats
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(
    (s: InterviewSession) => s.status === "completed",
  ).length;
  const preparingSessions = sessions.filter(
    (s: InterviewSession) => s.status === "preparing",
  ).length;
  const readySessions = sessions.filter(
    (s: InterviewSession) => s.status === "ready",
  ).length;

  // Calculate recent activity (sessions created in last 7 days)
  const now = Date.now();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  const recentActivity = sessions.filter((s: InterviewSession) => {
    const createdTime = new Date(s.created_at).getTime();
    return now - createdTime < sevenDaysInMs;
  }).length;

  const stats: InterviewPrepStats = {
    totalSessions,
    completedSessions,
    preparingSessions,
    readySessions,
    totalQuestions: 0, // Will be populated when individual sessions are viewed
    totalStarStories: 0, // Session-specific stories, so aggregate count is not meaningful at page level
    averageConfidenceScore: 0, // Will be calculated per-session
    recentActivity,
  };

  return { sessions, applications, resumes, stats, errors };
}

export default async function InterviewPrepPage() {
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  try {
    const { sessions, applications, resumes, stats, errors } =
      await getInterviewPrepData(cookieString);

    // Check if there are any critical errors
    const hasErrors = Object.values(errors).some((error) => error);
    const errorMessage = hasErrors
      ? Object.entries(errors)
          .filter(([, error]) => error)
          .map(([key, error]) => `${key}: ${error}`)
          .join("; ")
      : undefined;

    return (
      <div className="container mx-auto max-w-7xl p-6">
        <InterviewPrepErrorBoundary>
          <Suspense fallback={<InterviewPrepSkeleton />}>
            <InterviewPrepPageContent
              initialSessions={sessions}
              initialStarStories={[]}
              initialApplications={applications}
              initialResumes={resumes}
              initialStats={stats}
              error={errorMessage}
            />
          </Suspense>
        </InterviewPrepErrorBoundary>
      </div>
    );
  } catch (error) {
    console.error("Failed to load interview prep data:", error);
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <InterviewPrepErrorBoundary>
          <Suspense fallback={<InterviewPrepSkeleton />}>
            <InterviewPrepPageContent
              initialSessions={[]}
              initialStarStories={[]}
              initialApplications={[]}
              initialResumes={[]}
              initialStats={{
                totalSessions: 0,
                completedSessions: 0,
                preparingSessions: 0,
                readySessions: 0,
                totalQuestions: 0,
                totalStarStories: 0,
                averageConfidenceScore: 0,
                recentActivity: 0,
              }}
              error={error instanceof Error ? error.message : "Unknown error"}
            />
          </Suspense>
        </InterviewPrepErrorBoundary>
      </div>
    );
  }
}
