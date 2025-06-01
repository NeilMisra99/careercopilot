"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Mail, Calendar, User, RotateCcw } from "lucide-react";
import type { FailedEmail } from "../../_lib/actions/failed-email-actions";

interface FailedEmailCardProps {
  failedEmail: FailedEmail;
  onClick: (failedEmail: FailedEmail) => void;
}

export function FailedEmailCard({
  failedEmail,
  onClick,
}: FailedEmailCardProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Unknown date";
    }
  };

  return (
    <Card
      className="
        group relative overflow-hidden cursor-pointer
        border border-orange-200/60 dark:border-orange-800/60
        bg-orange-50/80 dark:bg-orange-950/40 backdrop-blur-sm
        transition-all duration-300 ease-out
        hover:shadow-lg hover:shadow-orange-500/10 dark:hover:shadow-orange-500/20
        hover:-translate-y-1 hover:border-orange-300/80 dark:hover:border-orange-700/80
      "
      onClick={() => onClick(failedEmail)}
    >
      {/* Status indicator */}
      <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/60" />

      <div className="p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-shrink-0">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-500" />
            </div>
            <h3 className="font-semibold text-sm text-orange-900 dark:text-orange-100 truncate">
              Failed Processing
            </h3>
          </div>
          <Badge
            variant="outline"
            className="flex-shrink-0 text-xs font-medium border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400"
          >
            Needs Review
          </Badge>
        </div>

        {/* Email subject */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-3.5 w-3.5 text-orange-600 dark:text-orange-500 flex-shrink-0" />
            <p className="text-sm font-medium text-orange-900 dark:text-orange-100 line-clamp-1">
              {failedEmail.email_subject || "No Subject"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-orange-600 dark:text-orange-500 flex-shrink-0" />
            <p className="text-sm text-orange-800 dark:text-orange-200 line-clamp-1">
              {failedEmail.email_from || "Unknown sender"}
            </p>
          </div>
        </div>

        {/* Email snippet */}
        {failedEmail.email_snippet && (
          <div className="mb-3 p-3 bg-orange-100/50 dark:bg-orange-900/30 rounded-lg border border-orange-200/50 dark:border-orange-800/50">
            <p className="text-xs text-orange-700 dark:text-orange-300 line-clamp-2 leading-relaxed">
              {failedEmail.email_snippet}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-orange-600 dark:text-orange-400">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span className="font-medium">
              {formatDate(failedEmail.email_date)}
            </span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 rounded-full">
            <RotateCcw className="h-3 w-3" />
            <span className="font-medium">
              {failedEmail.failure_count} attempts
            </span>
          </div>
        </div>

        {/* Failure reason */}
        <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-900/50 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-orange-900 dark:text-orange-200 mb-1">
                Processing Error:
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                {failedEmail.failure_reason}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
