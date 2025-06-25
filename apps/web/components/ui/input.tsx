import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-border bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        "focus:border-primary focus:ring-2 focus:ring-primary/20",
        "hover:border-foreground/30",
        "dark:bg-background dark:border-border",
        "file:text-foreground placeholder:text-muted-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20",
        "transition-all duration-200",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
