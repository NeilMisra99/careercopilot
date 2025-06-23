"use server";

import { revalidateInterviewPrepData } from "@/lib/cache";

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
