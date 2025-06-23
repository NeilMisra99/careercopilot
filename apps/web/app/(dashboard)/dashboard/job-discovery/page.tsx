import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { JobDiscoveryPageContent } from "./_components/job-discovery-page-content";

// Phase 2: Bright Data Intelligence Fields
interface SalaryData {
  min?: number;
  max?: number;
  amount?: number;
  currency?: string;
}

interface DiscoveredJob {
  jobId: string;
  status: string;
  notes?: string;
  discoveredAt: string;
  statusUpdatedAt?: string;
  title: string;
  company: string;
  location?: string;
  jobUrl?: string;
  postedAt?: string;
  searchKeywords?: string;
  searchLocation?: string;
  // ScrapingDog API fields (only what's actually provided)
  companyProfileUrl?: string;
  // Note: company_logo_url is not consistently provided by ScrapingDog's basic response

  // Phase 2: Bright Data Intelligence Fields
  salary_json?: SalaryData;
  applicants?: number;
  employment_type?: string;
  experience_level?: string;
  opportunity_score?: number;
  opportunity_reasoning?: string[];
  market_intelligence?: {
    salary_percentile?: number;
    competition_level?: "low" | "medium" | "high";
    urgency_level?: "low" | "medium" | "high";
    seniority_alignment?: "under" | "match" | "over";
    golden_opportunity?: boolean;
  };
  discovery_source?: string;

  // UI 2.0 Normalized Fields
  company_url?: string;
  company_logo?: string;
  country_code?: string;
  seniority_level?: string;
  job_function?: string;
  industries?: string[];
  apply_link?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;

  // Personalized insights (AI-powered analysis against user's resume)
  opportunity_insights?: {
    insights: {
      skill_matches: Array<{
        skill: string;
        your_experience: string;
        job_requirement: string;
        match_strength: "perfect" | "strong" | "good";
      }>;
      experience_relevance: Array<{
        your_role: string;
        company: string;
        relevance_explanation: string;
        why_valuable: string;
      }>;
      growth_opportunities: Array<{
        opportunity: string;
        your_current_level: string;
        potential_growth: string;
      }>;
      competitive_advantages: string[];
      key_reasons: string[];
    };
    summary: {
      primary_strength: string;
      biggest_opportunity: string;
      fit_confidence: number;
      personalized_pitch: string;
    };
    confidence: number;
  };
}

interface ScrapeRun {
  id: string;
  keywords: string;
  location?: string;
  geoId?: string;
  pagesRequested: number;
  pagesFetched: number;
  jobsFound: number;
  status: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface JobDiscoveryStats {
  totalJobs: number;
  discoveredJobs: number;
  autoSavedJobs: number;
  manuallySavedJobs: number;
  savedJobs: number; // Combined auto + manual for backward compatibility
  ignoredJobs: number;
  appliedJobs: number;
  totalRuns: number;
  recentRuns: number;
  avgJobsPerRun: number;
  recentJobs: number; // Jobs discovered in the last 7 days
}

async function getJobDiscoveryData(cookieString: string): Promise<{
  jobs: DiscoveredJob[];
  runs: ScrapeRun[];
  stats: JobDiscoveryStats;
  errors: {
    jobs?: string;
    runs?: string;
    stats?: string;
  };
}> {
  const workerUrl = getWorkerUrl();

  if (!workerUrl) {
    return {
      jobs: [],
      runs: [],
      stats: {
        totalJobs: 0,
        discoveredJobs: 0,
        autoSavedJobs: 0,
        manuallySavedJobs: 0,
        savedJobs: 0,
        ignoredJobs: 0,
        appliedJobs: 0,
        totalRuns: 0,
        recentRuns: 0,
        avgJobsPerRun: 0,
        recentJobs: 0,
      },
      errors: {
        jobs: "Worker URL not configured",
        runs: "Worker URL not configured",
        stats: "Worker URL not configured",
      },
    };
  }

  const errors: { jobs?: string; runs?: string; stats?: string } = {};

  // Fetch discovered jobs with pagination (much better performance)
  let jobs: DiscoveredJob[] = [];
  try {
    const jobsResponse = await fetch(
      `${workerUrl}/api/job-discovery/jobs?limit=25&page=1&status=discovered`,
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
        next: {
          tags: [CACHE_TAGS.JOB_DISCOVERY_JOBS, CACHE_TAGS.JOB_DISCOVERY_DATA],
          revalidate: CACHE_CONFIG.MEDIUM.revalidate,
        },
      },
    );

    if (jobsResponse.ok) {
      const jobsData = await jobsResponse.json();
      jobs = jobsData.jobs || [];
    } else {
      errors.jobs = `Failed to fetch jobs: ${jobsResponse.status}`;
    }
  } catch (error) {
    errors.jobs = error instanceof Error ? error.message : "Network error";
  }

  // Fetch scrape runs
  let runs: ScrapeRun[] = [];
  try {
    const runsResponse = await fetch(
      `${workerUrl}/api/job-discovery/runs?limit=20`,
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
        next: {
          tags: [CACHE_TAGS.JOB_DISCOVERY_RUNS, CACHE_TAGS.JOB_DISCOVERY_DATA],
          revalidate: CACHE_CONFIG.MEDIUM.revalidate,
        },
      },
    );

