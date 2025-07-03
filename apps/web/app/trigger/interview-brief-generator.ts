import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger, task } from "@trigger.dev/sdk/v3";
import { generateText } from "ai";
import { z } from "zod";
import createClient from "./create-client";

// Initialize AI
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
const model = google("gemini-2.0-flash");

// Validate environment setup
if (!process.env.GOOGLE_API_KEY) {
  logger.warn("⚠️ GOOGLE_API_KEY not set - AI analysis will fail");
}

// Zod Schemas
const BriefGenerationPayloadSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  applicationId: z.string(),
  resumeId: z.string(),
  forceRefresh: z.boolean().default(false),
});

const InterviewBriefSchema = z.object({
  companyResearch: z.object({
    companyOverview: z.string(),
    recentNews: z.array(z.string()),
    cultureValues: z.array(z.string()),
    industryPosition: z.string(),
    keyInsights: z.array(z.string()),
  }),
  roleAnalysis: z.object({
    keyResponsibilities: z.array(z.string()),
    requiredSkills: z.array(z.string()),
    teamStructure: z.string(),
    growthOpportunities: z.array(z.string()),
    challenges: z.array(z.string()),
  }),
  matchInsights: z.object({
    strengthsToHighlight: z.array(z.string()),
    gapsToAddress: z.array(z.string()),
    uniqueValueProposition: z.string(),
    competitiveAdvantages: z.array(z.string()),
  }),
  talkingPoints: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
  redFlagsToAvoid: z.array(z.string()),
});

const InterviewBriefResponseSchema = z.object({
  brief: InterviewBriefSchema,
});

