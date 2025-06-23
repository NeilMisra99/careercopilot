"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users
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
    const sections = content.split(/(?=##\s)/g).filter(section => section.trim());
    return sections.map(section => {
      const lines = section.split('\n').filter(line => line.trim());
      const title = lines[0]?.replace(/^##\s*/, '') || 'Untitled Section';
      const body = lines.slice(1).join('\n').trim();
      return { title, body };
    });
  };

  const briefSections = brief ? parseBriefSections(brief.content) : [];

  const getSectionIcon = (title: string) => {
    const lowercaseTitle = title.toLowerCase();
    if (lowercaseTitle.includes('company') || lowercaseTitle.includes('organization')) {
      return <Building className="h-4 w-4" />;
    }
    if (lowercaseTitle.includes('role') || lowercaseTitle.includes('position')) {
      return <Target className="h-4 w-4" />;
    }
    if (lowercaseTitle.includes('culture') || lowercaseTitle.includes('team')) {
      return <Users className="h-4 w-4" />;
    }
    if (lowercaseTitle.includes('tips') || lowercaseTitle.includes('advice')) {
      return <Lightbulb className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  if (!brief) {
    return (
      <Card className="p-8 text-center">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Interview Brief Generated</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Generate a comprehensive interview brief with company insights, role analysis, and preparation tips.
        </p>
        {onGenerate && (
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Timer className="mr-2 h-4 w-4 animate-spin" />
                Generating Brief...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Interview Brief
              </>
            )}
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4" style={{ maxHeight, overflow: "auto" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Interview Brief</h3>
          <p className="text-sm text-muted-foreground">
            Generated on {new Date(brief.created_at).toLocaleDateString()}
          </p>
        </div>
        
        <div className="flex gap-2">
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
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
                  <Timer className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
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
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader 
                  className="cursor-pointer"
                  onClick={() => setActiveSection(
                    activeSection === section.title ? null : section.title
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getSectionIcon(section.title)}
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: section.body.replace(/\n/g, '<br>') 
                    }} 
                  />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Interview Brief
            </CardTitle>
            <CardDescription>
              Comprehensive preparation guide for your interview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: brief.content }} 
            />
          </CardContent>
        </Card>
      )}

      {/* Brief Metadata */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">
                {brief.key_insights?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Key Insights</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-primary">
                {brief.preparation_tips?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Prep Tips</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-primary">
                {brief.estimated_duration || 60}m
              </div>
              <div className="text-sm text-muted-foreground">Est. Duration</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-primary">
                {brief.confidence_score ? Math.round(brief.confidence_score * 100) : 85}%
              </div>
              <div className="text-sm text-muted-foreground">Confidence</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      {brief.key_insights && brief.key_insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {brief.key_insights.map((insight, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-sm">{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Preparation Tips */}
      {brief.preparation_tips && brief.preparation_tips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              Preparation Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {brief.preparation_tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                  <span className="text-sm">{tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Questions to Ask */}
      {brief.questions_to_ask && brief.questions_to_ask.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              Questions to Ask the Interviewer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {brief.questions_to_ask.map((question, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                  <span className="text-sm">{question}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}