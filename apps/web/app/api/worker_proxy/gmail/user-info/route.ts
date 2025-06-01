import { NextRequest } from "next/server"
import { makeWorkerRequest } from "../../_lib/worker-client"

// GET /api/worker_proxy/gmail/user-info - Get Gmail user info
export async function GET(request: NextRequest) {
  return makeWorkerRequest(request, {
    endpoint: "/api/gmail/user-info",
    method: "GET",
  })
}
