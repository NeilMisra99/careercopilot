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
        className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 max-w-2xl bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
        onPointerDownOutside={handleClose}
        onEscapeKeyDown={handleClose}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg font-medium">
            Upload Resume
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Upload your resume in PDF format for AI-powered analysis and job
            matching.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          <div
            className={cn(
              "bg-card relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all",
              dragActive
                ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950"
                : "border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500",
            )}
            onClick={(e) => {
              // Only trigger if clicking on the div itself, not on child elements, and not during drag
              if (e.target === e.currentTarget && !dragActive) {
                handleBrowseClick();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              // Only deactivate if leaving the dropzone entirely
              if (e.currentTarget.contains(e.relatedTarget as Node)) {
                return;
              }
              setDragActive(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                handleFiles(files);
              }
            }}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="text-foreground mt-4 text-sm font-medium">
              Drop your resume here or{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleBrowseClick();
                }}
                className="cursor-pointer text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                browse files
              </button>
            </h3>
            <p className="text-muted-foreground mt-2 text-xs">
              PDF files up to 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFiles(e.target.files);
                  // Reset the input so the same file can be selected again
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* File List */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-foreground text-sm font-medium">Files</h4>
              {uploadingFiles.map((file, index) => (
                <div
                  key={`${file.file.name}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
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
