import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Import proper encryption functions that match Trigger.dev expectations
async function getKeyMaterial(secretKeyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyDataBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(secretKeyString),
  );
  return crypto.subtle.importKey(
    "raw",
    keyDataBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(token: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedToken = new TextEncoder().encode(token);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedToken,
  );

  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const encryptedHex = Array.from(new Uint8Array(encryptedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${ivHex}:${encryptedHex}`;
}

async function encryptTokenWithEnvKey(token: string): Promise<string> {
  const secretKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secretKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required");
  }
  const key = await getKeyMaterial(secretKey);
  return encryptToken(token, key);
}

// Initialize Supabase client with service role for admin operations
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Retrieve stored state from secure cookie
    const cookieState = request.cookies.get("gmail_oauth_state")?.value;

    // Validate state parameter against cookie to mitigate CSRF attacks
    if (!state || !cookieState || state !== cookieState) {
      console.error("CSRF state validation failed", {
        state_from_param: state,
        state_from_cookie: cookieState,
      });
      // Clear potentially stale cookie
      const redirectResp = NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=invalid_state`,
      );
      redirectResp.cookies.set("gmail_oauth_state", "", {
        path: "/",
        maxAge: 0,
      });
      return redirectResp;
    }

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=oauth_error&details=${encodeURIComponent(error)}`,
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=missing_parameters`,
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=token_exchange_failed`,
      );
    }

    const tokens = await tokenResponse.json();

    // Get user info from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      console.error("Failed to get user info from Google");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=user_info_failed`,
      );
    }

    const userInfo = await userInfoResponse.json();

    // State validated – extract userId (encoded as "userId:nonce" before base64)
    let userId: string;
    try {
      // Decode the base64 state first
      const decodedState = Buffer.from(state, "base64").toString("utf-8");
      userId = decodedState.split(":")[0];
    } catch (decodeError) {
      console.error("Failed to decode state:", decodeError);
      const resp = NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=invalid_state`,
      );
      resp.cookies.set("gmail_oauth_state", "", { path: "/", maxAge: 0 });
      return resp;
    }

    if (!userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=invalid_state`,
      );
    }

    // Encrypt tokens (basic implementation - in production, use proper encryption)
    const accessTokenEncrypted = await encryptTokenWithEnvKey(
      tokens.access_token,
    );
    const refreshTokenEncrypted = tokens.refresh_token
      ? await encryptTokenWithEnvKey(tokens.refresh_token)
      : null;

    // Calculate expiry time
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000,
    ).toISOString();

    // Save integration to database
    const { data: existingIntegration } = await supabaseAdmin
      .from("user_email_integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("email_address", userInfo.email)
      .eq("provider", "gmail")
      .single();

    if (existingIntegration) {
      // Update existing integration
      const { error: updateError } = await supabaseAdmin
        .from("user_email_integrations")
        .update({
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          access_token_expires_at: expiresAt,
          scopes: tokens.scope?.split(" ") || [],
          sync_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id);

      if (updateError) {
        console.error("Failed to update integration:", updateError);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=database_error`,
        );
      }
    } else {
      // Create new integration
      const { error: insertError } = await supabaseAdmin
        .from("user_email_integrations")
        .insert({
          user_id: userId,
          email_address: userInfo.email,
          provider: "gmail",
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          access_token_expires_at: expiresAt,
          scopes: tokens.scope?.split(" ") || [],
          sync_status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Failed to create integration:", insertError);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=database_error`,
        );
      }
    }

    // Redirect to success page
    const successResp = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/setup?gmail_connected=true&email=${encodeURIComponent(userInfo.email)}`,
    );
    // Clear the CSRF cookie after successful validation to avoid reuse
    successResp.cookies.set("gmail_oauth_state", "", { path: "/", maxAge: 0 });
    return successResp;
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding/connect-email?error=callback_error`,
    );
  }
}
