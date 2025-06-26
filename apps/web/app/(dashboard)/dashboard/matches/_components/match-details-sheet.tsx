"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const getFitScoreRingColor = (score: number) => {
    if (score >= 80) return "ring-emerald-500/30";
    if (score >= 60) return "ring-amber-500/30";
    return "ring-red-500/30";
  };

  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case "opportunity":
        return {
          bg: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
        };
      case "applied":
        return {
          bg: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        };
      case "screening":
        return {
          bg: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        };
      case "interviewing":
        return {
          bg: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
        };
      case "offer extended":
      case "offer accepted":
      case "offer":
        return {
          bg: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
        };
      case "rejected":
        return {
          bg: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
        };
      case "withdrawn":
        return {
          bg: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
        };
      case "on hold":
        return {
          bg: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
        };
      default:
        return {
          bg: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
        };
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
      <SheetContent className="w-full border-l-0 bg-slate-50/95 p-0 backdrop-blur-xl sm:max-w-xl lg:max-w-2xl dark:bg-slate-900/95">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-slate-200/60 p-6 dark:border-slate-800">
            <div className="flex items-center gap-6">
              <div className="relative text-center">
                <div
                  className={`flex h-24 w-24 items-center justify-center rounded-full bg-white ring-4 dark:bg-slate-900 ${getFitScoreRingColor(
                    match.overall_fit_score,
                  )}`}
                >
                  <span
                    className={`text-4xl font-bold ${getFitScoreColor(
                      match.overall_fit_score,
                    )}`}
                  >
                    {Math.round(match.overall_fit_score)}
                  </span>
                  <span
                    className={`absolute top-1/2 mt-1 text-sm font-medium ${getFitScoreColor(
                      match.overall_fit_score,
                    )}`}
                  >
                    %
                  </span>
                </div>
                <p
                  className={`mt-2 text-xs font-semibold tracking-wider uppercase ${getFitScoreColor(
                    match.overall_fit_score,
                  )}`}
                >
                  Fit Score
                </p>
              </div>
              <div className="flex-1 space-y-2">
                <SheetTitle className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {match.job_title}
                </SheetTitle>
                <p className="flex items-center gap-2 text-lg font-medium text-slate-600 dark:text-slate-400">
                  <Building className="h-5 w-5" /> {match.company_name}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Badge
                    className={`border-transparent font-medium ${statusConfig.bg}`}
                  >
                    {match.application_status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-slate-300/70 font-medium dark:border-slate-700"
                  >
                    <FileText className="mr-1.5 h-3 w-3" /> {match.resume_name}
                    {match.is_primary_resume && (
                      <Star className="ml-1.5 h-3 w-3 fill-amber-400 text-amber-400" />
                    )}
                  </Badge>
                  {match.job_location && (
                    <Badge
                      variant="outline"
                      className="border-slate-300/70 font-medium dark:border-slate-700"
                    >
                      <MapPin className="mr-1.5 h-3 w-3" /> {match.job_location}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full px-6 py-8">
              <div className="space-y-6">
                <div>
                  <Card className="overflow-hidden border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold">
                        Score Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {scoreCardData.map((item) => (
                        <div
                          key={item.title}
                          className="flex items-center gap-4 rounded-lg border border-slate-200/60 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/50"
                        >
                          <div
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${item.bgColor}`}
                          >
                            <item.icon className={`h-5 w-5 ${item.color}`} />
                          </div>
                          <div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              {item.title}
                            </p>
                            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
                              {Math.round(item.score)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div
                >
                  <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                        <TrendingUp className="h-5 w-5" /> AI Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="h-4 w-4" /> Key Strengths
                        </h4>
                        <ul className="space-y-2">
                          {match.match_analysis?.strengths.map(
                            (strength, i) => (
                              <li
                                key={`strength-${i}`}
                                className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                              >
                                <div className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-500" />
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
                              className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                            >
                              <div className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-amber-500" />
                              <span>{gap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {match.match_analysis?.recommendations &&
                  match.match_analysis.recommendations.length > 0 && (
                    <div
                    >
                      <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                            <Lightbulb className="h-5 w-5" /> AI Recommendations
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-3">
                            {match.match_analysis.recommendations.map(
                              (rec, i) => (
                                <li
                                  key={`rec-${i}`}
                                  className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300"
                                >
                                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                                    {i + 1}
                                  </div>
                                  <span>{rec}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                {/* Job Requirements Analysis */}
                {match.match_analysis?.job_requirements && (
                  <div
                  >
                    <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                          <Target className="h-5 w-5" /> Job Requirements
                          Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                                  className="cursor-default border border-red-200 bg-red-50 text-xs text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-800 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:border-red-700/70 dark:hover:bg-red-950/50 dark:hover:text-red-200"
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
                                  className="cursor-default border border-blue-200 bg-blue-50 text-xs text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:border-blue-700/70 dark:hover:bg-blue-950/50 dark:hover:text-blue-200"
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
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Skills Match Analysis */}
                <div
                >
                  <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                        <Code className="h-5 w-5" /> Skills Match Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                                className="cursor-default border border-green-200 bg-green-50 text-green-700 transition-colors hover:border-green-300 hover:bg-green-100 hover:text-green-800 dark:border-green-800/50 dark:bg-green-950/30 dark:text-green-300 dark:hover:border-green-700/70 dark:hover:bg-green-950/50 dark:hover:text-green-200"
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
                                className="cursor-default border border-orange-200 bg-orange-50 text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100 hover:text-orange-800 dark:border-orange-800/50 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:border-orange-700/70 dark:hover:bg-orange-950/50 dark:hover:text-orange-200"
                              >
                                {skill}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Experience Relevance Analysis */}
                {match.match_analysis?.relevant_experiences &&
                  match.match_analysis.relevant_experiences.length > 0 && (
                    <div
                    >
                      <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                            <Award className="h-5 w-5" /> Experience Relevance
                            Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {match.match_analysis.relevant_experiences.map(
                              (exp, i) => (
                                <div
                                  key={`exp-${i}`}
                                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
                                >
                                  <div className="mb-2 flex items-center justify-between">
                                    <div>
                                      <h5 className="font-medium text-slate-900 dark:text-slate-100">
                                        {exp.role} at {exp.company}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                                          exp.relevance_score >= 80
                                            ? "border border-green-200 bg-green-100 text-green-800 dark:border-green-800/50 dark:bg-green-950/50 dark:text-green-300"
                                            : exp.relevance_score >= 60
                                              ? "border border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800/50 dark:bg-yellow-950/50 dark:text-yellow-300"
                                              : "border border-red-200 bg-red-100 text-red-800 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300"
                                        }`}
                                      >
                                        <TrendingUp className="h-3 w-3" />
                                        {exp.relevance_score}%
                                      </div>
                                    </div>
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-400">
                                    {exp.relevance_reason}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                {/* AI Confidence & Reasoning */}
                <div
                >
                  <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                        <Brain className="h-5 w-5" /> AI Analysis Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {match.match_analysis?.confidence_score && (
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400">
                            <Target className="h-4 w-4" /> Analysis Confidence
                          </h4>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                                <div
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{
                                    width: `${(parseFloat(match.match_analysis.confidence_score) || 0) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
                          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
                            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                              {match.match_reasoning}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div
                  className="grid grid-cols-1 gap-6 md:grid-cols-2"
                >
                  <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building className="h-4 w-4" /> Job Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <Calendar className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                        <span>
                          {match.application_status.toLowerCase() ===
                          "opportunity"
                            ? `Opportunity added: ${formatDate(match.application_date)}`
                            : `Applied: ${formatDate(match.application_date)}`}
                        </span>
                      </div>
                      {match.job_location && (
                        <div className="flex gap-2">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                          <span>{match.job_location}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="border-slate-200/60 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> Resume Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                        <span>{match.resume_name}</span>
                      </div>
                      <div className="flex gap-2">
                        <Calendar className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                        <span>Analyzed: {formatDate(match.calculated_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
