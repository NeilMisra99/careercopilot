import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  try {
    // Initialize Supabase client for auth verification
    const supabase = await createClient();

    // Verify the user's session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    // Generate state parameter for OAuth security
    const stateData = `${user.id}:${randomBytes(16).toString("hex")}`;
    const state = Buffer.from(stateData).toString("base64");

    // Persist state in secure, short-lived HttpOnly cookie so we can
    // validate it during the OAuth callback (prevents CSRF attacks)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    };

    // Build the OAuth URL
    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.append("client_id", process.env.GOOGLE_CLIENT_ID!);
    oauthUrl.searchParams.append(
      "redirect_uri",
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`,
    );
    oauthUrl.searchParams.append("response_type", "code");
    oauthUrl.searchParams.append(
      "scope",
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    );
    oauthUrl.searchParams.append("access_type", "offline");
    oauthUrl.searchParams.append("prompt", "consent");
    oauthUrl.searchParams.append("state", state);

    // Return auth URL and set CSRF cookie
    const response = NextResponse.redirect(oauthUrl);
    response.cookies.set("gmail_oauth_state", state, cookieOptions);
    return response;
  } catch (error) {
    console.error("Error initiating Gmail OAuth:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate OAuth",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
