/**
 * LinkedIn Job Scraper using ScrapingDog API
 *
 * CONCURRENCY STRATEGY:
 * - ScrapingDog allows 5 concurrent requests maximum
 * - Uses queue "scrapingdog-api" with concurrencyLimit: 5
 * - Additional 500ms delay before each API call for extra safety
 * - Universal job discovery uses separate queue with limit of 3
 * - Scheduled tasks use small batch sizes (3-5) with 5-6 second delays
 */

import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import createClient from "./create-client";
import {
  extractCountryCode,
  saveJobWithUserAssociation,
  type UniversalJobData,
} from "./shared-job-helpers";

// ═══════════════════════════════════════════════════════════════════════════
// ScrapingDog LinkedIn Jobs Scraper
// ═══════════════════════════════════════════════════════════════════════════

// ScrapingDog API Configuration
const SCRAPINGDOG_API_KEY = process.env.SCRAPINGDOG_API_KEY;
const SCRAPINGDOG_BASE_URL = "https://api.scrapingdog.com/linkedinjobs";

if (!SCRAPINGDOG_API_KEY) {
  throw new Error("SCRAPINGDOG_API_KEY environment variable is required");
}

// Supabase client
const supabase = createClient();

// ❶ Input Schema for ScrapingDog
const LinkedInScraperInputSchema = z.object({
  userId: z.string().uuid(),
  keywords: z.string().min(1, "Keywords are required"),
  location: z.string().optional(),
  geoId: z.string().optional(), // LinkedIn location ID
  pages: z.number().min(1).max(10).default(1), // ScrapingDog supports pagination
  datePosted: z
    .enum(["any", "past-24h", "past-week", "past-month"])
    .default("any"),
  jobType: z
    .enum([
      "any",
      "full-time",
      "part-time",
      "contract",
      "temporary",
      "internship",
      "volunteer",
    ])
    .default("any"),
  experienceLevel: z
    .enum([
      "any",
      "internship",
      "entry",
      "associate",
      "mid-senior",
      "director",
      "executive",
    ])
    .default("any"),
  remoteFilter: z.enum(["any", "remote", "on-site", "hybrid"]).default("any"),
  salary: z.string().optional(), // Salary range filter
  /**
   * Manual vs Automatic discovery flag
   * true  → allow auto-save when user preference permits (default)
   * false → NEVER auto-save, even if preference is enabled (manual searches)
   */
  autoSave: z.boolean().optional().default(true),
});

// ❂ ScrapingDog Response Schema
const ScrapingDogJobSchema = z.object({
  job_id: z.string(),
  job_position: z.string(),
  job_link: z.string().url(),
  company_name: z.string(),
  company_profile: z.string().url().optional(),
  job_location: z.string().optional(),
  job_posting_date: z.string().optional(), // "2 days ago", "1 week ago", etc.
  company_logo_url: z.string().url().optional(),
  job_description: z.string().optional(), // May not be included in basic response
});

type LinkedInScraperInput = z.infer<typeof LinkedInScraperInputSchema>;
type ScrapingDogJob = z.infer<typeof ScrapingDogJobSchema>;

// LinkedIn location geoId mapping based on ScrapingDog documentation
const LOCATION_TO_GEOID_MAP: Record<string, string> = {
  // North America
  canada: "101174742",
  "united states": "103644278",
  usa: "103644278",
  us: "103644278",

  // Major cities in Canada
  toronto: "100025096",
  vancouver: "100025090",
  montreal: "101620260",
  calgary: "100025091",
  ottawa: "101620259",

  // Major cities in US
  "new york": "100293800",
  "san francisco": "104565322",
  "los angeles": "100025096",
  chicago: "100025096",
  seattle: "100025096",

  // Default fallback
  "": "103644278", // Default to US if no location specified
};

