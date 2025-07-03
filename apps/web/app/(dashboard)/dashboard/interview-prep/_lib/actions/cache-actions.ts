"use server";

import { revalidateInterviewPrepData, revalidateInterviewSessionData } from "@/lib/cache";

export async function revalidateInterviewPrepCacheAction() {
  try {
    revalidateInterviewPrepData();
    return { success: true };
  } catch (error) {
    console.error("Failed to revalidate interview prep cache:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Cache revalidation failed",
    };
  }
}

export async function revalidateInterviewSessionCacheAction(sessionId: string) {
  try {
    revalidateInterviewSessionData(sessionId);
    return { success: true };
  } catch (error) {
    console.error("Failed to revalidate interview session cache:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Session cache revalidation failed",
    };
  }
}
