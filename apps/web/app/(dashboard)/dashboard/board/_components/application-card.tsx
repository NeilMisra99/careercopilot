"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow } from "date-fns";
import {
  Building2,
  Calendar,
  ExternalLink,
  PencilIcon,
  User,
} from "lucide-react";
import React, { useState } from "react";
import { EditApplicationDialog } from "../../_components/edit-application-dialog";

interface Application {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  notes?: string;
  job_url?: string;
  source_email_id?: string;
  source_thread_id?: string;
  application_date?: string;
  location?: string | null;
  salary_range?: string | null;
}

interface ApplicationCardProps {
  application: Application;
  bgColor?: string;
  onApplicationUpdated?: () => void;
}

export function ApplicationCard({
  application,
  bgColor = "bg-primary/5",
  onApplicationUpdated,
}: ApplicationCardProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    data: {
      type: "ApplicationCard",
      application: application,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const date = new Date(application.applied_at);
  const timeAgo = formatDistanceToNow(date, { addSuffix: true });

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDialogOpen(true);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <Card
          className={`group cursor-pointer rounded-lg border p-3 transition-all duration-200 ${
            isDragging
              ? "border-border bg-card dark:bg-muted scale-105 shadow-xl shadow-black/20 dark:shadow-black/40"
              : "border-border bg-card hover:bg-accent/50 dark:bg-muted dark:hover:bg-accent/30 shadow-sm hover:shadow-md"
          }`}
        >
          <div>
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Building2 className="text-muted-foreground mt-0.5 h-3 w-3 flex-shrink-0" />
                  <h3 className="text-foreground line-clamp-2 text-sm leading-tight font-medium">
                    {application.company_name}
                  </h3>
                </div>
                <div className="flex items-start gap-2">
                  <User className="text-muted-foreground mt-0.5 h-3 w-3 flex-shrink-0" />
                  <p className="text-muted-foreground line-clamp-2 text-xs leading-tight">
                    {application.role}
                  </p>
                </div>
              </div>
              <div className="ml-2 flex flex-shrink-0 items-start gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEditClick}
                  className="h-6 w-6 p-0 opacity-0 transition-all duration-200 ease-out group-hover:opacity-70 hover:scale-110 hover:opacity-100"
                  title="Edit application"
                >
                  <PencilIcon className="h-3 w-3" />
                </Button>
                {application.job_url && (
                  <a
                    href={application.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:bg-muted/50 flex-shrink-0 rounded p-1 opacity-0 transition-all duration-200 group-hover:opacity-70 hover:opacity-100 hover:scale-110"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Notes preview */}
            {application.notes && (
              <div className="bg-muted/50 mb-3 rounded-md p-2">
                <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                  {application.notes}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs">
              <div className="text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{timeAgo}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${bgColor}`} />
                <span className="text-muted-foreground">
                  {application.status}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <EditApplicationDialog
        application={application}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onApplicationUpdated={onApplicationUpdated}
      />
    </>
  );
}
