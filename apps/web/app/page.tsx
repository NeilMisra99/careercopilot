import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation"; // Added for redirection

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard"); // Redirect to dashboard if user is logged in
  }

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-foreground mb-8 text-4xl font-bold">
          Welcome to CareerCopilot
        </h1>
        {/* User is not logged in, so show login/signup options */}
        <div className="space-y-4">
          <p className="text-muted-foreground text-lg">
            Please log in or sign up to continue.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/auth/login">
              <button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-6 py-2 transition-colors">
                Log In
              </button>
            </Link>
            <Link href="/auth/signup">
              <button className="bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-md px-6 py-2 transition-colors">
                Sign Up
              </button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
