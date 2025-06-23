"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertCircle,
  Calendar,
  Crown,
  RefreshCw,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getJobDiscoveryStatsAction,
  getJobsAction,
  getManualSearchLimitsAction,
  saveJobToApplicationsAction,
  updateJobStatusAction,
} from "../_lib/actions";
import { JobDiscoveryFormModal } from "./job-discovery-form-modal";
import { JobDiscoveryPreferences } from "./job-discovery-preferences";
import { JobList } from "./job-list";
import { RunDiscoveryNowButton } from "./run-discovery-now-button";

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
}

interface JobDiscoveryStats {
  totalJobs: number;
  discoveredJobs: number;
  autoSavedJobs: number;
  manuallySavedJobs: number;
  savedJobs: number; // Combined auto + manual for backward compatibility
  appliedJobs: number;
  ignoredJobs: number;
  recentJobs: number;
}

interface SearchLimits {
  can_search: boolean;
  searches_used: number;
  daily_limit: number;
  subscription_tier: string;
  resets_at: string;
}

interface JobDiscoveryPageContentProps {
  initialJobs: DiscoveredJob[];
  initialStats: JobDiscoveryStats;
}

export function JobDiscoveryPageContent({
  initialJobs,
  initialStats,
}: JobDiscoveryPageContentProps) {
  const [jobs, setJobs] = useState<DiscoveredJob[]>(initialJobs);
  const [stats, setStats] = useState<JobDiscoveryStats>(initialStats);
  const [searchLimits, setSearchLimits] = useState<SearchLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Load search limits on component mount
  useEffect(() => {
    loadSearchLimits();
  }, []);

  const loadSearchLimits = async () => {
    try {
      const limitsResult = await getManualSearchLimitsAction();
      if (limitsResult.success && limitsResult.data) {
        setSearchLimits(limitsResult.data as SearchLimits);
      }
    } catch (error) {
      console.error("Error loading search limits:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsResult, statsResult, limitsResult] = await Promise.all([
        getJobsAction({
          limit: 50,
        }),
        getJobDiscoveryStatsAction(),
        getManualSearchLimitsAction(),
      ]);

      if (jobsResult.success && jobsResult.data) {
        const jobsData = jobsResult.data as { jobs: DiscoveredJob[] };
        setJobs(jobsData.jobs || []);
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data as JobDiscoveryStats);
      }

      if (limitsResult.success && limitsResult.data) {
        setSearchLimits(limitsResult.data as SearchLimits);
      }
    } catch (error) {
      console.error("Error loading job discovery data:", error);
      toast.error("Failed to load job discovery data");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success("Data refreshed successfully");
  };

  const handleJobAction = async (
    jobId: string,
    action: "save" | "ignore" | "interested",
  ) => {
    try {
      if (action === "save") {
        const result = await saveJobToApplicationsAction(jobId);
        if (result.success) {
          toast.success("Job saved to applications");
          // Trigger a router refresh so SSR caches revalidate and stats/cards update automatically
          setTimeout(() => {
            router.refresh();
          }, 100);
        } else {
          toast.error(result.error || "Failed to save job");
        }
      } else {
        const status = action === "ignore" ? "ignored" : "discovered";
        const result = await updateJobStatusAction(jobId, { status });
        if (result.success) {
          toast.success(`Job marked as ${status}`);
          // Refresh the page to get updated stats and job status via revalidated cache
          setTimeout(() => {
            router.refresh();
          }, 100);
        } else {
          toast.error(result.error || `Failed to mark job as ${status}`);
        }
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error("Error handling job action:", error);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "executive":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "pro":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getTierIcon = (tier: string) => {
    if (tier === "executive" || tier === "pro") {
      return <Crown className="h-3 w-3" />;
    }
    return null;
  };

  // Next.js router for cache-aware refreshes
  const router = useRouter();

  if (loading && jobs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Discovery</h1>
          <p className="text-muted-foreground">
            Discover and track job opportunities automatically
          </p>
        </div>
        <div className="flex gap-2">
          <RunDiscoveryNowButton />
          <Sheet open={preferencesOpen} onOpenChange={setPreferencesOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                Preferences
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full border-l-0 bg-slate-50/95 p-0 backdrop-blur-xl sm:max-w-xl lg:max-w-2xl dark:bg-slate-900/95">
              <SheetHeader className="sr-only">
                <SheetTitle>Job Discovery Preferences</SheetTitle>
              </SheetHeader>
              <JobDiscoveryPreferences
                onSuccess={() => {
                  setPreferencesOpen(false);
                  toast.success("Preferences saved successfully!");
                  setTimeout(() => {
                    router.refresh();
                  }, 100);
                }}
              />
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <JobDiscoveryFormModal
            onSuccess={() => {
              setTimeout(() => {
                router.refresh();
              }, 100);
            }}
          />
        </div>
      </div>

      {/* Search Limits Card */}
      {searchLimits && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className={getTierColor(searchLimits.subscription_tier)}>
                  {getTierIcon(searchLimits.subscription_tier)}
                  {searchLimits.subscription_tier.toUpperCase()}
                </Badge>
                <div className="text-sm">
                  <span className="font-medium">Manual Searches:</span>{" "}
                  <span className="text-muted-foreground">
                    {searchLimits.searches_used}/{searchLimits.daily_limit} used
                    today
                  </span>
                </div>
              </div>
              <div className="text-muted-foreground text-xs">
                Resets tomorrow
              </div>
            </div>

            {!searchLimits.can_search && (
              <Alert className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You&apos;ve reached your daily search limit of{" "}
                  {searchLimits.daily_limit} searches.
                  {searchLimits.subscription_tier === "free" && (
                    <span className="mt-1 block">
                      Upgrade to <strong>Pro (50/day)</strong> or{" "}
                      <strong>Executive (200/day)</strong> for more searches.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Total Jobs
                </p>
                <p className="text-2xl font-bold">{stats.totalJobs}</p>
              </div>
              <Target className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Discovered Jobs
                </p>
                <p className="text-2xl font-bold">{stats.discoveredJobs}</p>
              </div>
              <Sparkles className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Saved Jobs
                </p>
                <p className="text-2xl font-bold">{stats.savedJobs}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Recent Jobs
                </p>
                <p className="text-2xl font-bold">{stats.recentJobs}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Job List */}
      <JobList
        initialJobs={jobs}
        loading={loading}
        onStatusUpdate={(jobId, status) =>
          handleJobAction(jobId, status === "ignored" ? "ignore" : "save")
        }
        onSaveToApplications={(jobId) => handleJobAction(jobId, "save")}
        onRefresh={loadData}
        totalJobs={stats.discoveredJobs}
      />
    </div>
  );
}
