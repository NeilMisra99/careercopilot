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
import { motion } from "framer-motion";
import { Edit, Search, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import type { InterviewStarStory } from "../_lib/types";

interface StarStoriesSectionProps {
  starStories: InterviewStarStory[];
  onDelete?: (storyId: string) => void;
  showActions?: boolean;
}

export function StarStoriesSection({
  starStories,
  onDelete,
  showActions = false,
}: StarStoriesSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingStory, setEditingStory] = useState<string | null>(null);

  // Get unique categories
  const categories = Array.from(
    new Set(starStories.map((story) => story.story_category).filter(Boolean)),
  );

  // Filter stories
  const filteredStories = starStories.filter((story) => {
    const matchesSearch =
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.situation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.result.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || story.story_category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8)
      return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
    if (score >= 0.6)
      return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800/30";
    return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/30";
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case "leadership":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/30";
      case "problem_solving":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "teamwork":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30";
      case "innovation":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30";
      case "communication":
        return "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-800/30";
      case "achievement":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/30";
      case "technical_expertise":
        return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const getStarMethodColor = (letter: string) => {
    switch (letter) {
      case "S":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30";
      case "T":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/30";
      case "A":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30";
      case "R":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/30";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800/30";
    }
  };

  const formatCategoryName = (category: string) => {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  if (starStories.length === 0) {
    return (
      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <Star className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
        <h3 className="text-foreground mb-2 text-sm font-medium">
          No STAR Stories Found
        </h3>
        <p className="text-muted-foreground text-xs">
          STAR stories will be extracted from your resume automatically when you
          upload one.
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      style={{ maxHeight: "calc(100vh - 350px)", overflow: "auto" }}
    >
      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search STAR stories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {formatCategoryName(category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Stories Grid */}
      {filteredStories.length === 0 ? (
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <p className="text-muted-foreground text-xs">
            No STAR stories match your search criteria.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredStories.map((story, index) => (
            <motion.div
              key={story.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="text-foreground text-sm font-medium">
                        {story.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={getCategoryColor(story.story_category)}
                        >
                          {formatCategoryName(story.story_category)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={getConfidenceColor(
                            story.confidence_score || 0,
                          )}
                        >
                          <Star className="mr-1 h-3 w-3" />
                          <span>
                            {Math.round((story.confidence_score || 0) * 100)}%
                          </span>
                        </Badge>
                      </div>
                    </div>

                    {showActions && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditingStory(
                              editingStory === story.id ? null : story.id,
                            )
                          }
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(story.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 px-3 pb-3">
                  {/* STAR Method Breakdown */}
                  <div className="grid gap-3">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStarMethodColor("S")}`}
                        >
                          S
                        </Badge>
                        <p className="text-foreground text-xs font-medium">
                          Situation
                        </p>
                      </div>
                      <p className="text-muted-foreground pl-9 text-xs">
                        {story.situation}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStarMethodColor("T")}`}
                        >
                          T
                        </Badge>
                        <p className="text-foreground text-xs font-medium">
                          Task
                        </p>
                      </div>
                      <p className="text-muted-foreground pl-9 text-xs">
                        {story.task}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStarMethodColor("A")}`}
                        >
                          A
                        </Badge>
                        <p className="text-foreground text-xs font-medium">
                          Action
                        </p>
                      </div>
                      <p className="text-muted-foreground pl-9 text-xs">
                        {story.action}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStarMethodColor("R")}`}
                        >
                          R
                        </Badge>
                        <p className="text-foreground text-xs font-medium">
                          Result
                        </p>
                      </div>
                      <p className="text-muted-foreground pl-9 text-xs">
                        {story.result}
                      </p>
                    </div>
                  </div>

                  {/* Skills Demonstrated */}
                  {story.skills_demonstrated &&
                    story.skills_demonstrated.length > 0 && (
                      <div>
                        <p className="text-foreground mb-2 text-xs font-medium">
                          Skills Demonstrated:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {story.skills_demonstrated.map((skill, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="border-violet-200 bg-violet-50 text-xs text-violet-700 dark:border-violet-800/30 dark:bg-violet-950/30 dark:text-violet-300"
                            >
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {filteredStories.length > 0 && (
        <div className="text-muted-foreground border-t pt-4 text-center text-xs">
          Showing {filteredStories.length} of {starStories.length} STAR stories
        </div>
      )}
    </div>
  );
}
