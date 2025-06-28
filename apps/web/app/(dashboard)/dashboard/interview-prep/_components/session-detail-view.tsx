"use client";

import {
  deleteInterviewSessionAction,
  getInterviewBriefAction,
  getInterviewQuestionsAction,
  getInterviewSessionDetailsAction,
  triggerInterviewBriefGenerationAction,
  triggerInterviewQuestionGenerationAction,
  updateInterviewSessionAction,
} from "@/app/(dashboard)/dashboard/interview-prep/_lib/actions/interview-prep-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  Calendar,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  Star,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { revalidateInterviewPrepCacheAction } from "../_lib/actions/cache-actions";
import type {
  InterviewBrief,
  InterviewQuestion,
  InterviewSession,
  StarStory,
} from "../_lib/types";
import { InterviewBriefSection } from "./interview-brief-section";
import { InterviewQuestionsSection } from "./interview-questions-section";
import { StarStoriesSection } from "./star-stories-section";

interface SessionDetailViewProps {
  session: InterviewSession;
  starStories: StarStory[];
  onBack: () => void;
  onUpdate: (updatedSession: InterviewSession) => void;
}

// Real-time progress interface
interface SessionProgress {
  id: string;
  question_generation_status: string | null;
  brief_generation_status: string | null;
  generation_progress: number | null;
  generation_metadata: Record<string, unknown> | null;
  updated_at: string;
}

