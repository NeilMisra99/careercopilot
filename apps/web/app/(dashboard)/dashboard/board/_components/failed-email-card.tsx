"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { AlertCircle, Calendar, Mail, RotateCcw, User } from "lucide-react"
import type { FailedEmail } from "../../_lib/actions/failed-email-actions"

interface FailedEmailCardProps {
  failedEmail: FailedEmail
  onClick: (failedEmail: FailedEmail) => void
}

export function FailedEmailCard({
  failedEmail,
  onClick,
}: FailedEmailCardProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date"
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    } catch {
      return "Unknown date"
    }
  }

  return (
    <Card
      className="group bg-card dark:bg-muted border-border cursor-pointer rounded-lg border p-3 transition-all hover:shadow-lg hover:shadow-black/15 dark:hover:shadow-black/35 shadow-md shadow-black/8 dark:shadow-black/25"
      onClick={() => onClick(failedEmail)}
    >

      <div>
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-shrink-0">
              <AlertCircle className="h-3 w-3 text-orange-500" />
            </div>
            <h3 className="text-sm font-medium text-foreground truncate">
              Failed Processing
            </h3>
          </div>
          <Badge
            variant="outline"
            className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30"
          >
            Needs Review
          </Badge>
        </div>

        {/* Email subject */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-foreground line-clamp-1">
              {failedEmail.email_subject || "No Subject"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground line-clamp-1">
              {failedEmail.email_from || "Unknown sender"}
            </p>
          </div>
        </div>

        {/* Email snippet */}
        {failedEmail.email_snippet && (
          <div className="mb-3 p-2 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {failedEmail.email_snippet}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(failedEmail.email_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
            <span className="text-muted-foreground">{failedEmail.failure_count} attempts</span>
          </div>
        </div>

      </div>
    </Card>
  )
}
