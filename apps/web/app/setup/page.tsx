import { UnifiedSyncProgress } from "@/app/(dashboard)/dashboard/_components/unified-sync-progress";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get Gmail integration email from database
  const { data: integration } = await supabase
    .from("user_email_integrations")
    .select("email_address")
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .single();

  return (
    <div className="flex h-[calc(100vh-6rem)] items-center justify-center bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-4 dark:from-slate-950 dark:via-gray-950 dark:to-slate-900">
      <UnifiedSyncProgress
        userId={user.id}
        integrationEmail={integration?.email_address || null}
      />
    </div>
  );
}
