"use server";

import { revalidateAllResumeData } from "@/lib/cache";

export async function revalidateResumeCacheAction() {
  try {
    revalidateAllResumeData();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
