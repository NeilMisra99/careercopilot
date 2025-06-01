import { DashboardLayout } from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Check authentication
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login?message=Please log in to view the dashboard.")
  }

  return <DashboardLayout user={user}>{children}</DashboardLayout>
}
