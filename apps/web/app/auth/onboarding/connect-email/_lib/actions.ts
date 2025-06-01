"use server";

import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";

export async function initiateGmailOAuth() {
  try {
    const workerBaseUrl = getWorkerUrl();
    const cookieStore = await cookies();
    const cookieString = cookieStore.toString();

    const response = await fetch(`${workerBaseUrl}/api/auth/gmail/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieString,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.message || "Failed to initiate Gmail connection.",
      };
    }

    const data = await response.json();
    return {
      success: true,
      authorizeUrl: data.authorizeUrl,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while trying to connect.",
    };
  }
}
