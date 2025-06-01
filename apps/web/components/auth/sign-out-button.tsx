"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSignOut = async () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/signout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success) {
          toast.success(result.message || "Successfully signed out!");
          router.push("/auth/login");
          router.refresh(); // Ensures fresh state on redirect
        } else {
          toast.error(result.message || "Sign out failed. Please try again.");
        }
      } catch {
        toast.error("An unexpected error occurred during sign out.");
      }
    });
  };

  return (
    <Button
      onClick={handleSignOut}
      disabled={isPending}
      variant="outline"
      size="icon"
    >
      <LogOut className="h-5 w-5" />
      <span className="sr-only">Sign Out</span>
    </Button>
  );
}
