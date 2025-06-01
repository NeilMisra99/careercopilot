"use client";

import { Button } from "@/components/ui/button";
import {
  DatePicker,
  formatDateToLocalString,
  parseDateFromLocalString,
} from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const quickEditSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  status: z.enum([
    "Pending Review",
    "Wishlist",
    "Applied",
    "Screening",
    "Interviewing",
    "Offer",
    "Rejected",
    "Withdrawn",
  ]),
  applicationDate: z.string().min(1, "Application date is required"),
  jobUrl: z.string().url().optional().or(z.literal("")),
  location: z.string().optional(),
  salary: z.string().optional(),
  notes: z.string().optional(),
});

type QuickEditFormData = z.infer<typeof quickEditSchema>;

interface PendingApplication {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  ai_suggested: boolean;
  ai_confidence: number;
  ai_reasoning: string;
  needs_user_review: boolean;
  source_email_id?: string;
  source_thread_id?: string;
  job_url?: string;
  location?: string;
  salary_range?: string;
  notes?: string;
}

interface QuickEditPendingApplicationProps {
  application: PendingApplication;
  onApplicationUpdated?: () => void;
}

export function QuickEditPendingApplication({
  application,
  onApplicationUpdated,
}: QuickEditPendingApplicationProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<QuickEditFormData>({
    resolver: zodResolver(quickEditSchema),
    defaultValues: {
      companyName: application.company_name,
      jobTitle: application.role,
      status: application.status as QuickEditFormData["status"],
      applicationDate: application.applied_at
        ? formatDateToLocalString(new Date(application.applied_at))
        : formatDateToLocalString(new Date()),
      jobUrl: application.job_url || "",
      location: application.location || "",
      salary: application.salary_range || "",
      notes: application.notes || "",
    },
  });

  const onSubmit = async (data: QuickEditFormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/worker_proxy/applications/${application.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            companyName: data.companyName,
            jobTitle: data.jobTitle,
            status: data.status,
            applicationDate: data.applicationDate,
            jobUrl: data.jobUrl || null,
            location: data.location || null,
            salary: data.salary || null,
            notes: data.notes || null,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update application");
      }

      toast.success("Application updated successfully");
      setOpen(false);
      onApplicationUpdated?.();
    } catch (error: unknown) {
      console.error("Error updating application:", error);
      toast.error("Failed to update application");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-6 w-6 p-0 transition-all duration-200 ease-out hover:scale-110 hover:opacity-80"
        title="Quick edit"
      >
        <PencilIcon className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[700px] overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Edit Application</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Company and Role */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  {...form.register("companyName")}
                  placeholder="e.g., Acme Corp"
                />
                {form.formState.errors.companyName && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.companyName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job Title *</Label>
                <Input
                  id="jobTitle"
                  {...form.register("jobTitle")}
                  placeholder="e.g., Software Engineer"
                />
                {form.formState.errors.jobTitle && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.jobTitle.message}
                  </p>
                )}
              </div>
            </div>

            {/* Status and Date */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(value) =>
                    form.setValue(
                      "status",
                      value as QuickEditFormData["status"],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending Review">
                      Pending Review
                    </SelectItem>
                    <SelectItem value="Wishlist">Wishlist</SelectItem>
                    <SelectItem value="Applied">Applied</SelectItem>
                    <SelectItem value="Screening">Screening</SelectItem>
                    <SelectItem value="Interviewing">Interviewing</SelectItem>
                    <SelectItem value="Offer">Offer</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.status && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.status.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="applicationDate">Application Date *</Label>
                <DatePicker
                  date={parseDateFromLocalString(form.watch("applicationDate"))}
                  onDateChange={(date) => {
                    form.setValue(
                      "applicationDate",
                      date ? formatDateToLocalString(date) : "",
                    );
                  }}
                  placeholder="Select application date"
                />
                {form.formState.errors.applicationDate && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.applicationDate.message}
                  </p>
                )}
              </div>
            </div>

            {/* URL and Location */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="jobUrl">Job URL</Label>
                <Input
                  id="jobUrl"
                  type="url"
                  {...form.register("jobUrl")}
                  placeholder="https://company.com/jobs/123"
                />
                {form.formState.errors.jobUrl && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.jobUrl.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  {...form.register("location")}
                  placeholder="e.g., San Francisco, CA or Remote"
                />
              </div>
            </div>

            {/* Salary */}
            <div className="space-y-2">
              <Label htmlFor="salary">Salary Range</Label>
              <Input
                id="salary"
                {...form.register("salary")}
                placeholder="e.g., $100k - $120k"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                {...form.register("notes")}
                placeholder="Any additional notes about this application..."
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update Application"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
