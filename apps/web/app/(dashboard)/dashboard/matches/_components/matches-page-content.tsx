"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Brain, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getMatchesAction,
  getMatchStatsAction,
  triggerBulkMatchingAction,
  triggerMatchingAction,
} from "../_lib/actions/matches-actions";
import { JobResumeMatch, MatchStats } from "../_lib/types";
import { MatchCard } from "./match-card";
import { MatchDetailsSheet } from "./match-details-sheet";
import { MatchStatsCards } from "./match-stats-cards";

interface MatchesPageContentProps {
  initialMatches: JobResumeMatch[];
  initialStats: MatchStats;
  error?: string;
}

export function MatchesPageContent({
  initialMatches,
  initialStats,
  error: initialError,
}: MatchesPageContentProps) {
  const matchesArray = Array.isArray(initialMatches) ? initialMatches : [];

  const [matches, setMatches] = useState<JobResumeMatch[]>(matchesArray);
  const [stats, setStats] = useState<MatchStats>(initialStats);
  const [filteredMatches, setFilteredMatches] =
    useState<JobResumeMatch[]>(matchesArray);
  const [selectedMatch, setSelectedMatch] = useState<JobResumeMatch | null>(
    null,
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("score");

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMatches, setIsGeneratingMatches] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | undefined>(initialError);
  const [successMessage, setSuccessMessage] = useState<string | undefined>();

  useEffect(() => {
    let filtered = [...matches];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (match) =>
          match.company_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          match.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          match.resume_name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Apply score filter
    if (scoreFilter !== "all") {
      switch (scoreFilter) {
        case "excellent":
          filtered = filtered.filter((match) => match.overall_fit_score >= 80);
          break;
        case "good":
          filtered = filtered.filter(
            (match) =>
              match.overall_fit_score >= 60 && match.overall_fit_score < 80,
          );
          break;
        case "poor":
          filtered = filtered.filter((match) => match.overall_fit_score < 60);
          break;
      }
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (match) =>
          match.application_status.toLowerCase() === statusFilter.toLowerCase(),
      );
    }

    // Apply sorting
    switch (sortBy) {
      case "score":
        filtered.sort((a, b) => b.overall_fit_score - a.overall_fit_score);
        break;
      case "company":
        filtered.sort((a, b) => a.company_name.localeCompare(b.company_name));
        break;
      case "date":
        filtered.sort(
          (a, b) =>
            new Date(b.calculated_at).getTime() -
            new Date(a.calculated_at).getTime(),
        );
        break;
    }

    setFilteredMatches(filtered);
  }, [matches, searchQuery, scoreFilter, statusFilter, sortBy]);

  const loadData = async () => {
    setIsLoading(true);
    setError(undefined);
    setSuccessMessage(undefined);

    try {
      const [matchesResult, statsResult] = await Promise.all([
        getMatchesAction(),
        getMatchStatsAction(),
      ]);

      if (matchesResult.success && matchesResult.data) {
        // Handle the structure returned by the worker: { matches: [...], pagination: {...} }
        const matchesData = matchesResult.data as
          | { matches?: JobResumeMatch[] }
          | JobResumeMatch[];
        const matchesArray = Array.isArray(matchesData)
          ? matchesData
          : (matchesData as { matches?: JobResumeMatch[] })?.matches || [];

        setMatches(Array.isArray(matchesArray) ? matchesArray : []);
      } else if (matchesResult.error) {
        setError(matchesResult.error);
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data as MatchStats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = (match: JobResumeMatch) => {
    setSelectedMatch(match);
    setIsDetailsOpen(true);
  };

  const handleTriggerReanalysis = async (
    applicationId: string,
    resumeId: string,
  ) => {
    const key = `${applicationId}-${resumeId}`;
    setIsReanalyzing(new Set([...isReanalyzing, key]));

    try {
      const result = await triggerMatchingAction(applicationId, resumeId, true);

      if (result.success) {
        // Refresh data after successful reanalysis
        await loadData();
      } else {
        setError(result.error || "Failed to trigger reanalysis");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to trigger reanalysis",
      );
    } finally {
      setIsReanalyzing((prev) => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-3">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-slate-300">
                Job-Resume Matches
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                AI-powered compatibility analysis and optimization
                recommendations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={async () => {
                setIsGeneratingMatches(true);
                setError(undefined);
                setSuccessMessage(undefined);

                try {
                  const result = await triggerBulkMatchingAction();
                  if (result.success) {
                    setSuccessMessage(
                      result.message || "Matches are being generated...",
                    );
                    // Wait a moment then refresh data
                    setTimeout(async () => {
                      await loadData();
                    }, 2000);
                  } else {
                    setError(result.error || "Failed to generate matches");
                  }
                } catch (error) {
                  console.error("Error triggering bulk matching:", error);
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Failed to generate matches",
                  );
                } finally {
                  setIsGeneratingMatches(false);
                }
              }}
              disabled={isLoading || isGeneratingMatches}
              className="bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Brain
                className={`mr-2 h-4 w-4 ${isGeneratingMatches ? "animate-spin" : ""}`}
              />
              {isGeneratingMatches ? "Generating..." : "Generate Matches"}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={loadData}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-sm text-green-700 dark:text-green-300">
                {successMessage}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <MatchStatsCards stats={stats} isLoading={isLoading} />

      {/* Filters and Search */}
      <div className="rounded-xl border border-slate-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-4">
            <div className="relative max-w-md flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search companies, roles, or resumes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="w-41">
                <SelectValue placeholder="Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scores</SelectItem>
                <SelectItem value="excellent">Excellent (80%+)</SelectItem>
                <SelectItem value="good">Good (60-79%)</SelectItem>
                <SelectItem value="poor">Poor (&lt;60%)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-38">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="interviewing">Interviewing</SelectItem>
                <SelectItem value="offer">Offer</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">By Score</SelectItem>
                <SelectItem value="company">By Company</SelectItem>
                <SelectItem value="date">By Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>
            {filteredMatches.length} of {matches.length} matches
          </span>
          {(searchQuery || scoreFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setScoreFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Matches Grid */}
      {filteredMatches.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Brain className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-white">
            No matches found
          </h3>
          <p className="mx-auto max-w-md text-slate-600 dark:text-slate-400">
            {matches.length === 0
              ? "Upload resumes and add applications to start seeing AI-powered matches."
              : "Try adjusting your filters or search terms."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {filteredMatches.map((match) => (
            <div key={match.id}>
              <MatchCard
                match={match}
                onViewDetails={handleViewDetails}
                onTriggerReanalysis={handleTriggerReanalysis}
              />
            </div>
          ))}
        </div>
      )}

      {/* Match Details Sheet */}
      <MatchDetailsSheet
        match={selectedMatch}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />
    </div>
  );
}
