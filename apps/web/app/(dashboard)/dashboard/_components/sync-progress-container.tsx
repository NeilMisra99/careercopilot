"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useSyncProgress } from "@/hooks/use-sync-progress";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FirstTimeSyncBanner } from "./first-time-sync-banner";
import { SyncProgressView } from "./sync-progress-view";

interface SyncProgressContainerProps {
  userId: string;
  integrationEmail?: string | null;
}

export function SyncProgressContainer({
  userId,
  integrationEmail,
}: SyncProgressContainerProps) {
  const { syncState, loading } = useSyncProgress(userId);
  const [isPreparingSync, setIsPreparingSync] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null,
  );
  const countdownStartedRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Determine if sync is preparing based on database state
  const isPreparing =
    syncState.summary?.status === "preparing" || isPreparingSync;

  // Reset preparing state when actual sync starts (ai_first_processing)
  useEffect(() => {
    if (
      isPreparingSync &&
      syncState.summary &&
      (syncState.summary.status === "ai_first_processing" ||
        syncState.summary.status === "completed")
    ) {
      setIsPreparingSync(false);
    }
  }, [isPreparingSync, syncState.summary]);

  // Check if we should start countdown (separate from the actual countdown logic)
  useEffect(() => {
    const isOnSetupPage =
      typeof window !== "undefined" &&
      window.location.pathname.includes("/setup");

    const isSyncCompleted =
      !syncState.inProgress &&
      syncState.summary &&
      syncState.summary.status === "completed";

    // Check if we're in a completing state from URL parameter (page refresh scenario)
    const isCompletingFromUrl = searchParams.get("completing") === "true";

    // Determine if we should start countdown
    const shouldStartCountdown =
      isOnSetupPage &&
      !countdownStartedRef.current &&
      (isSyncCompleted ||
        (isCompletingFromUrl && !loading && syncState.summary));

    if (shouldStartCountdown) {
      console.log("Starting countdown - conditions:", {
        isOnSetupPage,
        countdownStarted: countdownStartedRef.current,
        isSyncCompleted,
        isCompletingFromUrl,
        loading,
        hasSummary: !!syncState.summary,
      });

      // Mark countdown as started to prevent multiple timers
      countdownStartedRef.current = true;

      // Add "completing" query parameter to prevent middleware redirect
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("completing")) {
          url.searchParams.set("completing", "true");
          window.history.replaceState({}, "", url.toString());
        }
      }

      // Start countdown from 5 seconds
      setRedirectCountdown(5);
    } else if (!isSyncCompleted && !isCompletingFromUrl) {
      // Reset the countdown started flag if sync is not completed and we're not in completing state
      countdownStartedRef.current = false;
      setRedirectCountdown(null);
    }
  }, [
    syncState.inProgress,
    syncState.summary?.status,
    syncState.summary,
    searchParams,
    loading,
  ]);

  // Separate effect for countdown timer logic
  useEffect(() => {
    if (redirectCountdown && redirectCountdown > 0) {
      console.log("Countdown active:", redirectCountdown);

      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
          const newValue = prev === null || prev <= 1 ? 0 : prev - 1;
          console.log("Countdown updating:", prev, "->", newValue);
          return newValue;
        });
      }, 1000);

      return () => {
        console.log("Clearing countdown interval");
        clearInterval(countdownInterval);
      };
    }
  }, [redirectCountdown]);

  // Separate effect to handle redirect when countdown reaches 0
  useEffect(() => {
    if (redirectCountdown === 0) {
      console.log("Countdown reached 0, redirecting to dashboard");

      // Remove the "completing" query parameter before redirecting
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("completing");
        window.history.replaceState({}, "", url.toString());
      }

      router.push("/dashboard");
    }
  }, [redirectCountdown, router]);

  const handleSyncInitiated = () => {
    setIsPreparingSync(true);
  };

  // Show loading state to prevent flash
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <Card className="w-full max-w-2xl border-slate-200/60 bg-gradient-to-br from-slate-50/90 via-gray-50/40 to-slate-50/30 shadow-xl shadow-slate-200/20 dark:border-slate-700/60 dark:from-slate-900/90 dark:via-slate-800/40 dark:to-slate-700/30 dark:shadow-slate-900/40">
          <CardContent className="flex min-h-[400px] items-center justify-center">
            <div className="space-y-6 text-center">
              <div className="mx-auto h-12 w-48 animate-pulse rounded-lg bg-gradient-to-r from-slate-200 to-gray-200 dark:from-slate-700 dark:to-slate-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show sync progress if:
  // 1. Sync is currently in progress with data, OR
  // 2. Sync has completed and we have summary data to show
  // 3. OR sync is preparing
  // 4. OR we're in completing state from URL parameter (for refresh scenarios)
  const isCompletingFromUrl = searchParams.get("completing") === "true";
  const shouldShowProgress =
    (syncState.inProgress && syncState.summary) ||
    (!syncState.inProgress && syncState.summary) ||
    isPreparing ||
    (isCompletingFromUrl && syncState.summary);

  // Create animation key based on sync status for smooth transitions
  const syncStatus =
    syncState.summary?.status || (isPreparing ? "preparing" : undefined);
  const animationKey = syncState.error ? "error" : syncStatus || "initial";

  if (shouldShowProgress && (syncState.summary || isPreparing)) {
    return (
      <SyncProgressView
        key={animationKey}
        emailsProcessed={syncState.summary?.emails_processed || 0}
        applicationsFound={syncState.summary?.applications_found || 0}
        email={integrationEmail || undefined}
        error={syncState.error}
        syncStatus={syncStatus}
        emailsSentToQueue={syncState.summary?.emails_sent_to_queue}
        emailsAnalyzed={syncState.summary?.emails_analyzed}
        redirectCountdown={redirectCountdown}
      />
    );
  }

  // Show FirstTimeSyncBanner for first-time users or when no sync is happening
  return (
    <FirstTimeSyncBanner
      key={animationKey}
      integrationEmail={integrationEmail}
      userId={userId}
      isPreparingSync={isPreparing}
      onSyncInitiated={handleSyncInitiated}
    />
  );
}
