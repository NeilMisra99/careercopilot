"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Building2, Calendar, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
}

interface ApplicationCardProps {
  application: Application;
  color?: string;
  bgColor?: string;
}

export function ApplicationCard({
  application,
  color = "text-primary",
  bgColor = "bg-primary/5",
}: ApplicationCardProps) {
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
    opacity: isDragging ? 0.3 : 1,
  };

  const date = new Date(application.applied_at);
  const timeAgo = formatDistanceToNow(date, { addSuffix: true });

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${bgColor} px-3 py-3 cursor-grab relative group hover:shadow-md transition-all duration-200 hover:-translate-y-1 w-full`}
    >
      <div className="flex flex-col">
        <div className="flex justify-between items-start mb-1">
          <div className="font-medium text-xs line-clamp-1 flex items-center gap-1">
            <Building2 className={`h-3 w-3 ${color}`} />
            {application.company_name}
          </div>
          {application.job_url && (
            <a
              href={application.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-50 hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="text-xs text-muted-foreground line-clamp-1 mb-2">
          {application.role}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
          <Calendar className="h-2.5 w-2.5" />
          <span>{timeAgo}</span>
        </div>
      </div>
    </Card>
  );
}
