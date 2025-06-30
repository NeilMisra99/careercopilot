import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MatchesPageContent } from "./_components/matches-page-content";
import { JobResumeMatch, MatchStats } from "./_lib/types";

export const metadata = {
  title: "Job-Resume Matches | CareerCopilot",
  description:
    "AI-powered job-resume compatibility analysis and optimization recommendations",
};

// Cached matches data fetcher
const getCachedMatchesData = unstable_cache(
  async (
    cookieString: string,
  ): Promise<{
    matches: JobResumeMatch[];
    stats: MatchStats;
    error?: string;
  }> => {
    try {
      const workerUrl = getWorkerUrl();
      if (!workerUrl) {
        return {
          matches: [],
          stats: {
            totalMatches: 0,
            averageFitScore: 0,
            excellentMatches: 0,
            goodMatches: 0,
            poorMatches: 0,
            recentMatches: 0,
            totalApplications: 0,
            totalResumes: 0,
          },
          error: "Worker URL not configured",
        };
      }

      // Fetch matches and stats in parallel
      const [matchesResponse, statsResponse] = await Promise.all([
        fetch(`${workerUrl}/api/matches?limit=20&page=1`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieString,
          },
        }),
        fetch(`${workerUrl}/api/matches/stats`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieString,
          },
        }),
      ]);

      // Handle matches result
      let matches: JobResumeMatch[] = [];
      let matchesError: string | undefined;

      if (!matchesResponse.ok) {
        matchesError = `Failed to fetch matches: ${matchesResponse.status}`;
      } else {
        const matchesResult = await matchesResponse.json();
        if (!matchesResult.success) {
          matchesError = matchesResult.error || "Unknown error from worker";
        } else {
          // The worker returns data in format { matches: [...], pagination: {...} }
          matches = matchesResult.data?.matches || [];
        }
      }

      // Handle stats result
      let stats: MatchStats = {
        totalMatches: 0,
        averageFitScore: 0,
        excellentMatches: 0,
        goodMatches: 0,
        poorMatches: 0,
        recentMatches: 0,
        totalApplications: 0,
        totalResumes: 0,
      };
      let statsError: string | undefined;

      if (!statsResponse.ok) {
        statsError = `Failed to fetch stats: ${statsResponse.status}`;
      } else {
        const statsResult = await statsResponse.json();
        if (!statsResult.success) {
          statsError = statsResult.error || "Unknown error from worker";
        } else {
          stats = statsResult.data || stats;
        }
      }

      // Return error if both failed
      const errorMessage =
        matchesError && statsError
          ? `Matches: ${matchesError}; Stats: ${statsError}`
          : matchesError || statsError;

      return {
        matches,
        stats,
        error: errorMessage || undefined,
      };
    } catch (error: unknown) {
      return {
        matches: [],
        stats: {
          totalMatches: 0,
          averageFitScore: 0,
          excellentMatches: 0,
          goodMatches: 0,
          poorMatches: 0,
          recentMatches: 0,
          totalApplications: 0,
          totalResumes: 0,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  [CACHE_TAGS.MATCHES_DATA],
  {
    tags: [
      CACHE_TAGS.MATCHES_DATA,
      CACHE_TAGS.MATCH_STATS,
      CACHE_TAGS.MATCHES_PAGE_DATA,
    ],
    revalidate: CACHE_CONFIG.MEDIUM.revalidate,
  },
);

async function getMatchesData(cookieString: string) {
  const result = await getCachedMatchesData(cookieString);
  return result;
}

export default async function MatchesPage() {
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

  const matchesData = await getMatchesData(cookieString);

  return (
    <div className="p-6">
      <Suspense
        fallback={
          <div className="space-y-8">
            {/* Header Skeleton */}
            <div className="mb-6">
              <div className="bg-muted mb-2 h-8 w-64 animate-pulse rounded" />
              <div className="bg-muted h-4 w-96 animate-pulse rounded" />
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-muted h-32 animate-pulse rounded-lg"
                />
              ))}
            </div>

            {/* Filters Skeleton */}
            <div className="bg-card animate-pulse rounded-lg border p-3">
              <div className="flex gap-4">
                <div className="bg-muted h-10 max-w-md flex-1 rounded" />
                <div className="bg-muted h-10 w-32 rounded" />
                <div className="bg-muted h-10 w-32 rounded" />
              </div>
            </div>

            {/* Match Cards Skeleton */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-muted h-64 animate-pulse rounded-lg"
                />
              ))}
            </div>
          </div>
        }
      >
        <MatchesPageContent
          initialMatches={matchesData.matches}
          initialStats={matchesData.stats}
          error={matchesData.error}
        />
      </Suspense>
    </div>
  );
}
