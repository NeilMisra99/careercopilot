import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-normal transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 box-border",
  {
    variants: {
      variant: {
        default:
          "bg-blue-600 text-white hover:bg-blue-700 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] border border-blue-700/20 bg-gradient-to-b from-blue-600 to-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:border-blue-700/30 dark:bg-gradient-to-b dark:from-blue-600 dark:to-blue-700",
        destructive:
          "border border-red-400 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] bg-gradient-to-b from-red-50 to-red-100/60 dark:border-transparent dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:bg-gradient-to-b dark:from-red-950/20 dark:to-red-950/40",
        submit:
          "border border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] bg-gradient-to-b from-blue-50 to-blue-100/60 dark:border-transparent dark:bg-blue-950/20 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:bg-gradient-to-b dark:from-blue-950/20 dark:to-blue-950/40",
        outline:
          "border border-gray-200/80 bg-white text-foreground hover:bg-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,1)] bg-gradient-to-b from-white to-gray-100/60 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:border-white/10 dark:bg-transparent dark:from-white/5 dark:to-transparent dark:hover:bg-white/5",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] border border-gray-200/80 bg-gradient-to-b from-secondary to-secondary/90 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:border-white/10 dark:bg-gradient-to-b dark:from-secondary dark:to-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded px-2 text-xs",
        lg: "h-9 rounded px-4",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
