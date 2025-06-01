import { Skeleton } from "@/components/ui/skeleton";

export default function BoardLoading() {
  // Define column colors matching the refined board design
  const columnColors = [
    {
      bg: "bg-slate-50/80 dark:bg-slate-800/40",
      border: "border-slate-200/70 dark:border-slate-700/60",
    }, // Wishlist
    {
      bg: "bg-blue-50/80 dark:bg-blue-900/40",
      border: "border-blue-200/70 dark:border-blue-700/60",
    }, // Applied
    {
      bg: "bg-amber-50/80 dark:bg-amber-900/40",
      border: "border-amber-200/70 dark:border-amber-700/60",
    }, // Screening
    {
      bg: "bg-purple-50/80 dark:bg-purple-900/40",
      border: "border-purple-200/70 dark:border-purple-700/60",
    }, // Interviewing
    {
      bg: "bg-emerald-50/80 dark:bg-emerald-900/40",
      border: "border-emerald-200/70 dark:border-emerald-700/60",
    }, // Offer
    {
      bg: "bg-red-50/80 dark:bg-red-900/40",
      border: "border-red-200/70 dark:border-red-700/60",
    }, // Rejected
    {
      bg: "bg-orange-50/80 dark:bg-orange-900/40",
      border: "border-orange-200/70 dark:border-orange-700/60",
    }, // Withdrawn
  ];

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-slate-50/30 to-gray-100/20 dark:from-gray-950/50 dark:to-slate-950/30">
      <div className="flex h-[calc(100vh-200px)] gap-4 overflow-x-auto py-4 pr-20 pl-6">
        {columnColors.map((columnColor, colIndex) => (
          <div
            key={colIndex}
            className="relative flex h-full w-[320px] min-w-[320px] flex-col"
          >
            {/* Column Header */}
            <div
              className={`rounded-t-xl ${columnColor.bg} ${columnColor.border} flex-shrink-0 border-b-0 p-4`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded bg-slate-300/60 dark:bg-slate-400/60" />
                  <Skeleton className="h-5 w-24 rounded-md bg-slate-300/60 dark:bg-slate-400/60" />
                </div>
                <Skeleton className="h-6 w-8 rounded-full bg-slate-300/50 dark:bg-slate-400/50" />
              </div>
            </div>

            {/* Column Content */}
            <div
              className={`flex-1 ${columnColor.bg} ${columnColor.border} space-y-3 overflow-y-auto rounded-b-xl p-4`}
            >
              {/* Render 3-4 skeleton cards per column */}
              {Array.from({ length: Math.floor(Math.random() * 2) + 3 }).map(
                (_, cardIndex) => (
                  <div
                    key={cardIndex}
                    className="group cursor-pointer rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-lg dark:border-slate-600/60 dark:bg-slate-700/80"
                  >
                    {/* Card Header */}
                    <div className="mb-3 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <Skeleton className="mb-2 h-5 w-3/4 rounded-md bg-slate-300/60 dark:bg-slate-400/60" />
                        <Skeleton className="bg-slate-250/60 dark:bg-slate-450/60 h-4 w-1/2 rounded-md" />
                      </div>
                      <Skeleton className="ml-2 h-6 w-6 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                    </div>

                    {/* Card Content */}
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                        <Skeleton className="h-3 w-20 rounded-md bg-slate-200/60 dark:bg-slate-500/60" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                        <Skeleton className="h-3 w-16 rounded-md bg-slate-200/60 dark:bg-slate-500/60" />
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 dark:border-slate-600/50">
                      <Skeleton className="h-3 w-12 rounded-md bg-slate-200/60 dark:bg-slate-500/60" />
                      <Skeleton className="h-4 w-4 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                    </div>
                  </div>
                ),
              )}

              {/* Add empty state skeleton for some columns */}
              {colIndex % 3 === 0 && (
                <div className="py-8 text-center">
                  <Skeleton className="mx-auto mb-3 h-12 w-12 rounded-full bg-slate-200/60 dark:bg-slate-500/60" />
                  <Skeleton className="mx-auto mb-2 h-4 w-32 rounded-md bg-slate-200/60 dark:bg-slate-500/60" />
                  <Skeleton className="mx-auto h-3 w-24 rounded-md bg-slate-200/60 dark:bg-slate-500/60" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
