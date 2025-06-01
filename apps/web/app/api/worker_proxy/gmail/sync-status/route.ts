import { NextRequest } from "next/server"
import { makeWorkerRequest } from "../../_lib/worker-client"

// GET /api/worker_proxy/gmail/sync-status - Get Gmail sync status
export async function GET(request: NextRequest) {
  return makeWorkerRequest(request, {
    endpoint: "/api/gmail/sync-status",
    method: "GET",
  })
}
