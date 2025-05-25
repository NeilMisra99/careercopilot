"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface AISuggestion {
  id: string;
  suggested_company_name: string;
  suggested_role: string;
  suggested_status: string;
  suggestion_type: string;
  suggestion_lifecycle_status: string;
  raw_email_data?: {
    email_id?: string;
    email_thread_id?: string;
    email_subject?: string;
    email_from?: string;
    email_date?: string;
    email_snippet?: string;
  };
  suggestion_details?: {
    previous_status?: string;
    suggested_status?: string;
  };
  created_at: string;
}

interface AISuggestionsReviewProps {
  suggestions: AISuggestion[];
  onSuggestionUpdate: (
    suggestionId: string,
    action: "confirm" | "reject"
  ) => void;
}

function EmailViewerDialog({ suggestion }: { suggestion: AISuggestion }) {
  const emailData = suggestion.raw_email_data;

  if (!emailData) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-lg">Original Email Context</DialogTitle>
          <DialogDescription>
            This is the email that triggered the AI suggestion for{" "}
            <span className="font-medium">
              {suggestion.suggested_company_name}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {/* Email metadata */}
            <div className="grid grid-cols-1 gap-3 p-4 bg-stone-50 dark:bg-stone-800 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-stone-600 dark:text-stone-400">
                    From:
                  </span>
                  <p className="text-stone-900 dark:text-stone-100 mt-1 break-all">
                    {emailData.email_from || "Unknown sender"}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-stone-600 dark:text-stone-400">
                    Date:
                  </span>
                  <p className="text-stone-900 dark:text-stone-100 mt-1">
                    {emailData.email_date
                      ? new Date(emailData.email_date).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )
                      : "Unknown date"}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-stone-600 dark:text-stone-400">
                    Subject:
                  </span>
                  <p className="text-stone-900 dark:text-stone-100 mt-1 break-words">
                    {emailData.email_subject || "No subject"}
                  </p>
                </div>
              </div>
            </div>

            {/* Email content */}
            <div>
              <h4 className="font-medium text-stone-900 dark:text-stone-100 mb-2">
                Email Content:
              </h4>
              <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg">
                <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed">
                  {emailData.email_snippet || "No content available"}
                </p>
              </div>
            </div>

            {/* AI reasoning */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                Why AI suggested this:
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Based on the email content, our AI detected this appears to be a{" "}
                <span className="font-medium">
                  {suggestion.suggestion_type.replace(/_/g, " ")}
                </span>
                {suggestion.suggestion_details?.previous_status && (
                  <>
                    {" "}
                    suggesting a status change from{" "}
                    <span className="font-medium">
                      {suggestion.suggestion_details.previous_status}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium">
                      {suggestion.suggested_status}
                    </span>
                  </>
                )}
                .
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function AISuggestionsReview({
  suggestions,
  onSuggestionUpdate,
}: AISuggestionsReviewProps) {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );

  const pendingSuggestions = suggestions.filter(
    (s) => s.suggestion_lifecycle_status === "Pending"
  );

  if (pendingSuggestions.length === 0) {
    return null;
  }

  const handleAction = async (
    suggestionId: string,
    action: "confirm" | "reject"
  ) => {
    setLoadingStates((prev) => ({ ...prev, [suggestionId]: true }));

    try {
      const response = await fetch(`/api/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestion_lifecycle_status:
            action === "confirm" ? "Confirmed" : "Rejected",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update suggestion");
      }

      onSuggestionUpdate(suggestionId, action);
      toast.success(
        action === "confirm" ? "Suggestion confirmed!" : "Suggestion rejected"
      );
    } catch (error) {
      console.error("Error updating suggestion:", error);
      toast.error("Failed to update suggestion");
    } finally {
      setLoadingStates((prev) => {
        const newState = { ...prev };
        newState[suggestionId] = false;
        return newState;
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "wishlist":
        return "secondary";
      case "applied":
        return "secondary";
      case "screening":
        return "secondary";
      case "interviewing":
        return "secondary";
      case "offer":
      case "offer extended":
        return "secondary";
      case "rejected":
        return "destructive";
      case "withdrawn":
        return "outline";
      default:
        return "outline";
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "wishlist":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 transition-colors";
      case "applied":
        return "text-violet-500 bg-violet-500/10 border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/30 transition-colors";
      case "screening":
        return "text-orange-500 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30 transition-colors";
      case "interviewing":
        return "text-indigo-500 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-colors";
      case "offer":
      case "offer extended":
        return "text-green-500 bg-green-500/10 border-green-500/20 hover:bg-green-500/20 hover:border-green-500/30 transition-colors";
      case "rejected":
        return "text-red-500 bg-red-500/10 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-colors";
      case "withdrawn":
        return "text-gray-500 bg-gray-500/10 border-gray-500/20 hover:bg-gray-500/20 hover:border-gray-500/30 transition-colors";
      default:
        return "text-gray-500 bg-gray-500/10 border-gray-500/20 hover:bg-gray-500/20 hover:border-gray-500/30 transition-colors";
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-2">
        {pendingSuggestions.map((suggestion) => (
          <Card
            key={suggestion.id}
            className="hover:shadow-sm transition-shadow"
          >
            <CardContent className="p-4">
              {/* Header with company and role */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-medium text-sm text-stone-900 dark:text-stone-100">
                    {suggestion.suggested_company_name}
                  </h4>
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                    {suggestion.suggested_role}
                  </p>
                </div>
                <Badge
                  variant={getStatusColor(suggestion.suggested_status)}
                  className={`text-xs ${getStatusColorClass(suggestion.suggested_status)}`}
                >
                  {suggestion.suggested_status}
                </Badge>
              </div>

              {/* Status change info if available */}
              {suggestion.suggestion_details?.previous_status && (
                <div className="text-xs text-stone-600 dark:text-stone-400 mb-3">
                  Status update: {suggestion.suggestion_details.previous_status}{" "}
                  → {suggestion.suggested_status}
                </div>
              )}

              {/* Email context */}
              {suggestion.raw_email_data?.email_subject && (
                <div className="text-xs text-stone-500 dark:text-stone-500 mb-3 p-2 bg-stone-50 dark:bg-stone-800 rounded">
                  <Mail className="h-3 w-3 inline mr-1" />
                  {suggestion.raw_email_data.email_subject}
                </div>
              )}

              {/* View Email Link */}
              {suggestion.raw_email_data && (
                <div className="mb-3 flex justify-end">
                  <EmailViewerDialog suggestion={suggestion} />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAction(suggestion.id, "confirm")}
                  disabled={loadingStates[suggestion.id]}
                  className="flex-1 h-8 text-xs"
                >
                  {loadingStates[suggestion.id] ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Confirm
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(suggestion.id, "reject")}
                  disabled={loadingStates[suggestion.id]}
                  className="flex-1 h-8 text-xs"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </div>

              {/* Timestamp */}
              <div className="text-xs text-stone-400 dark:text-stone-500 mt-2 text-center">
                {formatDistanceToNow(new Date(suggestion.created_at), {
                  addSuffix: true,
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
