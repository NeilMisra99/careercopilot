"use client";

import { Badge } from "@/components/ui/badge";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface ApplicationColumnProps {
  id: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  count?: number;
  className?: string;
  index?: number;
}

export function ApplicationColumn({
  id,
  title,
  children,
  icon,
  count = 0,
  className = "",
  index = 0,
}: ApplicationColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      ref={setNodeRef}
      className={`relative flex h-full flex-col transition-all duration-300 ${
        isOver ? "bg-primary/5 ring-primary/20 ring-2 ring-offset-2" : ""
      } ${className}`}
    >
      {/* Column header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.1 + 0.2 }}
        whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
        className="mb-4 flex flex-shrink-0 items-center justify-between rounded-xl border border-slate-200/50 bg-white/80 px-3 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/50"
      >
        <div className="flex items-center space-x-2">
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <h3 className="text-foreground/90 text-sm font-semibold">{title}</h3>
        </div>
        <Badge
          variant="secondary"
          className="bg-muted/70 text-muted-foreground text-xs font-medium"
        >
          {count}
        </Badge>
      </motion.div>

      {/* Column content */}
      <div className="min-h-0 flex-1 px-3 pb-3">
        <div className="scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent h-full overflow-y-auto">
          {children}
        </div>
      </div>
    </motion.div>
  );
}
