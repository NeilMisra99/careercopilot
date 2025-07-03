"use client";

import {
  createInterviewSessionAction,
  triggerInterviewBriefGenerationAction,
  triggerInterviewQuestionGenerationAction,
  triggerStarStoryExtractionAction,
} from "@/app/(dashboard)/dashboard/interview-prep/_lib/actions/interview-prep-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type {
  Application,
  CreateSessionData,
  InterviewSession,
  Resume,
} from "../_lib/types";

interface CreateSessionDialogProps {
  applications: Application[];
  resumes: Resume[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session: InterviewSession) => void;
}

export function CreateSessionDialog({
  applications,
  resumes,
  isOpen,
  onClose,
  onSuccess,
}: CreateSessionDialogProps) {
  const [formData, setFormData] = useState<CreateSessionData>({
    sessionName: "",
    sessionType: "behavioral",
    applicationId: "",
    resumeId: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sessionName.trim()) {
      setError("Session name is required");
      return;
    }
    if (!formData.applicationId) {
      setError("Please select an application");
      return;
    }
    if (!formData.resumeId) {
      setError("Please select a resume");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await createInterviewSessionAction(
        formData.sessionName.trim(),
        formData.sessionType,
        formData.applicationId,
        formData.resumeId,
      );

      if (result.success && result.data) {
        // Find the selected application and resume to construct the full session object
        const selectedApplication = applications.find(
          (app) => app.id === formData.applicationId,
        );
        const selectedResume = resumes.find(
          (resume) => resume.id === formData.resumeId,
        );

        if (selectedApplication && selectedResume) {
          // Construct the full session object with nested data
          const fullSession: InterviewSession = {
            ...(result.data as InterviewSession),
            application_id: selectedApplication.id,
            resume_id: selectedResume.id,
            applications: {
              id: selectedApplication.id,
              company_name: selectedApplication.company_name,
              role: selectedApplication.role,
              job_description: selectedApplication.job_description,
            },
            resumes: {
              id: selectedResume.id,
              name: selectedResume.name,
            },
          };

          onSuccess(fullSession);

          // Show success toast
          toast.success("Interview session created!", {
            description:
              "AI is now generating questions, brief, and STAR stories for your session.",
          });

          // Automatically trigger generation for new sessions
          try {
            const generationPromises = [
              triggerInterviewQuestionGenerationAction(
                fullSession.id,
                fullSession.application_id,
                fullSession.resume_id,
                fullSession.session_type,
                false, // not force refresh since it's a new session
              ),
              triggerInterviewBriefGenerationAction(
                fullSession.id,
                fullSession.application_id,
                fullSession.resume_id,
                false, // not force refresh since it's a new session
              ),
              // Always trigger star story extraction for new sessions (session-specific)
              triggerStarStoryExtractionAction(
                fullSession.id, // sessionId (required)
                fullSession.application_id, // applicationId (required for job context)
                fullSession.resume_id, // resumeId
                false, // not force refresh
              ),
            ];

            await Promise.all(generationPromises);
          } catch (triggerError) {
            console.error(
              "Failed to trigger automatic generation:",
              triggerError,
            );
            // Don't fail the creation process, just log the error
          }

          // Reset form
          setFormData({
            sessionName: "",
            sessionType: "behavioral",
            applicationId: "",
            resumeId: "",
          });
        } else {
          setError("Failed to find selected application or resume");
        }
      } else {
        setError(result.error || "Failed to create session");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
      setError("");
      setFormData({
        sessionName: "",
        sessionType: "behavioral",
        applicationId: "",
        resumeId: "",
      });
    }
  };

  const getSessionTypeDescription = (type: string) => {
    switch (type) {
      case "behavioral":
        return "Focus on past experiences, leadership, and problem-solving situations";
      case "technical":
        return "Technical skills assessment and problem-solving challenges";
      case "company_specific":
        return "Company culture, values, and role-specific questions";
      case "mixed":
        return "Combination of behavioral, technical, and company-specific questions";
      default:
        return "";
    }
  };

  const getSessionTypeDisplayName = (type: string) => {
    switch (type) {
      case "behavioral":
        return "Behavioral";
      case "technical":
        return "Technical";
      case "company_specific":
        return "Company Specific";
      case "mixed":
        return "Mixed";
      default:
        return "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg font-medium">
            Create Interview Session
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Set up a new AI-powered interview preparation session for a specific
            application.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Session Name */}
          <div className="space-y-2">
            <Label htmlFor="sessionName">Session Name</Label>
            <Input
              id="sessionName"
              value={formData.sessionName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  sessionName: e.target.value,
                }))
              }
              placeholder="e.g., Technical interview - Google"
              className="truncate"
              required
            />
          </div>

          {/* Application Selection */}
          <div className="space-y-2">
            <Label htmlFor="application">Application</Label>
            <Select
              value={formData.applicationId}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, applicationId: value }))
              }
              required
            >
              <SelectTrigger className="w-full">
                <div className="flex w-full min-w-0 items-center">
                  {formData.applicationId ? (
                    <span className="block w-full truncate text-left">
                      {(() => {
                        const app = applications.find(
                          (a) => a.id === formData.applicationId,
                        );
                        if (!app) return "Select an application";
                        const displayText = `${app.company_name} - ${app.role}`;
                        return displayText.length > 50
                          ? `${displayText.substring(0, 50)}...`
                          : displayText;
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Select an application
                    </span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                {applications.map((app) => (
                  <SelectItem
                    key={app.id}
                    value={app.id}
                    className="h-auto py-3"
                    textValue={`${app.company_name} - ${app.role}`}
                  >
                    <div className="flex w-full min-w-0 flex-col items-start gap-1">
                      <span className="block w-full truncate text-sm leading-tight font-medium">
                        {app.company_name}
                      </span>
                      <span className="text-muted-foreground block w-full truncate text-xs leading-tight">
                        {app.role}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {applications.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No applications found. Create an application first.
              </p>
            )}
          </div>

          {/* Resume Selection */}
          <div className="space-y-2">
            <Label htmlFor="resume">Resume</Label>
            <Select
              value={formData.resumeId}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, resumeId: value }))
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a resume" />
              </SelectTrigger>
              <SelectContent>
                {resumes
                  .filter((resume) => resume.parsing_status === "completed")
                  .map((resume) => (
                    <SelectItem key={resume.id} value={resume.id}>
                      {resume.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {resumes.filter((resume) => resume.parsing_status === "completed")
              .length === 0 && (
              <p className="text-muted-foreground text-sm">
                No parsed resumes found. Upload and parse a resume first.
              </p>
            )}
          </div>

          {/* Session Type */}
          <div className="space-y-2">
            <Label htmlFor="sessionType">Interview Type</Label>
            <Select
              value={formData.sessionType}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  sessionType: value as CreateSessionData["sessionType"],
                }))
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select interview type">
                  {formData.sessionType
                    ? getSessionTypeDisplayName(formData.sessionType)
                    : "Select interview type"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="behavioral">
                  <div className="flex flex-col">
                    <span className="font-medium">Behavioral</span>
                    <span className="text-muted-foreground text-sm">
                      STAR method, leadership, problem-solving
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="technical">
                  <div className="flex flex-col">
                    <span className="font-medium">Technical</span>
                    <span className="text-muted-foreground text-sm">
                      Skills assessment, coding challenges
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="company_specific">
                  <div className="flex flex-col">
                    <span className="font-medium">Company Specific</span>
                    <span className="text-muted-foreground text-sm">
                      Culture fit, company values, role-specific
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="mixed">
                  <div className="flex flex-col">
                    <span className="font-medium">Mixed</span>
                    <span className="text-muted-foreground text-sm">
                      Comprehensive preparation (recommended)
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {formData.sessionType && (
              <p className="text-muted-foreground text-sm">
                {getSessionTypeDescription(formData.sessionType)}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
              disabled={
                isLoading || !formData.applicationId || !formData.resumeId
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Session</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
