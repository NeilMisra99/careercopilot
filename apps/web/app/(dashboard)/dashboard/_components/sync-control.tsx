"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Clock,
  Mail,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getSyncStatusAction,
  syncGmailNowAction,
} from "../_lib/actions/sync-actions";

interface SyncControlProps {
  className?: string;
}

export function SyncControl({ className }: SyncControlProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    integration: {
      id: string;
      email: string;
    };
    sync: {
      inProgress: boolean;
      lastStarted: string | null;
      lastCompleted: string | null;
      lastSummary: {
        emails_processed: number;
        applications_found: number;
        error: string | null;
        sync_type: "manual" | "scheduled";
      } | null;
      lastSuccessfulSync: string | null;
    };
    rateLimit: {
      canSyncNow: boolean;
      rateLimitedUntil: string | null;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll sync status
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkSyncStatus = async () => {
      try {
        const result = await getSyncStatusAction();
        if (result.success && result.data) {
          const wasInProgress = syncStatus?.sync.inProgress;
          setSyncStatus(result.data);
          setError(null);

          // Show completion toast if sync just completed
          if (wasInProgress && !result.data.sync.inProgress) {
            const summary = result.data.sync.lastSummary;
            if (summary?.error) {
              toast.error("Sync failed", {
                description: summary.error,
              });
            } else {
              toast.success("Sync completed!", {
                description: summary
                  ? `Processed ${summary.emails_processed} emails, found ${summary.applications_found} applications`
                  : "Your emails have been synced successfully",
              });
            }
          }
        } else {
          setError(result.error || "Failed to get sync status");
        }
      } catch {
        setError("Network error");
      }
    };

    // Initial check
    checkSyncStatus();

    // Poll every 10 seconds when sync is in progress
    if (syncStatus?.sync.inProgress) {
      interval = setInterval(checkSyncStatus, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncStatus?.sync.inProgress]);

  const handleSync = async () => {
    if (
      isLoading ||
      syncStatus?.sync.inProgress ||
      !syncStatus?.rateLimit.canSyncNow
    )
      return;

    setIsLoading(true);
    const toastId = toast.loading("Starting email sync...", {
      description: "This may take a few moments",
    });

    try {
      const result = await syncGmailNowAction();

      if (!result.success) {
        toast.error(result.message, {
          id: toastId,
          description: result.error,
        });
        return;
      }

      toast.success("Sync started!", {
        id: toastId,
        description: "Your emails are being processed in the background.",
      });

      // Update status to show sync in progress
      setSyncStatus((prev) =>
        prev
          ? {
              ...prev,
              sync: { ...prev.sync, inProgress: true },
            }
          : null,
      );

      // Close popover after successful sync start
      setIsPopoverOpen(false);
    } catch {
      toast.error("Network error", {
        id: toastId,
        description: "Failed to connect to the server. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (error && !syncStatus) {
    return (
      <div
        className={`text-muted-foreground flex items-center gap-2 text-sm ${className}`}
      >
        <AlertCircle className="text-destructive h-4 w-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (!syncStatus) {
    return (
      <div
        className={`text-muted-foreground flex items-center gap-2 text-sm ${className}`}
      >
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading sync status...</span>
      </div>
    );
  }

  const { integration, sync, rateLimit } = syncStatus;
  const isDisabled = isLoading || sync.inProgress || !rateLimit.canSyncNow;
  const showRateLimit = rateLimit.rateLimitedUntil && !rateLimit.canSyncNow;

  const getStatusIcon = () => {
    if (sync.inProgress) {
      return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
    }
    if (sync.lastSummary?.error) {
      return <AlertCircle className="text-destructive h-4 w-4" />;
    }
    if (sync.lastSummary && !sync.lastSummary.error) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <Mail className="text-muted-foreground h-4 w-4" />;
  };

  const getButtonText = () => {
    if (isLoading) return "Starting...";
    if (sync.inProgress) return "Syncing...";
    if (showRateLimit) return "Rate Limited";
    if (sync.lastSummary?.error) return "Sync Failed";
    if (sync.lastSummary && !sync.lastSummary.error) {
      return "Synced";
    }
    return "Sync Email";
  };

  const getVariant = () => {
    if (sync.lastSummary?.error) return "destructive";
    if (showRateLimit) return "secondary";
    return "outline";
  };

  const getStatusText = () => {
    if (sync.inProgress) {
      return "Sync in progress...";
    }
    if (sync.lastSummary?.error) {
      return "Last sync failed";
    }
    if (sync.lastCompleted) {
      return `Last synced ${formatDistanceToNow(new Date(sync.lastCompleted), { addSuffix: true })}`;
    }
    return "No sync history";
  };

  return (
    <div className={className}>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        {/* Unified sync control button */}
        <PopoverTrigger asChild>
          <Button size="default" variant={getVariant()} className="gap-2">
            {getStatusIcon()}
            <span>{getButtonText()}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </PopoverTrigger>

        {/* Popover content with detailed sync information */}
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{integration.email}</div>
              <Badge
                variant={
                  sync.inProgress
                    ? "secondary"
                    : sync.lastSummary?.error
                      ? "destructive"
                      : "default"
                }
                className={
                  !sync.inProgress && !sync.lastSummary?.error
                    ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                    : ""
                }
              >
                {sync.inProgress
                  ? "Active"
                  : sync.lastSummary?.error
                    ? "Error"
                    : "Ready"}
              </Badge>
            </div>

            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </div>

            {sync.lastSummary && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Emails Processed</div>
                  <div className="font-medium">
                    {sync.lastSummary.emails_processed}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    Applications Found
                  </div>
                  <div className="font-medium">
                    {sync.lastSummary.applications_found}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleSync}
              disabled={isDisabled}
              variant={isDisabled ? "secondary" : "default"}
              className="w-full"
              size="sm"
            >
              {getStatusIcon()}
              <span className="ml-2">
                {isLoading
                  ? "Starting..."
                  : sync.inProgress
                    ? "Syncing..."
                    : showRateLimit
                      ? "Rate Limited"
                      : "Sync Now"}
              </span>
            </Button>

            {sync.lastSummary?.error && (
              <div className="text-destructive bg-destructive/10 rounded p-2 text-sm">
                {sync.lastSummary.error}
              </div>
            )}

            {showRateLimit && rateLimit.rateLimitedUntil && (
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                <span>
                  Can sync again{" "}
                  {formatDistanceToNow(new Date(rateLimit.rateLimitedUntil), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
