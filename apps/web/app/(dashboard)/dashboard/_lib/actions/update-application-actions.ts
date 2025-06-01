"use server"

import { CACHE_TAGS } from "@/lib/cache"
import { revalidateTag } from "next/cache"

export interface UpdateApplicationData {
  companyName?: string
  jobTitle?: string
  status?: string
  applicationDate?: string
  jobUrl?: string | null
  location?: string | null
  salary?: string | null
  notes?: string | null
}

export interface UpdateApplicationResult {
  success: boolean
  error?: string
  data?: {
    id: string
    company_name: string
    role: string
    status: string
    applied_at: string
    application_date?: string
    job_url?: string | null
    location?: string | null
    salary_range?: string | null
    notes?: string | null
    updated_at?: string
  }
}

export async function updateApplicationAction(
  applicationId: string,
  updateData: UpdateApplicationData,
): Promise<UpdateApplicationResult> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/worker_proxy/applications/${applicationId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      },
    )

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || "Failed to update application",
      }
    }

    const result = await response.json()

    // Revalidate cache tags after successful update
    revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD)
    revalidateTag(CACHE_TAGS.BOARD_DATA)
    revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS)

    return {
      success: true,
      data: result.data,
    }
  } catch (error: any) {
    console.error("Error updating application:", error)
    return {
      success: false,
      error: error.message || "Failed to update application",
    }
  }
}