// Helper function to check if all AI generation is complete and auto-transition session
async function checkAndAutoTransitionSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
) {
  try {
    const { data: sessionCheck } = await supabase
      .from("interview_sessions")
      .select(
        "id, status, question_generation_status, brief_generation_status, star_generation_status, generation_metadata",
      )
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (
      sessionCheck &&
      sessionCheck.status === "preparing" &&
      sessionCheck.question_generation_status === "completed" &&
      sessionCheck.brief_generation_status === "completed" &&
      sessionCheck.star_generation_status === "completed"
    ) {
      await supabase
        .from("interview_sessions")
        .update({
          status: "ready",
          generation_metadata: {
            ...sessionCheck.generation_metadata,
            auto_transitioned_at: new Date().toISOString(),
            auto_transition_reason: "all_ai_generation_completed",
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      logger.info("Auto-transitioned session to ready", { sessionId, userId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error("Error in auto-transition check", {
      sessionId,
      userId,
      error,
    });
    return false;
  }
}

export const generateInterviewBrief = task({
  id: "generate-interview-brief",
  run: async (payload: z.infer<typeof BriefGenerationPayloadSchema>) => {
    const {
      sessionId,
      userId,
      applicationId,
      resumeId,
      forceRefresh = false,
    } = BriefGenerationPayloadSchema.parse(payload);

    logger.info("Starting interview brief generation", {
      sessionId,
      userId,
      forceRefresh,
    });

    const supabase = createClient();

    // Helper function to update progress (similar to resume parser)
    const updateProgress = async (
      step: string,
      message: string,
      progress: number,
      additionalData?: Record<string, unknown>,
    ) => {
      try {
        const updateData = {
          brief_generation_status: "processing",
          generation_progress: progress,
          generation_metadata: {
            step,
            message,
            started_at: new Date().toISOString(),
            trigger_type: "manual",
            force_refresh: forceRefresh,
            ...additionalData,
          },
        };

        const { data, error } = await supabase
          .from("interview_sessions")
          .update(updateData)
          .eq("id", sessionId)
          .eq("user_id", userId)
          .select(
            "id, brief_generation_status, generation_progress, generation_metadata",
          )
          .single();

        if (error) {
          logger.error("Failed to update generation progress", {
            sessionId,
            error: error.message,
          });
          throw error;
        }

        logger.info("Progress updated", {
          sessionId,
          step,
          progress,
          message,
        });

        return data;
      } catch (error) {
        logger.error("Error updating progress", {
          sessionId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    };

    try {
      // Update session status to processing with initial progress
      await updateProgress("initializing", "Starting brief generation...", 5);

      // Check if brief already exists for this session (unless force refresh)
      if (!forceRefresh) {
        const { data: existingBrief } = await supabase
          .from("interview_briefs")
          .select("id")
          .eq("session_id", sessionId);

        if (existingBrief && existingBrief.length > 0) {
          logger.info("Brief already exists for this session", {
            sessionId,
            existingBriefId: existingBrief[0].id,
          });

          // Update session status to completed
          await supabase
            .from("interview_sessions")
            .update({
              brief_generation_status: "completed",
              generation_progress: 100,
              generation_metadata: {
                step: "completed",
                completed_at: new Date().toISOString(),
                brief_id: existingBrief[0].id,
              },
            })
            .eq("id", sessionId)
            .eq("user_id", userId);

          return {
            success: true,
            message: "Brief already exists for this session",
            briefId: existingBrief[0].id,
            existingBrief: true,
          };
        }
      }

      // Update progress: gathering data
      await updateProgress(
        "gathering_data",
        "Fetching application and resume data...",
        25,
      );

      // Get application data with company enrichment
      const { data: applicationData, error: appError } = await supabase
        .from("applications")
        .select(
          `
          company_name,
          role,
          notes,
          job_description,
          enriched_company_id,
          company_enrichment!left (
            company_name,
            description,
            industry,
            company_size,
            website,
            funding_info,
            news_data
          )
        `,
        )
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();

      if (appError) {
        throw new Error(`Failed to fetch application: ${appError.message}`);
      }

      // Get resume data with related tables
      const { data: resumeData, error: resumeError } = await supabase
        .from("resumes")
        .select(
          `
          parsed_data,
          full_name,
          email,
          phone,
          location,
          summary,
          resume_experiences(
            company_name,
            job_title,
            start_date,
            end_date,
            is_current,
            description,
            achievements,
            skills_used
          ),
          resume_education(
            institution,
            degree,
            field_of_study,
            start_date,
            end_date,
            description,
            relevant_coursework
          ),
          resume_projects(
            project_name,
            description,
            technologies_used,
            project_url,
            github_url
          ),
          resume_skills(
            skill_name,
            skill_category,
            proficiency_level,
            years_experience
          )
        `,
        )
        .eq("id", resumeId)
        .eq("user_id", userId)
        .single();

      if (resumeError) {
        throw new Error(`Failed to fetch resume: ${resumeError.message}`);
      }

      // Get job-resume match data for insights
      const { data: matchData } = await supabase
        .from("application_resume_matches")
        .select(
          `
          overall_fit_score,
          skills_match_score,
          experience_match_score,
          matched_skills,
          missing_skills,
          strengths,
          weaknesses,
          recommendations,
          match_reasoning
        `,
        )
        .eq("application_id", applicationId)
        .eq("resume_id", resumeId)
        .eq("user_id", userId)
        .order("calculated_at", { ascending: false })
        .limit(1);

      // Get STAR stories for talking points
      const { data: starStories } = await supabase
        .from("star_stories")
        .select(
          "id, title, story_category, skills_demonstrated, confidence_score",
        )
        .eq("resume_id", resumeId)
        .eq("user_id", userId)
        .order("confidence_score", { ascending: false });

      logger.info("Gathered data for brief generation", {
        sessionId,
        hasJobDescription: !!applicationData?.job_description,
        hasCompanyEnrichment: !!applicationData?.company_enrichment,
        hasMatchData: !!matchData && matchData.length > 0,
        starStoriesCount: starStories?.length || 0,
      });

      // Update progress: generating with AI
      await updateProgress(
        "ai_generation",
        "Generating interview brief with AI...",
        60,
      );

      // Generate interview brief using AI
      logger.info("Generating interview brief with AI", { sessionId });

      // Add intermediate progress updates for smoother UX
      await updateProgress(
        "ai_generation",
        "AI is analyzing company data...",
        70,
      );

      const response = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: `You are an expert interview strategist and career coach. Create a comprehensive interview preparation brief that combines company research, role analysis, and personalized insights.

**Position Context:**
- Role: ${applicationData?.role || "Not specified"}
- Company: ${applicationData?.company_name || "Not specified"}

**Job Description:**
${applicationData?.job_description || applicationData?.notes || "Not provided"}

**Company Information:**
${applicationData?.company_enrichment ? JSON.stringify(applicationData.company_enrichment) : "Not available"}

**Candidate Profile:**
- Experience: ${JSON.stringify(resumeData?.resume_experiences || [])}
- Skills: ${JSON.stringify(resumeData?.resume_skills || [])}
- Education: ${JSON.stringify(resumeData?.resume_education || [])}
- Projects: ${JSON.stringify(resumeData?.resume_projects || [])}

**Match Analysis (if available):**
${matchData && matchData.length > 0 ? JSON.stringify(matchData[0]) : "Not available"}

**Available STAR Stories:**
${starStories?.map((story) => `- ${story.title} (${story.story_category}) - Confidence: ${story.confidence_score}`).join("\n") || "None available"}

**Instructions:**
Create a strategic interview brief that includes:

1. **Company Research**: Deep insights about the company, recent news, culture, and industry position
2. **Role Analysis**: Key responsibilities, team structure, and growth opportunities  
3. **Match Insights**: How to position the candidate's strengths and address potential gaps
4. **Strategic Talking Points**: Key messages to convey during the interview
5. **Questions to Ask**: Thoughtful questions that demonstrate interest and research
6. **Red Flags to Avoid**: Potential pitfalls or topics to handle carefully

Make the brief:
- **Actionable**: Specific advice the candidate can use immediately
- **Strategic**: Focused on positioning for success
- **Personalized**: Tailored to this specific candidate and role
- **Comprehensive**: Covering all aspects of interview preparation
- **Research-based**: Using available company and role information

\`\`\`json
{
  "brief": {
    "companyResearch": {
      "companyOverview": "Brief overview of the company's mission, products/services, and market position",
      "recentNews": ["Recent development 1", "Recent development 2"],
      "cultureValues": ["Core value 1", "Core value 2"],
      "industryPosition": "Company's position in the industry and competitive landscape",
      "keyInsights": ["Insight about company direction", "Insight about growth areas"]
    },
    "roleAnalysis": {
      "keyResponsibilities": ["Primary responsibility 1", "Primary responsibility 2"],
      "requiredSkills": ["Essential skill 1", "Essential skill 2"],
      "teamStructure": "Description of team structure and reporting relationships",
      "growthOpportunities": ["Career growth path 1", "Skill development opportunity"],
      "challenges": ["Potential challenge in the role", "Industry challenge to be aware of"]
    },
    "matchInsights": {
      "strengthsToHighlight": ["Key strength to emphasize", "Relevant experience to showcase"],
      "gapsToAddress": ["Potential gap and how to handle it", "Area for growth to acknowledge"],
      "uniqueValueProposition": "What makes this candidate uniquely valuable for this role",
      "competitiveAdvantages": ["Advantage over other candidates", "Unique background element"]
    },
    "talkingPoints": [
      "Key message about relevant experience",
      "Story about problem-solving ability",
      "Example of cultural fit"
    ],
    "questionsToAsk": [
      "Thoughtful question about the role",
      "Strategic question about company direction",
      "Question about team dynamics"
    ],
    "redFlagsToAvoid": [
      "Topic to avoid or handle carefully",
      "Potential misunderstanding to clarify"
    ]
  }
}
\`\`\`

Provide a comprehensive interview brief following this exact JSON structure.`,
          },
        ],
        temperature: 0.3,
      });

      logger.info("AI response received", {
        sessionId,
        responseLength: response.text.length,
      });

      if (!response.text || response.text.trim().length === 0) {
        throw new Error("Empty AI response received");
      }

      // Update progress after AI generation
      await updateProgress("ai_generation", "Processing AI response...", 80);

      // Extract JSON from response (handles both ```json and <json> formats)
      let jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        // Fallback to XML format
        jsonMatch = response.text.match(/<json>([\s\S]*?)<\/json>/);
      }
      if (!jsonMatch) {
        throw new Error("No JSON found in AI response");
      }

      const jsonString = jsonMatch[1].trim();
      const parsedAnalysis = JSON.parse(jsonString);

      // Validate with Zod schema
      const validatedAnalysis =
        InterviewBriefResponseSchema.parse(parsedAnalysis);
      const briefData = validatedAnalysis.brief;

      logger.info("Interview brief generated by AI", { sessionId });

      // Update progress: saving brief
      await updateProgress("saving_brief", "Saving generated brief...", 90);

      // Save brief to database
      const { data: insertedBrief, error: insertError } = await supabase
        .from("interview_briefs")
        .insert({
          session_id: sessionId,
          company_research: briefData.companyResearch,
          role_analysis: briefData.roleAnalysis,
          match_insights: briefData.matchInsights,
          talking_points: briefData.talkingPoints,
          questions_to_ask: briefData.questionsToAsk,
          red_flags_to_avoid: briefData.redFlagsToAvoid,
        })
        .select("id")
        .single();

      if (insertError) {
        logger.error("Failed to insert interview brief", {
          error: insertError,
          sessionId,
        });
        throw new Error(
          `Failed to save interview brief: ${insertError.message}`,
        );
      }

      logger.info("Interview brief successfully saved", {
        sessionId,
        briefId: insertedBrief.id,
      });

      // Update session status to completed
      await supabase
        .from("interview_sessions")
        .update({
          brief_generation_status: "completed",
          generation_progress: 100,
          generation_metadata: {
            step: "completed",
            completed_at: new Date().toISOString(),
            brief_id: insertedBrief.id,
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      // Check if all AI generation is complete and auto-transition to in_progress
      await checkAndAutoTransitionSession(supabase, sessionId, userId);

      return {
        success: true,
        message: "Successfully generated interview brief",
        briefId: insertedBrief.id,
        brief: briefData,
        existingBrief: false,
      };
    } catch (error) {
      logger.error("Error generating interview brief", {
        error,
        sessionId,
        userId,
      });

      // Update session status to failed
      await supabase
        .from("interview_sessions")
        .update({
          brief_generation_status: "failed",
          generation_metadata: {
            step: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        briefId: null,
      };
    }
  },
});
