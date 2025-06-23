"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Crown,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getManualSearchLimitsAction,
  triggerJobScrapingAction,
} from "../_lib/actions";

interface JobDiscoveryFormProps {
  onSuccess?: () => void;
}

interface SearchLimits {
  can_search: boolean;
  searches_used: number;
  daily_limit: number;
  subscription_tier: string;
  resets_at: string;
}

export function JobDiscoveryForm({ onSuccess }: JobDiscoveryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchLimits, setSearchLimits] = useState<SearchLimits | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);

  const [formData, setFormData] = useState({
    keywords: "",
    location: "",
    timeRange: "",
    jobType: "",
    experienceLevel: "",
    remote: "",
    company: "",
  });

  // Load search limits on component mount
  useEffect(() => {
    loadSearchLimits();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.keywords.trim()) {
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

    setIsSubmitting(true);

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
        keywords: formData.keywords.trim(),
        location: formData.location.trim() || undefined,
        geoId: formData.location.trim() || undefined,
        filters: {
          timeRange: mapTimeRange(formData.timeRange),
          jobType: mapJobType(formData.jobType),
          experienceLevel: mapExperienceLevel(formData.experienceLevel),
          remote: mapRemote(formData.remote),
          company: formData.company.trim() || undefined,
        },
      });

      if (result.success) {
        toast.success("Job scraping started!", {
          description:
            result.message ||
            "Your search is being processed in the background.",
        });

        // Reset form
        setFormData({
          keywords: "",
          location: "",
          timeRange: "",
          jobType: "",
          experienceLevel: "",
          remote: "",
          company: "",
        });

        onSuccess?.();
        // Reload limits to show updated usage
        loadSearchLimits();
      } else {
        toast.error("Failed to start job scraping", {
          description: result.error || "Please try again.",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Please check your connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            Manual Job Discovery
          </CardTitle>
          <CardDescription>
            Search for specific job opportunities using ScrapingDog&apos;s
            LinkedIn Jobs API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                  <Badge
                    className={getTierColor(searchLimits.subscription_tier)}
                  >
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Primary Fields */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords *</Label>
                <Input
                  id="keywords"
                  placeholder="e.g., Software Engineer, Product Manager"
                  value={formData.keywords}
                  onChange={(e) =>
                    setFormData({ ...formData, keywords: e.target.value })
                  }
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">
                  <MapPin className="mr-1 inline h-4 w-4" />
                  Location
                </Label>
                <Input
                  id="location"
                  placeholder="e.g., San Francisco, CA"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-sm font-medium text-gray-500">
                  Advanced Filters
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Time Range</Label>
                  <Select
                    value={formData.timeRange}
                    onValueChange={(value) =>
                      setFormData({ ...formData, timeRange: value })
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Past 24 hours">
                        Past 24 hours
                      </SelectItem>
                      <SelectItem value="Past week">Past week</SelectItem>
                      <SelectItem value="Past month">Past month</SelectItem>
                      <SelectItem value="Any time">Any time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Job Type</Label>
                  <Select
                    value={formData.jobType}
                    onValueChange={(value) =>
                      setFormData({ ...formData, jobType: value })
                    }
                    disabled={isSubmitting}
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

                <div className="space-y-2">
                  <Label>Experience Level</Label>
                  <Select
                    value={formData.experienceLevel}
                    onValueChange={(value) =>
                      setFormData({ ...formData, experienceLevel: value })
                    }
                    disabled={isSubmitting}
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

                <div className="space-y-2">
                  <Label>Work Type</Label>
                  <Select
                    value={formData.remote}
                    onValueChange={(value) =>
                      setFormData({ ...formData, remote: value })
                    }
                    disabled={isSubmitting}
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

                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    placeholder="e.g., Google, Microsoft"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !formData.keywords.trim() ||
                  (searchLimits ? !searchLimits.can_search : false)
                }
                className="min-w-[140px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Start Search
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Info Section */}
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 text-blue-600" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900">
                  How Manual Discovery Works
                </p>
                <p className="text-sm text-blue-700">
                  Your search will be processed in the background using
                  ScrapingDog&apos;s LinkedIn Jobs API. Results will appear in
                  your job discovery dashboard within a few minutes.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
