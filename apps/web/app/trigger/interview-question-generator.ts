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
  // Enhanced fields for comprehensive interview preparation
  context: z.string().optional(),
  expectedStructure: z.string().optional(),
  followUps: z.array(z.string()).optional(),
  skillsAssessed: z.array(z.string()).optional(),
  estimatedTime: z.number().optional(),
  interviewFlowPosition: z.enum(["opening", "early", "middle", "late", "closing"]).optional(),
  personalizationNotes: z.string().optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  complexityLevel: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  preparationTime: z.number().optional(),
  answerFramework: z.string().optional(),
  industrySpecific: z.boolean().optional(),
  followupDepth: z.number().int().min(0).max(3).optional(),
});

const InterviewQuestionsResponseSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
});

// Helper function to check if all AI generation is complete and auto-transition session
async function checkAndAutoTransitionSession(
  supabase: any,
  sessionId: string,
  userId: string,
  logger: any
) {
  try {
    const { data: sessionCheck } = await supabase
      .from("interview_sessions")
      .select("id, status, question_generation_status, brief_generation_status, star_generation_status, generation_metadata")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionCheck && 
        sessionCheck.status === "preparing" &&
        sessionCheck.question_generation_status === "completed" &&
        sessionCheck.brief_generation_status === "completed" &&
        sessionCheck.star_generation_status === "completed") {
      
      await supabase
        .from("interview_sessions")
        .update({ 
          status: "ready",
          generation_metadata: {
            ...sessionCheck.generation_metadata,
            auto_transitioned_at: new Date().toISOString(),
            auto_transition_reason: "all_ai_generation_completed"
          }
        })
        .eq("id", sessionId)
        .eq("user_id", userId);
        
      logger.info("Auto-transitioned session to ready", { sessionId, userId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error("Error in auto-transition check", { sessionId, userId, error });
    return false;
  }
}

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

    // Helper function to update progress (similar to resume parser)
    const updateProgress = async (
      step: string,
      message: string,
      progress: number,
      additionalData?: Record<string, unknown>,
    ) => {
      try {
        const updateData = {
          question_generation_status: "processing",
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
          .select("id, question_generation_status, generation_progress, generation_metadata")
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
      await updateProgress("initializing", "Starting question generation...", 5);
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
      await updateProgress("gathering_data", "Fetching application and resume data...", 20);

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
      await updateProgress(
        "ai_generation", 
        "Generating questions with AI...", 
        50,
        { session_type: sessionType }
      );

      // Generate questions using AI
      logger.info("Generating questions with AI", { sessionId, sessionType });

      // Add intermediate progress updates for smoother UX
      await updateProgress("ai_generation", "AI is analyzing the job requirements...", 60);

      const response = await generateText({
        model,
        messages: [
          {
            role: "system",
            content: `You are a world-class interview coach with 20+ years of experience helping professionals land roles at top companies. You understand the psychology of interviews, what hiring managers really look for, and how to craft questions that allow candidates to showcase their best selves strategically.

Your expertise includes:
- **Psychology of Interviewing**: Understanding what each question type reveals about a candidate
- **Strategic Question Design**: Creating questions that give candidates opportunities to highlight their strengths
- **Industry-Specific Knowledge**: Tailoring questions to different sectors and roles
- **Cultural Intelligence**: Incorporating company values and culture into question design
- **STAR Method Mastery**: Structuring behavioral questions for maximum impact
- **Flow Management**: Ordering questions for optimal interview progression
- **Personalization**: Adapting questions to individual backgrounds and experience levels`,
          },
          {
            role: "user",
            content: `Generate ${getQuestionCount(sessionType)} premium-quality interview questions for a ${sessionType} session. These questions should be sophisticated, strategic, and designed to help the candidate excel.

## CONTEXT ANALYSIS

**Target Role:** ${applicationData?.role || "Not specified"}
**Company:** ${applicationData?.company_name || "Not specified"}
**Session Focus:** ${sessionType}

**Job Requirements Analysis:**
${applicationData?.job_description || applicationData?.notes || "Not provided"}

**Company Intelligence:**
${applicationData?.company_enrichment ? `
- Company: ${applicationData.company_enrichment.company_name}
- Industry: ${applicationData.company_enrichment.industry}
- Size: ${applicationData.company_enrichment.company_size}
- Description: ${applicationData.company_enrichment.description}
- Recent News: ${applicationData.company_enrichment.news_data ? JSON.stringify(applicationData.company_enrichment.news_data) : "None"}
- Funding: ${applicationData.company_enrichment.funding_info ? JSON.stringify(applicationData.company_enrichment.funding_info) : "None"}
` : "Limited company data available"}

**Candidate Profile:**
**Experience Level:** ${resumeData?.resume_experiences?.length > 5 ? "Senior" : resumeData?.resume_experiences?.length > 2 ? "Mid-level" : "Junior"}

**Professional Experience:**
${resumeData?.resume_experiences?.map(exp => `
- ${exp.job_title} at ${exp.company_name} (${exp.start_date} - ${exp.end_date || "Present"})
  Achievements: ${exp.achievements?.join(", ") || "Not specified"}
  Skills Used: ${exp.skills_used?.join(", ") || "Not specified"}
`).join("") || "No experience data"}

**Technical Skills:**
${resumeData?.resume_skills?.map(skill => `- ${skill.skill_name} (${skill.proficiency_level}, ${skill.years_experience} years)`).join("\n") || "No skills data"}

**Education:**
${resumeData?.resume_education?.map(edu => `- ${edu.degree} in ${edu.field_of_study} from ${edu.institution}`).join("\n") || "No education data"}

**Notable Projects:**
${resumeData?.resume_projects?.map(proj => `- ${proj.project_name}: ${proj.description} (${proj.technologies_used?.join(", ")})`).join("\n") || "No projects data"}

**Available STAR Stories:** ${starStories?.length || 0} stories available
${starStories?.map(story => `- "${story.title}" (${story.story_category}): Demonstrates ${story.skills_demonstrated?.join(", ")}`).join("\n") || "None available"}

## STRATEGIC QUESTION DESIGN

${getAdvancedSessionInstructions(sessionType)}

## RESPONSE FORMAT

For each question, provide comprehensive details:

\`\`\`json
{
  "questions": [
    {
      "questionText": "The exact question to ask",
      "questionType": "behavioral|technical|company_culture|role_specific",
      "difficulty": "easy|medium|hard",
      "suggestedAnswer": "Strategic approach to answering effectively",
      "source": "Why this question was chosen",
      "orderIndex": 0,
      "context": "Why this question matters for this specific role and company",
      "expectedStructure": "How to structure the answer (STAR, technical walkthrough, etc.)",
      "followUps": ["Potential follow-up question 1", "Follow-up 2"],
      "skillsAssessed": ["Skill 1", "Skill 2", "Skill 3"],
      "estimatedTime": 3,
      "interviewFlowPosition": "early|middle|late",
      "personalizationNotes": "Specific advice for this candidate's background",
      "qualityScore": 0.95,
      "complexityLevel": 3,
      "tags": ["tag1", "tag2"],
      "preparationTime": 15,
      "answerFramework": "STAR",
      "industrySpecific": false,
      "followupDepth": 2
    }
  ]
}
\`\`\`

**Quality Standards:**
- Questions must be realistic and commonly asked
- Each question should have strategic value for the candidate
- Personalization based on candidate's actual background
- Progressive difficulty throughout the session
- Clear preparation guidance for each question`,
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
      const validatedAnalysis =
        InterviewQuestionsResponseSchema.parse(parsedAnalysis);
      const questions = validatedAnalysis.questions;

      logger.info("Questions generated by AI", {
        sessionId,
        questionsCount: questions.length,
      });

      // Update progress: saving questions
      await updateProgress(
        "saving_questions",
        "Saving generated questions...",
        80,
        { questions_count: questions.length }
      );

      // Save questions to database
      const questionInserts = questions.map((question) => ({
        session_id: sessionId,
        question_text: question.questionText,
        question_type: question.questionType,
        difficulty: question.difficulty,
        suggested_answer: question.suggestedAnswer,
        source: question.source,
        order_index: question.orderIndex,
        // Enhanced fields
        context: question.context,
        expected_structure: question.expectedStructure,
        follow_ups: question.followUps || [],
        skills_assessed: question.skillsAssessed || [],
        estimated_time: question.estimatedTime,
        interview_flow_position: question.interviewFlowPosition,
        personalization_notes: question.personalizationNotes,
        quality_score: question.qualityScore,
        complexity_level: question.complexityLevel,
        tags: question.tags || [],
        preparation_time: question.preparationTime,
        answer_framework: question.answerFramework,
        industry_specific: question.industrySpecific || false,
        followup_depth: question.followupDepth,
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

      // Check if all AI generation is complete and auto-transition to in_progress
      await checkAndAutoTransitionSession(supabase, sessionId, userId, logger);

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

function getAdvancedSessionInstructions(sessionType: string): string {
  switch (sessionType) {
    case "behavioral":
      return `
**Behavioral Interview Strategy:**

**Core Competencies to Assess:**
- **Leadership & Influence**: Decision-making under pressure, team motivation, change management
- **Problem-Solving Excellence**: Complex challenges, creative solutions, data-driven decisions
- **Collaboration Mastery**: Cross-functional teamwork, conflict resolution, stakeholder management
- **Resilience & Growth**: Learning from failures, adapting to change, continuous improvement
- **Communication Impact**: Difficult conversations, presentation skills, written communication

**Question Design Principles:**
- Use STAR method framework for all behavioral questions
- Create scenarios that match the candidate's experience level
- Include questions that allow showcasing of available STAR stories
- Progress from relationship-building questions to complex scenario-based ones
- Ensure each question has clear success criteria

**Interview Flow Strategy:**
- **Opening (1-2 questions)**: Warm-up, career motivation
- **Early (2-3 questions)**: Core competency demonstration
- **Middle (2-3 questions)**: Complex scenarios, leadership examples
- **Late (1-2 questions)**: Growth mindset, future vision

**Personalization Tactics:**
- Reference specific experiences from their resume
- Match question complexity to their seniority level
- Include industry-specific behavioral scenarios when relevant`;

    case "technical":
      return `
**Technical Interview Strategy:**

**Assessment Categories:**
- **Core Technical Skills**: Role-specific technologies and methodologies
- **System Design Thinking**: Architecture, scalability, trade-offs
- **Problem-Solving Approach**: Debugging, optimization, critical thinking
- **Best Practices Mastery**: Code quality, testing, documentation, security
- **Learning & Innovation**: Staying current, adopting new technologies
- **Technical Leadership**: Mentoring, technical decision-making, cross-team collaboration

**Question Design Principles:**
- Balance theoretical knowledge with practical application
- Include real-world scenarios from the target company's tech stack
- Create questions that demonstrate depth and breadth of knowledge
- Allow candidates to showcase their strongest technical areas
- Include questions about technical trade-offs and decision-making

**Complexity Progression:**
- **Level 1-2**: Fundamental concepts, basic implementation
- **Level 3**: Intermediate problem-solving, design patterns
- **Level 4-5**: Advanced architecture, optimization, leadership

**Industry-Specific Considerations:**
- Include questions relevant to the company's technical challenges
- Reference current industry trends and emerging technologies
- Consider the team's specific technical stack and methodologies`;

    case "company_specific":
      return `
**Company Culture Interview Strategy:**

**Cultural Assessment Areas:**
- **Mission Alignment**: Understanding and passion for company purpose
- **Values Integration**: How candidate embodies company values
- **Team Dynamics**: Fit with existing team culture and working style
- **Growth Mindset**: Alignment with company stage and growth trajectory
- **Industry Passion**: Deep interest in the company's sector
- **Long-term Vision**: Career goals alignment with company direction

**Question Design Principles:**
- Incorporate specific company values and mission elements
- Reference recent company news, achievements, or challenges
- Create scenarios based on actual company situations (when appropriate)
- Allow candidates to demonstrate research and genuine interest
- Include questions about why this company specifically

**Research-Based Customization:**
- Use company's recent funding, product launches, or strategic initiatives
- Reference leadership team, company culture, or notable achievements
- Include industry-specific challenges the company faces
- Consider company size, stage, and growth trajectory in question design

**Cultural Fit Indicators:**
- Communication style alignment
- Decision-making approach compatibility
- Collaboration preferences match
- Innovation and risk tolerance alignment`;

    case "mixed":
      return `
**Comprehensive Interview Strategy:**

**Optimal Question Distribution:**
- **35% Behavioral**: Core competencies and soft skills
- **35% Technical**: Role-specific expertise and problem-solving
- **20% Company Culture**: Values alignment and cultural fit
- **10% Role-Specific**: Situational judgment and domain expertise

**Strategic Interview Flow:**
1. **Opening (10 mins)**: Warm-up behavioral + company interest
2. **Technical Deep-Dive (25 mins)**: Core technical competencies
3. **Behavioral Excellence (20 mins)**: Leadership and collaboration scenarios
4. **Cultural Integration (10 mins)**: Values alignment and team fit
5. **Closing (5 mins)**: Future vision and mutual interest

**Advanced Integration Techniques:**
- Weave technical problem-solving into behavioral scenarios
- Connect company culture questions to real work situations
- Use role-specific examples throughout all question types
- Create natural transitions between different assessment areas

**Personalization Strategy:**
- Adapt technical depth to candidate's experience level
- Match behavioral scenarios to their career stage
- Align company culture questions with their expressed interests
- Create cohesive narrative throughout the interview session

**Quality Assurance:**
- Ensure progressive difficulty across all question types
- Maintain realistic interview timing (average 70 minutes total)
- Provide multiple opportunities to showcase key strengths
- Include both strength demonstration and growth area exploration`;

    default:
      return "Create relevant interview questions for the given context using advanced coaching principles.";
  }
}
