import { Card, CardContent } from "@/components/ui/card";

export function InterviewPrepSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header Skeleton */}
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-slate-200" />
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                <div className="h-8 w-16 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Button Skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-10 w-32 animate-pulse rounded bg-slate-200" />
      </div>

      {/* Session Cards Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
                  <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}