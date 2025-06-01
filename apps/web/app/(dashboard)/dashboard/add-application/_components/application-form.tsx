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
import { UrlImportSection } from "./url-import-section";

export function ApplicationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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

  const handleUrlImport = async (url: string) => {
    if (isImporting) return;

    setIsImporting(true);
    try {
      // Call smart URL scraping endpoint via new worker proxy structure
      const response = await fetch(
        `/api/worker_proxy/job-boards/scrape?url=${encodeURIComponent(url)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to scrape job URL");
      }

      const result = await response.json();

      if (result.error) {
        toast.error("Failed to import from URL", {
          description: result.error,
        });
        return;
      }

      // Populate form with scraped data
      if (result.data) {
        const { companyName, jobTitle, location, salary } = result.data;
        const extractionMethod = result.extractionMethod || "traditional";

        // Count populated fields for better feedback
        const populatedFields = [
          companyName && "Company Name",
          jobTitle && "Job Title",
          location && "Location",
          salary && "Salary",
        ].filter(Boolean);

        // Create method-specific success message
        let methodDescription = "";
        if (extractionMethod === "hybrid") {
          methodDescription = "✨ Enhanced with AI for better accuracy";
        } else if (extractionMethod === "ai-enhanced") {
          methodDescription = "🤖 Powered by AI extraction";
        } else {
          methodDescription = "🔍 Traditional web scraping";
        }

        // Show a brief success state with extraction method info
        toast.success(result.message || "Job details imported successfully!", {
          description: `${methodDescription} • ${populatedFields.length} fields found`,
          duration: 2500,
        });

        // Small delay to show the success message, then populate fields
        setTimeout(() => {
          if (companyName) form.setValue("companyName", companyName);
          if (jobTitle) form.setValue("jobTitle", jobTitle);
          if (location) form.setValue("location", location);
          if (salary) form.setValue("salary", salary);
          form.setValue("jobUrl", url);

          // Show final success message with populated fields
          const fieldsText =
            populatedFields.length > 0
              ? `Populated: ${populatedFields.join(", ")}`
              : "Review and update the information as needed.";

          toast.success("Form populated!", {
            description: fieldsText,
            duration: 3000,
          });
        }, 300);
      }
    } catch {
      toast.error("Failed to import from URL", {
        description: "Please enter the details manually.",
      });
    } finally {
      setIsImporting(false);
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
          {/* URL Import Section */}
          <UrlImportSection
            onImport={handleUrlImport}
            isImporting={isImporting}
          />

          <Separator />

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
