import { NextRequest } from "next/server";
import { makeWorkerRequest } from "../../../_lib/worker-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return makeWorkerRequest(request, {
    endpoint: `/api/applications/${id}/sources`,
    method: "GET",
  });
}
