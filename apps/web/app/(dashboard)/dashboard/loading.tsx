import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50/30 to-gray-100/20 dark:from-gray-950/50 dark:to-slate-950/30">
      <div className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-12 flex-shrink-0">
          <div>
            <Skeleton className="h-10 w-40 mb-3 bg-slate-100/80 dark:bg-slate-700/70 rounded-lg" />
            <Skeleton className="h-6 w-72 bg-slate-100/60 dark:bg-slate-700/50 rounded-md" />
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-32 bg-slate-100/80 dark:bg-slate-700/70 rounded-lg" />
              <Skeleton className="h-10 w-28 bg-slate-100/80 dark:bg-slate-700/70 rounded-lg" />
              <Skeleton className="h-10 w-20 bg-slate-100/80 dark:bg-slate-700/70 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Application Statistics Row */}
        <section className="mb-8 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card
                key={i}
                className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-lg hover:shadow-xl transition-all duration-500 rounded-xl group relative overflow-hidden"
              >
                <div
                  className={`absolute inset-0 ${
                    i === 0
                      ? "bg-gradient-to-br from-teal-100/70 via-teal-50/50 to-cyan-100/60 dark:from-teal-900/20 dark:via-teal-900/10 dark:to-cyan-900/10"
                      : i === 1
                        ? "bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-orange-100/60 dark:from-amber-900/20 dark:via-amber-900/10 dark:to-orange-900/10"
                        : "bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-green-100/60 dark:from-emerald-900/20 dark:via-emerald-900/10 dark:to-green-900/10"
                  }`}
                ></div>
                <CardHeader className="pb-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <Skeleton
                      className={`w-7 h-7 rounded-lg ${
                        i === 0
                          ? "bg-gradient-to-br from-teal-500 to-cyan-600 dark:from-teal-400 dark:to-cyan-500"
                          : i === 1
                            ? "bg-gradient-to-br from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-400"
                            : "bg-gradient-to-br from-emerald-500 to-green-500 dark:from-emerald-400 dark:to-green-400"
                      }`}
                    />
                    <Skeleton className="h-4 w-32 bg-slate-200/50 dark:bg-slate-300/30 rounded-md" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <Skeleton className="h-8 w-12 mb-1 bg-slate-300/60 dark:bg-slate-100/70 rounded-lg" />
                  <Skeleton className="h-4 w-40 bg-slate-200/60 dark:bg-slate-400/60 rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Main Content Grid - Side by Side Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Recent Emails - Left Side */}
          <Card className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl flex flex-col max-h-[600px] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-100/80 via-blue-50/60 via-30% to-slate-50/30 dark:from-blue-900/20 dark:via-blue-900/10 dark:via-30% dark:to-slate-800/10"></div>
            <CardHeader className="pb-3 flex-shrink-0 relative z-10">
              <div className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-lg bg-blue-200/80 dark:bg-blue-800" />
                <Skeleton className="h-4 w-32 bg-slate-300/60 dark:bg-slate-100/80 rounded-md" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 py-3 relative z-10">
              <div className="h-full overflow-hidden">
                <div className="space-y-0 px-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i}>
                      <div className="hover:bg-blue-50/70 dark:hover:bg-slate-700/30 py-3 px-2 rounded-md transition-colors duration-150 group">
                        <div className="flex justify-between items-start mb-2">
                          <Skeleton className="h-4 w-2/3 bg-slate-300/50 dark:bg-slate-100/70 rounded-md" />
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Skeleton className="h-3 w-16 bg-slate-200/60 dark:bg-slate-400/60 rounded-md" />
                            <Skeleton className="h-3 w-3 bg-slate-200/60 dark:bg-slate-500/60 rounded" />
                          </div>
                        </div>
                        <Skeleton className="h-3 w-4/5 bg-slate-200/50 dark:bg-slate-400/60 rounded-md mb-1" />
                        <Skeleton className="h-3 w-3/5 bg-slate-200/50 dark:bg-slate-400/60 rounded-md" />
                      </div>
                      {i < 5 && (
                        <div className="mx-2 border-b border-slate-300/60 dark:border-slate-700/40"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Applications to Review - Right Side */}
          <Card className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl flex flex-col max-h-[600px] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-violet-100/80 via-violet-50/60 via-30% to-slate-50/30 dark:from-violet-900/20 dark:via-violet-900/10 dark:via-30% dark:to-slate-800/10"></div>
            <CardHeader className="pb-3 flex-shrink-0 relative z-10">
              <div className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-lg bg-violet-200/80 dark:bg-violet-800" />
                <Skeleton className="h-4 w-48 bg-slate-300/60 dark:bg-slate-100/80 rounded-md" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 py-3 relative z-10">
              <div className="h-full overflow-hidden">
                <div className="space-y-2 px-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i}>
                      <div className="hover:bg-violet-50/80 dark:hover:bg-slate-700/30 py-3 px-2 rounded-md transition-colors duration-150 group">
                        {/* Header with company and confidence */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-3 w-3 bg-slate-200/60 dark:bg-slate-400/60 rounded" />
                              <Skeleton className="h-4 w-24 bg-slate-300/50 dark:bg-slate-100/70 rounded-md" />
                            </div>
                            <div className="flex items-center gap-2 ml-5">
                              <Skeleton className="h-3 w-16 bg-slate-200/60 dark:bg-slate-300/60 rounded-md" />
                              <Skeleton className="h-3 w-8 bg-slate-200/50 dark:bg-slate-500/60 rounded-md" />
                            </div>
                          </div>
                          <Skeleton className="h-5 w-12 rounded bg-emerald-200/60 dark:bg-emerald-400/40" />
                        </div>

                        {/* Action buttons and info */}
                        <div className="flex items-center justify-between gap-2 ml-5">
                          <div className="flex items-center gap-2 flex-1">
                            <Skeleton className="h-7 w-16 rounded bg-emerald-200/70 dark:bg-emerald-600/60" />
                            <Skeleton className="h-7 w-14 rounded bg-red-100/80 dark:bg-red-900/40" />
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Skeleton className="h-7 w-7 rounded bg-slate-150/60 dark:bg-slate-500/50" />
                            <Skeleton className="h-7 w-7 rounded bg-slate-150/60 dark:bg-slate-500/50" />
                          </div>
                        </div>
                      </div>
                      {i < 4 && (
                        <div className="mx-2 border-b border-violet-200/80 dark:border-slate-700/40"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
