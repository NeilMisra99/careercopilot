import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { logger, task } from "@trigger.dev/sdk/v3";
import { generateText } from "ai";
import puppeteer from "puppeteer";
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

if (!process.env.SERPER_API_KEY) {
  logger.warn("⚠️ SERPER_API_KEY not set - job search will be limited");
}

// No proxy needed for screenshots - only for data scraping

// === Zod Schemas ===

const JobResumeMatchingPayloadSchema = z.object({
  applicationId: z.string(),
  resumeId: z.string(),
  jobDescription: z.string(),
  companyName: z.string(),
  jobTitle: z.string(),
  userId: z.string(),
  forceRefresh: z.boolean().default(false),
});

// Core match analysis schema with comprehensive detail structure
const MatchAnalysisSchema = z.object({
  scores: z.object({
    overall: z.number().min(0).max(100),
    skills: z.number().min(0).max(100),
    experience: z.number().min(0).max(100),
    education: z.number().min(0).max(100),
  }),
  analysis: z.object({
    job_requirements: z.object({
      key_skills: z.array(z.string()),
      required_skills: z.array(z.string()),
      preferred_skills: z.array(z.string()),
      experience_level: z.string(),
      education_requirements: z.string(),
      preferred_qualifications: z.array(z.string()),
    }),
    candidate_strengths: z.array(z.string()),
    candidate_gaps: z.array(z.string()),
    recommendations: z.array(z.string()),
    fit_summary: z.string(),
    // Detailed matching analysis
    matched_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
    relevant_experiences: z.array(
      z.object({
        company: z.string(),
        role: z.string(),
        relevance_score: z.number().min(0).max(100),
        relevance_reason: z.string(),
      }),
    ),
  }),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// Enhanced database output schema with all detailed fields
export const JobResumeMatchResultSchema = z.object({
  overall_fit_score: z.number(),
  skills_match_score: z.number(),
  experience_match_score: z.number(),
  education_match_score: z.number(),

  // Enhanced detailed analysis fields
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  relevant_experiences: z.string(), // JSON string of relevant experiences

  // Job requirements breakdown
  job_requirements_extracted: z.array(z.string()),
  job_required_skills: z.array(z.string()),
  job_preferred_skills: z.array(z.string()),
  job_experience_level: z.string(),
  job_education_requirements: z.array(z.string()),

  // AI analysis metadata
  match_analysis_confidence: z.number(),

  // Existing fields (for backward compatibility)
  job_analysis: z.string(),
  strengths: z.string(),
  weaknesses: z.string(),
  recommendations: z.string(),
  suggestions_for_improvement: z.array(z.string()),
  match_reasoning: z.string(),
  calculated_at: z.string(),
});

export type JobResumeMatchResult = z.infer<typeof JobResumeMatchResultSchema>;

// Resume data interface (streamlined)
interface ResumeData {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experiences: Array<{
    company_name: string;
    job_title: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    location: string;
    description: string;
    achievements: string[];
    skills_used: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    grade_gpa: string;
  }>;
  skills: Array<{
    skill_name: string;
    skill_category: string;
    proficiency_level: string;
    years_experience: number;
    context_company: string;
  }>;
  projects: Array<{
    project_name: string;
    description: string;
    technologies_used: string[];
  }>;
  certifications: Array<{
    certification_name: string;
    issuing_organization: string;
    issue_date: string;
  }>;
}

// Enhanced job info with clean structure
interface EnhancedJobInfo {
  originalJobDescription: string;
  screenshots: Array<{
    url: string;
    title: string;
    imageData: string; // base64 image data
  }>;
}

// === Main Task ===

export const matchJobToResume = task({
  id: "match-job-to-resume",
  maxDuration: 300,
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: z.infer<typeof JobResumeMatchingPayloadSchema>) => {
    const startTime = Date.now();

    try {
      // Validate payload with Zod schema
      const validatedPayload = JobResumeMatchingPayloadSchema.parse(payload);

      logger.info("🎯 Starting job-resume matching", {
        applicationId: validatedPayload.applicationId,
        resumeId: validatedPayload.resumeId,
        companyName: validatedPayload.companyName,
        jobTitle: validatedPayload.jobTitle,
        forceRefresh: validatedPayload.forceRefresh,
      });

      const supabase = createClient();

      // Check for existing match if not forcing refresh
      if (!validatedPayload.forceRefresh) {
        const { data: existingMatch } = await supabase
          .from("application_resume_matches")
          .select("*")
          .eq("application_id", validatedPayload.applicationId)
          .eq("resume_id", validatedPayload.resumeId)
          .single();

        if (existingMatch) {
          logger.info("✅ Found existing match, skipping analysis", {
            matchId: existingMatch.id,
            score: existingMatch.overall_fit_score,
          });
          return { matchId: existingMatch.id, skipped: true };
        }
      }

      // Load resume data
      const resumeData = await getResumeData(
        supabase,
        validatedPayload.resumeId,
      );
      if (!resumeData) {
        throw new Error("Resume not found or not accessible");
      }

      logger.info("📄 Resume data loaded", {
        candidateName: resumeData.full_name,
        experienceCount: resumeData.experiences.length,
        skillsCount: resumeData.skills.length,
        educationCount: resumeData.education.length,
      });

      // Enhance job info with screenshots
      const enhancedJobInfo = await enhanceJobWithScreenshots(
        validatedPayload.companyName,
        validatedPayload.jobTitle,
        validatedPayload.jobDescription,
      );

      logger.info("🔍 Screenshot capture completed", {
        originalLength: validatedPayload.jobDescription.length,
        screenshotsCount: enhancedJobInfo.screenshots.length,
      });

      // Generate comprehensive match analysis
      const matchResult = await generateMatchAnalysis(
        enhancedJobInfo,
        resumeData,
        validatedPayload.companyName,
        validatedPayload.jobTitle,
      );

      // Save results
      await saveMatchResult(supabase, validatedPayload, matchResult);

      const processingTime = Date.now() - startTime;
      logger.info("🎉 Job-resume matching completed", {
        applicationId: validatedPayload.applicationId,
        resumeId: validatedPayload.resumeId,
        overallScore: matchResult.overall_fit_score,
        processingTimeMs: processingTime,
      });

      return {
        matchId: `${validatedPayload.applicationId}-${validatedPayload.resumeId}`,
        scores: {
          overall: matchResult.overall_fit_score,
          skills: matchResult.skills_match_score,
          experience: matchResult.experience_match_score,
          education: matchResult.education_match_score,
        },
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error("❌ Job-resume matching failed", {
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: processingTime,
        payload: payload,
      });
      throw error;
    }
  },
});

// === Core Functions ===

// Serper API interface
interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface SerperResponse {
  organic?: SerperSearchResult[];
}

async function searchJobPostings(
  companyName: string,
  jobTitle: string,
): Promise<string[]> {
  if (!process.env.SERPER_API_KEY) {
    logger.warn("Serper API not configured, skipping job search");
    return [];
  }

  try {
    // Create targeted search query for job postings
    const query = `"${companyName}" "${jobTitle}" jobs (site:careers OR site:jobs OR site:linkedin.com/jobs OR site:indeed.com OR site:glassdoor.com)`;

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 3, // Get top 3 results
        tbs: "qdr:m", // Past month - fresh job postings only
      }),
    });

    if (!response.ok) {
      logger.warn("Serper API request failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const data: SerperResponse = await response.json();

    if (!data.organic || data.organic.length === 0) {
      logger.info("No job postings found in search results");
      return [];
    }

    const jobUrls = data.organic.map((item) => item.link);
    logger.info("Found job posting URLs", {
      count: jobUrls.length,
      urls: jobUrls,
    });

    return jobUrls;
  } catch (error) {
    logger.error("Error searching for job postings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function captureJobScreenshots(urls: string[]): Promise<
  Array<{
    url: string;
    title: string;
    imageData: string;
  }>
> {
  const screenshots: Array<{
    url: string;
    title: string;
    imageData: string;
  }> = [];

  if (urls.length === 0) {
    return screenshots;
  }

  let browser;

  try {
    // Launch Puppeteer - handle both local development and production
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      executablePath: `${process.env.NODE_ENV === "development" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : process.env.PUPPETEER_EXECUTABLE_PATH}`,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    };

    browser = await puppeteer.launch(launchOptions);

    // Limit to first 2 URLs to avoid timeout
    const urlsToProcess = urls.slice(0, 2);

    for (const url of urlsToProcess) {
      try {
        logger.info("📸 Capturing screenshot", { url });

        const page = await browser.newPage();

        // Set viewport and user agent
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        );

        // Navigate to page with timeout
        await page.goto(url, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        // Wait a bit more for dynamic content
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Get page title
        const title = await page.title();

        // Take screenshot
        const screenshotBuffer = await page.screenshot({
          fullPage: true,
          type: "png",
        });

        // Convert to base64
        const imageData = Buffer.from(screenshotBuffer).toString("base64");

        screenshots.push({
          url,
          title: title || "Job Posting Screenshot",
          imageData,
        });

        logger.info("✅ Screenshot captured successfully", {
          url,
          title,
          imageSize: imageData.length,
        });

        await page.close();
      } catch (pageError) {
        logger.warn("Failed to capture screenshot for URL", {
          url,
          error:
            pageError instanceof Error ? pageError.message : String(pageError),
        });
      }
    }

    return screenshots;
  } catch (error) {
    logger.error("Error during screenshot capture", {
      error: error instanceof Error ? error.message : String(error),
    });
    return screenshots;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.warn("Error closing browser", { closeError });
      }
    }
  }
}

