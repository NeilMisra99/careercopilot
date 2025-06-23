"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Target,
  XCircle,
} from "lucide-react";

interface ScrapeRun {
  id: string;
  keywords: string;
  location?: string;
  geoId?: string;
  pagesRequested: number;
  pagesFetched: number;
  jobsFound: number;
  status: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface RunsListProps {
  runs: ScrapeRun[];
  loading: boolean;
  onRefresh: () => void;
}

export function RunsList({ runs, loading, onRefresh }: RunsListProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInHours = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60),
      );

      if (diffInHours < 1) return "Just now";
      if (diffInHours < 24) return `${diffInHours}h ago`;
      if (diffInHours < 48) return "Yesterday";
      return date.toLocaleDateString();
    } catch {
      return "Unknown";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-gray-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "running":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "error":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "cancelled":
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700"></div>
                <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
                <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-700"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Clock className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              No scraping runs yet
            </h3>
            <p className="mx-auto max-w-md text-slate-600 dark:text-slate-400">
              Start your first job discovery to see the scraping history here.
            </p>
            <Button onClick={onRefresh} variant="outline" className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Scraping History ({runs.length})
        </h2>
        <Button
          onClick={onRefresh}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <AnimatePresence>
        {runs.map((run, index) => (
          <motion.div
            key={run.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="transition-shadow duration-200 hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Run Header */}
                    <div className="flex items-center gap-3">
                      {getStatusIcon(run.status)}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {run.keywords}
                          </h3>
                          <Badge
                            className={getStatusColor(run.status)}
                            variant="secondary"
                          >
                            {run.status}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <Search className="h-4 w-4 flex-shrink-0" />
                            <span>{run.keywords}</span>
                          </div>

                          {run.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4 flex-shrink-0" />
                              <span>{run.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Run Statistics */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="space-y-1">
                        <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                          Pages
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {run.pagesFetched} / {run.pagesRequested}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                          Jobs Found
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {run.jobsFound}
                          </p>
                          {run.jobsFound > 0 && (
                            <Target className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                          Started
                        </p>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {formatDate(run.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                          Duration
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {run.completedAt
                            ? (() => {
                                const start = new Date(run.createdAt);
                                const end = new Date(run.completedAt);
                                const diffInMinutes = Math.floor(
                                  (end.getTime() - start.getTime()) /
                                    (1000 * 60),
                                );

                                if (diffInMinutes < 1) return "< 1 min";
                                if (diffInMinutes < 60)
                                  return `${diffInMinutes} min`;
                                const hours = Math.floor(diffInMinutes / 60);
                                const minutes = diffInMinutes % 60;
                                return `${hours}h ${minutes}m`;
                              })()
                            : run.status === "running"
                              ? "Running..."
                              : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Error Message */}
                    {run.error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-red-900 dark:text-red-100">
                              Error occurred
                            </p>
                            <p className="text-sm break-words text-red-700 dark:text-red-300">
                              {run.error}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
