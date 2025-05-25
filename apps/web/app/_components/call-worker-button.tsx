"use client";

import { useState, useTransition } from "react";
import { callWorkerEndpoint, type ActionResult } from "../actions"; // Adjusted path
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CallWorkerButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const actionResult = await callWorkerEndpoint();
      setResult(actionResult);
      if (actionResult.error) {
        toast.error(actionResult.error);
      } else if (actionResult.message) {
        toast.success(actionResult.message);
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-4">
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? "Calling Worker..." : "Call Protected Worker Endpoint"}
      </Button>
      {result && (
        <div className="mt-4 p-4 bg-muted rounded-md w-full max-w-md text-left">
          <h3 className="font-semibold text-lg mb-2">Action Result:</h3>
          {result.message && (
            <p className="text-sm text-green-600">{result.message}</p>
          )}
          {result.error && (
            <p className="text-sm text-red-600">Error: {result.error}</p>
          )}
          {result.data !== undefined && result.data !== null && (
            <pre className="text-xs bg-popover p-2 rounded-sm mt-2 overflow-x-auto">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
