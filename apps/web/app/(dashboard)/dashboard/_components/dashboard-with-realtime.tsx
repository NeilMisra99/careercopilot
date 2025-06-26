"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Briefcase,
  Building,
  CalendarClock,
  Clock,
  ExternalLink,
  Hourglass,
  Inbox,
  Mail,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { reviewApplication } from "../_lib/actions/application-review-actions";
import { PendingApplicationsReview } from "./pending-applications-review";
import { SyncControl } from "./sync-control";

interface Application {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  source_email_id?: string;
  source_thread_id?: string;
}

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

interface DashboardWithRealtimeProps {
  initialData?: {
    totalApplications: number;
    interviewsScheduled: number;
    offersReceived: number;
    recentActivity: Array<{
      id: string;
      type:
        | "application_created"
        | "status_update"
        | "interview_scheduled"
        | "email_sync"
        | "offer_received"
        | "application_rejected";
      title: string;
      description: string;
      timestamp: string;
      metadata?: {
        company?: string;
        role?: string;
        previousStatus?: string;
        newStatus?: string;
        interviewDate?: string;
        interviewType?: string;
        location?: string;
        salary?: string;
        emailCount?: number;
        applicationsFound?: number;
      };
    }>;
    rawApplications: Application[];
    rawPendingApplications: PendingApplication[];
    errors: {
      applications?: string;
      pendingApplications?: string;
    };
  };
  gmailData?: {
    messages?: Array<{
      id: string;
      subject?: string;
      from?: string;
      snippet?: string;
    }>;
    integratedGmailAddress?: string | null;
  };
  integrationEmail?: string | null;
}

