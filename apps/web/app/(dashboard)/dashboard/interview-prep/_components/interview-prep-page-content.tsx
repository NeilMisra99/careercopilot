"use client";

import { revalidateInterviewPrepCacheAction } from "@/app/(dashboard)/dashboard/interview-prep/_lib/actions/cache-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormattedDate } from "@/hooks/use-formatted-date";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CalendarCheck,
  FileText,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  Star,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Application,
  InterviewPrepStats,
  InterviewSession,
  Resume,
  InterviewStarStory,
} from "../_lib/types";
import { CreateSessionDialog } from "./create-session-dialog";

interface InterviewPrepPageContentProps {
  initialSessions: InterviewSession[];
  initialStarStories: InterviewStarStory[];
  initialApplications: Application[];
  initialResumes: Resume[];
  initialStats: InterviewPrepStats;
  error?: string;
}

export function InterviewPrepPageContent({
  initialSessions,
  initialApplications,
  initialResumes,
  initialStats,
  error: initialError,
}: InterviewPrepPageContentProps) {
  const router = useRouter();
  const [filteredSessions, setFilteredSessions] =
    useState<InterviewSession[]>(initialSessions);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // UI state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);

  // Memoize stat cards to prevent unnecessary recalculations
  const statCards = useMemo(
    () => [
      {
        title: "Total Sessions",
        value: initialStats.totalSessions.toString(),
        subtitle: `${initialStats.preparingSessions} preparing, ${initialStats.readySessions} ready`,
        icon: FileText,
        iconColor: "bg-blue-500",
      },
      {
        title: "Completed Sessions",
        value: initialStats.completedSessions.toString(),
        subtitle: `${Math.round((initialStats.completedSessions / Math.max(initialStats.totalSessions, 1)) * 100)}% completion rate`,
        icon: CalendarCheck,
        iconColor: "bg-green-500",
      },
      {
        title: "STAR Stories",
        value: initialStats.totalStarStories.toString(),
        subtitle: `${initialStats.averageConfidenceScore}% avg confidence`,
        icon: Star,
        iconColor: "bg-amber-500",
      },
      {
        title: "Recent Activity",
        value: initialStats.recentActivity.toString(),
        subtitle: "Sessions this week",
        icon: Target,
        iconColor: "bg-purple-500",
      },
    ],
    [initialStats],
  );

  // Simplified refresh data function
  const refreshData = async () => {
    setIsLoading(true);
    try {
      // Revalidate all interview prep cache
      await revalidateInterviewPrepCacheAction();

      // Refresh the router after a short delay to let cache invalidation complete
      setTimeout(() => {
        router.refresh();
        setIsLoading(false);
      }, 100);

      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh data");
      setIsLoading(false);
    }
  };

  // Filter sessions based on search and filters
  useEffect(() => {
    let filtered = initialSessions;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (session) =>
          session.session_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          session.applications.company_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          session.applications.role
            .toLowerCase()
            .includes(searchQuery.toLowerCase()),
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((session) => session.status === statusFilter);
    }

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(
        (session) => session.session_type === typeFilter,
      );
    }

    setFilteredSessions(filtered);
  }, [initialSessions, searchQuery, statusFilter, typeFilter]);

  const getStatusBadgeColor = useCallback((status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
      case "ready":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "preparing":
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  }, []);

  const getTypeBadgeColor = useCallback((type: string) => {
    switch (type) {
      case "behavioral":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/30";
      case "technical":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30";
      case "company_specific":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30";
      case "mixed":
        return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-medium">
              Interview Prep
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              AI-powered interview preparation with personalized questions, STAR
              stories, and company insights
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              size="sm"
              variant="default"
            >
              <Plus className="h-4 w-4" />
              <span>New Session</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={isLoading}
            >
              <RefreshCcw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {stat.title}
                </p>
                <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                  {stat.value}
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  {stat.subtitle}
                </p>
              </div>
              <div
                className={`h-10 w-10 rounded-lg ${stat.iconColor} flex items-center justify-center shadow-lg`}
              >
                <stat.icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search sessions, companies, or roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="company_specific">Company</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sessions Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {filteredSessions.length === 0 ? (
          <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-12 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <MessageSquare className="text-muted-foreground h-8 w-8" />
            </div>
            <h3 className="text-foreground mb-2 text-sm font-medium">
              No interview sessions found
            </h3>
            <p className="text-muted-foreground mb-4 text-xs">
              {initialSessions.length === 0
                ? "Create your first interview prep session to get started."
                : "Try adjusting your search or filters."}
            </p>
            {initialSessions.length === 0 && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                size="sm"
                variant="default"
              >
                <Plus className="h-4 w-4" />
                <span>Create Session</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {filteredSessions.map((session, sessionIndex) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: sessionIndex * 0.1 }}
                  className="cursor-default"
                >
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 h-full rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="text-foreground text-sm leading-tight font-medium">
                            {session.session_name}
                          </h3>
                          <p className="text-muted-foreground text-xs">
                            {session.applications.company_name} •{" "}
                            {session.applications.role}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeColor(
                              session.status,
                            )}`}
                          >
                            {session.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>

                      {/* Session Type */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getTypeBadgeColor(
                            session.session_type,
                          )}`}
                        >
                          {session.session_type.replace("_", " ")}
                        </span>
                      </div>

                      {/* Resume */}
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4" />
                        <span>{session.resumes.name}</span>
                      </div>

                      {/* Timestamps */}
                      <div className="text-muted-foreground text-xs">
                        <SessionTimestamp createdAt={session.created_at} />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/dashboard/interview-prep/${session.id}`,
                            );
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Create Session Dialog */}
      <CreateSessionDialog
        applications={initialApplications}
        resumes={initialResumes}
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={() => {
          setIsCreateDialogOpen(false);
          // Just refresh the data instead of managing state
          refreshData();
        }}
      />
    </div>
  );
}

// Separate component to handle date formatting to prevent hydration issues
function SessionTimestamp({ createdAt }: { createdAt: string }) {
  const formattedDate = useFormattedDate(createdAt);
  return <>Created {formattedDate}</>;
}
