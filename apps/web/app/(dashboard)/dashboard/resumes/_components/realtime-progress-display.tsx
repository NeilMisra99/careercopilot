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
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

// Define ResumeProgress interface locally
export interface ResumeProgress {
  id: string;
  parsing_progress: number | null;
  parsing_stage: string | null;
  parsing_message: string | null;
  parsing_data: Record<string, unknown> | null;
  parsing_status: string;
  updated_at: string;
}

interface RealtimeProgressDisplayProps {
  progress: ResumeProgress | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  forceShow?: boolean;
}

export function RealtimeProgressDisplay({
  progress,
  className = "",
  size = "md",
  forceShow = false,
}: RealtimeProgressDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (
      progress &&
      progress.parsing_stage &&
      progress.parsing_progress !== null
    ) {
      setIsVisible(true);
    } else if (forceShow) {
      setIsVisible(true);
    } else {
      // Hide after completion with a delay
      const timer = setTimeout(() => setIsVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [progress, forceShow]);

  if (!isVisible) {
    return null;
  }

  // Create default progress state when progress is null or incomplete but we want to show something
  const displayProgress = progress || {
    id: "unknown",
    parsing_progress: 5, // Default to 5% for pending resumes
    parsing_stage: "initializing",
    parsing_message: "Preparing resume for processing...",
    parsing_data: null,
    parsing_status: "pending",
    updated_at: new Date().toISOString(),
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "initializing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "extracting":
        return <FileSearch className="h-4 w-4 animate-pulse text-purple-500" />;
      case "analyzing":
        return <Brain className="h-4 w-4 animate-pulse text-indigo-500" />;
      case "saving":
        return <Database className="h-4 w-4 animate-bounce text-green-500" />;
      case "completed":
        return displayProgress.parsing_status === "completed" ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-500" />
        );
      default:
        return <Zap className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "initializing":
        return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
      case "extracting":
        return "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200";
      case "analyzing":
        return "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200";
      case "saving":
        return "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200";
      case "completed":
        return displayProgress.parsing_status === "completed"
          ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const progressPercentage = displayProgress.parsing_progress || 0;
  const stage = displayProgress.parsing_stage || "processing";
  const message = displayProgress.parsing_message || "Processing...";

  // Extract extracted data counts if available
  const extractedData = displayProgress.parsing_data as {
    extractedData?: {
      experiencesCount?: number;
      skillsCount?: number;
      educationCount?: number;
      projectsCount?: number;
      certificationsCount?: number;
    };
    confidence?: number;
  } | null;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${getStageColor(stage)} ${className}`}
    >
      {/* Header with icon and stage */}
      <div className="flex items-center gap-2">
        {getStageIcon(stage)}
        <div className="flex-1">
          <div className={`font-medium capitalize ${sizeClasses[size]}`}>
            {stage === "completed" &&
            displayProgress.parsing_status === "failed"
              ? "Parsing Failed"
              : stage.replace("_", " ")}
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

      {/* Extracted data preview (if available) */}
      {extractedData?.extractedData && (
        <div className="flex flex-wrap gap-2 text-xs">
          {extractedData.extractedData.experiencesCount !== undefined && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {extractedData.extractedData.experiencesCount} experiences
            </span>
          )}
          {extractedData.extractedData.skillsCount !== undefined && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {extractedData.extractedData.skillsCount} skills
            </span>
          )}
          {extractedData.extractedData.educationCount !== undefined && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {extractedData.extractedData.educationCount} education
            </span>
          )}
          {extractedData.confidence !== undefined && (
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              {Math.round(extractedData.confidence * 100)}% confidence
            </span>
          )}
        </div>
      )}
    </div>
  );
}
