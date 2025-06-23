"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Activity,
  ArrowRight,
  Briefcase,
  Building,
  Calendar,
  CheckCircle,
  DollarSign,
  Mail,
  MapPin,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";

interface ActivityItem {
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
}

interface ActivitySheetProps {
  activities: ActivityItem[];
}

export function ActivitySheet({ activities }: ActivitySheetProps) {
  const [open, setOpen] = useState(false);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "application_created":
        return <Building className="h-4 w-4 text-blue-500" />;
      case "status_update":
        return <TrendingUp className="h-4 w-4 text-amber-500" />;
      case "interview_scheduled":
        return <Calendar className="h-4 w-4 text-purple-500" />;
      case "email_sync":
        return <Mail className="h-4 w-4 text-green-500" />;
      case "offer_received":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "application_rejected":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-stone-500" />;
    }
  };

  const getActivityBadge = (type: string) => {
    switch (type) {
      case "application_created":
        return (
          <Badge
            variant="secondary"
            className="border-violet-500/20 bg-violet-500/10 text-violet-500 hover:bg-violet-500/20"
          >
            New Application
          </Badge>
        );
      case "status_update":
        return (
          <Badge
            variant="secondary"
            className="border-orange-500/20 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
          >
            Status Update
          </Badge>
        );
      case "interview_scheduled":
        return (
          <Badge
            variant="secondary"
            className="border-indigo-500/20 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20"
          >
            Interview
          </Badge>
        );
      case "email_sync":
        return (
          <Badge
            variant="secondary"
            className="border-blue-500/20 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
          >
            Sync
          </Badge>
        );
      case "offer_received":
        return (
          <Badge
            variant="secondary"
            className="border-green-500/20 bg-green-500/10 text-green-500 hover:bg-green-500/20"
          >
            Offer
          </Badge>
        );
      case "application_rejected":
        return (
          <Badge
            variant="secondary"
            className="border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20"
          >
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">Activity</Badge>;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60),
    );

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return "Yesterday";
    return date.toLocaleDateString();
  };

  const renderActivityDetails = (activity: ActivityItem) => {
    const { metadata } = activity;
    if (!metadata) return null;

    return (
      <div className="space-y-2">
        {metadata.company && (
          <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
            <Building className="h-3 w-3 flex-shrink-0" />
            <span className="font-medium">{metadata.company}</span>
            {metadata.role && (
              <>
                <ArrowRight className="h-3 w-3 flex-shrink-0" />
                <span>{metadata.role}</span>
              </>
            )}
          </div>
        )}

        {metadata.previousStatus && metadata.newStatus && (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-700 dark:text-stone-400">
              {metadata.previousStatus}
            </span>
            <ArrowRight className="h-3 w-3 flex-shrink-0 text-stone-400" />
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {metadata.newStatus}
            </span>
          </div>
        )}

        {(metadata.interviewDate ||
          metadata.location ||
          metadata.salary ||
          metadata.emailCount ||
          metadata.applicationsFound) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
            {metadata.interviewDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>
                  {new Date(metadata.interviewDate).toLocaleDateString()}
                </span>
                {metadata.interviewType && (
                  <Badge
                    variant="outline"
                    className="ml-1 h-4 px-1 py-0 text-xs"
                  >
                    {metadata.interviewType}
                  </Badge>
                )}
              </div>
            )}

            {metadata.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span>{metadata.location}</span>
              </div>
            )}

            {metadata.salary && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 flex-shrink-0" />
                <span className="font-medium text-green-600 dark:text-green-400">
                  {metadata.salary}
                </span>
              </div>
            )}

            {metadata.emailCount && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span>{metadata.emailCount} emails</span>
              </div>
            )}

            {metadata.applicationsFound && (
              <div className="flex items-center gap-1">
                <Briefcase className="h-3 w-3 flex-shrink-0" />
                <span>{metadata.applicationsFound} found</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Mock data for demonstration - in real app this would come from props
  const mockActivities: ActivityItem[] = [
    {
      id: "1",
      type: "application_created",
      title: "New application detected",
      description: "Applied to Senior Frontend Engineer position",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      metadata: {
        company: "Stripe",
        role: "Senior Frontend Engineer",
        location: "San Francisco, CA",
      },
    },
    {
      id: "2",
      type: "status_update",
      title: "Application status updated",
      description: "Your application status has been updated",
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      metadata: {
        company: "Anthropic",
        role: "AI Safety Researcher",
        previousStatus: "Applied",
        newStatus: "Screening",
      },
    },
    {
      id: "3",
      type: "interview_scheduled",
      title: "Interview scheduled",
      description: "Technical interview has been scheduled",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        company: "OpenAI",
        role: "Machine Learning Engineer",
        interviewDate: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        interviewType: "Technical",
      },
    },
    {
      id: "4",
      type: "email_sync",
      title: "Email sync completed",
      description: "Successfully synced your Gmail account",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        emailCount: 47,
        applicationsFound: 3,
      },
    },
    {
      id: "5",
      type: "offer_received",
      title: "Job offer received",
      description: "Congratulations! You've received a job offer",
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        company: "Vercel",
        role: "Senior Full Stack Engineer",
        salary: "$180k - $220k",
        location: "Remote",
      },
    },
  ];

  const displayActivities = activities.length > 0 ? activities : mockActivities;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 hover:bg-stone-50 dark:hover:bg-stone-800"
        >
          <Activity className="h-4 w-4" />
          Activity
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[437px] bg-gradient-to-br from-stone-50 to-stone-100 sm:w-[571px] sm:max-w-none dark:from-stone-900 dark:to-stone-800">
        <SheetHeader className="pt-12 pb-2">
          <SheetTitle className="flex items-center gap-3 text-stone-900 dark:text-stone-100">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
              <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            Recent Activity
          </SheetTitle>
          <SheetDescription className="mt-2 text-stone-600 dark:text-stone-400">
            Your latest job search activities and milestones
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 px-6">
          <ScrollArea className="h-[calc(100vh-160px)]">
            {displayActivities && displayActivities.length > 0 ? (
              <div className="space-y-3 pb-8">
                {displayActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="group relative rounded-lg border-t border-r border-b border-l-4 border-stone-200 border-l-blue-400 bg-white py-4 pr-4 pl-4 transition-all duration-200 hover:border-l-blue-500 hover:shadow-sm dark:border-stone-700 dark:bg-stone-800"
                    style={{
                      borderLeftColor:
                        activity.type === "application_created"
                          ? "#3b82f6"
                          : activity.type === "status_update"
                            ? "#f59e0b"
                            : activity.type === "interview_scheduled"
                              ? "#8b5cf6"
                              : activity.type === "email_sync"
                                ? "#10b981"
                                : activity.type === "offer_received"
                                  ? "#059669"
                                  : activity.type === "application_rejected"
                                    ? "#ef4444"
                                    : "#6b7280",
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0">
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="mb-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {activity.title}
                          </h4>
                          <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">
                            {activity.description}
                          </p>
                          {renderActivityDetails(activity)}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        {getActivityBadge(activity.type)}
                        <span className="text-xs whitespace-nowrap text-stone-500 dark:text-stone-400">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center px-6 pb-8 text-center">
                <div className="mb-4 rounded-full bg-stone-100 p-4 dark:bg-stone-800">
                  <Activity className="h-8 w-8 text-stone-400" />
                </div>
                <h3 className="mb-2 text-base font-medium text-stone-600 dark:text-stone-300">
                  No recent activity
                </h3>
                <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">
                  Your job search activities and milestones will appear here as
                  you use CareerCopilot
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
