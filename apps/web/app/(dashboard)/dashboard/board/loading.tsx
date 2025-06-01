import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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

  const columnTitles = [
    "Wishlist",
    "Applied",
    "Screening",
    "Interviewing",
    "Offer",
    "Rejected",
    "Withdrawn",
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50/30 to-gray-100/20 dark:from-gray-950/50 dark:to-slate-950/30">
      <div className="flex pl-6 pr-20 gap-4 h-[calc(100vh-200px)] py-4 overflow-x-auto">
        {columnColors.map((columnColor, colIndex) => (
          <div
            key={colIndex}
            className="flex flex-col h-full relative min-w-[320px] w-[320px]"
          >
            {/* Column Header */}
            <div
              className={`rounded-t-xl ${columnColor.bg} ${columnColor.border} border-b-0 p-4 flex-shrink-0`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-5 h-5 rounded bg-slate-300/60 dark:bg-slate-400/60" />
                  <Skeleton className="h-5 w-24 bg-slate-300/60 dark:bg-slate-400/60 rounded-md" />
                </div>
                <Skeleton className="h-6 w-8 rounded-full bg-slate-300/50 dark:bg-slate-400/50" />
              </div>
            </div>

            {/* Column Content */}
            <div
              className={`flex-1 ${columnColor.bg} ${columnColor.border} rounded-b-xl p-4 space-y-3 overflow-y-auto`}
            >
              {/* Render 3-4 skeleton cards per column */}
              {Array.from({ length: Math.floor(Math.random() * 2) + 3 }).map(
                (_, cardIndex) => (
                  <div
                    key={cardIndex}
                    className="bg-white dark:bg-slate-700/80 rounded-xl border border-slate-200/70 dark:border-slate-600/60 p-4 shadow-sm hover:shadow-lg transition-all duration-300 group cursor-pointer"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <Skeleton className="h-5 w-3/4 mb-2 bg-slate-300/60 dark:bg-slate-400/60 rounded-md" />
                        <Skeleton className="h-4 w-1/2 bg-slate-250/60 dark:bg-slate-450/60 rounded-md" />
                      </div>
                      <Skeleton className="w-6 h-6 ml-2 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                    </div>

                    {/* Card Content */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-4 h-4 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                        <Skeleton className="h-3 w-20 bg-slate-200/60 dark:bg-slate-500/60 rounded-md" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-4 h-4 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                        <Skeleton className="h-3 w-16 bg-slate-200/60 dark:bg-slate-500/60 rounded-md" />
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-600/50">
                      <Skeleton className="h-3 w-12 bg-slate-200/60 dark:bg-slate-500/60 rounded-md" />
                      <Skeleton className="w-4 h-4 rounded bg-slate-200/60 dark:bg-slate-500/60" />
                    </div>
                  </div>
                )
              )}

              {/* Add empty state skeleton for some columns */}
              {colIndex % 3 === 0 && (
                <div className="text-center py-8">
                  <Skeleton className="w-12 h-12 rounded-full mx-auto mb-3 bg-slate-200/60 dark:bg-slate-500/60" />
                  <Skeleton className="h-4 w-32 mx-auto mb-2 bg-slate-200/60 dark:bg-slate-500/60 rounded-md" />
                  <Skeleton className="h-3 w-24 mx-auto bg-slate-200/60 dark:bg-slate-500/60 rounded-md" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
