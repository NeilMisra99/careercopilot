"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle,
  Crown,
  DollarSign,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Save,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getJobDiscoveryPreferencesAction,
  updateJobDiscoveryPreferencesAction,
} from "../_lib/actions";

interface JobDiscoveryPreferences {
  target_roles: string[];
  target_companies: string[];
  target_locations: string[];
  excluded_companies: string[];
  excluded_keywords: string[];
  salary_min?: number;
  salary_max?: number;
  remote_preference: "remote_only" | "hybrid" | "on_site" | "any";
  job_types: string[];
  experience_levels: string[];
  auto_save_discovered_jobs: boolean;
  is_active: boolean;
  last_discovery_at?: string;
  subscription_tier?: "free" | "pro" | "executive";
}

interface JobDiscoveryPreferencesProps {
  onSuccess?: () => void;
}

export function JobDiscoveryPreferences({
  onSuccess,
}: JobDiscoveryPreferencesProps) {
  const [preferences, setPreferences] = useState<JobDiscoveryPreferences>({
    target_roles: [],
    target_companies: [],
    target_locations: [],
    excluded_companies: [],
    excluded_keywords: [],
    remote_preference: "any",
    job_types: [],
    experience_levels: [],
    auto_save_discovered_jobs: true,
    is_active: true,
    subscription_tier: "free",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form input states for adding new items
  const [newRole, setNewRole] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newExcludedCompany, setNewExcludedCompany] = useState("");
  const [newExcludedKeyword, setNewExcludedKeyword] = useState("");

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    try {
      const result = await getJobDiscoveryPreferencesAction();
      if (result.success && result.data) {
        const data = result.data as JobDiscoveryPreferences;
        setPreferences({
          ...data,
          subscription_tier: data.subscription_tier || "free",
        });
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
      toast.error("Failed to load preferences");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { subscription_tier, last_discovery_at, ...updatePayload } =
        preferences;

      const result = await updateJobDiscoveryPreferencesAction(updatePayload);
      if (result.success) {
        if (!onSuccess) {
          toast.success("Preferences saved successfully!");
        }
        onSuccess?.();
      } else {
        toast.error(result.error || "Failed to save preferences");
      }
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const addToArray = (
    field: keyof JobDiscoveryPreferences,
    value: string,
    setter: (value: string) => void,
  ) => {
    if (!value.trim()) return;

    const currentArray = preferences[field] as string[];
    if (!currentArray.includes(value.trim())) {
      setPreferences({
        ...preferences,
        [field]: [...currentArray, value.trim()],
      });
    }
    setter("");
  };

  const removeFromArray = (
    field: keyof JobDiscoveryPreferences,
    value: string,
  ) => {
    const currentArray = preferences[field] as string[];
    setPreferences({
      ...preferences,
      [field]: currentArray.filter((item) => item !== value),
    });
  };

  const toggleArrayItem = (
    field: keyof JobDiscoveryPreferences,
    value: string,
  ) => {
    const currentArray = preferences[field] as string[];
    if (currentArray.includes(value)) {
      removeFromArray(field, value);
    } else {
      setPreferences({
        ...preferences,
        [field]: [...currentArray, value],
      });
    }
  };

  // Tier-based feature access
  const isPremium =
    preferences.subscription_tier === "pro" ||
    preferences.subscription_tier === "executive";
  const isFree = preferences.subscription_tier === "free";

  // Upgrade prompt component
  const UpgradePrompt = ({ feature }: { feature: string }) => (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          {feature} is available on Pro and Executive plans
        </span>
      </div>
      <Link href="/pricing" className="mt-2 inline-block">
        <Button size="sm" variant="outline" className="gap-2">
          Upgrade Now
        </Button>
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Header */}
      <div className="border-border border-b p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500 shadow-lg">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-xl font-medium">
                  Discovery Preferences
                </h2>
                <Badge
                  className={
                    preferences.subscription_tier === "executive"
                      ? "border-purple-200 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                      : preferences.subscription_tier === "pro"
                        ? "border-blue-200 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        : "border-gray-200 bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                  }
                >
                  {isPremium && <Crown className="mr-1 h-3 w-3" />}
                  {preferences.subscription_tier?.toUpperCase()}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Configure your automated job discovery settings
              </p>
            </div>
          </div>
          <div className="mr-4">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              variant="default"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-6 py-6">
          <div className="space-y-6">
            {/* Discovery Status */}
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="mb-4">
                <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                  <Zap className="h-5 w-5 text-emerald-600" />
                  Discovery Status
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Control your automated job discovery settings
                </p>
              </div>
              <div className="space-y-6">
                <div className="border-border bg-muted/50 flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 shadow-lg">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <Label className="text-base font-medium">
                        Automated Discovery
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {isFree
                          ? "Weekly discovery (Free tier)"
                          : "Daily discovery (Premium tier)"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={preferences.is_active}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, is_active: checked })
                    }
                  />
                </div>

                {/* Auto-Save - Premium Only */}
                <div
                  className={`border-border rounded-lg border p-4 ${isFree ? "bg-muted/30" : "bg-muted/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg shadow-lg ${isFree ? "bg-muted" : "bg-blue-500"}`}
                      >
                        {isFree ? (
                          <Lock className="text-muted-foreground h-5 w-5" />
                        ) : (
                          <Sparkles className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div>
                        <Label
                          className={`text-base font-medium ${isFree ? "text-muted-foreground" : ""}`}
                        >
                          Auto-Save Discoveries
                        </Label>
                        <p
                          className={`text-sm ${isFree ? "text-muted-foreground" : "text-muted-foreground"}`}
                        >
                          Automatically save discovered jobs to applications
                          (Premium)
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={
                        preferences.auto_save_discovered_jobs && isPremium
                      }
                      onCheckedChange={(checked) =>
                        isPremium &&
                        setPreferences({
                          ...preferences,
                          auto_save_discovered_jobs: checked,
                        })
                      }
                      disabled={isFree}
                    />
                  </div>
                  {isFree && (
                    <div className="mt-3">
                      <UpgradePrompt feature="Auto-save discovered jobs" />
                    </div>
                  )}
                </div>

                {preferences.last_discovery_at && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="text-muted-foreground h-4 w-4" />
                      <span className="text-foreground text-sm">
                        Last discovery:{" "}
                        {new Date(
                          preferences.last_discovery_at,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Target Roles - Available for all tiers */}
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="mb-4">
                <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                  <Users className="h-5 w-5 text-purple-600" />
                  Target Roles
                  <Badge variant="outline" className="text-xs">
                    Required
                  </Badge>
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Job titles and roles you&apos;re interested in (essential for
                  discovery)
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Senior Frontend Engineer, Product Manager"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        addToArray("target_roles", newRole, setNewRole);
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      addToArray("target_roles", newRole, setNewRole)
                    }
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {preferences.target_roles.map((role) => (
                    <Badge
                      key={role}
                      className="flex items-center gap-1 border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-800/50 dark:bg-purple-950/30 dark:text-purple-300"
                    >
                      {role}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-purple-900 dark:hover:text-purple-100"
                        onClick={() => removeFromArray("target_roles", role)}
                      />
                    </Badge>
                  ))}
                </div>

                {preferences.target_roles.length === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Add at least one target role to enable job discovery
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Work Preference & Target Locations */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="mb-4">
                  <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                    <MapPin className="h-5 w-5 text-blue-600" />
                    Work Preference
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Remote work preferences
                  </p>
                </div>
                <div>
                  <Select
                    value={preferences.remote_preference}
                    onValueChange={(
                      value: "remote_only" | "hybrid" | "on_site" | "any",
                    ) =>
                      setPreferences({
                        ...preferences,
                        remote_preference: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">
                        Any (Remote, Hybrid, On-site)
                      </SelectItem>
                      <SelectItem value="remote_only">Remote Only</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="on_site">On-site Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="mb-4">
                  <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                    <MapPin className="h-5 w-5 text-green-600" />
                    Target Locations
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Preferred job locations
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., San Francisco, Remote"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          addToArray(
                            "target_locations",
                            newLocation,
                            setNewLocation,
                          );
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        addToArray(
                          "target_locations",
                          newLocation,
                          setNewLocation,
                        )
                      }
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {preferences.target_locations.map((location) => (
                      <Badge
                        key={location}
                        className="flex items-center gap-1 border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800/50 dark:bg-green-950/30 dark:text-green-300"
                      >
                        {location}
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-green-900 dark:hover:text-green-100"
                          onClick={() =>
                            removeFromArray("target_locations", location)
                          }
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Premium Features Section */}
            {isPremium && (
              <>
                {/* Salary Range & Target Companies - Premium Only */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        Salary Range
                        <Crown className="h-4 w-4 text-amber-500" />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Expected salary range (optional)
                      </p>
                    </div>
                    <div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Minimum</Label>
                          <Input
                            type="number"
                            placeholder="80,000"
                            value={preferences.salary_min || ""}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                salary_min: e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Maximum</Label>
                          <Input
                            type="number"
                            placeholder="150,000"
                            value={preferences.salary_max || ""}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                salary_max: e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <Building2 className="h-5 w-5 text-blue-600" />
                        Target Companies
                        <Crown className="h-4 w-4 text-amber-500" />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Companies you&apos;d like to work for (watchlist)
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g., Google, Microsoft"
                          value={newCompany}
                          onChange={(e) => setNewCompany(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              addToArray(
                                "target_companies",
                                newCompany,
                                setNewCompany,
                              );
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            addToArray(
                              "target_companies",
                              newCompany,
                              setNewCompany,
                            )
                          }
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {preferences.target_companies.map((company) => (
                          <Badge
                            key={company}
                            className="flex items-center gap-1 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300"
                          >
                            {company}
                            <X
                              className="h-3 w-3 cursor-pointer hover:text-blue-900 dark:hover:text-blue-100"
                              onClick={() =>
                                removeFromArray("target_companies", company)
                              }
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Job Types & Experience Levels - Premium Only */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        Job Types
                        <Crown className="h-4 w-4 text-amber-500" />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Types of employment you&apos;re interested in
                      </p>
                    </div>
                    <div className="space-y-3">
                      {[
                        "Full-time",
                        "Part-time",
                        "Contract",
                        "Temporary",
                        "Internship",
                        "Volunteer",
                      ].map((type) => (
                        <div
                          key={type}
                          className="border-border bg-muted/50 flex items-center justify-between rounded-lg border p-3"
                        >
                          <Label
                            htmlFor={`job-type-${type}`}
                            className="font-medium"
                          >
                            {type}
                          </Label>
                          <input
                            type="checkbox"
                            id={`job-type-${type}`}
                            checked={preferences.job_types.includes(type)}
                            onChange={() => toggleArrayItem("job_types", type)}
                            className="border-border h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        Experience Levels
                        <Crown className="h-4 w-4 text-amber-500" />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Experience levels you&apos;re targeting
                      </p>
                    </div>
                    <div className="space-y-3">
                      {[
                        "Internship",
                        "Entry level",
                        "Associate",
                        "Mid-senior level",
                        "Director",
                        "Executive",
                      ].map((level) => (
                        <div
                          key={level}
                          className="border-border bg-muted/50 flex items-center justify-between rounded-lg border p-3"
                        >
                          <Label
                            htmlFor={`exp-level-${level}`}
                            className="font-medium"
                          >
                            {level}
                          </Label>
                          <input
                            type="checkbox"
                            id={`exp-level-${level}`}
                            checked={preferences.experience_levels.includes(
                              level,
                            )}
                            onChange={() =>
                              toggleArrayItem("experience_levels", level)
                            }
                            className="border-border h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Exclusions - Premium Only */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        Excluded Companies
                        <Crown className="h-4 w-4 text-amber-500" />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Companies to avoid in discovery
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g., Company Name"
                          value={newExcludedCompany}
                          onChange={(e) =>
                            setNewExcludedCompany(e.target.value)
                          }
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              addToArray(
                                "excluded_companies",
                                newExcludedCompany,
                                setNewExcludedCompany,
                              );
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            addToArray(
                              "excluded_companies",
                              newExcludedCompany,
                              setNewExcludedCompany,
                            )
                          }
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {preferences.excluded_companies.map((company) => (
                          <Badge
                            key={company}
                            className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300"
                          >
                            {company}
                            <X
                              className="h-3 w-3 cursor-pointer hover:text-red-900 dark:hover:text-red-100"
                              onClick={() =>
                                removeFromArray("excluded_companies", company)
                              }
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        Excluded Keywords
                        <Crown className="h-4 w-4 text-amber-500" />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Keywords to avoid in job descriptions
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g., sales, marketing"
                          value={newExcludedKeyword}
                          onChange={(e) =>
                            setNewExcludedKeyword(e.target.value)
                          }
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              addToArray(
                                "excluded_keywords",
                                newExcludedKeyword,
                                setNewExcludedKeyword,
                              );
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            addToArray(
                              "excluded_keywords",
                              newExcludedKeyword,
                              setNewExcludedKeyword,
                            )
                          }
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {preferences.excluded_keywords.map((keyword) => (
                          <Badge
                            key={keyword}
                            className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300"
                          >
                            {keyword}
                            <X
                              className="h-3 w-3 cursor-pointer hover:text-red-900 dark:hover:text-red-100"
                              onClick={() =>
                                removeFromArray("excluded_keywords", keyword)
                              }
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Free Tier Upgrade Prompt */}
            {isFree && (
              <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-amber-800/50 dark:from-amber-950/30 dark:to-orange-950/30 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="mb-4">
                  <h3 className="flex items-center gap-2 text-lg font-medium text-amber-800 dark:text-amber-200">
                    <Crown className="h-5 w-5" />
                    Unlock Premium Features
                  </h3>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    Upgrade to Pro or Executive for advanced job discovery
                    features
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Company watchlist</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Auto-save discoveries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Salary range filtering</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Advanced exclusions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">
                        Daily discovery (vs weekly)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Priority processing</span>
                    </div>
                  </div>
                  <Link href="/pricing">
                    <Button
                      size="sm"
                      className="w-full gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700"
                    >
                      <Crown className="h-4 w-4" />
                      Upgrade to Pro - $24/month
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
