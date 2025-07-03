"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  Brain,
  CheckCircle,
  Database,
  FileSearch,
  Loader2,
  MessageSquare,
  Sparkles,
  Star,
  Target,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

// Define InterviewSessionProgress interface
export interface InterviewSessionProgress {
  id: string;
  question_generation_status: string;
  brief_generation_status: string;
  star_generation_status: string;
  generation_progress: number | null;
  generation_metadata: Record<string, unknown> | null;
  updated_at: string;
}

interface RealtimeProgressDisplayProps {
  progress: InterviewSessionProgress | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  forceShow?: boolean;
  type?: "questions" | "brief" | "star" | "auto"; // Type of generation to track
}

export function RealtimeProgressDisplay({
  progress,
  className = "",
  size = "md",
  forceShow = false,
  type = "auto",
}: RealtimeProgressDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Determine which generation process to show based on current state
  const getActiveGeneration = () => {
    if (!progress) return null;

    if (type === "questions") {
      return {
        status: progress.question_generation_status,
        type: "questions",
        icon: MessageSquare,
        label: "Question Generation",
      };
    }

    if (type === "brief") {
      return {
        status: progress.brief_generation_status,
        type: "brief",
        icon: Target,
        label: "Brief Generation",
      };
    }

    if (type === "star") {
      return {
        status: progress.star_generation_status,
        type: "star",
        icon: Star,
        label: "STAR Story Generation",
      };
    }

    // Auto mode: show whichever is currently processing
    if (progress.question_generation_status === "processing") {
      return {
        status: progress.question_generation_status,
        type: "questions",
        icon: MessageSquare,
        label: "Question Generation",
      };
    }

    if (progress.brief_generation_status === "processing") {
      return {
        status: progress.brief_generation_status,
        type: "brief",
        icon: Target,
        label: "Brief Generation",
      };
    }

    if (progress.star_generation_status === "processing") {
      return {
        status: progress.star_generation_status,
        type: "star",
        icon: Star,
        label: "STAR Story Generation",
      };
    }

    // Show most recent generation
    if (progress.question_generation_status === "completed" || progress.question_generation_status === "failed") {
      return {
        status: progress.question_generation_status,
        type: "questions",
        icon: MessageSquare,
        label: "Question Generation",
      };
    }

    if (progress.brief_generation_status === "completed" || progress.brief_generation_status === "failed") {
      return {
        status: progress.brief_generation_status,
        type: "brief",
        icon: Target,
        label: "Brief Generation",
      };
    }

    if (progress.star_generation_status === "completed" || progress.star_generation_status === "failed") {
      return {
        status: progress.star_generation_status,
        type: "star",
        icon: Star,
        label: "STAR Story Generation",
      };
    }

    return null;
  };

  const activeGeneration = getActiveGeneration();

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
    } else if (activeGeneration && activeGeneration.status === "processing") {
      setIsVisible(true);
    } else if (activeGeneration && (activeGeneration.status === "completed" || activeGeneration.status === "failed")) {
      // Show completion/failure for a moment then hide
      setIsVisible(true);
      const timer = setTimeout(() => setIsVisible(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [progress, forceShow, activeGeneration]);

  if (!isVisible || !activeGeneration) {
    return null;
  }

  // Get stage from metadata
  const metadata = progress?.generation_metadata as {
    step?: string;
    message?: string;
    questions_count?: number;
    stories_count?: number;
    started_at?: string;
    error?: string;
  } | null;

  const stage = metadata?.step || (activeGeneration.status === "processing" ? "generating" : activeGeneration.status);
  const message = metadata?.message || getDefaultMessage(activeGeneration.status, activeGeneration.type);

  const getStageIcon = (stage: string, status: string) => {
    switch (stage) {
      case "initializing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "gathering_data":
        return <FileSearch className="h-4 w-4 animate-pulse text-purple-500" />;
      case "ai_generation":
      case "generating":
        return <Brain className="h-4 w-4 animate-pulse text-indigo-500" />;
      case "saving_questions":
      case "saving_brief":
      case "saving_stories":
        return <Database className="h-4 w-4 animate-bounce text-green-500" />;
      case "completed":
        return status === "completed" ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-500" />
        );
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Zap className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStageColor = (stage: string, status: string) => {
    if (status === "failed") {
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
    }

    switch (stage) {
      case "initializing":
        return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
      case "gathering_data":
        return "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200";
      case "ai_generation":
      case "generating":
        return "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200";
      case "saving_questions":
      case "saving_brief":
      case "saving_stories":
        return "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200";
      case "completed":
        return "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  function getDefaultMessage(status: string, type: string) {
    const itemType = type === "questions" ? "questions" : type === "brief" ? "interview brief" : "STAR stories";
    
    switch (status) {
      case "processing":
        return `Generating AI-powered ${itemType}...`;
      case "completed":
        return `${type === "questions" ? "Questions" : type === "brief" ? "Brief" : "STAR stories"} generated successfully!`;
      case "failed":
        return `Failed to generate ${itemType}`;
      default:
        return `Processing ${itemType}...`;
    }
  }

  const progressPercentage = progress?.generation_progress || 0;
  const ActiveIcon = activeGeneration.icon;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm", 
    lg: "text-base",
  };

  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${getStageColor(stage, activeGeneration.status)} ${className}`}
    >
      {/* Header with icon and stage */}
      <div className="flex items-center gap-2">
        <ActiveIcon className="h-4 w-4" />
        {getStageIcon(stage, activeGeneration.status)}
        <div className="flex-1">
          <div className={`font-medium capitalize ${sizeClasses[size]}`}>
            {activeGeneration.label}
            {activeGeneration.status === "failed" ? " Failed" : ""}
          </div>
          <div className={`text-opacity-80 ${sizeClasses.sm}`}>{message}</div>
        </div>
        <Badge variant="outline" className="text-xs">
          {progressPercentage}%
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Generation data preview (if available) */}
      {(metadata?.questions_count || metadata?.stories_count) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {metadata?.questions_count && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {metadata.questions_count} questions generated
            </span>
          )}
          {metadata?.stories_count && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {metadata.stories_count} STAR stories generated
            </span>
          )}
        </div>
      )}

      {/* Error message if failed */}
      {activeGeneration.status === "failed" && metadata?.error && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {metadata.error}
        </div>
      )}
    </div>
  );
}