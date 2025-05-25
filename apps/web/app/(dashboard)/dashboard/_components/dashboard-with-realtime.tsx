"use client";

import { useState } from "react";
import { useSyncProgress } from "@/hooks/use-sync-progress";
import { SyncProgressView } from "./sync-progress-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Inbox, Kanban, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AISuggestionsReview } from "./ai-suggestions-review";
import { SyncControl } from "./sync-control";
import { ActivitySheet } from "./activity-sheet";
import { FirstTimeSyncBanner } from "./first-time-sync-banner";

interface Application {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  source_email_id?: string;
  source_thread_id?: string;
}

interface AISuggestion {
  id: string;
  suggested_company_name: string;
  suggested_role: string;
  suggested_status: string;
  suggestion_type: string;
  suggestion_lifecycle_status: string;
  raw_email_data?: {
    email_subject?: string;
    email_from?: string;
    email_date?: string;
    email_snippet?: string;
  };
  suggestion_details?: {
    previous_status?: string;
    suggested_status?: string;
  };
  created_at: string;
}

interface DashboardWithRealtimeProps {
  user: {
    id: string;
    email?: string;
  };
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
    rawSuggestions: AISuggestion[];
    errors: {
      applications?: string;
      suggestions?: string;
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
  user,
  initialData,
  gmailData,
  integrationEmail,
}: DashboardWithRealtimeProps) {
  const { syncState, loading } = useSyncProgress(user.id);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(
    initialData?.rawSuggestions || []
  );

  const handleSuggestionUpdate = (
    suggestionId: string,
    action: "confirm" | "reject"
  ) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId
          ? {
              ...s,
              suggestion_lifecycle_status:
                action === "confirm" ? "Confirmed" : "Rejected",
            }
          : s
      )
    );
  };

  const getInitials = (email?: string) => {
    if (!email) return "U";
    return email
      .split("@")[0]
      .split(".")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Show loading skeleton while checking sync state
  if (loading) {
    return null; // Let Next.js loading.tsx handle page-level loading
  }

  // Show sync progress if currently syncing - but only if we have actual progress data
  // This prevents flash when sync state is briefly inconsistent
  if (
    syncState.inProgress &&
    syncState.summary &&
    (syncState.summary.emails_processed > 0 ||
      syncState.summary.applications_found > 0 ||
      (syncState.summary.emails_sent_to_queue &&
        syncState.summary.emails_sent_to_queue > 0))
  ) {
    return (
      <div className="h-full">
        <div className="container mx-auto px-6 py-8 max-w-7xl h-full flex flex-col">
          <div className="flex justify-between items-center mb-12 flex-shrink-0">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Dashboard
              </h1>
              <p className="text-lg text-stone-600 dark:text-stone-400 mt-2">
                Syncing your job applications...
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button asChild variant="outline" size="lg" className="gap-2">
                <Link href="/dashboard/board">
                  <Kanban className="h-5 w-5" />
                  <span>Board View</span>
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center flex-1">
            <SyncProgressView
              emailsProcessed={syncState.summary?.emails_processed || 0}
              applicationsFound={syncState.summary?.applications_found || 0}
              email={integrationEmail || undefined}
              error={syncState.error}
              syncStatus={syncState.summary?.status}
              emailsSentToQueue={syncState.summary?.emails_sent_to_queue}
              emailsAnalyzed={syncState.summary?.emails_analyzed}
            />
          </div>
        </div>
      </div>
    );
  }

  // Show Gmail connection prompt if no integration
  if (!integrationEmail) {
    return (
      <div className="h-full overflow-auto">
        <div className="container mx-auto px-6 py-8 max-w-7xl h-full flex flex-col">
          <div className="flex justify-between items-center mb-12 flex-shrink-0">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Dashboard
              </h1>
              <p className="text-lg text-stone-600 dark:text-stone-400 mt-2">
                Get started by connecting your Gmail account
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button asChild variant="outline" size="lg" className="gap-2">
                <Link href="/dashboard/board">
                  <Kanban className="h-5 w-5" />
                  <span>Board View</span>
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center flex-1">
            <FirstTimeSyncBanner integrationEmail={integrationEmail} />
          </div>
        </div>
      </div>
    );
  }

  // Show regular dashboard with data
  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto px-6 py-8 max-w-7xl h-full flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-12 flex-shrink-0">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Dashboard
            </h1>
            <p className="text-lg text-stone-600 dark:text-stone-400 mt-2">
              Track your job applications and stay organized
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button asChild>
              <Link href="/dashboard/add-application">
                <Plus className="h-4 w-4 mr-2" />
                Add Application
              </Link>
            </Button>
            <ActivitySheet activities={initialData?.recentActivity || []} />
            <SyncControl />
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/dashboard/board">
                <Kanban className="h-5 w-5" />
                <span>Board View</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Application Statistics Row */}
        <section className="mb-8 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-stone-600 dark:text-stone-300 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Total Applications
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-2">
                  {initialData?.totalApplications || 0}
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Applications tracked across all stages
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-stone-600 dark:text-stone-300 flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  Interviews Scheduled
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-2">
                  {initialData?.interviewsScheduled || 0}
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Active interviews and screenings
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-stone-600 dark:text-stone-300 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Offers Received
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-2">
                  {initialData?.offersReceived || 0}
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Outstanding offers to review
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Main Content Grid - Side by Side Layout */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Emails - Left Side (2/3 width) */}
          <div
            className={`min-h-0 ${suggestions && suggestions.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}`}
          >
            <Card className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm flex flex-col min-h-0 h-full">
              <CardHeader className="pb-4 flex-shrink-0">
                <CardTitle className="text-lg font-semibold flex items-center gap-3 text-stone-900 dark:text-stone-100">
                  <div className="w-6 h-6 bg-blue-50 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                    <Inbox className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  Recent Emails
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                  {gmailData?.messages && gmailData.messages.length > 0 ? (
                    <div className="space-y-3">
                      {gmailData.messages.slice(0, 15).map((msg) => (
                        <div
                          key={msg.id}
                          className="flex items-start space-x-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-700/50 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors border border-stone-100 dark:border-stone-600"
                        >
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white font-medium">
                              {getInitials(msg.from)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-none text-stone-900 dark:text-stone-100 line-clamp-1">
                                {msg.subject || "No subject"}
                              </p>
                              <span className="text-xs text-stone-400 dark:text-stone-500 flex-shrink-0">
                                {msg.from?.split("<")[1]?.replace(">", "") ||
                                  msg.from?.split("@")[1] ||
                                  ""}
                              </span>
                            </div>
                            <p className="text-xs text-stone-600 dark:text-stone-300 font-medium">
                              From:{" "}
                              {msg.from?.split("<")[0]?.trim() || msg.from}
                            </p>
                            <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 leading-relaxed">
                              {msg.snippet}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Inbox className="h-12 w-12 text-stone-400 mb-3" />
                      <h3 className="text-base font-medium text-stone-600 dark:text-stone-300 mb-1">
                        No recent emails
                      </h3>
                      <p className="text-sm text-stone-500 dark:text-stone-400">
                        Your recent emails will appear here once Gmail is synced
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* AI Suggestions - Right Side (1/3 width) */}
          {suggestions && suggestions.length > 0 && (
            <div className="lg:col-span-1 min-h-0">
              <Card className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm flex flex-col min-h-0 h-full">
                <CardHeader className="pb-4 flex-shrink-0">
                  <CardTitle className="text-lg font-semibold flex items-center gap-3 text-stone-900 dark:text-stone-100">
                    <div className="w-6 h-6 bg-amber-50 dark:bg-amber-900/50 rounded-lg flex items-center justify-center">
                      <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </div>
                    AI Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0">
                  <AISuggestionsReview
                    suggestions={suggestions}
                    onSuggestionUpdate={handleSuggestionUpdate}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
