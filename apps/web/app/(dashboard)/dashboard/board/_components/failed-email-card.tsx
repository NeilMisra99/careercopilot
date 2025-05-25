"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Mail, Calendar } from "lucide-react";
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
      className="px-3 py-3 cursor-pointer relative group hover:shadow-md transition-all duration-200 hover:-translate-y-1 w-full border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"
      onClick={() => onClick(failedEmail)}
    >
      <div className="flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div className="font-medium text-xs line-clamp-1 flex items-center gap-1 text-orange-900 dark:text-orange-100">
            <AlertCircle className="h-3 w-3 text-orange-600" />
            Failed Email Processing
          </div>
          <Badge
            variant="outline"
            className="text-xs text-orange-600 border-orange-300"
          >
            Needs Review
          </Badge>
        </div>

        <div className="flex items-center gap-1 mb-2">
          <Mail className="h-3 w-3 text-orange-600" />
          <div className="text-xs text-orange-800 dark:text-orange-200 line-clamp-1">
            {failedEmail.email_subject || "No Subject"}
          </div>
        </div>

        <div className="text-xs text-orange-700 dark:text-orange-300 line-clamp-1 mb-2">
          {failedEmail.email_from || "Unknown sender"}
        </div>

        {failedEmail.email_snippet && (
          <div className="text-xs text-orange-600 dark:text-orange-400 line-clamp-2 mb-2">
            {failedEmail.email_snippet}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-orange-500 dark:text-orange-400 mt-1">
          <div className="flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            <span>{formatDate(failedEmail.email_date)}</span>
          </div>
          <div className="text-orange-600">
            {failedEmail.failure_count} attempts
          </div>
        </div>

        <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 p-2 bg-orange-100 dark:bg-orange-900/50 rounded border border-orange-200 dark:border-orange-800">
          <span className="font-medium">Reason: </span>
          {failedEmail.failure_reason}
        </div>
      </div>
    </Card>
  );
}
