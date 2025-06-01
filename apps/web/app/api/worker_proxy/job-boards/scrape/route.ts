import { NextRequest } from "next/server"
import { getQueryParams, makeWorkerRequest } from "../../_lib/worker-client"

// GET /api/worker_proxy/job-boards/scrape - Scrape job board URLs
export async function GET(request: NextRequest) {
  const params = getQueryParams(request)

  return makeWorkerRequest(request, {
    endpoint: "/api/job-boards/scrape",
    method: "GET",
    params,
  })
}