function getGeoIdFromLocation(location?: string): string {
  if (!location) return LOCATION_TO_GEOID_MAP[""];

  const normalizedLocation = location.toLowerCase().trim();

  // Try exact match first
  if (LOCATION_TO_GEOID_MAP[normalizedLocation]) {
    return LOCATION_TO_GEOID_MAP[normalizedLocation];
  }

  // Try partial matches for common patterns
  if (
    normalizedLocation.includes("canada") ||
    normalizedLocation.includes("ca")
  ) {
    return LOCATION_TO_GEOID_MAP["canada"];
  }

  if (
    normalizedLocation.includes("united states") ||
    normalizedLocation.includes("usa") ||
    normalizedLocation.includes("us")
  ) {
    return LOCATION_TO_GEOID_MAP["usa"];
  }

  // Default to Canada for this user's case
  return LOCATION_TO_GEOID_MAP["canada"];
}

// ❸ Helper Functions
function parseRelativeDate(dateString: string): Date | null {
  if (!dateString) return null;

  const now = new Date();
  const lowerDate = dateString.toLowerCase();

  // Parse relative dates like "2 days ago", "1 week ago", etc.
  if (lowerDate.includes("hour")) {
    const hours = parseInt(lowerDate.match(/\d+/)?.[0] || "0");
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  } else if (lowerDate.includes("day")) {
    const days = parseInt(lowerDate.match(/\d+/)?.[0] || "0");
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  } else if (lowerDate.includes("week")) {
    const weeks = parseInt(lowerDate.match(/\d+/)?.[0] || "0");
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  } else if (lowerDate.includes("month")) {
    const months = parseInt(lowerDate.match(/\d+/)?.[0] || "0");
    return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
  }

  return null;
}

function buildScrapingDogUrl(
  params: LinkedInScraperInput,
  pageNumber: number = 1,
): string {
  const url = new URL(SCRAPINGDOG_BASE_URL);

  // Required parameters
  url.searchParams.set("api_key", SCRAPINGDOG_API_KEY!);
  url.searchParams.set("field", params.keywords);

  // Location handling - use proper geoId mapping
  if (params.location) {
    const geoId = params.geoId || getGeoIdFromLocation(params.location);
    url.searchParams.set("geoid", geoId);
    console.log(`🌍 Location mapping: "${params.location}" -> geoId: ${geoId}`);
  }

  // Set specific page number for pagination
  // ScrapingDog requires page parameter to always be set (even for page 1)
  url.searchParams.set("page", pageNumber.toString());

  // Posting date filter → ScrapingDog uses `sort_by` day/week/month
  if (params.datePosted !== "any") {
    const sortMap = {
      "past-24h": "day",
      "past-week": "week",
      "past-month": "month",
    } as const;
    url.searchParams.set("sort_by", sortMap[params.datePosted]);
  }

  // Job type mapping (must be lowercase & without hyphen per docs)
  if (params.jobType !== "any") {
    const jt = params.jobType.replace("-", ""); // full-time -> fulltime
    url.searchParams.set("job_type", jt);
  }

  // Experience level mapping (docs use entrylevel, midseniorlevel)
  if (params.experienceLevel !== "any") {
    const expLevelMap = {
      internship: "internship",
      entry: "entrylevel",
      associate: "associate",
      "mid-senior": "midseniorlevel",
      director: "director",
      executive: "executive",
    } as const;
    url.searchParams.set("exp_level", expLevelMap[params.experienceLevel]);
  }

  // Remote / work type mapping
  if (params.remoteFilter !== "any") {
    const workMap = {
      remote: "remote",
      "on-site": "atwork",
      hybrid: "hybrid",
    } as const;
    url.searchParams.set("work_type", workMap[params.remoteFilter]);
  }

  if (params.salary) {
    url.searchParams.set("salary", params.salary);
  }

  return url.toString();
}