    if (runsResponse.ok) {
      const runsData = await runsResponse.json();
      runs = runsData.runs || [];
    } else {
      errors.runs = `Failed to fetch runs: ${runsResponse.status}`;
    }
  } catch (error) {
    errors.runs = error instanceof Error ? error.message : "Network error";
  }

  // Fetch proper stats from the worker's stats endpoint
  let stats: JobDiscoveryStats = {
    totalJobs: 0,
    discoveredJobs: 0,
    autoSavedJobs: 0,
    manuallySavedJobs: 0,
    savedJobs: 0,
    ignoredJobs: 0,
    appliedJobs: 0,
    totalRuns: 0,
    recentRuns: 0,
    avgJobsPerRun: 0,
    recentJobs: 0,
  };

  try {
    const statsResponse = await fetch(`${workerUrl}/api/job-discovery/stats`, {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieString,
      },
      next: {
        tags: [CACHE_TAGS.JOB_DISCOVERY_DATA],
        revalidate: CACHE_CONFIG.MEDIUM.revalidate,
      },
    });

    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      stats = {
        totalJobs: statsData.totalJobs || 0,
        discoveredJobs: statsData.discoveredJobs || 0,
        autoSavedJobs: statsData.autoSavedJobs || 0,
        manuallySavedJobs: statsData.manuallySavedJobs || 0,
        savedJobs:
          statsData.savedJobs ||
          (statsData.autoSavedJobs || 0) + (statsData.manuallySavedJobs || 0),
        ignoredJobs: statsData.ignoredJobs || 0,
        appliedJobs: statsData.appliedJobs || 0,
        totalRuns: statsData.totalRuns || 0,
        recentRuns: statsData.recentRuns || 0,
        avgJobsPerRun: statsData.avgJobsPerRun || 0,
        recentJobs: statsData.recentJobs || 0,
      };
    } else {
      errors.stats = `Failed to fetch stats: ${statsResponse.status}`;
      // Fallback: calculate basic stats from available data
      stats = {
        totalJobs: jobs.length, // This will be incomplete but better than nothing
        discoveredJobs: jobs.filter((job) => job.status === "discovered")
          .length,
        autoSavedJobs: jobs.filter((job) => job.status === "saved").length,
        manuallySavedJobs: 0,
        savedJobs: jobs.filter((job) => job.status === "saved").length,
        ignoredJobs: jobs.filter((job) => job.status === "ignored").length,
        appliedJobs: jobs.filter((job) => job.status === "applied").length,
        totalRuns: runs.length,
        recentRuns: runs.filter((run) => {
          const runDate = new Date(run.createdAt);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return runDate > weekAgo;
        }).length,
        avgJobsPerRun:
          runs.length > 0
            ? Math.round(
                runs.reduce((sum, run) => sum + run.jobsFound, 0) / runs.length,
              )
            : 0,
        recentJobs: jobs.filter((job) => {
          const jobDate = new Date(job.discoveredAt);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return jobDate > weekAgo;
        }).length,
      };
    }
  } catch (error) {
    errors.stats = error instanceof Error ? error.message : "Network error";
    // Fallback: calculate basic stats from available data
    stats = {
      totalJobs: jobs.length, // This will be incomplete but better than nothing
      discoveredJobs: jobs.filter((job) => job.status === "discovered").length,
      autoSavedJobs: jobs.filter((job) => job.status === "saved").length,
      manuallySavedJobs: 0,
      savedJobs: jobs.filter((job) => job.status === "saved").length,
      ignoredJobs: jobs.filter((job) => job.status === "ignored").length,
      appliedJobs: jobs.filter((job) => job.status === "applied").length,
      totalRuns: runs.length,
      recentRuns: runs.filter((run) => {
        const runDate = new Date(run.createdAt);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return runDate > weekAgo;
      }).length,
      avgJobsPerRun:
        runs.length > 0
          ? Math.round(
              runs.reduce((sum, run) => sum + run.jobsFound, 0) / runs.length,
            )
          : 0,
      recentJobs: jobs.filter((job) => {
        const jobDate = new Date(job.discoveredAt);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return jobDate > weekAgo;
      }).length,
    };
  }

  return { jobs, runs, stats, errors };
}

export default async function JobDiscoveryPage() {
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/signin");
  }

  try {
    const { jobs, stats } = await getJobDiscoveryData(cookieString);

    console.log("jobs", jobs);

    return (
      <div className="container mx-auto p-6">
        <JobDiscoveryPageContent
          initialJobs={jobs}
          initialStats={{
            totalJobs: stats.totalJobs,
            discoveredJobs: stats.discoveredJobs,
            autoSavedJobs: stats.autoSavedJobs,
            manuallySavedJobs: stats.manuallySavedJobs,
            savedJobs: stats.savedJobs,
            appliedJobs: stats.appliedJobs,
            ignoredJobs: stats.ignoredJobs,
            recentJobs: stats.recentJobs,
          }}
        />
      </div>
    );
  } catch (error) {
    console.error("Failed to load job discovery data:", error);
    return (
      <div className="container mx-auto p-6">
        <JobDiscoveryPageContent
          initialJobs={[]}
          initialStats={{
            totalJobs: 0,
            discoveredJobs: 0,
            autoSavedJobs: 0,
            manuallySavedJobs: 0,
            savedJobs: 0,
            appliedJobs: 0,
            ignoredJobs: 0,
            recentJobs: 0,
          }}
        />
      </div>
    );
  }
}
