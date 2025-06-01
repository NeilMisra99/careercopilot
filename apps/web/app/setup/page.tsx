import { FirstTimeSyncBanner } from "@/app/(dashboard)/dashboard/_components/first-time-sync-banner"
import { SyncProgressContainer } from "@/app/(dashboard)/dashboard/_components/sync-progress-container"
import { createClient } from "@/lib/supabase/server"
import { getWorkerUrl } from "@/lib/worker-utils"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AnimatedSetupPageWrapper } from "./animated-setup-wrapper"

// Check if user has Gmail integration AND completed first-time sync
async function getGmailIntegrationAndSyncStatus(accessToken: string) {
  try {
    const workerUrl = getWorkerUrl()

    // Check Gmail integration
    const userInfoResponse = await fetch(`${workerUrl}/api/gmail/user-info`, {
      headers: {
        Cookie: accessToken,
      },
    })

    if (!userInfoResponse.ok) {
      return {
        hasGmail: false,
        hasCompletedSync: false,
        integrationEmail: null,
      }
    }

    const userInfoData = await userInfoResponse.json()
    const integrationEmail = userInfoData.data?.providerEmail

    // Check sync status to see if user has completed first sync
    const syncStatusResponse = await fetch(
      `${workerUrl}/api/gmail/sync-status`,
      {
        headers: {
          Cookie: accessToken,
        },
      },
    )

    if (!syncStatusResponse.ok) {
      return { hasGmail: true, hasCompletedSync: false, integrationEmail }
    }

    const syncStatusData = await syncStatusResponse.json()
    const hasCompletedSync = syncStatusData.integration?.firstSyncCompleted

    return {
      hasGmail: true,
      hasCompletedSync: !!hasCompletedSync,
      integrationEmail,
    }
  } catch (error) {
    return { hasGmail: false, hasCompletedSync: false, integrationEmail: null }
  }
}

export default async function SetupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login?message=Please log in to access the setup page.")
  }

  const cookieStore = await cookies()
  const accessToken = cookieStore.toString()

  const { hasGmail, hasCompletedSync, integrationEmail } =
    await getGmailIntegrationAndSyncStatus(accessToken)

  // Note: We no longer redirect immediately when sync is completed
  // Instead, let the client-side components handle the completion banner and countdown

  return (
    <AnimatedSetupPageWrapper>
      <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-4xl">
          {hasGmail ? (
            <SyncProgressContainer
              userId={user.id}
              integrationEmail={integrationEmail}
            />
          ) : (
            <FirstTimeSyncBanner
              integrationEmail={integrationEmail}
              userId={user.id}
            />
          )}
        </div>
      </div>
    </AnimatedSetupPageWrapper>
  )
}
