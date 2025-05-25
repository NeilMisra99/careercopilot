"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Mail, Search, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SyncProgressViewProps {
  emailsProcessed: number;
  applicationsFound: number;
  email?: string;
  error?: string | null;
  syncStatus?: string; // 'ai_processing' | 'email_fetching' | etc
  emailsSentToQueue?: number;
  emailsAnalyzed?: number;
}

export function SyncProgressView({
  emailsProcessed,
  applicationsFound,
  email,
  error,
  syncStatus,
  emailsSentToQueue,
  emailsAnalyzed,
}: SyncProgressViewProps) {
  // Determine if this looks like initial state (no meaningful progress yet)
  const isInitialState =
    !syncStatus && emailsProcessed === 0 && applicationsFound === 0;

  const getStatusText = () => {
    if (error) {
      return "Sync Error";
    }

    if (isInitialState) {
      return "Starting Email Sync...";
    }

    switch (syncStatus) {
      case "email_fetching":
        return "Scanning Emails...";
      case "ai_processing":
        return "Finding Applications...";
      case "completed":
        return "Sync Complete";
      default:
        return emailsProcessed > 0 ? "Processing..." : "Starting...";
    }
  };

  const getProgressText = () => {
    if (error) {
      return "An error occurred during sync. Please try again.";
    }

    if (isInitialState) {
      return "Connecting to Gmail and preparing to scan your emails...";
    }

    const parts = [];
    if (emailsProcessed > 0) {
      parts.push(`${emailsProcessed} emails scanned`);
    }
    if (applicationsFound > 0) {
      parts.push(`${applicationsFound} applications found`);
    }

    // Calculate remaining emails in queue
    const emailsRemaining = (emailsSentToQueue || 0) - (emailsAnalyzed || 0);
    if (emailsRemaining > 0 && syncStatus === "ai_processing") {
      parts.push(`${emailsRemaining} emails remaining for analysis`);
    }

    if (parts.length === 0) {
      return "Getting ready to scan your emails...";
    }

    return parts.join(" • ");
  };

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <RefreshCw className="h-4 w-4 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">
              Sync Error
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30">
      <CardContent className="pt-6">
        <div className="text-center space-y-6">
          {/* Animated sync icon */}
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mx-auto">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
            <div className="absolute -top-2 -right-2 h-4 w-4 bg-green-500 rounded-full animate-pulse" />
          </div>

          {/* Title and subtitle */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100">
              {getStatusText()}
            </h2>
            {email && (
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {getProgressText()}
              </p>
            )}
            {syncStatus === "ai_processing" &&
              emailsSentToQueue &&
              emailsAnalyzed !== undefined && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {Math.max(0, emailsSentToQueue - emailsAnalyzed)} emails
                  remaining for AI analysis
                </p>
              )}
          </div>

          {/* Progress metrics - show even if some values are 0, as long as we're not in initial state */}
          {!isInitialState && (
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {emailsProcessed}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {syncStatus === "ai_processing"
                    ? "Emails Analyzed"
                    : "Emails Fetched"}
                </div>
              </div>

              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Search className="h-4 w-4 text-green-600" />
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {applicationsFound}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Applications Found
                </div>
              </div>
            </div>
          )}

          {/* Status and tips */}
          <div className="space-y-3">
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              <Clock className="h-3 w-3 mr-1" />
              {isInitialState
                ? "Initializing sync"
                : syncStatus === "ai_processing"
                  ? "AI analysis in progress"
                  : "Fetching emails from Gmail"}
            </Badge>

            <div className="text-xs text-blue-600 dark:text-blue-400 max-w-sm mx-auto space-y-1">
              <p className="flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" />
                You can safely refresh or navigate away
              </p>
              <p>
                {isInitialState
                  ? "Sync will begin momentarily"
                  : syncStatus === "ai_processing"
                    ? "Applications will appear as AI analysis completes"
                    : "Progress will continue in the background"}
              </p>
            </div>
          </div>

          {/* Progress indicators */}
          <div className="flex justify-center space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.5}s`,
                  animationDuration: "1.5s",
                }}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
