import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
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

    // Sign in the user
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Default to a generic message to avoid leaking too much info
      let errorMessage = "Invalid login credentials. Please try again.";
      let status = 401; // Unauthorized

      // Specific error messages can be mapped if needed, but be cautious
      if (error.message.includes("Invalid login credentials")) {
        errorMessage =
          "Invalid email or password. Please check your credentials and try again.";
      } else if (error.message.includes("Email not confirmed")) {
        errorMessage =
          "Email not confirmed. Please check your inbox for a confirmation link.";
        status = 403; // Forbidden, as user exists but isn't active
      }
      // Add more specific error handling if Supabase provides distinct error codes/messages

      return NextResponse.json({ error: errorMessage }, { status: status });
    }

    const requestUrl = new URL(request.url);
    return NextResponse.redirect(`${requestUrl.origin}/`, {
      status: 302,
    });
  } catch (error: unknown) {
    let errorMessage = "An unexpected error occurred during sign-in.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
