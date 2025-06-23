import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ResumeListSkeleton } from "./_components/resume-list-skeleton";
import { ResumePageContent } from "./_components/resume-page-content";

// Interface for resume data from worker
interface Resume {
  id: string;
  name: string;
  version_number: number;
  is_primary: boolean;
  file_name: string;
  file_type: string;
  parsing_status: string;
  parsed_at: string | null;
  created_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  experiences_count?: number;
  skills_count?: number;
  education_count?: number;
  // Add parsing progress fields for initial state
  parsing_progress?: number | null;
  parsing_stage?: string | null;
  parsing_message?: string | null;
  parsing_data?: Record<string, unknown> | null;
  updated_at?: string;
  // Full detailed data
  experiences: Array<{
    id: string;
    company_name: string;
    job_title: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    location: string;
    description: string;
    achievements: string[];
    skills_used: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    grade_gpa: string;
  }>;
  skills: Array<{
    id: string;
    skill_name: string;
    skill_category: string;
    proficiency_level: string;
    years_experience: number;
  }>;
  projects: Array<{
    id: string;
    project_name: string;
    description: string;
    technologies_used: string[];
  }>;
  certifications: Array<{
    id: string;
    certification_name: string;
    issuing_organization: string;
    issue_date: string;
  }>;
}

interface ResumeStats {
  totalResumes: number;
  aiProcessed: number;
  totalDataPoints: number;
  processingRate: number;
  avgExperiences: number;
  avgSkills: number;
  avgEducation: number;
  recentlyProcessed: number;
  pendingProcessing: number;
}

// Cached resumes data fetcher
const getCachedResumesData = unstable_cache(
  async (
    cookieString: string,
  ): Promise<{
    resumes: Resume[];
    stats: ResumeStats;
    error?: string;
  }> => {
    try {
      const workerUrl = getWorkerUrl();
      if (!workerUrl) {
        return {
          resumes: [],
          stats: {
            totalResumes: 0,
            aiProcessed: 0,
            totalDataPoints: 0,
            processingRate: 0,
            avgExperiences: 0,
            avgSkills: 0,
            avgEducation: 0,
            recentlyProcessed: 0,
            pendingProcessing: 0,
          },
          error: "Worker URL not configured",
        };
      }

      const response = await fetch(`${workerUrl}/api/resumes`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
      });

      if (!response.ok) {
        console.error("Worker request failed:", response.status);
        return {
          resumes: [],
          stats: {
            totalResumes: 0,
            aiProcessed: 0,
            totalDataPoints: 0,
            processingRate: 0,
            avgExperiences: 0,
            avgSkills: 0,
            avgEducation: 0,
            recentlyProcessed: 0,
            pendingProcessing: 0,
          },
          error: `Failed to fetch resumes: ${response.status}`,
        };
      }

      const result = await response.json();

      if (!result.success) {
        console.error("Worker returned error:", result.error);
        return {
          resumes: [],
          stats: {
            totalResumes: 0,
            aiProcessed: 0,
            totalDataPoints: 0,
            processingRate: 0,
            avgExperiences: 0,
            avgSkills: 0,
            avgEducation: 0,
            recentlyProcessed: 0,
            pendingProcessing: 0,
          },
          error: result.error || "Unknown error from worker",
        };
      }

      // Get the data from worker response
      const resumes = result.data || [];

      // Calculate stats
      const totalResumes = resumes.length;
      const aiProcessed = resumes.filter(
        (r: Resume) => r.parsing_status === "completed",
      ).length;
      const pendingProcessing = resumes.filter(
        (r: Resume) =>
          r.parsing_status === "pending" || r.parsing_status === "processing",
      ).length;

      // Calculate processing rate
      const processingRate =
        totalResumes > 0 ? (aiProcessed / totalResumes) * 100 : 0;

      // Calculate total data points and averages
      const processedResumes = resumes.filter(
        (r: Resume) => r.parsing_status === "completed",
      );
      const totalDataPoints = processedResumes.reduce(
        (total: number, resume: Resume) => {
          return (
            total +
            (resume.experiences_count || 0) +
            (resume.skills_count || 0) +
            (resume.education_count || 0)
          );
        },
        0,
      );

      const avgExperiences =
        processedResumes.length > 0
          ? Math.round(
              (processedResumes.reduce(
                (sum: number, r: Resume) => sum + (r.experiences_count || 0),
                0,
              ) /
                processedResumes.length) *
                10,
            ) / 10
          : 0;

      const avgSkills =
        processedResumes.length > 0
          ? Math.round(
              (processedResumes.reduce(
                (sum: number, r: Resume) => sum + (r.skills_count || 0),
                0,
              ) /
                processedResumes.length) *
                10,
            ) / 10
          : 0;

      const avgEducation =
        processedResumes.length > 0
          ? Math.round(
              (processedResumes.reduce(
                (sum: number, r: Resume) => sum + (r.education_count || 0),
                0,
              ) /
                processedResumes.length) *
                10,
            ) / 10
          : 0;

      // Recently processed (simplified to all processed for now)
      const recentlyProcessed = aiProcessed;

      const stats: ResumeStats = {
        totalResumes,
        aiProcessed,
        totalDataPoints,
        processingRate,
        avgExperiences,
        avgSkills,
        avgEducation,
        recentlyProcessed,
        pendingProcessing,
      };

      return { resumes, stats };
    } catch (error: unknown) {
      console.error("Exception in getCachedResumesData:", error);
      return {
        resumes: [],
        stats: {
          totalResumes: 0,
          aiProcessed: 0,
          totalDataPoints: 0,
          processingRate: 0,
          avgExperiences: 0,
          avgSkills: 0,
          avgEducation: 0,
          recentlyProcessed: 0,
          pendingProcessing: 0,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  [CACHE_TAGS.RESUMES_DATA],
  {
    tags: [CACHE_TAGS.RESUMES_DATA, CACHE_TAGS.RESUMES_PAGE_DATA],
    revalidate: CACHE_CONFIG.MEDIUM.revalidate,
  },
);

async function getResumesData(cookieString: string) {
  const result = await getCachedResumesData(cookieString);
  return result;
}

export default async function ResumesPage() {
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

  const resumesData = await getResumesData(cookieString);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <Suspense fallback={<ResumeListSkeleton />}>
        <ResumePageContent
          userId={user.id}
          initialResumes={resumesData.resumes}
          initialStats={resumesData.stats}
          error={resumesData.error}
        />
      </Suspense>
    </div>
  );
}
