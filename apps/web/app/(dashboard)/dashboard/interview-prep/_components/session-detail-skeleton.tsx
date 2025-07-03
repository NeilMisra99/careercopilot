export function SessionDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-muted h-10 w-10 animate-pulse rounded" />
          <div className="space-y-2">
            <div className="bg-muted h-8 w-64 animate-pulse rounded" />
            <div className="flex items-center gap-4">
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              <div className="bg-muted h-4 w-24 animate-pulse rounded" />
              <div className="bg-muted h-4 w-20 animate-pulse rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted h-6 w-16 animate-pulse rounded-full" />
              <div className="bg-muted h-6 w-20 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-muted h-9 w-20 animate-pulse rounded" />
          <div className="bg-muted h-9 w-9 animate-pulse rounded" />
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="space-y-4">
        <div className="bg-muted h-11 animate-pulse rounded-lg" />
        
        {/* Content Area Skeleton */}
        <div className="bg-card border-border rounded-lg border p-6">
          <div className="space-y-4">
            <div className="bg-muted h-6 w-48 animate-pulse rounded" />
            <div className="grid gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-muted h-20 animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}