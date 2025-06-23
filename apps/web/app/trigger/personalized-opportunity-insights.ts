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

// === Schemas ===

const PersonalizedInsightsPayloadSchema = z.object({
  applicationId: z.string(),
  userId: z.string(),
  jobData: z.object({
    title: z.string(),
    company: z.string(),
    description: z.string().optional(),
    salary_json: z.any().optional(),
    applicants: z.number().optional(),
    employment_type: z.string().optional(),
    experience_level: z.string().optional(),
    job_url: z.string().optional(),
    posted_at: z.string().optional(),
  }),
});

const PersonalizedInsightsSchema = z.object({
  insights: z.object({
    skill_matches: z.array(
      z.object({
        skill: z.string(),
        your_experience: z.string(),
        job_requirement: z.string(),
        match_strength: z.enum(["perfect", "strong", "good"]),
      }),
    ),
    experience_relevance: z.array(
      z.object({
        your_role: z.string(),
        company: z.string(),
        relevance_explanation: z.string(),
        why_valuable: z.string(),
      }),
    ),
    growth_opportunities: z.array(
      z.object({
        opportunity: z.string(),
        your_current_level: z.string(),
        potential_growth: z.string(),
      }),
    ),
    competitive_advantages: z.array(z.string()),
    key_reasons: z.array(z.string()),
  }),
  summary: z.object({
    primary_strength: z.string(),
    biggest_opportunity: z.string(),
    fit_confidence: z.number().min(0).max(100),
    personalized_pitch: z.string(),
  }),
  confidence: z.number().min(0).max(1),
});

export type PersonalizedInsights = z.infer<typeof PersonalizedInsightsSchema>;

// Export for use in other components
export type { PersonalizedInsights as OpportunityInsights };

// Resume data interface (streamlined for insights)
interface ResumeData {
  id: string;
  full_name: string;
  summary: string;
  experiences: Array<{
    company_name: string;
    job_title: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    description: string;
    achievements: string[];
    skills_used: string[];
  }>;
  skills: Array<{
    skill_name: string;
    skill_category: string;
    proficiency_level: string;
    years_experience: number;
    context_company: string;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field_of_study: string;
  }>;
  projects: Array<{
    project_name: string;
    description: string;
    technologies_used: string[];
  }>;
}

// === Main Task ===

