"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Crown, RefreshCw, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getManualSearchLimitsAction,
  triggerJobScrapingAction,
} from "../_lib/actions";

interface JobDiscoveryFormModalProps {
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

interface SearchLimits {
  can_search: boolean;
  searches_used: number;
  daily_limit: number;
  subscription_tier: string;
  resets_at: string;
}

export function JobDiscoveryFormModal({
  onSuccess,
  trigger,
}: JobDiscoveryFormModalProps) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchLimits, setSearchLimits] = useState<SearchLimits | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(false);

  // Form state
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [timeRange, setTimeRange] = useState("");
  const [jobType, setJobType] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [remote, setRemote] = useState("");

  // Load search limits when modal opens
  useEffect(() => {
    if (open) {
      loadSearchLimits();
    }
  }, [open]);

  const loadSearchLimits = async () => {
    setLoadingLimits(true);
    try {
      const result = await getManualSearchLimitsAction();
      if (result.success && result.data) {
        setSearchLimits(result.data as SearchLimits);
      }
    } catch (error) {
      console.error("Error loading search limits:", error);
    } finally {
      setLoadingLimits(false);
    }
  };

  const resetForm = () => {
    setKeywords("");
    setLocation("");
    setTimeRange("");
    setJobType("");
    setExperienceLevel("");
    setRemote("");
  };

  const handleSearch = async () => {
    if (!keywords.trim()) {
      toast.error("Please enter search keywords");
      return;
    }

    // Check limits before searching
    if (searchLimits && !searchLimits.can_search) {
      toast.error("Daily search limit reached", {
        description: `You've used ${searchLimits.searches_used}/${searchLimits.daily_limit} searches today.`,
      });
      return;
    }

    setSearching(true);
    try {
      // Map display values to ScrapingDog API format
      const mapTimeRange = (value: string) => {
        switch (value) {
          case "Past 24 hours":
            return "past-24h";
          case "Past week":
            return "past-week";
          case "Past month":
            return "past-month";
          case "Any time":
            return "any";
          default:
            return undefined;
        }
      };

      const mapJobType = (value: string) => {
        switch (value) {
          case "Full-time":
            return "full-time";
          case "Part-time":
            return "part-time";
          case "Contract":
            return "contract";
          case "Temporary":
            return "temporary";
          case "Volunteer":
            return "internship"; // Map Volunteer to internship as closest match
          default:
            return undefined;
        }
      };

      const mapExperienceLevel = (value: string) => {
        switch (value) {
          case "Internship":
            return "internship";
          case "Entry level":
            return "entry";
          case "Associate":
            return "associate";
          case "Mid-senior level":
            return "mid-senior";
          case "Director":
            return "director";
          default:
            return undefined;
        }
      };

      const mapRemote = (value: string) => {
        switch (value) {
          case "Remote":
            return "remote";
          case "On-site":
            return "on-site";
          case "Hybrid":
            return "hybrid";
          default:
            return undefined;
        }
      };

      const result = await triggerJobScrapingAction({
        keywords: keywords.trim(),
        location: location.trim() || undefined,
        filters: {
          timeRange: mapTimeRange(timeRange),
          jobType: mapJobType(jobType),
          experienceLevel: mapExperienceLevel(experienceLevel),
          remote: mapRemote(remote),
        },
      });

      if (result.success) {
        toast.success("Job discovery started!", {
          description: result.message || "Results will appear shortly.",
        });
        setOpen(false);
        resetForm();
        onSuccess?.();
        // Reload limits to show updated usage
        loadSearchLimits();
      } else {
        toast.error(result.error || "Failed to start job discovery", {
          description: result.message,
        });
      }
    } catch (error) {
      toast.error("Failed to start job discovery");
      console.error("Error starting job discovery:", error);
    } finally {
      setSearching(false);
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

  const defaultTrigger = (
    <Button size="sm" variant="default">
      <Sparkles className="h-4 w-4" />
      Discover New Jobs
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Discover New Jobs
          </DialogTitle>
          <DialogDescription>
            Search for job opportunities using ScrapingDog&apos;s LinkedIn Jobs
            API. Results will be saved to your job discovery dashboard.
          </DialogDescription>
        </DialogHeader>

        {/* Search Limits Display */}
        {loadingLimits ? (
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm text-gray-600">
              Loading search limits...
            </span>
          </div>
        ) : searchLimits ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <Badge className={getTierColor(searchLimits.subscription_tier)}>
                  {getTierIcon(searchLimits.subscription_tier)}
                  {searchLimits.subscription_tier.toUpperCase()}
                </Badge>
                <span className="text-sm text-gray-600">
                  {searchLimits.searches_used}/{searchLimits.daily_limit}{" "}
                  searches used today
                </span>
              </div>
              <div className="text-xs text-gray-500">Resets tomorrow</div>
            </div>

            {!searchLimits.can_search && (
              <Alert>
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
          </div>
        ) : null}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="keywords">Keywords *</Label>
            <Input
              id="keywords"
              placeholder="e.g., Software Engineer, Product Manager"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={searching}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g., San Francisco, CA"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={searching}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="timeRange">Time Range</Label>
              <Select
                value={timeRange}
                onValueChange={setTimeRange}
                disabled={searching}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Past 24 hours">Past 24 hours</SelectItem>
                  <SelectItem value="Past week">Past week</SelectItem>
                  <SelectItem value="Past month">Past month</SelectItem>
                  <SelectItem value="Any time">Any time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="jobType">Job Type</Label>
              <Select
                value={jobType}
                onValueChange={setJobType}
                disabled={searching}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full-time">Full-time</SelectItem>
                  <SelectItem value="Part-time">Part-time</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="Temporary">Temporary</SelectItem>
                  <SelectItem value="Volunteer">Volunteer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="experienceLevel">Experience Level</Label>
              <Select
                value={experienceLevel}
                onValueChange={setExperienceLevel}
                disabled={searching}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internship">Internship</SelectItem>
                  <SelectItem value="Entry level">Entry level</SelectItem>
                  <SelectItem value="Associate">Associate</SelectItem>
                  <SelectItem value="Mid-senior level">
                    Mid-senior level
                  </SelectItem>
                  <SelectItem value="Director">Director</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="remote">Work Type</Label>
              <Select
                value={remote}
                onValueChange={setRemote}
                disabled={searching}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Remote">Remote</SelectItem>
                  <SelectItem value="On-site">On-site</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={searching}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={
              searching || (searchLimits ? !searchLimits.can_search : false)
            }
            className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            {searching ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {searching ? "Searching..." : "Start Search"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
