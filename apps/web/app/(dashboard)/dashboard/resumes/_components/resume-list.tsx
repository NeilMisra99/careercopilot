"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Crown,
  Download,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Star,
  Trash2,
  User,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteResumeAction,
  downloadResumeAction,
  getResumesAction,
  setPrimaryResumeAction,
} from "../_lib/actions/resume-actions";
import { RealtimeProgressDisplay } from "./realtime-progress-display";

interface Resume {
  id: string;
  name: string;
  version_number: number;
  is_primary: boolean;
  file_name: string;
  file_type: string;
  parsing_status: string;
  parsed_at: string | null;
  created_at: string;
  full_name: string | null;
  email: string | null;
  phone?: string | null;
  location?: string | null;
  summary: string | null;
  experiences_count?: number;
  skills_count?: number;
  education_count?: number;
  // Add parsing progress fields for initial state
  parsing_progress?: number | null;
  parsing_stage?: string | null;
  parsing_message?: string | null;
  parsing_data?: Record<string, unknown> | null;
  updated_at?: string;
  // Full detailed data (optional for backward compatibility)
  experiences?: Array<{
    id: string;
    company_name: string;
    job_title: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    location: string;
    description: string;
    achievements: string[];
    skills_used: string[];
  }>;
  education?: Array<{
    id: string;
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    grade_gpa: string;
  }>;
  skills?: Array<{
    id: string;
    skill_name: string;
    skill_category: string;
    proficiency_level: string;
    years_experience: number;
  }>;
  projects?: Array<{
    id: string;
    project_name: string;
    description: string;
    technologies_used: string[];
  }>;
  certifications?: Array<{
    id: string;
    certification_name: string;
    issuing_organization: string;
    issue_date: string;
  }>;
}

interface ResumeListProps {
  initialResumes?: Resume[];
}

// // Real-time progress interface
// interface ResumeProgress {
//   id: string;
//   parsing_progress: number | null;
//   parsing_stage: string | null;
//   parsing_message: string | null;
//   parsing_data: Record<string, unknown> | null;
//   parsing_status: string;
//   updated_at: string;
// }

