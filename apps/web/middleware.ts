import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWorkerUrl } from "./lib/worker-utils";
import { createClient } from "./lib/supabase/server";

interface GmailStatus {
  hasGmail: boolean;
  hasCompletedSync: boolean;
}

// Check if user has Gmail integration and sync status
async function checkGmailIntegrationStatus(
  request: NextRequest
): Promise<GmailStatus> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const workerUrl = getWorkerUrl();

    // Check Gmail integration
    const userInfoResponse = await fetch(`${workerUrl}/api/gmail/user-info`, {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
    });

    if (!userInfoResponse.ok) {
      return { hasGmail: false, hasCompletedSync: false };
    }

    const userInfoData = await userInfoResponse.json();
    const integrationEmail = userInfoData.data?.providerEmail;

    if (!integrationEmail) {
      return { hasGmail: false, hasCompletedSync: false };
    }

    // Check sync status
    const syncStatusResponse = await fetch(
      `${workerUrl}/api/gmail/sync-status`,
      {
        headers: {
          Cookie: cookieHeader,
          "Content-Type": "application/json",
        },
      }
    );

    if (!syncStatusResponse.ok) {
      return { hasGmail: true, hasCompletedSync: false };
    }

    const syncStatusData = await syncStatusResponse.json();
    const hasCompletedSync =
      syncStatusData.integration?.firstSyncCompleted === true;

    return { hasGmail: true, hasCompletedSync };
  } catch (error) {
    return { hasGmail: false, hasCompletedSync: false };
  }
}

// Check if path should skip Gmail integration check
function shouldSkipGmailCheck(pathname: string): boolean {
  const skipPaths = ["/api/", "/auth/"];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// Get authenticated user from request
async function getAuthenticatedUser(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function middleware(request: NextRequest) {
  // Handle Supabase authentication first
  const supabaseResponse = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  // Skip Gmail check for non-dashboard routes, API routes, setup page, etc.
  if (shouldSkipGmailCheck(pathname)) {
    return supabaseResponse;
  }

  // Check authentication
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return supabaseResponse;
  }

  // Check Gmail integration and sync status
  const { hasGmail, hasCompletedSync } =
    await checkGmailIntegrationStatus(request);

  // Special handling for /setup route
  if (pathname.startsWith("/setup")) {
    // If user has completed setup, check if we should allow countdown to finish
    if (hasGmail && hasCompletedSync) {
      // Allow some time for the user to see the completion screen and countdown
      // Check if there's a "completing" query parameter to prevent immediate redirect
      const url = request.nextUrl;
      const isCompletingSync = url.searchParams.has("completing");

      // Don't redirect immediately if user is in completion flow
      if (!isCompletingSync) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }
    // Otherwise allow access to setup page
    return supabaseResponse;
  }

  // If sync has completed and user is trying to access dashboard,
  // allow them through (they've already seen the completion banner)
  if (hasGmail && hasCompletedSync && pathname.startsWith("/dashboard")) {
    return supabaseResponse;
  }

  // Redirect to setup if Gmail not connected OR sync not completed
  if (!hasGmail || !hasCompletedSync) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  // This shouldn't be reached, but fallback to allowing the request
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