async function scrapeLinkedInJobs(
  params: LinkedInScraperInput,
): Promise<{ jobs: ScrapingDogJob[]; pagesFetched: number }> {
  console.log(
    `🔍 Scraping LinkedIn jobs with ScrapingDog (${params.pages} pages)...`,
  );

  const allJobs: ScrapingDogJob[] = [];
  let pagesFetched = 0;

  // Loop through each page
  for (let page = 1; page <= params.pages; page++) {
    console.log(`📄 Fetching page ${page} of ${params.pages}...`);

    // Add small delay to respect API rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));

    const url = buildScrapingDogUrl(params, page);
    console.log(`📡 ScrapingDog API URL (page ${page}): ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "CareerCopilot-JobScraper/1.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ScrapingDog API error (${response.status}) on page ${page}: ${errorText}`,
      );
    }

    const data = await response.json();
    console.log(
      `📊 ScrapingDog page ${page} response:`,
      JSON.stringify(data, null, 2),
    );

    // Handle both array and object responses from ScrapingDog
    let pageJobs: ScrapingDogJob[] = [];

    if (Array.isArray(data)) {
      // Direct array response
      pageJobs = data.map((job) => ScrapingDogJobSchema.parse(job));
    } else if (data && typeof data === "object") {
      // Object response with jobs array
      if (data.jobs && Array.isArray(data.jobs)) {
        pageJobs = data.jobs.map((job: unknown) =>
          ScrapingDogJobSchema.parse(job),
        );
      } else {
        // Single job object
        pageJobs = [ScrapingDogJobSchema.parse(data)];
      }
    } else {
      throw new Error(
        `Unexpected ScrapingDog response format on page ${page}: ${typeof data}`,
      );
    }

    pagesFetched = page; // Track the actual page we successfully fetched
    console.log(`✅ Found ${pageJobs.length} jobs on page ${page}`);
    allJobs.push(...pageJobs);

    // If we get fewer jobs than expected, there might not be more pages
    if (pageJobs.length === 0) {
      console.log(`🔚 No jobs found on page ${page}, stopping pagination`);
      break;
    }
  }

  console.log(
    `✅ Total jobs found across ${pagesFetched} pages: ${allJobs.length}`,
  );
  return { jobs: allJobs, pagesFetched };
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

  if (error) {
    console.warn(
      `No active job discovery preferences found for user ${userId}:`,
      error,
    );
    return null;
  }

  return preferences;
}

