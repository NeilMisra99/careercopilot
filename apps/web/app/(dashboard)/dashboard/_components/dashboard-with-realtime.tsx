"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSyncProgress } from "@/hooks/use-sync-progress"
import { motion } from "framer-motion"
import {
  Briefcase,
  Calendar,
  CheckCircle,
  ExternalLink,
  Kanban,
  Mail,
  Plus,
  Trophy,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { PendingApplicationsReview } from "./pending-applications-review"
import { SyncControl } from "./sync-control"
import { SyncProgressView } from "./sync-progress-view"

interface Application {
  id: string
  company_name: string
  role: string
  status: string
  applied_at: string
  source_email_id?: string
  source_thread_id?: string
}

interface PendingApplication {
  id: string
  company_name: string
  role: string
  status: string
  applied_at: string
  ai_suggested: boolean
  ai_confidence: number
  ai_reasoning: string
  needs_user_review: boolean
  source_email_id?: string
  source_thread_id?: string
  job_url?: string
  location?: string
  salary_range?: string
  notes?: string
}

interface DashboardWithRealtimeProps {
  user: {
    id: string
    email?: string
  }
  initialData?: {
    totalApplications: number
    interviewsScheduled: number
    offersReceived: number
    recentActivity: Array<{
      id: string
      type:
        | "application_created"
        | "status_update"
        | "interview_scheduled"
        | "email_sync"
        | "offer_received"
        | "application_rejected"
      title: string
      description: string
      timestamp: string
      metadata?: {
        company?: string
        role?: string
        previousStatus?: string
        newStatus?: string
        interviewDate?: string
        interviewType?: string
        location?: string
        salary?: string
        emailCount?: number
        applicationsFound?: number
      }
    }>
    rawApplications: Application[]
    rawPendingApplications: PendingApplication[]
    errors: {
      applications?: string
      pendingApplications?: string
    }
  }
  gmailData?: {
    messages?: Array<{
      id: string
      subject?: string
      from?: string
      snippet?: string
    }>
    integratedGmailAddress?: string | null
  }
  integrationEmail?: string | null
}

export function DashboardWithRealtime({
  user,
  initialData,
  gmailData,
  integrationEmail,
}: DashboardWithRealtimeProps) {
  const { syncState, loading } = useSyncProgress(user.id)
  const [pendingApplications, setPendingApplications] = useState<
    PendingApplication[]
  >(initialData?.rawPendingApplications || [])
  const [reviewingApplications, setReviewingApplications] = useState<
    Set<string>
  >(new Set())
  const router = useRouter()

  const handleApplicationReview = async (
    applicationId: string,
    action: "approve" | "delete",
  ) => {
    // Prevent multiple clicks
    if (reviewingApplications.has(applicationId)) return

    // Add to reviewing set
    setReviewingApplications((prev) => new Set(prev).add(applicationId))

    // Store original state for rollback
    const originalApplications = [...pendingApplications]

    // Optimistic update
    setPendingApplications((prev) =>
      prev.filter((app) => app.id !== applicationId),
    )

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
    )

    try {
      // Call the worker API to review the application
      const response = await fetch(
        `/api/worker_proxy/applications/${applicationId}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to ${action} application`)
      }

      const result = await response.json()

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
      )

      // Trigger a refresh for both approve and delete actions
      // This ensures the data is synchronized across all views
      router.refresh()
    } catch (error: any) {
      // Rollback optimistic update
      setPendingApplications(originalApplications)

      // Error toast
      toast.error(
        action === "approve"
          ? "Failed to approve application"
          : "Failed to delete application",
        {
          id: toastId,
          description:
            error.message ||
            "Please try again or contact support if the problem persists.",
          action: {
            label: "Retry",
            onClick: () => handleApplicationReview(applicationId, action),
          },
        },
      )
    } finally {
      // Remove from reviewing set
      setReviewingApplications((prev) => {
        const newSet = new Set(prev)
        newSet.delete(applicationId)
        return newSet
      })
    }
  }

  const getInitials = (email?: string) => {
    if (!email) return "U"
    return email
      .split("@")[0]
      .split(".")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  // Show loading skeleton while checking sync state
  if (loading) {
    return null // Let Next.js loading.tsx handle page-level loading
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
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Dashboard
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
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
    )
  }

  // Show Gmail connection prompt if no integration
  if (!integrationEmail) {
    return (
      <div className="h-full overflow-auto">
        <div className="container mx-auto px-6 py-8 max-w-7xl h-full flex flex-col">
          <div className="flex justify-between items-center mb-12 flex-shrink-0">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Dashboard
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Get started by connecting your Gmail account
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                asChild
                variant="outline"
                size="default"
                className="gap-2"
              >
                <Link href="/dashboard/board">
                  <Kanban className="h-4 w-4" />
                  Board View
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center flex-1">
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 max-w-2xl mx-auto">
              <CardContent className="p-8">
                <div className="text-center space-y-6">
                  <div className="flex justify-center">
                    <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <Mail className="h-8 w-8 text-blue-600" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-foreground">
                      Connect Your Gmail
                    </h2>
                    <p className="text-muted-foreground">
                      Connect your Gmail account to automatically track job
                      applications from your emails.
                    </p>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Link href="/auth/onboarding/connect-email">
                      <Mail className="mr-2 h-5 w-5" />
                      Connect Gmail Account
                    </Link>
                  </Button>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 text-sm text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Auto-detect applications</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Track interview invites</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Monitor responses</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Main dashboard content
  const totalApplications = initialData?.totalApplications || 0
  const interviewsScheduled = initialData?.interviewsScheduled || 0
  const offersReceived = initialData?.offersReceived || 0

  // Show regular dashboard with data
  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen w-full bg-white dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-zinc-950"
      >
        <div className="flex-1 p-8 overflow-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex justify-between items-center mb-12 flex-shrink-0"
          >
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Dashboard
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Track your job applications and stay organized
              </p>
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <Button asChild size="default" className="gap-2">
                  <Link href="/dashboard/add-application">
                    <Plus className="h-4 w-4" />
                    Add Application
                  </Link>
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="outline"
                      size="default"
                      className="gap-2"
                    >
                      <Link href="/dashboard/board">
                        <Kanban className="h-4 w-4" />
                        Board View
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Switch to Kanban board view</p>
                  </TooltipContent>
                </Tooltip>

                <SyncControl />
              </div>
            </div>
          </motion.div>

          {/* Application Statistics Row */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 flex-shrink-0"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
              >
                <Card className="bg-white dark:bg-slate-800/90 border-l-4 border-l-blue-500 border-r-slate-200/80 border-t-slate-200/80 border-b-slate-200/80 dark:border-r-slate-700/60 dark:border-t-slate-700/60 dark:border-b-slate-700/60 hover:border-l-blue-600 hover:shadow-lg transition-all duration-300 rounded-xl group relative overflow-hidden">
                  <CardHeader className="pb-3 relative z-10">
                    <CardTitle className="text-base font-medium text-slate-700 dark:text-slate-300 flex items-center gap-3 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
                      <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Briefcase className="h-4 w-4 text-white" />
                      </div>
                      Total Applications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                      {totalApplications}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Applications tracked across all stages
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
              >
                <Card className="bg-white dark:bg-slate-800/90 border-l-4 border-l-amber-500 border-r-slate-200/80 border-t-slate-200/80 border-b-slate-200/80 dark:border-r-slate-700/60 dark:border-t-slate-700/60 dark:border-b-slate-700/60 hover:border-l-amber-600 hover:shadow-lg transition-all duration-300 rounded-xl group relative overflow-hidden">
                  <CardHeader className="pb-3 relative z-10">
                    <CardTitle className="text-base font-medium text-slate-700 dark:text-slate-300 flex items-center gap-3 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
                      <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/25">
                        <Calendar className="h-4 w-4 text-white" />
                      </div>
                      Interviews Scheduled
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                      {interviewsScheduled}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Active interviews and screenings
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
              >
                <Card className="bg-white dark:bg-slate-800/90 border-l-4 border-l-emerald-500 border-r-slate-200/80 border-t-slate-200/80 border-b-slate-200/80 dark:border-r-slate-700/60 dark:border-t-slate-700/60 dark:border-b-slate-700/60 hover:border-l-emerald-600 hover:shadow-lg transition-all duration-300 rounded-xl group relative overflow-hidden">
                  <CardHeader className="pb-3 relative z-10">
                    <CardTitle className="text-base font-medium text-slate-700 dark:text-slate-300 flex items-center gap-3 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
                      <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <Trophy className="h-4 w-4 text-white" />
                      </div>
                      Offers Received
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                      {offersReceived}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Outstanding offers to review
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.section>

          {/* Main Content Grid */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0"
          >
            {/* Recent Emails Section */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200/20 dark:border-slate-700/40 hover:border-slate-300/30 dark:hover:border-slate-600/50 transition-all duration-300 rounded-xl h-[600px] relative overflow-hidden">
                <CardHeader className="pb-6 bg-gradient-to-b from-fuchsia-100/80 via-fuchsia-50/40 via-50% to-transparent dark:from-fuchsia-700/40 dark:via-fuchsia-800/15 dark:via-50% dark:to-transparent">
                  <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <div className="w-6 h-6 bg-fuchsia-500 rounded-lg flex items-center justify-center">
                      <Mail className="h-3 w-3 text-white" />
                    </div>
                    Recent Emails
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3 h-[calc(600px-80px)]">
                  <ScrollArea className="h-full">
                    <div className="space-y-0 px-3">
                      {gmailData?.messages && gmailData.messages.length > 0 ? (
                        gmailData.messages.slice(0, 8).map((message, index) => (
                          <motion.div
                            key={`${message.id}-${index}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.4,
                              delay: 0.8 + index * 0.05,
                            }}
                            className="hover:bg-blue-50/70 dark:hover:bg-slate-700/30 py-3 px-2 rounded-md transition-colors duration-150 group"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed pr-3 flex-1 min-w-0">
                                {message.subject || "No Subject"}
                              </h4>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {message.from
                                    ?.split("<")[0]
                                    ?.trim()
                                    .slice(0, 20) || "Unknown"}
                                </span>
                                {message.id && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-opacity"
                                        onClick={() => {
                                          // Use the authuser parameter to specify which Gmail account to use
                                          const gmailUrl =
                                            integrationEmail ||
                                            gmailData?.integratedGmailAddress
                                              ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(integrationEmail || gmailData?.integratedGmailAddress || "")}#inbox/${message.id}`
                                              : `https://mail.google.com/mail/u/0/#inbox/${message.id}`
                                          window.open(gmailUrl, "_blank")
                                        }}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Open email in Gmail</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2 pr-2">
                              {message.snippet || "No preview available"}
                            </p>
                            {index <
                              (gmailData?.messages?.slice(0, 8).length || 0) -
                                1 && (
                              <div className="mx-2 mt-3 border-b border-slate-300/60 dark:border-slate-700/40"></div>
                            )}
                          </motion.div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                          <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No recent emails found</p>
                          <p className="text-xs mt-1">
                            {gmailData?.integratedGmailAddress
                              ? "Check your email connection"
                              : "Connect your email to see recent messages"}
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>

            {/* Applications to Review Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200/20 dark:border-slate-700/40 hover:border-slate-300/30 dark:hover:border-slate-600/50 transition-all duration-300 rounded-xl h-[600px] relative overflow-hidden">
                <CardHeader className="pb-6 bg-gradient-to-b from-violet-100/80 via-violet-50/40 via-50% to-transparent dark:from-violet-700/40 dark:via-violet-800/15 dark:via-50% dark:to-transparent">
                  <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <div className="w-6 h-6 bg-violet-500 rounded-lg flex items-center justify-center">
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    Applications to Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3 h-[calc(600px-80px)]">
                  <PendingApplicationsReview
                    applications={pendingApplications}
                    onApplicationReview={handleApplicationReview}
                    integrationEmail={integrationEmail}
                    reviewingApplications={reviewingApplications}
                  />
                </CardContent>
              </Card>
            </motion.div>
          </motion.section>
        </div>
      </motion.div>
    </TooltipProvider>
  )
}
