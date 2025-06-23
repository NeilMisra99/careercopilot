"use server";

import { revalidateInterviewPrepData } from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";
import { cookies } from "next/headers";

interface InterviewPrepResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

export async function getInterviewSessionsAction(): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/interview-prep/sessions`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch sessions: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching interview sessions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function createInterviewSessionAction(
  sessionName: string,
  sessionType: "behavioral" | "technical" | "company_specific" | "mixed",
  applicationId: string,
  resumeId: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/interview-prep/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        sessionName,
        sessionType,
        applicationId,
        resumeId,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to create session: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate interview prep cache
    revalidateInterviewPrepData();

    return {
      success: true,
      data: result.data,
      message: result.message,
    };
  } catch (error) {
    console.error("Error creating interview session:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getInterviewSessionDetailsAction(
  sessionId: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch session details: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching session details:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function updateInterviewSessionAction(
  sessionId: string,
  updates: {
    sessionName?: string;
    status?: "draft" | "in_progress" | "completed";
  },
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/sessions/${sessionId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to update session: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate interview prep cache
    revalidateInterviewPrepData();

    return {
      success: true,
      data: result.data,
      message: result.message,
    };
  } catch (error) {
    console.error("Error updating session:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function deleteInterviewSessionAction(
  sessionId: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/sessions/${sessionId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to delete session: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate interview prep cache
    revalidateInterviewPrepData();

    return {
      success: true,
      message: result.message,
    };
  } catch (error) {
    console.error("Error deleting session:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getInterviewQuestionsAction(
  sessionId: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/sessions/${sessionId}/questions`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch questions: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching questions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getInterviewBriefAction(
  sessionId: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/sessions/${sessionId}/brief`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch brief: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching interview brief:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getStarStoriesAction(
  resumeId?: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const queryParams = new URLSearchParams();
    if (resumeId) {
      queryParams.append("resumeId", resumeId);
    }

    const cookieStore = await cookies();
    const url = `${workerUrl}/api/interview-prep/star-stories${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch STAR stories: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("Error fetching STAR stories:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function updateStarStoryAction(
  storyId: string,
  updates: {
    title?: string;
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
    skillsDemonstrated?: string[];
    storyCategory?: string;
  },
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/star-stories/${storyId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to update STAR story: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate interview prep cache
    revalidateInterviewPrepData();

    return {
      success: true,
      data: result.data,
      message: result.message,
    };
  } catch (error) {
    console.error("Error updating STAR story:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function deleteStarStoryAction(
  storyId: string,
): Promise<InterviewPrepResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(
      `${workerUrl}/api/interview-prep/star-stories/${storyId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to delete STAR story: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // Revalidate interview prep cache
    revalidateInterviewPrepData();

    return {
      success: true,
      message: result.message,
    };
  } catch (error) {
    console.error("Error deleting STAR story:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// Actions to trigger background AI tasks
export async function triggerStarStoryExtractionAction(
  resumeId: string,
  resumeContent: string,
  forceRefresh = false,
): Promise<InterviewPrepResult> {
  try {
    const { extractStarStories } = await import(
      "@/app/trigger/star-story-extractor"
    );
    const { createClient } = await import("@/lib/supabase/server");

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Authentication required",
      };
    }

    // Trigger STAR story extraction
    const handle = await extractStarStories.trigger({
      resumeId,
      userId: user.id,
      resumeContent,
      forceRefresh,
    });

    return {
      success: true,
      message: "STAR story extraction started successfully",
      data: { taskId: handle.id },
    };
  } catch (error) {
    console.error("Error triggering STAR story extraction:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to start extraction",
    };
  }
}

export async function triggerInterviewQuestionGenerationAction(
  sessionId: string,
  applicationId: string,
  resumeId: string,
  sessionType: "behavioral" | "technical" | "company_specific" | "mixed",
  forceRefresh = false,
): Promise<InterviewPrepResult> {
  try {
    const { generateInterviewQuestions } = await import(
      "@/app/trigger/interview-question-generator"
    );
    const { createClient } = await import("@/lib/supabase/server");

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Authentication required",
      };
    }

    // Trigger question generation
    const handle = await generateInterviewQuestions.trigger({
      sessionId,
      userId: user.id,
      applicationId,
      resumeId,
      sessionType,
      forceRefresh,
    });

    // Revalidate cache after triggering
    revalidateInterviewPrepData();

    return {
      success: true,
      message: "Question generation started successfully",
      data: { taskId: handle.id },
    };
  } catch (error) {
    console.error("Error triggering question generation:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to start generation",
    };
  }
}

export async function triggerInterviewBriefGenerationAction(
  sessionId: string,
  applicationId: string,
  resumeId: string,
  forceRefresh = false,
): Promise<InterviewPrepResult> {
  try {
    const { generateInterviewBrief } = await import(
      "@/app/trigger/interview-brief-generator"
    );
    const { createClient } = await import("@/lib/supabase/server");

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Authentication required",
      };
    }

    // Trigger brief generation
    const handle = await generateInterviewBrief.trigger({
      sessionId,
      userId: user.id,
      applicationId,
      resumeId,
      forceRefresh,
    });

    // Revalidate cache after triggering
    revalidateInterviewPrepData();

    return {
      success: true,
      message: "Interview brief generation started successfully",
      data: { taskId: handle.id },
    };
  } catch (error) {
    console.error("Error triggering brief generation:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to start generation",
    };
  }
}
