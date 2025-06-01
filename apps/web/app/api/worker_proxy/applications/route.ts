import { NextRequest } from "next/server"
import { getRequestBody, makeWorkerRequest } from "../_lib/worker-client"

// GET /api/worker_proxy/applications - Fetch user's applications
export async function GET(request: NextRequest) {
  return makeWorkerRequest(request, {
    endpoint: "/api/applications",
    method: "GET",
  })
}

// POST /api/worker_proxy/applications - Create new application
export async function POST(request: NextRequest) {
  const body = await getRequestBody(request)

  return makeWorkerRequest(request, {
    endpoint: "/api/applications",
    method: "POST",
    body: body || undefined,
  })
}
