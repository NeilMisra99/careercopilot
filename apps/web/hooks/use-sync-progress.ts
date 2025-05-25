"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { revalidateSyncDataAction } from "@/app/(dashboard)/dashboard/_lib/actions/sync-actions";

interface SyncSummary {
  emails_processed: number;
  emails_sent_to_queue?: number;
  emails_analyzed?: number;
  applications_found: number;
  error: string | null;
  sync_type: "manual" | "scheduled";
  status?: string; // 'ai_processing' | 'completed' | etc
  last_ai_processing_at?: string;
  completed_at?: string;
}

interface SyncState {
  inProgress: boolean;
  summary: SyncSummary | null;
  error: string | null;
  hasIntegration: boolean;
  lastCompleted: string | null;
}

export function useSyncProgress(userId?: string) {
  const [syncState, setSyncState] = useState<SyncState>({
    inProgress: false,
    summary: null,
    error: null,
    hasIntegration: false,
    lastCompleted: null,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Subscribe to realtime changes - use unique channel name to avoid conflicts
    const channel = supabase
      .channel(`sync-progress-${Math.random().toString(36).substr(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_email_integrations",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const integration = payload.new as {
            sync_in_progress: boolean;
            last_sync_summary: SyncSummary | null;
            sync_error_message: string | null;
            last_sync_completed_at: string | null;
          };

          // Parse the JSON summary if it's a string
          let parsedSummary = integration.last_sync_summary;
          if (typeof parsedSummary === "string") {
            try {
              parsedSummary = JSON.parse(parsedSummary);
            } catch (e) {
              console.error("Failed to parse realtime JSON summary:", e);
              parsedSummary = null;
            }
          }

          const newState = {
            inProgress: integration.sync_in_progress || false,
            summary: parsedSummary,
            error: integration.sync_error_message,
            lastCompleted: integration.last_sync_completed_at,
            hasIntegration: true, // If we get an update, integration exists
          };

          // Check if sync just completed (was in progress, now not)
          const wasInProgress = syncState.inProgress;
          const isNowComplete = !integration.sync_in_progress;

          // Also check if this is a recently completed sync (within last 30 seconds)
          const lastCompleted = integration.last_sync_completed_at
            ? new Date(integration.last_sync_completed_at)
            : null;
          const isRecentlyCompleted =
            lastCompleted && Date.now() - lastCompleted.getTime() < 30000; // 30 seconds

          // Check if we haven't handled this completion yet
          const hasntHandledThisCompletion =
            !syncState.lastCompleted ||
            (lastCompleted &&
              syncState.lastCompleted !== integration.last_sync_completed_at);

          console.log("[SYNC PROGRESS] Realtime update received:", {
            wasInProgress,
            isNowComplete,
            isRecentlyCompleted,
            hasntHandledThisCompletion,
            lastCompleted: lastCompleted?.toISOString(),
            syncState_lastCompleted: syncState.lastCompleted,
            integration_lastCompleted: integration.last_sync_completed_at,
            currentSyncState: syncState,
            integration_sync_in_progress: integration.sync_in_progress,
            summary: integration.last_sync_summary,
          });

          // Enhanced completion detection:
          // 1. We witnessed the sync completion (wasInProgress && isNowComplete)
          // 2. OR sync completed recently and we haven't handled this completion yet
          // 3. OR sync just transitioned from in-progress to complete (even if we missed the initial state)
          const syncJustFinished =
            syncState.inProgress === true &&
            integration.sync_in_progress === false;

          const shouldRevalidate =
            (wasInProgress && isNowComplete) ||
            (isNowComplete &&
              isRecentlyCompleted &&
              hasntHandledThisCompletion) ||
            syncJustFinished;

          if (shouldRevalidate) {
            let reason = "unknown";
            if (wasInProgress && isNowComplete) {
              reason = "witnessed completion";
            } else if (syncJustFinished) {
              reason = "state transition detected";
            } else if (
              isNowComplete &&
              isRecentlyCompleted &&
              hasntHandledThisCompletion
            ) {
              reason = "recently completed sync detected";
            }

            console.log(
              `[SYNC PROGRESS] 🎉 Sync completion detected (${reason})! Starting cache revalidation...`
            );
            // Sync just completed - revalidate cache (router refresh not needed)
            setTimeout(async () => {
              try {
                console.log(
                  "[SYNC PROGRESS] Calling revalidateSyncDataAction..."
                );
                const revalidationResult = await revalidateSyncDataAction();
                console.log(
                  "[SYNC PROGRESS] Revalidation result:",
                  revalidationResult
                );
                console.log(
                  "[SYNC PROGRESS] Cache revalidation completed - fresh data will be fetched automatically"
                );
              } catch (error) {
                console.error(
                  "[SYNC PROGRESS] Error revalidating cache after sync:",
                  error
                );
                console.log(
                  "[SYNC PROGRESS] Falling back to router refresh..."
                );
                // Fallback to router refresh if revalidation fails
                router.refresh();
              }
            }, 500); // Small delay to ensure DB writes are complete
          } else {
            console.log("[SYNC PROGRESS] Sync completion NOT detected:", {
              wasInProgress,
              isNowComplete,
              isRecentlyCompleted,
              hasntHandledThisCompletion,
              syncJustFinished,
              reason: !wasInProgress
                ? "wasn't in progress initially"
                : !isNowComplete
                  ? "still in progress"
                  : !isRecentlyCompleted
                    ? "not recently completed"
                    : !hasntHandledThisCompletion
                      ? "already handled this completion"
                      : "unknown",
            });
          }

          setSyncState(newState);
        }
      )
      .subscribe();

    // Fetch initial state with delay to prevent 0-value flash
    const fetchInitialState = async () => {
      const { data, error } = await supabase
        .from("user_email_integrations")
        .select(
          "sync_in_progress, last_sync_summary, sync_error_message, last_sync_completed_at"
        )
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .single();

      if (error) {
        const newState = {
          inProgress: false,
          summary: null,
          error: null,
          hasIntegration: false,
          lastCompleted: null,
        };
        setSyncState(newState);
      } else if (data) {
        // Parse the JSON summary if it's a string
        let parsedSummary = data.last_sync_summary;
        if (typeof parsedSummary === "string") {
          try {
            parsedSummary = JSON.parse(parsedSummary);
          } catch (e) {
            console.error("Failed to parse initial JSON summary:", e);
            parsedSummary = null;
          }
        }

        const newState = {
          inProgress: data.sync_in_progress || false,
          summary: parsedSummary,
          error: data.sync_error_message,
          lastCompleted: data.last_sync_completed_at,
          hasIntegration: true,
        };

        console.log("[SYNC PROGRESS] Initial state loaded:", {
          newState,
          rawData: data,
          sync_in_progress_value: data.sync_in_progress,
          sync_in_progress_type: typeof data.sync_in_progress,
        });

        // Check if this is a recently completed sync on page load
        const lastCompleted = data.last_sync_completed_at
          ? new Date(data.last_sync_completed_at)
          : null;
        const isRecentlyCompleted =
          lastCompleted && Date.now() - lastCompleted.getTime() < 30000; // 30 seconds
        const syncJustFinished = !data.sync_in_progress && isRecentlyCompleted;

        if (syncJustFinished) {
          console.log(
            "[SYNC PROGRESS] 🎉 Recently completed sync detected on page load! Triggering cache revalidation..."
          );
          setTimeout(async () => {
            try {
              const revalidationResult = await revalidateSyncDataAction();
              console.log(
                "[SYNC PROGRESS] Page load revalidation result:",
                revalidationResult
              );
              console.log(
                "[SYNC PROGRESS] Page load cache revalidation completed"
              );
            } catch (error) {
              console.error(
                "[SYNC PROGRESS] Error revalidating cache on page load:",
                error
              );
              // Fallback to router refresh if revalidation fails
              router.refresh();
            }
          }, 1000); // Slightly longer delay for page load
        }

        setSyncState(newState);
      } else {
        const newState = {
          inProgress: false,
          summary: null,
          error: null,
          hasIntegration: false,
          lastCompleted: null,
        };
        setSyncState(newState);
      }
    };

    fetchInitialState();

    // Add small delay before setting loading to false to prevent flash
    const timer = setTimeout(() => {
      setLoading(false);
    }, 200);

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { syncState, loading };
}