export function DashboardWithRealtime({
  initialData,
  gmailData,
  integrationEmail,
}: DashboardWithRealtimeProps) {
  const [pendingApplications, setPendingApplications] = useState<
    PendingApplication[]
  >(initialData?.rawPendingApplications || []);
  const [reviewingApplications, setReviewingApplications] = useState<
    Set<string>
  >(new Set());
  const router = useRouter();

  const handleApplicationReview = async (
    applicationId: string,
    action: "approve" | "delete",
  ) => {
    // Prevent multiple clicks
    if (reviewingApplications.has(applicationId)) return;

    // Add to reviewing set
    setReviewingApplications((prev) => new Set(prev).add(applicationId));

    // Store original state for rollback
    const originalApplications = [...pendingApplications];

    // Optimistic update
    setPendingApplications((prev) =>
      prev.filter((app) => app.id !== applicationId),
    );

    // Show loading toast
    const toastId = toast.loading(
      action === "approve"
        ? "Approving application..."
        : "Deleting application...",
      {
        description:
          action === "approve"
            ? "Moving to your applications board"
            : "Removing from pending list",
      },
    );

    try {
      // Call the server action to review the application
      const result = await reviewApplication(applicationId, action);

      if (!result.success) {
        throw new Error(result.error || `Failed to ${action} application`);
      }

      // Success toast
      toast.success(
        action === "approve" ? "Application approved!" : "Application deleted!",
        {
          id: toastId,
          description:
            action === "approve"
              ? "Added to your applications board. You can view it in Board View."
              : "Successfully removed from pending list.",
          action:
            action === "approve"
              ? {
                  label: "View Board",
                  onClick: () => (window.location.href = "/dashboard/board"),
                }
              : undefined,
        },
      );

      // Trigger a refresh for both approve and delete actions
      setTimeout(() => {
        router.refresh();
      }, 100);
    } catch (error: unknown) {
      // Rollback optimistic update
      setPendingApplications(originalApplications);

      // Error toast
      toast.error(
        action === "approve"
          ? "Failed to approve application"
          : "Failed to delete application",
        {
          id: toastId,
          description:
            error instanceof Error ? error.message : "Please try again",
        },
      );
    } finally {
      // Remove from reviewing set
      setReviewingApplications((prev) => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });
    }
  };

  // Calculate stats for the enhanced UI
  const stats = {
    totalApplications: initialData?.totalApplications || 0,
    interviewsScheduled: initialData?.interviewsScheduled || 0,
    offersReceived: initialData?.offersReceived || 0,
    pendingReview: pendingApplications.length,
  };

  const recentApplications = initialData?.rawApplications || [];

  return (
    <div className="bg-background relative h-full overflow-hidden">
      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col p-6">
        {/* Header Section */}
        <div className="mb-6 flex-shrink-0 space-y-6">
          {/* Dashboard Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-foreground text-2xl font-medium">
                Welcome Back! 👋
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SyncControl />
              <Button size="sm" variant="default" asChild>
                <Link
                  href="/dashboard/add-application"
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Application</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-6">
            {[
              {
                title: "Applications",
                value: stats.totalApplications,
                color: "bg-blue-500",
                textColor: "text-blue-500",
                icon: Briefcase,
              },
              {
                title: "Interviews",
                value: stats.interviewsScheduled,
                color: "bg-purple-500",
                textColor: "text-purple-500",
                icon: CalendarClock,
              },
              {
                title: "Offers",
                value: stats.offersReceived,
                color: "bg-emerald-500",
                textColor: "text-emerald-500",
                icon: BadgeDollarSign,
              },
              {
                title: "Pending",
                value: stats.pendingReview,
                color: "bg-amber-500",
                textColor: "text-amber-500",
                icon: Hourglass,
              },
            ].map((stat) => (
              <div
                key={stat.title}
                className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">
                      {stat.title}
                    </p>
                    <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                      {stat.value}
                    </p>
                  </div>
                  <div
                    className={`h-10 w-10 rounded-lg ${stat.color} flex items-center justify-center shadow-lg`}
                  >
                    {stat.icon && <stat.icon className="h-5 w-5 text-white" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content - Three Row Layout */}
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {/* Top Row - Recent Applications (Horizontal Timeline) */}
          <div className="flex flex-col rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex flex-shrink-0 items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
                  <Clock className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-foreground text-lg font-medium">
                  Recent Applications
                </h2>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href="/dashboard/board"
                  className="flex items-center gap-2"
                >
                  <span>View All</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>

            {recentApplications.length > 0 ? (
              <div
                className="scrollbar-thin overflow-x-auto overflow-y-hidden"
                style={{ height: "115px", paddingBottom: "8px" }}
              >
                <div
                  className="flex gap-4"
                  style={{ height: "calc(100% - 8px)" }}
                >
                  {recentApplications.slice(0, 15).map((app) => {
                    const getStatusDot = (status: string) => {
                      switch (status) {
                        case "Opportunity":
                          return "bg-teal-500 dark:bg-teal-400";
                        case "Wishlist":
                          return "bg-indigo-500 dark:bg-indigo-400";
                        case "Applied":
                          return "bg-blue-500 dark:bg-blue-400";
                        case "Screening":
                          return "bg-amber-500 dark:bg-amber-400";
                        case "Interviewing":
                          return "bg-violet-500 dark:bg-violet-400";
                        case "Offer":
                        case "Offer Extended":
                        case "Offer Accepted":
                          return "bg-emerald-500 dark:bg-emerald-400";
                        case "Rejected":
                          return "bg-rose-500 dark:bg-rose-400";
                        case "Withdrawn":
                          return "bg-slate-500 dark:bg-slate-400";
                        case "On Hold":
                          return "bg-yellow-500 dark:bg-yellow-400";
                        default:
                          return "bg-muted-foreground";
                      }
                    };

                    return (
                      <div
                        key={app.id}
                        className="bg-card dark:bg-muted border-border hover:bg-accent/40 dark:hover:bg-accent group relative w-64 flex-shrink-0 cursor-pointer rounded-lg border p-3 transition-all"
                      >
                        {/* Status dot */}
                        <div
                          className={`absolute top-4 right-4 h-2 w-2 rounded-full ${getStatusDot(app.status)}`}
                        />

                        {/* Content */}
                        <div className="space-y-3">
                          <div className="space-y-2 pr-6">
                            <div className="flex items-center gap-2">
                              <Building className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                              <h3 className="text-foreground line-clamp-1 text-sm font-medium">
                                {app.company_name}
                              </h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                              <p className="text-muted-foreground line-clamp-1 text-xs">
                                {app.role || "Unknown Role"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {app.status}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(app.applied_at).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center">
                <div>
                  <p className="text-muted-foreground text-sm">
                    No applications yet
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Row - Split between AI Discoveries and Recent Emails */}
          <div className="grid min-h-0 flex-1 grid-cols-12 gap-6">
            {/* AI Discoveries Section */}
            <div className="col-span-6 flex min-h-0 flex-col rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="mb-1 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="text-foreground text-lg font-medium">
                    AI Discoveries
                  </h2>
                  {pendingApplications.length > 0 && (
                    <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:border-purple-700 dark:bg-purple-900/50 dark:text-purple-200">
                      {pendingApplications.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {pendingApplications.length > 0 ? (
                  <div className="h-full">
                    <PendingApplicationsReview
                      applications={pendingApplications}
                      onApplicationReview={handleApplicationReview}
                      integrationEmail={integrationEmail}
                      reviewingApplications={reviewingApplications}
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <p className="text-muted-foreground text-sm">
                        No pending applications to review
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        AI-detected applications will appear here
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Emails Section */}
            <div className="col-span-6 flex min-h-0 flex-col rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]">
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500">
                    <Inbox className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="text-foreground text-lg font-medium">
                    Recent Emails
                  </h2>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {gmailData?.messages && gmailData.messages.length > 0 ? (
                  <div className="scrollbar-thin h-full overflow-y-auto">
                    <div className="pr-2 pb-3">
                      {gmailData.messages.slice(0, 12).map((message, index) => (
                        <div
                          key={`${message.id}-${index}`}
                          className="group border-border hover:bg-accent/40 dark:hover:bg-accent flex cursor-pointer items-start gap-3 border-b px-2 py-4 transition-colors last:border-0"
                        >
                          <div className="bg-primary mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="text-foreground line-clamp-1 text-xs font-medium">
                              {message.subject || "No Subject"}
                            </h4>
                            <p className="text-muted-foreground line-clamp-1 text-xs">
                              {message.from?.split("<")[0]?.trim() || "Unknown"}
                            </p>
                            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                              {message.snippet || "No preview available"}
                            </p>
                          </div>
                          {message.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={() => {
                                const gmailUrl =
                                  integrationEmail ||
                                  gmailData?.integratedGmailAddress
                                    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(integrationEmail || gmailData?.integratedGmailAddress || "")}#inbox/${message.id}`
                                    : `https://mail.google.com/mail/u/0/#inbox/${message.id}`;
                                window.open(gmailUrl, "_blank");
                              }}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <p className="text-muted-foreground mb-4 text-sm">
                        {gmailData?.integratedGmailAddress
                          ? "No recent emails"
                          : "Connect Gmail to see messages"}
                      </p>
                      {!gmailData?.integratedGmailAddress && (
                        <Button variant="default" size="sm" asChild>
                          <Link
                            href="/auth/onboarding/connect-email"
                            className="flex items-center gap-2"
                          >
                            <Mail className="h-3 w-3" />
                            <span>Connect Gmail</span>
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
