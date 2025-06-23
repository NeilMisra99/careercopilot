"use client";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
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

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: "easeOut",
      },
    }),
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
        <Button size="sm" variant="outline" className="h-7 text-xs">
          Upgrade Now
        </Button>
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Header */}
      <div className="border-b border-slate-200/60 p-6 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
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
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure your automated job discovery settings
              </p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-purple-600 font-semibold text-white shadow-sm hover:bg-purple-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-6 py-6">
          <div className="space-y-6">
            {/* Discovery Status */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Zap className="h-5 w-5 text-emerald-600" />
                    Discovery Status
                  </CardTitle>
                  <CardDescription>
                    Control your automated job discovery settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                        <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <Label className="text-base font-medium">
                          Automated Discovery
                        </Label>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
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
                    className={`rounded-lg border border-slate-200/60 p-4 dark:border-slate-700/60 ${isFree ? "bg-slate-100/50 dark:bg-slate-800/30" : "bg-slate-50 dark:bg-slate-800/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${isFree ? "bg-slate-200 dark:bg-slate-700" : "bg-blue-100 dark:bg-blue-900/50"}`}
                        >
                          {isFree ? (
                            <Lock className="h-5 w-5 text-slate-500" />
                          ) : (
                            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div>
                          <Label
                            className={`text-base font-medium ${isFree ? "text-slate-500" : ""}`}
                          >
                            Auto-Save Discoveries
                          </Label>
                          <p
                            className={`text-sm ${isFree ? "text-slate-400" : "text-slate-600 dark:text-slate-400"}`}
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

                  {/* Fantastic Discovery - Executive Only */}
                  <div
                    className={`rounded-lg border border-slate-200/60 p-4 dark:border-slate-700/60 ${
                      preferences.subscription_tier !== "executive"
                        ? "bg-slate-100/50 dark:bg-slate-800/30"
                        : "bg-slate-50 dark:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            preferences.subscription_tier !== "executive"
                              ? "bg-slate-200 dark:bg-slate-700"
                              : "bg-purple-100 dark:bg-purple-900/50"
                          }`}
                        >
                          {preferences.subscription_tier !== "executive" ? (
                            <Lock className="h-5 w-5 text-slate-500" />
                          ) : (
                            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          )}
                        </div>
                        <div>
                          <Label
                            className={`text-base font-medium ${
                              preferences.subscription_tier !== "executive"
                                ? "text-slate-500"
                                : ""
                            }`}
                          >
                            Fantastic API Discovery
                          </Label>
                          <p
                            className={`text-sm ${
                              preferences.subscription_tier !== "executive"
                                ? "text-slate-400"
                                : "text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            Premium job data with detailed insights (Executive
                            only)
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={false} // TODO: Add fantastic discovery preference when implemented
                        onCheckedChange={() => {}} // TODO: Implement fantastic toggle handler
                        disabled={preferences.subscription_tier !== "executive"}
                      />
                    </div>
                    {preferences.subscription_tier !== "executive" && (
                      <div className="mt-3">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                          <div className="flex items-center gap-2">
                            <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              Fantastic API access is exclusive to Executive
                              plan
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            • 25 jobs per manual search • Advanced job insights
                            • Golden opportunity detection
                          </div>
                          <Link href="/pricing" className="mt-2 inline-block">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                            >
                              Upgrade to Executive
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>

                  {preferences.last_discovery_at && (
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          Last discovery:{" "}
                          {new Date(
                            preferences.last_discovery_at,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Target Roles - Available for all tiers */}
            <motion.div
              custom={1}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Users className="h-5 w-5 text-purple-600" />
                    Target Roles
                    <Badge variant="outline" className="text-xs">
                      Required
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Job titles and roles you&apos;re interested in (essential
                    for discovery)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      onClick={() =>
                        addToArray("target_roles", newRole, setNewRole)
                      }
                      variant="outline"
                      size="icon"
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
                </CardContent>
              </Card>
            </motion.div>

            {/* Work Preference & Target Locations */}
            <div className="grid gap-6 lg:grid-cols-2">
              <motion.div
                custom={2}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
              >
                <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                      <MapPin className="h-5 w-5 text-blue-600" />
                      Work Preference
                    </CardTitle>
                    <CardDescription>Remote work preferences</CardDescription>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                custom={3}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
              >
                <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                      <MapPin className="h-5 w-5 text-green-600" />
                      Target Locations
                    </CardTitle>
                    <CardDescription>Preferred job locations</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                        onClick={() =>
                          addToArray(
                            "target_locations",
                            newLocation,
                            setNewLocation,
                          )
                        }
                        variant="outline"
                        size="icon"
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
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Premium Features Section */}
            {isPremium && (
              <>
                {/* Salary Range & Target Companies - Premium Only */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <motion.div
                    custom={4}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          <DollarSign className="h-5 w-5 text-green-600" />
                          Salary Range
                          <Crown className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>
                          Expected salary range (optional)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              Minimum
                            </Label>
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
                            <Label className="text-sm font-medium">
                              Maximum
                            </Label>
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
                      </CardContent>
                    </Card>
                  </motion.div>

                  <motion.div
                    custom={5}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          <Building2 className="h-5 w-5 text-blue-600" />
                          Target Companies
                          <Crown className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>
                          Companies you&apos;d like to work for (watchlist)
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
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
                            onClick={() =>
                              addToArray(
                                "target_companies",
                                newCompany,
                                setNewCompany,
                              )
                            }
                            variant="outline"
                            size="icon"
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
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>

                {/* Job Types & Experience Levels - Premium Only */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <motion.div
                    custom={6}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          Job Types
                          <Crown className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>
                          Types of employment you&apos;re interested in
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
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
                            className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/50"
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
                              onChange={() =>
                                toggleArrayItem("job_types", type)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </motion.div>

                  <motion.div
                    custom={7}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          Experience Levels
                          <Crown className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>
                          Experience levels you&apos;re targeting
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
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
                            className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/50"
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
                              className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>

                {/* Exclusions - Premium Only */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <motion.div
                    custom={8}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          <AlertCircle className="h-5 w-5 text-red-600" />
                          Excluded Companies
                          <Crown className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>
                          Companies to avoid in discovery
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
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
                            onClick={() =>
                              addToArray(
                                "excluded_companies",
                                newExcludedCompany,
                                setNewExcludedCompany,
                              )
                            }
                            variant="outline"
                            size="icon"
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
                      </CardContent>
                    </Card>
                  </motion.div>

                  <motion.div
                    custom={9}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          <AlertCircle className="h-5 w-5 text-red-600" />
                          Excluded Keywords
                          <Crown className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>
                          Keywords to avoid in job descriptions
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
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
                            onClick={() =>
                              addToArray(
                                "excluded_keywords",
                                newExcludedKeyword,
                                setNewExcludedKeyword,
                              )
                            }
                            variant="outline"
                            size="icon"
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
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              </>
            )}

            {/* Free Tier Upgrade Prompt */}
            {isFree && (
              <motion.div
                custom={10}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
              >
                <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm dark:border-amber-800/50 dark:from-amber-950/30 dark:to-orange-950/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-amber-800 dark:text-amber-200">
                      <Crown className="h-5 w-5" />
                      Unlock Premium Features
                    </CardTitle>
                    <CardDescription className="text-amber-700 dark:text-amber-300">
                      Upgrade to Pro or Executive for advanced job discovery
                      features
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                      <Button className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700">
                        <Crown className="mr-2 h-4 w-4" />
                        Upgrade to Pro - $24/month
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
