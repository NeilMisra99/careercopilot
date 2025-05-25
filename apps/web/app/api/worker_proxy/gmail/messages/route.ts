import { NextRequest } from "next/server";
import { makeWorkerRequest } from "../../_lib/worker-client";

// GET /api/worker_proxy/gmail/messages - Get Gmail messages
export async function GET(request: NextRequest) {
  return makeWorkerRequest(request, {
    endpoint: "/api/gmail/messages",
    method: "GET",
  });
}
