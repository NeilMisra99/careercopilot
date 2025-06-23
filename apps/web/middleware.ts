import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "./lib/supabase/server";

interface GmailStatus {
  hasGmail: boolean;
  hasCompletedSync: boolean;
}

// Check if user has Gmail integration and sync status directly from database
async function checkGmailIntegrationStatus(): Promise<GmailStatus> {
  try {
    // Get user from the request context
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { hasGmail: false, hasCompletedSync: false };
    }

    // Check Gmail integration directly from database
    const { data: integration, error: integrationError } = await supabase
      .from("user_email_integrations")
      .select("email_address, sync_status, first_sync_completed")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .eq("sync_status", "active")
      .single();

    if (integrationError || !integration) {
      return { hasGmail: false, hasCompletedSync: false };
    }

    const hasCompletedSync = integration.first_sync_completed === true;

    return { hasGmail: true, hasCompletedSync };
  } catch (error) {
    console.error("Error checking Gmail integration status:", error);
    return { hasGmail: false, hasCompletedSync: false };
  }
}

// Helper function to check if we should skip Gmail check for certain paths
function shouldSkipGmailCheck(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/" ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/setup-test") // Allow access to test page
  );
}

// Helper function to get authenticated user
async function getAuthenticatedUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
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
  const user = await getAuthenticatedUser();
  if (!user) {
    return supabaseResponse;
  }

  // Check Gmail integration and sync status
  const { hasGmail, hasCompletedSync } = await checkGmailIntegrationStatus();

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
