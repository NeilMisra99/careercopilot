"use client";

import { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";

interface ApplicationColumnProps {
  id: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  count?: number;
  className?: string;
}

export function ApplicationColumn({
  id,
  title,
  children,
  icon,
  count = 0,
  className = "",
}: ApplicationColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full relative ${
        isOver ? "bg-primary/5" : ""
      } ${className}`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between py-2 mb-2 flex-shrink-0 backdrop-blur-sm bg-transparent z-10">
        <div className="flex items-center space-x-2">
          {icon}
          <h3 className="font-medium text-sm">{title}</h3>
        </div>
        <Badge variant="outline" className="font-normal">
          {count}
        </Badge>
      </div>

      {/* Column content */}
      <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-2 pt-1">
        {children}
      </div>

      {/* Vertical separator on the right */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-border/40 h-full" />
    </div>
  );
}
