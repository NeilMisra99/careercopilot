import { NextRequest } from "next/server"
import { getRequestBody, makeWorkerRequest } from "../../_lib/worker-client"

export async function POST(request: NextRequest) {
  const body = await getRequestBody(request)

  return makeWorkerRequest(request, {
    endpoint: "/api/gmail/process-failed-email",
    method: "POST",
    body: body || undefined,
  })
}
