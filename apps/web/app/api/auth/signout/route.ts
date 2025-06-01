import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const runtime = "edge"

export async function POST() {
  const supabase = await createClient()

  // Attempt to sign out the user
  const { error } = await supabase.auth.signOut()

  if (error) {
    return NextResponse.json(
      { success: false, message: "Could not sign out. Please try again." },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { success: true, message: "You have been successfully signed out." },
    { status: 200 },
  )
}
