"use server";

import { matchJobToResume } from "@/app/trigger/job-resume-matcher";
import { parseResume } from "@/app/trigger/resume-parser";
import {
  revalidateAllMatchData,
  revalidateAllResumeData,
  revalidateResumeData,
  revalidateResumePages,
} from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkerUrl } from "@/lib/worker-utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// === Types ===

interface ResumeUploadResult {
  success: boolean;
  data?: {
    id: string;
    name: string;
    file_path: string;
    taskRunId?: string;
  };
  error?: string;
}

interface ResumesListResult {
  success: boolean;
  data?: Array<{
    id: string;
    name: string;
    version_number: number;
    is_primary: boolean;
    file_name: string;
    file_type: string;
    parsing_status: string;
    parsed_at: string | null;
    created_at: string;
    full_name: string | null;
    email: string | null;
    summary: string | null;
    experiences_count?: number;
    skills_count?: number;
    education_count?: number;
    parsing_progress?: number | null;
    parsing_stage?: string | null;
    parsing_message?: string | null;
    parsing_data?: Record<string, unknown> | null;
    updated_at?: string;
  }>;
  error?: string;
}

interface ResumeActionResult {
  success: boolean;
  error?: string;
}

interface ResumeDetailData {
  id: string;
  name: string;
  version_number: number;
  is_primary: boolean;
  file_name: string;
  file_type: string;
  parsing_status: string;
  parsed_at: string | null;
  created_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  raw_text: string | null;
  experiences: Array<{
    id: string;
    company_name: string;
    job_title: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    location: string;
    description: string;
    achievements: string[];
    skills_used: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    grade_gpa: string;
  }>;
  skills: Array<{
    id: string;
    skill_name: string;
    skill_category: string;
    proficiency_level: string;
    years_experience: number;
  }>;
  projects: Array<{
    id: string;
    project_name: string;
    description: string;
    technologies_used: string[];
  }>;
  certifications: Array<{
    id: string;
    certification_name: string;
    issuing_organization: string;
    issue_date: string;
  }>;
}

// === Helper Functions ===

async function uploadToSupabaseStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
  userId: string,
  fileName: string,
): Promise<{ path: string; url: string }> {
  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}/${Date.now()}-${fileName}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("resumes")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("resumes").getPublicUrl(filePath);

  return {
    path: data.path,
    url: publicUrl,
  };
}

// === Server Actions ===

export async function uploadResumeAction(
  formData: FormData,
): Promise<ResumeUploadResult> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required" };
    }

    // Extract form data
    const file = formData.get("file") as File;
    const name = formData.get("name") as string;
    const isPrimary = formData.get("isPrimary") === "true";

    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Validate file type and size
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Please upload PDF or Word documents.",
      };
    }

    if (file.size > 10 * 1024 * 1024) {
      // 10MB limit
      return { success: false, error: "File size must be less than 10MB" };
    }

    // Upload to Supabase Storage
    const { path: filePath } = await uploadToSupabaseStorage(
      supabase,
      file,
      user.id,
      name,
    );

    // Convert file to buffer for AI processing
    const fileBuffer = await file.arrayBuffer();
    const base64FileBuffer = Buffer.from(fileBuffer).toString("base64");

    // Get next version number for this user
    const { data: existingResumes } = await supabase
      .from("resumes")
      .select("version_number")
      .eq("user_id", user.id)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = (existingResumes?.[0]?.version_number || 0) + 1;

    // If setting as primary, unset all other primary resumes
    if (isPrimary) {
      await supabase
        .from("resumes")
        .update({ is_primary: false })
        .eq("user_id", user.id);
    }

    // Create resume record
    const { data: resume, error: insertError } = await supabase
      .from("resumes")
      .insert({
        user_id: user.id,
        name: name || file.name.replace(/\.[^/.]+$/, ""),
        version_number: nextVersion,
        is_primary: isPrimary,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type.split("/")[1], // 'pdf', 'docx', etc.
        parsing_status: "pending",
        raw_text: null, // Will be populated by AI parsing
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    // Trigger background AI parsing with file buffer
    let taskRunId: string | undefined;
    try {
      const taskHandle = await parseResume.trigger({
        userId: user.id,
        resumeId: resume.id,
        fileName: file.name,
        fileType: file.type,
        fileBuffer: base64FileBuffer,
      });
      taskRunId = taskHandle.id;
    } catch (triggerError) {
      console.error("Failed to trigger resume parsing:", triggerError);
      // Don't fail the upload, just log the error
    }

    revalidatePath("/dashboard/resumes");

    return {
      success: true,
      data: {
        id: resume.id,
        name: resume.name,
        file_path: resume.file_path,
        taskRunId,
      },
    };
  } catch (error) {
    console.error("Resume upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function getResumesAction(): Promise<ResumesListResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/resumes`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch resumes: ${response.status}`,
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
      data: result.data || [],
    };
  } catch (error) {
    console.error("Get resumes error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch resumes",
    };
  }
}

