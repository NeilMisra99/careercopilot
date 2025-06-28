"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Brain,
  Briefcase,
  Building,
  Calendar,
  CheckCircle,
  Code,
  FileText,
  GraduationCap,
  Lightbulb,
  MapPin,
  Star,
  Target,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { JobResumeMatch } from "../_lib/types";

interface MatchDetailsSheetProps {
  match: JobResumeMatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchDetailsSheet({
  match,
  open,
  onOpenChange,
}: MatchDetailsSheetProps) {
  if (!match) return null;

  const getFitScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const getStatusConfig = (status: string) => {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const statusConfig = getStatusConfig(match.application_status);

  const scoreCardData = [
    {
      title: "Skills Match",
      score: match.skills_match_score,
      icon: Zap,
      color: "text-blue-500",
      bgColor: "bg-blue-100 dark:bg-blue-900/50",
    },
    {
      title: "Experience Match",
      score: match.experience_match_score,
      icon: Briefcase,
      color: "text-purple-500",
      bgColor: "bg-purple-100 dark:bg-purple-900/50",
    },
    {
      title: "Education Match",
      score: match.education_match_score,
      icon: GraduationCap,
      color: "text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900/50",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-background w-full border-l-0 p-0 sm:max-w-xl lg:max-w-2xl">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-border border-b p-6">
            <div className="flex items-center gap-6">
              <div className="relative text-center">
                <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <div className="text-center">
                    <span
                      className={`text-3xl font-semibold ${getFitScoreColor(match.overall_fit_score)}`}
                    >
                      {Math.round(match.overall_fit_score)}%
                    </span>
                    <p className="text-muted-foreground mt-1 text-xs font-medium">
                      Overall Fit
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <SheetTitle className="text-foreground text-2xl font-medium">
                  {match.job_title}
                </SheetTitle>
                <p className="text-muted-foreground flex items-center gap-2 text-lg font-medium">
                  <Building className="h-5 w-5" /> {match.company_name}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${statusConfig}`}
                  >
                    {match.application_status}
                  </Badge>
                  <Badge variant="outline" className="border-border text-xs">
                    <FileText className="mr-1.5 h-3 w-3" /> {match.resume_name}
                    {match.is_primary_resume && (
                      <Star className="ml-1.5 h-3 w-3 fill-amber-400 text-amber-400" />
                    )}
                  </Badge>
                  {match.job_location && (
                    <Badge variant="outline" className="border-border text-xs">
                      <MapPin className="mr-1.5 h-3 w-3" /> {match.job_location}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full px-6 py-6">
              <div className="space-y-6">
                <div>
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground text-lg font-medium">
                        Score Breakdown
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {scoreCardData.map((item) => (
                        <div
                          key={item.title}
                          className="border-border bg-card flex items-center gap-3 rounded-lg border p-3"
                        >
                          <div
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${item.color.replace("text-", "bg-")} shadow-sm`}
                          >
                            <item.icon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs font-medium">
                              {item.title}
                            </p>
                            <p className="text-foreground text-lg font-semibold">
                              {Math.round(item.score)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <TrendingUp className="h-5 w-5" /> AI Analysis
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" /> Key Strengths
                        </h4>
                        <ul className="space-y-2">
                          {match.match_analysis?.strengths.map(
                            (strength, i) => (
                              <li
                                key={`strength-${i}`}
                                className="text-foreground flex items-start gap-2 text-sm"
                              >
                                <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
                                <span>{strength}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                          <XCircle className="h-4 w-4" /> Areas for Improvement
                        </h4>
                        <ul className="space-y-2">
                          {match.match_analysis?.gaps.map((gap, i) => (
                            <li
                              key={`gap-${i}`}
                              className="text-foreground flex items-start gap-2 text-sm"
                            >
                              <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                              <span>{gap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {match.match_analysis?.recommendations &&
                  match.match_analysis.recommendations.length > 0 && (
                    <div>
                      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                        <div className="mb-4">
                          <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                            <Lightbulb className="h-5 w-5" /> AI Recommendations
                          </h3>
                        </div>
                        <div>
                          <ul className="space-y-3">
                            {match.match_analysis.recommendations.map(
                              (rec, i) => (
                                <li
                                  key={`rec-${i}`}
                                  className="text-foreground flex items-start gap-3 text-sm"
                                >
                                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                                    {i + 1}
                                  </div>
                                  <span>{rec}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Job Requirements Analysis */}
                {match.match_analysis?.job_requirements && (
                  <div>
                    <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                      <div className="mb-4">
                        <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                          <Target className="h-5 w-5" /> Job Requirements
                          Analysis
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                          <h4 className="mb-3 flex items-center gap-2 font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-4 w-4" /> Required
                            Skills
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {match.match_analysis.job_requirements.required_skills?.map(
                              (skill, i) => (
                                <Badge
                                  key={`req-${i}`}
                                  variant="outline"
                                  className="border-red-200 bg-red-50 text-xs text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300"
                                >
                                  {skill}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="mb-3 flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400">
                            <Star className="h-4 w-4" /> Preferred Skills
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {match.match_analysis.job_requirements.preferred_skills?.map(
                              (skill, i) => (
                                <Badge
                                  key={`pref-${i}`}
                                  variant="outline"
                                  className="border-blue-200 bg-blue-50 text-xs text-blue-700 dark:border-blue-800/30 dark:bg-blue-950/30 dark:text-blue-300"
                                >
                                  {skill}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="mb-3 flex items-center gap-2 font-medium text-purple-600 dark:text-purple-400">
                            <Users className="h-4 w-4" /> Experience Level
                          </h4>
                          <Badge variant="outline" className="font-medium">
                            {
                              match.match_analysis.job_requirements
                                .experience_level
                            }
                          </Badge>
                        </div>
                        <div>
                          <h4 className="mb-3 flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
                            <BookOpen className="h-4 w-4" /> Education
                            Requirements
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {match.match_analysis.job_requirements.education_requirements?.map(
                              (edu, i) => (
                                <Badge
                                  key={`edu-${i}`}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {edu}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Skills Match Analysis */}
                <div>
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <Code className="h-5 w-5" /> Skills Match Analysis
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" /> Matched Skills (
                          {match.match_analysis?.matched_skills?.length || 0})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {match.match_analysis?.matched_skills?.map(
                            (skill, i) => (
                              <Badge
                                key={`matched-${i}`}
                                variant="outline"
                                className="border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800/30 dark:bg-green-950/30 dark:text-green-300"
                              >
                                {skill}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-orange-600 dark:text-orange-400">
                          <XCircle className="h-4 w-4" /> Missing Skills (
                          {match.match_analysis?.missing_skills?.length || 0})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {match.match_analysis?.missing_skills?.map(
                            (skill, i) => (
                              <Badge
                                key={`missing-${i}`}
                                variant="outline"
                                className="border-orange-200 bg-orange-50 text-xs text-orange-700 dark:border-orange-800/30 dark:bg-orange-950/30 dark:text-orange-300"
                              >
                                {skill}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Experience Relevance Analysis */}
                {match.match_analysis?.relevant_experiences &&
                  match.match_analysis.relevant_experiences.length > 0 && (
                    <div>
                      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                        <div className="mb-4">
                          <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                            <Award className="h-5 w-5" /> Experience Relevance
                            Analysis
                          </h3>
                        </div>
                        <div>
                          <div className="space-y-3">
                            {match.match_analysis.relevant_experiences.map(
                              (exp, i) => (
                                <div
                                  key={`exp-${i}`}
                                  className="border-border bg-card/50 rounded-lg border p-3"
                                >
                                  <div className="mb-2 flex items-center justify-between">
                                    <div>
                                      <h5 className="text-foreground font-medium">
                                        {exp.role} at {exp.company}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                                          exp.relevance_score >= 80
                                            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800/30 dark:bg-green-950/30 dark:text-green-300"
                                            : exp.relevance_score >= 60
                                              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/30 dark:bg-amber-950/30 dark:text-amber-300"
                                              : "border-red-200 bg-red-50 text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300"
                                        }`}
                                      >
                                        <TrendingUp className="h-3 w-3" />
                                        {exp.relevance_score}%
                                      </div>
                                    </div>
                                  </div>
                                  <p className="text-muted-foreground text-sm">
                                    {exp.relevance_reason}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {/* AI Confidence & Reasoning */}
                <div>
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-4">
                      <h3 className="text-foreground flex items-center gap-2 text-lg font-medium">
                        <Brain className="h-5 w-5" /> AI Analysis Summary
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {match.match_analysis?.confidence_score && (
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400">
                            <Target className="h-4 w-4" /> Analysis Confidence
                          </h4>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="bg-muted h-2 rounded-full">
                                <div
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{
                                    width: `${(parseFloat(match.match_analysis.confidence_score) || 0) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <span className="text-foreground text-sm font-medium">
                              {Math.round(
                                (parseFloat(
                                  match.match_analysis.confidence_score,
                                ) || 0) * 100,
                              )}
                              %
                            </span>
                          </div>
                        </div>
                      )}

                      {match.match_reasoning && (
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-medium text-purple-600 dark:text-purple-400">
                            <Lightbulb className="h-4 w-4" /> Detailed Reasoning
                          </h4>
                          <div className="bg-muted/50 rounded-lg p-4">
                            <p className="text-foreground text-sm leading-relaxed">
                              {match.match_reasoning}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-3">
                      <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
                        <Building className="h-4 w-4" /> Job Information
                      </h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <Calendar className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-foreground">
                          {match.application_status.toLowerCase() ===
                          "opportunity"
                            ? `Opportunity added: ${formatDate(match.application_date)}`
                            : `Applied: ${formatDate(match.application_date)}`}
                        </span>
                      </div>
                      {match.job_location && (
                        <div className="flex gap-2">
                          <MapPin className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-foreground">
                            {match.job_location}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="mb-3">
                      <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4" /> Resume Information
                      </h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <FileText className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-foreground">
                          {match.resume_name}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Calendar className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-foreground">
                          Analyzed: {formatDate(match.calculated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
