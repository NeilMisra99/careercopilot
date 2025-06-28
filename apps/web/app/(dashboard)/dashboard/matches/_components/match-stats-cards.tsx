"use client";

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
  progress?: string;
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
      gradient: "bg-blue-500",
      bgGradient: "bg-blue-50 dark:bg-blue-950/30",
      iconBg: "bg-blue-500",
      textColor: "text-blue-600 dark:text-blue-400",
      progress: "bg-blue-500 dark:bg-blue-400",
      showProgress: false,
    },
    {
      title: "Average Fit Score",
      value: `${Math.round(safeAverageScore)}%`,
      subtitle: "Overall compatibility",
      icon: Target,
      gradient: "bg-emerald-500",
      bgGradient: "bg-emerald-50 dark:bg-emerald-950/30",
      iconBg: "bg-emerald-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      progress: "bg-emerald-500 dark:bg-emerald-400",
      showProgress: true,
      progressValue: safeAverageScore,
    },
    {
      title: "Excellent Matches",
      value: safeStats.excellentMatches.toLocaleString(),
      subtitle: `${excellentPercentage}% of total matches`,
      icon: Star,
      gradient: "bg-amber-500",
      bgGradient: "bg-amber-50 dark:bg-amber-950/30",
      iconBg: "bg-amber-500",
      textColor: "text-amber-600 dark:text-amber-400",
      progress: "bg-amber-500 dark:bg-amber-400",
      showProgress: false,
    },
    {
      title: "Recent Matches",
      value: safeStats.recentMatches.toLocaleString(),
      subtitle: "Last 7 days",
      icon: Activity,
      gradient: "bg-purple-500",
      bgGradient: "bg-purple-50 dark:bg-purple-950/30",
      iconBg: "bg-purple-500",
      textColor: "text-purple-600 dark:text-purple-400",
      progress: "bg-purple-500 dark:bg-purple-400",
      showProgress: false,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200/80 bg-white p-4 dark:border-white/10 dark:bg-transparent"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                <div className="bg-muted h-8 w-16 animate-pulse rounded" />
                <div className="bg-muted h-3 w-32 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-10 w-10 animate-pulse rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((card) => (
        <div key={card.title}>
          <div className="group cursor-pointer rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all hover:shadow-[0_4px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:shadow-[0_4px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {card.title}
                </p>
                <p className="text-foreground mt-2 text-2xl leading-none font-semibold">
                  {card.value}
                </p>
                <div className="mt-1 h-8 flex flex-col justify-start">
                  {card.showProgress ? (
                    <>
                      <p className="text-muted-foreground text-xs mb-1">
                        Overall compatibility
                      </p>
                      <div className="bg-muted h-1.5 w-32 overflow-hidden rounded-full">
                        <div
                          style={{ width: `${card.progressValue || 0}%` }}
                          className={`h-full ${card.progress} transition-all duration-500`}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {card.subtitle}
                    </p>
                  )}
                </div>
              </div>
              <div
                className={`h-10 w-10 rounded-lg ${card.gradient.replace("from-", "bg-").split(" ")[0]} flex items-center justify-center shadow-lg`}
              >
                <card.icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