export async function setPrimaryResumeAction(
  resumeId: string,
): Promise<ResumeActionResult> {
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
      `${workerUrl}/api/resumes/${resumeId}/set-primary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to set primary resume: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // 🔥 OPTIMIZATION: For non-parsing operations, only revalidate cache
    // (no need for real-time events since it's not a parsing update)
    revalidateAllResumeData();

    return { success: true };
  } catch (error) {
    console.error("Set primary resume error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to set primary resume",
    };
  }
}

export async function deleteResumeAction(
  resumeId: string,
): Promise<ResumeActionResult> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/resumes/${resumeId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to delete resume: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error from worker",
      };
    }

    // 🔥 OPTIMIZATION: For non-parsing operations, only revalidate cache
    // (no need for real-time events since it's not a parsing update)
    revalidateResumeData();
    revalidateResumePages();

    return { success: true };
  } catch (error) {
    console.error("Delete resume error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete resume",
    };
  }
}

export async function downloadResumeAction(resumeId: string) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Authentication required");
    }

    // Get resume details and verify ownership
    const { data: resume, error: fetchError } = await supabase
      .from("resumes")
      .select("file_path, file_name, user_id")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !resume) {
      throw new Error("Resume not found");
    }

    // Generate signed URL for download
    const { data, error: urlError } = await supabase.storage
      .from("resumes")
      .createSignedUrl(resume.file_path, 60); // 1 minute expiry

    if (urlError || !data?.signedUrl) {
      throw new Error("Failed to generate download URL");
    }

    redirect(data.signedUrl);
  } catch (error) {
    console.error("Download resume error:", error);
    throw error;
  }
}

export async function getResumeDetailAction(resumeId: string): Promise<{
  success: boolean;
  data?: ResumeDetailData;
  error?: string;
}> {
  try {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      return {
        success: false,
        error: "Worker URL not configured",
      };
    }

    const cookieStore = await cookies();
    const response = await fetch(`${workerUrl}/api/resumes/${resumeId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch resume details: ${response.status}`,
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
    console.error("Get resume detail error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch resume details",
    };
  }
}

/**
 * Trigger job-resume matching for all user applications when resume parsing completes
 */
export async function triggerMatchingForCompletedResume(
  resumeId: string,
): Promise<void> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("No authenticated user for matching trigger");
      return;
    }

    // Get the resume to verify it's completed
    const { data: resume, error: resumeError } = await supabase
      .from("resumes")
      .select("id, parsing_status")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .single();

    if (resumeError || !resume || resume.parsing_status !== "completed") {
      return;
    }

    // Get all user applications with job descriptions
    const { data: applications, error: appsError } = await supabase
      .from("applications")
      .select("id, notes, company_name, role")
      .eq("user_id", user.id)
      .not("notes", "is", null)
      .neq("notes", "")
      .order("created_at", { ascending: false }); // Get applications starting with most recent

    if (appsError || !applications || applications.length === 0) {
      return;
    }

    // Trigger matching for each application in the background
    const matchingPromises = applications.map(async (app) => {
      try {
        const handle = await matchJobToResume.trigger({
          applicationId: app.id,
          resumeId: resumeId,
          jobDescription: app.notes || "",
          companyName: app.company_name,
          jobTitle: app.role,
          userId: user.id,
          forceRefresh: false,
        });
        return handle;
      } catch (error) {
        console.error(`Failed to trigger matching for app ${app.id}:`, error);
        return null;
      }
    });

    // Wait for all triggers to complete (but don't wait for the actual matching)
    await Promise.allSettled(matchingPromises);

    // Revalidate matches cache
    revalidateAllMatchData();
  } catch (error) {
    console.error("Error triggering matching for completed resume:", error);
    // Don't throw - this is a background operation
  }
}
