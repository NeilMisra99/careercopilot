"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import {
  AlertCircle,
  Brain,
  Database,
  FileText,
  Plus,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { revalidateResumeCacheAction } from "../_lib/actions/cache-actions";
import { triggerMatchingForCompletedResume } from "../_lib/actions/resume-actions";
import { ResumeList } from "./resume-list";
import { ResumeUploadDialog } from "./resume-upload-dialog";

// Interfaces
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
  summary: string | null;
  experiences_count?: number;
  skills_count?: number;
  education_count?: number;
  parsing_progress?: number | null;
  parsing_stage?: string | null;
  parsing_message?: string | null;
  parsing_data?: Record<string, unknown> | null;
  updated_at?: string;
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

// Real-time progress interface
interface ResumeProgress {
  id: string;
  parsing_progress: number | null;
  parsing_stage: string | null;
  parsing_message: string | null;
  parsing_data: Record<string, unknown> | null;
  parsing_status: string;
  updated_at: string;
}

interface ResumePageContentProps {
  userId: string;
  initialResumes: Resume[];
  initialStats: ResumeStats;
  error?: string;
}

export function ResumePageContent({
  userId,
  initialResumes,
  initialStats,
  error,
}: ResumePageContentProps) {
  const [resumes, setResumes] = useState<Resume[]>(initialResumes);
  const [stats, setStats] = useState<ResumeStats>(initialStats);
  const router = useRouter();

  // Track completed resumes to prevent duplicate completion toasts
  const completedResumesRef = useRef<Set<string>>(new Set());

  // Sync component state with props
  useEffect(() => {
    setResumes(initialResumes);
    setStats(initialStats);
  }, [initialResumes, initialStats]);

  // Real-time subscription for parsing progress
  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();

    // Track which resumes are already completed to prevent duplicate toasts
    const initiallyCompletedResumes = new Set(
      resumes.filter((r) => r.parsing_status === "completed").map((r) => r.id),
    );

    initiallyCompletedResumes.forEach((id) => {
      completedResumesRef.current.add(id);
    });

    // Fetch complete current state of all resumes on refresh
    const fetchLatestResumeState = async () => {
      const { data: currentResumes, error } = await supabase
        .from("resumes")
        .select(
          "id, parsing_status, parsing_progress, parsing_stage, parsing_message, parsing_data, updated_at, parsed_at",
        )
        .eq("user_id", userId);

      if (error) {
        return;
      }

      if (currentResumes && currentResumes.length > 0) {
        setResumes((prevResumes) =>
          prevResumes.map((r) => {
            const latestResume = currentResumes.find((cr) => cr.id === r.id);
            return latestResume
              ? {
                  ...r,
                  parsing_status: latestResume.parsing_status,
                  parsing_progress: latestResume.parsing_progress,
                  parsing_stage: latestResume.parsing_stage,
                  parsing_message: latestResume.parsing_message,
                  parsing_data: latestResume.parsing_data,
                  updated_at: latestResume.updated_at,
                  parsed_at: latestResume.parsed_at,
                }
              : r;
          }),
        );

        // Update completion tracking with any newly completed resumes
        const newlyCompleted = currentResumes.filter(
          (resume) =>
            resume.parsing_status === "completed" &&
            !completedResumesRef.current.has(resume.id),
        );

        newlyCompleted.forEach((resume) => {
          completedResumesRef.current.add(resume.id);
        });
      }
    };

    fetchLatestResumeState();

    const channel = supabase
      .channel(`resume-page-progress-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "resumes",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const resume = payload.new as ResumeProgress;
          const oldResume = payload.old as ResumeProgress;

          // Only process parsing-related updates
          const isParsingUpdate =
            resume.parsing_status === "processing" ||
            resume.parsing_status === "pending" ||
            resume.parsing_status === "completed" ||
            resume.parsing_progress !== null ||
            resume.parsing_stage !== null;

          if (!isParsingUpdate) return;

          // Skip if no actual parsing state change
          if (
            oldResume &&
            oldResume.parsing_status === resume.parsing_status &&
            oldResume.parsing_progress === resume.parsing_progress
          ) {
            return;
          }

          // Update resume status in the list
          setResumes((prev) =>
            prev.map((r) =>
              r.id === resume.id
                ? {
                    ...r,
                    parsing_status: resume.parsing_status,
                    parsing_progress: resume.parsing_progress,
                    parsing_stage: resume.parsing_stage,
                    parsing_message: resume.parsing_message,
                    parsing_data: resume.parsing_data,
                    updated_at: resume.updated_at,
                  }
                : r,
            ),
          );

          // Handle completion
          const wasAlreadyCompleted = oldResume?.parsing_status === "completed";
          const isNowCompleted = resume.parsing_status === "completed";
          const alreadyHandled = completedResumesRef.current.has(resume.id);

          if (isNowCompleted && !alreadyHandled && !wasAlreadyCompleted) {
            completedResumesRef.current.add(resume.id);

            toast.success("Resume parsing completed!", {
              description: "Your resume has been processed with AI insights.",
            });

            handleCacheRevalidation();

            // Trigger job-resume matching for the completed resume
            handleResumeMatchingTrigger(resume.id);
          } else if (isNowCompleted && !alreadyHandled) {
            // Mark as handled even if it was already completed to prevent future duplicates
            completedResumesRef.current.add(resume.id);
          }
        },
      )
      .subscribe();

    return () => {
      completedResumesRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Handle cache revalidation
  const handleCacheRevalidation = async () => {
    try {
      await revalidateResumeCacheAction();
      // Add delay to let cache invalidation propagate
      setTimeout(() => {
        router.refresh();
      }, 100);
    } catch (error) {
      console.error("Cache revalidation failed:", error);
    }
  };

  // Handle optimistic resume creation
  const handleResumeUploaded = (resumeData: {
    id: string;
    name: string;
    file_name: string;
    file_path: string;
  }) => {
    // Clear any completion tracking for this resume
    completedResumesRef.current.delete(resumeData.id);

    // Create optimistic resume entry
    const optimisticResume: Resume = {
      id: resumeData.id,
      name: resumeData.name,
      version_number: resumes.length + 1,
      is_primary: false,
      file_name: resumeData.file_name,
      file_type: "pdf",
      parsing_status: "processing",
      parsed_at: null,
      created_at: new Date().toISOString(),
      full_name: null,
      email: null,
      summary: null,
      experiences_count: 0,
      skills_count: 0,
      education_count: 0,
      parsing_progress: null,
      parsing_stage: null,
      parsing_message: null,
      parsing_data: null,
    };

    // Add to resumes list optimistically
    setResumes((prev) => [optimisticResume, ...prev]);

    // Update stats optimistically
    setStats((prev) => ({
      ...prev,
      totalResumes: prev.totalResumes + 1,
      pendingProcessing: prev.pendingProcessing + 1,
    }));

    toast.success("Resume uploaded successfully!", {
      description: "AI processing will begin shortly...",
    });
  };

  // Handle triggering job-resume matching for completed resume
  const handleResumeMatchingTrigger = async (resumeId: string) => {
    try {
      await triggerMatchingForCompletedResume(resumeId);

      toast.success("Job matching initiated!", {
        description: "Finding compatible positions for your resume...",
      });
    } catch {
      toast.error("Failed to start job matching", {
        description: "Please try again or check your applications.",
      });
    }
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    subtitle,
    progress,
    borderColor,
    trend,
  }: {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    subtitle?: string;
    progress?: number;
    borderColor: string;
    trend?: "up" | "down" | "neutral";
  }) => (
    <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-muted-foreground text-sm font-medium">{title}</p>
          <div className="flex items-center gap-2">
            <div className="text-foreground mt-2 text-2xl leading-none font-semibold">
              {value}
            </div>
            {trend && (
              <TrendingUp
                className={`h-4 w-4 ${
                  trend === "up"
                    ? "text-green-500 dark:text-green-400"
                    : trend === "down"
                      ? "text-red-500 dark:text-red-400"
                      : "text-gray-400 dark:text-gray-500"
                }`}
              />
            )}
          </div>
          {subtitle && (
            <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
          )}
        </div>
        <div
          className={`h-10 w-10 rounded-lg bg-${borderColor} flex items-center justify-center shadow-lg`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-3">
          <Progress value={progress} className="h-2" />
          <p className="text-muted-foreground mt-1 text-xs">
            {progress.toFixed(1)}% complete
          </p>
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">
                Failed to load resumes
              </p>
              <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Header Section */}
      <div className="mb-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-medium">
              Resume Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Upload, manage, and optimize your resumes with AI-powered insights
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ResumeUploadDialog onResumeUploaded={handleResumeUploaded}>
              <Button size="sm" variant="default">
                <Plus className="mr-1 h-4 w-4" />
                Upload Resume
              </Button>
            </ResumeUploadDialog>
          </div>
        </div>

        {/* Enhanced Stats Grid */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Resume Portfolio"
            value={stats.totalResumes}
            icon={FileText}
            subtitle={
              stats.pendingProcessing > 0
                ? `${stats.pendingProcessing} processing`
                : resumes.find((r) => r.is_primary)
                  ? `Primary: ${resumes.find((r) => r.is_primary)?.name}`
                  : "No primary resume set"
            }
            borderColor="blue-500"
            trend="up"
          />

          <StatCard
            title="AI Analysis"
            value={`${stats.aiProcessed}/${stats.totalResumes}`}
            icon={Brain}
            progress={stats.processingRate}
            subtitle={stats.processingRate === 100 ? "Complete" : "In progress"}
            borderColor="green-500"
            trend="up"
          />

          <StatCard
            title="Career Insights"
            value={stats.totalDataPoints}
            icon={Database}
            subtitle={`${stats.avgExperiences} exp • ${stats.avgSkills} skills • ${stats.avgEducation} edu`}
            borderColor="purple-500"
            trend="up"
          />

          <StatCard
            title="Skill Diversity"
            value={
              stats.totalDataPoints > 0 &&
              stats.avgExperiences + stats.avgSkills + stats.avgEducation > 0
                ? Math.round(
                    (stats.avgSkills /
                      (stats.avgExperiences +
                        stats.avgSkills +
                        stats.avgEducation)) *
                      100,
                  )
                : 0
            }
            icon={TrendingUp}
            subtitle={
              stats.avgSkills > stats.avgExperiences
                ? "Skills-focused profile"
                : stats.avgExperiences > 0
                  ? "Experience-focused profile"
                  : "Building your profile"
            }
            borderColor="orange-500"
            trend="neutral"
          />
        </div>

        {/* Processing Status Alert */}
        {stats.pendingProcessing > 0 && (
          <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 bg-gradient-to-b from-orange-50 to-orange-100/60 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-orange-800/30 dark:bg-orange-950/30 dark:from-orange-950/30 dark:to-orange-950/20 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-medium text-orange-900 dark:text-orange-100">
                  {stats.pendingProcessing} resume
                  {stats.pendingProcessing > 1 ? "s" : ""} processing
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-200">
                  AI analysis in progress. Usually takes 1-2 minutes per resume.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resume List */}
      <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-6 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-foreground flex items-center gap-2 text-lg font-medium">
              <FileText className="h-5 w-5" />
              Your Resumes
            </h2>
            {stats.totalResumes > 0 && (
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-xs text-blue-700 dark:border-blue-800/30 dark:bg-blue-950/30 dark:text-blue-300"
              >
                {stats.totalResumes}
              </Badge>
            )}
          </div>
        </div>
        <ResumeList initialResumes={resumes} />
      </div>
    </>
  );
}
