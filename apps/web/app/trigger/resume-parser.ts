import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { logger, task } from "@trigger.dev/sdk/v3";
import { generateObject } from "ai";
import { z } from "zod";
import createClient from "./create-client";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const model = google("gemini-2.0-flash");

// === Resume Parsing Progress Stream Types ===

export type RESUME_PARSE_STREAMS = {
  progress: {
    stage: "initializing" | "extracting" | "analyzing" | "saving" | "completed";
    message: string;
    progress: number; // 0-100
    confidence?: number;
    extractedData?: {
      experiencesCount?: number;
      skillsCount?: number;
      educationCount?: number;
      projectsCount?: number;
      certificationsCount?: number;
    };
  };
};

// === Resume Parsing Schemas ===

const ResumeParsingPayloadSchema = z.object({
  userId: z.string(),
  resumeId: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileBuffer: z.string(), // Base64 encoded file data
});

// Experience entry schema
const ExperienceSchema = z.object({
  company_name: z.string(),
  job_title: z.string(),
  start_date: z.string().nullable(), // "YYYY-MM" or "YYYY-MM-DD" format
  end_date: z.string().nullable(), // null for current position
  is_current: z.boolean(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  achievements: z.array(z.string()),
  skills_used: z.array(z.string()),
  display_order: z.number(),
});

// Education entry schema
const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  field_of_study: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  grade_gpa: z.string().nullable(),
  description: z.string().nullable(),
  relevant_coursework: z.array(z.string()),
  display_order: z.number(),
});

// Skill entry schema
const SkillSchema = z.object({
  skill_name: z.string(),
  skill_category: z.enum([
    "programming",
    "frameworks",
    "tools",
    "languages",
    "soft_skills",
    "databases",
    "cloud",
    "methodologies",
    "other",
  ]),
  proficiency_level: z
    .enum(["beginner", "intermediate", "advanced", "expert"])
    .nullable(),
  years_experience: z.number().nullable(),
  mentioned_in_section: z.string(),
  context_company: z.string().nullable(),
  normalized_skill_name: z.string(),
});

// Project entry schema
const ProjectSchema = z.object({
  project_name: z.string(),
  description: z.string().nullable(),
  technologies_used: z.array(z.string()),
  project_url: z.string().nullable(),
  github_url: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  display_order: z.number(),
});

// Certification entry schema
const CertificationSchema = z.object({
  certification_name: z.string(),
  issuing_organization: z.string().nullable(),
  issue_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  credential_id: z.string().nullable(),
  credential_url: z.string().nullable(),
});

// Main parsed resume schema - made more flexible to handle missing data
const ParsedResumeSchema = z.object({
  // Personal information - made flexible
  full_name: z
    .string()
    .nullable()
    .describe("The person's full name from the resume"),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string().nullable(),

  // Structured sections
  experiences: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(SkillSchema),
  projects: z.array(ProjectSchema),
  certifications: z.array(CertificationSchema),

  // Analysis metadata
  parsing_confidence: z.number().min(0).max(1),
  sections_found: z.array(z.string()),
  parsing_notes: z.string().nullable(),
});

export type ParsedResumeData = z.infer<typeof ParsedResumeSchema>;

// === Main Resume Parsing Task ===

