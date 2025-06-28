"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Lightbulb,
  MessageSquare,
  Search,
  Sparkles,
  Timer,
} from "lucide-react";
import { useState } from "react";
import type { InterviewQuestion } from "../_lib/types";

interface InterviewQuestionsSectionProps {
  questions: InterviewQuestion[];
  onGenerate?: () => void;
  onUpdate?: (questionId: string, updates: Partial<InterviewQuestion>) => void;
  showActions?: boolean;
  isGenerating?: boolean;
  maxHeight?: string;
}

export function InterviewQuestionsSection({
  questions,
  onGenerate,
  onUpdate,
  showActions = false,
  isGenerating = false,
  maxHeight = "none",
}: InterviewQuestionsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set(),
  );
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  // Get unique difficulties and categories
  const difficulties = Array.from(
    new Set(questions.map((q) => q.difficulty).filter(Boolean)),
  );
  const categories = Array.from(
    new Set(questions.map((q) => q.category).filter(Boolean)),
  );

  // Filter questions
  const filteredQuestions = questions.filter((question) => {
    const matchesSearch =
      question.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (question.context &&
        question.context.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDifficulty =
      difficultyFilter === "all" || question.difficulty === difficultyFilter;

    const matchesCategory =
      categoryFilter === "all" || question.category === categoryFilter;

    return matchesSearch && matchesDifficulty && matchesCategory;
  });

  const toggleExpanded = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
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
      case "situational":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30";
      case "company":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  if (questions.length === 0) {
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

  return (
    <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Questions
          </h3>
          <p className="text-muted-foreground text-xs">
            {filteredQuestions.length} questions generated
          </p>
        </div>

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

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {difficulties.map((difficulty) => (
              <SelectItem key={difficulty} value={difficulty}>
                {difficulty}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <p className="text-muted-foreground text-xs">
            No questions match your search criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((question, index) => {
            const isExpanded = expandedQuestions.has(question.id);
            const isEditing = editingQuestion === question.id;

            return (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <div className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-foreground text-sm font-medium">
                            Question {index + 1}
                          </h3>
                          <Badge
                            variant="outline"
                            className={getDifficultyColor(question.difficulty)}
                          >
                            {question.difficulty}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getCategoryColor(question.category)}
                          >
                            {question.category}
                          </Badge>
                        </div>

                        {isEditing ? (
                          <Textarea
                            value={question.question}
                            onChange={(e) =>
                              onUpdate?.(question.id, {
                                question: e.target.value,
                              })
                            }
                            className="font-medium"
                            rows={3}
                          />
                        ) : (
                          <p className="text-foreground text-xs font-medium">
                            {question.question}
                          </p>
                        )}
                      </div>

                      <div className="ml-4 flex gap-1">
                        {showActions && onUpdate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setEditingQuestion(isEditing ? null : question.id)
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpanded(question.id)}
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

                  {isExpanded && (
                    <div className="space-y-4 px-3 pb-3">
                      {/* Context */}
                      {question.context && (
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <Lightbulb className="h-4 w-4 text-amber-500" />
                            <p className="text-foreground text-xs font-medium">
                              Context
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
                              placeholder="Add context for this question..."
                              rows={2}
                            />
                          ) : (
                            <p className="text-muted-foreground pl-6 text-xs">
                              {question.context}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Expected Structure */}
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
                              placeholder="Describe the expected answer structure..."
                              rows={3}
                            />
                          ) : (
                            <div className="bg-muted rounded-md p-3">
                              <p className="text-muted-foreground text-xs">
                                {question.expected_structure}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Follow-up Questions */}
                      {question.follow_ups &&
                        question.follow_ups.length > 0 && (
                          <div>
                            <p className="text-foreground mb-2 text-xs font-medium">
                              Potential Follow-ups:
                            </p>
                            <ul className="list-inside list-disc space-y-1">
                              {question.follow_ups.map((followUp, idx) => (
                                <li
                                  key={idx}
                                  className="text-muted-foreground text-xs"
                                >
                                  {followUp}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Question Metadata */}
                      <div className="text-muted-foreground flex items-center gap-4 border-t pt-2 text-xs">
                        {question.estimated_time && (
                          <span>Est. {question.estimated_time} min</span>
                        )}
                        {question.skills_assessed && (
                          <span>
                            Assesses: {question.skills_assessed.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {filteredQuestions.length > 0 && (
        <div className="text-muted-foreground border-t pt-4 text-center text-sm">
          Showing {filteredQuestions.length} of {questions.length} questions
        </div>
      )}
    </div>
  );
}
