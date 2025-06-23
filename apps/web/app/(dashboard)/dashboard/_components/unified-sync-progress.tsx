"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { syncGmailNowAction } from "../_lib/actions/sync-actions";

// 🔥 UNIFIED TYPES - Single source of truth
interface UnifiedSyncState {
  // Core state
  status:
    | "idle"
    | "preparing"
    | "starting"
    | "processing"
    | "completing"
    | "completed"
    | "error";

  // Progress counters
  emailsProcessed: number;
  emailsAnalyzed: number;
  applicationsFound: number;
  emailsSentToQueue?: number;

  // Metadata
  email?: string;
  error?: string | null;
  hasIntegration: boolean;
  lastCompleted?: string | null;

  // Timing
  startedAt?: number;
  completedAt?: string;
  redirectCountdown?: number | null;
}

interface UnifiedSyncProgressProps {
  userId: string;
  integrationEmail?: string | null;
}

interface SyncSummary {
  emails_processed?: number;
  emails_analyzed?: number;
  applications_found?: number;
  status?: string;
  sync_type?: string;
}

export function UnifiedSyncProgress({
  userId,
  integrationEmail,
}: UnifiedSyncProgressProps) {
  // 🎯 SINGLE STATE - No more multiple state management
  const [syncState, setSyncState] = useState<UnifiedSyncState>({
    status: "idle",
    emailsProcessed: 0,
    emailsAnalyzed: 0,
    applicationsFound: 0,
    hasIntegration: !!integrationEmail,
    email: integrationEmail || undefined,
  });

  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // 🔥 DEDUPLICATION - Prevent duplicate API calls and state updates
  const lastFetchRef = useRef<{ timestamp: number; stateHash: string }>({
    timestamp: 0,
    stateHash: "",
  });
  const countdownStartedRef = useRef(false);
  // 🔥 NEW: Track user-initiated preparing state to prevent realtime override
  const userInitiatedPreparingRef = useRef<{ timestamp: number } | null>(null);

  // 🚀 DEBOUNCED STATE UPDATE - Prevent rapid-fire updates
  const updateSyncState = useCallback(
    (newState: Partial<UnifiedSyncState>, source: string) => {
      const now = Date.now();

      // 🔥 IMPROVED: Create more comprehensive state hash for better deduplication
      const stateHash = JSON.stringify({
        status: newState.status,
        emailsProcessed: newState.emailsProcessed,
        emailsAnalyzed: newState.emailsAnalyzed,
        applicationsFound: newState.applicationsFound,
        error: newState.error,
      });

      // 🔥 ENHANCED: Skip duplicate updates within 500ms (increased from 200ms)
      // This helps prevent race conditions from rapid database writes
      if (
        now - lastFetchRef.current.timestamp < 500 &&
        lastFetchRef.current.stateHash === stateHash
      ) {
        return;
      }

      // 🔥 NEW: Prevent realtime "idle" updates from overriding user-initiated "preparing"
      if (
        source.includes("realtime") &&
        newState.status === "idle" &&
        userInitiatedPreparingRef.current &&
        now - userInitiatedPreparingRef.current.timestamp < 10000 // 10 second grace period
      ) {
        return;
      }

      // 🔥 CLEAR: Reset user preparing flag when sync actually starts
      if (
        newState.status &&
        ["starting", "processing", "completing", "completed", "error"].includes(
          newState.status,
        )
      ) {
        userInitiatedPreparingRef.current = null;
      }

      // 🔥 SMART FILTERING: Don't allow backwards progress unless it's a reset or error
      setSyncState((prev) => {
        const shouldAllowUpdate =
          // Always allow status changes
          newState.status !== prev.status ||
          // Allow error states
          newState.error !== prev.error ||
          // Allow if no previous data
          prev.emailsProcessed === 0 ||
          // Allow if progress is moving forward
          (newState.emailsProcessed &&
            newState.emailsProcessed >= prev.emailsProcessed) ||
          // Allow if it's initial data
          source.includes("initial") ||
          // Allow completed states
          newState.status === "completed";

        if (
          !shouldAllowUpdate &&
          newState.emailsProcessed &&
          newState.emailsProcessed < prev.emailsProcessed
        ) {
          return prev; // Don't update if progress is going backwards
        }

        lastFetchRef.current = { timestamp: now, stateHash };

        const updated = { ...prev, ...newState };

        return updated;
      });
    },
    [],
  );

  // 🎯 SINGLE REALTIME SUBSCRIPTION - No more duplicate listeners
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Single subscription with smart deduplication
    const channel = supabase
      .channel(`unified-sync-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_email_integrations",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const integration = payload.new as {
            sync_in_progress: boolean;
            sync_error_message: string | null;
            last_sync_completed_at: string | null;
            last_sync_summary: SyncSummary | null;
          };

          // 🔥 SIMPLIFIED: Use database summary for ALL states (no more DO API calls)
          if (integration.sync_in_progress) {
            // Sync is active - map database status to frontend status
            const dbStatus = integration.last_sync_summary?.status;
            let frontendStatus: UnifiedSyncState["status"] = "starting";

            // Map database status to frontend status
            if (dbStatus === "preparing") frontendStatus = "preparing";
            else if (dbStatus === "starting") frontendStatus = "starting";
            else if (dbStatus === "processing") frontendStatus = "processing";
            else if (dbStatus === "completing") frontendStatus = "completing";
            else if (dbStatus === "error") frontendStatus = "error";

            updateSyncState(
              {
                status: frontendStatus,
                error: integration.sync_error_message,
                emailsProcessed:
                  integration.last_sync_summary?.emails_processed || 0,
                emailsAnalyzed:
                  integration.last_sync_summary?.emails_analyzed || 0,
                applicationsFound:
                  integration.last_sync_summary?.applications_found || 0,
              },
              "realtime-sync-active",
            );
          } else {
            // Sync not in progress - check the actual status from summary
            const dbStatus = integration.last_sync_summary?.status;

            // Only show "completed" if the status is actually "completed"
            // Otherwise, fall back to "idle" to avoid false completion states
            if (dbStatus === "completed") {
              updateSyncState(
                {
                  status: "completed",
                  error: integration.sync_error_message,
                  lastCompleted: integration.last_sync_completed_at,
                  emailsProcessed:
                    integration.last_sync_summary?.emails_processed || 0,
                  emailsAnalyzed:
                    integration.last_sync_summary?.emails_analyzed || 0,
                  applicationsFound:
                    integration.last_sync_summary?.applications_found || 0,
                },
                "realtime-completed",
              );
            } else {
              // Sync not in progress and not completed - must be idle
              updateSyncState(
                {
                  status: "idle",
                  error: integration.sync_error_message,
                  lastCompleted: integration.last_sync_completed_at,
                  emailsProcessed:
                    integration.last_sync_summary?.emails_processed || 0,
                  emailsAnalyzed:
                    integration.last_sync_summary?.emails_analyzed || 0,
                  applicationsFound:
                    integration.last_sync_summary?.applications_found || 0,
                },
                "realtime-idle",
              );
            }
          }
        },
      )
      .subscribe();

    // Initial fetch
    const initialize = async () => {
      // 🔥 CHECK URL PARAMETERS: Detect if we're in completion state on page refresh
      const isOnSetupPage =
        typeof window !== "undefined" &&
        window.location.pathname.includes("/setup");
      const hasCompletingParam =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("completing");

      // Fetch initial database state
      const { data } = await supabase
        .from("user_email_integrations")
        .select(
          "sync_in_progress, sync_error_message, last_sync_completed_at, last_sync_summary, first_sync_completed",
        )
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .single();

      if (data?.sync_in_progress) {
        // Sync is currently active - show progress from database summary
        const dbStatus = data.last_sync_summary?.status;
        let frontendStatus: UnifiedSyncState["status"] = "starting";

        // Map database status to frontend status
        if (dbStatus === "preparing") frontendStatus = "preparing";
        else if (dbStatus === "starting") frontendStatus = "starting";
        else if (dbStatus === "processing") frontendStatus = "processing";
        else if (dbStatus === "completing") frontendStatus = "completing";
        else if (dbStatus === "error") frontendStatus = "error";

        updateSyncState(
          {
            status: frontendStatus,
            error: data.sync_error_message,
            emailsProcessed: data.last_sync_summary?.emails_processed || 0,
            emailsAnalyzed: data.last_sync_summary?.emails_analyzed || 0,
            applicationsFound: data.last_sync_summary?.applications_found || 0,
          },
          "initial-active",
        );
      } else if (data?.last_sync_summary) {
        // 🔥 COMPLETION STATE DETECTION: Check if we should show completion instead of idle
        const shouldShowCompletion =
          isOnSetupPage &&
          hasCompletingParam &&
          data.first_sync_completed &&
          data.last_sync_summary.status === "completed";

        if (shouldShowCompletion) {
          // User refreshed on completion page - show completed state with countdown
          updateSyncState(
            {
              status: "completed",
              emailsProcessed: data.last_sync_summary?.emails_processed || 0,
              emailsAnalyzed: data.last_sync_summary?.emails_analyzed || 0,
              applicationsFound:
                data.last_sync_summary?.applications_found || 0,
              lastCompleted: data.last_sync_completed_at,
              error: data.sync_error_message,
            },
            "initial-completed-refresh",
          );
        } else {
          // Normal idle state
          updateSyncState(
            {
              status: "idle",
              emailsProcessed: data.last_sync_summary?.emails_processed || 0,
              emailsAnalyzed: data.last_sync_summary?.emails_analyzed || 0,
              applicationsFound:
                data.last_sync_summary?.applications_found || 0,
              lastCompleted: data.last_sync_completed_at,
              error: data.sync_error_message,
            },
            "initial-idle",
          );
        }
      }

      setLoading(false);
    };

    initialize();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, updateSyncState]);

  // 🎯 SMART COUNTDOWN LOGIC - Only when actually completed
  useEffect(() => {
    const isOnSetupPage =
      typeof window !== "undefined" &&
      window.location.pathname.includes("/setup");
    const shouldStartCountdown =
      isOnSetupPage &&
      syncState.status === "completed" &&
      !countdownStartedRef.current;

    if (shouldStartCountdown) {
      countdownStartedRef.current = true;

      // Add "completing" query parameter to prevent middleware redirect
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("completing")) {
          url.searchParams.set("completing", "true");
          window.history.replaceState({}, "", url.toString());
        }
      }

      updateSyncState({ redirectCountdown: 5 }, "countdown-start");

      const interval = setInterval(() => {
        setSyncState((prev) => {
          const newCountdown = (prev.redirectCountdown || 0) - 1;

          if (newCountdown <= 0) {
            clearInterval(interval);
            setTimeout(() => router.push("/dashboard"), 0);
            return prev;
          }

          return { ...prev, redirectCountdown: newCountdown };
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [syncState.status, router, updateSyncState]);

  // 🚀 SYNC INITIATION - Single handler
  const handleStartSync = async () => {
    // 🔥 NEW: Mark this as a user-initiated preparing state
    userInitiatedPreparingRef.current = { timestamp: Date.now() };

    updateSyncState({ status: "preparing" }, "button-click");

    try {
      const result = await syncGmailNowAction();
      if (result.success) {
        toast.success("Sync started!", {
          description:
            "Your emails are being processed. This may take a moment to begin...",
          duration: 4000,
        });
        updateSyncState({ status: "starting" }, "sync-initiated");
      } else {
        // Clear the user preparing flag on error
        userInitiatedPreparingRef.current = null;
        toast.error("Sync failed", {
          description: result.error || "Unknown error occurred",
        });
        updateSyncState(
          { status: "error", error: result.error },
          "sync-failed",
        );
      }
    } catch {
      // Clear the user preparing flag on error
      userInitiatedPreparingRef.current = null;
      toast.error("Network error", {
        description: "Failed to start sync. Please try again.",
      });
      updateSyncState(
        { status: "error", error: "Network error" },
        "network-error",
      );
    }
  };

  // 🎨 RENDER LOGIC - Single component with beautiful UI
  if (loading) {
    return <LoadingView />;
  }

  // Route to appropriate view based on status
  switch (syncState.status) {
    case "idle":
      return <IdleView email={syncState.email} onStartSync={handleStartSync} />;

    case "preparing":
    case "starting":
      return <PreparingView state={syncState} />;

    case "processing":
      return <ProcessingView state={syncState} />;

    case "completing":
    case "completed":
      return <CompletedView state={syncState} />;

    case "error":
      return <ErrorView state={syncState} onRetry={handleStartSync} />;

    default:
      return <IdleView email={syncState.email} onStartSync={handleStartSync} />;
  }
}

// 🎨 BEAUTIFUL VIEW COMPONENTS - Upgraded with polished UI

function LoadingView() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex min-h-[400px] items-center justify-center px-4"
    >
      <Card className="w-full max-w-2xl border-slate-200/60 bg-gradient-to-br from-slate-50/90 via-gray-50/40 to-slate-50/30 shadow-xl shadow-slate-200/20 dark:border-slate-700/60 dark:from-slate-800/90 dark:via-gray-800/40 dark:to-slate-800/30 dark:shadow-slate-900/40">
        <CardContent className="flex min-h-[400px] items-center justify-center">
          <div className="space-y-4 text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400" />
            <div className="h-4 w-48 animate-pulse rounded-lg bg-gradient-to-r from-slate-200 to-gray-200 dark:from-slate-700 dark:to-gray-700" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function IdleView({
  email,
  onStartSync,
}: {
  email?: string;
  onStartSync: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: [0.25, 0.25, 0, 1] }}
      className="flex min-h-[400px] items-center justify-center px-4"
    >
      <Card className="w-full max-w-2xl border-emerald-200/60 bg-gradient-to-br from-emerald-50/90 via-green-50/40 to-teal-50/30 shadow-xl shadow-emerald-200/20 dark:border-emerald-700/60 dark:from-emerald-900/90 dark:via-green-900/40 dark:to-teal-900/30 dark:shadow-emerald-900/40">
        <CardContent className="p-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.25, 0, 1] }}
            className="space-y-8 text-center"
          >
            {/* Animated icon with pulse effect */}
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
              {/* Subtle pulse effect */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="absolute inset-0 mx-auto h-24 w-24 animate-pulse rounded-full bg-emerald-400/10"
              />

              {/* Main icon container */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative flex h-24 w-24 items-center justify-center rounded-full border border-emerald-200/50 bg-gradient-to-br from-emerald-100 to-green-100 shadow-lg shadow-emerald-200/20 dark:border-emerald-700/50 dark:from-emerald-800 dark:to-green-800 dark:shadow-emerald-900/40"
              >
                <Mail className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </motion.div>

              {/* Sparkle decorations */}
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
                {email ? "Ready to Discover Jobs!" : "Connect Your Gmail"}
              </h2>
              <p className="mx-auto max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-400">
                {email
                  ? `We'll analyze your Gmail inbox (${email}) to automatically discover and track job applications using AI-powered email analysis.`
                  : "Connect your Gmail account to automatically discover job applications from your email history using advanced AI analysis."}
              </p>
            </motion.div>

            {/* Feature highlights */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.4,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="mx-auto grid max-w-md grid-cols-2 gap-4"
            >
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="rounded-xl border border-emerald-200/50 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-emerald-700/50 dark:bg-emerald-800/60"
              >
                <div className="flex items-center justify-center gap-2">
                  <Brain className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    AI-Powered
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  Smart email analysis
                </p>
              </motion.div>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="rounded-xl border border-emerald-200/50 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-emerald-700/50 dark:bg-emerald-800/60"
              >
                <div className="flex items-center justify-center gap-2">
                  <Search className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Auto-Discovery
                  </span>
                </div>
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Find hidden applications
                </p>
              </motion.div>
            </motion.div>

            {/* Start button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.7,
                ease: [0.25, 0.25, 0, 1],
              }}
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onStartSync}
                  size="lg"
                  className="border-0 bg-gradient-to-r from-emerald-600 to-green-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-emerald-200/25 hover:from-emerald-700 hover:to-green-700 dark:from-emerald-700 dark:to-green-700 dark:shadow-emerald-900/40 dark:hover:from-emerald-600 dark:hover:to-green-600"
                >
                  <Mail className="mr-3 h-6 w-6" />
                  {email ? "Start Scanning Emails" : "Connect Gmail Account"}
                </Button>
              </motion.div>
            </motion.div>

            {/* Additional info */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                <span>
                  {email
                    ? "Your Gmail connection is secure and ready"
                    : "Secure OAuth 2.0 authentication"}
                </span>
              </div>

              <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-500">
                {email
                  ? "We'll analyze your recent emails to discover job applications and interview requests."
                  : "We only read job-related emails and never store your email content. You can disconnect at any time."}
              </p>
            </motion.div>

            {/* Animated progress dots for visual appeal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
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
                  className="h-2 w-2 rounded-full bg-emerald-400/60"
                />
              ))}
            </motion.div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PreparingView({ state }: { state: UnifiedSyncState }) {
  return (
    <SyncProgressViewComponent
      emailsProcessed={state.emailsProcessed}
      applicationsFound={state.applicationsFound}
      error={state.error}
      syncStatus="preparing"
      redirectCountdown={state.redirectCountdown}
    />
  );
}

function ProcessingView({ state }: { state: UnifiedSyncState }) {
  return (
    <SyncProgressViewComponent
      emailsProcessed={state.emailsProcessed}
      applicationsFound={state.applicationsFound}
      error={state.error}
      syncStatus="processing"
      redirectCountdown={state.redirectCountdown}
    />
  );
}

function CompletedView({ state }: { state: UnifiedSyncState }) {
  return (
    <SyncProgressViewComponent
      emailsProcessed={state.emailsProcessed}
      applicationsFound={state.applicationsFound}
      error={state.error}
      syncStatus="completed"
      redirectCountdown={state.redirectCountdown}
    />
  );
}

function ErrorView({
  state,
  onRetry,
}: {
  state: UnifiedSyncState;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex min-h-[400px] items-center justify-center px-4"
    >
      <Card className="w-full max-w-2xl border-red-200/60 bg-gradient-to-br from-red-50/90 via-rose-50/40 to-pink-50/30 shadow-xl shadow-red-200/20 dark:border-red-700/60 dark:from-red-900/90 dark:via-rose-900/40 dark:to-pink-900/30 dark:shadow-red-900/40">
        <CardContent className="space-y-8 p-12 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex justify-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-200/50 bg-gradient-to-br from-red-100 to-rose-100 dark:border-red-700/50 dark:from-red-800 dark:to-rose-800">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="space-y-4"
          >
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Sync Error
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {state.error || "Something went wrong during the sync process."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Button
              onClick={onRetry}
              size="lg"
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              <RefreshCw className="mr-2 h-5 w-5" />
              Try Again
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// 🎨 MAIN SYNC PROGRESS COMPONENT - Beautiful animated UI
function SyncProgressViewComponent({
  emailsProcessed,
  applicationsFound,
  error,
  syncStatus,
  redirectCountdown,
}: {
  emailsProcessed: number;
  applicationsFound: number;
  error?: string | null;
  syncStatus?: string;
  redirectCountdown?: number | null;
}) {
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

    if (syncStatus === "processing") {
      return "Scanning & Analyzing...";
    }

    if (syncStatus === "preparing" || syncStatus === "starting") {
      return "Preparing Your Sync";
    }

    // If we don't have a specific status but sync seems to be starting
    if (!syncStatus && (emailsProcessed > 0 || applicationsFound > 0)) {
      return "Scanning & Analyzing...";
    }

    return "Preparing Your Sync";
  };

  const getProgressText = () => {
    if (error) {
      return "We encountered an issue while processing your emails. Our team has been notified and will help resolve this.";
    }

    if (syncStatus === "completed") {
      return "Your emails have been successfully analyzed and job applications discovered. Redirecting to your dashboard...";
    }

    if (syncStatus === "processing") {
      return `${emailsProcessed} emails scanned with AI • ${applicationsFound} applications found`;
    }

    if (syncStatus === "preparing" || syncStatus === "starting") {
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

    if (syncStatus === "processing") {
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

            {/* Progress metrics - only show if we have meaningful data and not in preparation phase */}
            <AnimatePresence>
              {!isInitialState &&
                !error &&
                syncStatus !== "preparing" &&
                syncStatus !== "starting" && (
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
                        {syncStatus === "processing"
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
                className="border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Clock className="mr-1 h-3 w-3" />
                {syncStatus === "preparing" || syncStatus === "starting"
                  ? "Preparing sync"
                  : syncStatus === "processing"
                    ? "AI-powered scanning & analysis"
                    : syncStatus === "completed"
                      ? "Setup complete"
                      : error
                        ? "Sync failed"
                        : "Preparing sync"}
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
                    : syncStatus === "preparing" || syncStatus === "starting"
                      ? "The sync will start automatically once preparation is complete"
                      : syncStatus === "processing"
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
                        syncStatus === "processing"
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
