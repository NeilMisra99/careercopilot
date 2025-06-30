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
import { useCallback, useEffect, useRef, useState } from "react";
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

  // Pagination state (simplified like job-discovery)
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalMatches, setTotalMatches] = useState(initialStats.totalMatches);
  const [hasMore, setHasMore] = useState(
    matchesArray.length < initialStats.totalMatches,
  );

  // Intersection Observer ref for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const MATCHES_PER_PAGE = 20;

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
        // Reset pagination state
        setCurrentPage(1);
      } else if (matchesResult.error) {
        setError(matchesResult.error);
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data as MatchStats);
        // Ensure totalMatches stays in sync with the latest stats
        if ((statsResult.data as MatchStats).totalMatches !== undefined) {
          setTotalMatches((statsResult.data as MatchStats).totalMatches);
          setHasMore(
            matchesArray.length < (statsResult.data as MatchStats).totalMatches,
          );
        }
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

  const loadMoreMatches = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const result = await getMatchesAction({
        page: nextPage,
        limit: MATCHES_PER_PAGE,
      });

      if (result.success && result.data) {
        const { matches: newMatches, pagination } = result.data as {
          matches: JobResumeMatch[];
          pagination: {
            total: number;
            hasMore: boolean;
          };
        };

        // Deduplicate matches by id to prevent React key conflicts
        setMatches((prev) => {
          const existingMatchIds = new Set(prev.map((match) => match.id));
          const uniqueNewMatches = newMatches.filter(
            (match) => !existingMatchIds.has(match.id),
          );

          const updatedMatches = [...prev, ...uniqueNewMatches];

          // Update total from server pagination
          if (pagination?.total !== undefined) {
            setTotalMatches(pagination.total);
          }

          // Update hasMore based on pagination flag
          setHasMore(
            pagination?.hasMore !== undefined
              ? pagination.hasMore
              : updatedMatches.length < totalMatches,
          );

          return updatedMatches;
        });

        setCurrentPage(nextPage);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more matches",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [currentPage, loadingMore, hasMore, totalMatches, MATCHES_PER_PAGE]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loadingMore) {
          loadMoreMatches();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px", // Start loading 100px before the element is visible
      },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, loadingMore, loadMoreMatches]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-medium">
            Job-Resume Matches
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            AI-powered compatibility analysis and optimization recommendations
          </p>
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
            size="sm"
            variant="default"
          >
            <Brain
              className={`mr-1 h-4 w-4 ${isGeneratingMatches ? "animate-spin" : ""}`}
            />
            {isGeneratingMatches ? "Generating..." : "Generate Matches"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700 dark:border-green-800/30 dark:bg-green-950/30 dark:text-green-300">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <p className="text-sm">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <MatchStatsCards stats={stats} isLoading={isLoading} />

      {/* Filters and Search */}
      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search companies, roles, or resumes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-3">
            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="w-36">
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
              <SelectTrigger className="w-32">
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
      </div>

      {/* Results count & pagination info (mirrors Job Discovery) */}
      <div className="mb-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>
          Showing {filteredMatches.length} of {totalMatches} matches
        </span>

        <div className="flex items-center gap-3">
          {hasMore && (
            <span>
              {Math.ceil(totalMatches / MATCHES_PER_PAGE)} pages total
            </span>
          )}

          {(searchQuery || scoreFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setScoreFilter("all");
                setStatusFilter("all");
              }}
              className="h-6 px-2 text-xs"
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Matches Grid */}
      {filteredMatches.length === 0 ? (
        <div className="py-12 text-center">
          <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg">
            <Brain className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-foreground mb-2 text-lg font-medium">
            No matches found
          </h3>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
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

      {/* Infinite scroll trigger element */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading more matches...</span>
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-500">
              Scroll to load more matches ({filteredMatches.length} of{" "}
              {totalMatches})
            </div>
          )}
        </div>
      )}

      {/* End of results indicator */}
      {!hasMore && filteredMatches.length > 0 && (
        <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-500">
          You&apos;ve reached the end of your matches
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
