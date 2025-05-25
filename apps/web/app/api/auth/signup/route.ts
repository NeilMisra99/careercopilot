import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // Adjusted import path
// SupabaseClient import will be removed if not used elsewhere after this revert

export const runtime = "edge";

interface SignUpApiResponse {
  message: string;
  email?: string; // To return the email for OTP step
}

export async function POST(request: NextRequest) {
  // Reverted to simpler client initialization
  const supabase = await createClient();

  try {
    const formData = await request.formData();
    const emailInput = formData.get("email") as string;
    const password = formData.get("password") as string;

    // Trim email
    const email = emailInput?.trim();

    // Basic validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      // Matching previous validation
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    // Sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email,
        password,
      }
    );

    if (signUpError) {
      if (signUpError.message.includes("User already registered")) {
        return NextResponse.json(
          { error: "This email is already registered. Try logging in." },
          { status: 409 }
        );
      }
      console.error("Supabase Sign Up Error:", signUpError);
      return NextResponse.json(
        { error: `Authentication error: ${signUpError.message}` },
        { status: 500 }
      );
    }

    // Handle cases based on Supabase signUp response
    // Ref: https://supabase.com/docs/reference/javascript/auth-signup
    if (
      signUpData.user &&
      signUpData.user.identities &&
      signUpData.user.identities.length === 0
    ) {
      // This case can indicate that the user already exists but is not confirmed (e.g. email change request)
      // Or, more commonly, if a user exists (e.g. signed up with OAuth) but tries to sign up again with email/password
      // for the same email address *without* linking accounts. Supabase might return a user object
      // but no session and identities array might be empty if it's treated as a duplicate email situation
      // without clear confirmation status if secure_email_change is enabled and they try to re-signup.
      // For a fresh signup where email confirmation is required, user object is returned, identities is not empty.
      return NextResponse.json(
        {
          error:
            "This email address may already be in use or pending confirmation with a different method. Try logging in or use a different email.",
        },
        { status: 409 }
      );
    }

    if (signUpData.user) {
      // This is the expected path for a new signup where email confirmation is enabled.
      // Supabase sends the OTP/confirmation email.
      // signUpData.session will be null here.
      return NextResponse.json<SignUpApiResponse>(
        {
          message:
            "Confirmation email sent. Please check your inbox for the OTP.",
          email: email,
        },
        { status: 200 }
      );
    }

    if (signUpData.session) {
      // This case implies that email confirmations are OFF (auto-confirm) in Supabase project settings.
      // This is not the desired flow for OTP, but we handle it by informing the client.
      // The client should ideally not allow login without OTP, so this path means misconfiguration.
      console.warn(
        "User signed up and session created immediately - auto-confirmation might be ON."
      );
      return NextResponse.json<SignUpApiResponse>(
        {
          message:
            "Account created and auto-confirmed. OTP step will be skipped.", // Or an error if strict OTP is required.
          email: email,
          // Potentially add a flag: autoConfirmed: true
        },
        { status: 200 } // Or 400 if this is an invalid state for your app's logic
      );
    }

    // Fallback for unexpected scenarios
    console.error("Unexpected signUpData structure:", signUpData);
    return NextResponse.json(
      { error: "An unexpected error occurred during user registration setup." },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.error("Registration API Error:", error);
    let errorMessage = "An unexpected error occurred during registration.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
