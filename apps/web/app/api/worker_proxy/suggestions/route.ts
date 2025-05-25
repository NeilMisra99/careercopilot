import { NextRequest } from "next/server";
import {
  makeWorkerRequest,
  getQueryParams,
  getRequestBody,
} from "../_lib/worker-client";

// GET /api/worker_proxy/suggestions - Get AI suggestions
export async function GET(request: NextRequest) {
  const params = getQueryParams(request);

  return makeWorkerRequest(request, {
    endpoint: "/api/suggestions",
    method: "GET",
    params,
  });
}

// POST /api/worker_proxy/suggestions/bulk-action - Bulk action on suggestions
export async function POST(request: NextRequest) {
  const body = await getRequestBody(request);

  return makeWorkerRequest(request, {
    endpoint: "/api/suggestions/bulk-action",
    method: "POST",
    body: body || undefined,
  });
}
