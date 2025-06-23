"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  FileText,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadResumeAction } from "../_lib/actions/resume-actions";

interface ResumeUploadDialogProps {
  children?: React.ReactNode;
  onResumeUploaded?: (resumeData: {
    id: string;
    name: string;
    file_name: string;
    file_path: string;
  }) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "completed" | "error";
  error?: string;
}

export function ResumeUploadDialog({
  children,
  onResumeUploaded,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ResumeUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use controlled props if provided, otherwise use internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : open;
  const onOpenChange = controlledOnOpenChange || setOpen;

  const handleFiles = useCallback(
    async (files: FileList) => {
      const validFiles = Array.from(files).filter((file) => {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name} is not a PDF file`);
          return false;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 10MB)`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      // Add files to upload queue
      const newUploadingFiles: UploadingFile[] = validFiles.map((file) => ({
        file,
        progress: 0,
        status: "uploading",
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      // Upload files
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        try {
          // Simulate upload progress
          setUploadingFiles((prev) =>
            prev.map((f) => (f.file === file ? { ...f, progress: 50 } : f)),
          );

          const formData = new FormData();
          formData.append("file", file);

          const result = await uploadResumeAction(formData);

          if (result.success && result.data) {
            // Upload complete
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.file === file
                  ? { ...f, progress: 100, status: "completed" }
                  : f,
              ),
            );

            // Notify parent with resume data for optimistic update
            if (onResumeUploaded) {
              onResumeUploaded({
                id: result.data.id,
                name: result.data.name,
                file_name: file.name,
                file_path: result.data.file_path,
              });
            }

            // Close dialog after successful upload
            setTimeout(() => {
              onOpenChange(false);
              setUploadingFiles([]);
            }, 1000);
          } else {
            throw new Error(result.error || "Upload failed");
          }
        } catch (error) {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === file
                ? {
                    ...f,
                    status: "error",
                    error:
                      error instanceof Error ? error.message : "Upload failed",
                  }
                : f,
            ),
          );

          toast.error(`Failed to upload ${file.name}`, {
            description:
              error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    },
    [onResumeUploaded, onOpenChange],
  );

  const removeFile = (index: number) => {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    // Only allow closing if no files are currently uploading
    const hasActiveUploads = uploadingFiles.some(
      (file) => file.status === "uploading",
    );

    if (hasActiveUploads) {
      toast.warning("Please wait for uploads to complete");
      return;
    }

    onOpenChange(false);
    // Clear files when closing
    setUploadingFiles([]);
  };

  const getStatusIcon = (status: UploadingFile["status"]) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusText = (status: UploadingFile["status"]) => {
    switch (status) {
      case "uploading":
        return "Uploading...";
      case "completed":
        return "Complete";
      case "error":
        return "Error";
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={handleClose}
        onEscapeKeyDown={handleClose}
      >
        <DialogHeader>
          <DialogTitle>Upload Resume</DialogTitle>
          <DialogDescription>
            Upload your resume in PDF format for AI-powered analysis and job
            matching.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          <div
            className={cn(
              "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                : "border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500",
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const files = e.dataTransfer.files;
              if (files) {
                handleFiles(files);
              }
            }}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium">
              Drop your resume here or{" "}
              <button
                type="button"
                onClick={handleBrowseClick}
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                browse files
              </button>
            </h3>
            <p className="mt-2 text-sm text-gray-500">PDF files up to 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFiles(e.target.files);
                }
              }}
            />
          </div>

          {/* File List */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Files</h4>
              {uploadingFiles.map((file, index) => (
                <div
                  key={`${file.file.name}-${index}`}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.file.name}
                      </p>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(file.status)}
                        <span className="text-xs text-gray-500">
                          {getStatusText(file.status)}
                        </span>
                      </div>
                      {file.error && (
                        <p className="text-xs text-red-500">{file.error}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {file.status === "uploading" && (
                      <div className="w-20">
                        <div className="h-1 rounded-full bg-gray-200">
                          <div
                            className="h-1 rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {(file.status === "completed" ||
                      file.status === "error") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
