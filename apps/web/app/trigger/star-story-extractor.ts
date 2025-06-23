import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
const StarStoryExtractionPayloadSchema = z.object({
  resumeId: z.string(),
  userId: z.string(),
  resumeContent: z.string(),
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
});

const StarStoriesResponseSchema = z.object({
  stories: z.array(StarStorySchema),
});

export const extractStarStories = task({
  id: "extract-star-stories",
  run: async (payload: z.infer<typeof StarStoryExtractionPayloadSchema>) => {
    // Validate payload structure at runtime (also silences unused-var lint)
    const {
      resumeId,
      userId,
      resumeContent,
      forceRefresh = false,
    } = StarStoryExtractionPayloadSchema.parse(payload);

    logger.info("Starting STAR story extraction", {
      resumeId,
      userId,
      forceRefresh,
    });

    const supabase = createClient();

    try {
      // Check if STAR stories already exist for this resume (unless force refresh)
      if (!forceRefresh) {
        const { data: existingStories } = await supabase
          .from("star_stories")
          .select("id")
          .eq("resume_id", resumeId)
          .eq("user_id", userId);

        if (existingStories && existingStories.length > 0) {
          logger.info("STAR stories already exist for this resume", {
            resumeId,
            existingCount: existingStories.length,
          });
          return {
            success: true,
            message: "STAR stories already exist for this resume",
            storiesExtracted: existingStories.length,
            existingStories: true,
          };
        }
      }

      // Get structured resume data
      const { data: resumeData, error: resumeError } = await supabase
        .from("resumes")
        .select(
          `
          parsed_data,
          experience,
          education,
          projects,
          achievements,
          certifications
        `,
        )
        .eq("id", resumeId)
        .eq("user_id", userId)
        .single();

      if (resumeError) {
        throw new Error(`Failed to fetch resume data: ${resumeError.message}`);
      }

      if (!resumeData) {
        throw new Error("Resume not found");
      }

      // Extract STAR stories using AI
      logger.info("Generating STAR stories with AI", { resumeId });

      const response = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: `You are an expert career coach specialized in extracting compelling STAR (Situation, Task, Action, Result) stories from resumes. 

Analyze the following resume content and extract 5-8 powerful STAR stories that demonstrate the candidate's achievements, leadership, problem-solving, and impact.

Resume Content:
${resumeContent}

Structured Data (if available):
- Experience: ${JSON.stringify(resumeData.experience || [])}
- Projects: ${JSON.stringify(resumeData.projects || [])}
- Achievements: ${JSON.stringify(resumeData.achievements || [])}

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

Focus on stories that show:
- Measurable business impact
- Leadership and initiative
- Problem-solving abilities
- Technical expertise
- Team collaboration
- Process improvements
- Innovation and creativity

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
      "sourceSection": "experience"
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

      // Save STAR stories to database
      const starStoryInserts = starStories.map((story) => ({
        user_id: userId,
        resume_id: resumeId,
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
      }));

      const { data: insertedStories, error: insertError } = await supabase
        .from("star_stories")
        .insert(starStoryInserts)
        .select("id, title, story_category, confidence_score");

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

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        storiesExtracted: 0,
      };
    }
  },
});
