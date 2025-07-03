import { Suspense } from "react";
import { ApplicationForm } from "./_components/application-form";
import { ApplicationFormSkeleton } from "./_components/application-form-skeleton";

export default function AddApplicationPage() {
  return (
    <div className="bg-background min-h-full">
      <div className="mx-auto max-w-7xl p-6">
        {/* Header Section */}
        <div className="mb-6">
          <div>
            <h1 className="text-foreground text-2xl font-medium">
              Add New Application
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Track a new job application manually or import from a job posting
              URL.
            </p>
          </div>
        </div>

        {/* Form Section */}
        <div className="rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-6 shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.12)]">
          <Suspense fallback={<ApplicationFormSkeleton />}>
            <ApplicationForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
