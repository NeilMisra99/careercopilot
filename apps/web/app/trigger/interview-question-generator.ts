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
const QuestionGenerationPayloadSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  applicationId: z.string(),
  resumeId: z.string(),
  sessionType: z.enum(["behavioral", "technical", "company_specific", "mixed"]),
  forceRefresh: z.boolean().default(false),
});

const InterviewQuestionSchema = z.object({
  questionText: z.string(),
  questionType: z.enum([
    "behavioral",
    "technical",
    "company_culture",
    "role_specific",
  ]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  suggestedAnswer: z.string(),
  source: z.string(),
  orderIndex: z.number(),
});

const InterviewQuestionsResponseSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
});

export const generateInterviewQuestions = task({
  id: "generate-interview-questions",
  run: async (payload: z.infer<typeof QuestionGenerationPayloadSchema>) => {
    const {
      sessionId,
      userId,
      applicationId,
      resumeId,
      sessionType,
      forceRefresh = false,
    } = QuestionGenerationPayloadSchema.parse(payload);

    logger.info("Starting interview question generation", {
      sessionId,
      userId,
      sessionType,
      forceRefresh,
    });

    const supabase = createClient();

    try {
      // Update session status to processing
      await supabase
        .from("interview_sessions")
        .update({
          question_generation_status: "processing",
          generation_progress: 0,
          generation_metadata: {
            step: "initializing",
            started_at: new Date().toISOString(),
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);
      // Check if questions already exist for this session (unless force refresh)
      if (!forceRefresh) {
        const { data: existingQuestions } = await supabase
          .from("interview_questions")
          .select("id")
          .eq("session_id", sessionId);

        if (existingQuestions && existingQuestions.length > 0) {
          logger.info("Questions already exist for this session", {
            sessionId,
            existingCount: existingQuestions.length,
          });

          // Update session status to completed
          await supabase
            .from("interview_sessions")
            .update({
              question_generation_status: "completed",
              generation_progress: 100,
              generation_metadata: {
                step: "completed",
                completed_at: new Date().toISOString(),
                questions_count: existingQuestions.length,
              },
            })
            .eq("id", sessionId)
            .eq("user_id", userId);

          return {
            success: true,
            message: "Questions already exist for this session",
            questionsGenerated: existingQuestions.length,
            existingQuestions: true,
          };
        }
      }

      // Update progress: gathering data
      await supabase
        .from("interview_sessions")
        .update({
          generation_progress: 20,
          generation_metadata: {
            step: "gathering_data",
            message: "Fetching application and resume data",
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      // Get application data
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
            website_url,
            extra_data
          )
        `,
        )
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();

      if (appError) {
        throw new Error(`Failed to fetch application: ${appError.message}`);
      }

      // Get resume data
      const { data: resumeData, error: resumeError } = await supabase
        .from("resumes")
        .select(
          `
          parsed_data,
          experience,
          education,
          projects,
          skills,
          achievements
        `,
        )
        .eq("id", resumeId)
        .eq("user_id", userId)
        .single();

      if (resumeError) {
        throw new Error(`Failed to fetch resume: ${resumeError.message}`);
      }

      // Get existing STAR stories for this resume
      const { data: starStories } = await supabase
        .from("star_stories")
        .select("id, title, story_category, skills_demonstrated")
        .eq("resume_id", resumeId)
        .eq("user_id", userId);

      logger.info("Gathered data for question generation", {
        sessionId,
        hasJobDescription: !!applicationData?.job_description,
        hasCompanyEnrichment: !!applicationData?.company_enrichment,
        starStoriesCount: starStories?.length || 0,
      });

      // Update progress: generating with AI
      await supabase
        .from("interview_sessions")
        .update({
          generation_progress: 50,
          generation_metadata: {
            step: "ai_generation",
            message: "Generating questions with AI",
            session_type: sessionType,
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      // Generate questions using AI
      logger.info("Generating questions with AI", { sessionId, sessionType });

      const response = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: `You are an expert interview coach. Generate ${getQuestionCount(sessionType)} high-quality interview questions for a ${sessionType} interview session.

**Context:**
- Role: ${applicationData?.role || "Not specified"}
- Company: ${applicationData?.company_name || "Not specified"}
- Session Type: ${sessionType}

**Job Description:**
${applicationData?.job_description || applicationData?.notes || "Not provided"}

**Company Information:**
${applicationData?.company_enrichment ? JSON.stringify(applicationData.company_enrichment) : "Not available"}

**Candidate Background:**
- Experience: ${JSON.stringify(resumeData?.experience || [])}
- Skills: ${JSON.stringify(resumeData?.skills || [])}
- Projects: ${JSON.stringify(resumeData?.projects || [])}

**Available STAR Stories:**
${starStories?.map((story) => `- ${story.title} (${story.story_category}): ${story.skills_demonstrated?.join(", ")}`).join("\n") || "None available"}

**Instructions:**
Generate questions that are:
1. **Relevant** to the specific role and company
2. **Tailored** to the candidate's background and experience level
3. **Strategic** - designed to let the candidate showcase their strengths
4. **Realistic** - actual questions interviewers would ask
5. **Varied** in difficulty and type

${getSessionSpecificInstructions(sessionType)}

For each question, provide:
- **questionText**: The exact question to ask
- **questionType**: One of [behavioral, technical, company_culture, role_specific]
- **difficulty**: One of [easy, medium, hard]
- **suggestedAnswer**: A brief outline of how to approach answering this question
- **source**: Why this question is relevant (ai_generated, company_research, role_analysis)
- **orderIndex**: Order of asking (0-based)

\`\`\`json
{
  "questions": [
    {
      "questionText": "Tell me about a time when you had to solve a complex technical problem with limited resources.",
      "questionType": "behavioral",
      "difficulty": "medium",
      "suggestedAnswer": "Use the STAR method. Focus on your problem-solving process, resourcefulness, and the impact of your solution. Mention specific technologies or methodologies you used.",
      "source": "role_analysis",
      "orderIndex": 0
    }
  ]
}
\`\`\`

Provide your analysis following this exact JSON structure.`,
          },
        ],
        temperature: 0.4,
      });

      logger.info("AI response received", {
        sessionId,
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
      const validatedAnalysis =
        InterviewQuestionsResponseSchema.parse(parsedAnalysis);
      const questions = validatedAnalysis.questions;

      logger.info("Questions generated by AI", {
        sessionId,
        questionsCount: questions.length,
      });

      // Update progress: saving questions
      await supabase
        .from("interview_sessions")
        .update({
          generation_progress: 80,
          generation_metadata: {
            step: "saving_questions",
            message: "Saving generated questions",
            questions_count: questions.length,
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      // Save questions to database
      const questionInserts = questions.map((question) => ({
        session_id: sessionId,
        question_text: question.questionText,
        question_type: question.questionType,
        difficulty: question.difficulty,
        suggested_answer: question.suggestedAnswer,
        source: question.source,
        order_index: question.orderIndex,
      }));

      const { data: insertedQuestions, error: insertError } = await supabase
        .from("interview_questions")
        .insert(questionInserts)
        .select("id, question_text, question_type, difficulty");

      if (insertError) {
        logger.error("Failed to insert questions", {
          error: insertError,
          sessionId,
        });
        throw new Error(`Failed to save questions: ${insertError.message}`);
      }

      logger.info("Questions successfully saved", {
        sessionId,
        questionsCount: insertedQuestions?.length || 0,
      });

      // Update session status to completed
      await supabase
        .from("interview_sessions")
        .update({
          question_generation_status: "completed",
          generation_progress: 100,
          generation_metadata: {
            step: "completed",
            completed_at: new Date().toISOString(),
            questions_count: insertedQuestions?.length || 0,
          },
        })
        .eq("id", sessionId)
        .eq("user_id", userId);

      return {
        success: true,
        message: `Successfully generated ${insertedQuestions?.length || 0} interview questions`,
        questionsGenerated: insertedQuestions?.length || 0,
        questions:
          insertedQuestions?.map((q) => ({
            id: q.id,
            text: q.question_text,
            type: q.question_type,
            difficulty: q.difficulty,
          })) || [],
        existingQuestions: false,
      };
    } catch (error) {
      logger.error("Error generating interview questions", {
        error,
        sessionId,
        userId,
      });

      // Update session status to failed
      await supabase
        .from("interview_sessions")
        .update({
          question_generation_status: "failed",
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
        questionsGenerated: 0,
      };
    }
  },
});

function getQuestionCount(sessionType: string): number {
  switch (sessionType) {
    case "behavioral":
      return 8;
    case "technical":
      return 6;
    case "company_specific":
      return 5;
    case "mixed":
      return 10;
    default:
      return 8;
  }
}

function getSessionSpecificInstructions(sessionType: string): string {
  switch (sessionType) {
    case "behavioral":
      return `
Focus on behavioral questions that assess:
- Leadership and initiative
- Problem-solving and decision-making
- Teamwork and collaboration
- Handling challenges and failures
- Communication and conflict resolution
- Adaptability and learning

Use "Tell me about a time when..." format for most questions.
`;

    case "technical":
      return `
Focus on technical questions that assess:
- Core technical skills for the role
- Problem-solving approach
- System design thinking
- Best practices and methodologies
- Learning and staying current
- Technical leadership

Include both theoretical knowledge and practical application questions.
`;

    case "company_specific":
      return `
Focus on company and culture fit questions:
- Understanding of company mission/values
- Interest in the specific role/team
- Questions about company culture
- Industry knowledge
- Long-term goals alignment
- Why this company specifically

Research the company's recent news, culture, and values to create relevant questions.
`;

    case "mixed":
      return `
Create a balanced mix of:
- 40% Behavioral questions
- 30% Technical questions  
- 20% Company/culture fit questions
- 10% Role-specific situational questions

Ensure good flow and progression from easier to more challenging questions.
`;

    default:
      return "Create relevant interview questions for the given context.";
  }
}
