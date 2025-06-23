import { revalidateApplicationData } from "@/lib/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-revalidate-secret");
  if (
    !process.env.REVALIDATE_SECRET ||
    secret !== process.env.REVALIDATE_SECRET
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    revalidateApplicationData();
    return NextResponse.json({ revalidated: true });
  } catch (err) {
    console.error("Error revalidating applications:", err);
    return new NextResponse("Error revalidating", { status: 500 });
  }
}
