"use client";

import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Helper to map error codes to user-friendly messages
function getFriendlyErrorMessage(
  errorCode: string | null,
  errorDetails: string | null
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

export default function ConnectEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [userInfoTestResult, setUserInfoTestResult] = useState<string | null>(
    null
  );
  //   const [encryptionTestResult, setEncryptionTestResult] = useState<
  //     string | null
  //   >(null);

  useEffect(() => {
    // Check for errors from OAuth callback in URL params
    const errorCode = searchParams.get("error");
    const errorDetails = searchParams.get("details");
    if (errorCode) {
      setError(getFriendlyErrorMessage(errorCode, errorDetails));
      // Optionally, remove the error query params from URL after displaying
      // router.replace('/auth/onboarding/connect-email', { scroll: false });
    }
  }, [searchParams, router]);

  const handleConnectGmail = async () => {
    setError(null);
    try {
      const workerBaseUrl =
        process.env.NEXT_PUBLIC_WORKER_BASE_URL || "http://localhost:8787";
      const response = await fetch(`${workerBaseUrl}/api/auth/gmail/initiate`, {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to initiate Gmail connection."
        );
      }
      const data = await response.json();
      if (data.authorizeUrl) {
        window.location.href = data.authorizeUrl;
      } else {
        throw new Error("Could not retrieve authorization URL.");
      }
    } catch (err) {
      console.error("Error connecting to Gmail:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred while trying to connect.");
      }
    }
  };

  // Placeholder: In a real app, you'd fetch this status from your backend.
  useEffect(() => {
    const connected = searchParams.get("gmail_connected") === "true";
    setIsGmailConnected(connected);
    if (connected) {
      // If successfully connected, maybe show a success message or redirect sooner.
      // For now, we let the user see the page and can add a success state or redirect.
      console.log("Gmail connected successfully according to URL param.");
    }
  }, [searchParams]);

  const handleTestGmailAccess = async () => {
    setUserInfoTestResult("Testing API access...");
    try {
      const workerBaseUrl = process.env.NEXT_PUBLIC_WORKER_BASE_URL || "";
      const response = await fetch(`${workerBaseUrl}/api/gmail/user-info`, {
        credentials: "include",
      }); // This will hit the worker
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Failed to fetch user info: ${response.status} ${response.statusText}`
        );
      }
      setUserInfoTestResult(
        `Success: ${result.message}\\nData: ${JSON.stringify(result.data, null, 2)}`
      );
    } catch (err) {
      console.error("Error testing Gmail API access:", err);
      if (err instanceof Error) {
        setUserInfoTestResult(`Error: ${err.message}`);
      } else {
        setUserInfoTestResult("An unexpected error occurred during API test.");
      }
    }
  };

  //   const handleTestEncryption = async () => {
  //     setEncryptionTestResult("Testing encryption/decryption...");
  //     try {
  //       const workerBaseUrl =
  //         process.env.NEXT_PUBLIC_WORKER_BASE_URL || "http://localhost:8787";
  //       const response = await fetch(
  //         `${workerBaseUrl}/api/debug/test-encryption`
  //       );
  //       const result = await response.json();

  //       if (!response.ok) {
  //         throw new Error(
  //           result.error ||
  //             `Failed to test encryption: ${response.status} ${response.statusText}`
  //         );
  //       }
  //       setEncryptionTestResult(`Success:\n${JSON.stringify(result, null, 2)}`);
  //     } catch (err) {
  //       console.error("Error testing encryption:", err);
  //       if (err instanceof Error) {
  //         setEncryptionTestResult(`Error: ${err.message}`);
  //       } else {
  //         setEncryptionTestResult(
  //           "An unexpected error occurred during encryption test."
  //         );
  //       }
  //     }
  //   };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        <h1 className="text-4xl font-bold mb-8">Connect Your Email Account</h1>
        <p className="mb-8 text-lg">
          To get started with TrackFlow, please connect your Gmail account. This
          will allow us to automatically track your job applications.
        </p>
        {error && (
          <p className="mb-4 text-red-600 bg-red-100 p-3 rounded-md">{error}</p>
        )}
        {isGmailConnected && !error && (
          <p className="mb-4 text-green-600 bg-green-100 p-3 rounded-md">
            Gmail connected successfully! You can proceed to the dashboard or
            the next step.
          </p>
        )}
        <Button
          onClick={handleConnectGmail}
          size="lg"
          disabled={isGmailConnected && !error}
        >
          {isGmailConnected && !error ? "Gmail Connected" : "Connect to Gmail"}
        </Button>

        {isGmailConnected && !error && (
          <Button
            onClick={handleTestGmailAccess}
            size="lg"
            variant="outline"
            className="mt-4"
          >
            Test Gmail API Access
          </Button>
        )}

        {/* Button to test encryption/decryption */}
        {/* <Button
          onClick={handleTestEncryption}
          size="lg"
          variant="secondary"
          className="mt-4"
        >
          Test Encryption/Decryption
        </Button> */}

        {userInfoTestResult && (
          <div className="mt-6 p-4 w-full max-w-2xl text-left bg-gray-100 rounded-md">
            <h3 className="text-lg font-semibold mb-2">API Test Result:</h3>
            <pre className="whitespace-pre-wrap text-sm">
              {userInfoTestResult}
            </pre>
          </div>
        )}

        {/* {encryptionTestResult && (
          <div className="mt-6 p-4 w-full max-w-2xl text-left bg-blue-100 rounded-md">
            <h3 className="text-lg font-semibold mb-2 text-blue-800">
              Encryption Test Result:
            </h3>
            <pre className="whitespace-pre-wrap text-sm text-blue-700">
              {encryptionTestResult}
            </pre>
          </div>
        )} */}

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
