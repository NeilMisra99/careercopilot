import { CACHE_TAGS } from "@/lib/cache"
import { revalidateTag } from "next/cache"
import { NextRequest } from "next/server"
import { getRequestBody, makeWorkerRequest } from "../../../_lib/worker-client"

// POST /api/worker_proxy/applications/[id]/review - Review application (approve/delete)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await getRequestBody(request)

  const response = await makeWorkerRequest(request, {
    endpoint: `/api/applications/${id}/review`,
    method: "POST",
    body: body || undefined,
  })

  // If the request was successful, revalidate specific cache tags
  if (response.ok) {
    // Always revalidate pending applications (for both approve and delete)
    revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS)

    // For approvals, also revalidate board data so approved apps appear on kanban
    revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD)
    revalidateTag(CACHE_TAGS.BOARD_DATA)

    // Revalidate dashboard data since metrics may have changed
    revalidateTag(CACHE_TAGS.DASHBOARD_DATA)
  }

  return response
}