async function saveJobsToDatabase(
  jobs: ScrapingDogJob[],
  scrapeRunId: string,
  userId: string,
  autoSaveOverride: boolean,
  searchKeywords?: string,
) {
  console.log(`💾 Saving ${jobs.length} jobs to database...`);

  // Get user preferences to check auto-save setting
  const preferences = await getUserJobPreferences(supabase, userId);
  const shouldAutoSave =
    autoSaveOverride && (preferences?.auto_save_discovered_jobs || false);

  console.log(`🔧 Auto-save enabled: ${shouldAutoSave} for user ${userId}`);

  let autoSavedCount = 0;

  for (const job of jobs) {
    try {
      // Convert to universal job data format
      const universalJobData: UniversalJobData = {
        source_vendor: "linkedin",
        external_job_id: job.job_id,
        title: job.job_position,
        company: job.company_name,
        location: job.job_location || undefined,
        description: job.job_description || undefined,
        job_url: job.job_link,
        posted_at: parseRelativeDate(job.job_posting_date || "")?.toISOString(),
        salary_json: undefined, // ScrapingDog doesn't provide salary data
        applicants: undefined,
        employment_type: undefined,
        experience_level: undefined,
        company_url: job.company_profile || undefined,
        company_logo: job.company_logo_url || undefined,
        country_code: extractCountryCode(job.job_location || ""),
        seniority_level: undefined,
        job_function: undefined,
        industries: undefined,
        apply_link: undefined,
        salary_min: undefined,
        salary_max: undefined,
        salary_currency: undefined,
        salary_period: undefined,
        extra_data: job, // Store the full ScrapingDog response
      };

      // Determine status based on auto-save preference
      const jobStatus = shouldAutoSave ? "auto_saved" : "discovered";

      // Save to universal jobs system
      const { jobId, success } = await saveJobWithUserAssociation(
        universalJobData,
        userId,
        scrapeRunId,
        jobStatus,
      );

      if (!success || !jobId) {
        console.error(`❌ Failed to save job ${job.job_id} to universal jobs`);
        continue;
      }

      // 🎯 AUTO-SAVE FEATURE: For premium users, automatically create application
      if (shouldAutoSave) {
        const applicationId = await createOpportunityApplication(
          supabase,
          userId,
          {
            title: job.job_position,
            company: job.company_name,
            location: job.job_location || undefined,
            url: job.job_link,
            description: job.job_description || undefined,
            source: "linkedin",
            searchKeywords:
              searchKeywords || preferences?.target_roles?.join(", "),
          },
        );

        if (applicationId) {
          autoSavedCount++;
          console.log(
            `✅ Auto-saved job ${job.job_id} to applications as ${applicationId}`,
          );

          console.log(
            `✅ Auto-saved LinkedIn job ${job.job_id} as application ${applicationId}`,
          );
        }
      }
    } catch (error) {
      console.error(`❌ Error processing job ${job.job_id}:`, error);
    }
  }

  console.log(`✅ Successfully saved jobs to database`);
  if (shouldAutoSave) {
    console.log(
      `🎉 Auto-saved ${autoSavedCount}/${jobs.length} jobs to applications`,
    );

    // TODO: Send daily digest email/push notification
    // This will be implemented using Supabase Edge Functions + Resend
    if (autoSavedCount > 0) {
      console.log(
        `📧 TODO: Send daily digest notification for ${autoSavedCount} new opportunities`,
      );
    }
  }

  return { totalSaved: jobs.length, autoSaved: autoSavedCount };
}

// Import the createOpportunityApplication function for auto-save feature
async function createOpportunityApplication(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  jobData: {
    title: string;
    company: string;
    location?: string;
    url: string;
    description?: string;
    source: "linkedin" | "serper";
    searchKeywords?: string;
  },
): Promise<string | null> {
  // Use the enhanced deduplication logic from universal-job-discovery
  const { createOpportunityApplication: enhancedCreateOpportunityApplication } =
    await import("./universal-job-discovery");

  return enhancedCreateOpportunityApplication(supabase, userId, jobData);
}

