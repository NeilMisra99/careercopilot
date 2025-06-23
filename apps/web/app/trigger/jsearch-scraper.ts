import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import createClient from "./create-client";
import { saveJobWithUserAssociation } from "./shared-job-helpers";

// Simple rate limiter to ensure we don't exceed API limits
class RateLimiter {
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly maxRequestsPerSecond = 1; // Conservative for JSearch
  private readonly windowMs = 1000;

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset counter if we're in a new window
    if (timeSinceLastRequest >= this.windowMs) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    // If we've hit the limit, wait until the next window
    if (this.requestCount >= this.maxRequestsPerSecond) {
      const waitTime = this.windowMs - timeSinceLastRequest;
      if (waitTime > 0) {
        logger.info(`⏱️ Rate limiting: waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
      }
    }

    this.requestCount++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JSearch API Configuration
// ═══════════════════════════════════════════════════════════════════════════

const JSEARCH_API_BASE_URL = "https://jsearch.p.rapidapi.com";

// Validation schema for JSearch scraper input
const JSearchScraperInputSchema = z.object({
  userId: z.string(),
  roles: z.array(z.string()),
  locations: z.array(z.string()),
  daysBack: z.union([z.literal(1), z.literal(7)]), // 1 = Exec (today), 7 = Pro (week)
  autoSave: z.boolean().default(true),
  maxPages: z.number().min(1).max(20).default(1), // JSearch allows 1-20 pages
  // Optional user preferences for better filtering
  remotePreference: z.enum(["remote_only", "hybrid", "on_site", "any"]).optional(),
  jobTypes: z.array(z.string()).optional(), // ["Full-time", "Part-time", etc.]
  experienceLevels: z.array(z.string()).optional(), // ["Entry level", "Mid-senior level", etc.]
  // Premium filters
  excludedCompanies: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
});

// JSearch API response schema based on actual API structure
const JSearchJobSchema = z.object({
  // Core job fields
  job_id: z.string(),
  job_title: z.string(),
  employer_name: z.string(),
  employer_website: z.string().nullable().optional(),
  employer_logo: z.string().nullable().optional(),
  employer_company_type: z.string().nullable().optional(),
  employer_linkedin: z.string().nullable().optional(),

  // Job details
  job_description: z.string().optional(),
  job_apply_link: z.string(),
  job_apply_is_direct: z.boolean().optional(),
  job_apply_quality_score: z.number().nullable().optional(),

  // Employment and location
  job_employment_type: z.string(),
  job_employment_types: z.array(z.string()),
  job_employment_type_text: z.string().optional(),
  job_location: z.string().optional(),
  job_city: z.string().nullable().optional(),
  job_state: z.string().nullable().optional(),
  job_country: z.string().optional(),
  job_latitude: z.number().nullable().optional(),
  job_longitude: z.number().nullable().optional(),
  job_is_remote: z.boolean().optional(),

  // Timing
  job_posted_human_readable: z.string().optional(),
  job_posted_at_timestamp: z.number().nullable().optional(),
  job_posted_at_datetime_utc: z.string().nullable().optional(),
  job_offer_expiration_datetime_utc: z.string().nullable().optional(),
  job_offer_expiration_timestamp: z.number().nullable().optional(),

  // Salary information
  job_salary: z.string().nullable().optional(),
  job_min_salary: z.number().nullable().optional(),
  job_max_salary: z.number().nullable().optional(),
  job_salary_currency: z.string().nullable().optional(),
  job_salary_period: z.string().nullable().optional(),

  // Experience requirements
  job_required_experience: z
    .object({
      no_experience_required: z.boolean().optional(),
      required_experience_in_months: z.number().nullable().optional(),
      experience_mentioned: z.boolean().optional(),
      experience_preferred: z.boolean().optional(),
    })
    .optional(),

  // Additional details
  job_benefits: z.array(z.string()).nullable().optional(),
  job_highlights: z
    .object({
      Qualifications: z.array(z.string()).optional(),
      Responsibilities: z.array(z.string()).optional(),
      Benefits: z.array(z.string()).optional(),
    })
    .optional(),

  // Apply options
  apply_options: z
    .array(
      z.object({
        publisher: z.string(),
        apply_link: z.string(),
        is_direct: z.boolean(),
      }),
    )
    .optional(),

  // Source information
  job_publisher: z.string().optional(),
  job_google_link: z.string().optional(),

  // Additional fields
  job_job_title: z.string().nullable().optional(),
  job_posting_language: z.string().nullable().optional(),
  job_onet_soc: z.string().nullable().optional(),
  job_onet_job_zone: z.string().nullable().optional(),
  job_occupational_categories: z.array(z.string()).nullable().optional(),
  job_naics_code: z.string().nullable().optional(),
  job_naics_name: z.string().nullable().optional(),
});

// JSearch API response wrapper
const JSearchResponseSchema = z.object({
  status: z.string(),
  request_id: z.string().optional(),
  parameters: z
    .object({
      query: z.string(),
      page: z.number(),
      num_pages: z.number(),
      date_posted: z.string().optional(),
      country: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
  data: z.array(JSearchJobSchema),
});

export type JSearchScraperInput = z.infer<typeof JSearchScraperInputSchema>;
export type JSearchJob = z.infer<typeof JSearchJobSchema>;
export type JSearchResponse = z.infer<typeof JSearchResponseSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// JSearch API Client
// ═══════════════════════════════════════════════════════════════════════════

class JSearchApiClient {
  private apiKey: string;
  private baseUrl: string;
  private rateLimiter: RateLimiter;

  constructor() {
    this.apiKey = process.env.RAPIDAPI_JSEARCH_KEY || "";
    this.baseUrl = JSEARCH_API_BASE_URL;
    this.rateLimiter = new RateLimiter();

    if (!this.apiKey) {
      logger.warn("⚠️ RAPIDAPI_JSEARCH_KEY not set - API calls will fail");
    }
  }

  async searchJobs(params: {
    roles: string[];
    locations: string[];
    daysBack: number;
    maxPages?: number;
    country?: string;
    remotePreference?: "remote_only" | "hybrid" | "on_site" | "any";
    jobTypes?: string[];
    experienceLevels?: string[];
  }): Promise<JSearchJob[]> {
    if (!this.apiKey) {
      throw new Error("RAPIDAPI_JSEARCH_KEY environment variable is required");
    }

    const allJobs: JSearchJob[] = [];

    // Create search queries for each role-location combination
    for (const role of params.roles) {
      for (const location of params.locations) {
        try {
          const query = this.buildQuery(role, location);
          const searchParams = this.buildSearchParams({
            query,
            daysBack: params.daysBack,
            maxPages: params.maxPages || 1,
            country: params.country || this.getCountryFromLocation(location),
            remotePreference: params.remotePreference,
            jobTypes: params.jobTypes,
            experienceLevels: params.experienceLevels,
          });

          logger.info("🔍 Searching JSearch jobs", {
            query,
            maxPages: params.maxPages || 1,
            daysBack: params.daysBack,
            country: searchParams.get("country"),
            workFromHome: searchParams.get("work_from_home"),
            employmentTypes: searchParams.get("employment_types"),
            jobRequirements: searchParams.get("job_requirements"),
            language: searchParams.get("language"),
          });

          // Apply rate limiting before making the request
          await this.rateLimiter.waitIfNeeded();

          const url = `${this.baseUrl}/search?${searchParams.toString()}`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "X-RapidAPI-Key": this.apiKey,
              "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `JSearch API error: ${response.status} ${response.statusText} - ${errorText}`,
            );
          }

          const data = await response.json();

          // Validate response
          const validatedResponse = JSearchResponseSchema.parse(data);

          if (validatedResponse.status !== "OK") {
            logger.warn("JSearch API returned non-OK status", {
              status: validatedResponse.status,
              query,
            });
            continue;
          }

          // Add jobs to collection
          if (validatedResponse.data && validatedResponse.data.length > 0) {
            allJobs.push(...validatedResponse.data);
            logger.info("✅ JSearch jobs retrieved successfully", {
              jobsFound: validatedResponse.data.length,
              query,
              role,
              location,
            });
          } else {
            logger.info("No jobs found for query", { query, role, location });
          }
        } catch (error) {
          logger.error("❌ Failed to search JSearch jobs for combination", {
            role,
            location,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with next combination instead of failing entirely
        }
      }
    }

    return allJobs;
  }

  private buildQuery(role: string, location: string): string {
    // Build natural language query as recommended by JSearch
    const locationPart =
      location.toLowerCase() === "remote" ? "remote" : `in ${location}`;

    return `${role} jobs ${locationPart}`;
  }

  private buildSearchParams(params: {
    query: string;
    daysBack: number;
    maxPages: number;
    country: string;
    remotePreference?: "remote_only" | "hybrid" | "on_site" | "any";
    jobTypes?: string[];
    experienceLevels?: string[];
  }): URLSearchParams {
    const searchParams = new URLSearchParams();

    searchParams.append("query", params.query);
    searchParams.append("page", "1");
    searchParams.append("num_pages", Math.min(params.maxPages, 20).toString());
    searchParams.append("country", params.country);

    // Map daysBack to JSearch date_posted values
    const datePosted = this.mapDaysBackToDatePosted(params.daysBack);
    if (datePosted) {
      searchParams.append("date_posted", datePosted);
    }

    // Add language parameter (default to English)
    searchParams.append("language", "en");

    // Map remote preference to work_from_home parameter
    if (params.remotePreference === "remote_only") {
      searchParams.append("work_from_home", "true");
    }

    // Map job types to employment_types parameter
    if (params.jobTypes && params.jobTypes.length > 0) {
      const employmentTypes = params.jobTypes
        .map((type) => this.mapJobTypeToEmploymentType(type))
        .filter((type) => type !== null)
        .join(",");
      
      if (employmentTypes) {
        searchParams.append("employment_types", employmentTypes);
      }
    }

    // Map experience levels to job_requirements parameter
    if (params.experienceLevels && params.experienceLevels.length > 0) {
      const requirements = this.mapExperienceLevelsToRequirements(params.experienceLevels);
      if (requirements.length > 0) {
        searchParams.append("job_requirements", requirements.join(","));
      }
    }

    return searchParams;
  }

  private mapDaysBackToDatePosted(daysBack: number): string {
    // Map our daysBack values to JSearch date_posted options
    switch (daysBack) {
      case 1:
        return "today"; // Executive tier - today only
      case 7:
        return "week"; // Pro tier - past week
      default:
        return "all"; // Fallback
    }
  }

  private getCountryFromLocation(location: string): string {
    // Simple country detection - could be enhanced
    const countryMap: Record<string, string> = {
      "united states": "us",
      usa: "us",
      us: "us",
      canada: "ca",
      "united kingdom": "gb",
      uk: "gb",
      germany: "de",
      france: "fr",
      australia: "au",
      india: "in",
      remote: "us", // Default remote to US
    };

    const lowerLocation = location.toLowerCase();

    // Check for direct country matches
    for (const [key, code] of Object.entries(countryMap)) {
      if (lowerLocation.includes(key)) {
        return code;
      }
    }

    // Default to US
    return "us";
  }

  private mapJobTypeToEmploymentType(jobType: string): string | null {
    // Map user preference job types to JSearch employment_types
    const typeMap: Record<string, string | null> = {
      "full-time": "FULLTIME",
      "part-time": "PARTTIME",
      "contract": "CONTRACTOR",
      "temporary": "CONTRACTOR", // Map temporary to contractor
      "internship": "INTERN",
      "volunteer": null, // JSearch doesn't support volunteer
    };

    const normalized = jobType.toLowerCase().replace(/\s+/g, "-");
    return typeMap[normalized] || null;
  }

  private mapExperienceLevelsToRequirements(experienceLevels: string[]): string[] {
    // Map user preference experience levels to JSearch job_requirements
    const requirements: Set<string> = new Set();

    for (const level of experienceLevels) {
      const normalized = level.toLowerCase();
      
      if (normalized.includes("internship") || normalized.includes("entry")) {
        requirements.add("under_3_years_experience");
        if (normalized.includes("internship")) {
          requirements.add("no_experience");
        }
      } else if (normalized.includes("associate")) {
        requirements.add("under_3_years_experience");
      } else if (
        normalized.includes("mid-senior") || 
        normalized.includes("director") || 
        normalized.includes("executive")
      ) {
        requirements.add("more_than_3_years_experience");
      }
    }

    // If user selected entry-level positions, also include no degree requirement
    if (experienceLevels.some(level => 
      level.toLowerCase().includes("entry") || 
      level.toLowerCase().includes("internship")
    )) {
      requirements.add("no_degree");
    }

    return Array.from(requirements);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function mapJSearchJobToUniversal(job: JSearchJob): {
  title: string;
  company: string;
  location?: string;
  description?: string;
  job_url: string;
  posted_at?: string;
  salary_json?: unknown;
  employment_type?: string;
  experience_level?: string;
  company_url?: string;
  company_logo?: string;
  apply_link?: string;
  industries?: string[];
  extra_data?: unknown;
} {
  // Extract salary information
  const salaryData =
    job.job_min_salary || job.job_max_salary
      ? {
          min: job.job_min_salary,
          max: job.job_max_salary,
          currency: job.job_salary_currency || "USD",
          period: job.job_salary_period || "yearly",
          raw: job.job_salary,
        }
      : undefined;

  // Extract experience level from requirements
  const experienceLevel = job.job_required_experience?.no_experience_required
    ? "entry"
    : job.job_required_experience?.required_experience_in_months
      ? `${job.job_required_experience.required_experience_in_months} months experience`
      : undefined;

  return {
    title: job.job_title,
    company: job.employer_name,
    location:
      job.job_location ||
      `${job.job_city || ""}, ${job.job_state || ""}`
        .trim()
        .replace(/^,\s*|,\s*$/g, ""),
    description: job.job_description,
    job_url: job.job_apply_link,
    posted_at: job.job_posted_at_datetime_utc || undefined,
    salary_json: salaryData,
    employment_type: job.job_employment_type,
    experience_level: experienceLevel,
    company_url: job.employer_website || undefined,
    company_logo: job.employer_logo || undefined,
    apply_link: job.job_apply_link,
    industries: job.employer_company_type ? [job.employer_company_type] : [],
    extra_data: {
      jsearch_id: job.job_id,
      job_publisher: job.job_publisher,
      job_is_remote: job.job_is_remote,
      apply_options: job.apply_options,
      job_benefits: job.job_benefits,
      job_highlights: job.job_highlights,
      job_google_link: job.job_google_link,
      coordinates: {
        latitude: job.job_latitude,
        longitude: job.job_longitude,
      },
      experience_requirements: job.job_required_experience,
      salary_details: {
        job_salary: job.job_salary,
        currency: job.job_salary_currency,
        period: job.job_salary_period,
      },
      posting_details: {
        posted_human_readable: job.job_posted_human_readable,
        posted_timestamp: job.job_posted_at_timestamp,
        expiration_datetime: job.job_offer_expiration_datetime_utc,
        expiration_timestamp: job.job_offer_expiration_timestamp,
      },
      raw_data: job,
    },
  };
}

async function checkJSearchUsageLimits(
  userId: string,
  requiredRequests: number = 1,
): Promise<{
  canProceed: boolean;
  requestsUsed: number;
  requestsLimit: number;
  resetDate: string;
}> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase.rpc("check_jsearch_usage_limits", {
      p_user_id: userId,
      p_required_requests: requiredRequests,
    });

    if (error) {
      logger.error("❌ Failed to check JSearch usage limits", {
        error: error.message,
        userId,
        requiredRequests,
      });
      return {
        canProceed: false,
        requestsUsed: 0,
        requestsLimit: 0,
        resetDate: new Date().toISOString(),
      };
    }

    const usage = data[0];
    return {
      canProceed: usage.can_proceed,
      requestsUsed: usage.requests_used,
      requestsLimit: usage.requests_limit,
      resetDate: usage.reset_date,
    };
  } catch (error) {
    logger.error("❌ Error checking JSearch usage limits", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      requiredRequests,
    });
    return {
      canProceed: false,
      requestsUsed: 0,
      requestsLimit: 0,
      resetDate: new Date().toISOString(),
    };
  }
}

async function getUserJobPreferences(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{
  auto_save_discovered_jobs?: boolean;
  target_roles?: string[];
} | null> {
  const { data: preferences, error } = await supabase
    .from("user_job_discovery_preferences")
    .select("auto_save_discovered_jobs, target_roles")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (error instanceof Error) {
    logger.warn(
      `No active job discovery preferences found for user ${userId}:`,
      { error: error.message },
    );
    return null;
  }

  return preferences;
}

async function createOpportunityApplication(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  jobData: {
    title: string;
    company: string;
    location?: string;
    url: string;
    description?: string;
    source: "jsearch";
    searchKeywords?: string;
  },
): Promise<string | null> {
  // Use the enhanced deduplication logic from universal-job-discovery
  const { createOpportunityApplication: enhancedCreateOpportunityApplication } =
    await import("./universal-job-discovery");

  return enhancedCreateOpportunityApplication(supabase, userId, jobData);
}

async function debitJSearchUsage(
  userId: string,
  requestsCount: number,
  pagesRequested: number,
): Promise<{ success: boolean; error?: string }> {
  if (requestsCount === 0) return { success: true };

  const supabase = createClient();

  try {
    // Calculate cost multiplier based on pages (JSearch pricing)
    let costMultiplier = 1;
    if (pagesRequested > 10) {
      costMultiplier = 3; // 3x cost for 10+ pages
    } else if (pagesRequested > 1) {
      costMultiplier = 2; // 2x cost for 2-10 pages
    }

    const { error } = await supabase.rpc("debit_jsearch_usage", {
      p_user_id: userId,
      p_requests: requestsCount,
      p_cost_multiplier: costMultiplier,
    });

    if (error) {
      logger.error("❌ Failed to debit JSearch usage", {
        error: error.message,
        userId,
        requestsCount,
        costMultiplier,
      });
      return { success: false, error: error.message };
    }

    logger.info("✅ JSearch usage debited successfully", {
      userId,
      requestsCount,
      costMultiplier,
      pagesRequested,
    });

    return { success: true };
  } catch (error) {
    logger.error("❌ Error debiting JSearch usage", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      requestsCount,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main JSearch Scraper Task
// ═══════════════════════════════════════════════════════════════════════════

export const jsearchScraper = task({
  id: "jsearch-scraper",
  queue: {
    name: "jsearch-scraper",
    concurrencyLimit: 2,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: JSearchScraperInput) => {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedPayload = JSearchScraperInputSchema.parse(payload);

      logger.info("🚀 Starting JSearch job scraping", {
        userId: validatedPayload.userId,
        roles: validatedPayload.roles,
        locations: validatedPayload.locations,
        daysBack: validatedPayload.daysBack,
        autoSave: validatedPayload.autoSave,
        maxPages: validatedPayload.maxPages,
        remotePreference: validatedPayload.remotePreference,
        jobTypes: validatedPayload.jobTypes,
        experienceLevels: validatedPayload.experienceLevels,
      });

      // Initialize API client
      const client = new JSearchApiClient();

      // Calculate expected number of requests
      const expectedRequests =
        validatedPayload.roles.length * validatedPayload.locations.length;

      // Check usage limits before proceeding
      const usageCheck = await checkJSearchUsageLimits(
        validatedPayload.userId,
        expectedRequests,
      );

      if (!usageCheck.canProceed) {
        logger.error("❌ JSearch usage limit exceeded", {
          userId: validatedPayload.userId,
          requestsNeeded: expectedRequests,
          requestsUsed: usageCheck.requestsUsed,
          requestsLimit: usageCheck.requestsLimit,
          resetDate: usageCheck.resetDate,
        });
        return {
          success: false,
          error: `JSearch quota exceeded. Used: ${usageCheck.requestsUsed}/${usageCheck.requestsLimit} requests. Resets: ${usageCheck.resetDate}`,
          jobsFound: 0,
          processed: 0,
          quotaInfo: {
            requestsUsed: usageCheck.requestsUsed,
            requestsLimit: usageCheck.requestsLimit,
            resetDate: usageCheck.resetDate,
          },
        };
      }

      // Execute search
      const allJobs = await client.searchJobs({
        roles: validatedPayload.roles,
        locations: validatedPayload.locations,
        daysBack: validatedPayload.daysBack,
        maxPages: validatedPayload.maxPages,
        remotePreference: validatedPayload.remotePreference,
        jobTypes: validatedPayload.jobTypes,
        experienceLevels: validatedPayload.experienceLevels,
      });

      // Deduplicate jobs by job_id
      const uniqueJobs = Array.from(
        new Map(allJobs.map((job) => [job.job_id, job])).values(),
      );

      logger.info("📊 JSearch search completed", {
        totalJobs: allJobs.length,
        uniqueJobs: uniqueJobs.length,
        requestsMade: expectedRequests,
      });

      // Get user preferences to check auto-save setting
      const supabase = createClient();
      const preferences = await getUserJobPreferences(
        supabase,
        validatedPayload.userId,
      );
      const shouldAutoSave = preferences?.auto_save_discovered_jobs || false;

      logger.info("🔧 Auto-save preferences", {
        userId: validatedPayload.userId,
        shouldAutoSave,
        hasPreferences: !!preferences,
      });

      // Process and save jobs
      let processedJobs = 0;
      let savedJobs = 0;
      let autoSavedApplications = 0;
      let filteredOutJobs = 0;

      for (const job of uniqueJobs) {
        try {
          const universalJob = mapJSearchJobToUniversal(job);

          // Apply premium filters if provided
          if (validatedPayload.excludedCompanies && validatedPayload.excludedCompanies.length > 0) {
            const companyLower = job.employer_name.toLowerCase();
            if (validatedPayload.excludedCompanies.some(excluded => 
              companyLower.includes(excluded.toLowerCase())
            )) {
              filteredOutJobs++;
              logger.info("🚫 Job filtered out - excluded company", {
                company: job.employer_name,
                title: job.job_title,
              });
              continue;
            }
          }

          if (validatedPayload.excludedKeywords && validatedPayload.excludedKeywords.length > 0) {
            const titleLower = job.job_title.toLowerCase();
            const descriptionLower = (job.job_description || "").toLowerCase();
            
            if (validatedPayload.excludedKeywords.some(keyword => 
              titleLower.includes(keyword.toLowerCase()) || 
              descriptionLower.includes(keyword.toLowerCase())
            )) {
              filteredOutJobs++;
              logger.info("🚫 Job filtered out - excluded keyword", {
                company: job.employer_name,
                title: job.job_title,
              });
              continue;
            }
          }

          // Determine status based on user preference, not payload
          const jobStatus = shouldAutoSave ? "auto_saved" : "discovered";

          // Save job with user association
          const { jobId, success } = await saveJobWithUserAssociation(
            {
              source_vendor: "jsearch",
              external_job_id: job.job_id,
              ...universalJob,
            },
            validatedPayload.userId,
            undefined, // No discovery run ID for now
            jobStatus,
          );

          if (success && jobId) {
            savedJobs++;
            logger.info("✅ Job saved successfully", {
              jobId,
              title: job.job_title,
              company: job.employer_name,
              jsearchId: job.job_id,
              status: jobStatus,
            });

            // 🎯 AUTO-SAVE FEATURE: Create application if user preference is enabled
            if (shouldAutoSave) {
              const applicationId = await createOpportunityApplication(
                supabase,
                validatedPayload.userId,
                {
                  title: job.job_title,
                  company: job.employer_name,
                  location: universalJob.location,
                  url: job.job_apply_link,
                  description: job.job_description,
                  source: "jsearch",
                  searchKeywords: validatedPayload.roles.join(", "),
                },
              );

              if (applicationId) {
                autoSavedApplications++;
                logger.info("✅ Auto-saved JSearch job as application", {
                  jobId,
                  applicationId,
                  title: job.job_title,
                  company: job.employer_name,
                });

                // 🎯 TIER-AWARE COMPANY ENRICHMENT: Only for Pro/Executive users
                try {
                  const { data: profile } = await supabase
                    .from("profiles")
                    .select("subscription_tier")
                    .eq("id", validatedPayload.userId)
                    .single();

                  const subscriptionTier = profile?.subscription_tier || "free";

                  if (subscriptionTier !== "free") {
                    const { autoEnrichNewApplication } = await import(
                      "./company-enrichment"
                    );

                    await autoEnrichNewApplication.trigger({
                      applicationId,
                      companyName: job.employer_name,
                    });

                    logger.info(
                      "Triggered company enrichment for JSearch auto-saved job",
                      {
                        applicationId,
                        companyName: job.employer_name,
                        subscriptionTier,
                      },
                    );
                  }
                } catch (enrichmentError) {
                  logger.error("Failed to trigger company enrichment", {
                    applicationId,
                    companyName: job.employer_name,
                    error: enrichmentError,
                  });
                  // Don't fail the job processing if enrichment fails
                }
              }
            }
          } else {
            logger.warn("⚠️ Failed to save job", {
              title: job.job_title,
              company: job.employer_name,
              jsearchId: job.job_id,
            });
          }

          processedJobs++;
        } catch (error) {
          logger.error("❌ Error processing job", {
            job: job.job_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Debit usage after successful processing
      const debitResult = await debitJSearchUsage(
        validatedPayload.userId,
        expectedRequests,
        validatedPayload.maxPages || 1,
      );

      const processingTime = Date.now() - startTime;

      logger.info("🎉 JSearch scraping completed", {
        userId: validatedPayload.userId,
        jobsFound: uniqueJobs.length,
        processed: processedJobs,
        saved: savedJobs,
        autoSaved: autoSavedApplications,
        filteredOut: filteredOutJobs,
        shouldAutoSave,
        processingTimeMs: processingTime,
        usageDebited: debitResult.success,
        hasExclusionFilters: !!(validatedPayload.excludedCompanies?.length || validatedPayload.excludedKeywords?.length),
      });

      return {
        success: true,
        jobsFound: uniqueJobs.length,
        processed: processedJobs,
        saved: savedJobs,
        autoSaved: autoSavedApplications,
        filteredOut: filteredOutJobs,
        shouldAutoSave,
        processingTimeMs: processingTime,
        usageDebited: debitResult.success,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error("❌ JSearch scraping failed", {
        error: error instanceof Error ? error.message : String(error),
        userId: payload.userId,
        processingTimeMs: processingTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        jobsFound: 0,
        processed: 0,
        saved: 0,
        processingTimeMs: processingTime,
      };
    }
  },
});
