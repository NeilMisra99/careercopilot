import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApplicationFormSkeleton } from "./_components/application-form-skeleton"

export default function AddApplicationLoading() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Page Header Skeleton */}
      <div className="mb-6">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Main Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <ApplicationFormSkeleton />
        </CardContent>
      </Card>
    </div>
  )
}
