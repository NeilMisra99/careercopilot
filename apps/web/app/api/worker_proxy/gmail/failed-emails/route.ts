import { NextRequest } from "next/server"
import { makeWorkerRequest } from "../../_lib/worker-client"

export async function GET(request: NextRequest) {
  return makeWorkerRequest(request, {
    endpoint: "/api/gmail/failed-emails",
    method: "GET",
  })
}
