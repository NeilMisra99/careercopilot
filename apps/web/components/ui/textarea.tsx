import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        "focus:border-primary focus:ring-2 focus:ring-primary/20",
        "hover:border-foreground/30",
        "dark:bg-background dark:border-border",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-all duration-200 resize-none",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
