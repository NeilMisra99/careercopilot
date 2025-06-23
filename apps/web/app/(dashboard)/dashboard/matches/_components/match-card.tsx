"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Brain,
  Briefcase,
  Building,
  Calendar,
  ExternalLink,
  FileText,
  GraduationCap,
  Star,
  TrendingUp,
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
      return "text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/50 dark:border-green-800/50";
    if (score >= 60)
      return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/50 dark:border-amber-800/50";
    return "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/50 dark:border-red-800/50";
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "opportunity":
        return "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800/50";
      case "applied":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50";
      case "screening":
        return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/50";
      case "interviewing":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/50";
      case "offer extended":
      case "offer accepted":
      case "offer":
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50";
      case "withdrawn":
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700/50";
      case "on hold":
        return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/50";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700/50";
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

  return (
    <TooltipProvider>
      <Card
        className={`flex h-full flex-col border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:shadow-lg dark:hover:shadow-gray-900/25 ${className}`}
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left side - Job info */}
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {match.company_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                    {match.job_title}
                  </h3>
                  <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                    {match.company_name}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${getStatusColor(match.application_status)}`}
                >
                  {match.application_status}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <FileText className="h-3 w-3" />
                  <span>{match.resume_name}</span>
                  {match.is_primary_resume && (
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400 dark:fill-amber-500 dark:text-amber-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Score */}
            <div className="flex-shrink-0 text-center">
              <div
                className={`inline-flex h-16 w-16 items-center justify-center rounded-lg border ${getScoreColor(match.overall_fit_score)}`}
              >
                <div className="text-lg font-bold">
                  {Math.round(match.overall_fit_score)}%
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {match.overall_fit_score >= 80
                  ? "Excellent"
                  : match.overall_fit_score >= 60
                    ? "Good"
                    : "Fair"}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col pt-0">
          {/* Score breakdown */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help rounded-lg border border-blue-100 bg-blue-50 p-3 text-center dark:border-blue-800/50 dark:bg-blue-950/50">
                  <Zap className="mx-auto mb-1 h-4 w-4 text-blue-500 dark:text-blue-400" />
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {Math.round(match.skills_match_score)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Skills
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>Skills compatibility</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help rounded-lg border border-purple-100 bg-purple-50 p-3 text-center dark:border-purple-800/50 dark:bg-purple-950/50">
                  <Briefcase className="mx-auto mb-1 h-4 w-4 text-purple-500 dark:text-purple-400" />
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {Math.round(match.experience_match_score)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Experience
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>Experience match</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help rounded-lg border border-green-100 bg-green-50 p-3 text-center dark:border-green-800/50 dark:bg-green-950/50">
                  <GraduationCap className="mx-auto mb-1 h-4 w-4 text-green-500 dark:text-green-400" />
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {Math.round(match.education_match_score)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Education
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>Education fit</TooltipContent>
            </Tooltip>
          </div>

          {/* Key insights - with fixed height container */}
          {match.match_analysis && (
            <div className="mb-4 flex min-h-[120px] flex-col space-y-3">
              {match.match_analysis.strengths &&
                match.match_analysis.strengths.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-950/30">
                    <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs font-medium text-green-800 dark:text-green-300">
                        Top Strength
                      </p>
                      <p className="line-clamp-2 text-sm text-green-700 dark:text-green-200">
                        {match.match_analysis.strengths[0]}
                      </p>
                    </div>
                  </div>
                )}

              {match.match_analysis.gaps &&
                match.match_analysis.gaps.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                    <Building className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                        Key Gap
                      </p>
                      <p className="line-clamp-2 text-sm text-amber-700 dark:text-amber-200">
                        {match.match_analysis.gaps[0]}
                      </p>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Footer - pushed to bottom */}
          <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>
                  {match.application_status.toLowerCase() === "opportunity"
                    ? `Opportunity added ${formatDate(match.application_date)}`
                    : `Applied ${formatDate(match.application_date)}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
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
                      className="h-8 w-8 p-0 dark:border-gray-600 dark:hover:bg-gray-800"
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
                onClick={() => onViewDetails(match)}
                className="h-8 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
