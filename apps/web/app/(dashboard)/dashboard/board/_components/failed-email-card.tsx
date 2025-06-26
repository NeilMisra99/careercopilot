"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertCircle, Calendar, Mail, User } from "lucide-react";
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
      className="group bg-card dark:bg-muted border-border cursor-pointer rounded-lg border p-3 shadow-md shadow-black/8 transition-all hover:shadow-lg hover:shadow-black/15 dark:shadow-black/25 dark:hover:shadow-black/35"
      onClick={() => onClick(failedEmail)}
    >
      <div>
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex-shrink-0">
              <AlertCircle className="h-3 w-3 text-orange-500" />
            </div>
            <h3 className="text-foreground truncate text-sm font-medium">
              Failed Processing
            </h3>
          </div>
          <Badge
            variant="outline"
            className="border-orange-200 bg-orange-50 text-xs text-orange-700 dark:border-orange-800/30 dark:bg-orange-950/30 dark:text-orange-300"
          >
            Needs Review
          </Badge>
        </div>

        {/* Email subject */}
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-2">
            <Mail className="text-muted-foreground h-3 w-3 flex-shrink-0" />
            <p className="text-foreground line-clamp-1 text-xs">
              {failedEmail.email_subject || "No Subject"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <User className="text-muted-foreground h-3 w-3 flex-shrink-0" />
            <p className="text-muted-foreground line-clamp-1 text-xs">
              {failedEmail.email_from || "Unknown sender"}
            </p>
          </div>
        </div>

        {/* Email snippet */}
        {failedEmail.email_snippet && (
          <div className="bg-muted/50 mb-3 rounded-md p-2">
            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
              {failedEmail.email_snippet}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(failedEmail.email_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
            <span className="text-muted-foreground">
              {failedEmail.failure_count} attempts
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
