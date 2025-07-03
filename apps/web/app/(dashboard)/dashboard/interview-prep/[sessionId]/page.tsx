import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SessionDetailSkeleton } from "../_components/session-detail-skeleton";
import { SessionDetailView } from "../_components/session-detail-view";
import type {
  InterviewBrief,
  InterviewQuestion,
  InterviewSession,
  InterviewStarStory,
} from "../_lib/types";

interface SessionPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

async function getSessionData(sessionId: string, cookieString: string) {
  const workerUrl = getWorkerUrl();

  if (!workerUrl) {
    throw new Error("Worker URL not configured");
  }

  const response = await fetch(
    `${workerUrl}/api/interview-prep/sessions/${sessionId}/complete`,
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieString,
      },
      next: {
        tags: [
          CACHE_TAGS.INTERVIEW_SESSIONS,
          CACHE_TAGS.INTERVIEW_QUESTIONS,
          CACHE_TAGS.INTERVIEW_BRIEFS,
          CACHE_TAGS.STAR_STORIES,
          `interview-session-${sessionId}`,
        ],
        revalidate: CACHE_CONFIG.MEDIUM.revalidate,
      },
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      notFound();
    }
    throw new Error(`Failed to fetch session data: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to fetch session data");
  }

  return result.data;
}

// Separate component to handle params access and suspense boundary
async function SessionContent(props: SessionPageProps) {
  const params = await props.params;
  const sessionId = params.sessionId;

  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();

  try {
    const sessionData = await getSessionData(sessionId, cookieString);

    console.log("sessionData", sessionData);
    return (
      <SessionDetailView
        session={sessionData.session as InterviewSession}
        questions={sessionData.questions as InterviewQuestion[]}
        brief={sessionData.brief as InterviewBrief | null}
        starStories={sessionData.starStories as InterviewStarStory[]}
      />
    );
  } catch (error) {
    console.error("Failed to load session:", error);
    notFound();
  }
}

export default async function SessionPage({ params }: SessionPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <Suspense fallback={<SessionDetailSkeleton />}>
        <SessionContent params={params} />
      </Suspense>
    </div>
  );
}

export async function generateMetadata() {
  return {
    title: "Interview Session | CareerCopilot",
    description: "AI-powered interview preparation session",
  };
}
