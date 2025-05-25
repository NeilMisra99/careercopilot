import { NextRequest } from "next/server";
import { makeWorkerRequest, getRequestBody } from "../../_lib/worker-client";

// PATCH /api/worker_proxy/suggestions/[id] - Update suggestion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await getRequestBody(request);

  return makeWorkerRequest(request, {
    endpoint: `/api/suggestions/${id}`,
    method: "POST",
    body: body || undefined,
  });
}