export const parseResume = task({
  id: "parse-resume",
  description: "Parse and extract structured data from resume using AI",
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof ResumeParsingPayloadSchema>) => {
    const validatedPayload = ResumeParsingPayloadSchema.parse(payload);
    const supabase = createClient();

    logger.info("Starting resume parsing", {
      userId: validatedPayload.userId,
      resumeId: validatedPayload.resumeId,
      fileName: validatedPayload.fileName,
      fileType: validatedPayload.fileType,
    });

    // Helper function to update parsing progress
    const updateProgress = async (
      stage:
        | "initializing"
        | "extracting"
        | "analyzing"
        | "saving"
        | "completed",
      message: string,
      progress: number,
      additionalData?: Record<string, unknown>,
    ) => {
      try {
        logger.info("🔄 Updating resume parsing progress", {
          resumeId: validatedPayload.resumeId,
          stage,
          progress,
          message,
          additionalData,
        });

        const updateData = {
          parsing_progress: progress,
          parsing_stage: stage,
          parsing_message: message,
          parsing_data: additionalData || null,
          updated_at: new Date().toISOString(),
        };

        logger.info("📝 Database update payload", {
          resumeId: validatedPayload.resumeId,
          updateData,
        });

        const { data, error } = await supabase
          .from("resumes")
          .update(updateData)
          .eq("id", validatedPayload.resumeId)
          .select(
            "id, parsing_progress, parsing_stage, parsing_message, parsing_status",
          )
          .single();

        if (error) {
          logger.error("❌ Failed to update resume progress", {
            resumeId: validatedPayload.resumeId,
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
          throw error;
        }

        logger.info("✅ Resume progress updated successfully", {
          resumeId: validatedPayload.resumeId,
          stage,
          progress,
          message,
          updatedData: data,
        });
      } catch (error) {
        logger.error("💥 Error in updateProgress function", {
          resumeId: validatedPayload.resumeId,
          stage,
          progress,
          message,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    };

    try {
      // Update resume status to processing
      await updateProgress("initializing", "Updating resume status...", 10);

      await supabase
        .from("resumes")
        .update({
          parsing_status: "processing",
        })
        .eq("id", validatedPayload.resumeId);

      // Convert base64 back to buffer for AI processing
      await updateProgress(
        "extracting",
        "Preparing file for AI analysis...",
        20,
      );

      const fileBuffer = Buffer.from(validatedPayload.fileBuffer, "base64");

      // Use AI SDK with direct file processing
      await updateProgress("analyzing", "AI is analyzing your resume...", 30);

      // Add intermediate progress for AI analysis stages
      await new Promise((resolve) => setTimeout(resolve, 800));
      await updateProgress(
        "analyzing",
        "Extracting personal information...",
        40,
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await updateProgress(
        "analyzing",
        "Analyzing work experience and skills...",
        50,
      );

      await new Promise((resolve) => setTimeout(resolve, 1200));
      await updateProgress(
        "analyzing",
        "Processing education and certifications...",
        60,
      );

      const result = await generateObject({
        model: model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are an expert AI assistant specialized in parsing resumes with extreme precision. 

Please analyze this resume and extract all structured information including:

**PERSONAL INFORMATION:**
- Full name, email, phone, location
- Professional summary

**WORK EXPERIENCE:**
- All work experiences in reverse chronological order
- Company names, job titles, dates, locations, descriptions
- Individual achievements and skills mentioned

**EDUCATION:**
- All educational institutions, degrees, fields of study, dates, GPAs
- Relevant coursework if listed

**SKILLS:**
- All technical and soft skills mentioned
- Categorize appropriately (programming, frameworks, tools, databases, cloud, languages, soft_skills, methodologies, other)
- Estimate proficiency levels based on context

**PROJECTS:**
- Personal/side projects with descriptions and technologies

**CERTIFICATIONS:**
- Professional certifications with organizations and dates

**IMPORTANT RULES:**
1. Extract ALL information comprehensively
2. Use exact text as written for names and titles
3. Convert dates to YYYY-MM format (e.g., "August 2023" → "2023-08", "January 2022" → "2022-01", "December 2021" → "2021-12")
4. Use null for missing information, don't guess
5. Rate your parsing confidence (0.0-1.0)
6. If you cannot extract a name from the resume, set full_name to null

CRITICAL: When parsing dates, ensure months are correctly numbered (January=01, February=02, ..., August=08, ..., December=12).

Provide structured output with high accuracy.`,
              },
              {
                type: "file",
                data: fileBuffer,
                mimeType: validatedPayload.fileType,
              },
            ],
          },
        ],
        schema: ParsedResumeSchema,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "parse-resume",
        },
      });

      const validatedResult = result.object;

      // Add a small delay to show the analyzing stage
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Send progress update with extracted data counts
      await updateProgress(
        "analyzing",
        "Resume analysis completed, processing data...",
        70,
        {
          confidence: validatedResult.parsing_confidence,
          extractedData: {
            experiencesCount: validatedResult.experiences.length,
            skillsCount: validatedResult.skills.length,
            educationCount: validatedResult.education.length,
            projectsCount: validatedResult.projects.length,
            certificationsCount: validatedResult.certifications.length,
          },
        },
      );

      // Handle case where AI couldn't extract full_name
      if (!validatedResult.full_name) {
        validatedResult.full_name = `Resume ${validatedPayload.fileName}`;
        logger.warn("Could not extract full name from resume, using filename");
      }

      // Add delay before saving to database
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Save parsed data to database
      await updateProgress(
        "saving",
        "Saving structured data to database...",
        90,
        {
          extractedData: {
            experiencesCount: validatedResult.experiences.length,
            skillsCount: validatedResult.skills.length,
            educationCount: validatedResult.education.length,
            projectsCount: validatedResult.projects.length,
            certificationsCount: validatedResult.certifications.length,
          },
        },
      );

      await saveStructuredResumeData(
        supabase,
        validatedPayload.resumeId,
        validatedResult,
      );

      // Add progress update for finalization
      await new Promise((resolve) => setTimeout(resolve, 800));
      await updateProgress("saving", "Finalizing resume analysis...", 95, {
        confidence: validatedResult.parsing_confidence,
        extractedData: {
          experiencesCount: validatedResult.experiences.length,
          skillsCount: validatedResult.skills.length,
          educationCount: validatedResult.education.length,
          projectsCount: validatedResult.projects.length,
          certificationsCount: validatedResult.certifications.length,
        },
      });

      // Add final delay before completion
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Final completion update
      await updateProgress(
        "completed",
        "Resume parsing completed successfully!",
        100,
        {
          confidence: validatedResult.parsing_confidence,
          extractedData: {
            experiencesCount: validatedResult.experiences.length,
            skillsCount: validatedResult.skills.length,
            educationCount: validatedResult.education.length,
            projectsCount: validatedResult.projects.length,
            certificationsCount: validatedResult.certifications.length,
          },
        },
      );

      logger.info("Resume parsing completed successfully", {
        userId: validatedPayload.userId,
        resumeId: validatedPayload.resumeId,
        confidence: validatedResult.parsing_confidence,
        experiencesFound: validatedResult.experiences.length,
        skillsFound: validatedResult.skills.length,
        extractedName: validatedResult.full_name,
      });

      return {
        success: true,
        resumeId: validatedPayload.resumeId,
        parsedData: validatedResult,
        message: "Resume parsed successfully",
      };
    } catch (error) {
      logger.error("Error parsing resume", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: validatedPayload.userId,
        resumeId: validatedPayload.resumeId,
      });

      // Send error progress update
      await updateProgress(
        "completed",
        `Parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        100,
      );

      // Update resume status to failed
      await supabase
        .from("resumes")
        .update({
          parsing_status: "failed",
          parsing_error:
            error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", validatedPayload.resumeId);

      throw error;
    }
  },
});

// === Helper Functions ===

// Helper function to safely parse dates
function parseResumeDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;

  // Handle common non-date values
  const lowerDate = dateString.toLowerCase().trim();
  if (
    lowerDate === "present" ||
    lowerDate === "current" ||
    lowerDate === "now" ||
    lowerDate === "ongoing"
  ) {
    return null; // Return null for "present" dates
  }

  try {
    // Try to parse as YYYY-MM or YYYY format first
    let dateToCreate: Date;

    if (/^\d{4}$/.test(dateString.trim())) {
      // Year only (e.g., "2020")
      dateToCreate = new Date(`${dateString}-01-01`);
    } else if (/^\d{4}-\d{2}$/.test(dateString.trim())) {
      // Year-Month format (e.g., "2020-03")
      dateToCreate = new Date(`${dateString}-01`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateString.trim())) {
      // Full date format (e.g., "2020-03-15")
      dateToCreate = new Date(dateString);
    } else {
      // Try to parse as-is (might be a different format)
      dateToCreate = new Date(dateString);
    }

    // Check if the date is valid
    if (isNaN(dateToCreate.getTime())) {
      console.warn(`Invalid date format: ${dateString}, returning null`);
      return null;
    }

    return dateToCreate.toISOString().split("T")[0];
  } catch (error) {
    console.warn(`Error parsing date: ${dateString}`, error);
    return null;
  }
}

async function saveStructuredResumeData(
  supabase: ReturnType<typeof createClient>,
  resumeId: string,
  parsedData: ParsedResumeData,
): Promise<void> {
  try {
    // Update main resume record
    await supabase
      .from("resumes")
      .update({
        parsing_status: "completed",
        parsed_at: new Date().toISOString(),
        parsed_data: parsedData,
        full_name: parsedData.full_name,
        email: parsedData.email,
        phone: parsedData.phone,
        location: parsedData.location,
        summary: parsedData.summary,
      })
      .eq("id", resumeId);

    // Save experiences
    if (parsedData.experiences.length > 0) {
      const experiencesToInsert = parsedData.experiences.map((exp) => ({
        resume_id: resumeId,
        company_name: exp.company_name,
        job_title: exp.job_title,
        start_date: parseResumeDate(exp.start_date),
        end_date: parseResumeDate(exp.end_date),
        is_current: exp.is_current,
        location: exp.location,
        description: exp.description,
        achievements: exp.achievements,
        skills_used: exp.skills_used,
        ai_confidence: parsedData.parsing_confidence,
        ai_extracted: true,
        display_order: exp.display_order,
      }));

      await supabase.from("resume_experiences").insert(experiencesToInsert);
    }

    // Save education
    if (parsedData.education.length > 0) {
      const educationToInsert = parsedData.education.map((edu) => ({
        resume_id: resumeId,
        institution: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study,
        start_date: parseResumeDate(edu.start_date),
        end_date: parseResumeDate(edu.end_date),
        grade_gpa: edu.grade_gpa,
        description: edu.description,
        relevant_coursework: edu.relevant_coursework,
        ai_confidence: parsedData.parsing_confidence,
        ai_extracted: true,
        display_order: edu.display_order,
      }));

      await supabase.from("resume_education").insert(educationToInsert);
    }

    // Save skills
    if (parsedData.skills.length > 0) {
      const skillsToInsert = parsedData.skills.map((skill) => ({
        resume_id: resumeId,
        skill_name: skill.skill_name,
        skill_category: skill.skill_category,
        proficiency_level: skill.proficiency_level,
        years_experience: skill.years_experience,
        mentioned_in_section: skill.mentioned_in_section,
        context_company: skill.context_company,
        ai_confidence: parsedData.parsing_confidence,
        ai_extracted: true,
        normalized_skill_name: skill.normalized_skill_name,
      }));

      // Insert skills with conflict resolution for duplicates
      for (const skill of skillsToInsert) {
        await supabase
          .from("resume_skills")
          .upsert(skill, { onConflict: "resume_id,skill_name" });
      }
    }

    // Save projects
    if (parsedData.projects.length > 0) {
      const projectsToInsert = parsedData.projects.map((project) => ({
        resume_id: resumeId,
        project_name: project.project_name,
        description: project.description,
        technologies_used: project.technologies_used,
        project_url: project.project_url,
        github_url: project.github_url,
        start_date: parseResumeDate(project.start_date),
        end_date: parseResumeDate(project.end_date),
        ai_confidence: parsedData.parsing_confidence,
        ai_extracted: true,
        display_order: project.display_order,
      }));

      await supabase.from("resume_projects").insert(projectsToInsert);
    }

    // Save certifications
    if (parsedData.certifications.length > 0) {
      const certificationsToInsert = parsedData.certifications.map((cert) => ({
        resume_id: resumeId,
        certification_name: cert.certification_name,
        issuing_organization: cert.issuing_organization,
        issue_date: parseResumeDate(cert.issue_date),
        expiry_date: parseResumeDate(cert.expiry_date),
        credential_id: cert.credential_id,
        credential_url: cert.credential_url,
        ai_confidence: parsedData.parsing_confidence,
        ai_extracted: true,
      }));

      await supabase
        .from("resume_certifications")
        .insert(certificationsToInsert);
    }

    logger.info("Successfully saved structured resume data", {
      resumeId,
      experiencesSaved: parsedData.experiences.length,
      educationSaved: parsedData.education.length,
      skillsSaved: parsedData.skills.length,
      projectsSaved: parsedData.projects.length,
      certificationsSaved: parsedData.certifications.length,
    });
  } catch (error) {
    logger.error("Failed to save structured resume data", {
      error: error instanceof Error ? error.message : "Unknown error",
      resumeId,
    });
    throw error;
  }
}
