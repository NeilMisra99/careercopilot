"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Brain,
  Briefcase,
  Building,
  Calendar,
  CheckCircle,
  ExternalLink,
  FileText,
  GraduationCap,
  Star,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { JobResumeMatch } from "../_lib/types";

interface MatchCardProps {
  match: JobResumeMatch;
  onViewDetails: (match: JobResumeMatch) => void;
  onTriggerReanalysis?: (applicationId: string, resumeId: string) => void;
  className?: string;
}

export function MatchCard({
  match,
  onViewDetails,
  onTriggerReanalysis,
  className = "",
}: MatchCardProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 80)
      return {
        bg: "bg-green-50 dark:bg-green-950/30",
        border: "border-green-200 dark:border-green-800/30",
        text: "text-green-700 dark:text-green-300",
        ring: "ring-green-500/20",
        progress: "bg-green-500 dark:bg-green-400",
        stroke: "text-green-500 dark:text-green-400",
      };
    if (score >= 60)
      return {
        bg: "bg-amber-50 dark:bg-amber-950/30",
        border: "border-amber-200 dark:border-amber-800/30",
        text: "text-amber-700 dark:text-amber-300",
        ring: "ring-amber-500/20",
        progress: "bg-amber-500 dark:bg-amber-400",
        stroke: "text-amber-500 dark:text-amber-400",
      };
    return {
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800/30",
      text: "text-red-700 dark:text-red-300",
      ring: "ring-red-500/20",
      progress: "bg-red-500 dark:bg-red-400",
      stroke: "text-red-500 dark:text-red-400",
    };
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 80) return "bg-green-500 dark:bg-green-400";
    if (score >= 60) return "bg-amber-500 dark:bg-amber-400";
    return "bg-red-500 dark:bg-red-400";
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "opportunity":
        return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800/30";
      case "wishlist":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "applied":
        return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/30";
      case "screening":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30";
      case "interviewing":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30";
      case "offer extended":
      case "offer accepted":
      case "offer":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
      case "rejected":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/30";
      case "withdrawn":
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const handleReanalysis = async () => {
    if (!onTriggerReanalysis || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      onTriggerReanalysis(match.application_id, match.resume_id);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const scoreColors = getScoreColor(match.overall_fit_score);
  const scorePercentage = Math.round(match.overall_fit_score);
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset =
    circumference - (scorePercentage / 100) * circumference;

  return (
    <TooltipProvider>
      <div
        className={`bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 flex h-full flex-col rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] ${className}`}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
              <Building className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-foreground truncate text-sm font-medium">
                {match.job_title}
              </h3>
              <p className="text-muted-foreground truncate text-xs">
                {match.company_name}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${getStatusColor(match.application_status)}`}
                >
                  {match.application_status}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Score Visualization */}
        <div className="mb-4 flex justify-center">
          <div className="relative">
            <svg className="h-24 w-24 -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="45"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="48"
                cy="48"
                r="45"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={`${scoreColors.stroke} transition-all duration-500`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-semibold ${scoreColors.text}`}>
                {scorePercentage}%
              </span>
              <span className="text-muted-foreground text-xs">
                {match.overall_fit_score >= 80
                  ? "Excellent"
                  : match.overall_fit_score >= 60
                    ? "Good"
                    : "Fair"}
              </span>
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="mb-4 space-y-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-blue-500" />
                <span className="text-muted-foreground">Skills</span>
              </div>
              <span className="font-medium">
                {Math.round(match.skills_match_score)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full transition-all duration-300 ${getProgressBarColor(match.skills_match_score)}`}
                style={{ width: `${match.skills_match_score}%` }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Briefcase className="h-3 w-3 text-violet-500" />
                <span className="text-muted-foreground">Experience</span>
              </div>
              <span className="font-medium">
                {Math.round(match.experience_match_score)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full transition-all duration-300 ${getProgressBarColor(match.experience_match_score)}`}
                style={{ width: `${match.experience_match_score}%` }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <GraduationCap className="h-3 w-3 text-green-500" />
                <span className="text-muted-foreground">Education</span>
              </div>
              <span className="font-medium">
                {Math.round(match.education_match_score)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full transition-all duration-300 ${getProgressBarColor(match.education_match_score)}`}
                style={{ width: `${match.education_match_score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Key Insights */}
        {match.match_analysis && (
          <div className="mb-3 flex flex-1 flex-col space-y-2">
            {match.match_analysis.strengths &&
              match.match_analysis.strengths.length > 0 && (
                <div className="rounded-md border border-green-200/80 bg-green-50/50 p-2.5 dark:border-green-800/30 dark:bg-green-950/20">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                        Strength
                      </p>
                      <p className="line-clamp-2 text-xs text-green-700 dark:text-green-200">
                        {match.match_analysis.strengths[0]}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {match.match_analysis.gaps &&
              match.match_analysis.gaps.length > 0 && (
                <div className="rounded-md border border-amber-200/80 bg-amber-50/50 p-2.5 dark:border-amber-800/30 dark:bg-amber-950/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Gap
                      </p>
                      <p className="line-clamp-2 text-xs text-amber-700 dark:text-amber-200">
                        {match.match_analysis.gaps[0]}
                      </p>
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Footer */}
        <div className="border-border mt-auto border-t pt-3">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                <span className="max-w-[120px] truncate">
                  {match.resume_name}
                </span>
                {match.is_primary_resume && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>Primary Resume</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                <span>Analyzed {formatDate(match.calculated_at)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onTriggerReanalysis && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReanalysis}
                      disabled={isAnalyzing}
                      className="h-8 w-8 p-0"
                    >
                      <Brain
                        className={`h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Re-analyze match</TooltipContent>
                </Tooltip>
              )}

              <Button
                size="sm"
                variant="default"
                onClick={() => onViewDetails(match)}
              >
                <ExternalLink className="h-4 w-4" />
                <span>Details</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
