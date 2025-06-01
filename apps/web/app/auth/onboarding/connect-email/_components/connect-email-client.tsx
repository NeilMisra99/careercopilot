"use client";

import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { initiateGmailOAuth } from "../_lib/actions";

// Helper to map error codes to user-friendly messages
function getFriendlyErrorMessage(
  errorCode: string | null,
  errorDetails: string | null,
): string {
  if (!errorCode) return "An unexpected error occurred. Please try again.";

  switch (errorCode) {
    case "missing_code":
      return "Authorization code not found. Please try connecting again.";
    case "invalid_state":
      return "Invalid request state. This could be a security issue or a timeout. Please try connecting again.";
    case "session_expired_oauth":
      return "Your session has expired. Please log in and try connecting again.";
    case "token_exchange_failed":
      return `Failed to obtain access tokens from Google. ${errorDetails ? `Details: ${decodeURIComponent(errorDetails)}` : "Please ensure you have granted permissions."}`;
    case "no_refresh_token":
      return "A refresh token was not provided by Google. This is needed for offline access. Please try connecting again, ensuring you grant all requested permissions.";
    case "email_fetch_failed":
      return `Could not retrieve your email address from Google after connecting. ${errorDetails ? `Details: ${decodeURIComponent(errorDetails)}` : "Please try again."}`;
    case "db_unavailable":
      return "Could not connect to our database to save your integration. Please try again later.";
    case "db_save_failed":
    case "db_operation_failed":
      return `Failed to save your Gmail integration. ${errorDetails ? `Details: ${decodeURIComponent(errorDetails)}` : "Please try again."}`;
    case "callback_exception":
    default:
      return `An unexpected error occurred: ${decodeURIComponent(errorDetails || errorCode)}. Please try again or contact support if the issue persists.`;
  }
}

export function ConnectEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Check for errors from OAuth callback in URL params
    const errorCode = searchParams.get("error");
    const errorDetails = searchParams.get("details");
    if (errorCode) {
      setError(getFriendlyErrorMessage(errorCode, errorDetails));
    }
  }, [searchParams]);

  const handleConnectGmail = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const result = await initiateGmailOAuth();

      if (result.success && result.authorizeUrl) {
        window.location.href = result.authorizeUrl;
      } else {
        setError(result.error || "Could not retrieve authorization URL.");
      }
    } catch {
      setError("An unexpected error occurred while trying to connect.");
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    const connected = searchParams.get("gmail_connected") === "true";
    setIsGmailConnected(connected);
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-2">
      <main className="flex w-full flex-1 flex-col items-center justify-center px-20 text-center">
        <h1 className="mb-8 text-4xl font-bold">Connect Your Email Account</h1>
        <p className="mb-8 text-lg">
          To get started with TrackFlow, please connect your Gmail account. This
          will allow us to automatically track your job applications.
        </p>
        {error && (
          <p className="mb-4 rounded-md bg-red-100 p-3 text-red-600">{error}</p>
        )}
        {isGmailConnected && !error && (
          <p className="mb-4 rounded-md bg-green-100 p-3 text-green-600">
            Gmail connected successfully! You can proceed to the dashboard or
            the next step.
          </p>
        )}
        <Button
          onClick={handleConnectGmail}
          size="lg"
          disabled={(isGmailConnected && !error) || isConnecting}
        >
          {isConnecting
            ? "Connecting..."
            : isGmailConnected && !error
              ? "Gmail Connected"
              : "Connect to Gmail"}
        </Button>

        <button
          onClick={() => router.push("/dashboard")}
          className="mt-4 text-sm text-gray-600 hover:text-gray-800"
        >
          {isGmailConnected && !error ? "Go to Dashboard" : "Skip for now"}
        </button>
      </main>
    </div>
  );
}
