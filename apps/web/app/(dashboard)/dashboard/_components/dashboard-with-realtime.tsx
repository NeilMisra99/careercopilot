"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GooeyFilter } from "@/components/ui/gooey-filter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScreenSize } from "@/hooks/use-screen-size";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Brain,
  Briefcase,
  Building,
  Calendar,
  Clock,
  ExternalLink,
  Mail,
  Plus,
  TrendingUp,
  Trophy,
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
  const [activeTab, setActiveTab] = useState(0); // 0 = Recent Applications, 1 = AI Discoveries
  const router = useRouter();
  const screenSize = useScreenSize();

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

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.25, 0, 1],
      },
    },
  };

  return (
    <div className="relative h-full overflow-auto">
      <motion.div
        className="relative z-10 space-y-8 p-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header Section */}
        <motion.div className="flex flex-col space-y-6" variants={itemVariants}>
          {/* Welcome Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <motion.h1
                className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-4xl font-bold text-transparent dark:from-slate-100 dark:via-slate-200 dark:to-slate-300"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                Welcome back! 👋
              </motion.h1>
              <motion.p
                className="text-lg text-slate-600 dark:text-slate-400"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                Here&apos;s what&apos;s happening with your job search
              </motion.p>
            </div>

            {/* Quick Actions - Simplified */}
            <div className="flex items-center gap-4">
              <SyncControl className="hidden sm:block" />

              {/* Simplified Add Application Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      className="bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700"
                    >
                      <Link
                        href="/dashboard/add-application"
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="font-medium">Add Application</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>Add a new job application</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Enhanced Stats Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Total Applications",
                value: stats.totalApplications,
                icon: Briefcase,
                color: "from-blue-500 to-blue-600",
                bgColor:
                  "from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30",
                change: "+12% from last month",
                trending: true,
              },
              {
                title: "Interviews Scheduled",
                value: stats.interviewsScheduled,
                icon: Calendar,
                color: "from-emerald-500 to-emerald-600",
                bgColor:
                  "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30",
                change: "2 this week",
                trending: true,
              },
              {
                title: "Offers Received",
                value: stats.offersReceived,
                icon: Trophy,
                color: "from-amber-500 to-amber-600",
                bgColor:
                  "from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30",
                change: "Congratulations! 🎉",
                trending: stats.offersReceived > 0,
              },
              {
                title: "Pending Review",
                value: stats.pendingReview,
                icon: Clock,
                color: "from-purple-500 to-purple-600",
                bgColor:
                  "from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30",
                change: "AI suggestions ready",
                trending: stats.pendingReview > 0,
              },
            ].map((stat, index) => (
              <motion.div
                key={stat.title}
                variants={itemVariants}
                whileHover={{
                  scale: 1.02,
                  transition: { duration: 0.2 },
                }}
                className="group"
              >
                <Card
                  className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgColor} shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                          {stat.title}
                        </p>
                        <div className="flex items-baseline space-x-2">
                          <motion.p
                            className="text-3xl font-bold text-slate-900 dark:text-slate-100"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3 + index * 0.1 }}
                          >
                            {stat.value}
                          </motion.p>
                          {stat.trending && (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.5 + index * 0.1 }}
                              className="flex items-center"
                            >
                              <TrendingUp className="h-4 w-4 text-emerald-500" />
                            </motion.div>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          {stat.change}
                        </p>
                      </div>
                      <motion.div
                        className={`rounded-xl bg-gradient-to-br p-3 ${stat.color} shadow-sm`}
                        whileHover={{ rotate: 5, scale: 1.1 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 17,
                        }}
                      >
                        <stat.icon className="h-6 w-6 text-white" />
                      </motion.div>
                    </div>
                  </CardContent>

                  {/* Subtle gradient overlay */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Main Content Grid - Adjusted proportions */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Applications with Glass Gooey Tabs - takes 7 columns */}
          <motion.div className="xl:col-span-7" variants={itemVariants}>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/30 bg-white/80 shadow-sm backdrop-blur-xl dark:border-slate-700/30 dark:bg-slate-900/80">
              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4">
                <div className="flex items-center space-x-4">
                  <div className="rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 p-3 shadow-lg shadow-blue-500/25">
                    <Briefcase className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-2xl font-bold text-transparent dark:from-slate-100 dark:via-slate-200 dark:to-slate-300">
                      Job Applications
                    </h2>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      Manage your applications and AI discoveries
                    </p>
                  </div>
                </div>

                {/* Simplified View Board Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="border border-slate-200/60 bg-slate-50/80 text-slate-700 shadow-sm hover:bg-slate-100 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Link
                    href="/dashboard/board"
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium">View Board</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              {/* Gooey Tabs Container */}
              <div className="relative px-6 pb-6">
                {/* Gooey Filter */}
                <GooeyFilter
                  id="tabs-gooey-filter"
                  strength={screenSize.lessThan("md") ? 8 : 15}
                />

                {/* Background with Gooey Effect - One Seamless Surface */}
                <div
                  className="absolute inset-x-4 inset-y-0"
                  style={{ filter: "url(#tabs-gooey-filter)" }}
                >
                  {/* Tab Background Track */}
                  <div className="flex w-full">
                    {[0, 1].map((index) => (
                      <div key={index} className="relative h-12 flex-1">
                        {activeTab === index && (
                          <motion.div
                            layoutId="active-tab-background"
                            className="absolute inset-0 bg-slate-100 dark:bg-slate-800"
                            transition={{
                              type: "spring",
                              bounce: 0.0,
                              duration: 0.6,
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Content Panel - Seamlessly Connected (No Gap, No Border) */}
                  <div className="h-[29.5rem] w-full overflow-hidden bg-slate-100 dark:bg-slate-800" />
                </div>

                {/* Interactive Tab Buttons */}
                <div className="relative flex w-full px-4">
                  {[
                    {
                      label: "Recent Applications",
                      count: recentApplications.length,
                      icon: null,
                    },
                    {
                      label: "AI Discoveries",
                      count: pendingApplications.length,
                      icon: <Brain className="h-4 w-4" />,
                    },
                  ].map((tab, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveTab(index)}
                      className="group h-12 flex-1"
                    >
                      <div
                        className={`flex h-full w-full items-center justify-center gap-2 transition-colors duration-300 ${
                          activeTab === index
                            ? "font-semibold text-slate-900 dark:text-slate-100"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                        }`}
                      >
                        {tab.icon}
                        <span className="text-sm font-medium md:text-base">
                          {tab.label}
                        </span>
                        {tab.count > 0 && (
                          <Badge
                            variant="secondary"
                            className="h-5 min-w-[20px] rounded-full border-0 bg-slate-300 px-2 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-300"
                          >
                            {tab.count}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="relative h-[29.5rem] overflow-hidden px-4">
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={activeTab}
                      initial={{
                        opacity: 0,
                        y: 50,
                        filter: "blur(10px)",
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                      }}
                      exit={{
                        opacity: 0,
                        y: -50,
                        filter: "blur(10px)",
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeOut",
                      }}
                      className="h-full p-8"
                    >
                      {activeTab === 0 ? (
                        // Recent Applications Content
                        <div className="h-full">
                          <AnimatePresence>
                            {recentApplications.length > 0 ? (
                              <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                className="h-full"
                              >
                                <ScrollArea className="h-full">
                                  <div className="space-y-0 px-3">
                                    {recentApplications.map((app, index) => {
                                      const getStatusColor = (
                                        status: string,
                                      ) => {
                                        switch (status) {
                                          case "Opportunity":
                                            return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
                                          case "Applied":
                                            return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
                                          case "Screening":
                                            return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
                                          case "Interviewing":
                                            return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
                                          case "Offer":
                                            return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
                                          case "Rejected":
                                            return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
                                          case "Withdrawn":
                                            return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
                                          default:
                                            return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
                                        }
                                      };

                                      return (
                                        <div key={app.id}>
                                          <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                              delay: index * 0.1,
                                              duration: 0.5,
                                            }}
                                            className="group rounded-md px-3 py-3 transition-colors duration-150 hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex items-center gap-2">
                                                  <Building className="h-3 w-3 flex-shrink-0 text-slate-600 dark:text-slate-400" />
                                                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                                    {app.company_name}
                                                  </span>
                                                </div>
                                                <div className="ml-5 flex items-center gap-2">
                                                  <span className="text-xs text-slate-700 dark:text-slate-300">
                                                    {app.role}
                                                  </span>
                                                  <span className="text-xs text-slate-500 dark:text-slate-500">
                                                    •{" "}
                                                    {new Date(
                                                      app.applied_at,
                                                    ).toLocaleDateString(
                                                      "en-US",
                                                      {
                                                        month: "short",
                                                        day: "numeric",
                                                      },
                                                    )}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="ml-2 flex items-center">
                                                <div
                                                  className={`cursor-default rounded px-2 py-0.5 text-xs font-medium ${getStatusColor(
                                                    app.status,
                                                  )}`}
                                                >
                                                  {app.status}
                                                </div>
                                              </div>
                                            </div>
                                          </motion.div>
                                          {index <
                                            recentApplications.length - 1 && (
                                            <Separator className="my-2 bg-slate-300 dark:bg-slate-700" />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              </motion.div>
                            ) : (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                                className="flex h-full items-center justify-center text-center"
                              >
                                <div>
                                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/90 shadow-lg dark:bg-slate-700/90">
                                    <Briefcase className="h-10 w-10 text-slate-400" />
                                  </div>
                                  <h3 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                                    No applications yet
                                  </h3>
                                  <p className="mb-6 text-slate-600 dark:text-slate-400">
                                    Start by adding your first job application
                                  </p>

                                  {/* Simplified Call-to-Action Button */}
                                  <Button
                                    asChild
                                    className="bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700"
                                  >
                                    <Link
                                      href="/dashboard/add-application"
                                      className="flex items-center gap-2"
                                    >
                                      <Plus className="h-4 w-4" />
                                      <span className="font-medium">
                                        Add Application
                                      </span>
                                    </Link>
                                  </Button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ) : (
                        // AI Discoveries Content
                        <div className="h-full space-y-4">
                          <AnimatePresence>
                            {pendingApplications.length > 0 ? (
                              <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                className="h-full"
                              >
                                <PendingApplicationsReview
                                  applications={pendingApplications}
                                  onApplicationReview={handleApplicationReview}
                                  integrationEmail={integrationEmail}
                                  reviewingApplications={reviewingApplications}
                                />
                              </motion.div>
                            ) : (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                                className="flex h-full items-center justify-center text-center"
                              >
                                <div>
                                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/90 shadow-lg dark:bg-slate-700/90">
                                    <Brain className="h-10 w-10 text-slate-400" />
                                  </div>
                                  <h3 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                                    No AI discoveries yet
                                  </h3>
                                  <p className="mb-6 text-slate-600 dark:text-slate-400">
                                    Connect Gmail to let AI discover
                                    applications
                                  </p>
                                  <SyncControl />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Recent Emails - takes 5 columns */}
          <motion.div className="xl:col-span-5" variants={itemVariants}>
            <div className="h-full overflow-hidden rounded-2xl border border-slate-200/30 bg-white/80 shadow-sm backdrop-blur-xl dark:border-slate-700/30 dark:bg-slate-900/80">
              <div className="flex items-center space-x-3 p-6 pb-4">
                <div className="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 p-3 shadow-lg shadow-violet-500/25">
                  <Mail className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-2xl font-bold text-transparent dark:from-slate-100 dark:via-slate-200 dark:to-slate-300">
                    Recent Emails
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Your latest Gmail messages
                  </p>
                </div>
              </div>

              {/* Add top padding to align with applications tabs content */}
              <div className="px-6 pt-3 pb-6">
                <ScrollArea className="h-[31.5rem]">
                  <AnimatePresence>
                    {gmailData?.messages && gmailData.messages.length > 0 ? (
                      <div className="space-y-3">
                        {gmailData.messages
                          .slice(0, 10)
                          .map((message, index) => (
                            <motion.div
                              key={`${message.id}-${index}`}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="group rounded-xl border border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-white/50 p-4 transition-all duration-200 hover:border-violet-200/60 hover:shadow-md dark:border-slate-700/50 dark:from-slate-800/50 dark:to-slate-900/50 dark:hover:border-violet-700/60"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-2 flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-violet-400"></div>
                                    <h4 className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {message.subject || "No Subject"}
                                    </h4>
                                  </div>
                                  <p className="mb-2 line-clamp-1 text-xs text-slate-600 dark:text-slate-400">
                                    From:{" "}
                                    {message.from
                                      ?.split("<")[0]
                                      ?.trim()
                                      .slice(0, 30) || "Unknown"}
                                  </p>
                                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-500">
                                    {message.snippet || "No preview available"}
                                  </p>
                                </div>
                                {message.id && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 rounded-full border border-violet-200/50 bg-violet-50/80 text-violet-600 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-violet-100 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-800/50"
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
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <span>Open in Gmail</span>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </motion.div>
                          ))}
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex h-full items-center justify-center text-center"
                      >
                        <div>
                          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-violet-200 shadow-lg dark:from-violet-800 dark:to-violet-700">
                            <Mail className="h-10 w-10 text-violet-500 dark:text-violet-400" />
                          </div>
                          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                            No recent emails
                          </h3>
                          <p className="mb-6 text-slate-600 dark:text-slate-400">
                            {gmailData?.integratedGmailAddress
                              ? "Check your email connection"
                              : "Connect your Gmail to see recent messages"}
                          </p>

                          {/* Simplified Connect Gmail Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-800/50"
                          >
                            <Link
                              href="/auth/onboarding/connect-email"
                              className="flex items-center gap-2"
                            >
                              <Mail className="h-4 w-4" />
                              <span className="font-medium">Connect Gmail</span>
                            </Link>
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </ScrollArea>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
