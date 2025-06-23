import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function SetupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?message=Please log in to view the setup page.");
  }

  return (
    <div className="min-h-screen">
      {/* Simple Header */}
      <header className="relative border-b border-slate-200/60 bg-white/80 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="mx-auto max-w-7xl px-8 py-6">
          <div className="flex items-center justify-between">
            {/* Left side - CareerCopilot branding and Setup */}
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard"
                className="group flex items-center space-x-3"
              >
                {/* Logo Icon */}
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 shadow-lg shadow-blue-500/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-blue-500/30 dark:from-blue-500 dark:via-indigo-500 dark:to-purple-500 dark:shadow-blue-400/20 dark:group-hover:shadow-blue-400/30">
                  <svg
                    className="h-5 w-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                {/* CareerCopilot Text */}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-xl font-bold text-transparent transition-all duration-300 group-hover:from-blue-500 group-hover:via-indigo-500 group-hover:to-purple-500 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400">
                  CareerCopilot
                </span>
              </Link>

              {/* Divider */}
              <div className="h-6 w-px bg-slate-300 dark:bg-slate-600" />

              {/* Setup Title */}
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Setup
              </h1>
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex-1">{children}</main>
    </div>
  );
}
