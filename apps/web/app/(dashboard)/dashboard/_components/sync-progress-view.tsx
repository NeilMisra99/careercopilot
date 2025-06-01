"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Brain,
  CheckCircle,
  Clock,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

interface SyncProgressViewProps {
  emailsProcessed: number;
  applicationsFound: number;
  email?: string;
  error?: string | null;
  syncStatus?: string; // 'ai_first_processing' | 'preparing' | 'completed' | etc
  emailsSentToQueue?: number;
  emailsAnalyzed?: number;
  redirectCountdown?: number | null;
}

export function SyncProgressView({
  emailsProcessed,
  applicationsFound,
  error,
  syncStatus,
  redirectCountdown,
}: SyncProgressViewProps) {
  // Determine if this looks like initial state (no meaningful progress yet)
  const isInitialState =
    !syncStatus && emailsProcessed === 0 && applicationsFound === 0;

  const getStatusText = () => {
    if (error) {
      return "Sync Failed";
    }

    if (syncStatus === "completed") {
      return "Setup Complete!";
    }

    if (syncStatus === "ai_first_processing") {
      return "Scanning & Analyzing...";
    }

    if (syncStatus === "preparing") {
      return "Preparing Your Sync";
    }

    return "Analyzing Your Emails...";
  };

  const getProgressText = () => {
    if (error) {
      return "We encountered an issue while processing your emails. Our team has been notified and will help resolve this.";
    }

    if (syncStatus === "completed") {
      return "Your emails have been successfully analyzed and job applications discovered. Redirecting to your dashboard...";
    }

    if (syncStatus === "ai_first_processing") {
      return `${emailsProcessed} emails scanned with AI • ${applicationsFound} applications found`;
    }

    if (syncStatus === "preparing") {
      return "We're setting up the connection and preparing to analyze your emails. This will just take a moment.";
    }

    if (isInitialState) {
      return "We're connecting to your Gmail account to start analyzing your emails for job applications.";
    }

    return `${emailsProcessed} emails scanned • ${applicationsFound} applications found • AI analysis in progress`;
  };

  const getStatusConfig = () => {
    if (error) {
      return {
        bgClass:
          "from-red-50/90 via-rose-50/40 to-pink-50/30 dark:from-red-950/30 dark:via-rose-950/20 dark:to-pink-950/10",
        iconBg:
          "bg-gradient-to-br from-red-100 to-rose-100 dark:from-red-900/80 dark:to-rose-900/80",
        iconColor: "text-red-600 dark:text-red-400",
        icon: AlertCircle,
        borderColor: "border-red-200/60 dark:border-red-700/60",
        shadowColor: "shadow-red-200/20 dark:shadow-red-900/40",
      };
    }

    if (syncStatus === "completed") {
      return {
        bgClass:
          "from-emerald-50/90 via-green-50/40 to-teal-50/30 dark:from-emerald-950/30 dark:via-green-950/20 dark:to-teal-950/10",
        iconBg:
          "bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/80 dark:to-green-900/80",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        icon: CheckCircle,
        borderColor: "border-emerald-200/60 dark:border-emerald-700/60",
        shadowColor: "shadow-emerald-200/20 dark:shadow-emerald-900/40",
      };
    }

    if (syncStatus === "ai_first_processing") {
      return {
        bgClass:
          "from-violet-50/90 via-purple-50/40 to-indigo-50/30 dark:from-violet-950/30 dark:via-purple-950/20 dark:to-indigo-950/10",
        iconBg:
          "bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/80 dark:to-purple-900/80",
        iconColor: "text-violet-600 dark:text-violet-400",
        icon: Brain,
        borderColor: "border-violet-200/60 dark:border-violet-700/60",
        shadowColor: "shadow-violet-200/20 dark:shadow-violet-900/40",
      };
    }

    // Default blue for preparing and other states
    return {
      bgClass:
        "from-blue-50/90 via-indigo-50/40 to-slate-50/30 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-slate-950/10",
      iconBg:
        "bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/80 dark:to-indigo-900/80",
      iconColor: "text-blue-600 dark:text-blue-400",
      icon: RefreshCw,
      borderColor: "border-blue-200/60 dark:border-blue-700/60",
      shadowColor: "shadow-blue-200/20 dark:shadow-blue-900/40",
    };
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: [0.25, 0.25, 0, 1] }}
      className="flex min-h-[400px] items-center justify-center px-4"
    >
      <Card
        className={`w-full max-w-2xl ${config.borderColor} bg-gradient-to-br ${config.bgClass} shadow-xl ${config.shadowColor}`}
      >
        <CardContent className="p-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.25, 0, 1] }}
            className="space-y-8 text-center"
          >
            {/* Animated icon with effects */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.2,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              className="relative flex justify-center"
            >
              {/* Pulse effect for active states */}
              <AnimatePresence>
                {!error && syncStatus !== "completed" && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className={`absolute inset-0 h-24 w-24 rounded-full ${config.iconColor.replace("text-", "bg-").replace("dark:text-", "dark:bg-")}/10 mx-auto animate-ping`}
                  />
                )}
              </AnimatePresence>

              {/* Main icon container */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`relative h-24 w-24 rounded-full ${config.iconBg} flex items-center justify-center border ${config.borderColor} shadow-lg ${config.shadowColor}`}
              >
                <IconComponent
                  className={`h-10 w-10 ${config.iconColor} ${
                    !error && syncStatus !== "completed" ? "animate-spin" : ""
                  }`}
                />
              </motion.div>

              {/* Sparkles for completed state */}
              <AnimatePresence>
                {syncStatus === "completed" && (
                  <>
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.6, delay: 0.8 }}
                      className="absolute -top-2 -right-2"
                    >
                      <Sparkles className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0, rotate: 45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.6, delay: 1.0 }}
                      className="absolute -bottom-1 -left-1"
                    >
                      <Sparkles className="h-4 w-4 text-green-500 dark:text-green-400" />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Title and description */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.3,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="space-y-4"
            >
              <h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {getStatusText()}
              </h2>
              <p className="mx-auto max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-400">
                {getProgressText()}
              </p>
            </motion.div>

            {/* Progress metrics - only show if we have meaningful data */}
            <AnimatePresence>
              {!isInitialState && !error && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.4,
                    ease: [0.25, 0.25, 0, 1],
                  }}
                  className="mx-auto grid max-w-md grid-cols-2 gap-6"
                >
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                    className="rounded-xl border border-slate-200/50 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/60"
                  >
                    <div className="mb-2 flex items-center justify-center gap-3">
                      <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <motion.span
                        key={emailsProcessed}
                        initial={{ scale: 1.2, color: "#3b82f6" }}
                        animate={{ scale: 1, color: "inherit" }}
                        transition={{ duration: 0.3 }}
                        className="text-3xl font-bold text-blue-600 dark:text-blue-400"
                      >
                        {emailsProcessed}
                      </motion.span>
                    </div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {syncStatus === "ai_processing"
                        ? "Emails Analyzed"
                        : "Emails Scanned"}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    className="rounded-xl border border-slate-200/50 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/60"
                  >
                    <div className="mb-2 flex items-center justify-center gap-3">
                      <Search className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <motion.span
                        key={applicationsFound}
                        initial={{ scale: 1.2, color: "#10b981" }}
                        animate={{ scale: 1, color: "inherit" }}
                        transition={{ duration: 0.3 }}
                        className="text-3xl font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        {applicationsFound}
                      </motion.span>
                    </div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Applications Found
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status badge and progress info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.7,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="space-y-4"
            >
              {/* Status badge */}
              <Badge
                variant="secondary"
                className="border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm"
              >
                <Clock className="mr-1 h-3 w-3" />
                {syncStatus === "preparing"
                  ? "Preparing sync"
                  : syncStatus === "ai_first_processing"
                    ? "AI-powered scanning & analysis"
                    : syncStatus === "completed"
                      ? "Setup complete"
                      : error
                        ? "Sync failed"
                        : "Processing emails"}
              </Badge>

              {/* Progress info */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="mx-auto max-w-lg space-y-2"
              >
                <p className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  {syncStatus === "completed"
                    ? "Taking you to your dashboard..."
                    : error
                      ? "You can try again or contact support"
                      : "You can safely refresh or navigate away"}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-500">
                  {isInitialState
                    ? "Sync will begin momentarily"
                    : syncStatus === "preparing"
                      ? "The sync will start automatically once preparation is complete"
                      : syncStatus === "ai_processing"
                        ? "Applications will appear as AI analysis completes"
                        : syncStatus === "completed"
                          ? "Your job applications are ready to view"
                          : error
                            ? "Please check your connection and try again"
                            : "Progress will continue in the background"}
                </p>
              </motion.div>
            </motion.div>

            {/* Redirect countdown - only show when sync is completed and countdown is active */}
            <AnimatePresence>
              {syncStatus === "completed" &&
                redirectCountdown &&
                redirectCountdown > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.8 }}
                    transition={{ duration: 0.5, ease: [0.25, 0.25, 0, 1] }}
                    className="flex items-center justify-center gap-3 rounded-full border border-emerald-200/50 bg-emerald-100/80 px-6 py-4 backdrop-blur-sm dark:border-emerald-700/50 dark:bg-emerald-900/30"
                  >
                    <motion.div
                      key={redirectCountdown}
                      initial={{ scale: 1.2, color: "#10b981" }}
                      animate={{ scale: 1, color: "inherit" }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-200 font-bold text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300"
                    >
                      {redirectCountdown}
                    </motion.div>
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      Redirecting to dashboard...
                    </span>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* Animated progress dots - only for active states */}
            <AnimatePresence>
              {!error && syncStatus !== "completed" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.5, delay: 0.9 }}
                  className="flex justify-center space-x-2"
                >
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        duration: 0.6,
                        delay: 1.0 + i * 0.1,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                      }}
                      className={`h-2 w-2 rounded-full ${
                        syncStatus === "ai_processing"
                          ? "bg-violet-400"
                          : "bg-blue-400"
                      }`}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
