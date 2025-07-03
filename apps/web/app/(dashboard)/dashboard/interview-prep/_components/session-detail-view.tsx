"use client";

import {
  deleteInterviewSessionAction,
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
import { useFormattedDate } from "@/hooks/use-formatted-date";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  Star,
  Target,
  Trash,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { revalidateInterviewSessionCacheAction } from "../_lib/actions/cache-actions";
import type {
  InterviewBrief,
  InterviewQuestion,
  InterviewSession,
  InterviewStarStory,
} from "../_lib/types";
import { InterviewBriefSection } from "./interview-brief-section";
import { InterviewQuestionsSection } from "./interview-questions-section";
import { RealtimeProgressDisplay } from "./realtime-progress-display";
import { StarStoriesSection } from "./star-stories-section";

interface SessionDetailViewProps {
  session: InterviewSession;
  questions: InterviewQuestion[];
  brief: InterviewBrief | null;
  starStories: InterviewStarStory[];
  onBack?: () => void;
  onUpdate?: (updatedSession: InterviewSession) => void;
}

// Real-time progress interface
interface SessionProgress {
  id: string;
  question_generation_status: string | null;
  brief_generation_status: string | null;
  star_generation_status: string | null;
  status: string | null;
  generation_progress: number | null;
  generation_metadata: Record<string, unknown> | null;
  updated_at: string;
}

export function SessionDetailView({
  session,
  questions,
  brief,
  starStories,
  onBack,
}: SessionDetailViewProps) {
  const [activeTab, setActiveTab] = useState("questions");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Track completed generations to prevent duplicate completion toasts
  const completedGenerationsRef = useRef<Set<string>>(new Set());

  // Track real-time generation status for progress display
  const [realtimeStatus, setRealtimeStatus] = useState({
    question_generation_status: session.question_generation_status,
    brief_generation_status: session.brief_generation_status,
    star_generation_status: session.star_generation_status,
    generation_progress: session.generation_progress,
    generation_metadata: session.generation_metadata,
  });

  const refreshData = useCallback(async () => {
    try {
      await revalidateInterviewSessionCacheAction(session.id);
      // Add delay to let cache invalidation propagate
      setTimeout(() => {
        router.refresh();
      }, 100);
    } catch (error) {
      console.error("Cache revalidation failed:", error);
    }
  }, [router, session.id]);

  // Real-time subscription for generation progress (matches resumes pattern)
  useEffect(() => {
    if (!session.id) {
      return;
    }

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
          "id, question_generation_status, brief_generation_status, star_generation_status, generation_progress, generation_metadata, updated_at",
        )
        .eq("id", session.id)
        .single();

      if (error) {
        return;
      }

      if (currentSession) {
        // Update realtime status with latest generation status
        setRealtimeStatus({
          question_generation_status: currentSession.question_generation_status,
          brief_generation_status: currentSession.brief_generation_status,
          star_generation_status: currentSession.star_generation_status,
          generation_progress: currentSession.generation_progress,
          generation_metadata: currentSession.generation_metadata,
        });

        // Update completion tracking with any newly completed generations
        const newlyCompleted = [];
        if (
          currentSession.question_generation_status === "completed" &&
          !completedGenerationsRef.current.has(`${session.id}-questions`)
        ) {
          newlyCompleted.push("questions");
          completedGenerationsRef.current.add(`${session.id}-questions`);
        }

        if (
          currentSession.brief_generation_status === "completed" &&
          !completedGenerationsRef.current.has(`${session.id}-brief`)
        ) {
          newlyCompleted.push("brief");
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
            oldSession.star_generation_status ===
              sessionUpdate.star_generation_status &&
            oldSession.generation_progress === sessionUpdate.generation_progress
          ) {
            return;
          }

          // Update realtime status
          setRealtimeStatus({
            question_generation_status:
              sessionUpdate.question_generation_status,
            brief_generation_status: sessionUpdate.brief_generation_status,
            star_generation_status: sessionUpdate.star_generation_status,
            generation_progress: sessionUpdate.generation_progress,
            generation_metadata: sessionUpdate.generation_metadata,
          });

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
          } else if (isBriefNowCompleted && !briefAlreadyHandled) {
            // Mark as handled even if it was already completed to prevent future duplicates
            completedGenerationsRef.current.add(`${session.id}-brief`);
          }

          // Handle star story generation completion
          const wasStarCompleted =
            oldSession?.star_generation_status === "completed";
          const isStarNowCompleted =
            sessionUpdate.star_generation_status === "completed";
          const starAlreadyHandled = completedGenerationsRef.current.has(
            `${session.id}-star`,
          );

          if (isStarNowCompleted && !starAlreadyHandled && !wasStarCompleted) {
            completedGenerationsRef.current.add(`${session.id}-star`);

            toast.success("STAR stories generated!", {
              description:
                "Your personalized STAR stories are ready for review.",
            });

            handleCacheRevalidation();
          } else if (isStarNowCompleted && !starAlreadyHandled) {
            // Mark as handled even if it was already completed to prevent future duplicates
            completedGenerationsRef.current.add(`${session.id}-star`);
          }

          // Handle auto-transition to ready
          const wasStatusPreparing = oldSession?.status === "preparing";
          const isStatusNowReady = sessionUpdate.status === "ready";
          const hasAutoTransitionReason =
            sessionUpdate.generation_metadata?.auto_transition_reason ===
            "all_ai_generation_completed";

          if (
            wasStatusPreparing &&
            isStatusNowReady &&
            hasAutoTransitionReason
          ) {
            toast.success("Session ready!", {
              description:
                "All AI content generated. Your interview prep session is ready to use!",
              duration: 5000,
            });
            handleCacheRevalidation();
          }
        },
      )
      .subscribe();

    return () => {
      completedGenerationsRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  // Handle cache revalidation
  const handleCacheRevalidation = async () => {
    try {
      await revalidateInterviewSessionCacheAction(session.id);
      // Add longer delay to let cache invalidation propagate fully
      setTimeout(() => {
        router.refresh();
      }, 100);
    } catch (error) {
      console.error("Cache revalidation failed:", error);
    }
  };

  const handleStatusChange = async (newStatus: InterviewSession["status"]) => {
    try {
      const result = await updateInterviewSessionAction(session.id, {
        status: newStatus,
      });
      if (result.success && result.data) {
        refreshData();
      } else {
        setError(result.error || "Failed to update status");
      }
    } catch (err) {
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
        if (onBack) {
          onBack();
        } else {
          // Navigate back to interview prep page
          router.push("/dashboard/interview-prep");
        }
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
      case "ready":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "preparing":
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
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {!onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/interview-prep")}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

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
                <span>{useFormattedDate(session.created_at)}</span>
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
          <Button variant="outline" size="sm" onClick={refreshData}>
            <RefreshCw className="h-4 w-4" />
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
                onClick={() => handleStatusChange("ready")}
                disabled={session.status === "ready"}
              >
                <Clock className="mr-2 h-4 w-4" />
                Mark Ready
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange("completed")}
                disabled={session.status === "completed"}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark Completed
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDeleteSession}
                className="text-red-600"
              >
                <Trash className="text-red mr-2 h-4 w-4" />
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
          {/* Real-time Progress Display for Questions */}
          {realtimeStatus.question_generation_status === "processing" && (
            <RealtimeProgressDisplay
              progress={{
                id: session.id,
                question_generation_status:
                  realtimeStatus.question_generation_status || "idle",
                brief_generation_status:
                  realtimeStatus.brief_generation_status || "idle",
                star_generation_status:
                  realtimeStatus.star_generation_status || "idle",
                generation_progress: realtimeStatus.generation_progress || 0,
                generation_metadata: realtimeStatus.generation_metadata || {},
                updated_at: new Date().toISOString(),
              }}
              type="questions"
              forceShow={true}
            />
          )}

          <InterviewQuestionsSection
            questions={questions}
            onGenerate={handleGenerateQuestions}
            isGenerating={isGenerating}
            showActions={false}
            generationStatus={realtimeStatus.question_generation_status}
          />
        </TabsContent>

        {/* STAR Stories Tab */}
        <TabsContent value="star-stories" className="space-y-4">
          {/* Real-time Progress Display for Star Stories */}
          {realtimeStatus.star_generation_status === "processing" && (
            <RealtimeProgressDisplay
              progress={{
                id: session.id,
                question_generation_status:
                  realtimeStatus.question_generation_status || "idle",
                brief_generation_status:
                  realtimeStatus.brief_generation_status || "idle",
                star_generation_status:
                  realtimeStatus.star_generation_status || "idle",
                generation_progress: realtimeStatus.generation_progress || 0,
                generation_metadata: realtimeStatus.generation_metadata || {},
                updated_at: new Date().toISOString(),
              }}
              type="star"
              forceShow={true}
            />
          )}
          <StarStoriesSection starStories={starStories} showActions={false} />
        </TabsContent>

        {/* Interview Brief Tab */}
        <TabsContent value="brief" className="space-y-4">
          {/* Real-time Progress Display for Brief */}
          {realtimeStatus.brief_generation_status === "processing" && (
            <RealtimeProgressDisplay
              progress={{
                id: session.id,
                question_generation_status:
                  realtimeStatus.question_generation_status || "idle",
                brief_generation_status:
                  realtimeStatus.brief_generation_status || "idle",
                star_generation_status:
                  realtimeStatus.star_generation_status || "idle",
                generation_progress: realtimeStatus.generation_progress || 0,
                generation_metadata: realtimeStatus.generation_metadata || {},
                updated_at: new Date().toISOString(),
              }}
              type="brief"
              forceShow={true}
            />
          )}

          <InterviewBriefSection
            brief={brief}
            onGenerate={handleGenerateBrief}
            isGenerating={isGenerating}
            generationStatus={realtimeStatus.brief_generation_status}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
