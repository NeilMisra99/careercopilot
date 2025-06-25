"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDroppable } from "@dnd-kit/core";
import { ReactNode } from "react";

interface ApplicationColumnProps {
  id: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  count?: number;
  className?: string;
  badgeColor?: string;
}

export function ApplicationColumn({
  id,
  title,
  children,
  icon,
  count = 0,
  className = "",
  badgeColor,
}: ApplicationColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex h-full flex-col rounded-lg transition-all duration-300 ${
        isOver ? "bg-accent/10 ring-primary/20 ring-2" : ""
      } ${className}`}
    >
      {/* Column header */}
      <div className="mb-3 flex flex-shrink-0 items-center justify-between rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-2">
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <h3 className="text-foreground text-sm font-medium">{title}</h3>
        </div>
        <Badge
          variant="outline"
          className={`text-xs ${badgeColor || "text-muted-foreground"}`}
        >
          {count}
        </Badge>
      </div>

      {/* Column content */}
      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full w-full">
          <div className="space-y-3 px-1">{children}</div>
        </ScrollArea>
      </div>
    </div>
  );
}
