"use client";

import { revalidateInterviewPrepCacheAction } from "@/app/(dashboard)/dashboard/interview-prep/_lib/actions/cache-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useEffect, useState } from "react";
import type {
  Application,
  InterviewPrepStats,
  InterviewSession,
  Resume,
  StarStory,
} from "../_lib/types";
import { CreateSessionDialog } from "./create-session-dialog";
import { SessionDetailView } from "./session-detail-view";

interface StatCard {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  bgGradient: string;
  iconBg: string;
  textColor: string;
}

interface InterviewPrepPageContentProps {
  initialSessions: InterviewSession[];
  initialStarStories: StarStory[];
  initialApplications: Application[];
  initialResumes: Resume[];
  initialStats: InterviewPrepStats;
  error?: string;
}

export function InterviewPrepPageContent({
  initialSessions,
  initialStarStories,
  initialApplications,
  initialResumes,
  initialStats,
  error: initialError,
}: InterviewPrepPageContentProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<InterviewSession[]>(initialSessions);
  const [filteredSessions, setFilteredSessions] =
    useState<InterviewSession[]>(initialSessions);
  const [selectedSession, setSelectedSession] =
    useState<InterviewSession | null>(null);
  const [starStories] = useState<StarStory[]>(initialStarStories);
  const [stats, setStats] = useState<InterviewPrepStats>(initialStats);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // UI state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);

  // Function to calculate stats from current data
  const calculateStats = (
    sessionsData: InterviewSession[],
    storiesData: StarStory[],
  ): InterviewPrepStats => {
    const totalSessions = sessionsData.length;
    const completedSessions = sessionsData.filter(
      (s) => s.status === "completed",
    ).length;
    const draftSessions = sessionsData.filter(
      (s) => s.status === "draft",
    ).length;
    const inProgressSessions = sessionsData.filter(
      (s) => s.status === "in_progress",
    ).length;

    // Calculate recent activity (sessions created in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentActivity = sessionsData.filter(
      (s) => new Date(s.created_at) > sevenDaysAgo,
    ).length;

    // Calculate STAR stories stats
    const totalStarStories = storiesData.length;
    let averageConfidenceScore = 0;
    if (storiesData.length > 0) {
      const totalConfidence = storiesData.reduce(
        (sum, story) => sum + (story.confidence_score || 0),
        0,
      );
      averageConfidenceScore =
        Math.round((totalConfidence / storiesData.length) * 100) / 100;
    }

    return {
      totalSessions,
      completedSessions,
      draftSessions,
      inProgressSessions,
      totalQuestions: 0, // This would need to be calculated from questions data
      totalStarStories,
      averageConfidenceScore,
      recentActivity,
    };
  };

  // Create stat cards
  const statCards: StatCard[] = [
    {
      title: "Total Sessions",
      value: stats.totalSessions.toString(),
      subtitle: `${stats.draftSessions} draft, ${stats.inProgressSessions} active`,
      icon: FileText,
      gradient: "from-blue-500 to-blue-600",
      bgGradient: "from-blue-50 to-blue-100",
      iconBg: "bg-blue-500",
      textColor: "text-blue-900",
    },
    {
      title: "Completed Sessions",
      value: stats.completedSessions.toString(),
      subtitle: `${Math.round((stats.completedSessions / Math.max(stats.totalSessions, 1)) * 100)}% completion rate`,
      icon: CalendarCheck,
      gradient: "from-green-500 to-green-600",
      bgGradient: "from-green-50 to-green-100",
      iconBg: "bg-green-500",
      textColor: "text-green-900",
    },
    {
      title: "STAR Stories",
      value: stats.totalStarStories.toString(),
      subtitle: `${stats.averageConfidenceScore}% avg confidence`,
      icon: Star,
      gradient: "from-yellow-500 to-yellow-600",
      bgGradient: "from-yellow-50 to-yellow-100",
      iconBg: "bg-yellow-500",
      textColor: "text-yellow-900",
    },
    {
      title: "Recent Activity",
      value: stats.recentActivity.toString(),
      subtitle: "Sessions this week",
      icon: Target,
      gradient: "from-purple-500 to-purple-600",
      bgGradient: "from-purple-50 to-purple-100",
      iconBg: "bg-purple-500",
      textColor: "text-purple-900",
    },
  ];

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
    let filtered = sessions;

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
  }, [sessions, searchQuery, statusFilter, typeFilter]);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "in_progress":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "draft":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "behavioral":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "technical":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "company_specific":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "mixed":
        return "bg-teal-100 text-teal-800 border-teal-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (selectedSession) {
    return (
      <SessionDetailView
        session={selectedSession}
        starStories={starStories}
        onBack={() => setSelectedSession(null)}
        onUpdate={(updatedSession) => {
          setSessions(
            sessions.map((s) =>
              s.id === updatedSession.id ? updatedSession : s,
            ),
          );
          setSelectedSession(updatedSession);
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Interview Prep
            </h1>
            <p className="text-muted-foreground">
              AI-powered interview preparation with personalized questions, STAR
              stories, and company insights
            </p>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            size="lg"
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
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
          <Card key={stat.title} className="overflow-hidden">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${stat.bgGradient} p-6`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className={`text-sm font-medium ${stat.textColor}`}>
                      {stat.title}
                    </p>
                    <p className={`text-2xl font-bold ${stat.textColor}`}>
                      {stat.value}
                    </p>
                    <p className={`text-xs ${stat.textColor} opacity-80`}>
                      {stat.subtitle}
                    </p>
                  </div>
                  <div className={`${stat.iconBg} rounded-lg p-3`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-1 items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search sessions, companies, or roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isLoading}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </motion.div>

      {/* Sessions Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {filteredSessions.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <MessageSquare className="text-muted-foreground h-8 w-8" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">
              No interview sessions found
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {sessions.length === 0
                ? "Create your first interview prep session to get started."
                : "Try adjusting your search or filters."}
            </p>
            {sessions.length === 0 && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Session
              </Button>
            )}
          </Card>
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
                  whileHover={{ y: -4 }}
                  onClick={() => setSelectedSession(session)}
                  className="cursor-pointer"
                >
                  <Card className="h-full transition-shadow hover:shadow-lg">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="leading-tight font-semibold">
                              {session.session_name}
                            </h3>
                            <p className="text-muted-foreground text-sm">
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
                          Created{" "}
                          {new Date(session.created_at).toLocaleDateString()}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSession(session);
                            }}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
        onSuccess={(newSession) => {
          const updatedSessions = [newSession, ...sessions];
          setSessions(updatedSessions);
          setIsCreateDialogOpen(false);

          // Recalculate stats with new session
          const newStats = calculateStats(updatedSessions, starStories);
          setStats(newStats);
        }}
      />
    </div>
  );
}
