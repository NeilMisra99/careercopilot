import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Suspense } from "react"
import { ApplicationForm } from "./_components/application-form"
import { ApplicationFormSkeleton } from "./_components/application-form-skeleton"

export default function AddApplicationPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Add New Application
        </h1>
        <p className="text-muted-foreground mt-2">
          Track a new job application manually or import from a job posting URL.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ApplicationFormSkeleton />}>
            <ApplicationForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