export const generatePersonalizedInsights = task({
  id: "generate-personalized-insights",
  description:
    "Generate personalized job opportunity insights using user's resume",
  maxDuration: 120, // 2 minutes
  retry: {
    maxAttempts: 2,
    factor: 1.5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
  },
  run: async (payload: z.infer<typeof PersonalizedInsightsPayloadSchema>) => {
    const startTime = Date.now();

    try {
      // Validate payload
      const validatedPayload = PersonalizedInsightsPayloadSchema.parse(payload);

      logger.info("🧠 Starting personalized insights generation", {
        applicationId: validatedPayload.applicationId,
        userId: validatedPayload.userId,
        jobTitle: validatedPayload.jobData.title,
        company: validatedPayload.jobData.company,
      });

      const supabase = createClient();

      // Get user's primary resume
      const { data: primaryResume, error: resumeError } = await supabase
        .from("resumes")
        .select("*")
        .eq("user_id", validatedPayload.userId)
        .eq("is_primary", true)
        .single();

      if (resumeError || !primaryResume) {
        logger.warn("No primary resume found for user", {
          userId: validatedPayload.userId,
          error: resumeError,
        });
        return {
          success: false,
          reason: "No primary resume found",
        };
      }

      // Load complete resume data
      const resumeData = await getResumeData(supabase, primaryResume.id);
      if (!resumeData) {
        throw new Error("Failed to load resume data");
      }

      logger.info("📄 Resume data loaded", {
        candidateName: resumeData.full_name,
        experienceCount: resumeData.experiences.length,
        skillsCount: resumeData.skills.length,
      });

      // Generate personalized insights
      const insights = await generateInsightsAnalysis(
        validatedPayload.jobData,
        resumeData,
      );

      // Save insights to application
      await savePersonalizedInsights(
        supabase,
        validatedPayload.applicationId,
        insights,
      );

      const processingTime = Date.now() - startTime;
      logger.info("✨ Personalized insights generation completed", {
        applicationId: validatedPayload.applicationId,
        candidateName: resumeData.full_name,
        fitConfidence: insights.summary.fit_confidence,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        applicationId: validatedPayload.applicationId,
        insights: insights,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error("❌ Personalized insights generation failed", {
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: processingTime,
        payload: payload,
      });
      throw error;
    }
  },
});

// === Core Functions ===

async function generateInsightsAnalysis(
  jobData: z.infer<typeof PersonalizedInsightsPayloadSchema>["jobData"],
  resumeData: ResumeData,
): Promise<PersonalizedInsights> {
  const resumeText = formatResumeForInsights(resumeData);

  logger.info("🤖 Generating personalized insights", {
    candidateName: resumeData.full_name,
    jobTitle: jobData.title,
    company: jobData.company,
    resumeLength: resumeText.length,
  });

  try {
    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: `You are an expert career advisor helping a job seeker understand why a specific opportunity is perfect for them. Analyze their resume against this job opportunity and provide highly personalized insights.

<job_opportunity>
COMPANY: ${jobData.company}
POSITION: ${jobData.title}
DESCRIPTION: ${jobData.description || "No description provided"}
${jobData.employment_type ? `TYPE: ${jobData.employment_type}` : ""}
${jobData.experience_level ? `LEVEL: ${jobData.experience_level}` : ""}
${jobData.applicants ? `APPLICANTS: ${jobData.applicants}` : ""}
${jobData.salary_json ? `SALARY: ${JSON.stringify(jobData.salary_json)}` : ""}
</job_opportunity>

<candidate_profile>
${resumeText}
</candidate_profile>

Generate personalized insights that answer "Why is this opportunity perfect for YOU?" Focus on:

1. **Skill Matches**: Specific skills where they excel that directly match job requirements
2. **Experience Relevance**: How their specific work history makes them ideal for this role
3. **Growth Opportunities**: What this role offers that aligns with their career progression
4. **Competitive Advantages**: What makes them stand out from other candidates
5. **Key Reasons**: The most compelling reasons why this is a great match

**CRITICAL REQUIREMENTS:**
- Be extremely specific and personal - use their actual experience, companies, and achievements
- Focus on WHY this matters for their career, not just what matches
- Highlight growth opportunities and career advancement potential
- Make it feel like personalized career advice, not generic matching
- Order everything by impact and relevance

**Example of specificity:**
- Instead of: "Has React experience"
- Say: "Your 3+ years building React applications at TechCorp directly matches their frontend needs, plus you've handled their exact scale challenges"

Provide insights in this exact JSON format:

\`\`\`json
{
  "insights": {
    "skill_matches": [
      {
        "skill": "React & TypeScript",
        "your_experience": "4+ years building production React apps at TechCorp and StartupX",
        "job_requirement": "React/TypeScript for frontend development",
        "match_strength": "perfect"
      }
    ],
    "experience_relevance": [
      {
        "your_role": "Senior Frontend Developer at TechCorp",
        "company": "TechCorp (Similar scale/industry)",
        "relevance_explanation": "You've already solved similar challenges in a comparable environment",
        "why_valuable": "Your experience scaling frontend systems directly applies to their growth phase"
      }
    ],
    "growth_opportunities": [
      {
        "opportunity": "Tech Lead responsibilities",
        "your_current_level": "Senior Developer with team collaboration",
        "potential_growth": "Natural progression to technical leadership role"
      }
    ],
    "competitive_advantages": [
      "Unique combination of React expertise and AWS deployment experience",
      "Proven track record at similar-stage companies",
      "Strong problem-solving skills demonstrated through project portfolio"
    ],
    "key_reasons": [
      "Your React/TypeScript expertise perfectly matches their core tech stack",
      "Experience at TechCorp gives you insights into their scaling challenges",
      "This role offers the tech leadership growth you've been building toward"
    ]
  },
  "summary": {
    "primary_strength": "Perfect technical match with 4+ years React/TypeScript experience exceeding their requirements",
    "biggest_opportunity": "Natural progression to tech leadership with mentoring responsibilities",
    "fit_confidence": 92,
    "personalized_pitch": "Your proven React expertise from scaling applications at TechCorp directly addresses their frontend challenges, while this role offers the technical leadership growth that's the logical next step in your career progression."
  },
  "confidence": 0.94
}
\`\`\`

Be specific, personal, and focus on career growth and unique value proposition.`,
        },
      ],
      temperature: 0.3, // Lower temperature for consistent output
    });

    logger.info("🤖 AI response received", {
      responseLength: response.text.length,
    });

    if (!response.text || response.text.trim().length === 0) {
      throw new Error("Empty AI response received");
    }

    // Extract JSON from response
    const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const jsonString = jsonMatch[1].trim();
    const parsedInsights = JSON.parse(jsonString);

    // Validate with Zod schema
    const validatedInsights = PersonalizedInsightsSchema.parse(parsedInsights);

    logger.info("✅ Insights parsed and validated", {
      fitConfidence: validatedInsights.summary.fit_confidence,
      skillMatches: validatedInsights.insights.skill_matches.length,
      growthOpportunities:
        validatedInsights.insights.growth_opportunities.length,
    });

    return validatedInsights;
  } catch (error) {
    logger.error("❌ Failed to generate personalized insights", {
      error: error instanceof Error ? error.message : String(error),
      candidateName: resumeData.full_name,
    });

    // Return fallback insights
    return {
      insights: {
        skill_matches: [
          {
            skill: "Analysis Failed",
            your_experience: "Unable to analyze your background",
            job_requirement: "Please regenerate insights",
            match_strength: "good" as const,
          },
        ],
        experience_relevance: [],
        growth_opportunities: [],
        competitive_advantages: ["Analysis failed - please regenerate"],
        key_reasons: ["Insights generation failed - please try again"],
      },
      summary: {
        primary_strength: "Analysis failed - please regenerate insights",
        biggest_opportunity: "Unable to analyze growth potential",
        fit_confidence: 0,
        personalized_pitch:
          "Insights generation failed. Please regenerate for personalized analysis.",
      },
      confidence: 0,
    };
  }
}

