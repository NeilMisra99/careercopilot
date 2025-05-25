import { NextRequest } from "next/server";
import { makeWorkerRequest } from "../../_lib/worker-client";

// POST /api/worker_proxy/sync/gmail - Trigger Gmail sync
export async function POST(request: NextRequest) {
  return makeWorkerRequest(request, {
    endpoint: "/api/gmail/sync-now",
    method: "POST",
  });
}
