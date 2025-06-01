import { NextRequest } from "next/server";
import { makeWorkerRequest, getRequestBody } from "../../_lib/worker-client";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";

// POST /api/worker_proxy/applications/[id] - Update application
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await getRequestBody(request);

  const response = await makeWorkerRequest(request, {
    endpoint: `/api/applications/${id}`,
    method: "POST",
    body: body || undefined,
  });

  // If the request was successful, revalidate cache tags
  if (response.ok) {
    // Revalidate both board data and applications list
    revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD);
    revalidateTag(CACHE_TAGS.BOARD_DATA);
    revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS);
  }

  return response;
}
