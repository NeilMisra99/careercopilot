"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  AlertCircle,
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
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { InterviewBrief } from "../_lib/types";

interface InterviewBriefSectionProps {
  brief: InterviewBrief | null;
  onGenerate?: () => void;
  onDownload?: () => void;
  isGenerating?: boolean;
  maxHeight?: string;
  generationStatus?: string | null;
}

export function InterviewBriefSection({
  brief,
  onGenerate,
  onDownload,
  isGenerating = false,
  maxHeight = "none",
  generationStatus,
}: InterviewBriefSectionProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Create sections from the structured brief data
  const getBriefSections = (brief: InterviewBrief) => {
    const sections = [];

    if (brief.company_research) {
      sections.push({
        title: "Company Research",
        body: `
          ${brief.company_research.companyOverview ? `**Overview:** ${brief.company_research.companyOverview}` : ""}
          ${brief.company_research.industryPosition ? `\n\n**Industry Position:** ${brief.company_research.industryPosition}` : ""}
          ${brief.company_research.recentNews && brief.company_research.recentNews.length > 0 ? `\n\n**Recent News:**\n${brief.company_research.recentNews.map((news) => `• ${news}`).join("\n")}` : ""}
          ${brief.company_research.cultureValues && brief.company_research.cultureValues.length > 0 ? `\n\n**Culture & Values:**\n${brief.company_research.cultureValues.map((value) => `• ${value}`).join("\n")}` : ""}
          ${brief.company_research.keyInsights && brief.company_research.keyInsights.length > 0 ? `\n\n**Key Insights:**\n${brief.company_research.keyInsights.map((insight) => `• ${insight}`).join("\n")}` : ""}
        `.trim(),
      });
    }

    if (brief.role_analysis) {
      sections.push({
        title: "Role Analysis",
        body: `
          ${brief.role_analysis.teamStructure ? `**Team Structure:** ${brief.role_analysis.teamStructure}` : ""}
          ${brief.role_analysis.keyResponsibilities && brief.role_analysis.keyResponsibilities.length > 0 ? `\n\n**Key Responsibilities:**\n${brief.role_analysis.keyResponsibilities.map((resp) => `• ${resp}`).join("\n")}` : ""}
          ${brief.role_analysis.requiredSkills && brief.role_analysis.requiredSkills.length > 0 ? `\n\n**Required Skills:**\n${brief.role_analysis.requiredSkills.map((skill) => `• ${skill}`).join("\n")}` : ""}
          ${brief.role_analysis.growthOpportunities && brief.role_analysis.growthOpportunities.length > 0 ? `\n\n**Growth Opportunities:**\n${brief.role_analysis.growthOpportunities.map((opp) => `• ${opp}`).join("\n")}` : ""}
          ${brief.role_analysis.challenges && brief.role_analysis.challenges.length > 0 ? `\n\n**Challenges:**\n${brief.role_analysis.challenges.map((challenge) => `• ${challenge}`).join("\n")}` : ""}
        `.trim(),
      });
    }

    if (brief.match_insights) {
      sections.push({
        title: "Match Insights",
        body: `
          ${brief.match_insights.uniqueValueProposition ? `**Unique Value Proposition:** ${brief.match_insights.uniqueValueProposition}` : ""}
          ${brief.match_insights.strengthsToHighlight && brief.match_insights.strengthsToHighlight.length > 0 ? `\n\n**Strengths to Highlight:**\n${brief.match_insights.strengthsToHighlight.map((strength) => `• ${strength}`).join("\n")}` : ""}
          ${brief.match_insights.gapsToAddress && brief.match_insights.gapsToAddress.length > 0 ? `\n\n**Gaps to Address:**\n${brief.match_insights.gapsToAddress.map((gap) => `• ${gap}`).join("\n")}` : ""}
          ${brief.match_insights.competitiveAdvantages && brief.match_insights.competitiveAdvantages.length > 0 ? `\n\n**Competitive Advantages:**\n${brief.match_insights.competitiveAdvantages.map((advantage) => `• ${advantage}`).join("\n")}` : ""}
        `.trim(),
      });
    }

    return sections.filter((section) => section.body.trim().length > 0);
  };

  const briefSections = brief ? getBriefSections(brief) : [];

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

  // Show loading state if generation just completed but data hasn't loaded yet
  if (!brief && generationStatus === "completed") {
    return (
      <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Brief
          </h3>
          <p className="text-muted-foreground text-xs">Loading brief...</p>
        </div>
      </div>
    );
  }

  // Don't show "no content" if generation is in progress
  if (!brief && generationStatus !== "processing") {
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

  // If generation is in progress and no brief yet, show a minimal state
  if (!brief && generationStatus === "processing") {
    return (
      <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Brief
          </h3>
          <p className="text-muted-foreground text-xs">
            AI is preparing your comprehensive interview guide...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-medium">
            Interview Brief
          </h3>
          <p className="text-muted-foreground text-xs">
            Generated on {new Date(brief!.created_at).toLocaleDateString()}
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

      {/* Brief Content - Only this section scrolls */}
      <div
        className="overflow-auto"
        style={{ maxHeight: "calc(100vh - 400px)" }}
      >
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
                      <h3 className="text-foreground text-sm font-semibold">
                        {section.title}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3">
                  <div className="prose max-w-none text-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        h3: ({ children }) => (
                          <h3 className="text-foreground mt-4 mb-2 first:mt-0">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="mb-3 last:mb-0">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-3 space-y-1 last:mb-0">
                            {children}
                          </ul>
                        ),
                        li: ({ children }) => (
                          <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>{children}</span>
                          </li>
                        ),
                      }}
                    >
                      {section.body}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Brief Metadata */}
          <div className="bg-muted/50 border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
              <div>
                <div className="text-foreground text-2xl leading-none font-semibold">
                  {briefSections.length}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  Sections
                </div>
              </div>

              <div>
                <div className="text-foreground text-2xl leading-none font-semibold">
                  {brief!.talking_points?.length || 0}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  Talking Points
                </div>
              </div>

              <div>
                <div className="text-foreground text-2xl leading-none font-semibold">
                  {brief!.questions_to_ask?.length || 0}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  Questions
                </div>
              </div>

              <div>
                <div className="text-foreground text-2xl leading-none font-semibold">
                  {brief!.red_flags_to_avoid?.length || 0}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  Red Flags
                </div>
              </div>
            </div>
          </div>

          {/* Talking Points */}
          {brief!.talking_points && brief!.talking_points.length > 0 && (
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <h3 className="text-foreground text-sm font-semibold">
                    Key Talking Points
                  </h3>
                </div>
              </div>
              <ul className="space-y-2">
                {brief!.talking_points.map((point, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                    <span className="text-sm text-black dark:text-white">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions to Ask */}
          {brief!.questions_to_ask && brief!.questions_to_ask.length > 0 && (
            <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-500" />
                  <h3 className="text-foreground text-sm font-semibold">
                    Questions to Ask the Interviewer
                  </h3>
                </div>
              </div>
              <ul className="space-y-2">
                {brief!.questions_to_ask.map((question, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
                    <span className="text-sm text-black dark:text-white">
                      {question}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Red Flags to Avoid */}
          {brief!.red_flags_to_avoid &&
            brief!.red_flags_to_avoid.length > 0 && (
              <div className="bg-card border-border from-card to-card/95 dark:from-card dark:to-card/90 rounded-lg border bg-gradient-to-b p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <h3 className="text-foreground text-sm font-semibold">
                      Red Flags to Avoid
                    </h3>
                  </div>
                </div>
                <ul className="space-y-2">
                  {brief!.red_flags_to_avoid.map((flag, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                      <span className="text-sm text-black dark:text-white">
                        {flag}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
