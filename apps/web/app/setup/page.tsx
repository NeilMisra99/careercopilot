import { FirstTimeSyncBanner } from "@/app/(dashboard)/dashboard/_components/first-time-sync-banner";
import { SyncProgressContainer } from "@/app/(dashboard)/dashboard/_components/sync-progress-container";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AnimatedSetupPageWrapper } from "./animated-setup-wrapper";

// Check if user has Gmail integration AND completed first-time sync
async function getGmailIntegrationAndSyncStatus(accessToken: string) {
  try {
    const workerUrl = getWorkerUrl();

    // Check Gmail integration
    const userInfoResponse = await fetch(`${workerUrl}/api/gmail/user-info`, {
      headers: {
        Cookie: accessToken,
      },
    });

    if (!userInfoResponse.ok) {
      return {
        hasGmail: false,
        hasCompletedSync: false,
        integrationEmail: null,
      };
    }

    const userInfoData = await userInfoResponse.json();
    const integrationEmail = userInfoData.data?.providerEmail;

    // Check sync status to see if user has completed first sync
    const syncStatusResponse = await fetch(
      `${workerUrl}/api/gmail/sync-status`,
      {
        headers: {
          Cookie: accessToken,
        },
      },
    );

    if (!syncStatusResponse.ok) {
      return { hasGmail: true, hasCompletedSync: false, integrationEmail };
    }

    const syncStatusData = await syncStatusResponse.json();
    const hasCompletedSync = syncStatusData.integration?.firstSyncCompleted;

    return {
      hasGmail: true,
      hasCompletedSync: !!hasCompletedSync,
      integrationEmail,
    };
  } catch {
    return { hasGmail: false, hasCompletedSync: false, integrationEmail: null };
  }
}

// Loading component for Suspense fallback
function SetupPageLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200/60 bg-gradient-to-br from-slate-50/90 via-gray-50/40 to-slate-50/30 p-12 shadow-xl shadow-slate-200/20 dark:border-slate-700/60 dark:from-slate-900/90 dark:via-slate-800/40 dark:to-slate-700/30 dark:shadow-slate-900/40">
        <div className="space-y-6 text-center">
          <div className="mx-auto h-12 w-48 animate-pulse rounded-lg bg-gradient-to-r from-slate-200 to-gray-200 dark:from-slate-700 dark:to-slate-600" />
        </div>
      </div>
    </div>
  );
}

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?message=Please log in to access the setup page.");
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.toString();

  const { hasGmail, integrationEmail } =
    await getGmailIntegrationAndSyncStatus(accessToken);

  // Note: We no longer redirect immediately when sync is completed
  // Instead, let the client-side components handle the completion banner and countdown

  return (
    <AnimatedSetupPageWrapper>
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-4xl">
          {hasGmail ? (
            <Suspense fallback={<SetupPageLoading />}>
              <SyncProgressContainer
                userId={user.id}
                integrationEmail={integrationEmail}
              />
            </Suspense>
          ) : (
            <FirstTimeSyncBanner
              integrationEmail={integrationEmail}
              userId={user.id}
            />
          )}
        </div>
      </div>
    </AnimatedSetupPageWrapper>
  );
}
