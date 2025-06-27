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
  getManualSearchLimitsAction,
  refreshJobDiscoveryDataAction,
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
  const [searchLimits, setSearchLimits] = useState<SearchLimits | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Optimistic state for immediate UI updates
  const [optimisticStats, setOptimisticStats] =
    useState<JobDiscoveryStats>(initialStats);
  const [optimisticJobs, setOptimisticJobs] =
    useState<DiscoveredJob[]>(initialJobs);

  // Sync optimistic state when props change (after router.refresh())
  useEffect(() => {
    setOptimisticStats(initialStats);
    setOptimisticJobs(initialJobs);
  }, [initialStats, initialJobs]);

  const router = useRouter();

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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshJobDiscoveryDataAction();
      if (result.success) {
        toast.success("Data refreshed successfully");
        // Refresh the page to get updated data from cache
        setTimeout(() => {
          router.refresh();
        }, 100);
      } else {
        toast.error(result.error || "Failed to refresh data");
      }
    } catch (error) {
      toast.error("Failed to refresh data");
      console.error("Error refreshing data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleJobAction = async (
    jobId: string,
    action: "save" | "ignore" | "interested",
  ) => {
    try {
      // Optimistic updates for immediate feedback
      if (action === "ignore") {
        // Remove job from list and update stats
        setOptimisticJobs((prev) => prev.filter((job) => job.jobId !== jobId));
        setOptimisticStats((prev) => ({
          ...prev,
          discoveredJobs: Math.max(0, prev.discoveredJobs - 1),
          ignoredJobs: prev.ignoredJobs + 1,
        }));
      } else if (action === "save") {
        // Update job status and stats
        setOptimisticJobs((prev) =>
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
        setOptimisticStats((prev) => ({
          ...prev,
          discoveredJobs: Math.max(0, prev.discoveredJobs - 1),
          savedJobs: prev.savedJobs + 1,
        }));
      }

      if (action === "save") {
        const result = await saveJobToApplicationsAction(jobId);
        if (result.success) {
          toast.success("Job saved to applications");
          // Trigger a router refresh so SSR caches revalidate and stats/cards update automatically
          setTimeout(() => {
            router.refresh();
          }, 100);
        } else {
          // Revert optimistic update on error
          setOptimisticJobs(initialJobs);
          setOptimisticStats(initialStats);
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
          // Revert optimistic update on error
          setOptimisticJobs(initialJobs);
          setOptimisticStats(initialStats);
          toast.error(result.error || `Failed to mark job as ${status}`);
        }
      }
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticJobs(initialJobs);
      setOptimisticStats(initialStats);
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

  return (
    <div className="space-y-6 p-6">
      {/* Header with Stats and Actions */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-medium">
            Job Discovery
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Discover and track job opportunities automatically
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RunDiscoveryNowButton />
          <Sheet open={preferencesOpen} onOpenChange={setPreferencesOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
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
            size="sm"
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
        <Card className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
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
        <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Total Jobs
              </p>
              <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                {optimisticStats.totalJobs}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 shadow-lg">
              <Target className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Discovered Jobs
              </p>
              <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                {optimisticStats.discoveredJobs}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500 shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Saved Jobs
              </p>
              <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                {optimisticStats.savedJobs}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500 shadow-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Recent Jobs
              </p>
              <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                {optimisticStats.recentJobs}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 shadow-lg">
              <Calendar className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Job List */}
      <JobList
        initialJobs={optimisticJobs}
        loading={false}
        onStatusUpdate={(jobId, status) =>
          handleJobAction(jobId, status === "ignored" ? "ignore" : "save")
        }
        onSaveToApplications={(jobId) => handleJobAction(jobId, "save")}
        onRefresh={handleRefresh}
        totalJobs={optimisticStats.discoveredJobs}
      />
    </div>
  );
}
