"use client";

import { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

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
      className={`flex flex-col h-full relative transition-all duration-300 ${
        isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-offset-2" : ""
      } ${className}`}
    >
      {/* Column header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.1 + 0.2 }}
        whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
        className="flex items-center justify-between py-3 px-3 mb-4 flex-shrink-0 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-sm"
      >
        <div className="flex items-center space-x-2">
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <h3 className="font-semibold text-sm text-foreground/90">{title}</h3>
        </div>
        <Badge
          variant="secondary"
          className="font-medium text-xs bg-muted/70 text-muted-foreground"
        >
          {count}
        </Badge>
      </motion.div>

      {/* Column content */}
      <div className="flex-1 min-h-0 px-3 pb-3">
        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent">
          {children}
        </div>
      </div>
    </motion.div>
  );
}