function formatResumeForInsights(resume: ResumeData): string {
  const sections = [`CANDIDATE: ${resume.full_name}`];

  if (resume.summary) {
    sections.push(`PROFESSIONAL SUMMARY:\n${resume.summary}`);
  }

  if (resume.experiences.length > 0) {
    sections.push(`WORK EXPERIENCE:`);
    resume.experiences.slice(0, 5).forEach((exp) => {
      // Limit to top 5 most recent
      sections.push(
        `• ${exp.job_title} at ${exp.company_name} (${exp.start_date} - ${exp.is_current ? "Present" : exp.end_date})`,
      );
      if (exp.description) {
        sections.push(`  ${exp.description}`);
      }
      if (exp.achievements.length > 0) {
        sections.push(`  Key Achievements: ${exp.achievements.join("; ")}`);
      }
      if (exp.skills_used.length > 0) {
        sections.push(`  Technologies: ${exp.skills_used.join(", ")}`);
      }
    });
  }

  if (resume.skills.length > 0) {
    sections.push(`KEY SKILLS:`);
    const topSkills = resume.skills
      .sort((a, b) => (b.years_experience || 0) - (a.years_experience || 0))
      .slice(0, 15); // Top 15 skills by experience

    const skillsByCategory = topSkills.reduce(
      (acc, skill) => {
        if (!acc[skill.skill_category]) acc[skill.skill_category] = [];
        acc[skill.skill_category].push(
          `${skill.skill_name} (${skill.years_experience || 0}y)`,
        );
        return acc;
      },
      {} as Record<string, string[]>,
    );

    Object.entries(skillsByCategory).forEach(([category, skills]) => {
      sections.push(`${category}: ${skills.join(", ")}`);
    });
  }

  if (resume.education.length > 0) {
    sections.push(`EDUCATION:`);
    resume.education.forEach((edu) => {
      sections.push(
        `• ${edu.degree} in ${edu.field_of_study}, ${edu.institution}`,
      );
    });
  }

  if (resume.projects.length > 0) {
    sections.push(`KEY PROJECTS:`);
    resume.projects.slice(0, 3).forEach((project) => {
      // Top 3 projects
      sections.push(`• ${project.project_name}: ${project.description}`);
      sections.push(`  Tech Stack: ${project.technologies_used.join(", ")}`);
    });
  }

  return sections.join("\n\n");
}

async function getResumeData(
  supabase: ReturnType<typeof createClient>,
  resumeId: string,
): Promise<ResumeData | null> {
  try {
    // Get basic resume info
    const { data: resume, error: resumeError } = await supabase
      .from("resumes")
      .select("*")
      .eq("id", resumeId)
      .single();

    if (resumeError || !resume) {
      logger.error("Failed to fetch resume", { resumeId, error: resumeError });
      return null;
    }

    // Get related data in parallel
    const [experiencesResult, skillsResult, educationResult, projectsResult] =
      await Promise.all([
        supabase
          .from("resume_experiences")
          .select("*")
          .eq("resume_id", resumeId)
          .order("start_date", { ascending: false }),
        supabase
          .from("resume_skills")
          .select("*")
          .eq("resume_id", resumeId)
          .order("years_experience", { ascending: false }),
        supabase
          .from("resume_education")
          .select("*")
          .eq("resume_id", resumeId)
          .order("start_date", { ascending: false }),
        supabase.from("resume_projects").select("*").eq("resume_id", resumeId),
      ]);

    // Check for errors
    if (
      experiencesResult.error ||
      skillsResult.error ||
      educationResult.error ||
      projectsResult.error
    ) {
      logger.error("Failed to fetch resume related data", { resumeId });
      return null;
    }

    return {
      id: resume.id,
      full_name: resume.full_name || "Unknown Candidate",
      summary: resume.summary || "",
      experiences: experiencesResult.data || [],
      skills: skillsResult.data || [],
      education: educationResult.data || [],
      projects: projectsResult.data || [],
    };
  } catch (error) {
    logger.error("Error fetching resume data", { resumeId, error });
    return null;
  }
}

async function savePersonalizedInsights(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
  insights: PersonalizedInsights,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("applications")
      .update({
        opportunity_insights: insights,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (error) {
      throw new Error(`Database save failed: ${error.message}`);
    }

    logger.info("✅ Personalized insights saved successfully", {
      applicationId,
      fitConfidence: insights.summary.fit_confidence,
      skillMatches: insights.insights.skill_matches.length,
    });
  } catch (error) {
    logger.error("❌ Failed to save personalized insights", {
      error: error instanceof Error ? error.message : String(error),
      applicationId,
    });
    throw error;
  }
}
