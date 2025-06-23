import { Card, CardContent } from "@/components/ui/card";

export function ResumeListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-muted h-6 w-48 animate-pulse rounded-md" />
                  <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
                  <div className="bg-muted h-5 w-20 animate-pulse rounded-full" />
                </div>
                <div className="bg-muted h-8 w-8 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded-md" />
              <div className="bg-muted h-4 w-1/2 animate-pulse rounded-md" />
              <div className="flex items-center gap-4">
                <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                <div className="bg-muted h-3 w-16 animate-pulse rounded" />
                <div className="bg-muted h-3 w-20 animate-pulse rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