async function enhanceJobWithScreenshots(
  companyName: string,
  jobTitle: string,
  originalJobDescription: string,
): Promise<EnhancedJobInfo> {
  logger.info("🔍 Searching for job posting screenshots", {
    companyName,
    jobTitle,
  });

  try {
    // Step 1: Search for job posting URLs (optional - requires Serper API)
    const jobUrls = await searchJobPostings(companyName, jobTitle);

    // Step 2: Capture screenshots of found URLs (no proxy needed)
    const screenshots = await captureJobScreenshots(jobUrls);

    logger.info("🎯 Job enhancement completed", {
      originalDescriptionLength: originalJobDescription.length,
      urlsFound: jobUrls.length,
      screenshotsCaptured: screenshots.length,
    });

    return {
      originalJobDescription,
      screenshots,
    };
  } catch (error) {
    logger.error("❌ Failed to enhance job with screenshots", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      originalJobDescription,
      screenshots: [],
    };
  }
}

async function generateMatchAnalysis(
  enhancedJobInfo: EnhancedJobInfo,
  resumeData: ResumeData,
  companyName: string,
  jobTitle: string,
): Promise<JobResumeMatchResult> {
  const resumeText = formatResumeForAnalysis(resumeData);

  logger.info("🤖 Generating match analysis", {
    candidateName: resumeData.full_name,
    jobTitle,
    companyName,
    resumeLength: resumeText.length,
    screenshotsCount: enhancedJobInfo.screenshots.length,
  });

  // Prepare content parts including text and images
  const contentParts: Array<
    { type: "text"; text: string } | { type: "image"; image: string }
  > = [
    {
      type: "text",
      text: `You are an expert technical recruiter analyzing job-resume compatibility. I'm providing you with the job description and visual screenshots of the job posting to help you make a comprehensive analysis.

<job_context>
COMPANY: ${companyName}
POSITION: ${jobTitle}

JOB DESCRIPTION:
${enhancedJobInfo.originalJobDescription}
</job_context>

<candidate_profile>
${resumeText}
</candidate_profile>

${
  enhancedJobInfo.screenshots.length > 0
    ? `I'm also providing ${enhancedJobInfo.screenshots.length} screenshot(s) of the actual job posting. Please analyze these images for additional context about:
- Specific technical requirements mentioned
- Preferred qualifications and skills
- Experience level expectations
- Company culture and work environment details
- Benefits and compensation information
- Any visual cues about the role requirements

Use both the job description text and the visual information from the screenshots to provide a comprehensive analysis.`
    : "No screenshots available - analyze based on the job description text only."
}

Analyze the match between this candidate and the job requirements with maximum detail and precision. Your analysis should include:

1. **Detailed Skill Analysis**: Extract and categorize ALL skills mentioned in the job posting (required vs preferred), then map them against the candidate's skills with exact matches and near-matches.

2. **Experience Relevance Scoring**: For each of the candidate's work experiences, provide a relevance score (0-100) and explain how it relates to the job requirements.

3. **Comprehensive Job Requirements Extraction**: Break down the job posting into specific, actionable requirements including technical skills, soft skills, education, experience level, and qualifications.

4. **Gap Analysis**: Identify exactly what the candidate is missing and what they excel at, with specific examples and evidence.

5. **Confidence Assessment**: Provide an overall confidence score (0.0-1.0) for your analysis based on the quality and completeness of information available.

**CRITICAL ORDERING REQUIREMENTS:**
- **candidate_strengths**: Order by IMPACT PRIORITY - put the most compelling, job-relevant strength FIRST (this will be displayed as "Top Strength")
- **candidate_gaps**: Order by CRITICALITY - put the most significant gap that could affect hiring decisions FIRST (this will be displayed as "Key Gap")
- **recommendations**: Order by ACTIONABILITY - put the most practical, immediate actions first

**Prioritization Guidelines:**
- Top Strength: Choose the strength that most directly matches core job requirements and would impress hiring managers most
- Key Gap: Choose the gap that poses the biggest risk to getting hired or succeeding in the role
- Consider both technical and non-technical factors when prioritizing

Be specific, detailed, and provide actionable insights. Use exact skill names and technologies mentioned in both the job posting and resume.

\`\`\`json
{
  "scores": {
    "overall": 0.85,
    "skills": 0.90,
    "experience": 0.80,
    "education": 0.85
  },
  "analysis": {
    "job_requirements": {
      "key_skills": ["React", "TypeScript", "Node.js", "AWS"],
      "required_skills": ["React", "TypeScript", "Python", "RESTful APIs"],
      "preferred_skills": ["AWS", "Docker", "GraphQL", "Team leadership"],
      "experience_level": "Mid-level (3-5 years)",
      "education_requirements": "Bachelor's in Computer Science or equivalent",
      "preferred_qualifications": ["Cloud architecture", "Team leadership", "Agile methodologies"]
    },
    "candidate_strengths": [
      "Extensive React and TypeScript experience directly matching core requirements - 4+ years building production applications",
      "Proven full-stack development experience with Node.js and modern JavaScript ecosystem",
      "Experience with cloud platforms and DevOps practices showing scalability mindset",
      "Demonstrated ability to work in fast-paced environments and deliver quality code"
    ],
    "candidate_gaps": [
      "No AWS experience (candidate has Azure/GCP) - critical for this role's cloud infrastructure requirements",
      "Missing team leadership experience for senior-level expectations",
      "No GraphQL experience despite being preferred requirement",
      "Lacks specific experience with company's preferred DevOps tools (Docker, K8s)"
    ],
    "recommendations": [
      "Highlight transferable cloud skills from Azure to AWS",
      "Emphasize collaborative project experiences as leadership potential",
      "Consider AWS certification to strengthen cloud credentials",
      "Showcase problem-solving abilities with specific project examples"
    ],
    "fit_summary": "Strong technical match with relevant full-stack experience. Candidate demonstrates the core competencies required and shows growth potential. Minor gaps in specific AWS experience and formal leadership roles, but overall excellent fit for the position.",
    "matched_skills": [
      "React",
      "TypeScript",
      "Python",
      "RESTful APIs",
      "PostgreSQL",
      "Git"
    ],
    "missing_skills": [
      "AWS (has Azure/GCP instead)",
      "Django (has other frameworks)",
      "GraphQL",
      "Docker",
      "Team leadership experience"
    ],
    "relevant_experiences": [
      {
        "company": "TechCorp Inc",
        "role": "Full-Stack Developer",
        "relevance_score": 92,
        "relevance_reason": "Direct experience with React, Python, and API development matches core job requirements"
      },
      {
        "company": "StartupX",
        "role": "Software Engineer",
        "relevance_score": 78,
        "relevance_reason": "Cloud platform experience and database work, though with different technologies"
      }
    ]
  },
  "confidence": 0.88,
  "reasoning": "The candidate shows strong alignment with technical requirements, particularly in frontend and backend development. The experience level matches well with the mid-level position requirements. While there are some gaps in AWS-specific experience, the overall technical foundation is solid and transferable skills are evident."
}
\`\`\`

Provide your analysis following this exact JSON structure. Be thorough, specific, and actionable in your assessment.`,
    },
  ];

  // Add screenshot images to the content parts
  for (const screenshot of enhancedJobInfo.screenshots) {
    contentParts.push({
      type: "image",
      image: screenshot.imageData, // base64 image data
    });
  }

  try {
    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: contentParts,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent output
    });

    logger.info("🤖 AI response", {
      response: response.text,
    });

    logger.info("🤖 AI response received", {
      responseLength: response.text.length,
      hasContent: response.text.length > 0,
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
    const validatedAnalysis = MatchAnalysisSchema.parse(parsedAnalysis);

    logger.info("✅ Analysis parsed and validated", {
      overallScore: validatedAnalysis.scores.overall,
      skillsScore: validatedAnalysis.scores.skills,
      strengthsCount: validatedAnalysis.analysis.candidate_strengths.length,
      gapsCount: validatedAnalysis.analysis.candidate_gaps.length,
    });

    // Transform to database format with comprehensive details
    return {
      overall_fit_score: validatedAnalysis.scores.overall,
      skills_match_score: validatedAnalysis.scores.skills,
      experience_match_score: validatedAnalysis.scores.experience,
      education_match_score: validatedAnalysis.scores.education,

      // Enhanced detailed analysis fields
      matched_skills: validatedAnalysis.analysis.matched_skills,
      missing_skills: validatedAnalysis.analysis.missing_skills,
      relevant_experiences: JSON.stringify(
        validatedAnalysis.analysis.relevant_experiences,
      ),

      // Job requirements breakdown
      job_requirements_extracted:
        validatedAnalysis.analysis.job_requirements.key_skills,
      job_required_skills:
        validatedAnalysis.analysis.job_requirements.required_skills,
      job_preferred_skills:
        validatedAnalysis.analysis.job_requirements.preferred_skills,
      job_experience_level:
        validatedAnalysis.analysis.job_requirements.experience_level,
      job_education_requirements: [
        validatedAnalysis.analysis.job_requirements.education_requirements,
      ],

      // AI analysis metadata
      match_analysis_confidence: validatedAnalysis.confidence,

      // Existing fields (for backward compatibility)
      job_analysis: JSON.stringify(validatedAnalysis.analysis.job_requirements),
      strengths: validatedAnalysis.analysis.candidate_strengths.join("\n• "),
      weaknesses: validatedAnalysis.analysis.candidate_gaps.join("\n• "),
      recommendations: validatedAnalysis.analysis.recommendations.join("\n• "),
      suggestions_for_improvement: validatedAnalysis.analysis.recommendations,
      match_reasoning: `${validatedAnalysis.analysis.fit_summary}\n\nDetailed reasoning: ${validatedAnalysis.reasoning}`,
      calculated_at: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("❌ Failed to generate match analysis", {
      error: error instanceof Error ? error.message : String(error),
      candidateName: resumeData.full_name,
    });

    // Enhanced fallback with all detailed fields
    return {
      overall_fit_score: 0,
      skills_match_score: 0,
      experience_match_score: 0,
      education_match_score: 0,

      // Enhanced detailed analysis fields (empty defaults)
      matched_skills: [],
      missing_skills: ["Analysis failed - please regenerate match"],
      relevant_experiences: "[]",

      // Job requirements breakdown (empty defaults)
      job_requirements_extracted: ["Analysis failed"],
      job_required_skills: ["Analysis failed"],
      job_preferred_skills: [],
      job_experience_level: "Unknown",
      job_education_requirements: ["Unknown"],

      // AI analysis metadata
      match_analysis_confidence: 0,

      // Existing fields (for backward compatibility)
      job_analysis: JSON.stringify({
        key_skills: ["Analysis failed"],
        required_skills: ["Analysis failed"],
        preferred_skills: [],
        experience_level: "Unknown",
        education_requirements: "Unknown",
        preferred_qualifications: [],
      }),
      strengths: "Analysis failed - please regenerate match",
      weaknesses: "Unable to analyze - please regenerate match",
      recommendations: "Regenerate this match for proper analysis",
      suggestions_for_improvement: [
        "Regenerate this match for proper analysis",
      ],
      match_reasoning: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      calculated_at: new Date().toISOString(),
    };
  }
}

function formatResumeForAnalysis(resume: ResumeData): string {
  const sections = [
    `CANDIDATE: ${resume.full_name}`,
    `CONTACT: ${resume.email} | ${resume.phone} | ${resume.location}`,
  ];

  if (resume.summary) {
    sections.push(`SUMMARY:\n${resume.summary}`);
  }

  if (resume.experiences.length > 0) {
    sections.push(`WORK EXPERIENCE:`);
    resume.experiences.forEach((exp) => {
      sections.push(
        `• ${exp.job_title} at ${exp.company_name} (${exp.start_date} - ${exp.is_current ? "Present" : exp.end_date})`,
      );
      sections.push(`  ${exp.description}`);
      if (exp.achievements.length > 0) {
        sections.push(`  Key Achievements: ${exp.achievements.join("; ")}`);
      }
      if (exp.skills_used.length > 0) {
        sections.push(`  Technologies: ${exp.skills_used.join(", ")}`);
      }
    });
  }

  if (resume.skills.length > 0) {
    sections.push(`TECHNICAL SKILLS:`);
    const skillsByCategory = resume.skills.reduce(
      (acc, skill) => {
        if (!acc[skill.skill_category]) acc[skill.skill_category] = [];
        acc[skill.skill_category].push(
          `${skill.skill_name} (${skill.years_experience}y, ${skill.proficiency_level})`,
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
        `• ${edu.degree} in ${edu.field_of_study}, ${edu.institution} (${edu.start_date} - ${edu.end_date})`,
      );
      if (edu.grade_gpa) {
        sections.push(`  GPA: ${edu.grade_gpa}`);
      }
    });
  }

  if (resume.projects.length > 0) {
    sections.push(`KEY PROJECTS:`);
    resume.projects.forEach((project) => {
      sections.push(`• ${project.project_name}: ${project.description}`);
      sections.push(`  Tech Stack: ${project.technologies_used.join(", ")}`);
    });
  }

  if (resume.certifications.length > 0) {
    sections.push(`CERTIFICATIONS:`);
    resume.certifications.forEach((cert) => {
      sections.push(
        `• ${cert.certification_name} - ${cert.issuing_organization} (${cert.issue_date})`,
      );
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
    const [
      experiencesResult,
      educationResult,
      skillsResult,
      projectsResult,
      certificationsResult,
    ] = await Promise.all([
      supabase
        .from("resume_experiences")
        .select("*")
        .eq("resume_id", resumeId)
        .order("start_date", { ascending: false }),
      supabase
        .from("resume_education")
        .select("*")
        .eq("resume_id", resumeId)
        .order("start_date", { ascending: false }),
      supabase
        .from("resume_skills")
        .select("*")
        .eq("resume_id", resumeId)
        .order("years_experience", { ascending: false }),
      supabase.from("resume_projects").select("*").eq("resume_id", resumeId),
      supabase
        .from("resume_certifications")
        .select("*")
        .eq("resume_id", resumeId)
        .order("issue_date", { ascending: false }),
    ]);

    // Check for errors
    if (
      experiencesResult.error ||
      educationResult.error ||
      skillsResult.error ||
      projectsResult.error ||
      certificationsResult.error
    ) {
      logger.error("Failed to fetch resume related data", { resumeId });
      return null;
    }

    return {
      id: resume.id,
      full_name: resume.full_name || "Unknown Candidate",
      email: resume.email || "",
      phone: resume.phone || "",
      location: resume.location || "",
      summary: resume.summary || "",
      experiences: experiencesResult.data || [],
      education: educationResult.data || [],
      skills: skillsResult.data || [],
      projects: projectsResult.data || [],
      certifications: certificationsResult.data || [],
    };
  } catch (error) {
    logger.error("Error fetching resume data", { resumeId, error });
    return null;
  }
}

async function saveMatchResult(
  supabase: ReturnType<typeof createClient>,
  payload: z.infer<typeof JobResumeMatchingPayloadSchema>,
  matchResult: JobResumeMatchResult,
): Promise<void> {
  try {
    const { error } = await supabase.from("application_resume_matches").upsert({
      application_id: payload.applicationId,
      resume_id: payload.resumeId,
      user_id: payload.userId,

      // Core scores
      overall_fit_score: matchResult.overall_fit_score,
      skills_match_score: matchResult.skills_match_score,
      experience_match_score: matchResult.experience_match_score,
      education_match_score: matchResult.education_match_score,

      // Enhanced detailed analysis fields
      matched_skills: matchResult.matched_skills,
      missing_skills: matchResult.missing_skills,
      relevant_experiences: matchResult.relevant_experiences,

      // Job requirements breakdown
      job_requirements_extracted: matchResult.job_requirements_extracted,
      job_required_skills: matchResult.job_required_skills,
      job_preferred_skills: matchResult.job_preferred_skills,
      job_experience_level: matchResult.job_experience_level,
      job_education_requirements: matchResult.job_education_requirements,

      // AI analysis metadata
      match_analysis_confidence: matchResult.match_analysis_confidence,
      suggestions_for_improvement: matchResult.suggestions_for_improvement,

      // Existing fields (for backward compatibility)
      job_analysis: matchResult.job_analysis,
      strengths: matchResult.strengths,
      weaknesses: matchResult.weaknesses,
      recommendations: matchResult.recommendations,
      match_reasoning: matchResult.match_reasoning,
      calculated_at: matchResult.calculated_at,
    });

    if (error) {
      throw new Error(`Database save failed: ${error.message}`);
    }

    logger.info("✅ Match result saved successfully", {
      applicationId: payload.applicationId,
      resumeId: payload.resumeId,
      overallScore: matchResult.overall_fit_score,
      confidenceScore: matchResult.match_analysis_confidence,
      matchedSkillsCount: matchResult.matched_skills.length,
      missingSkillsCount: matchResult.missing_skills.length,
    });
  } catch (error) {
    logger.error("❌ Failed to save match result", {
      error: error instanceof Error ? error.message : String(error),
      payload,
    });
    throw error;
  }
}
