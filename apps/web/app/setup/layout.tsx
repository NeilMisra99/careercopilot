import { SignOutButton } from "@/components/auth/sign-out-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function SetupLayout({
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
    redirect("/auth/login?message=Please log in to view the setup page.")
  }

  return (
    <div className="min-h-screen">
      {/* Simple Header */}
      <header className="relative border-b border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            {/* Left side - TrackFlow branding and Setup */}
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard"
                className="flex items-center space-x-3 group"
              >
                {/* Logo Icon */}
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-500 dark:via-indigo-500 dark:to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20 dark:shadow-blue-400/20 group-hover:shadow-xl group-hover:shadow-blue-500/30 dark:group-hover:shadow-blue-400/30 transition-all duration-300 group-hover:scale-105">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                {/* TrackFlow Text */}
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent group-hover:from-blue-500 group-hover:via-indigo-500 group-hover:to-purple-500 transition-all duration-300">
                  TrackFlow
                </span>
              </Link>

              {/* Divider */}
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-600" />

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

      {/* Main Content - AnimatedSetupPageWrapper handles all background animations */}
      <main className="relative flex-1">{children}</main>
    </div>
  )
}
