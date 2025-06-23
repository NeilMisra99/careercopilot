import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InterviewPrepPageContent } from "./_components/interview-prep-page-content";
import { InterviewPrepSkeleton } from "./_components/interview-prep-skeleton";
import type {
  Application,
  InterviewPrepStats,
  InterviewSession,
  Resume,
  StarStory,
} from "./_lib/types";

export const metadata = {
  title: "Interview Prep | CareerCopilot",
  description:
    "AI-powered interview preparation with STAR stories, questions, and company research",
};

async function getInterviewPrepData(cookieString: string): Promise<{
  sessions: InterviewSession[];
  starStories: StarStory[];
  applications: Application[];
  resumes: Resume[];
  stats: InterviewPrepStats;
  errors: {
    sessions?: string;
    starStories?: string;
    applications?: string;
    resumes?: string;
    stats?: string;
  };
}> {
  const workerUrl = getWorkerUrl();

  if (!workerUrl) {
    return {
      sessions: [],
      starStories: [],
      applications: [],
      resumes: [],
      stats: {
        totalSessions: 0,
        completedSessions: 0,
        draftSessions: 0,
        inProgressSessions: 0,
        totalQuestions: 0,
        totalStarStories: 0,
        averageConfidenceScore: 0,
        recentActivity: 0,
      },
      errors: {
        sessions: "Worker URL not configured",
        starStories: "Worker URL not configured",
        applications: "Worker URL not configured",
        resumes: "Worker URL not configured",
        stats: "Worker URL not configured",
      },
    };
  }

  const errors: {
    sessions?: string;
    starStories?: string;
    applications?: string;
    resumes?: string;
    stats?: string;
  } = {};

  // Fetch interview sessions, star stories, applications, and resumes in parallel
  const [sessionsResult, starStoriesResult, applicationsResult, resumesResult] =
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

      // Fetch star stories
      fetch(`${workerUrl}/api/interview-prep/star-stories`, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
        next: {
          tags: [CACHE_TAGS.STAR_STORIES, CACHE_TAGS.INTERVIEW_PREP_DATA],
          revalidate: CACHE_CONFIG.MEDIUM.revalidate,
        },
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              return { starStories: data.data, error: null };
            } else {
              return {
                starStories: [],
                error: data.error || "Failed to fetch STAR stories",
              };
            }
          } else {
            return {
              starStories: [],
              error: `Failed to fetch STAR stories: ${response.status}`,
            };
          }
        })
        .catch((error) => ({
          starStories: [],
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
  const starStories = starStoriesResult.starStories;
  const applications = applicationsResult.applications;
  const resumes = resumesResult.resumes;

  // Set errors
  if (sessionsResult.error) errors.sessions = sessionsResult.error;
  if (starStoriesResult.error) errors.starStories = starStoriesResult.error;
  if (applicationsResult.error) errors.applications = applicationsResult.error;
  if (resumesResult.error) errors.resumes = resumesResult.error;

  // Calculate stats
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(
    (s: InterviewSession) => s.status === "completed",
  ).length;
  const draftSessions = sessions.filter(
    (s: InterviewSession) => s.status === "draft",
  ).length;
  const inProgressSessions = sessions.filter(
    (s: InterviewSession) => s.status === "in_progress",
  ).length;

  // Calculate recent activity (sessions created in last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActivity = sessions.filter(
    (s: InterviewSession) => new Date(s.created_at) > sevenDaysAgo,
  ).length;

  // Calculate STAR stories stats
  const starStoriesCount = starStories.length;
  let averageConfidenceScore = 0;
  if (starStories.length > 0) {
    const totalConfidence = starStories.reduce(
      (sum: number, story: StarStory) => sum + (story.confidence_score || 0),
      0,
    );
    averageConfidenceScore = totalConfidence / starStories.length;
  }

  const stats: InterviewPrepStats = {
    totalSessions,
    completedSessions,
    draftSessions,
    inProgressSessions,
    totalQuestions: 0, // Will be populated when individual sessions are viewed
    totalStarStories: starStoriesCount,
    averageConfidenceScore: Math.round(averageConfidenceScore * 100) / 100,
    recentActivity,
  };

  return { sessions, starStories, applications, resumes, stats, errors };
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
    const { sessions, starStories, applications, resumes, stats, errors } =
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
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <Suspense fallback={<InterviewPrepSkeleton />}>
          <InterviewPrepPageContent
            initialSessions={sessions}
            initialStarStories={starStories}
            initialApplications={applications}
            initialResumes={resumes}
            initialStats={stats}
            error={errorMessage}
          />
        </Suspense>
      </div>
    );
  } catch (error) {
    console.error("Failed to load interview prep data:", error);
    return (
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <Suspense fallback={<InterviewPrepSkeleton />}>
          <InterviewPrepPageContent
            initialSessions={[]}
            initialStarStories={[]}
            initialApplications={[]}
            initialResumes={[]}
            initialStats={{
              totalSessions: 0,
              completedSessions: 0,
              draftSessions: 0,
              inProgressSessions: 0,
              totalQuestions: 0,
              totalStarStories: 0,
              averageConfidenceScore: 0,
              recentActivity: 0,
            }}
            error={error instanceof Error ? error.message : "Unknown error"}
          />
        </Suspense>
      </div>
    );
  }
}
