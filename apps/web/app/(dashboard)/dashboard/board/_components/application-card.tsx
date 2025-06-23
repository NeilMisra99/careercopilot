"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { Building2, Calendar, ExternalLink, PencilIcon } from "lucide-react";
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
  color?: string;
  bgColor?: string;
  onApplicationUpdated?: () => void;
}

export function ApplicationCard({
  application,
  color = "text-primary",
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
      <motion.div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{
          transition: { duration: 0.2, ease: "easeOut" },
        }}
        whileTap={{ scale: 0.98 }}
        className="cursor-grab active:cursor-grabbing"
      >
        <Card
          className={`group relative overflow-hidden border border-slate-200/60 bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out hover:border-slate-300/80 hover:bg-slate-50/95 hover:shadow-md hover:shadow-black/5 dark:border-slate-700/60 dark:bg-slate-800/80 dark:hover:border-slate-600/80 dark:hover:bg-slate-700/90 dark:hover:shadow-black/15 ${isDragging ? "scale-105 rotate-2 shadow-xl shadow-black/10 dark:shadow-black/30" : ""} `}
        >
          {/* Status indicator */}
          <div
            className={`absolute top-0 left-0 h-1 w-full ${bgColor.replace(/\/\d+/, "/60")}`}
          />

          <div className="p-4">
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className={`flex-shrink-0 ${color}`}>
                  <Building2 className="h-4 w-4" />
                </div>
                <h3 className="text-foreground/90 truncate text-sm font-semibold">
                  {application.company_name}
                </h3>
              </div>
              <div className="flex items-center gap-1">
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
                  <motion.a
                    href={application.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="hover:bg-muted/50 flex-shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-70 hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
                  </motion.a>
                )}
              </div>
            </div>

            {/* Role */}
            <div className="mb-3">
              <p className="text-muted-foreground text-sm leading-relaxed font-medium">
                {application.role}
              </p>
            </div>

            {/* Notes preview */}
            {application.notes && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.3 }}
                className="bg-muted/30 mb-3 rounded-md p-2"
              >
                <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                  {application.notes}
                </p>
              </motion.div>
            )}

            {/* Footer */}
            <div className="text-muted-foreground/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span className="font-medium">{timeAgo}</span>
              </div>
              <motion.div
                className={`rounded-full px-2 py-1 text-xs font-medium ${bgColor} ${color}`}
              >
                {application.status}
              </motion.div>
            </div>
          </div>
        </Card>
      </motion.div>

      <EditApplicationDialog
        application={application}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onApplicationUpdated={onApplicationUpdated}
      />
    </>
  );
}
