import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger, task } from "@trigger.dev/sdk/v3";
import { generateText } from "ai";
import { z } from "zod";
import createClient from "./create-client";

// TypeScript interfaces for parsed resume data
interface ParsedExperience {
  company_name: string;
  job_title: string;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  description?: string | null;
  achievements?: string[];
  skills_used?: string[];
}

interface ParsedEducation {
  institution: string;
  degree?: string | null;
  field_of_study?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  grade_gpa?: string | null;
  description?: string | null;
  relevant_coursework?: string[];
}

interface ParsedProject {
  project_name: string;
  description?: string | null;
  technologies_used?: string[];
  project_url?: string | null;
  github_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface ParsedSkill {
  skill_name: string;
  skill_category?: string;
}

interface ParsedCertification {
  certification_name: string;
  issuing_organization?: string | null;
  issue_date?: string | null;
  credential_id?: string | null;
  credential_url?: string | null;
}

interface ParsedResumeData {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experiences?: ParsedExperience[];
  education?: ParsedEducation[];
  projects?: ParsedProject[];
  skills?: ParsedSkill[];
  certifications?: ParsedCertification[];
}

// Initialize AI
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
const model = google("gemini-2.0-flash");

// Validate environment setup
if (!process.env.GOOGLE_API_KEY) {
  logger.warn("⚠️ GOOGLE_API_KEY not set - AI analysis will fail");
}

// Zod Schemas - Updated for session-specific STAR stories
const StarStoryExtractionPayloadSchema = z.object({
  sessionId: z.string(), // Now required - STAR stories are session-specific
  userId: z.string(),
  applicationId: z.string(), // Required for job context
  resumeId: z.string(),
  forceRefresh: z.boolean().default(false),
});

const StarStorySchema = z.object({
  title: z.string(),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
  skillsDemonstrated: z.array(z.string()),
  achievementMetrics: z.record(z.any()),
  storyCategory: z.string(),
  confidenceScore: z.number().min(0).max(1),
  sourceSection: z.string(),
  relevanceScore: z.number().min(0).max(1), // New field for job relevance
  jobAlignmentNotes: z.string(), // New field for job alignment explanation
});

const StarStoriesResponseSchema = z.object({
  stories: z.array(StarStorySchema),
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

export const extractStarStories = task({
  id: "extract-star-stories",
  run: async (payload: z.infer<typeof StarStoryExtractionPayloadSchema>) => {
    // Validate payload structure at runtime
    const {
      sessionId,
      userId,
      applicationId,
      resumeId,
      forceRefresh = false,
    } = StarStoryExtractionPayloadSchema.parse(payload);

    logger.info("Starting session-specific STAR story extraction", {
      sessionId,
      userId,
      applicationId,
      resumeId,
      forceRefresh,
    });

    const supabase = createClient();

    // Helper function to update progress (same pattern as questions/briefs)
    const updateProgress = async (
      step: string,
      message: string,
      progress: number,
      additionalData?: Record<string, unknown>,
    ) => {
      try {
        const updateData = {
          star_generation_status: "processing",
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
            "id, star_generation_status, generation_progress, generation_metadata",
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
      await updateProgress(
        "initializing",
        "Starting STAR story extraction...",
        5,
      );

      // Check if STAR stories already exist for this specific session (unless force refresh)
      if (!forceRefresh) {
        const { data: existingStories } = await supabase
          .from("interview_star_stories")
          .select("id")
          .eq("session_id", sessionId);

        if (existingStories && existingStories.length > 0) {
          logger.info("STAR stories already exist for this session", {
            sessionId,
            existingCount: existingStories.length,
          });

          // Update session status to completed
          await supabase
            .from("interview_sessions")
            .update({
              star_generation_status: "completed",
              generation_progress: 100,
              generation_metadata: {
                step: "completed",
                completed_at: new Date().toISOString(),
                stories_count: existingStories.length,
              },
            })
            .eq("id", sessionId)
            .eq("user_id", userId);

          return {
            success: true,
            message: "STAR stories already exist for this session",
            storiesExtracted: existingStories.length,
            existingStories: true,
          };
        }
      }

      // Update progress: gathering data
      await updateProgress(
        "gathering_data",
        "Fetching resume and application data...",
        20,
      );

      // Get application data for job context
      const { data: applicationData, error: applicationError } = await supabase
        .from("applications")
        .select("company_name, role, job_description")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();

      if (applicationError) {
        throw new Error(
          `Failed to fetch application data: ${applicationError.message}`,
        );
      }

      if (!applicationData) {
        throw new Error("Application not found");
      }

      // Get structured resume data
      const { data: resumeData, error: resumeError } = await supabase
        .from("resumes")
        .select("parsed_data, parsing_status")
        .eq("id", resumeId)
        .eq("user_id", userId)
        .single();

      if (resumeError) {
        throw new Error(`Failed to fetch resume data: ${resumeError.message}`);
      }

      if (!resumeData) {
        throw new Error("Resume not found");
      }

      if (resumeData.parsing_status !== "completed") {
        throw new Error("Resume parsing not completed yet");
      }

      if (!resumeData.parsed_data) {
        throw new Error("No parsed data available for this resume");
      }

      // Construct resume content from parsed_data
      const parsedData = resumeData.parsed_data;
      const resumeContent = constructResumeContent(parsedData);

      // Update progress: generating with AI
      await updateProgress(
        "ai_generation",
        "Generating STAR stories with AI...",
        40,
      );

      // Extract STAR stories using AI
      logger.info("Generating STAR stories with AI", { resumeId });

      const response = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: `You are an expert career coach specialized in extracting compelling STAR (Situation, Task, Action, Result) stories from resumes that are specifically tailored for job applications.

**CRITICAL CONTEXT**: This candidate is applying for the position of "${applicationData.role}" at "${applicationData.company_name}".

Job Description:
${applicationData.job_description || "No job description provided"}

Company: ${applicationData.company_name}
Role: ${applicationData.role}

Analyze the following resume content and extract 5-8 powerful STAR stories that are SPECIFICALLY RELEVANT to this job application. Prioritize stories that:
1. Directly align with the job requirements and responsibilities
2. Demonstrate skills mentioned in the job description
3. Show experience relevant to the company's industry/domain
4. Highlight achievements that would be valuable for this specific role

Resume Content:
${resumeContent}

Structured Data:
- Experience: ${JSON.stringify(resumeData.parsed_data?.experiences || [])}
- Education: ${JSON.stringify(resumeData.parsed_data?.education || [])}
- Projects: ${JSON.stringify(resumeData.parsed_data?.projects || [])}
- Skills: ${JSON.stringify(resumeData.parsed_data?.skills || [])}
- Certifications: ${JSON.stringify(resumeData.parsed_data?.certifications || [])}

For each STAR story, provide:

1. **Title**: A compelling 4-6 word title that captures the essence
2. **Situation**: The context/background (2-3 sentences)
3. **Task**: What needed to be accomplished (1-2 sentences)
4. **Action**: Specific actions taken (2-4 sentences, use "I" statements)
5. **Result**: Quantified outcomes and impact (2-3 sentences with metrics)
6. **Skills Demonstrated**: Array of 3-5 key skills showcased
7. **Achievement Metrics**: JSON object with quantifiable results (revenue, efficiency, team size, etc.)
8. **Story Category**: One of [leadership, problem_solving, teamwork, innovation, communication, achievement, technical_expertise]
9. **Confidence Score**: 0.0-1.0 based on how complete and compelling the story is
10. **Source Section**: Which resume section this came from (experience, projects, achievements, etc.)
11. **Relevance Score**: 0.0-1.0 indicating how relevant this story is to the specific job application
12. **Job Alignment Notes**: Explanation of why this story is particularly relevant to this job/company

Focus specifically on stories that demonstrate:
- Skills and experiences directly mentioned in the job description
- Achievements relevant to the company's industry or business model
- Problem-solving approaches applicable to the target role
- Leadership styles and team dynamics suitable for the company culture
- Technical expertise that matches the job requirements
- Results and metrics that would impress this specific employer

\`\`\`json
{
  "stories": [
    {
      "title": "Led Digital Transformation Initiative",
      "situation": "The company's manual processes were causing delays and customer complaints.",
      "task": "I was tasked with digitizing the entire customer onboarding process.",
      "action": "I researched automation tools, built a prototype workflow, collaborated with IT and customer service teams, and managed the implementation across 3 departments.",
      "result": "Reduced onboarding time by 60%, improved customer satisfaction scores by 25%, and saved the company $200K annually in operational costs.",
      "skillsDemonstrated": ["project_management", "process_improvement", "stakeholder_management", "digital_transformation"],
      "achievementMetrics": {
        "timeReduction": "60%",
        "customerSatisfactionIncrease": "25%",
        "costSavings": "$200K",
        "departmentsImpacted": 3
      },
      "storyCategory": "leadership",
      "confidenceScore": 0.95,
      "sourceSection": "experience",
      "relevanceScore": 0.92,
      "jobAlignmentNotes": "This story demonstrates project management and digital transformation skills directly applicable to modernizing processes at the target company. The stakeholder management experience is crucial for the collaborative nature of the target role."
    }
  ]
}
\`\`\`

Provide your analysis following this exact JSON structure. Ensure each story is specific, quantified, and interview-ready.`,
          },
        ],
        temperature: 0.3,
      });

      logger.info("AI response received", {
        resumeId,
        responseLength: response.text.length,
      });

      if (!response.text || response.text.trim().length === 0) {
        throw new Error("Empty AI response received");
      }

      // Update progress after AI generation
      await updateProgress("ai_generation", "Processing AI response...", 70);

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
      const validatedAnalysis = StarStoriesResponseSchema.parse(parsedAnalysis);
      const starStories = validatedAnalysis.stories;

      logger.info("STAR stories extracted by AI", {
        resumeId,
        storiesCount: starStories.length,
      });

      // Update progress: saving stories
      await updateProgress(
        "saving_stories",
        "Saving generated STAR stories...",
        80,
        { stories_count: starStories.length },
      );

      // Save STAR stories to interview_star_stories table (session-specific)
      const starStoryInserts = starStories.map((story) => ({
        session_id: sessionId,
        title: story.title,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        skills_demonstrated: story.skillsDemonstrated,
        achievement_metrics: story.achievementMetrics,
        story_category: story.storyCategory,
        confidence_score: story.confidenceScore,
        source_section: story.sourceSection,
        relevance_score: story.relevanceScore,
        job_alignment_notes: story.jobAlignmentNotes,
      }));

      const { data: insertedStories, error: insertError } = await supabase
        .from("interview_star_stories")
        .insert(starStoryInserts)
        .select("id, title, story_category, confidence_score, relevance_score");

      if (insertError) {
        logger.error("Failed to insert STAR stories", {
          error: insertError,
          resumeId,
        });
        throw new Error(`Failed to save STAR stories: ${insertError.message}`);
      }

      logger.info("STAR stories successfully saved", {
        resumeId,
        storiesCount: insertedStories?.length || 0,
      });

      // Update session status to completed
      await supabase
        .from("interview_sessions")
        .update({
          star_generation_status: "completed",
          generation_progress: 100,
          generation_metadata: {
            step: "completed",
            completed_at: new Date().toISOString(),
            stories_count: insertedStories?.length || 0,
            application_context: {
              company: applicationData.company_name,
              role: applicationData.role,
            },
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      // Check if all AI generation is complete and auto-transition to ready
      await checkAndAutoTransitionSession(supabase, sessionId, userId);

      // Revalidate cache to ensure fresh data
      try {
        // Note: We can't import the cache functions directly in Trigger due to Next.js dependencies
        // The cache will be revalidated from the frontend when the task completes
        logger.info("Cache revalidation will be handled by the frontend", {
          resumeId,
        });
      } catch (cacheError) {
        logger.warn("Cache revalidation not available in Trigger context", {
          cacheError,
        });
      }

      return {
        success: true,
        message: `Successfully extracted ${insertedStories?.length || 0} STAR stories`,
        storiesExtracted: insertedStories?.length || 0,
        stories:
          insertedStories?.map((story) => ({
            id: story.id,
            title: story.title,
            category: story.story_category,
            confidence: story.confidence_score,
          })) || [],
        existingStories: false,
      };
    } catch (error) {
      logger.error("Error extracting STAR stories", {
        error,
        resumeId,
        userId,
      });

      // Update session status to failed
      await supabase
        .from("interview_sessions")
        .update({
          star_generation_status: "failed",
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
        storiesExtracted: 0,
      };
    }
  },
});

// Helper function to construct resume content from parsed_data
function constructResumeContent(parsedData: ParsedResumeData): string {
  if (!parsedData) {
    throw new Error("No parsed data available");
  }

  let content = "";

  // Personal Information
  if (parsedData.full_name) {
    content += `Name: ${parsedData.full_name}\n`;
  }
  if (parsedData.email) {
    content += `Email: ${parsedData.email}\n`;
  }
  if (parsedData.phone) {
    content += `Phone: ${parsedData.phone}\n`;
  }
  if (parsedData.location) {
    content += `Location: ${parsedData.location}\n`;
  }
  if (parsedData.summary) {
    content += `\nSummary:\n${parsedData.summary}\n`;
  }

  // Work Experience
  if (parsedData.experiences && parsedData.experiences.length > 0) {
    content += "\nWORK EXPERIENCE:\n";
    parsedData.experiences.forEach((exp: ParsedExperience) => {
      content += `\n${exp.job_title} at ${exp.company_name}`;
      if (exp.start_date || exp.end_date) {
        content += ` (${exp.start_date || "?"} - ${exp.end_date || "Present"})`;
      }
      if (exp.location) {
        content += ` - ${exp.location}`;
      }
      content += "\n";
      if (exp.description) {
        content += `${exp.description}\n`;
      }
      if (exp.achievements && exp.achievements.length > 0) {
        exp.achievements.forEach((achievement: string) => {
          content += `• ${achievement}\n`;
        });
      }
      if (exp.skills_used && exp.skills_used.length > 0) {
        content += `Skills: ${exp.skills_used.join(", ")}\n`;
      }
    });
  }

  // Education
  if (parsedData.education && parsedData.education.length > 0) {
    content += "\nEDUCATION:\n";
    parsedData.education.forEach((edu: ParsedEducation) => {
      content += `\n${edu.degree || "Degree"} in ${edu.field_of_study || "Field"} from ${edu.institution}`;
      if (edu.start_date || edu.end_date) {
        content += ` (${edu.start_date || "?"} - ${edu.end_date || "?"})`;
      }
      content += "\n";
      if (edu.grade_gpa) {
        content += `GPA: ${edu.grade_gpa}\n`;
      }
      if (edu.description) {
        content += `${edu.description}\n`;
      }
      if (edu.relevant_coursework && edu.relevant_coursework.length > 0) {
        content += `Relevant Coursework: ${edu.relevant_coursework.join(", ")}\n`;
      }
    });
  }

  // Projects
  if (parsedData.projects && parsedData.projects.length > 0) {
    content += "\nPROJECTS:\n";
    parsedData.projects.forEach((project: ParsedProject) => {
      content += `\n${project.project_name}`;
      if (project.start_date || project.end_date) {
        content += ` (${project.start_date || "?"} - ${project.end_date || "?"})`;
      }
      content += "\n";
      if (project.description) {
        content += `${project.description}\n`;
      }
      if (project.technologies_used && project.technologies_used.length > 0) {
        content += `Technologies: ${project.technologies_used.join(", ")}\n`;
      }
      if (project.project_url) {
        content += `URL: ${project.project_url}\n`;
      }
      if (project.github_url) {
        content += `GitHub: ${project.github_url}\n`;
      }
    });
  }

  // Skills
  if (parsedData.skills && parsedData.skills.length > 0) {
    content += "\nSKILLS:\n";
    const skillsByCategory: Record<string, string[]> = {};
    parsedData.skills.forEach((skill: ParsedSkill) => {
      const category = skill.skill_category || "other";
      if (!skillsByCategory[category]) {
        skillsByCategory[category] = [];
      }
      skillsByCategory[category].push(skill.skill_name);
    });

    Object.entries(skillsByCategory).forEach(([category, skills]) => {
      content += `${category.charAt(0).toUpperCase() + category.slice(1)}: ${skills.join(", ")}\n`;
    });
  }

  // Certifications
  if (parsedData.certifications && parsedData.certifications.length > 0) {
    content += "\nCERTIFICATIONS:\n";
    parsedData.certifications.forEach((cert: ParsedCertification) => {
      content += `\n${cert.certification_name}`;
      if (cert.issuing_organization) {
        content += ` - ${cert.issuing_organization}`;
      }
      if (cert.issue_date) {
        content += ` (${cert.issue_date})`;
      }
      content += "\n";
      if (cert.credential_id) {
        content += `Credential ID: ${cert.credential_id}\n`;
      }
      if (cert.credential_url) {
        content += `URL: ${cert.credential_url}\n`;
      }
    });
  }

  return content;
}
