"use client";

import { Badge } from "@/components/ui/badge";
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
  User,
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
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40";
    if (confidence >= 0.6)
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/30 hover:bg-amber-100 dark:hover:bg-amber-900/40";
    return "bg-muted text-muted-foreground border-border hover:bg-muted/80";
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
        return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800/30 hover:bg-teal-100 dark:hover:bg-teal-900/40";
      case "Wishlist":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40";
      case "Applied":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30 hover:bg-blue-100 dark:hover:bg-blue-900/40";
      case "Screening":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/30 hover:bg-amber-100 dark:hover:bg-amber-900/40";
      case "Interviewing":
        return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/30 hover:bg-violet-100 dark:hover:bg-violet-900/40";
      case "Offer Extended":
      case "Offer Accepted":
      case "Offer":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40";
      case "Rejected":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/30 hover:bg-rose-100 dark:hover:bg-rose-900/40";
      case "Withdrawn":
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-900/40";
      case "On Hold":
        return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/40";
      default:
        return "bg-muted text-muted-foreground border-border hover:bg-muted/80";
    }
  };

  if (applications.length === 0) {
    return (
      <div className="text-muted-foreground py-6 text-center">
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
      <ScrollArea className="h-full w-full">
        <div className="space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              className="dark:bg-muted border-border hover:bg-accent/40 dark:hover:bg-accent rounded-lg border p-3 transition-colors"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Building className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                    <span className="text-foreground truncate text-sm font-medium">
                      {app.company_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                    <span className="text-muted-foreground text-xs">
                      {app.role}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      • {formatTimeAgo(app.applied_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`cursor-help px-1.5 py-0.5 text-xs ${getStatusColor(app.status)}`}
                      >
                        {app.status}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>AI-suggested status</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`cursor-help px-1.5 py-0.5 text-xs ${getConfidenceColor(app.ai_confidence)}`}
                      >
                        {getConfidenceLabel(app.ai_confidence)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        AI Confidence: {Math.round(app.ai_confidence * 100)}%
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleAction(app.id, "approve")}
                    disabled={reviewingApplications.has(app.id)}
                    className="h-7 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
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
                    variant="outline"
                    onClick={() => handleAction(app.id, "delete")}
                    disabled={reviewingApplications.has(app.id)}
                    className="h-7 border-red-200 bg-red-50 px-2 text-xs text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
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

                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6"
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
                        <p className="text-xs font-semibold">AI Reasoning</p>
                        <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
                          <div className="border-border border-l-2 pl-2">
                            <p className="whitespace-pre-wrap">
                              {formatAIReasoning(app.ai_reasoning)}
                            </p>
                          </div>
                          <div className="border-border border-t pt-1">
                            <div className="space-y-1">
                              <p>
                                <span className="font-medium">Company:</span>{" "}
                                {app.company_name}
                              </p>
                              <p>
                                <span className="font-medium">Role:</span>{" "}
                                {app.role}
                              </p>
                            </div>
                          </div>
                          {emailSources[app.id] &&
                            emailSources[app.id].length > 0 && (
                              <div className="border-border border-t pt-1">
                                <p>
                                  <span className="font-medium">
                                    Email Sources:
                                  </span>{" "}
                                  {emailSources[app.id].length} related email
                                  {emailSources[app.id].length !== 1 ? "s" : ""}
                                  {loadingEmailSources.has(app.id) && (
                                    <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
                                  )}
                                </p>
                              </div>
                            )}
                          {loadingEmailSources.has(app.id) &&
                            !emailSources[app.id] && (
                              <div className="pt-1">
                                <p className="text-muted-foreground flex items-center gap-1">
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
                          className="h-6 w-6"
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
                        <span>Open email in Gmail</span>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}
