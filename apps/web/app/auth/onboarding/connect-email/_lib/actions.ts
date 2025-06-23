"use server";

import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export async function initiateGmailOAuth() {
  try {
    // Initialize Supabase client for auth verification
    const supabase = await createClient();

    // Verify the user's session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Invalid or expired token",
      };
    }

    // Generate state parameter for OAuth security
    const stateData = `${user.id}:${randomBytes(16).toString("hex")}`;
    const state = Buffer.from(stateData).toString("base64");

    // Construct the base URL for the redirect URI
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    // Build the OAuth URL
    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.append("client_id", process.env.GOOGLE_CLIENT_ID!);
    oauthUrl.searchParams.append(
      "redirect_uri",
      `${baseUrl}/api/auth/gmail/callback`,
    );
    oauthUrl.searchParams.append("response_type", "code");
    oauthUrl.searchParams.append(
      "scope",
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    );
    oauthUrl.searchParams.append("access_type", "offline");
    oauthUrl.searchParams.append("prompt", "consent select_account");
    oauthUrl.searchParams.append("state", state);

    return {
      success: true,
      authorizeUrl: oauthUrl.toString(),
    };
  } catch (error) {
    console.error("Error initiating Gmail OAuth:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while trying to connect.",
    };
  }
}
