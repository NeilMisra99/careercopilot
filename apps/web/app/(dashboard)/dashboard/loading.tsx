import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="h-full bg-stone-50 dark:bg-stone-900">
      <div className="container mx-auto px-6 py-8 max-w-7xl h-full flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 flex-shrink-0">
          <div className="min-w-0 flex-1 mr-6">
            <Skeleton className="h-10 w-40 mb-3" />
            <Skeleton className="h-6 w-60" />
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <Skeleton className="h-11 w-24" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>

        {/* Application Statistics Row */}
        <section className="mb-8 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm rounded-lg overflow-hidden"
              >
                <div className="p-6 pb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Skeleton className="w-2 h-2 rounded-full flex-shrink-0" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <Skeleton className="h-8 w-10 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Main Content Grid - Side by Side Layout */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Emails - Left Side (2/3 width) */}
          <div className="lg:col-span-2 min-h-0">
            <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm rounded-lg flex flex-col min-h-0 h-full">
              <div className="p-6 pb-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-6 h-6 rounded-lg flex-shrink-0" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
              <div className="px-6 pb-6 flex-1 min-h-0">
                <div className="h-full overflow-hidden">
                  <div className="space-y-3 pr-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-start space-x-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-700/50 border border-stone-100 dark:border-stone-600"
                      >
                        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                        <div className="space-y-1 flex-1 min-w-0">
                          <Skeleton className="h-4 w-3/5" />
                          <Skeleton className="h-3 w-4/5" />
                          <Skeleton className="h-3 w-2/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Suggestions - Right Side (1/3 width) */}
          <div className="lg:col-span-1 min-h-0">
            <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm rounded-lg flex flex-col min-h-0 h-full">
              <div className="p-6 pb-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-6 h-6 rounded-lg flex-shrink-0" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
              <div className="px-6 pb-6 flex-1 min-h-0">
                <div className="h-full overflow-hidden">
                  <div className="space-y-3 pr-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:shadow-sm transition-shadow"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-20" />
                              <Skeleton className="h-3 w-16" />
                            </div>
                            <Skeleton className="h-5 w-12 rounded-full" />
                          </div>
                          <Skeleton className="h-3 w-full" />
                          <div className="flex gap-2">
                            <Skeleton className="h-8 flex-1" />
                            <Skeleton className="h-8 flex-1" />
                          </div>
                          <Skeleton className="h-3 w-16 mx-auto" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
