"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Timer
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
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  // Get unique difficulties and categories
  const difficulties = Array.from(
    new Set(questions.map(q => q.difficulty).filter(Boolean))
  );
  const categories = Array.from(
    new Set(questions.map(q => q.category).filter(Boolean))
  );

  // Filter questions
  const filteredQuestions = questions.filter(question => {
    const matchesSearch = 
      question.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (question.context && question.context.toLowerCase().includes(searchQuery.toLowerCase()));

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
        return "bg-green-100 text-green-800 border-green-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "hard":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case "behavioral":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "technical":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "situational":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "company":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (questions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Interview Questions Generated</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Generate AI-powered interview questions tailored to your resume and the job.
        </p>
        {onGenerate && (
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Timer className="mr-2 h-4 w-4 animate-spin" />
                Generating Questions...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Questions
              </>
            )}
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Interview Questions</h3>
          <p className="text-sm text-muted-foreground">
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
                <Timer className="mr-2 h-4 w-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Regenerate All
              </>
            )}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            {difficulties.map(difficulty => (
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
            {categories.map(category => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No questions match your search criteria.
          </p>
        </Card>
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
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">Question {index + 1}</CardTitle>
                          <Badge className={getDifficultyColor(question.difficulty)}>
                            {question.difficulty}
                          </Badge>
                          <Badge className={getCategoryColor(question.category)}>
                            {question.category}
                          </Badge>
                        </div>
                        
                        {isEditing ? (
                          <Textarea
                            value={question.question}
                            onChange={(e) => onUpdate?.(question.id, { question: e.target.value })}
                            className="font-medium"
                            rows={3}
                          />
                        ) : (
                          <CardDescription className="font-medium text-foreground">
                            {question.question}
                          </CardDescription>
                        )}
                      </div>
                      
                      <div className="flex gap-1 ml-4">
                        {showActions && onUpdate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingQuestion(isEditing ? null : question.id)}
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
                  </CardHeader>
                  
                  {isExpanded && (
                    <CardContent className="space-y-4 pt-0">
                      {/* Context */}
                      {question.context && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="h-4 w-4 text-amber-500" />
                            <p className="font-medium text-sm">Context</p>
                          </div>
                          {isEditing ? (
                            <Textarea
                              value={question.context}
                              onChange={(e) => onUpdate?.(question.id, { context: e.target.value })}
                              placeholder="Add context for this question..."
                              rows={2}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground pl-6">
                              {question.context}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Expected Structure */}
                      {question.expected_structure && (
                        <div>
                          <p className="font-medium text-sm mb-2">Expected Answer Structure:</p>
                          {isEditing ? (
                            <Textarea
                              value={question.expected_structure}
                              onChange={(e) => onUpdate?.(question.id, { expected_structure: e.target.value })}
                              placeholder="Describe the expected answer structure..."
                              rows={3}
                            />
                          ) : (
                            <div className="bg-muted p-3 rounded-md">
                              <p className="text-sm">{question.expected_structure}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Follow-up Questions */}
                      {question.follow_ups && question.follow_ups.length > 0 && (
                        <div>
                          <p className="font-medium text-sm mb-2">Potential Follow-ups:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {question.follow_ups.map((followUp, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground">
                                {followUp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Question Metadata */}
                      <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                        {question.estimated_time && (
                          <span>Est. {question.estimated_time} min</span>
                        )}
                        {question.skills_assessed && (
                          <span>Assesses: {question.skills_assessed.join(", ")}</span>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {filteredQuestions.length > 0 && (
        <div className="text-sm text-muted-foreground text-center pt-4 border-t">
          Showing {filteredQuestions.length} of {questions.length} questions
        </div>
      )}
    </div>
  );
}