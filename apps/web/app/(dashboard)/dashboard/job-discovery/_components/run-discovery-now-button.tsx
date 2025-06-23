"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { runDiscoveryNowAction } from "../_lib/actions";

export function RunDiscoveryNowButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    const result = await runDiscoveryNowAction(false);
    setLoading(false);

    if (result.success) {
      toast.success(result.message || "Discovery started");
      // Wait a few seconds then refresh to pull new data
      setTimeout(() => router.refresh(), 8000);
    } else {
      toast.error(result.error || "Failed to start discovery");
    }
  };

  return (
    <Button onClick={handleClick} disabled={loading} variant="secondary">
      {loading ? (
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-2 h-4 w-4" />
      )}
      {loading ? "Launching…" : "Run Discovery Now"}
    </Button>
  );
}
