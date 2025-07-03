"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Brain,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Eye,
  EyeOff,
  Filter,
  Lightbulb,
  MessageSquare,
  PlayCircle,
  Search,
  SortAsc,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { InterviewQuestion } from "../_lib/types";

interface InterviewQuestionsSectionProps {
  questions: InterviewQuestion[];
  onGenerate?: () => void;
  onUpdate?: (questionId: string, updates: Partial<InterviewQuestion>) => void;
  showActions?: boolean;
  isGenerating?: boolean;
  maxHeight?: string;
  generationStatus?: string | null;
}

type ViewMode = "overview" | "practice" | "analytics";
type SortOption = "order" | "difficulty" | "quality" | "time" | "complexity";

export function InterviewQuestionsSection({
  questions,
  onGenerate,
  onUpdate,
  showActions = true,
  isGenerating = false,
  maxHeight = "none",
  generationStatus,
}: InterviewQuestionsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [flowPositionFilter, setFlowPositionFilter] = useState<string>("all");
  const [complexityFilter, setComplexityFilter] = useState<string>("all");
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set(),
  );
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [sortBy, setSortBy] = useState<SortOption>("order");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [completedQuestions, setCompletedQuestions] = useState<Set<string>>(
    new Set(),
  );
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Set<string>>(
    new Set(),
  );

  // Get unique filter values
  const difficulties = Array.from(
    new Set(questions.map((q) => q.difficulty).filter(Boolean)),
  );
  const categories = Array.from(
    new Set(questions.map((q) => q.question_type).filter(Boolean)),
  );
  const flowPositions = Array.from(
    new Set(questions.map((q) => q.interview_flow_position).filter(Boolean)),
  );
  // const complexityLevels = Array.from(
  //   new Set(questions.map((q) => q.complexity_level).filter(Boolean)),
  // ).sort((a, b) => (a || 0) - (b || 0));

  // Filter and sort questions
  const filteredAndSortedQuestions = useMemo(() => {
    const filtered = questions.filter((question) => {
      const matchesSearch =
        question.question_text
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        (question.context &&
          question.context.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (question.suggested_answer &&
          question.suggested_answer
            .toLowerCase()
            .includes(searchQuery.toLowerCase())) ||
        (question.tags &&
          question.tags.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase()),
          ));

      const matchesDifficulty =
        difficultyFilter === "all" || question.difficulty === difficultyFilter;

      const matchesCategory =
        categoryFilter === "all" || question.question_type === categoryFilter;

      const matchesFlowPosition =
        flowPositionFilter === "all" ||
        question.interview_flow_position === flowPositionFilter;

      const matchesComplexity =
        complexityFilter === "all" ||
        (complexityFilter === "1-2" && (question.complexity_level || 0) <= 2) ||
        (complexityFilter === "3" && (question.complexity_level || 0) === 3) ||
        (complexityFilter === "4-5" && (question.complexity_level || 0) >= 4);

      return (
        matchesSearch &&
        matchesDifficulty &&
        matchesCategory &&
        matchesFlowPosition &&
        matchesComplexity
      );
    });

    // Sort questions
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "difficulty":
          const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
          return (
            (difficultyOrder[a.difficulty as keyof typeof difficultyOrder] ||
              0) -
            (difficultyOrder[b.difficulty as keyof typeof difficultyOrder] || 0)
          );
        case "quality":
          return (b.quality_score || 0) - (a.quality_score || 0);
        case "time":
          return (a.estimated_time || 0) - (b.estimated_time || 0);
        case "complexity":
          return (a.complexity_level || 0) - (b.complexity_level || 0);
        default:
          return (a.order_index || 0) - (b.order_index || 0);
      }
    });

    return filtered;
  }, [
    questions,
    searchQuery,
    difficultyFilter,
    categoryFilter,
    flowPositionFilter,
    complexityFilter,
    sortBy,
  ]);

  const toggleExpanded = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const toggleBookmark = (questionId: string) => {
    const newBookmarked = new Set(bookmarkedQuestions);
    if (newBookmarked.has(questionId)) {
      newBookmarked.delete(questionId);
    } else {
      newBookmarked.add(questionId);
    }
    setBookmarkedQuestions(newBookmarked);
  };

  const markComplete = (questionId: string) => {
    const newCompleted = new Set(completedQuestions);
    newCompleted.add(questionId);
    setCompletedQuestions(newCompleted);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case "easy":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
      case "medium":
        return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800/30";
      case "hard":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case "behavioral":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/30";
      case "technical":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "company_culture":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30";
      case "role_specific":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const getFlowPositionIcon = (position?: string) => {
    switch (position) {
      case "opening":
        return <PlayCircle className="h-3 w-3" />;
      case "early":
        return <Clock className="h-3 w-3" />;
      case "middle":
        return <Target className="h-3 w-3" />;
      case "late":
        return <TrendingUp className="h-3 w-3" />;
      case "closing":
        return <CheckCircle2 className="h-3 w-3" />;
      default:
        return null;
    }
  };

  // Analytics calculations
  const analytics = useMemo(() => {
    const total = questions.length;
    const completed = completedQuestions.size;
    const avgQuality =
      questions.reduce((sum, q) => sum + (q.quality_score || 0), 0) / total ||
      0;
    const avgTime =
      questions.reduce((sum, q) => sum + (q.estimated_time || 0), 0) / total ||
      0;
    const difficultyBreakdown = {
      easy: questions.filter((q) => q.difficulty === "easy").length,
      medium: questions.filter((q) => q.difficulty === "medium").length,
      hard: questions.filter((q) => q.difficulty === "hard").length,
    };
    const categoryBreakdown = {
      behavioral: questions.filter((q) => q.question_type === "behavioral")
        .length,
      technical: questions.filter((q) => q.question_type === "technical")
        .length,
      company_culture: questions.filter(
        (q) => q.question_type === "company_culture",
      ).length,
      role_specific: questions.filter(
        (q) => q.question_type === "role_specific",
      ).length,
    };

    return {
      total,
      completed,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      avgQuality: avgQuality * 100,
      avgTime,
      difficultyBreakdown,
      categoryBreakdown,
    };
  }, [questions, completedQuestions]);

  // Show loading state if generation just completed but data hasn't loaded yet
  if (questions.length === 0 && generationStatus === "completed") {
    return (
      <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Questions
          </h3>
          <p className="text-muted-foreground text-xs">Loading questions...</p>
        </div>
      </div>
    );
  }

  // Don't show "no content" if generation is in progress
  if (questions.length === 0 && generationStatus !== "processing") {
    return (
      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <MessageSquare className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
        <h3 className="text-foreground mb-2 text-sm font-medium">
          No Interview Questions Generated
        </h3>
        <p className="text-muted-foreground mb-4 text-xs">
          Generate AI-powered interview questions tailored to your resume and
          the job.
        </p>
        {onGenerate && (
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            {isGenerating ? (
              <>
                <Timer className="h-4 w-4 animate-spin" />
                <span>Generating Questions...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate Questions</span>
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  // If generation is in progress and no questions yet, show a minimal state
  if (questions.length === 0 && generationStatus === "processing") {
    return (
      <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Questions
          </h3>
          <p className="text-muted-foreground text-xs">
            AI is generating personalized questions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with View Mode Tabs */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Questions
          </h3>
          <p className="text-muted-foreground text-xs">
            {filteredAndSortedQuestions.length} of {questions.length} questions
            {analytics.completed > 0 && ` • ${analytics.completed} completed`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Tabs */}
          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
          >
            <TabsList>
              <TabsTrigger value="overview">
                <Eye className="mr-1 h-3 w-3" />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger value="practice">
                <PlayCircle className="mr-1 h-3 w-3" />
                <span>Practice</span>
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <BarChart3 className="mr-1 h-3 w-3" />
                <span>Analytics</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Analytics View */}
      {viewMode === "analytics" && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs font-medium">
                    Total Questions
                  </p>
                  <p className="text-foreground mt-1 text-xl leading-none font-semibold">
                    {analytics.total}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 shadow-lg">
                  <MessageSquare className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs font-medium">
                    Completion
                  </p>
                  <p className="text-foreground mt-1 text-xl leading-none font-semibold">
                    {Math.round(analytics.completionRate)}%
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 shadow-lg">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs font-medium">
                    Avg Quality
                  </p>
                  <p className="text-foreground mt-1 text-xl leading-none font-semibold">
                    {Math.round(analytics.avgQuality)}%
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500 shadow-lg">
                  <Star className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs font-medium">
                    Avg Time
                  </p>
                  <p className="text-foreground mt-1 text-xl leading-none font-semibold">
                    {Math.round(analytics.avgTime)}m
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 shadow-lg">
                  <Clock className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <h4 className="text-foreground mb-3 text-sm font-medium">
                Difficulty Distribution
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground text-xs">Easy</span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.difficultyBreakdown.easy}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                    <span className="text-muted-foreground text-xs">
                      Medium
                    </span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.difficultyBreakdown.medium}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500"></div>
                    <span className="text-muted-foreground text-xs">Hard</span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.difficultyBreakdown.hard}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <h4 className="text-foreground mb-3 text-sm font-medium">
                Category Distribution
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-purple-500" />
                    <span className="text-muted-foreground text-xs">
                      Behavioral
                    </span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.categoryBreakdown.behavioral}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-3 w-3 text-blue-500" />
                    <span className="text-muted-foreground text-xs">
                      Technical
                    </span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.categoryBreakdown.technical}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-3 w-3 text-orange-500" />
                    <span className="text-muted-foreground text-xs">
                      Culture
                    </span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.categoryBreakdown.company_culture}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-3 w-3 text-indigo-500" />
                    <span className="text-muted-foreground text-xs">
                      Role-Specific
                    </span>
                  </div>
                  <span className="text-foreground text-xs font-medium">
                    {analytics.categoryBreakdown.role_specific}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Practice Mode */}
      {viewMode === "practice" && filteredAndSortedQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">
                Question {currentPracticeIndex + 1} of{" "}
                {filteredAndSortedQuestions.length}
              </span>
              <Progress
                value={
                  ((currentPracticeIndex + 1) /
                    filteredAndSortedQuestions.length) *
                  100
                }
                className="w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCurrentPracticeIndex(Math.max(0, currentPracticeIndex - 1))
                }
                disabled={currentPracticeIndex === 0}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCurrentPracticeIndex(
                    Math.min(
                      filteredAndSortedQuestions.length - 1,
                      currentPracticeIndex + 1,
                    ),
                  )
                }
                disabled={
                  currentPracticeIndex === filteredAndSortedQuestions.length - 1
                }
              >
                Next
              </Button>
            </div>
          </div>

          {/* Practice Question Card */}
          {filteredAndSortedQuestions[currentPracticeIndex] && (
            <PracticeQuestionCard
              question={filteredAndSortedQuestions[currentPracticeIndex]}
              isCompleted={completedQuestions.has(
                filteredAndSortedQuestions[currentPracticeIndex].id,
              )}
              onMarkComplete={() =>
                markComplete(
                  filteredAndSortedQuestions[currentPracticeIndex].id,
                )
              }
              getDifficultyColor={getDifficultyColor}
              getCategoryColor={getCategoryColor}
            />
          )}
        </div>
      )}

      {/* Overview Mode */}
      {viewMode === "overview" && (
        <>
          {/* Filters and Search */}
          <div className="space-y-3">
            {/* Search and Filter Toggle */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search questions, context, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
              </Button>

              {onGenerate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Timer className="h-4 w-4 animate-spin" />
                      <span>Regenerating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Regenerate All</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Expanded Filters */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                      <Select
                        value={difficultyFilter}
                        onValueChange={setDifficultyFilter}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Difficulties</SelectItem>
                          {difficulties.map((difficulty) => (
                            <SelectItem key={difficulty} value={difficulty}>
                              {difficulty}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={categoryFilter}
                        onValueChange={setCategoryFilter}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={flowPositionFilter}
                        onValueChange={setFlowPositionFilter}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Flow Position" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Positions</SelectItem>
                          {flowPositions.map((position) => (
                            <SelectItem key={position} value={position || ""}>
                              {position}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={complexityFilter}
                        onValueChange={setComplexityFilter}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Complexity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Levels</SelectItem>
                          <SelectItem value="1-2">Basic (1-2)</SelectItem>
                          <SelectItem value="3">Intermediate (3)</SelectItem>
                          <SelectItem value="4-5">Advanced (4-5)</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Sort By */}
                      <Select
                        value={sortBy}
                        onValueChange={(value) =>
                          setSortBy(value as SortOption)
                        }
                      >
                        <SelectTrigger>
                          <SortAsc className="h-4 w-4" />
                          <SelectValue placeholder="Sort By" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="order">Order</SelectItem>
                          <SelectItem value="difficulty">Difficulty</SelectItem>
                          <SelectItem value="quality">Quality</SelectItem>
                          <SelectItem value="time">Time</SelectItem>
                          <SelectItem value="complexity">Complexity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Questions List */}
          <div
            className="space-y-3 overflow-auto"
            style={{ maxHeight: "calc(100vh - 530px)" }}
          >
            {filteredAndSortedQuestions.length === 0 ? (
              <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <p className="text-muted-foreground text-xs">
                  No questions match your search criteria.
                </p>
              </div>
            ) : (
              filteredAndSortedQuestions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  isExpanded={expandedQuestions.has(question.id)}
                  isEditing={editingQuestion === question.id}
                  isBookmarked={bookmarkedQuestions.has(question.id)}
                  isCompleted={completedQuestions.has(question.id)}
                  onToggleExpanded={() => toggleExpanded(question.id)}
                  onToggleEdit={() =>
                    setEditingQuestion(
                      editingQuestion === question.id ? null : question.id,
                    )
                  }
                  onToggleBookmark={() => toggleBookmark(question.id)}
                  onMarkComplete={() => markComplete(question.id)}
                  onUpdate={onUpdate}
                  showActions={showActions}
                  getDifficultyColor={getDifficultyColor}
                  getCategoryColor={getCategoryColor}
                  getFlowPositionIcon={getFlowPositionIcon}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Summary */}
      {filteredAndSortedQuestions.length > 0 && viewMode === "overview" && (
        <div className="text-muted-foreground border-t pt-4 text-center text-xs">
          Showing {filteredAndSortedQuestions.length} of {questions.length}{" "}
          questions
          {analytics.completed > 0 && ` • ${analytics.completed} completed`}
        </div>
      )}
    </div>
  );
}

// Practice Question Card Component
function PracticeQuestionCard({
  question,
  isCompleted,
  onMarkComplete,
  getDifficultyColor,
  getCategoryColor,
}: {
  question: InterviewQuestion;
  isCompleted: boolean;
  onMarkComplete: () => void;
  getDifficultyColor: (difficulty: string) => string;
  getCategoryColor: (category: string) => string;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [practiceTime, setPracticeTime] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  return (
    <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
      <div className="space-y-4 p-4">
        {/* Question Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={getDifficultyColor(question.difficulty)}
              >
                {question.difficulty}
              </Badge>
              <Badge
                variant="outline"
                className={getCategoryColor(question.question_type)}
              >
                {question.question_type.replace("_", " ")}
              </Badge>
              {question.estimated_time && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="mr-1 h-3 w-3" />
                  <span>{question.estimated_time}m</span>
                </Badge>
              )}
              {question.quality_score && (
                <Badge variant="outline" className="text-xs">
                  <Star className="mr-1 h-3 w-3" />
                  <span>{Math.round(question.quality_score * 100)}%</span>
                </Badge>
              )}
            </div>

            <h3 className="text-foreground text-sm leading-relaxed font-medium">
              {question.question_text}
            </h3>

            {question.context && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/30 dark:bg-blue-950/30">
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="mb-1 text-xs font-medium text-blue-800 dark:text-blue-200">
                      Context
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {question.context}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Practice Timer */}
        <div className="border-border dark:bg-muted flex items-center justify-between rounded-md border bg-gray-50 p-3">
          <div className="flex items-center gap-3">
            <div className="text-foreground font-mono text-lg">
              {Math.floor(practiceTime / 60)}:
              {(practiceTime % 60).toString().padStart(2, "0")}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (isTimerRunning) {
                  setIsTimerRunning(false);
                } else {
                  setIsTimerRunning(true);
                  const interval = setInterval(() => {
                    setPracticeTime((prev) => prev + 1);
                  }, 1000);
                  setTimeout(() => clearInterval(interval), 1000000); // Cleanup after reasonable time
                }
              }}
            >
              {isTimerRunning ? "Pause" : "Start Timer"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPracticeTime(0);
                setIsTimerRunning(false);
              }}
            >
              Reset
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAnswer(!showAnswer)}
          >
            {showAnswer ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span>{showAnswer ? "Hide" : "Show"} Answer</span>
          </Button>
        </div>

        {/* Answer Section */}
        <AnimatePresence>
          {showAnswer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3"
            >
              {question.suggested_answer && (
                <div>
                  <h4 className="text-foreground mb-2 text-xs font-medium">
                    Suggested Approach:
                  </h4>
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800/30 dark:bg-green-950/30">
                    <p className="text-xs text-green-800 dark:text-green-200">
                      {question.suggested_answer}
                    </p>
                  </div>
                </div>
              )}

              {question.expected_structure && (
                <div>
                  <h4 className="text-foreground mb-2 text-xs font-medium">
                    Answer Structure:
                  </h4>
                  <div className="rounded-md border border-purple-200 bg-purple-50 p-3 dark:border-purple-800/30 dark:bg-purple-950/30">
                    <p className="text-xs text-purple-800 dark:text-purple-200">
                      {question.expected_structure}
                    </p>
                  </div>
                </div>
              )}

              {question.follow_ups && question.follow_ups.length > 0 && (
                <div>
                  <h4 className="text-foreground mb-2 text-xs font-medium">
                    Potential Follow-ups:
                  </h4>
                  <div className="rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800/30 dark:bg-orange-950/30">
                    <ul className="list-inside list-disc space-y-1">
                      {question.follow_ups.map((followUp, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-orange-800 dark:text-orange-200"
                        >
                          {followUp}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Practice Actions */}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            {question.skills_assessed &&
              question.skills_assessed.length > 0 && (
                <div className="flex items-center gap-1">
                  <Target className="text-muted-foreground h-3 w-3" />
                  <span className="text-muted-foreground text-xs">
                    Assesses: {question.skills_assessed.slice(0, 2).join(", ")}
                    {question.skills_assessed.length > 2 && "..."}
                  </span>
                </div>
              )}
          </div>
          <Button
            size="sm"
            onClick={onMarkComplete}
            disabled={isCompleted}
            variant="default"
            className={isCompleted ? "!bg-green-600" : ""}
          >
            {isCompleted ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Completed</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark Complete</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Question Card Component
function QuestionCard({
  question,
  index,
  isExpanded,
  isEditing,
  isBookmarked,
  isCompleted,
  onToggleExpanded,
  onToggleEdit,
  onToggleBookmark,
  onMarkComplete,
  onUpdate,
  showActions,
  getDifficultyColor,
  getCategoryColor,
  getFlowPositionIcon,
}: {
  question: InterviewQuestion;
  index: number;
  isExpanded: boolean;
  isEditing: boolean;
  isBookmarked: boolean;
  isCompleted: boolean;
  onToggleExpanded: () => void;
  onToggleEdit: () => void;
  onToggleBookmark: () => void;
  onMarkComplete: () => void;
  onUpdate?: (questionId: string, updates: Partial<InterviewQuestion>) => void;
  showActions: boolean;
  getDifficultyColor: (difficulty: string) => string;
  getCategoryColor: (category: string) => string;
  getFlowPositionIcon: (position?: string) => React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <div className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {getFlowPositionIcon(question.interview_flow_position)}
                  <h3 className="text-foreground text-sm font-medium">
                    Question {index + 1}
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className={getDifficultyColor(question.difficulty)}
                >
                  {question.difficulty}
                </Badge>
                <Badge
                  variant="outline"
                  className={getCategoryColor(question.question_type)}
                >
                  {question.question_type.replace("_", " ")}
                </Badge>
                {question.complexity_level && (
                  <Badge variant="outline" className="text-xs">
                    <Brain className="mr-1 h-3 w-3" />
                    <span>L{question.complexity_level}</span>
                  </Badge>
                )}
                {question.estimated_time && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="mr-1 h-3 w-3" />
                    <span>{question.estimated_time}m</span>
                  </Badge>
                )}
                {question.quality_score && (
                  <Badge variant="outline" className="text-xs">
                    <Star className="mr-1 h-3 w-3" />
                    <span>{Math.round(question.quality_score * 100)}%</span>
                  </Badge>
                )}
                {isCompleted && (
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-green-50 text-green-700 dark:border-green-800/30 dark:bg-green-950/30 dark:text-green-300"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    <span>Completed</span>
                  </Badge>
                )}
              </div>

              {isEditing ? (
                <Textarea
                  value={question.question_text}
                  onChange={(e) =>
                    onUpdate?.(question.id, {
                      question_text: e.target.value,
                    })
                  }
                  className="text-sm font-medium"
                  rows={3}
                />
              ) : (
                <p className="text-foreground text-sm leading-relaxed font-medium">
                  {question.question_text}
                </p>
              )}
            </div>

            <div className="ml-4 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleBookmark}
                className="h-8 w-8"
              >
                {isBookmarked ? (
                  <BookmarkCheck className="h-4 w-4 text-blue-600" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>

              {showActions && onUpdate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleEdit}
                  className="h-8 w-8"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleExpanded}
                className="h-8 w-8"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 px-3 pb-3">
                {/* Enhanced Content Sections */}
                {question.context && (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <p className="text-foreground text-xs font-medium">
                        Context & Relevance
                      </p>
                    </div>
                    {isEditing ? (
                      <Textarea
                        value={question.context}
                        onChange={(e) =>
                          onUpdate?.(question.id, {
                            context: e.target.value,
                          })
                        }
                        placeholder="Why this question matters for the role..."
                        rows={2}
                      />
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/30 dark:bg-amber-950/30">
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          {question.context}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {question.suggested_answer && (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-medium">
                      Suggested Answer Approach:
                    </p>
                    <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800/30 dark:bg-green-950/30">
                      <p className="text-xs text-green-800 dark:text-green-200">
                        {question.suggested_answer}
                      </p>
                    </div>
                  </div>
                )}

                {question.expected_structure && (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-medium">
                      Expected Answer Structure:
                    </p>
                    {isEditing ? (
                      <Textarea
                        value={question.expected_structure}
                        onChange={(e) =>
                          onUpdate?.(question.id, {
                            expected_structure: e.target.value,
                          })
                        }
                        placeholder="How to structure the answer..."
                        rows={3}
                      />
                    ) : (
                      <div className="rounded-md border border-purple-200 bg-purple-50 p-3 dark:border-purple-800/30 dark:bg-purple-950/30">
                        <p className="text-xs text-purple-800 dark:text-purple-200">
                          {question.expected_structure}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {question.follow_ups && question.follow_ups.length > 0 && (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-medium">
                      Potential Follow-ups:
                    </p>
                    <div className="rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800/30 dark:bg-orange-950/30">
                      <ul className="list-inside list-disc space-y-1">
                        {question.follow_ups.map((followUp, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-orange-800 dark:text-orange-200"
                          >
                            {followUp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {question.personalization_notes && (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-medium">
                      Personalized Tips:
                    </p>
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/30 dark:bg-blue-950/30">
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        {question.personalization_notes}
                      </p>
                    </div>
                  </div>
                )}

                {question.tags && question.tags.length > 0 && (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-medium">
                      Tags:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {question.tags.map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Question Metadata */}
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="text-muted-foreground flex items-center gap-4 text-xs">
                    {question.skills_assessed &&
                      question.skills_assessed.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          <span>
                            Assesses:{" "}
                            {question.skills_assessed.slice(0, 2).join(", ")}
                          </span>
                        </div>
                      )}
                    {question.preparation_time && (
                      <div className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        <span>Prep: {question.preparation_time}m</span>
                      </div>
                    )}
                    {question.answer_framework && (
                      <div className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        <span>Framework: {question.answer_framework}</span>
                      </div>
                    )}
                  </div>

                  {!isCompleted && (
                    <Button
                      size="sm"
                      onClick={onMarkComplete}
                      variant="default"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark Complete
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
