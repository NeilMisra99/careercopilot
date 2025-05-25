import { NextRequest } from "next/server";
import { makeWorkerRequest, getRequestBody } from "../../_lib/worker-client";

// PATCH /api/worker_proxy/applications/[id] - Update application
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await getRequestBody(request);

  return makeWorkerRequest(request, {
    endpoint: `/api/applications/${id}`,
    method: "POST",
    body: body || undefined,
  });
}
