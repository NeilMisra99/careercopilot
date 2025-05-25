import { Skeleton } from "@/components/ui/skeleton";

export default function BoardLoading() {
  return (
    <div className="flex flex-col h-full space-y-4 p-6 pb-8">
      <div className="flex justify-between items-center flex-shrink-0">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 flex-1 min-h-0">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col h-full min-h-0">
            <div className="p-3 pb-2 flex-shrink-0">
              <Skeleton className="h-4 w-24 mb-2" />
            </div>
            <div className="flex-grow p-2 space-y-2 overflow-y-auto">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton
                  key={j}
                  className="h-24 w-full rounded-md flex-shrink-0"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
