"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Building,
  Download,
  FileText,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { InterviewBrief } from "../_lib/types";

interface InterviewBriefSectionProps {
  brief: InterviewBrief | null;
  onGenerate?: () => void;
  onDownload?: () => void;
  isGenerating?: boolean;
  maxHeight?: string;
}

export function InterviewBriefSection({
  brief,
  onGenerate,
  onDownload,
  isGenerating = false,
  maxHeight = "none",
}: InterviewBriefSectionProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Parse brief content sections if available
  const parseBriefSections = (content: string) => {
    const sections = content
      .split(/(?=##\s)/g)
      .filter((section) => section.trim());
    return sections.map((section) => {
      const lines = section.split("\n").filter((line) => line.trim());
      const title = lines[0]?.replace(/^##\s*/, "") || "Untitled Section";
      const body = lines.slice(1).join("\n").trim();
      return { title, body };
    });
  };

  const briefSections = brief ? parseBriefSections(brief.content) : [];

  const getSectionIcon = (title: string) => {
    const lowercaseTitle = title.toLowerCase();
    if (
      lowercaseTitle.includes("company") ||
      lowercaseTitle.includes("organization")
    ) {
      return <Building className="h-4 w-4" />;
    }
    if (
      lowercaseTitle.includes("role") ||
      lowercaseTitle.includes("position")
    ) {
      return <Target className="h-4 w-4" />;
    }
    if (lowercaseTitle.includes("culture") || lowercaseTitle.includes("team")) {
      return <Users className="h-4 w-4" />;
    }
    if (lowercaseTitle.includes("tips") || lowercaseTitle.includes("advice")) {
      return <Lightbulb className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  if (!brief) {
    return (
      <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <FileText className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
        <h3 className="text-foreground mb-2 text-sm font-medium">
          No Interview Brief Generated
        </h3>
        <p className="text-muted-foreground mb-4 text-xs">
          Generate a comprehensive interview brief with company insights, role
          analysis, and preparation tips.
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
                <span>Generating Brief...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate Interview Brief</span>
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Brief
          </h3>
          <p className="text-muted-foreground text-xs">
            Generated on {new Date(brief.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex gap-2">
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </Button>
          )}

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
                  <RefreshCw className="h-4 w-4" />
                  <span>Regenerate</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Brief Content */}
      {briefSections.length > 0 ? (
        <div className="space-y-4">
          {briefSections.map((section, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div
                  className="cursor-pointer p-3"
                  onClick={() =>
                    setActiveSection(
                      activeSection === section.title ? null : section.title,
                    )
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getSectionIcon(section.title)}
                      <h3 className="text-foreground text-sm font-medium">
                        {section.title}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3">
                  <div
                    className="prose prose-sm text-muted-foreground max-w-none text-xs"
                    dangerouslySetInnerHTML={{
                      __html: section.body.replace(/\n/g, "<br>"),
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <h3 className="text-foreground text-sm font-medium">
                Interview Brief
              </h3>
            </div>
            <p className="text-muted-foreground mb-4 text-xs">
              Comprehensive preparation guide for your interview
            </p>
          </div>
          <div className="px-3 pb-3">
            <div
              className="prose prose-sm text-muted-foreground max-w-none text-xs"
              dangerouslySetInnerHTML={{ __html: brief.content }}
            />
          </div>
        </div>
      )}

      {/* Brief Metadata */}
      <div className="bg-muted/50 border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          <div>
            <div className="text-foreground text-2xl leading-none font-semibold">
              {brief.key_insights?.length || 0}
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              Key Insights
            </div>
          </div>

          <div>
            <div className="text-foreground text-2xl leading-none font-semibold">
              {brief.preparation_tips?.length || 0}
            </div>
            <div className="text-muted-foreground mt-1 text-xs">Prep Tips</div>
          </div>

          <div>
            <div className="text-foreground text-2xl leading-none font-semibold">
              {brief.estimated_duration || 60}m
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              Est. Duration
            </div>
          </div>

          <div>
            <div className="text-foreground text-2xl leading-none font-semibold">
              {brief.confidence_score
                ? Math.round(brief.confidence_score * 100)
                : 85}
              %
            </div>
            <div className="text-muted-foreground mt-1 text-xs">Confidence</div>
          </div>
        </div>
      </div>

      {/* Key Insights */}
      {brief.key_insights && brief.key_insights.length > 0 && (
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <h3 className="text-foreground text-sm font-medium">
                Key Insights
              </h3>
            </div>
          </div>
          <ul className="space-y-2">
            {brief.key_insights.map((insight, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                <span className="text-muted-foreground text-xs">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preparation Tips */}
      {brief.preparation_tips && brief.preparation_tips.length > 0 && (
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              <h3 className="text-foreground text-sm font-medium">
                Preparation Tips
              </h3>
            </div>
          </div>
          <ul className="space-y-2">
            {brief.preparation_tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                <span className="text-muted-foreground text-xs">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions to Ask */}
      {brief.questions_to_ask && brief.questions_to_ask.length > 0 && (
        <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              <h3 className="text-foreground text-sm font-medium">
                Questions to Ask the Interviewer
              </h3>
            </div>
          </div>
          <ul className="space-y-2">
            {brief.questions_to_ask.map((question, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
                <span className="text-muted-foreground text-xs">
                  {question}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