export function ResumeList({ initialResumes }: ResumeListProps) {
  const [resumes, setResumes] = useState<Resume[]>(initialResumes || []);
  const [loading, setLoading] = useState(!initialResumes);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [progressInitialized, setProgressInitialized] = useState(false);

  // DEBUG: Log when resumes state changes
  useEffect(() => {
    const processingResumes = resumes.filter(
      (r) => r.parsing_status === "processing",
    );
    if (processingResumes.length > 0) {
    }
  }, [resumes]);

  // Initialize progress state
  useEffect(() => {
    setProgressInitialized(true);
  }, []);

  useEffect(() => {
    // Only load resumes if no initial data was provided
    if (!initialResumes) {
      loadResumes();
    }
  }, [initialResumes]);

  // Sync internal state with prop changes (for optimistic updates)
  useEffect(() => {
    if (initialResumes) {
      setResumes(initialResumes);
    }
  }, [initialResumes]);

  const loadResumes = async () => {
    setLoading(true);
    try {
      const result = await getResumesAction();
      if (result.success && result.data) {
        setResumes(result.data);
      } else {
        toast.error(result.error || "Failed to load resumes");
      }
    } catch {
      toast.error("Failed to load resumes");
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (resumeId: string) => {
    const newExpanded = new Set(expandedCards);
    if (expandedCards.has(resumeId)) {
      newExpanded.delete(resumeId);
    } else {
      newExpanded.add(resumeId);
    }
    setExpandedCards(newExpanded);
  };

  const handleSetPrimary = async (resumeId: string) => {
    try {
      const result = await setPrimaryResumeAction(resumeId);
      if (result.success) {
        toast.success("Primary resume updated");
        loadResumes();
      } else {
        toast.error(result.error || "Failed to set primary resume");
      }
    } catch {
      toast.error("Failed to set primary resume");
    }
  };

  const handleDelete = async (resumeId: string, resumeName: string) => {
    if (!confirm(`Are you sure you want to delete "${resumeName}"?`)) {
      return;
    }

    try {
      const result = await deleteResumeAction(resumeId);
      if (result.success) {
        toast.success("Resume deleted successfully");
        loadResumes();
      } else {
        toast.error(result.error || "Failed to delete resume");
      }
    } catch {
      toast.error("Failed to delete resume");
    }
  };

  const handleDownload = async (resumeId: string) => {
    try {
      await downloadResumeAction(resumeId);
    } catch {
      toast.error("Failed to download resume");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Zap className="h-4 w-4 text-green-500" />;
      case "processing":
        return (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        );
      case "failed":
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "AI Parsed";
      case "processing":
        return "Processing...";
      case "failed":
        return "Failed";
      default:
        return "Pending";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
      case "processing":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "failed":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // Use a consistent format that works the same on server and client
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid date";
    }
  };

  // Format resume dates (handles YYYY-MM-DD format common in resume data)
  const formatResumeDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "Not specified";

    try {
      // Handle YYYY-MM-DD format common in resume data

      // Check if it's a YYYY-MM format first (no timezone issues here)
      if (/^\d{4}-\d{2}$/.test(dateString)) {
        const [year, month] = dateString.split("-");
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const monthIndex = parseInt(month) - 1; // Convert to 0-based index
        const result = `${monthNames[monthIndex]} ${year}`;

        return result;
      }

      // Check if it's just a year
      if (/^\d{4}$/.test(dateString)) {
        return dateString;
      }

      // For full date strings (including ISO format), extract year and month without timezone conversion
      if (dateString.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        // Extract year and month directly from the string to avoid timezone issues
        const match = dateString.match(/^(\d{4})-(\d{2})/);
        if (match) {
          const [, year, month] = match;
          const monthNames = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          const monthIndex = parseInt(month) - 1;
          const result = `${monthNames[monthIndex]} ${year}`;

          return result;
        }
      }

      // Fallback: try parsing as regular date (might have timezone issues)
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const result = date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        });

        return result;
      }

      return dateString; // Return as-is if we can't parse it
    } catch {
      return dateString || "Not specified";
    }
  };

  const getSkillCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      programming:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30",
      frameworks:
        "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/30",
      tools:
        "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30",
      languages:
        "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30",
      soft_skills:
        "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-800/30",
      databases:
        "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30",
      cloud:
        "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800/30",
      methodologies:
        "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800/30",
      other:
        "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30",
    };
    return colors[category] || colors.other;
  };

  if (loading) {
    return <ResumeListSkeleton />;
  }

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="mb-4 h-12 w-12 text-gray-400" />
        <h3 className="mb-2 text-lg font-semibold">No resumes yet</h3>
        <p className="text-muted-foreground mb-4">
          Upload your first resume to get started with AI-powered insights
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {resumes.map((resume) => {
        const isExpanded = expandedCards.has(resume.id);

        return (
          <div
            key={resume.id}
            className="bg-card border-border dark:bg-muted relative rounded-lg border p-2 pb-0 shadow-sm"
          >
            <div className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h3 className="text-foreground text-sm font-medium">
                        {resume.name}
                      </h3>
                      {resume.is_primary && (
                        <Badge
                          variant="outline"
                          className="border-yellow-200 bg-yellow-50 text-xs text-yellow-700 dark:border-yellow-800/30 dark:bg-yellow-950/30 dark:text-yellow-300"
                        >
                          <Crown className="mr-1 h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                      <span>v{resume.version_number}</span>
                      <span>•</span>
                      <span>{resume.file_name}</span>
                      <span>•</span>
                      <span>Uploaded {formatDate(resume.created_at)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {!progressInitialized &&
                  (resume.parsing_status === "processing" ||
                    resume.parsing_status === "pending") ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(resume.parsing_status)}`}
                    >
                      {getStatusIcon(resume.parsing_status)}
                      <span className="ml-1">
                        {getStatusText(resume.parsing_status)}
                      </span>
                    </Badge>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleDownload(resume.id)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      {!resume.is_primary && (
                        <DropdownMenuItem
                          onClick={() => handleSetPrimary(resume.id)}
                        >
                          <Star className="mr-2 h-4 w-4" />
                          Set as Primary
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(resume.id, resume.name)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500 shadow-lg">
                    <Briefcase className="h-3 w-3 text-white" />
                  </div>
                  <span>{resume.experiences_count || 0} exp</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-500 shadow-lg">
                    <Wrench className="h-3 w-3 text-white" />
                  </div>
                  <span>{resume.skills_count || 0} skills</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500 shadow-lg">
                    <GraduationCap className="h-3 w-3 text-white" />
                  </div>
                  <span>{resume.education_count || 0} edu</span>
                </div>
                {resume.full_name && (
                  <div className="ml-auto flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="text-xs">{resume.full_name}</span>
                  </div>
                )}
              </div>

              {/* Real-time parsing progress */}
              {(resume.parsing_status === "processing" ||
                resume.parsing_status === "pending") && (
                <div className="mt-4">
                  {progressInitialized ? (
                    <RealtimeProgressDisplay
                      progress={{
                        id: resume.id,
                        parsing_progress: resume.parsing_progress ?? null,
                        parsing_stage: resume.parsing_stage ?? null,
                        parsing_message: resume.parsing_message ?? null,
                        parsing_data: resume.parsing_data ?? null,
                        parsing_status: resume.parsing_status,
                        updated_at:
                          resume.updated_at || new Date().toISOString(),
                      }}
                      size="sm"
                      className="mx-0"
                      forceShow={
                        (resume.parsing_status === "processing" ||
                          resume.parsing_status === "pending") &&
                        (!resume.parsing_stage || !resume.parsing_progress)
                      }
                    />
                  ) : (
                    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="mt-1 h-3 w-48" />
                        </div>
                        <Skeleton className="h-6 w-10" />
                      </div>
                      <Skeleton className="h-2 w-full" />
                    </div>
                  )}
                </div>
              )}

              {/* Chevron down indicator for collapsed cards */}
              {!isExpanded && (
                <div className="flex justify-center pt-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="text-muted-foreground cursor-pointer"
                        onClick={() => toggleCard(resume.id)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to expand</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            <Collapsible open={isExpanded}>
              <CollapsibleContent>
                <div className="border-border border-t px-3 pt-3">
                  <div className="space-y-6">
                    {/* Personal Information */}
                    <div>
                      <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                        <User className="h-4 w-4" />
                        PERSONAL INFORMATION
                      </h4>
                      <div className="dark:bg-accent grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <User className="text-muted-foreground h-4 w-4" />
                          <span className="font-medium">
                            {resume.full_name || "Not specified"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="text-muted-foreground h-4 w-4" />
                          <span>{resume.email || "Not specified"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="text-muted-foreground h-4 w-4" />
                          <span>{resume.phone || "Not specified"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="text-muted-foreground h-4 w-4" />
                          <span>{resume.location || "Not specified"}</span>
                        </div>
                      </div>
                      {resume.summary && (
                        <div className="mt-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
                          <p className="text-muted-foreground text-sm italic">
                            &ldquo;{resume.summary}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Work Experience */}
                    {resume.experiences && resume.experiences.length > 0 && (
                      <>
                        <Separator className="bg-border dark:bg-border" />
                        <div>
                          <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                            <Briefcase className="h-4 w-4" />
                            WORK EXPERIENCE ({resume.experiences.length})
                          </h4>
                          <div className="space-y-3">
                            {resume.experiences.map((exp, index) => (
                              <div
                                key={index}
                                className="dark:bg-accent rounded-lg bg-gray-50 p-4"
                              >
                                <div className="mb-2 flex items-start justify-between">
                                  <div>
                                    <h5 className="font-semibold">
                                      {exp.job_title}
                                    </h5>
                                    <p className="text-muted-foreground flex items-center gap-2">
                                      <Building2 className="h-4 w-4" />
                                      {exp.company_name}
                                      {exp.location && (
                                        <>
                                          <span>•</span>
                                          <MapPin className="h-4 w-4" />
                                          {exp.location}
                                        </>
                                      )}
                                    </p>
                                    <p className="text-muted-foreground flex items-center gap-1 text-sm">
                                      <Calendar className="h-4 w-4" />
                                      {formatResumeDate(exp.start_date)} -{" "}
                                      {exp.is_current
                                        ? "Present"
                                        : formatResumeDate(exp.end_date)}
                                    </p>
                                  </div>
                                </div>

                                {exp.description && (
                                  <p className="text-muted-foreground mb-3 text-sm">
                                    {exp.description}
                                  </p>
                                )}

                                {exp.achievements &&
                                  exp.achievements.length > 0 && (
                                    <div className="mb-3">
                                      <h6 className="mb-1 text-sm font-medium">
                                        Achievements:
                                      </h6>
                                      <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                                        {exp.achievements.map(
                                          (achievement, achIndex) => (
                                            <li key={achIndex}>
                                              {achievement}
                                            </li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                  )}

                                {exp.skills_used &&
                                  exp.skills_used.length > 0 && (
                                    <div>
                                      <h6 className="mb-2 text-sm font-medium">
                                        Technologies & Skills:
                                      </h6>
                                      <div className="flex flex-wrap gap-1">
                                        {exp.skills_used.map(
                                          (skill, skillIndex) => (
                                            <Badge
                                              key={skillIndex}
                                              variant="outline"
                                              className="border-orange-200 bg-orange-50 text-xs text-orange-700 dark:border-orange-800/30 dark:bg-orange-950/30 dark:text-orange-300"
                                            >
                                              {skill}
                                            </Badge>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Skills */}
                    {resume.skills && resume.skills.length > 0 && (
                      <>
                        <Separator className="bg-border dark:bg-border" />
                        <div>
                          <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                            <Wrench className="h-4 w-4" />
                            SKILLS ({resume.skills.length})
                          </h4>
                          <div className="space-y-3">
                            {Object.entries(
                              resume.skills.reduce(
                                (acc, skill) => {
                                  const category =
                                    skill.skill_category || "other";
                                  if (!acc[category]) acc[category] = [];
                                  acc[category].push(skill);
                                  return acc;
                                },
                                {} as Record<string, typeof resume.skills>,
                              ),
                            ).map(([category, skills]) => (
                              <div
                                key={category}
                                className="dark:bg-accent rounded-lg bg-gray-50 p-3"
                              >
                                <h5 className="mb-2 font-medium capitalize">
                                  {category.replace("_", " ")} ({skills!.length}
                                  )
                                </h5>
                                <div className="flex flex-wrap gap-2">
                                  {skills!.map((skill, index) => (
                                    <Badge
                                      key={index}
                                      className={getSkillCategoryColor(
                                        skill.skill_category,
                                      )}
                                    >
                                      {skill.skill_name}
                                      {skill.years_experience > 0 && (
                                        <span className="ml-1 text-xs opacity-75">
                                          ({skill.years_experience}y)
                                        </span>
                                      )}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Education */}
                    {resume.education && resume.education.length > 0 && (
                      <>
                        <Separator className="bg-border dark:bg-border" />
                        <div>
                          <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                            <GraduationCap className="h-4 w-4" />
                            EDUCATION ({resume.education.length})
                          </h4>
                          <div className="space-y-3">
                            {resume.education.map((edu, index) => (
                              <div
                                key={index}
                                className="dark:bg-accent rounded-lg bg-gray-50 p-4"
                              >
                                <div className="mb-2">
                                  <h5 className="font-semibold">
                                    {edu.degree && edu.field_of_study
                                      ? `${edu.degree} in ${edu.field_of_study}`
                                      : edu.degree || edu.field_of_study}
                                  </h5>
                                  <p className="text-muted-foreground">
                                    {edu.institution}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    {formatResumeDate(edu.start_date)} -{" "}
                                    {formatResumeDate(edu.end_date)}
                                    {edu.grade_gpa && (
                                      <span className="ml-2">
                                        • GPA: {edu.grade_gpa}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Projects */}
                    {resume.projects && resume.projects.length > 0 && (
                      <>
                        <Separator className="bg-border dark:bg-border" />
                        <div>
                          <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                            <FileText className="h-4 w-4" />
                            PROJECTS ({resume.projects.length})
                          </h4>
                          <div className="space-y-3">
                            {resume.projects.map((project, index) => (
                              <div
                                key={index}
                                className="dark:bg-accent rounded-lg bg-gray-50 p-4"
                              >
                                <div className="mb-2">
                                  <h5 className="font-semibold">
                                    {project.project_name}
                                  </h5>
                                  {project.description && (
                                    <p className="text-muted-foreground text-sm">
                                      {project.description}
                                    </p>
                                  )}
                                </div>

                                {project.technologies_used &&
                                  project.technologies_used.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {project.technologies_used.map(
                                        (tech, techIndex) => (
                                          <Badge
                                            key={techIndex}
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {tech}
                                          </Badge>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Certifications */}
                    {resume.certifications &&
                      resume.certifications.length > 0 && (
                        <>
                          <Separator className="bg-border dark:bg-border" />
                          <div>
                            <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                              <Award className="h-4 w-4" />
                              CERTIFICATIONS ({resume.certifications.length})
                            </h4>
                            <div className="space-y-3">
                              {resume.certifications.map((cert, index) => (
                                <div
                                  key={index}
                                  className="dark:bg-accent rounded-lg bg-gray-50 p-4"
                                >
                                  <h5 className="font-semibold">
                                    {cert.certification_name}
                                  </h5>
                                  <p className="text-muted-foreground">
                                    {cert.issuing_organization}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    Issued: {formatResumeDate(cert.issue_date)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                  </div>

                  {/* Hide Details Button */}
                  <div className="flex justify-center py-4">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="text-muted-foreground cursor-pointer"
                          onClick={() => toggleCard(resume.id)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Click to hide</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}

function ResumeListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-muted h-6 w-6 rounded"></div>
                <div className="space-y-2">
                  <div className="bg-muted h-6 w-48 rounded"></div>
                  <div className="bg-muted h-4 w-64 rounded"></div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-muted h-6 w-20 rounded"></div>
                <div className="bg-muted h-8 w-8 rounded"></div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-6">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="bg-muted h-4 w-20 rounded"></div>
              ))}
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
