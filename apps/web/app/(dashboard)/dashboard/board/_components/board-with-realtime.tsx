"use client"

import { useSyncProgress } from "@/hooks/use-sync-progress"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { FirstTimeSyncBanner } from "../../_components/first-time-sync-banner"
import { SyncProgressView } from "../../_components/sync-progress-view"

export function BoardWithRealtime() {
  const [userId, setUserId] = useState<string | null>(null)
  const { syncState, loading } = useSyncProgress(userId || undefined)

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUserId(user?.id || null)
    }

    getUser()
  }, [])

  if (loading || !userId) {
    return null // Let parent handle loading state
  }

  // Show sync progress if currently syncing - but only if we have meaningful progress data
  if (syncState.inProgress) {
    // Only show progress view if we have actual summary data to prevent 0-flash on refresh
    if (
      syncState.summary &&
      (syncState.summary.emails_processed > 0 ||
        syncState.summary.applications_found > 0 ||
        (syncState.summary.emails_sent_to_queue &&
          syncState.summary.emails_sent_to_queue > 0))
    ) {
      return (
        <SyncProgressView
          emailsProcessed={syncState.summary.emails_processed}
          applicationsFound={syncState.summary.applications_found}
          syncStatus={syncState.summary.status}
          emailsSentToQueue={syncState.summary.emails_sent_to_queue}
          emailsAnalyzed={syncState.summary.emails_analyzed}
          error={syncState.error}
        />
      )
    }

    // Return null to let parent handle loading state until we have real data
    return null
  }

  // Show first-time sync banner if no integration or no sync history
  if (!syncState.hasIntegration || !syncState.lastCompleted) {
    return <FirstTimeSyncBanner />
  }

  // Return null when not syncing - let parent show normal content
  return null
}