// ❹ Main LinkedIn Scraper Task
export const linkedinScraper = task({
  id: "linkedin-scraper",
  queue: {
    name: "scrapingdog-api",
    concurrencyLimit: 5, // ScrapingDog allows 5 concurrent requests
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: LinkedInScraperInput) => {
    console.log(`🚀 Starting LinkedIn scrape for user ${payload.userId}`);
    console.log(`📋 Search params:`, payload);

    // Validate input
    const validatedInput = LinkedInScraperInputSchema.parse(payload);

    // Check manual search limits before proceeding
    const { data: searchLimits, error: limitsError } = await supabase.rpc(
      "check_manual_search_limit",
      { p_user_id: validatedInput.userId },
    );

    if (limitsError) {
      throw new Error(`Failed to check search limits: ${limitsError.message}`);
    }

    const limits = searchLimits[0];
    if (!limits.can_search) {
      console.log(
        `🚫 Manual search limit exceeded for user ${validatedInput.userId}`,
      );
      throw new Error(
        `Daily search limit exceeded (${limits.searches_used}/${limits.daily_limit}). ${limits.message}`,
      );
    }

    // Create scrape run record
    const { data: scrapeRun, error: scrapeRunError } = await supabase
      .from("linkedin_scrape_runs")
      .insert({
        user_id: validatedInput.userId,
        keywords: validatedInput.keywords,
        location: validatedInput.location,
        geo_id: validatedInput.geoId,
        pages_requested: validatedInput.pages,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (scrapeRunError || !scrapeRun) {
      throw new Error(
        `Failed to create scrape run: ${scrapeRunError?.message}`,
      );
    }

    const scrapeRunId = scrapeRun.id;

    // -------------------------------------------------------------------
    // Also create a unified discovery run record for the universal system
    // -------------------------------------------------------------------
    const { data: discoveryRun, error: discoveryRunError } = await supabase
      .from("job_discovery_runs")
      .insert({
        user_id: validatedInput.userId,
        run_type: "manual", // Manual trigger via dashboard or pipeline
        discovery_source: "linkedin", // Source platform
        search_criteria: {
          keywords: validatedInput.keywords,
          location: validatedInput.location,
          pages: validatedInput.pages,
          datePosted: validatedInput.datePosted,
          jobType: validatedInput.jobType,
          experienceLevel: validatedInput.experienceLevel,
          remoteFilter: validatedInput.remoteFilter,
        },
        status: "running",
        jobs_discovered: 0,
        jobs_created_as_opportunities: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (discoveryRunError || !discoveryRun) {
      throw new Error(
        `Failed to create job discovery run: ${discoveryRunError?.message}`,
      );
    }

    const discoveryRunId = discoveryRun.id;

    try {
      // Scrape jobs from ScrapingDog
      const { jobs, pagesFetched } = await scrapeLinkedInJobs(validatedInput);

      if (jobs.length === 0) {
        console.log(`⚠️ No jobs found for search criteria`);

        // Update scrape run as completed with 0 jobs
        await supabase
          .from("linkedin_scrape_runs")
          .update({
            status: "completed",
            jobs_found: 0,
            pages_fetched: pagesFetched,
            completed_at: new Date().toISOString(),
          })
          .eq("id", scrapeRunId);

        // Update discovery run stats
        await supabase
          .from("job_discovery_runs")
          .update({
            status: "completed",
            jobs_discovered: 0,
            jobs_created_as_opportunities: 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", discoveryRunId);

        return {
          success: true,
          scrapeRunId,
          discoveryRunId,
          jobsFound: 0,
          message: "No jobs found for the given criteria",
        };
      }

      // Save jobs to database
      const result = await saveJobsToDatabase(
        jobs,
        discoveryRunId, // Pass discovery run id for FK linkage
        validatedInput.userId,
        validatedInput.autoSave,
        validatedInput.keywords,
      );

      // Update scrape run as completed
      await supabase
        .from("linkedin_scrape_runs")
        .update({
          status: "completed",
          jobs_found: jobs.length,
          pages_fetched: pagesFetched,
          completed_at: new Date().toISOString(),
        })
        .eq("id", scrapeRunId);

      // Update discovery run stats
      await supabase
        .from("job_discovery_runs")
        .update({
          status: "completed",
          jobs_discovered: jobs.length,
          jobs_created_as_opportunities: result.autoSaved || 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", discoveryRunId);

      // Debit (increment) manual search usage after successful completion
      await supabase.rpc("increment_manual_search_usage", {
        p_user_id: validatedInput.userId,
      });

      console.log(`✅ LinkedIn scrape completed successfully`);
      console.log(`📊 Results: ${jobs.length} jobs found and saved`);

      return {
        success: true,
        scrapeRunId,
        discoveryRunId,
        jobsFound: jobs.length,
        jobs: jobs.map((job) => ({
          id: job.job_id,
          title: job.job_position,
          company: job.company_name,
          location: job.job_location,
          url: job.job_link,
        })),
        ...result,
      };
    } catch (error) {
      console.error(`❌ LinkedIn scrape failed:`, error);

      // Update scrape run as failed
      await supabase
        .from("linkedin_scrape_runs")
        .update({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", scrapeRunId);

      // Update discovery run stats
      await supabase
        .from("job_discovery_runs")
        .update({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", discoveryRunId);

      throw error;
    }
  },
});

// ❺ Export types for use in other files
export {
  createOpportunityApplication,
  LinkedInScraperInputSchema,
  saveJobsToDatabase,
};
export type { LinkedInScraperInput };
