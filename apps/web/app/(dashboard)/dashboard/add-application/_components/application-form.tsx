"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";

import { formatDateToLocalString } from "@/components/ui/date-picker";
import { createApplicationAction } from "../_lib/actions/create-application";
import { applicationFormSchema, type ApplicationFormData } from "../_lib/types";
import { AdditionalInfoSection } from "./additional-info-section";
import { JobDetailsSection } from "./job-details-section";

export function ApplicationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: {
      companyName: "",
      jobTitle: "",
      status: "Applied" as const,
      applicationDate: formatDateToLocalString(new Date()),
      jobUrl: "",
      location: "",
      salary: "",
      notes: "",
    },
  });

  const onSubmit = async (data: ApplicationFormData) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await createApplicationAction(data);

      if (result.error) {
        toast.error("Failed to create application", {
          description: result.error,
        });
        return;
      }

      toast.success("Application created successfully!", {
        description: `Added ${data.jobTitle} at ${data.companyName}`,
      });

      // Redirect to board or dashboard
      router.push("/dashboard/board");
    } catch {
      toast.error("Failed to create application", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative">
      {/* Loading overlay for form submission */}
      {isSubmitting && (
        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-background rounded-lg border p-6 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
              <span className="text-sm font-medium">
                Creating application...
              </span>
            </div>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Job Details Section */}
          <JobDetailsSection form={form} />

          <Separator />

          {/* Additional Information */}
          <AdditionalInfoSection form={form} />

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-4 pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[120px]"
            >
              {isSubmitting ? "Creating..." : "Create Application"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
