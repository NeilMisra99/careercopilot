"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle, Mail, RefreshCw, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  getFailedEmailsAction,
  submitManualCorrectionAction,
  type FailedEmail,
  type ManualCorrectionRequest,
} from "../_lib/actions/failed-email-actions"
import { ManualCorrectionDialog } from "./manual-correction-dialog"

export function FailedEmailReview() {
  const [failedEmails, setFailedEmails] = useState<FailedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<FailedEmail | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadFailedEmails = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getFailedEmailsAction()

      if (!result.success) {
        setError(result.error || "Failed to load failed emails")
        return
      }

      setFailedEmails(result.data || [])
    } catch (err) {
      setError("Network error while loading failed emails")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFailedEmails()
  }, [])

  const handleCorrectEmail = (email: FailedEmail) => {
    setSelectedEmail(email)
    setIsDialogOpen(true)
  }

  const handleSubmitCorrection = async (
    correction: ManualCorrectionRequest,
  ) => {
    setIsSubmitting(true)

    try {
      const result = await submitManualCorrectionAction(correction)

      if (result.success) {
        toast.success("Application created!", {
          description: result.message,
        })

        // Remove the corrected email from the list
        setFailedEmails((prev) =>
          prev.filter((email) => email.email_id !== correction.emailId),
        )

        setIsDialogOpen(false)
        setSelectedEmail(null)
      } else {
        toast.error("Failed to create application", {
          description: result.error || "Unknown error occurred",
        })
      }
    } catch (err) {
      toast.error("Network error", {
        description: "Failed to submit correction. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkipEmail = (emailId: string) => {
    // For now, just remove from the UI
    // In a full implementation, you'd mark it as reviewed in the database
    setFailedEmails((prev) =>
      prev.filter((email) => email.email_id !== emailId),
    )
    toast.success("Email skipped", {
      description: "This email won't be shown again",
    })
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return "Unknown date"
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Failed Email Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">
              Loading failed emails...
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900 dark:text-red-100">
            <AlertCircle className="h-5 w-5" />
            Error Loading Failed Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <Button onClick={loadFailedEmails} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (failedEmails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Failed Email Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">All emails processed!</h3>
            <p className="text-muted-foreground">
              No failed emails need manual review at this time.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Failed Email Review
              <Badge variant="secondary" className="ml-2">
                {failedEmails.length} pending
              </Badge>
            </CardTitle>
            <Button onClick={loadFailedEmails} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These emails couldn&apos;t be processed automatically. You can
              provide missing information to create job applications manually.
            </p>

            <div className="space-y-3">
              {failedEmails.map((email) => (
                <div
                  key={email.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <h4 className="font-medium text-sm truncate">
                          {email.email_subject || "No Subject"}
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {email.failure_count} attempts
                        </Badge>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>
                          <span className="font-medium">From:</span>{" "}
                          {email.email_from || "Unknown sender"}
                        </p>
                        <p>
                          <span className="font-medium">Date:</span>{" "}
                          {email.email_date
                            ? formatDate(email.email_date)
                            : "Unknown date"}
                        </p>
                        <p>
                          <span className="font-medium">Reason:</span>{" "}
                          {email.failure_reason}
                        </p>
                      </div>

                      {email.email_snippet && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {email.email_snippet}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => handleCorrectEmail(email)}
                        size="sm"
                        variant="default"
                      >
                        Correct
                      </Button>
                      <Button
                        onClick={() => handleSkipEmail(email.email_id)}
                        size="sm"
                        variant="ghost"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <ManualCorrectionDialog
        email={selectedEmail}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmitCorrection}
        isSubmitting={isSubmitting}
      />
    </>
  )
}
