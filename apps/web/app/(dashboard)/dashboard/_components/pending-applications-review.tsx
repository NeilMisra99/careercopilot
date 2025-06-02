"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  Building,
  CheckCircle,
  ExternalLink,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { useState } from "react";
import { getApplicationEmailSources } from "../_lib/actions/application-review-actions";
import { QuickEditPendingApplication } from "./quick-edit-pending-application";

interface PendingApplication {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  ai_suggested: boolean;
  ai_confidence: number;
  ai_reasoning: string;
  needs_user_review: boolean;
  source_email_id?: string;
  source_thread_id?: string;
  job_url?: string;
  location?: string;
  salary_range?: string;
  notes?: string;
}

interface EmailSource {
  id: string;
  source_email_id: string;
  source_thread_id?: string;
  source_type: string;
  source_notes?: string;
  is_primary: boolean;
  created_at: string;
}

interface PendingApplicationsReviewProps {
  applications: PendingApplication[];
  onApplicationReview: (
    applicationId: string,
    action: "approve" | "delete",
  ) => void;
  integrationEmail?: string | null;
  reviewingApplications?: Set<string>;
}

export function PendingApplicationsReview({
  applications,
  onApplicationReview,
  integrationEmail,
  reviewingApplications = new Set(),
}: PendingApplicationsReviewProps) {
  const [emailSources, setEmailSources] = useState<
    Record<string, EmailSource[]>
  >({});
  const [loadingEmailSources, setLoadingEmailSources] = useState<Set<string>>(
    new Set(),
  );

  const handleAction = async (
    applicationId: string,
    action: "approve" | "delete",
  ) => {
    onApplicationReview(applicationId, action);
  };

  const loadEmailSources = async (applicationId: string) => {
    if (emailSources[applicationId] || loadingEmailSources.has(applicationId)) {
      return; // Already loaded or loading
    }

    setLoadingEmailSources((prev) => new Set([...prev, applicationId]));

    try {
      const result = await getApplicationEmailSources(applicationId);
      if (
        result.success &&
        result.data &&
        typeof result.data === "object" &&
        "email_sources" in result.data
      ) {
        setEmailSources((prev) => ({
          ...prev,
          [applicationId]: (result.data as { email_sources: EmailSource[] })
            .email_sources,
        }));
      }
    } catch (error) {
      console.error("Failed to load email sources:", error);
    } finally {
      setLoadingEmailSources((prev) => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8)
      return "bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/50";
    if (confidence >= 0.6)
      return "bg-amber-100/90 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/50";
    return "bg-slate-200/80 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/50";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.6) return "Medium";
    return "Low";
  };

  const formatTimeAgo = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  };

  // Format AI reasoning with proper line breaks and structure
  const formatAIReasoning = (reasoning: string) => {
    if (!reasoning) return reasoning;

    // For the new structured format, just clean up and return as-is
    // since we've already formatted it nicely in the backend
    let formatted = reasoning.trim();

    // Remove any excessive whitespace while preserving intentional line breaks
    formatted = formatted.replace(/[ \t]+/g, " "); // Normalize spaces and tabs
    formatted = formatted.replace(/\n[ \t]*/g, "\n"); // Remove leading whitespace on new lines
    formatted = formatted.replace(/\n{3,}/g, "\n\n"); // Limit to max 2 consecutive newlines

    return formatted;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Opportunity":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
      case "Applied":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "Screening":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "Interviewing":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "Offer Extended":
      case "Offer Accepted":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "Rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "Withdrawn":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      case "On Hold":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
    }
  };

  if (applications.length === 0) {
    return (
      <div className="py-6 text-center text-slate-500 dark:text-slate-400">
        <CheckCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">No applications to review</p>
        <p className="mt-1 text-xs">
          AI-detected applications will appear here
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="h-full">
        <div className="space-y-2 px-3">
          {applications.map((app, index) => (
            <div key={app.id}>
              <div className="group rounded-md px-2 py-3 transition-colors duration-150 hover:bg-violet-50/80 dark:hover:bg-slate-700/30">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Building className="h-3 w-3 flex-shrink-0 text-slate-600 dark:text-slate-400" />
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {app.company_name}
                      </span>
                    </div>
                    <div className="ml-5 flex items-center gap-2">
                      <span className="text-xs text-slate-700 dark:text-slate-300">
                        {app.role}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-500">
                        • {formatTimeAgo(app.applied_at)}
                      </span>
                    </div>
                  </div>

                  <div className="ml-2 flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`cursor-help rounded px-2 py-0.5 text-xs font-medium ${getStatusColor(
                            app.status,
                          )}`}
                        >
                          {app.status}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>AI-suggested status</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`cursor-help rounded px-2 py-0.5 text-xs font-medium ${getConfidenceColor(
                            app.ai_confidence,
                          )}`}
                        >
                          {getConfidenceLabel(app.ai_confidence)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          AI Confidence: {Math.round(app.ai_confidence * 100)}%
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="ml-5 flex items-center justify-between gap-2">
                  <div className="flex flex-1 items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAction(app.id, "approve")}
                      disabled={reviewingApplications.has(app.id)}
                      className="h-7 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                      title={`Approve as "${app.status}"`}
                    >
                      {reviewingApplications.has(app.id) ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-1 h-3 w-3" />
                      )}
                      {reviewingApplications.has(app.id)
                        ? "Approving..."
                        : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction(app.id, "delete")}
                      disabled={reviewingApplications.has(app.id)}
                      className="h-7 bg-red-100 px-3 text-xs text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                    >
                      {reviewingApplications.has(app.id) ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <X className="mr-1 h-3 w-3" />
                      )}
                      {reviewingApplications.has(app.id)
                        ? "Deleting..."
                        : "Delete"}
                    </Button>
                    <QuickEditPendingApplication
                      application={app}
                      onApplicationUpdated={() =>
                        onApplicationReview(app.id, "approve")
                      }
                    />
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 transition-opacity hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                          onClick={() => loadEmailSources(app.id)}
                        >
                          <Info className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        className="max-w-xs"
                        sideOffset={5}
                        side="left"
                      >
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            AI Reasoning
                          </p>

                          <div className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                            <div className="border-l-2 border-slate-200 pl-2 dark:border-slate-600">
                              <p className="whitespace-pre-wrap">
                                {formatAIReasoning(app.ai_reasoning)}
                              </p>
                            </div>

                            <div className="border-t border-slate-200 pt-1 dark:border-slate-600">
                              <div className="space-y-1">
                                <p>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    Company:
                                  </span>{" "}
                                  <span className="text-slate-600 dark:text-slate-400">
                                    {app.company_name}
                                  </span>
                                </p>
                                <p>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    Role:
                                  </span>{" "}
                                  <span className="text-slate-600 dark:text-slate-400">
                                    {app.role}
                                  </span>
                                </p>
                              </div>
                            </div>

                            {/* Email sources section */}
                            {emailSources[app.id] &&
                              emailSources[app.id].length > 0 && (
                                <div className="border-t border-slate-200 pt-1 dark:border-slate-600">
                                  <p>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">
                                      Email Sources:
                                    </span>{" "}
                                    <span className="text-slate-600 dark:text-slate-400">
                                      {emailSources[app.id].length} related
                                      email
                                      {emailSources[app.id].length !== 1
                                        ? "s"
                                        : ""}
                                    </span>
                                    {loadingEmailSources.has(app.id) && (
                                      <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
                                    )}
                                  </p>
                                </div>
                              )}

                            {loadingEmailSources.has(app.id) &&
                              !emailSources[app.id] && (
                                <div className="pt-1">
                                  <p className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Loading sources...
                                  </p>
                                </div>
                              )}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    {app.source_email_id && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 transition-opacity hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                            onClick={() => {
                              const gmailUrl = integrationEmail
                                ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(integrationEmail)}#inbox/${app.source_email_id}`
                                : `https://mail.google.com/mail/u/0/#inbox/${app.source_email_id}`;
                              window.open(gmailUrl, "_blank");
                            }}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Open email in Gmail</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
              {index < applications.length - 1 && (
                <div className="mx-2 border-b border-violet-200/80 dark:border-slate-700/40"></div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}
