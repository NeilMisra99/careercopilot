"use client"

import { revalidateSyncDataAction } from "@/app/(dashboard)/dashboard/_lib/actions/sync-actions"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

interface SyncSummary {
  emails_processed: number
  emails_sent_to_queue?: number
  emails_analyzed?: number
  applications_found: number
  error: string | null
  sync_type: "manual" | "scheduled"
  status?: string // 'ai_processing' | 'completed' | etc
  last_ai_processing_at?: string
  completed_at?: string
}

interface SyncState {
  inProgress: boolean
  summary: SyncSummary | null
  error: string | null
  hasIntegration: boolean
  lastCompleted: string | null
}

export function useSyncProgress(userId?: string) {
  const [syncState, setSyncState] = useState<SyncState>({
    inProgress: false,
    summary: null,
    error: null,
    hasIntegration: false,
    lastCompleted: null,
  })
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Enhanced setSyncState with logging
  const setSyncStateWithLogging = (newState: SyncState, reason: string) => {
    setSyncState(newState)
  }

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const supabase = createClient()

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
            sync_in_progress: boolean
            last_sync_summary: SyncSummary | null
            sync_error_message: string | null
            last_sync_completed_at: string | null
          }

          // Parse the JSON summary if it's a string
          let parsedSummary = integration.last_sync_summary
          if (typeof parsedSummary === "string") {
            try {
              parsedSummary = JSON.parse(parsedSummary)
            } catch (e) {
              parsedSummary = null
            }
          }

          const newState = {
            inProgress: integration.sync_in_progress || false,
            summary: parsedSummary,
            error: integration.sync_error_message,
            lastCompleted: integration.last_sync_completed_at,
            hasIntegration: true, // If we get an update, integration exists
          }

          // Check if sync just completed (was in progress, now not)
          const wasInProgress = syncState.inProgress
          const isNowComplete = !integration.sync_in_progress

          // Also check if this is a recently completed sync (within last 30 seconds)
          const lastCompleted = integration.last_sync_completed_at
            ? new Date(integration.last_sync_completed_at)
            : null
          const isRecentlyCompleted =
            lastCompleted && Date.now() - lastCompleted.getTime() < 30000 // 30 seconds

          // Check if we haven't handled this completion yet
          const hasntHandledThisCompletion =
            !syncState.lastCompleted ||
            (lastCompleted &&
              syncState.lastCompleted !== integration.last_sync_completed_at)

          // Enhanced completion detection:
          // 1. We witnessed the sync completion (wasInProgress && isNowComplete)
          // 2. OR sync completed recently and we haven't handled this completion yet
          // 3. OR sync just transitioned from in-progress to complete (even if we missed the initial state)
          const syncJustFinished =
            syncState.inProgress === true &&
            integration.sync_in_progress === false

          const shouldRevalidate =
            (wasInProgress && isNowComplete) ||
            (isNowComplete &&
              isRecentlyCompleted &&
              hasntHandledThisCompletion) ||
            syncJustFinished

          if (shouldRevalidate) {
            let reason = "unknown"
            if (wasInProgress && isNowComplete) {
              reason = "witnessed completion"
            } else if (syncJustFinished) {
              reason = "state transition detected"
            } else if (
              isNowComplete &&
              isRecentlyCompleted &&
              hasntHandledThisCompletion
            ) {
              reason = "recently completed sync detected"
            }

            // Sync just completed - revalidate cache (router refresh not needed)
            setTimeout(async () => {
              try {
                const revalidationResult = await revalidateSyncDataAction()
              } catch (error) {
                // Fallback to router refresh if revalidation fails
                router.refresh()
              }
            }, 500) // Small delay to ensure DB writes are complete
          } else {
          }

          setSyncStateWithLogging(newState, "realtime update")
        },
      )
      .subscribe()

    // Fetch initial state with delay to prevent 0-value flash
    const fetchInitialState = async () => {
      const { data, error } = await supabase
        .from("user_email_integrations")
        .select(
          "sync_in_progress, last_sync_summary, sync_error_message, last_sync_completed_at",
        )
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .single()

      if (error) {
        const newState = {
          inProgress: false,
          summary: null,
          error: null,
          hasIntegration: false,
          lastCompleted: null,
        }
        setSyncStateWithLogging(newState, "initial fetch error")
      } else if (data) {
        // Parse the JSON summary if it's a string
        let parsedSummary = data.last_sync_summary
        if (typeof parsedSummary === "string") {
          try {
            parsedSummary = JSON.parse(parsedSummary)
          } catch (e) {
            parsedSummary = null
          }
        }

        const newState = {
          inProgress: data.sync_in_progress || false,
          summary: parsedSummary,
          error: data.sync_error_message,
          lastCompleted: data.last_sync_completed_at,
          hasIntegration: true,
        }

        // Check if this is a recently completed sync on page load
        const lastCompleted = data.last_sync_completed_at
          ? new Date(data.last_sync_completed_at)
          : null
        const isRecentlyCompleted =
          lastCompleted && Date.now() - lastCompleted.getTime() < 30000 // 30 seconds
        const syncJustFinished = !data.sync_in_progress && isRecentlyCompleted

        if (syncJustFinished) {
          setTimeout(async () => {
            try {
              const revalidationResult = await revalidateSyncDataAction()
            } catch (error) {
              // Fallback to router refresh if revalidation fails
              router.refresh()
            }
          }, 1000) // Slightly longer delay for page load
        }

        setSyncStateWithLogging(newState, "initial fetch success")
      } else {
        const newState = {
          inProgress: false,
          summary: null,
          error: null,
          hasIntegration: false,
          lastCompleted: null,
        }
        setSyncStateWithLogging(newState, "initial fetch no data")
      }
    }

    fetchInitialState()

    // Add small delay before setting loading to false to prevent flash
    const timer = setTimeout(() => {
      setLoading(false)
    }, 200)

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { syncState, loading }
}
