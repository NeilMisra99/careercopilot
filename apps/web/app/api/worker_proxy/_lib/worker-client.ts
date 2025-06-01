import { createClient } from "@/lib/supabase/server"
import { getWorkerUrl } from "@/lib/worker-utils"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

interface WorkerRequestOptions {
  endpoint: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: Record<string, unknown> | unknown[]
  params?: Record<string, string | number | boolean>
}

export async function makeWorkerRequest(
  request: NextRequest,
  { endpoint, method = "GET", body, params }: WorkerRequestOptions,
): Promise<NextResponse> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.toString()

    const supabase = await createClient()

    // Get the current user's session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Build the worker URL
    let workerUrl = `${getWorkerUrl()}${endpoint}`

    // Add query parameters if provided
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      if (searchParams.toString()) {
        workerUrl += `?${searchParams.toString()}`
      }
    }

    // Prepare the request to the worker
    const workerRequest: RequestInit = {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Cookie: token,
      },
    }

    // Add body for non-GET requests
    if (method !== "GET" && body) {
      workerRequest.body = JSON.stringify(body)
    }

    // Make the request to the worker
    const workerResponse = await fetch(workerUrl, workerRequest)

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text()

      return NextResponse.json(
        { error: "Worker request failed", details: errorText },
        { status: workerResponse.status },
      )
    }

    const responseData = await workerResponse.json()
    return NextResponse.json(responseData)
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

// Helper for extracting query parameters from URL
export function getQueryParams(request: NextRequest): Record<string, string> {
  const url = new URL(request.url)
  const params: Record<string, string> = {}

  url.searchParams.forEach((value, key) => {
    params[key] = value
  })

  return params
}

// Helper for extracting request body
export async function getRequestBody(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
