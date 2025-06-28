import { Card, CardContent } from "@/components/ui/card";

export function InterviewPrepSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header Skeleton */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-96 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border p-4 border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] bg-gradient-to-b from-white to-gray-50/40 dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-6 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        ))}
      </div>

      {/* Filters Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="h-9 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-9 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-9 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* Session Cards Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-border rounded-lg border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] bg-gradient-to-b from-card to-card/95 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:from-card dark:to-card/90 h-full"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="flex gap-2 pt-2">
                <div className="h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}