export function SessionDetailView({
  session: initialSession,
  starStories,
  onBack,
  onUpdate,
}: SessionDetailViewProps) {
  const [session, setSession] = useState<InterviewSession>(initialSession);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [brief, setBrief] = useState<InterviewBrief | null>(null);
  const [activeTab, setActiveTab] = useState("questions");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Track completed generations to prevent duplicate completion toasts
  const completedGenerationsRef = useRef<Set<string>>(new Set());

  // Filter STAR stories for this resume
  const relevantStarStories = starStories.filter(
    (story) => story.resume_id === session.resume_id,
  );

  const loadSessionDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load full session details
      const sessionResult = await getInterviewSessionDetailsAction(session.id);
      if (sessionResult.success && sessionResult.data) {
        const updatedSession = sessionResult.data as InterviewSession;
        setSession(updatedSession);
        onUpdate(updatedSession);
      }

      // Load questions and brief in parallel
      const [questionsResult, briefResult] = await Promise.all([
        getInterviewQuestionsAction(session.id),
        getInterviewBriefAction(session.id),
      ]);

      if (questionsResult.success && questionsResult.data) {
        setQuestions(questionsResult.data as InterviewQuestion[]);
      }

      if (briefResult.success && briefResult.data) {
        setBrief(briefResult.data as InterviewBrief);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load session details",
      );
    } finally {
      setIsLoading(false);
    }
  }, [session.id, onUpdate]);

  // Load session details initially
  useEffect(() => {
    loadSessionDetails();
  }, [loadSessionDetails]);

  // Real-time subscription for generation progress
  useEffect(() => {
    const supabase = createClient();

    // Track which generations are already completed to prevent duplicate toasts
    const initiallyCompletedGenerations = new Set<string>();

    // Check initial state for completed generations
    if (session.question_generation_status === "completed") {
      initiallyCompletedGenerations.add(`${session.id}-questions`);
    }
    if (session.brief_generation_status === "completed") {
      initiallyCompletedGenerations.add(`${session.id}-brief`);
    }

    initiallyCompletedGenerations.forEach((id) => {
      completedGenerationsRef.current.add(id);
    });

    // Fetch complete current state of session on refresh
    const fetchLatestSessionState = async () => {
      const { data: currentSession, error } = await supabase
        .from("interview_sessions")
        .select(
          "id, question_generation_status, brief_generation_status, generation_progress, generation_metadata, updated_at",
        )
        .eq("id", session.id)
        .single();

      if (error) {
        return;
      }

      if (currentSession) {
        // Update session state with latest generation status
        setSession((prevSession) => ({
          ...prevSession,
          question_generation_status: currentSession.question_generation_status,
          brief_generation_status: currentSession.brief_generation_status,
          generation_progress: currentSession.generation_progress,
          generation_metadata: currentSession.generation_metadata,
          updated_at: currentSession.updated_at,
        }));

        // Update completion tracking with any newly completed generations
        if (
          currentSession.question_generation_status === "completed" &&
          !completedGenerationsRef.current.has(`${session.id}-questions`)
        ) {
          completedGenerationsRef.current.add(`${session.id}-questions`);
        }

        if (
          currentSession.brief_generation_status === "completed" &&
          !completedGenerationsRef.current.has(`${session.id}-brief`)
        ) {
          completedGenerationsRef.current.add(`${session.id}-brief`);
        }
      }
    };

    fetchLatestSessionState();

    const channel = supabase
      .channel(`interview-session-progress-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "interview_sessions",
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const sessionUpdate = payload.new as SessionProgress;
          const oldSession = payload.old as SessionProgress;

          // Only process generation-related updates
          const isGenerationUpdate =
            sessionUpdate.question_generation_status ||
            sessionUpdate.brief_generation_status ||
            sessionUpdate.generation_progress !== null;

          if (!isGenerationUpdate) return;

          // Skip if no actual generation state change
          if (
            oldSession &&
            oldSession.question_generation_status ===
              sessionUpdate.question_generation_status &&
            oldSession.brief_generation_status ===
              sessionUpdate.brief_generation_status &&
            oldSession.generation_progress === sessionUpdate.generation_progress
          ) {
            return;
          }

          // Update session status
          setSession((prev) => ({
            ...prev,
            question_generation_status:
              sessionUpdate.question_generation_status,
            brief_generation_status: sessionUpdate.brief_generation_status,
            generation_progress: sessionUpdate.generation_progress,
            generation_metadata: sessionUpdate.generation_metadata,
            updated_at: sessionUpdate.updated_at,
          }));

          // Handle question generation completion
          const wasQuestionCompleted =
            oldSession?.question_generation_status === "completed";
          const isQuestionNowCompleted =
            sessionUpdate.question_generation_status === "completed";
          const questionAlreadyHandled = completedGenerationsRef.current.has(
            `${session.id}-questions`,
          );

          if (
            isQuestionNowCompleted &&
            !questionAlreadyHandled &&
            !wasQuestionCompleted
          ) {
            completedGenerationsRef.current.add(`${session.id}-questions`);

            toast.success("Interview questions generated!", {
              description: "Your AI-powered questions are ready for review.",
            });

            handleCacheRevalidation();

            // Reload questions data
            setTimeout(() => {
              loadSessionDetails();
            }, 500);
          } else if (isQuestionNowCompleted && !questionAlreadyHandled) {
            // Mark as handled even if it was already completed to prevent future duplicates
            completedGenerationsRef.current.add(`${session.id}-questions`);
          }

          // Handle brief generation completion
          const wasBriefCompleted =
            oldSession?.brief_generation_status === "completed";
          const isBriefNowCompleted =
            sessionUpdate.brief_generation_status === "completed";
          const briefAlreadyHandled = completedGenerationsRef.current.has(
            `${session.id}-brief`,
          );

          if (
            isBriefNowCompleted &&
            !briefAlreadyHandled &&
            !wasBriefCompleted
          ) {
            completedGenerationsRef.current.add(`${session.id}-brief`);

            toast.success("Interview brief generated!", {
              description:
                "Your comprehensive interview preparation guide is ready.",
            });

            handleCacheRevalidation();

            // Reload brief data
            setTimeout(() => {
              loadSessionDetails();
            }, 500);
          } else if (isBriefNowCompleted && !briefAlreadyHandled) {
            // Mark as handled even if it was already completed to prevent future duplicates
            completedGenerationsRef.current.add(`${session.id}-brief`);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, loadSessionDetails]);

  // Handle cache revalidation
  const handleCacheRevalidation = async () => {
    try {
      await revalidateInterviewPrepCacheAction();
      // Add delay to let cache invalidation propagate
      setTimeout(() => {
        router.refresh();
      }, 100);
    } catch (error) {
      console.error("Cache revalidation failed:", error);
    }
  };

  const handleStatusChange = async (newStatus: InterviewSession["status"]) => {
    // Optimistic update
    const previousStatus = session.status;
    const optimisticSession = { ...session, status: newStatus };
    setSession(optimisticSession);
    onUpdate(optimisticSession);

    try {
      const result = await updateInterviewSessionAction(session.id, {
        status: newStatus,
      });
      if (result.success && result.data) {
        const updatedSession = result.data as InterviewSession;
        setSession(updatedSession);
        onUpdate(updatedSession);
      } else {
        // Revert on failure
        const revertedSession = { ...session, status: previousStatus };
        setSession(revertedSession);
        onUpdate(revertedSession);
        setError(result.error || "Failed to update status");
      }
    } catch (err) {
      // Revert on error
      const revertedSession = { ...session, status: previousStatus };
      setSession(revertedSession);
      onUpdate(revertedSession);
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleGenerateQuestions = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await triggerInterviewQuestionGenerationAction(
        session.id,
        session.application_id,
        session.resume_id,
        session.session_type,
        true, // forceRefresh
      );

      if (result.success) {
        toast.success("Question generation started!", {
          description: "AI is generating personalized interview questions...",
        });
      } else {
        setError(result.error || "Failed to generate questions");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate questions",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateBrief = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await triggerInterviewBriefGenerationAction(
        session.id,
        session.application_id,
        session.resume_id,
        true, // forceRefresh
      );

      if (result.success) {
        toast.success("Brief generation started!", {
          description: "AI is preparing your comprehensive interview guide...",
        });
      } else {
        setError(result.error || "Failed to generate brief");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate brief");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!confirm("Are you sure you want to delete this session?")) return;

    try {
      const result = await deleteInterviewSessionAction(session.id);
      if (result.success) {
        onBack();
      } else {
        setError(result.error || "Failed to delete session");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
      case "in_progress":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "draft":
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const getTypeColor = (type: string) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="space-y-2">
            <h1 className="text-foreground text-2xl font-medium">
              {session.session_name}
            </h1>
            <div className="text-muted-foreground flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Building className="h-4 w-4" />
                <span>{session.applications.company_name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Target className="h-4 w-4" />
                <span>{session.applications.role}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{new Date(session.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={getStatusColor(session.status)}
              >
                {session.status.replace("_", " ")}
              </Badge>
              <Badge
                variant="outline"
                className={getTypeColor(session.session_type)}
              >
                {session.session_type.replace("_", " ")}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSessionDetails}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleStatusChange("in_progress")}
                disabled={session.status === "in_progress"}
              >
                <Clock className="mr-2 h-4 w-4" />
                Mark In Progress
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange("completed")}
                disabled={session.status === "completed"}
              >
                <ChevronRight className="mr-2 h-4 w-4" />
                Mark Completed
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDeleteSession}
                className="text-red-600"
              >
                Delete Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Content Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Questions
          </TabsTrigger>
          <TabsTrigger value="star-stories" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            STAR Stories
          </TabsTrigger>
          <TabsTrigger value="brief" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Interview Brief
          </TabsTrigger>
        </TabsList>

        {/* Questions Tab */}
        <TabsContent value="questions" className="space-y-4">
          {isLoading ? (
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-center">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            </div>
          ) : (
            <InterviewQuestionsSection
              questions={questions}
              onGenerate={handleGenerateQuestions}
              isGenerating={isGenerating}
              showActions={false}
              maxHeight="calc(100vh - 300px)"
            />
          )}
        </TabsContent>

        {/* STAR Stories Tab */}
        <TabsContent value="star-stories" className="space-y-4">
          <StarStoriesSection
            starStories={relevantStarStories}
            showActions={false}
            maxHeight="calc(100vh - 300px)"
          />
        </TabsContent>

        {/* Interview Brief Tab */}
        <TabsContent value="brief" className="space-y-4">
          {isLoading ? (
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-center">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            </div>
          ) : (
            <InterviewBriefSection
              brief={brief}
              onGenerate={handleGenerateBrief}
              isGenerating={isGenerating}
              maxHeight="calc(100vh - 300px)"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
