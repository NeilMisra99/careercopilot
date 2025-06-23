"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Brain, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getMatchesAction,
  getMatchStatsAction,
} from "../_lib/actions/matches-actions";
import { MatchStatsCards } from "./match-stats-cards";

interface JobResumeMatch {
  id: string;
  company_name: string;
  job_title: string;
  overall_fit_score: number;
  application_status: string;
  resume_name: string;
  is_primary_resume: boolean;
}

interface MatchStats {
  totalMatches: number;
  averageFitScore: number;
  excellentMatches: number;
  goodMatches: number;
  poorMatches: number;
  recentMatches: number;
  totalApplications: number;
  totalResumes: number;
}

export function MatchesPageContent() {
  const [matches, setMatches] = useState<JobResumeMatch[]>([]);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [matchesResult, statsResult] = await Promise.all([
        getMatchesAction({}),
        getMatchStatsAction(),
      ]);

      if (matchesResult.success && matchesResult.data) {
        setMatches(Array.isArray(matchesResult.data) ? matchesResult.data : []);
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data as MatchStats);
      }
    } catch (error) {
      console.error("Error loading matches:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="mb-4 inline-flex items-center gap-3 rounded-2xl border border-blue-200/50 bg-white/80 px-6 py-3 shadow-lg backdrop-blur-xl dark:border-blue-800/50 dark:bg-slate-900/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div className="text-left">
            <h1 className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent">
              Job-Resume Matches
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              AI-powered compatibility analysis & optimization
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <MatchStatsCards stats={stats} isLoading={isLoading} />
        </motion.div>
      )}

      {/* Matches Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-xl bg-slate-200/50"
              />
            ))}
          </div>
        ) : matches.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {matches.map((match, index) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
              >
                <Card className="border-0 bg-white/80 shadow-lg backdrop-blur-xl dark:bg-slate-900/80">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                            {match.job_title}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {match.company_name}
                          </p>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {Math.round(match.overall_fit_score)}%
                          </div>
                          <div className="text-xs text-slate-500">
                            Fit Score
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        Resume: {match.resume_name}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="border-0 bg-white/80 shadow-lg backdrop-blur-xl dark:bg-slate-900/80">
            <CardContent className="p-12 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="mx-auto max-w-md space-y-4"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
                  <Sparkles className="h-8 w-8 text-slate-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    No matches found
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Upload resumes and add job applications to start seeing
                    AI-powered matches.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={loadData}
                  className="border-slate-200/50 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-700/50 dark:bg-slate-800/50"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
