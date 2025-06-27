"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  MapPin,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
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
      onStatusUpdate(jobId, status);

      // Optimistic UI update
      setJobs((prev) => {
        // If user ignored the job we can remove it from the current view so it disappears immediately.
        if (status === "ignored") {
          return prev.filter((job) => job.jobId !== jobId);
        }

        // Otherwise just update its status locally.
        return prev.map((job) =>
          job.jobId === jobId
            ? { ...job, status, statusUpdatedAt: new Date().toISOString() }
            : job,
        );
      });

      // Success toast handled by parent component to avoid duplicates
    } catch {
      toast.error("Failed to update job status");
    }
  };

  const handleSaveToApplications = async (jobId: string) => {
    try {
      onSaveToApplications(jobId);

      // Update local state optimistically
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

      // Success toast handled by parent component to avoid duplicates
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

  // UI 2.0: Enhanced salary formatting with smart period detection
  const formatSalary = (job: DiscoveredJob): string | null => {
    // Helper function to detect if salary is likely hourly based on amount and job type
    const isLikelyHourly = (
      amount: number,
      employmentType?: string,
    ): boolean => {
      // If amount is under $200, it's likely hourly (covers most hourly ranges $15-$150/hr)
      if (amount < 200) return true;

      // Contract and part-time jobs with amounts under $500 are likely hourly
      if (
        employmentType &&
        (employmentType.toLowerCase().includes("contract") ||
          employmentType.toLowerCase().includes("part_time") ||
          employmentType.toLowerCase().includes("temporary")) &&
        amount < 500
      ) {
        return true;
      }

      return false;
    };

    // Helper function to format currency symbol
    const formatCurrencySymbol = (currency?: string): string => {
      if (!currency) return "$";

      const currencyMap: Record<string, string> = {
        USD: "$",
        CAD: "CAD $",
        EUR: "€",
        GBP: "£",
        AUD: "AUD $",
      };

      return (
        currencyMap[currency.toUpperCase()] || `${currency.toUpperCase()} `
      );
    };

    // Helper function to format amount based on suspected period
    const formatAmount = (
      amount: number,
      isHourly: boolean,
      currency?: string,
    ): string => {
      const symbol = formatCurrencySymbol(currency);

      if (isHourly) {
        // For hourly rates, show exact amount
        return `${symbol}${amount}`;
      } else {
        // For annual salaries, use k formatting if > 1000
        if (amount >= 1000) {
          return `${symbol}${(amount / 1000).toFixed(0)}k`;
        } else {
          return `${symbol}${amount}`;
        }
      }
    };

    // Helper function to determine period suffix
    const getPeriodSuffix = (
      isHourly: boolean,
      period?: string,
      employmentType?: string,
    ): string => {
      if (period) {
        // If period is explicitly provided, use it
        if (period.includes("hour")) return "/hr";
        if (period.includes("day")) return "/day";
        if (period.includes("week")) return "/week";
        if (period.includes("month")) return "/month";
        if (period.includes("year") || period.includes("annual"))
          return "/year";
        return `/${period}`;
      }

      if (isHourly) {
        return "/hr";
      }

      // For contract/temporary jobs without explicit period, assume hourly if amount suggests it
      if (
        employmentType &&
        (employmentType.toLowerCase().includes("contract") ||
          employmentType.toLowerCase().includes("temporary"))
      ) {
        return "/hr";
      }

      // Default to annual for full-time positions
      return "/year";
    };

    // Prioritize normalized fields (UI 2.0)
    if (job.salary_min !== undefined || job.salary_max !== undefined) {
      const currency = job.salary_currency;
      const isHourly = isLikelyHourly(
        job.salary_min || job.salary_max || 0,
        job.employment_type,
      );
      const periodSuffix = getPeriodSuffix(
        isHourly,
        job.salary_period,
        job.employment_type,
      );

      if (job.salary_min && job.salary_max) {
        const minFormatted = formatAmount(job.salary_min, isHourly, currency);
        const maxFormatted = formatAmount(job.salary_max, isHourly, currency);
        return `${minFormatted} - ${maxFormatted}${periodSuffix}`;
      } else if (job.salary_max) {
        const maxFormatted = formatAmount(job.salary_max, isHourly, currency);
        return `Up to ${maxFormatted}${periodSuffix}`;
      } else if (job.salary_min) {
        const minFormatted = formatAmount(job.salary_min, isHourly, currency);
        return `From ${minFormatted}${periodSuffix}`;
      }
    }

    // Fallback to salary_json for backward compatibility
    const salary_json = job.salary_json;
    if (!salary_json) return null;

    if (typeof salary_json === "object" && salary_json !== null) {
      if (salary_json.min && salary_json.max) {
        const isHourly = isLikelyHourly(salary_json.min, job.employment_type);
        const periodSuffix = getPeriodSuffix(
          isHourly,
          undefined,
          job.employment_type,
        );
        const currency = salary_json.currency;

        const minFormatted = formatAmount(salary_json.min, isHourly, currency);
        const maxFormatted = formatAmount(salary_json.max, isHourly, currency);
        return `${minFormatted} - ${maxFormatted}${periodSuffix}`;
      } else if (salary_json.amount) {
        const isHourly = isLikelyHourly(
          salary_json.amount,
          job.employment_type,
        );
        const periodSuffix = getPeriodSuffix(
          isHourly,
          undefined,
          job.employment_type,
        );
        const currency = salary_json.currency;

        const amountFormatted = formatAmount(
          salary_json.amount,
          isHourly,
          currency,
        );
        return `${amountFormatted}${periodSuffix}`;
      }
    } else if (typeof salary_json === "number") {
      const isHourly = isLikelyHourly(salary_json, job.employment_type);
      const periodSuffix = getPeriodSuffix(
        isHourly,
        undefined,
        job.employment_type,
      );

      const amountFormatted = formatAmount(salary_json, isHourly);
      return `${amountFormatted}${periodSuffix}`;
    }

    return null;
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

  const getEmploymentTypeBadgeColor = (type?: string): string => {
    if (!type)
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600";

    // Normalize the type to handle all scraper variations
    const normalizedType = type
      .toLowerCase()
      .trim()
      .replace(/[-_\s]/g, "");

    // Handle all possible variations from different scrapers:
    // JSearch: "FULLTIME", "PARTTIME", "CONTRACTOR", "INTERN"
    // AI Analysis: "Full-time", "Part-time", "Contract", "Temporary"
    // LinkedIn: undefined (no employment type data)

    if (normalizedType === "fulltime" || normalizedType === "full") {
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700";
    }

    if (normalizedType === "parttime" || normalizedType === "part") {
      return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700";
    }

    if (
      normalizedType === "contractor" ||
      normalizedType === "contract" ||
      normalizedType === "contracting"
    ) {
      return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700";
    }

    if (
      normalizedType === "temporary" ||
      normalizedType === "temp" ||
      normalizedType.includes("temp")
    ) {
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700";
    }

    if (normalizedType === "intern" || normalizedType === "internship") {
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700";
    }

    if (normalizedType === "volunteer" || normalizedType === "volunteering") {
      return "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-700";
    }

    if (normalizedType === "freelance" || normalizedType === "freelancer") {
      return "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-700";
    }

    if (normalizedType === "perdiem" || normalizedType === "perdiem") {
      return "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-700";
    }

    // Default fallback for unknown types
    return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600";
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
      <div className="columns-1 gap-4 md:columns-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card
            key={i}
            className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 mb-4 break-inside-avoid rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-7 w-14" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-12 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <div className="space-y-4">
          <div className="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
            <Building2 className="text-muted-foreground h-8 w-8" />
          </div>
          <div>
            <h3 className="text-foreground text-lg font-medium">
              No jobs discovered yet
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Start a job discovery search to find opportunities
            </p>
          </div>
          <Button size="sm" onClick={onRefresh} variant="outline">
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
      <div className="columns-1 gap-4 md:columns-2">
        {jobs.map((job) => (
          <Card
            key={job.jobId}
            className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 mb-4 break-inside-avoid rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-200 hover:!shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <CardContent className="p-0">
              <div className="space-y-3">
                {/* Header Row */}
                <div className="flex items-center gap-3">
                  {/* Company Logo */}
                  {job.company_logo && job.discovery_source !== "serper" && (
                    <div className="flex-shrink-0 rounded-md bg-white p-1 dark:bg-white">
                      <Image
                        src={job.company_logo}
                        alt={`${job.company} logo`}
                        className="h-10 w-10 object-contain"
                        width={40}
                        height={40}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    {/* Job Title */}
                    <h3 className="text-foreground line-clamp-2 text-sm leading-tight font-medium">
                      {job.title}
                    </h3>

                    {/* Company & Location */}
                    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                      <Building2 className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{job.company}</span>
                      {job.location && (
                        <>
                          <span>•</span>
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{job.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badges Row */}
                <div className="flex flex-wrap items-center gap-1">
                  {/* Source Badge */}
                  {job.discovery_source && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${getSourceBadgeColor(job.discovery_source)}`}
                    >
                      {job.discovery_source === "linkedin" ||
                      job.discovery_source === "jsearch"
                        ? "Premium"
                        : "Search"}
                    </Badge>
                  )}

                  {/* Employment Type */}
                  {job.employment_type && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${getEmploymentTypeBadgeColor(job.employment_type)}`}
                    >
                      {formatEmploymentType(job.employment_type)}
                    </Badge>
                  )}
                </div>

                {/* Metrics Row */}
                {(formatSalary(job) ||
                  (job.applicants !== undefined &&
                    job.applicants !== null)) && (
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    {/* Salary Information */}
                    {formatSalary(job) && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span>{formatSalary(job)}</span>
                      </div>
                    )}

                    {/* Applicant Count */}
                    {job.applicants !== undefined &&
                      job.applicants !== null && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{job.applicants} applicants</span>
                        </div>
                      )}
                  </div>
                )}

                {/* Posted Date */}
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {job.postedAt ? (
                      <>Posted {formatDate(job.postedAt)}</>
                    ) : (
                      <>Discovered {formatDate(job.discoveredAt)}</>
                    )}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Primary Apply Button */}
                  {job.apply_link && (
                    <Button
                      size="sm"
                      asChild
                      className="gap-2 bg-blue-600 text-white hover:bg-blue-700 hover:text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                    >
                      <a
                        href={job.apply_link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Apply
                      </a>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={() => handleSaveToApplications(job.jobId)}
                    variant={job.apply_link ? "outline" : "default"}
                    disabled={job.status === "saved"}
                    className={
                      job.apply_link
                        ? "gap-2"
                        : "gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                    }
                  >
                    {job.status === "saved" ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Save
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusUpdate(job.jobId, "ignored")}
                    disabled={job.status === "ignored"}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Ignore
                  </Button>

                  {/* View Job Link */}
                  {job.jobUrl && (
                    <Button size="sm" variant="ghost" asChild className="gap-2">
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    </Button>
                  )}
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
