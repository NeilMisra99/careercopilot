import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://trackflow-api.nilaanjann-misra.workers.dev"
    : "http://localhost:8787";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  console.log(`[Gmail Callback] Starting OAuth callback processing`);
  console.log(`[Gmail Callback] Code present: ${!!code}`);
  console.log(`[Gmail Callback] State present: ${!!state}`);
  console.log(`[Gmail Callback] Error: ${error || "none"}`);

  // Handle OAuth errors
  if (error) {
    console.error(`[Gmail Callback] OAuth error: ${error}`);
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/onboarding/connect-email?error=oauth_error&details=${encodeURIComponent(error)}`,
    );
  }

  // Validate required parameters
  if (!code || !state) {
    console.error(`[Gmail Callback] Missing required parameters`);
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/onboarding/connect-email?error=missing_parameters`,
    );
  }

  try {
    // Get the user's session to pass cookies to worker
    const cookieStore = await cookies();
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        `[Gmail Callback] User not authenticated:`,
        userError?.message,
      );
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/login?error=session_expired_oauth`,
      );
    }

    console.log(`[Gmail Callback] User authenticated: ${user.id}`);

    // Exchange the OAuth code via worker
    console.log(`[Gmail Callback] Calling worker to exchange OAuth code`);
    const exchangeResponse = await fetch(
      `${WORKER_URL}/api/auth/gmail/exchange`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(), // Pass session cookies to worker
        },
        body: JSON.stringify({
          code,
          state,
        }),
      },
    );

    const exchangeResult = await exchangeResponse.json();
    console.log(`[Gmail Callback] Worker exchange response:`, exchangeResult);

    if (!exchangeResponse.ok || !exchangeResult.success) {
      console.error(
        `[Gmail Callback] Worker exchange failed:`,
        exchangeResult.error,
      );
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/onboarding/connect-email?error=exchange_failed&details=${encodeURIComponent(exchangeResult.error || "Unknown error")}`,
      );
    }

    console.log(
      `[Gmail Callback] OAuth exchange successful for user ${user.id}`,
    );
    console.log(
      `[Gmail Callback] Integrated email: ${exchangeResult.userEmail}`,
    );

    // Redirect to setup page on success
    return NextResponse.redirect(
      `${requestUrl.origin}/setup?success=gmail_connected`,
    );
  } catch (error: unknown) {
    console.error(`[Gmail Callback] Unexpected error:`, error);
    let errorMessage = "An unexpected error occurred during Gmail integration";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/onboarding/connect-email?error=server_error&details=${encodeURIComponent(errorMessage)}`,
    );
  }
}
