"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { StarStory } from "../_lib/types";

interface StarStoriesSectionProps {
  starStories: StarStory[];
  onDelete?: (storyId: string) => void;
  showActions?: boolean;
  maxHeight?: string;
}

export function StarStoriesSection({
  starStories,
  onDelete,
  showActions = false,
  maxHeight = "none",
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
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  if (starStories.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Star className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
        <h3 className="mb-2 text-lg font-semibold">No STAR Stories Found</h3>
        <p className="text-muted-foreground text-sm">
          STAR stories will be extracted from your resume automatically when you
          upload one.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
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
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stories Grid */}
      {filteredStories.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No STAR stories match your search criteria.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredStories.map((story, index) => (
            <motion.div
              key={story.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{story.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span>{story.story_category}</span>
                        <span>•</span>
                        <span
                          className={getConfidenceColor(
                            story.confidence_score || 0,
                          )}
                        >
                          {Math.round((story.confidence_score || 0) * 100)}%
                          confidence
                        </span>
                      </CardDescription>
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
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* STAR Method Breakdown */}
                  <div className="grid gap-3">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          S
                        </Badge>
                        <p className="text-sm font-medium">Situation</p>
                      </div>
                      <p className="text-muted-foreground pl-6 text-sm">
                        {story.situation}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          T
                        </Badge>
                        <p className="text-sm font-medium">Task</p>
                      </div>
                      <p className="text-muted-foreground pl-6 text-sm">
                        {story.task}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          A
                        </Badge>
                        <p className="text-sm font-medium">Action</p>
                      </div>
                      <p className="text-muted-foreground pl-6 text-sm">
                        {story.action}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          R
                        </Badge>
                        <p className="text-sm font-medium">Result</p>
                      </div>
                      <p className="text-muted-foreground pl-6 text-sm">
                        {story.result}
                      </p>
                    </div>
                  </div>

                  {/* Skills Demonstrated */}
                  {story.skills_demonstrated &&
                    story.skills_demonstrated.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium">
                          Skills Demonstrated:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {story.skills_demonstrated.map((skill, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-xs"
                            >
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Usage Stats if available */}
                  {story.usage_count && story.usage_count > 0 && (
                    <div className="text-muted-foreground border-t pt-2 text-xs">
                      Used in {story.usage_count} interview
                      {story.usage_count !== 1 ? "s" : ""}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Summary */}
      {filteredStories.length > 0 && (
        <div className="text-muted-foreground border-t pt-4 text-center text-sm">
          Showing {filteredStories.length} of {starStories.length} STAR stories
        </div>
      )}
    </div>
  );
}
