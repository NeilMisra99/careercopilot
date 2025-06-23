"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  DollarSign,
  ExternalLink,
  Eye,
  MapPin,
  MoreVertical,
  RefreshCw,
  Star,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getJobsAction } from "../_lib/actions";

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

interface JobListProps {
  initialJobs: DiscoveredJob[];
  loading: boolean;
  onStatusUpdate: (
    jobId: string,
    status: "discovered" | "saved" | "ignored" | "applied",
    notes?: string,
  ) => void;
  onSaveToApplications: (jobId: string) => void;
  onRefresh: () => void;
  totalJobs: number; // Total count for pagination
}

export function JobList({
  initialJobs,
  loading,
  onStatusUpdate,
  onSaveToApplications,
  onRefresh,
  totalJobs,
}: JobListProps) {
  const [jobs, setJobs] = useState<DiscoveredJob[]>(initialJobs);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalJobCount, setTotalJobCount] = useState(totalJobs);
  const [hasMore, setHasMore] = useState(initialJobs.length < totalJobs);

  // Intersection Observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const JOBS_PER_PAGE = 25;

  // Update jobs when initialJobs changes
  useEffect(() => {
    // Deduplicate initial jobs to prevent any duplicate key issues
    const uniqueJobs = initialJobs.filter(
      (job, index, self) =>
        index === self.findIndex((j) => j.jobId === job.jobId),
    );
    setJobs(uniqueJobs);
    setCurrentPage(1);
    setTotalJobCount(totalJobs);
    setHasMore(uniqueJobs.length < totalJobs);
  }, [initialJobs, totalJobs]);

  const loadMoreJobs = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const result = await getJobsAction({
        limit: JOBS_PER_PAGE,
        page: nextPage,
        status: "discovered",
      });

      if (result.success && result.data) {
        const { jobs: newJobs, pagination } = result.data as {
          jobs: DiscoveredJob[];
          pagination: {
            total: number;
            hasMore: boolean;
          };
        };

        // Deduplicate jobs by jobId to prevent React key conflicts
        setJobs((prev) => {
          const existingJobIds = new Set(prev.map((job) => job.jobId));
          const uniqueNewJobs = newJobs.filter(
            (job) => !existingJobIds.has(job.jobId),
          );

          const updatedJobs = [...prev, ...uniqueNewJobs];

          // Update total job count from server pagination
          if (pagination?.total !== undefined) {
            setTotalJobCount(pagination.total);
          }

          // Update hasMore based on pagination flag, fallback to length comparison
          setHasMore(
            pagination?.hasMore !== undefined
              ? pagination.hasMore
              : updatedJobs.length < totalJobCount,
          );

          return updatedJobs;
        });

        setCurrentPage(nextPage);
      }
    } catch {
      toast.error("Failed to load more jobs");
    } finally {
      setLoadingMore(false);
    }
  }, [currentPage, loadingMore, hasMore, totalJobCount, jobs.length]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loadingMore) {
          loadMoreJobs();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px", // Start loading 100px before the element is visible
      },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, loadingMore, loadMoreJobs]);

  const handleStatusUpdate = async (
    jobId: string,
    status: "discovered" | "saved" | "ignored" | "applied",
  ) => {
    try {
      await onStatusUpdate(jobId, status);

      // Update local state optimistically
      setJobs((prev) =>
        prev.map((job) =>
          job.jobId === jobId
            ? { ...job, status, statusUpdatedAt: new Date().toISOString() }
            : job,
        ),
      );

      toast.success(`Job marked as ${status}`);
    } catch {
      toast.error("Failed to update job status");
    }
  };

  const handleSaveToApplications = async (jobId: string) => {
    try {
      await onSaveToApplications(jobId);

      // Update local state
      setJobs((prev) =>
        prev.map((job) =>
          job.jobId === jobId
            ? {
                ...job,
                status: "saved",
                statusUpdatedAt: new Date().toISOString(),
              }
            : job,
        ),
      );

      toast.success("Job saved to applications!");
    } catch {
      toast.error("Failed to save job");
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  // UI 2.0: Enhanced salary formatting with normalized fields
  const formatSalary = (job: DiscoveredJob): string | null => {
    // Prioritize normalized fields (UI 2.0)
    if (job.salary_min !== undefined || job.salary_max !== undefined) {
      const currency = job.salary_currency || "$";
      const period = job.salary_period ? ` ${job.salary_period}` : "";

      if (job.salary_min && job.salary_max) {
        return `${currency}${(job.salary_min / 1000).toFixed(0)}k - ${currency}${(job.salary_max / 1000).toFixed(0)}k${period}`;
      } else if (job.salary_max) {
        return `Up to ${currency}${(job.salary_max / 1000).toFixed(0)}k${period}`;
      } else if (job.salary_min) {
        return `From ${currency}${(job.salary_min / 1000).toFixed(0)}k${period}`;
      }
    }

    // Fallback to salary_json for backward compatibility
    const salary_json = job.salary_json;
    if (!salary_json) return null;

    if (typeof salary_json === "object" && salary_json !== null) {
      if (salary_json.min && salary_json.max) {
        return `$${(salary_json.min / 1000).toFixed(0)}k - $${(salary_json.max / 1000).toFixed(0)}k`;
      } else if (salary_json.amount) {
        return `$${(salary_json.amount / 1000).toFixed(0)}k`;
      }
    } else if (typeof salary_json === "number") {
      return `$${(salary_json / 1000).toFixed(0)}k`;
    }

    return null;
  };

  const getOpportunityScoreColor = (score?: number): string => {
    if (!score) return "text-gray-400 dark:text-gray-500";
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-blue-600 dark:text-blue-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-500 dark:text-red-400";
  };

  const getOpportunityScoreRing = (score?: number): string => {
    if (!score) return "text-gray-300 dark:text-gray-600";
    if (score >= 80) return "text-green-500 dark:text-green-400";
    if (score >= 60) return "text-blue-500 dark:text-blue-400";
    if (score >= 40) return "text-yellow-500 dark:text-yellow-400";
    return "text-red-400 dark:text-red-400";
  };

  const getCompetitionColor = (level?: "low" | "medium" | "high"): string => {
    switch (level) {
      case "low":
        return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20";
      case "medium":
        return "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20";
      case "high":
        return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20";
      default:
        return "text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-800";
    }
  };

  const getCompetitionIcon = (level?: "low" | "medium" | "high") => {
    switch (level) {
      case "low":
        return <TrendingUp className="h-3 w-3" />;
      case "medium":
        return <Users className="h-3 w-3" />;
      case "high":
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <Users className="h-3 w-3" />;
    }
  };

  const getSourceBadgeColor = (source?: string): string => {
    switch (source) {
      case "linkedin":
      case "jsearch":
        // Premium data sources share the same styling
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700";
      case "serper":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600";
    }
  };

  const formatEmploymentType = (type: string): string => {
    const labels: Record<string, string> = {
      FULL_TIME: "Full-time",
      PART_TIME: "Part-time",
      CONTRACTOR: "Contractor",
      TEMPORARY: "Temporary",
      INTERN: "Internship",
      VOLUNTEER: "Volunteer",
      PER_DIEM: "Per-diem",
      OTHER: "Other",
    };
    const key = type?.toUpperCase();
    return (
      labels[key] ??
      type
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())
    );
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-6">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Building2 className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              No jobs discovered yet
            </h3>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              Start a job discovery search to find opportunities
            </p>
          </div>
          <Button onClick={onRefresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Jobs count and pagination info */}
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>
          Showing {jobs.length} of {totalJobCount} discovered jobs
        </span>
        {hasMore && (
          <span>{Math.ceil(totalJobCount / JOBS_PER_PAGE)} pages total</span>
        )}
      </div>

      {/* Job cards */}
      <div className="space-y-4">
        {jobs.map((job) => (
          <Card
            key={job.jobId}
            className={cn(
              "transition-all duration-200 hover:shadow-md",
              // Phase 2: Golden Opportunity Highlighting
              job.market_intelligence?.golden_opportunity
                ? "border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50 ring-2 ring-yellow-400 dark:border-yellow-600 dark:from-yellow-900/20 dark:to-orange-900/20 dark:ring-yellow-500"
                : "hover:border-gray-300 dark:hover:border-gray-600",
            )}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  {/* Header Row */}
                  <div className="mb-3 flex items-center gap-3">
                    {/* UI 2.0: Company Logo Avatar */}
                    {job.company_logo && job.discovery_source !== "serper" && (
                      <div className="flex-shrink-0 rounded-lg bg-white p-1 dark:bg-white">
                        <img
                          src={job.company_logo}
                          alt={`${job.company} logo`}
                          className="h-16 w-16 object-contain"
                          onError={(e) => {
                            // Hide on error
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {/* Phase 2: Golden Opportunity Badge */}
                        {job.market_intelligence?.golden_opportunity && (
                          <Badge className="gap-1 border-0 bg-gradient-to-r from-yellow-400 to-orange-400 text-white">
                            <Crown className="h-3 w-3" />
                            Golden Opportunity
                          </Badge>
                        )}

                        {/* Phase 2: Source Badge */}
                        {job.discovery_source && (
                          <Badge
                            variant="outline"
                            className={getSourceBadgeColor(
                              job.discovery_source,
                            )}
                          >
                            {job.discovery_source === "linkedin" ||
                            job.discovery_source === "jsearch"
                              ? "Premium Data"
                              : "Web Search"}
                          </Badge>
                        )}

                        {/* UI 2.0: Industry Chip */}
                        {job.industries && job.industries.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {job.industries[0]}
                          </Badge>
                        )}

                        {/* UI 2.0: Seniority Level */}
                        {job.seniority_level && (
                          <Badge variant="outline" className="text-xs">
                            {job.seniority_level}
                          </Badge>
                        )}
                      </div>

                      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {job.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Building2 className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate font-medium">
                          {job.company}
                        </span>
                        {job.location && (
                          <>
                            <span className="text-gray-400 dark:text-gray-500">
                              •
                            </span>
                            <MapPin className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{job.location}</span>
                          </>
                        )}
                        {/* UI 2.0: Company URL link */}
                        {job.company_url && (
                          <>
                            <span className="text-gray-400 dark:text-gray-500">
                              •
                            </span>
                            <a
                              href={job.company_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              View Company
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Phase 2: Opportunity Score Ring */}
                    {job.opportunity_score && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="relative h-12 w-12 flex-shrink-0">
                              <svg
                                className="h-12 w-12 -rotate-90 transform"
                                viewBox="0 0 36 36"
                              >
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  className="text-gray-200 dark:text-gray-700"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeDasharray={`${job.opportunity_score}, 100`}
                                  className={getOpportunityScoreRing(
                                    job.opportunity_score,
                                  )}
                                />
                              </svg>
                              <div
                                className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${getOpportunityScoreColor(job.opportunity_score)}`}
                              >
                                {job.opportunity_score}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-sm">
                              <div className="mb-1 font-medium">
                                Opportunity Score: {job.opportunity_score}/100
                              </div>
                              {job.opportunity_reasoning && (
                                <div className="space-y-1">
                                  {job.opportunity_reasoning.map(
                                    (reason, idx) => (
                                      <div key={idx}>{reason}</div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {/* Phase 2: Intelligence Metrics Row - Only show if we have any metrics */}
                  {(formatSalary(job) ||
                    (job.applicants !== undefined && job.applicants !== null) ||
                    job.market_intelligence?.competition_level ||
                    job.employment_type ||
                    job.experience_level) && (
                    <div className="mb-2 flex items-center gap-4 text-sm">
                      {/* Salary Information */}
                      {formatSalary(job) && (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <DollarSign className="h-4 w-4" />
                          <span className="font-medium">
                            {formatSalary(job)}
                          </span>
                        </div>
                      )}

                      {/* Applicant Count */}
                      {job.applicants !== undefined &&
                        job.applicants !== null && (
                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Users className="h-4 w-4" />
                            <span>{job.applicants} applicants</span>
                          </div>
                        )}

                      {/* Competition Level */}
                      {job.market_intelligence?.competition_level && (
                        <Badge
                          variant="secondary"
                          className={`gap-1 ${getCompetitionColor(job.market_intelligence.competition_level)}`}
                        >
                          {getCompetitionIcon(
                            job.market_intelligence.competition_level,
                          )}
                          {job.market_intelligence.competition_level}{" "}
                          competition
                        </Badge>
                      )}

                      {/* Employment Type */}
                      {job.employment_type && (
                        <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <Clock className="h-4 w-4" />
                          <span>
                            {formatEmploymentType(job.employment_type)}
                          </span>
                        </div>
                      )}

                      {/* Experience Level */}
                      {job.experience_level && (
                        <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <Star className="h-4 w-4" />
                          <span>{job.experience_level}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Posted Date - Only show if we have posted date or search keywords */}
                  {(job.postedAt || job.searchKeywords) && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {job.postedAt ? (
                          <>Posted {formatDate(job.postedAt)}</>
                        ) : (
                          <>Discovered {formatDate(job.discoveredAt)}</>
                        )}
                      </span>
                      {job.searchKeywords && (
                        <>
                          <span className="text-gray-400 dark:text-gray-500">
                            •
                          </span>
                          <span>Keywords: {job.searchKeywords}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Personalized "Why This Matters" Section for Golden Opportunities */}
                  {job.market_intelligence?.golden_opportunity &&
                    job.opportunity_insights && (
                      <div className="mb-4 rounded-lg border border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50 p-4 dark:border-yellow-700 dark:from-yellow-900/20 dark:to-orange-900/20">
                        <div className="flex items-start gap-3">
                          <Crown className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                          <div className="space-y-3">
                            <div>
                              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                                Why this opportunity is perfect for you
                              </h4>
                              <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                                {
                                  job.opportunity_insights.summary
                                    .personalized_pitch
                                }
                              </p>
                            </div>

                            {/* Key Reasons */}
                            {job.opportunity_insights.insights.key_reasons
                              .length > 0 && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
                                  Key Match Points:
                                </p>
                                <ul className="space-y-0.5 text-xs text-yellow-700 dark:text-yellow-300">
                                  {job.opportunity_insights.insights.key_reasons
                                    .slice(0, 3)
                                    .map((reason, idx) => (
                                      <li
                                        key={idx}
                                        className="flex items-start gap-1"
                                      >
                                        <span className="mt-1.5 block h-1 w-1 flex-shrink-0 rounded-full bg-yellow-600 dark:bg-yellow-400" />
                                        <span>{reason}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}

                            {/* Fit Confidence */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                                Match Confidence:
                              </span>
                              <div className="flex items-center gap-1">
                                <div className="h-2 w-16 rounded-full bg-yellow-200 dark:bg-yellow-800">
                                  <div
                                    className="h-2 rounded-full bg-yellow-600 transition-all duration-300 dark:bg-yellow-400"
                                    style={{
                                      width: `${job.opportunity_insights.summary.fit_confidence}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                                  {
                                    job.opportunity_insights.summary
                                      .fit_confidence
                                  }
                                  %
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* UI 2.0: Primary Apply Button (prioritized) */}
                    {job.apply_link && (
                      <Button asChild className="gap-2">
                        <a
                          href={job.apply_link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Apply Now
                        </a>
                      </Button>
                    )}

                    <Button
                      onClick={() => handleSaveToApplications(job.jobId)}
                      className="gap-2"
                      variant={job.apply_link ? "outline" : "default"}
                      disabled={job.status === "saved"}
                    >
                      {job.status === "saved" ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Save to Applications
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleStatusUpdate(job.jobId, "ignored")}
                      disabled={job.status === "ignored"}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Ignore
                    </Button>

                    {/* Secondary job URL link if no direct apply link */}
                    {job.jobUrl && !job.apply_link && (
                      <Button variant="outline" asChild className="gap-2">
                        <a
                          href={job.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View Job
                        </a>
                      </Button>
                    )}

                    {/* View job link as secondary option when apply link exists */}
                    {job.jobUrl && job.apply_link && (
                      <Button
                        variant="ghost"
                        asChild
                        className="gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                      >
                        <a
                          href={job.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Details
                        </a>
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            handleStatusUpdate(job.jobId, "discovered")
                          }
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Mark as Reviewed
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Infinite scroll trigger element */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading more jobs...</span>
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-500">
              Scroll to load more jobs ({jobs.length} of {totalJobCount})
            </div>
          )}
        </div>
      )}

      {/* End of results indicator */}
      {!hasMore && jobs.length > 0 && (
        <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-500">
          You&apos;ve reached the end of discovered jobs
        </div>
      )}
    </div>
  );
}
