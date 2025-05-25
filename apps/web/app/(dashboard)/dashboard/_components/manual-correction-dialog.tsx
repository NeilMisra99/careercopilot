"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Mail } from "lucide-react";
import type {
  FailedEmail,
  ManualCorrectionRequest,
} from "../_lib/actions/failed-email-actions";

interface ManualCorrectionDialogProps {
  email: FailedEmail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (correction: ManualCorrectionRequest) => Promise<void>;
  isSubmitting: boolean;
}

const JOB_STATUSES = [
  "Applied",
  "Screening",
  "Interviewing",
  "Offer Extended",
  "Offer Accepted",
  "Offer Declined",
  "Rejected",
  "Withdrawn",
  "On Hold",
];

export function ManualCorrectionDialog({
  email,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: ManualCorrectionDialogProps) {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [status, setStatus] = useState("Applied");
  const [notes, setNotes] = useState("");

  // Reset form when dialog opens with new email
  useEffect(() => {
    if (email && open) {
      setCompanyName("");
      setJobTitle("");
      setStatus("Applied");
      setNotes("");
    }
  }, [email, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !companyName.trim()) {
      return;
    }

    const correction: ManualCorrectionRequest = {
      emailId: email.email_id,
      companyName: companyName.trim(),
      jobTitle: jobTitle.trim() || undefined,
      status: status || undefined,
      notes: notes.trim() || undefined,
    };

    await onSubmit(correction);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown date";
    }
  };

  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Correct Failed Email Processing
          </DialogTitle>
          <DialogDescription>
            Provide the missing information to create a job application from
            this email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Email Details */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Email Details</span>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">
                  Subject:
                </span>{" "}
                <span className="text-foreground">
                  {email.email_subject || "No subject"}
                </span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">From:</span>{" "}
                <span className="text-foreground">
                  {email.email_from || "Unknown sender"}
                </span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Date:</span>{" "}
                <span className="text-foreground">
                  {formatDate(email.email_date)}
                </span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">
                  Failure reason:
                </span>{" "}
                <span className="text-orange-600">{email.failure_reason}</span>
              </div>
            </div>

            {email.email_snippet && (
              <div className="mt-3">
                <span className="font-medium text-muted-foreground text-sm">
                  Preview:
                </span>
                <p className="text-sm text-foreground mt-1 p-2 bg-background rounded border">
                  {email.email_snippet}
                </p>
              </div>
            )}
          </div>

          {/* Manual Correction Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Google, Microsoft, Startup Inc."
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                This is required and will be used to identify the application.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Software Engineer, Product Manager"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Application Status</Label>
              <Select
                value={status}
                onValueChange={setStatus}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((statusOption) => (
                    <SelectItem key={statusOption} value={statusOption}>
                      {statusOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNotes(e.target.value)
                }
                placeholder="Any additional notes about this application..."
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || !companyName.trim()}
          >
            {isSubmitting ? "Creating Application..." : "Create Application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
