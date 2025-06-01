import { SignUpForm } from "@/components/auth/sign-up-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SignUpPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is already logged in, redirect to dashboard
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-background">
      <SignUpForm />
    </div>
  );
}
