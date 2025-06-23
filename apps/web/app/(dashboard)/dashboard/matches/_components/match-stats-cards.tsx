"use client";

import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Activity, Brain, Star, Target } from "lucide-react";
import { MatchStats } from "../_lib/types";

interface StatCard {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  bgGradient: string;
  iconBg: string;
  textColor: string;
  showProgress: boolean;
  progressValue?: number;
}

interface MatchStatsCardsProps {
  stats: MatchStats;
  isLoading?: boolean;
}

export function MatchStatsCards({
  stats,
  isLoading = false,
}: MatchStatsCardsProps) {
  // Safe calculations with fallbacks for undefined values
  const safeStats = {
    totalMatches: stats?.totalMatches || 0,
    averageFitScore: stats?.averageFitScore || 0,
    excellentMatches: stats?.excellentMatches || 0,
    recentMatches: stats?.recentMatches || 0,
    totalApplications: stats?.totalApplications || 0,
  };

  const safeAverageScore = isNaN(safeStats.averageFitScore)
    ? 0
    : safeStats.averageFitScore;
  const excellentPercentage =
    safeStats.totalMatches > 0
      ? Math.round((safeStats.excellentMatches / safeStats.totalMatches) * 100)
      : 0;

  const statCards: StatCard[] = [
    {
      title: "Total Matches",
      value: safeStats.totalMatches.toLocaleString(),
      subtitle: `Across ${safeStats.totalApplications} applications`,
      icon: Brain,
      gradient: "from-blue-500 to-blue-600",
      bgGradient:
        "from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30",
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      textColor: "text-blue-600 dark:text-blue-400",
      showProgress: false,
    },
    {
      title: "Average Fit Score",
      value: `${Math.round(safeAverageScore)}%`,
      subtitle: "Overall compatibility",
      icon: Target,
      gradient: "from-emerald-500 to-emerald-600",
      bgGradient:
        "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30",
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      textColor: "text-emerald-600 dark:text-emerald-400",
      showProgress: true,
      progressValue: safeAverageScore,
    },
    {
      title: "Excellent Matches",
      value: safeStats.excellentMatches.toLocaleString(),
      subtitle: `${excellentPercentage}% of total matches`,
      icon: Star,
      gradient: "from-amber-500 to-amber-600",
      bgGradient:
        "from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30",
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      textColor: "text-amber-600 dark:text-amber-400",
      showProgress: false,
    },
    {
      title: "Recent Matches",
      value: safeStats.recentMatches.toLocaleString(),
      subtitle: "Last 7 days",
      icon: Activity,
      gradient: "from-purple-500 to-purple-600",
      bgGradient:
        "from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30",
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-600 dark:text-purple-400",
      showProgress: false,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-0 bg-slate-50/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="h-8 w-16 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-200" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.4 }}
          whileHover={{ scale: 1.02, y: -2 }}
          className="group"
        >
          <Card
            className={`border-0 bg-gradient-to-br ${card.bgGradient} h-full shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl`}
          >
            <CardContent className="flex h-full flex-col p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="truncate text-sm font-medium text-slate-600 dark:text-slate-400">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {card.value}
                  </p>
                  <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-500">
                    {card.subtitle}
                  </p>
                </div>

                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg} ml-3 flex-shrink-0 shadow-sm transition-all duration-300 group-hover:scale-110`}
                >
                  <card.icon className={`h-6 w-6 ${card.textColor}`} />
                </div>
              </div>

              {/* Progress bar for Average Fit Score */}
              {card.showProgress && (
                <div className="mt-4 border-t border-slate-200/50 pt-4 dark:border-slate-600/50">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-500">
                    <span>Progress</span>
                    <span>{Math.round(card.progressValue || 0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${card.progressValue || 0}%` }}
                      transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
                      className={`h-full bg-gradient-to-r ${card.gradient} shadow-sm`}
                    />
                  </div>
                </div>
              )}

              {/* Subtle gradient overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/5 to-transparent" />
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
