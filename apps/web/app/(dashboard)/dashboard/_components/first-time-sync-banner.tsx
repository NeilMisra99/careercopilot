"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Mail, CheckCircle } from "lucide-react";
import { syncGmailNowAction } from "../_lib/actions/sync-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSyncProgress } from "@/hooks/use-sync-progress";
import { createClient } from "@/lib/supabase/client";

interface FirstTimeSyncBannerProps {
  integrationEmail?: string | null;
}

export function FirstTimeSyncBanner({
  integrationEmail,
}: FirstTimeSyncBannerProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isInitiatingSync, setIsInitiatingSync] = useState(false);

  const { syncState } = useSyncProgress(userId || undefined);

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
      }
    };

    getUser();
  }, []);

  // Return null if sync is in progress or if we have completed sync
  if (
    syncState.inProgress ||
    (syncState.hasIntegration && syncState.lastCompleted)
  ) {
    return null;
  }

  const handleStartSync = async () => {
    setIsInitiatingSync(true);
    try {
      const result = await syncGmailNowAction();
      if (result.success) {
        toast.success("Sync started!", {
          description: result.message,
        });
      } else {
        toast.error("Sync failed", {
          description: result.error || "Unknown error occurred",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Failed to start sync. Please try again.",
      });
    } finally {
      setIsInitiatingSync(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 max-w-2xl mx-auto">
      <CardContent className="p-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
              <Mail className="h-6 w-6 text-amber-600" />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-amber-900 dark:text-amber-100">
              Gmail Connected Successfully!
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 max-w-md mx-auto leading-relaxed">
              Ready to scan {integrationEmail || "your Gmail"} for job
              applications
            </p>
          </div>

          <Button
            onClick={handleStartSync}
            disabled={isInitiatingSync}
            size="lg"
            className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
          >
            {isInitiatingSync ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Start Scanning
              </>
            )}
          </Button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Scans last 30 days</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Finds job applications</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Updates automatically</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
