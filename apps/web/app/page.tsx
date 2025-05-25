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
    <main className="flex flex-col items-center justify-center min-h-screen p-24 bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8 text-foreground">
          Welcome to TrackFlow
        </h1>
        {/* User is not logged in, so show login/signup options */}
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">
            Please log in or sign up to continue.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth/login">
              <button className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                Log In
              </button>
            </Link>
            <Link href="/auth/signup">
              <button className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors">
                Sign Up
              </button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
