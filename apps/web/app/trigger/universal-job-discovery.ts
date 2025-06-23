import { logger, schedules, task } from "@trigger.dev/sdk/v3";
import { createHash } from "crypto";
import { z } from "zod";
import createClient from "./create-client";
import { jsearchScraper } from "./jsearch-scraper";
import { linkedinScraper } from "./linkedin-scraper";
import {
  normalizeCurrency,
  saveJobWithUserAssociation,
} from "./shared-job-helpers";
// Enhanced imports for AI-powered job analysis
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import puppeteer from "puppeteer";

// ═══════════════════════════════════════════════════════════════════════════
// AI-Powered Job Analysis Setup
// ═══════════════════════════════════════════════════════════════════════════

// Initialize AI
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const model = google("gemini-2.0-flash");

// Validate environment setup
if (!process.env.GOOGLE_API_KEY) {
  logger.warn(
    "⚠️ GOOGLE_API_KEY not set - AI analysis will fall back to basic extraction",
  );
}

if (!process.env.SERPER_API_KEY) {
  logger.warn("⚠️ SERPER_API_KEY not set - web search will be disabled");
}

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Job Data Schemas
// ═══════════════════════════════════════════════════════════════════════════

// Enhanced job data schema for AI analysis
const AIJobAnalysisSchema = z.object({
  // Core required fields - only title and company are mandatory
  title: z.string(),
  company: z.string().nullable().optional(),

  // All other fields are optional and nullable
  location: z.string().nullable().optional(),
  salary: z
    .object({
      min: z.number().nullable().optional(),
      max: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      period: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  employment_type: z.string().nullable().optional(),
  experience_level: z.string().nullable().optional(),
  remote_policy: z.string().nullable().optional(),
  skills: z
    .object({
      required: z.array(z.string()).default([]),
      preferred: z.array(z.string()).default([]),
    })
    .optional(),
  company_info: z
    .object({
      industry: z.string().nullable().optional(),
      size: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      benefits: z.array(z.string()).nullable().optional(),
      company_url: z.string().nullable().optional(),
      logo_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  job_details: z
    .object({
      description: z.string().nullable().optional(),
      responsibilities: z.array(z.string()).default([]),
      qualifications: z.array(z.string()).default([]),
      apply_url: z.string().nullable().optional(),
      posted_date: z.string().nullable().optional(),
    })
    .optional(),
  analysis_confidence: z.number().min(0).max(1).optional().default(0.5),
  extraction_source: z.string().optional().default("basic_text"), // "ai_screenshot" | "basic_text"
});

export type AIJobAnalysis = z.infer<typeof AIJobAnalysisSchema>;

// Screenshot capture interface
interface JobScreenshot {
  url: string;
  title: string;
  imageData: string; // base64
}

// ═══════════════════════════════════════════════════════════════════════════
// AI-Powered Job Screenshot Analysis
// ═══════════════════════════════════════════════════════════════════════════

async function captureJobScreenshot(
  url: string,
): Promise<JobScreenshot | null> {
  let browser;

  try {
    logger.info("📸 Capturing job posting screenshot", { url });

    // Launch Puppeteer
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      executablePath:
        process.env.NODE_ENV === "development"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : process.env.PUPPETEER_EXECUTABLE_PATH,
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

    // Wait for dynamic content
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

    logger.info("✅ Screenshot captured successfully", {
      url,
      title,
      imageSize: imageData.length,
    });

    return {
      url,
      title: title || "Job Posting",
      imageData,
    };
  } catch (error) {
    logger.warn("Failed to capture screenshot", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
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

async function analyzeJobWithAI(
  url: string,
  title: string,
  snippet: string,
  screenshot?: JobScreenshot,
): Promise<AIJobAnalysis> {
  try {
    logger.info("🤖 Analyzing job posting with AI", {
      url,
      title,
      hasScreenshot: !!screenshot,
    });

    // Prepare content parts
    const contentParts: Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    > = [
      {
        type: "text",
        text: `You are an expert job posting analyzer. Analyze this job posting and extract comprehensive structured data.

<job_posting_context>
URL: ${url}
TITLE: ${title}
SNIPPET: ${snippet}
</job_posting_context>

${
  screenshot
    ? `I'm providing a screenshot of the actual job posting page. Please analyze the visual content for:
- Complete job description and requirements
- Salary information and benefits
- Company details and branding
- Skills and qualifications (required vs preferred)
- Employment type and remote work policy
- Apply buttons and application process
- Any additional context from the visual layout

Use both the URL/title/snippet context and the visual screenshot to provide the most comprehensive analysis possible.`
    : `Analyze based on the URL, title, and snippet provided. Extract as much structured information as possible from the available text.`
}

Your goal is to extract structured job data that would be useful for job seekers and matching algorithms. Focus on:

1. **Job Details**: Title, description, responsibilities, requirements
2. **Company Information**: Name, industry, size, culture indicators  
3. **Compensation**: Salary ranges, benefits, equity, remote policy
4. **Skills Analysis**: Required vs preferred technical and soft skills
5. **Application Process**: How to apply, application URL
6. **Experience Level**: Entry, mid, senior, executive

Be thorough and precise. If information is not available, mark fields as null/empty rather than guessing.

**CRITICAL**: Provide your analysis in this exact JSON format:

\`\`\`json
{
  "title": "Software Engineer",
  "company": "Tech Corp Inc",
  "location": "San Francisco, CA",
  "salary": {
    "min": 120000,
    "max": 180000,
    "currency": "USD",
    "period": "yearly"
  },
  "employment_type": "Full-time",
  "experience_level": "Mid-level",
  "remote_policy": "Hybrid",
  "skills": {
    "required": ["JavaScript", "React", "Node.js", "SQL"],
    "preferred": ["TypeScript", "AWS", "Docker", "GraphQL"]
  },
  "company_info": {
    "industry": "Technology",
    "size": "500-1000 employees", 
    "description": "Leading fintech company building the future of payments",
    "benefits": ["Health insurance", "401k matching", "Unlimited PTO"],
    "company_url": "https://company.com",
    "logo_url": "https://company.com/logo.png"
  },
  "job_details": {
    "description": "We are looking for a talented Software Engineer to join our growing team...",
    "responsibilities": [
      "Develop and maintain web applications",
      "Collaborate with cross-functional teams",
      "Write clean, maintainable code"
    ],
    "qualifications": [
      "3+ years of JavaScript experience",
      "Bachelor's degree in Computer Science or related field",
      "Experience with modern web frameworks"
    ],
    "apply_url": "https://company.com/jobs/apply/123",
    "posted_date": "2024-01-15"
  },
  "analysis_confidence": 0.85,
  "extraction_source": "${screenshot ? "ai_screenshot" : "basic_text"}"
}
\`\`\`

Extract all available information accurately. Use null for missing fields rather than placeholder values.`,
      },
    ];

    // Add screenshot if available
    if (screenshot) {
      contentParts.push({
        type: "image",
        image: screenshot.imageData,
      });
    }

    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: contentParts,
        },
      ],
      temperature: 0.2, // Lower temperature for consistent structured output
    });

    logger.info("🤖 AI analysis response received", {
      responseLength: response.text.length,
      url,
    });

    if (!response.text || response.text.trim().length === 0) {
      throw new Error("Empty AI response received");
    }

    // Extract JSON from response
    let jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      // Fallback to find any JSON-like structure
      jsonMatch = response.text.match(/\{[\s\S]*\}/);
    }
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const jsonString = jsonMatch[1] || jsonMatch[0];
    const parsedData = JSON.parse(jsonString.trim());

    // Validate with schema
    const validatedData = AIJobAnalysisSchema.parse(parsedData);

    logger.info("✅ Job analysis completed successfully", {
      url,
      confidence: validatedData.analysis_confidence,
      source: validatedData.extraction_source,
      skillsFound:
        (validatedData.skills?.required?.length ?? 0) +
        (validatedData.skills?.preferred?.length ?? 0),
    });

    return validatedData;
  } catch (error) {
    logger.error("❌ AI job analysis failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return basic fallback data
    return {
      title: title || "Unknown Position",
      company: extractCompanyName(title, snippet, url),
      location: undefined,
      salary: undefined,
      employment_type: undefined,
      experience_level: undefined,
      remote_policy: undefined,
      skills: {
        required: [],
        preferred: [],
      },
      company_info: undefined,
      job_details: {
        description: snippet || "",
        responsibilities: [],
        qualifications: [],
        apply_url: url,
        posted_date: undefined,
      },
      analysis_confidence: 0.1,
      extraction_source: "basic_text",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared Helpers
// ═══════════════════════════════════════════════════════════════════════════

// Phase 2: Salary data structure
interface SalaryData {
  min?: number;
  max?: number;
  amount?: number;
  currency?: string;
}

// Normalize currency format - must be exactly 3 characters for DB constraint

// Map of common country names to ISO-2 codes
const COUNTRY_CODE_MAP: Record<string, string> = {
  canada: "CA",
  "united states": "US",
  usa: "US",
  france: "FR",
  germany: "DE",
  spain: "ES",
  italy: "IT",
  india: "IN",
  australia: "AU",
  "united kingdom": "GB",
  uk: "GB",
  netherlands: "NL",
  switzerland: "CH",
  sweden: "SE",
  ireland: "IE",
};

const getCountryCode = (country: string): string => {
  if (!country) return "";
  const lower = country.trim().toLowerCase();
  return COUNTRY_CODE_MAP[lower] || country.toUpperCase().slice(0, 2);
};

const makeLocationCountry = (
  locString: string,
): { location: string; country: string } => {
  if (!locString) return { location: "", country: "" };

  const parts = locString.split(",").map((p) => p.trim());

  if (parts.length === 1) {
    const countryCode = getCountryCode(parts[0]);
    return { location: parts[0], country: countryCode };
  }

  const city = parts.slice(0, -1).join(", ");
  const countryName = parts[parts.length - 1];
  return { location: city, country: getCountryCode(countryName) };
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: Proactive Job Discovery Implementation
// ═══════════════════════════════════════════════════════════════════════════

interface UserJobPreferences {
  user_id: string;
  subscription_tier: "free" | "pro" | "executive";
  target_roles: string[];
  target_companies: string[];
  target_locations: string[];
  excluded_companies: string[];
  excluded_keywords: string[];
  salary_min?: number;
  remote_preference: "remote_only" | "hybrid" | "on_site" | "any";
  job_types: string[];
  experience_levels: string[];
  is_active: boolean;
  last_discovery_at?: string;
  auto_save_discovered_jobs?: boolean;
}

interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperSearchResult[];
  searchParameters?: {
    q: string;
    type: string;
    engine: string;
  };
}

// Serper Search Tier Configuration (ATS vendors greenhouse.io and lever.co removed)
const SERPER_TIER_CONFIG = {
  free: {
    roles: 2,
    locations: 1,
    resultsPerQuery: 10,
    jobSites: ["site:workable.com"],
    enableDeepWebSearch: false,
  },
  pro: {
    roles: 3,
    locations: 2,
    resultsPerQuery: 20,
    jobSites: [
      "site:workable.com",
      "site:bamboohr.com",
      "site:ashbyhq.com",
      "site:smartrecruiters.com",
    ],
    enableDeepWebSearch: false,
  },
  executive: {
    roles: 4,
    locations: 3,
    resultsPerQuery: 20, // Keep at 20 to balance cost and results
    jobSites: [
      "site:workable.com",
      "site:bamboohr.com",
      "site:ashbyhq.com",
      "site:smartrecruiters.com",
      "site:jobvite.com",
      "site:icims.com",
    ],
    enableDeepWebSearch: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Bright Data Helpers (Vendor Selection for Premium Tiers)
// ═══════════════════════════════════════════════════════════════════════════

// Bright Data query interface

// Validation schema for job discovery
const JobDiscoveryPayloadSchema = z.object({
  userId: z.string(),
  forceRun: z.boolean().default(false),
  testMode: z.boolean().default(false),
});

// ═══════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════

async function getUserJobPreferences(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<UserJobPreferences | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  if (profileError) {
    logger.error("Failed to get user profile", { userId, error: profileError });
    return null;
  }

  const { data: preferences, error: prefsError } = await supabase
    .from("user_job_discovery_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (prefsError) {
    logger.warn("No active job discovery preferences found", {
      userId,
      error: prefsError,
    });
    return null;
  }

  return {
    user_id: userId,
    subscription_tier: profile.subscription_tier || "free",
    target_roles: preferences.target_roles || [],
    target_companies: preferences.target_companies || [],
    target_locations: preferences.target_locations || [],
    excluded_companies: preferences.excluded_companies || [],
    excluded_keywords: preferences.excluded_keywords || [],
    salary_min: preferences.salary_min,
    remote_preference: preferences.remote_preference || "any",
    job_types: preferences.job_types || [],
    experience_levels: preferences.experience_levels || [],
    is_active: preferences.is_active,
    last_discovery_at: preferences.last_discovery_at,
    auto_save_discovered_jobs: preferences.auto_save_discovered_jobs,
  };
}

async function getActiveUsers(
  supabase: ReturnType<typeof createClient>,
  tierFilter?: "free" | "pro" | "executive",
): Promise<string[]> {
  let query = supabase
    .from("user_job_discovery_preferences")
    .select("user_id, profiles!inner(subscription_tier)")
    .eq("is_active", true);

  if (tierFilter) {
    query = query.eq("profiles.subscription_tier", tierFilter);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to get active users", { error });
    return [];
  }

  return data?.map((item) => item.user_id) || [];
}

async function shouldRunDiscovery(
  preferences: UserJobPreferences,
  testMode = false,
): Promise<boolean> {
  if (testMode) return true;

  if (!preferences.last_discovery_at) return true; // First run

  const lastRun = new Date(preferences.last_discovery_at);
  const now = new Date();
  const hoursSinceLastRun =
    (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

  // Pro tier: daily (24 hours), Free tier: weekly (168 hours)
  const requiredHours =
    preferences.subscription_tier === "pro" ||
    preferences.subscription_tier === "executive"
      ? 24
      : 168;

  return hoursSinceLastRun >= requiredHours;
}

async function updateLastDiscoveryTime(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_job_discovery_preferences")
    .update({
      last_discovery_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    logger.error("Failed to update last discovery time", { userId, error });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Serper API Integration with AI-Powered Job Analysis
// ═══════════════════════════════════════════════════════════════════════════

async function searchJobsWithSerper(
  preferences: UserJobPreferences,
): Promise<SerperSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY environment variable is required");
  }

  const tier = preferences.subscription_tier || "free";
  const config = SERPER_TIER_CONFIG[tier];

  const rolesToSearch = preferences.target_roles.slice(0, config.roles);
  const locationsToSearch = preferences.target_locations.slice(
    0,
    config.locations,
  );

  const searchTasks: Promise<SerperResponse>[] = [];
  const uniqueQueries = new Set<string>();

  for (const role of rolesToSearch) {
    for (const location of locationsToSearch) {
      const { country: countryCode } = makeLocationCountry(location);

      const baseQueryParts = [
        `"${role}"`,
        location && location.toLowerCase() !== "remote" ? `"${location}"` : "",
        preferences.remote_preference === "remote_only" ||
        location.toLowerCase() === "remote"
          ? "remote"
          : "",
      ].filter(Boolean);

      // 1. Job Board Search
      const jobBoardQuery = [
        ...baseQueryParts,
        `(${config.jobSites.join(" OR ")})`,
      ].join(" ");

      if (!uniqueQueries.has(jobBoardQuery)) {
        uniqueQueries.add(jobBoardQuery);
        searchTasks.push(
          fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: jobBoardQuery,
              gl: countryCode || "us",
              hl: "en",
              num: config.resultsPerQuery,
            }),
          }).then((res) => {
            if (!res.ok) {
              logger.error("Serper API error", {
                status: res.status,
                q: jobBoardQuery,
              });
              return { organic: [] };
            }
            return res.json();
          }),
        );
      }

      // 2. Executive Deep Web Search
      if (config.enableDeepWebSearch) {
        const deepWebQuery = [
          ...baseQueryParts,
          "careers",
          "-site:linkedin.com",
          "-site:indeed.com",
          "-site:glassdoor.com",
          "-site:ziprecruiter.com",
          `-(${config.jobSites.map((s) => s.replace("site:", "")).join(" OR ")})`,
        ].join(" ");

        if (!uniqueQueries.has(deepWebQuery)) {
          uniqueQueries.add(deepWebQuery);
          searchTasks.push(
            fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                q: deepWebQuery,
                gl: countryCode || "us",
                hl: "en",
                num: 10, // Fewer results for broad queries
              }),
            }).then((res) => {
              if (!res.ok) {
                logger.error("Serper API error", {
                  status: res.status,
                  q: deepWebQuery,
                });
                return { organic: [] };
              }
              return res.json();
            }),
          );
        }
      }
    }
  }

  // Rate limiting built-in with Promise.allSettled and fetch concurrency.
  // Add a small delay between batches if needed, but let's see how this performs.
  const allResponses = await Promise.allSettled(searchTasks);
  const results: SerperSearchResult[] = [];

  allResponses.forEach((response) => {
    if (response.status === "fulfilled" && response.value?.organic) {
      results.push(...response.value.organic);
    } else if (response.status === "rejected") {
      logger.error("A Serper API call failed", { reason: response.reason });
    }
  });

  // Deduplicate by URL
  const uniqueResults = Array.from(
    new Map(results.map((item) => [item.link, item])).values(),
  );

  logger.info("Serper search completed", {
    tier,
    queriesMade: searchTasks.length,
    totalResults: results.length,
    uniqueResults: uniqueResults.length,
  });

  return uniqueResults;
}

// Enhanced job processing with AI analysis for premium tiers
async function processSerperResultWithAI(
  result: SerperSearchResult,
  preferences: UserJobPreferences,
): Promise<{
  title: string;
  company: string;
  location?: string;
  url: string;
  description?: string;
  source: "serper";
  searchKeywords?: string;
  // Enhanced fields from AI analysis
  salary_json?: SalaryData;
  employment_type?: string;
  experience_level?: string;
  apply_link?: string;
  company_url?: string;
  company_logo?: string;
  industries?: string[];
  skills_required?: string[];
  skills_preferred?: string[];
  analysis_confidence?: number;
}> {
  const basicJobData = {
    title: result.title,
    company: extractCompanyName(result.title, result.snippet, result.link),
    location: preferences.target_locations[0] || "Unknown",
    url: result.link,
    description: result.snippet,
    source: "serper" as const,
    searchKeywords: preferences.target_roles.join(", "),
  };

  // AI enhancement for Pro/Executive tiers only
  const enableAIAnalysis =
    process.env.GOOGLE_API_KEY &&
    (preferences.subscription_tier === "pro" ||
      preferences.subscription_tier === "executive");

  if (!enableAIAnalysis) {
    logger.info("Basic processing for free tier or missing API key", {
      tier: preferences.subscription_tier,
      hasApiKey: !!process.env.GOOGLE_API_KEY,
    });
    return basicJobData;
  }

  try {
    logger.info("🚀 Enhanced AI processing for premium tier", {
      tier: preferences.subscription_tier,
      url: result.link,
    });

    // Capture screenshot for premium analysis
    const screenshot = await captureJobScreenshot(result.link);

    // Analyze with AI
    const aiAnalysis = await analyzeJobWithAI(
      result.link,
      result.title,
      result.snippet,
      screenshot || undefined,
    );

    // Convert AI analysis to enhanced job data
    const enhancedJobData = {
      ...basicJobData,
      title: aiAnalysis.title || basicJobData.title,
      company: aiAnalysis.company || basicJobData.company,
      location: aiAnalysis.location || basicJobData.location,
      description:
        aiAnalysis.job_details?.description || basicJobData.description,
      // Enhanced fields
      salary_json: aiAnalysis.salary
        ? {
            min: aiAnalysis.salary.min ?? undefined,
            max: aiAnalysis.salary.max ?? undefined,
            currency: normalizeCurrency(aiAnalysis.salary.currency),
          }
        : undefined,
      employment_type: aiAnalysis.employment_type ?? undefined,
      experience_level: aiAnalysis.experience_level ?? undefined,
      apply_link: aiAnalysis.job_details?.apply_url ?? undefined,
      company_url: aiAnalysis.company_info?.company_url ?? undefined,
      company_logo: aiAnalysis.company_info?.logo_url ?? undefined,
      industries: aiAnalysis.company_info?.industry
        ? [aiAnalysis.company_info.industry]
        : undefined,
      skills_required: aiAnalysis.skills?.required ?? [],
      skills_preferred: aiAnalysis.skills?.preferred ?? [],
      analysis_confidence: aiAnalysis.analysis_confidence,
    };

    logger.info("✅ AI enhancement completed", {
      url: result.link,
      confidence: aiAnalysis.analysis_confidence,
      skillsFound:
        (aiAnalysis.skills?.required?.length ?? 0) +
        (aiAnalysis.skills?.preferred?.length ?? 0),
      hasSalary: !!aiAnalysis.salary,
      hasApplyLink: !!aiAnalysis.job_details?.apply_url,
    });

    return enhancedJobData;
  } catch (error) {
    logger.warn("AI enhancement failed, falling back to basic processing", {
      url: result.link,
      error: error instanceof Error ? error.message : String(error),
    });

    return basicJobData;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Job Processing and Application Creation
// ═══════════════════════════════════════════════════════════════════════════

async function createOpportunityApplication(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  jobData: {
    title: string;
    company: string;
    location?: string;
    url: string;
    description?: string;
    source: "linkedin" | "serper" | "jsearch";
    searchKeywords?: string;
  },
): Promise<string | null> {
  // Enhanced duplicate check with fuzzy matching
  const duplicateCheck = await checkForDuplicateJob(supabase, userId, {
    title: jobData.title,
    company: jobData.company,
    location: jobData.location,
    url: jobData.url,
  });

  if (duplicateCheck.isDuplicate) {
    logger.info("Duplicate job detected, skipping creation", {
      userId,
      jobData: {
        title: jobData.title,
        company: jobData.company,
        url: jobData.url,
      },
      existingId: duplicateCheck.existingId,
      reason: duplicateCheck.reason,
    });
    return duplicateCheck.existingId || null;
  }

  // Create new application with "Opportunity" status
  const { data: application, error } = await supabase
    .from("applications")
    .insert({
      user_id: userId,
      company_name: jobData.company,
      role: jobData.title,
      status: "Opportunity",
      application_date: new Date().toISOString().split("T")[0], // Today's date
      job_url: jobData.url,
      location: jobData.location,
      notes: `Auto-discovered via ${jobData.source}${jobData.searchKeywords ? ` (Keywords: ${jobData.searchKeywords})` : ""}`,
      manual_entry: false,
      needs_user_review: false, // Auto-saved; no manual review needed
      opportunity_source: jobData.source,
      opportunity_discovered_at: new Date().toISOString(),
      auto_discovered: true, // Mark as auto-discovered
      job_fingerprint: generateFingerprint(
        jobData.company,
        jobData.title,
        jobData.location,
      ),
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to create opportunity application", {
      userId,
      jobData,
      error,
    });
    return null;
  }

  // 🎯 TIER-AWARE COMPANY ENRICHMENT: Only for Pro/Executive users
  try {
    // Get user's subscription tier
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", userId)
      .single();

    const subscriptionTier = profile?.subscription_tier || "free";

    // Only enrich for paid tiers (matches PRICING.md)
    if (subscriptionTier !== "free") {
      const { autoEnrichNewApplication } = await import("./company-enrichment");

      await autoEnrichNewApplication.trigger({
        applicationId: application.id,
        companyName: jobData.company,
      });

      logger.info("Triggered company enrichment for auto-discovered job", {
        applicationId: application.id,
        companyName: jobData.company,
        subscriptionTier,
      });
    } else {
      logger.info("Skipping enrichment for free tier user", {
        userId,
        companyName: jobData.company,
      });
    }
  } catch (enrichmentError) {
    logger.error("Failed to trigger company enrichment", {
      applicationId: application.id,
      companyName: jobData.company,
      error: enrichmentError,
    });
    // Don't fail the application creation if enrichment fails
  }

  return application.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Deduplication Logic
// ═══════════════════════════════════════════════════════════════════════════

function normalizeCompanyName(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function normalizeJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(sr|senior|jr|junior)\b\.?/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function normalizeLocation(location: string): string {
  if (!location) return "";
  return location
    .toLowerCase()
    .replace(/\b(remote|hybrid|on-site)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // insertion
        matrix[j - 1][i] + 1, // deletion
        matrix[j - 1][i - 1] + substitutionCost, // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

function generateFingerprint(
  company: string,
  title: string,
  location: string = "",
): string {
  const input = `${normalizeCompanyName(company)}|${normalizeJobTitle(title)}|${normalizeLocation(location)}`;
  return createHash("md5").update(input).digest("hex");
}

async function checkForDuplicateJob(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  jobData: {
    title: string;
    company: string;
    location?: string;
    url: string;
  },
): Promise<{ isDuplicate: boolean; existingId?: string; reason?: string }> {
  try {
    // First check exact URL match (fastest)
    const { data: exactMatch } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", userId)
      .eq("job_url", jobData.url)
      .single();

    if (exactMatch) {
      return {
        isDuplicate: true,
        existingId: exactMatch.id,
        reason: "Exact URL match",
      };
    }

    // Check fingerprint match
    const fingerprint = generateFingerprint(
      jobData.company,
      jobData.title,
      jobData.location,
    );
    const { data: fpMatch } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", userId)
      .eq("job_fingerprint", fingerprint)
      .single();

    if (fpMatch) {
      return {
        isDuplicate: true,
        existingId: fpMatch.id,
        reason: "Fingerprint match",
      };
    }

    // Get recent applications for fuzzy matching (last 30 days)
    const { data: recentApps } = await supabase
      .from("applications")
      .select("id, company_name, role, location, job_url, created_at")
      .eq("user_id", userId)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .limit(100); // Limit for performance

    if (!recentApps || recentApps.length === 0) {
      return { isDuplicate: false };
    }

    // Normalize input data
    const normalizedInput = {
      company: normalizeCompanyName(jobData.company),
      title: normalizeJobTitle(jobData.title),
      location: normalizeLocation(jobData.location || ""),
    };

    // Check for fuzzy matches
    for (const app of recentApps) {
      const normalizedApp = {
        company: normalizeCompanyName(app.company_name),
        title: normalizeJobTitle(app.role),
        location: normalizeLocation(app.location || ""),
      };

      // Calculate similarity scores
      const companySimilarity = calculateSimilarity(
        normalizedInput.company,
        normalizedApp.company,
      );
      const titleSimilarity = calculateSimilarity(
        normalizedInput.title,
        normalizedApp.title,
      );
      const locationSimilarity =
        normalizedInput.location && normalizedApp.location
          ? calculateSimilarity(
              normalizedInput.location,
              normalizedApp.location,
            )
          : 1.0; // If either location is empty, don't penalize

      // Weighted similarity score
      const overallSimilarity =
        companySimilarity * 0.4 +
        titleSimilarity * 0.5 +
        locationSimilarity * 0.1;

      // Consider it a duplicate if similarity > 85%
      if (overallSimilarity > 0.85) {
        return {
          isDuplicate: true,
          existingId: app.id,
          reason: `Fuzzy match (${Math.round(overallSimilarity * 100)}% similar): ${app.company_name} - ${app.role}`,
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    logger.error("Error checking for duplicate job", {
      userId,
      jobData,
      error,
    });
    // On error, assume not duplicate to avoid blocking job creation
    return { isDuplicate: false };
  }
}

function extractCompanyName(
  title: string,
  snippet: string,
  link: string,
): string {
  const hostname = new URL(link).hostname.toLowerCase();

  // Extract from company career pages
  // e.g., careers.google.com, jobs.netflix.com
  if (hostname.includes("workable.com")) {
    const parts = hostname.split(".");
    if (parts.length >= 3) {
      return parts[0].replace(/^(www|jobs|careers)/, "").trim();
    }
  }

  // 1. Try to extract from the URL hostname (best signal)
  try {
    const url = new URL(link);
    const hostname = url.hostname;
    // e.g. faang.com -> faang
    const domainParts = hostname
      .replace(/^(www\.|careers\.|jobs\.)/, "")
      .split(".");
    if (domainParts.length > 1) {
      return domainParts[0];
    }
  } catch {
    // a malformed link shouldn't crash the process
  }

  // 2. Try common title patterns
  const patterns = [
    /at\s+([A-Za-z0-9\s.&-]{2,})/i, // Software Engineer at Google
    /-\s+([A-Za-z0-9\s.&-]{2,})$/i, // Software Engineer - Google
    /^([A-Za-z0-9\s.&-]{2,})\s+is hiring/i, // Google is hiring
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  // 3. Last resort, check snippet
  const snippetMatch = snippet.match(/hiring\s+at\s+([A-Za-z0-9\s.&-]{2,})/i);
  if (snippetMatch?.[1]) return snippetMatch[1].trim();

  return "Unknown Company";
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: Maximum Bright Data Intelligence Implementation
// ═══════════════════════════════════════════════════════════════════════════

interface OpportunityScore {
  overall_score: number; // 0-100
  salary_score: number; // 0-100
  competition_score: number; // 0-100
  timing_score: number; // 0-100
  seniority_match_score: number; // 0-100
  golden_opportunity: boolean;
  reasoning: string[];
}

interface EnhancedJobData {
  // Original job data
  title: string;
  company: string;
  location?: string;
  url: string;
  description?: string;
  source: "linkedin" | "serper";
  searchKeywords?: string;

  // Enhanced fields from various sources
  salary_json?: SalaryData;
  applicants?: number;
  employment_type?: string;
  experience_level?: string;
  posted_at?: string;
  job_summary?: string;

  // Calculated intelligence
  opportunity_score: OpportunityScore;
  market_intelligence: {
    salary_percentile?: number; // 0-100, where job salary ranks vs market
    competition_level: "low" | "medium" | "high";
    urgency_level: "low" | "medium" | "high";
    seniority_alignment: "under" | "match" | "over";
  };
}

/**
 * Calculate opportunity score for a job using available intelligence data
 * Golden Opportunity = High salary + Low competition + Recent posting + Good seniority match
 */
function calculateOpportunityScore(
  jobData: {
    salary_json?: SalaryData;
    applicants?: number;
    posted_at?: string;
    experience_level?: string;
    employment_type?: string;
    source?: string;
  },
  userPreferences: UserJobPreferences,
): OpportunityScore {
  const reasoning: string[] = [];
  let overall_score = 0;

  // 1. Salary Score (0-30 points)
  let salary_score = 0;
  if (jobData.salary_json) {
    const salaryData = jobData.salary_json;
    let avgSalary = 0;

    // Parse different salary formats from Bright Data
    if (typeof salaryData === "object" && salaryData !== null) {
      if (salaryData.min && salaryData.max) {
        avgSalary = (salaryData.min + salaryData.max) / 2;
      } else if (salaryData.amount) {
        avgSalary = salaryData.amount;
      }
    } else if (typeof salaryData === "number") {
      avgSalary = salaryData;
    }

    if (avgSalary > 0) {
      const userMinSalary = userPreferences.salary_min || 50000;
      if (avgSalary >= userMinSalary * 1.2) {
        salary_score = 30; // Significantly above user minimum
        reasoning.push(
          `💰 Salary 20%+ above your minimum (${avgSalary.toLocaleString()})`,
        );
      } else if (avgSalary >= userMinSalary) {
        salary_score = 20; // Above user minimum
        reasoning.push(
          `💵 Salary meets your minimum (${avgSalary.toLocaleString()})`,
        );
      } else {
        salary_score = 10; // Below minimum but has salary data
        reasoning.push(
          `📊 Salary information available (${avgSalary.toLocaleString()})`,
        );
      }
    }
  }

  // 2. Competition Score (0-25 points)
  let competition_score = 0;
  if (jobData.applicants !== undefined && jobData.applicants !== null) {
    if (jobData.applicants <= 10) {
      competition_score = 25;
      reasoning.push(
        `🔥 Very low competition (${jobData.applicants} applicants)`,
      );
    } else if (jobData.applicants <= 50) {
      competition_score = 20;
      reasoning.push(`✨ Low competition (${jobData.applicants} applicants)`);
    } else if (jobData.applicants <= 100) {
      competition_score = 15;
      reasoning.push(
        `📈 Moderate competition (${jobData.applicants} applicants)`,
      );
    } else {
      competition_score = 5;
      reasoning.push(`📊 High competition (${jobData.applicants} applicants)`);
    }
  } else {
    competition_score = 10; // Default for unknown competition
  }

  // 3. Timing Score (0-20 points)
  let timing_score = 0;
  if (jobData.posted_at) {
    const postedDate = new Date(jobData.posted_at);
    const now = new Date();
    const hoursAgo = (now.getTime() - postedDate.getTime()) / (1000 * 60 * 60);

    if (hoursAgo <= 6) {
      timing_score = 20;
      reasoning.push(`⚡ Just posted (${Math.round(hoursAgo)} hours ago)`);
    } else if (hoursAgo <= 24) {
      timing_score = 15;
      reasoning.push(`🕐 Recently posted (${Math.round(hoursAgo)} hours ago)`);
    } else if (hoursAgo <= 72) {
      timing_score = 10;
      reasoning.push(
        `📅 Posted recently (${Math.round(hoursAgo / 24)} days ago)`,
      );
    } else {
      timing_score = 5;
      reasoning.push(`📊 Posted ${Math.round(hoursAgo / 24)} days ago`);
    }
  } else {
    timing_score = 10; // Default for unknown timing
  }

  // 4. Seniority Match Score (0-25 points)
  let seniority_match_score = 0;
  if (
    jobData.experience_level &&
    userPreferences.experience_levels.length > 0
  ) {
    const jobLevel = jobData.experience_level.toLowerCase();
    const userLevels = userPreferences.experience_levels.map((l) =>
      l.toLowerCase(),
    );

    // Check for direct match
    const directMatch = userLevels.some(
      (level) => level.includes(jobLevel) || jobLevel.includes(level),
    );

    if (directMatch) {
      seniority_match_score = 25;
      reasoning.push(
        `🎯 Perfect seniority match (${jobData.experience_level})`,
      );
    } else {
      // Check for adjacent levels (basic career progression logic)
      const levelHierarchy = [
        "internship",
        "entry",
        "associate",
        "mid-senior",
        "director",
        "executive",
      ];
      const userMaxLevel = Math.max(
        ...userLevels
          .map((l) => levelHierarchy.indexOf(l))
          .filter((i) => i >= 0),
      );
      const jobLevelIndex = levelHierarchy.findIndex((l) =>
        jobLevel.includes(l),
      );

      if (jobLevelIndex >= 0 && Math.abs(userMaxLevel - jobLevelIndex) <= 1) {
        seniority_match_score = 15;
        reasoning.push(
          `📈 Good seniority alignment (${jobData.experience_level})`,
        );
      } else {
        seniority_match_score = 5;
        reasoning.push(`📊 Seniority level: ${jobData.experience_level}`);
      }
    }
  } else {
    seniority_match_score = 15; // Default for unknown seniority
  }

  overall_score =
    salary_score + competition_score + timing_score + seniority_match_score;

  // Golden Opportunity Criteria
  const golden_opportunity =
    salary_score >= 20 &&
    competition_score >= 20 &&
    timing_score >= 15 &&
    seniority_match_score >= 15;

  if (golden_opportunity) {
    reasoning.unshift("🏆 GOLDEN OPPORTUNITY DETECTED!");
  }

  return {
    overall_score,
    salary_score,
    competition_score,
    timing_score,
    seniority_match_score,
    golden_opportunity,
    reasoning,
  };
}

/**
 * Generate market intelligence for a job
 */
function generateMarketIntelligence(
  jobData: {
    salary_json?: SalaryData;
    applicants?: number;
    posted_at?: string;
    experience_level?: string;
    source?: string;
  },
  userPreferences: UserJobPreferences,
): EnhancedJobData["market_intelligence"] {
  // Competition Level
  let competition_level: "low" | "medium" | "high" = "medium";
  if (jobData.applicants !== undefined && jobData.applicants !== null) {
    if (jobData.applicants <= 25) {
      competition_level = "low";
    } else if (jobData.applicants <= 100) {
      competition_level = "medium";
    } else {
      competition_level = "high";
    }
  }

  // Urgency Level (based on posting time)
  let urgency_level: "low" | "medium" | "high" = "medium";
  if (jobData.posted_at) {
    const hoursAgo =
      (new Date().getTime() - new Date(jobData.posted_at).getTime()) /
      (1000 * 60 * 60);
    if (hoursAgo <= 12) {
      urgency_level = "high";
    } else if (hoursAgo <= 48) {
      urgency_level = "medium";
    } else {
      urgency_level = "low";
    }
  }

  // Seniority Alignment
  let seniority_alignment: "under" | "match" | "over" = "match";
  if (
    jobData.experience_level &&
    userPreferences.experience_levels.length > 0
  ) {
    const jobLevel = jobData.experience_level.toLowerCase();
    const userLevels = userPreferences.experience_levels.map((l) =>
      l.toLowerCase(),
    );

    const levelHierarchy = [
      "internship",
      "entry",
      "associate",
      "mid-senior",
      "director",
      "executive",
    ];
    const userMaxLevel = Math.max(
      ...userLevels.map((l) => levelHierarchy.indexOf(l)).filter((i) => i >= 0),
    );
    const jobLevelIndex = levelHierarchy.findIndex((l) => jobLevel.includes(l));

    if (jobLevelIndex >= 0 && userMaxLevel >= 0) {
      if (jobLevelIndex < userMaxLevel - 1) {
        seniority_alignment = "under";
      } else if (jobLevelIndex > userMaxLevel + 1) {
        seniority_alignment = "over";
      } else {
        seniority_alignment = "match";
      }
    }
  }

  // Salary Percentile (simplified - would need market data for real implementation)
  let salary_percentile: number | undefined;
  if (jobData.salary_json) {
    const salaryData = jobData.salary_json;
    let avgSalary = 0;

    if (typeof salaryData === "object" && salaryData !== null) {
      if (salaryData.min && salaryData.max) {
        avgSalary = (salaryData.min + salaryData.max) / 2;
      } else if (salaryData.amount) {
        avgSalary = salaryData.amount;
      }
    } else if (typeof salaryData === "number") {
      avgSalary = salaryData;
    }

    if (avgSalary > 0) {
      const userMinSalary = userPreferences.salary_min || 50000;
      if (avgSalary >= userMinSalary * 1.5) {
        salary_percentile = 90;
      } else if (avgSalary >= userMinSalary * 1.2) {
        salary_percentile = 75;
      } else if (avgSalary >= userMinSalary) {
        salary_percentile = 60;
      } else {
        salary_percentile = 30;
      }
    }
  }

  return {
    salary_percentile,
    competition_level,
    urgency_level,
    seniority_alignment,
  };
}

/**
 * Enhanced job creation with available intelligence data
 */
async function createEnhancedOpportunityApplication(
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
    // Enhanced fields
    salary_json?: SalaryData;
    applicants?: number;
    employment_type?: string;
    experience_level?: string;
    posted_at?: string;
    job_summary?: string;
  },
  userPreferences: UserJobPreferences,
): Promise<string | null> {
  // Calculate opportunity score and market intelligence
  const opportunity_score = calculateOpportunityScore(jobData, userPreferences);
  const market_intelligence = generateMarketIntelligence(
    jobData,
    userPreferences,
  );

  // Check for duplicates
  const duplicateCheck = await checkForDuplicateJob(supabase, userId, jobData);
  if (duplicateCheck.isDuplicate) {
    logger.info(`Skipping duplicate job: ${duplicateCheck.reason}`, {
      existing_id: duplicateCheck.existingId,
      title: jobData.title,
      company: jobData.company,
    });
    return duplicateCheck.existingId || null;
  }

  // Generate fingerprint for deduplication
  const fingerprint = generateFingerprint(
    jobData.company,
    jobData.title,
    jobData.location || "",
  );

  // Create enhanced application with intelligence
  const { data: application, error } = await supabase
    .from("applications")
    .insert({
      user_id: userId,
      company_name: jobData.company,
      role: jobData.title,
      status: "Opportunity",
      application_date: new Date().toISOString().split("T")[0],
      job_url: jobData.url,
      location: jobData.location,
      notes: jobData.description || jobData.job_summary,
      source_type: "job_discovery",
      discovery_source: jobData.source,
      opportunity_source: jobData.source,
      search_keywords: jobData.searchKeywords,
      auto_discovered: true,
      needs_user_review: !userPreferences.auto_save_discovered_jobs,
      job_fingerprint: fingerprint,

      // Enhanced Bright Data fields
      salary_json: jobData.salary_json,
      employment_type: jobData.employment_type,
      experience_level: jobData.experience_level,
      posted_at: jobData.posted_at,
      applicants: jobData.applicants,

      // Intelligence scores
      opportunity_score: opportunity_score.overall_score,
      opportunity_reasoning: opportunity_score.reasoning,
      market_intelligence: {
        salary_percentile: market_intelligence.salary_percentile,
        competition_level: market_intelligence.competition_level,
        urgency_level: market_intelligence.urgency_level,
        seniority_alignment: market_intelligence.seniority_alignment,
        golden_opportunity: opportunity_score.golden_opportunity,
      },
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to create enhanced opportunity application", {
      error: error.message,
      userId,
      jobData,
    });
    return null;
  }

  // Send proactive intelligence alerts for Pro/Executive users
  if (
    (userPreferences.subscription_tier === "pro" ||
      userPreferences.subscription_tier === "executive") &&
    opportunity_score.golden_opportunity
  ) {
    await sendProactiveIntelligenceAlert(userId, {
      applicationId: application.id,
      jobTitle: jobData.title,
      company: jobData.company,
      opportunity_score,
      market_intelligence,
    });

    // Generate personalized insights for golden opportunities
    try {
      const { generatePersonalizedInsights } = await import(
        "./personalized-opportunity-insights"
      );

      await generatePersonalizedInsights.trigger({
        applicationId: application.id,
        userId,
        jobData: {
          title: jobData.title,
          company: jobData.company,
          description: jobData.description,
          salary_json: jobData.salary_json,
          applicants: jobData.applicants,
          employment_type: jobData.employment_type,
          experience_level: jobData.experience_level,
          job_url: jobData.url,
          posted_at: jobData.posted_at,
        },
      });

      logger.info("🧠 Triggered personalized insights generation", {
        applicationId: application.id,
        userId,
        jobTitle: jobData.title,
        company: jobData.company,
      });
    } catch (insightsError) {
      logger.error("Failed to trigger personalized insights", {
        applicationId: application.id,
        error:
          insightsError instanceof Error
            ? insightsError.message
            : String(insightsError),
      });
      // Don't fail the entire application creation if insights fail
    }
  }

  logger.info("Created enhanced opportunity application", {
    applicationId: application.id,
    userId,
    title: jobData.title,
    company: jobData.company,
    opportunity_score: opportunity_score.overall_score,
    golden_opportunity: opportunity_score.golden_opportunity,
    auto_saved: userPreferences.auto_save_discovered_jobs,
    needs_user_review: !userPreferences.auto_save_discovered_jobs,
  });

  return application.id;
}

/**
 * Send proactive intelligence alerts for high-value opportunities
 */
async function sendProactiveIntelligenceAlert(
  userId: string,
  alertData: {
    applicationId: string;
    jobTitle: string;
    company: string;
    opportunity_score: OpportunityScore;
    market_intelligence: EnhancedJobData["market_intelligence"];
  },
): Promise<void> {
  try {
    // This would integrate with your notification system
    // For now, we'll log the high-value opportunity
    logger.info("🚨 PROACTIVE INTELLIGENCE ALERT", {
      userId,
      type: "golden_opportunity",
      title: `${alertData.jobTitle} at ${alertData.company}`,
      score: alertData.opportunity_score.overall_score,
      reasoning: alertData.opportunity_score.reasoning,
      market_intelligence: alertData.market_intelligence,
    });

    // TODO: Implement actual notification system
    // - Email alerts
    // - Push notifications
    // - In-app notifications
    // - Slack/Discord webhooks
  } catch (error) {
    logger.error("Failed to send proactive intelligence alert", {
      error,
      userId,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Discovery Task
// ═══════════════════════════════════════════════════════════════════════════

export const runJobDiscovery = task({
  id: "run-job-discovery",
  queue: {
    name: "job-discovery",
    concurrencyLimit: 3, // Conservative limit to avoid overwhelming ScrapingDog API
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: z.infer<typeof JobDiscoveryPayloadSchema>) => {
    const { userId, forceRun, testMode } =
      JobDiscoveryPayloadSchema.parse(payload);
    const supabase = createClient();

    logger.info("Starting job discovery", { userId, forceRun, testMode });

    try {
      // Get user preferences
      const preferences = await getUserJobPreferences(supabase, userId);
      if (!preferences) {
        logger.warn("No job discovery preferences found", { userId });
        return { success: false, reason: "No preferences configured" };
      }

      // Check if discovery should run
      if (!forceRun && !(await shouldRunDiscovery(preferences, testMode))) {
        logger.info("Skipping discovery - too soon since last run", { userId });
        return { success: true, reason: "Too soon since last run" };
      }

      let totalOpportunities = 0;
      let linkedinJobs = 0;
      let jsearchJobs = 0;
      let webJobs = 0;
      let autoSavedJobs = 0;

      // 1. Job Discovery for Pro/Executive Tiers - JSearch Primary

      const ENABLE_JSEARCH = !!process.env.RAPIDAPI_JSEARCH_KEY;

      // For Pro users we only want to run job discovery once per week (first run on Monday)
      const todayIsDiscoveryRunDay = (() => {
        // Monday is 1 (ISO, getDay returns 0-6 Sunday-Saturday). We use Monday by default.
        const now = new Date();
        const isoDay = ((now.getDay() + 6) % 7) + 1; // convert JS getDay(0=Sun) to ISO (1=Mon)
        return isoDay === 1; // Monday
      })();

      const shouldRunJobDiscovery = (() => {
        // Manual discovery (forceRun) should always enable JSearch for paid tiers
        if (
          forceRun &&
          (preferences.subscription_tier === "pro" ||
            preferences.subscription_tier === "executive")
        ) {
          return true;
        }

        if (preferences.subscription_tier === "executive") {
          return true; // always daily for Exec
        }

        if (preferences.subscription_tier === "pro") {
          return todayIsDiscoveryRunDay; // weekly (Mondays)
        }

        return false;
      })();

      if (shouldRunJobDiscovery && preferences.target_roles.length > 0) {
        // JSearch Discovery
        let jobDiscoverySucceeded = false;

        // 1A. JSearch Discovery
        if (ENABLE_JSEARCH && !jobDiscoverySucceeded) {
          try {
            // Get tier-specific limits for JSearch
            const getMaxPages = (tier: string) => {
              switch (tier) {
                case "executive":
                  return 5; // Executive: 5 pages (50 results per search)
                case "pro":
                  return 3; // Pro: 3 pages (30 results per search)
                default:
                  return 1; // Free: 1 page (10 results per search)
              }
            };

            const jsearchPayload = {
              userId,
              roles: preferences.target_roles.slice(0, 3), // Limit to 3 roles
              locations: preferences.target_locations.slice(0, 2), // Limit to 2 locations
              daysBack: (preferences.subscription_tier === "executive"
                ? 1
                : 7) as 1 | 7,
              autoSave: preferences.auto_save_discovered_jobs || false,
              maxPages: getMaxPages(preferences.subscription_tier),
              // Pass user preferences for better filtering
              remotePreference: preferences.remote_preference,
              jobTypes: preferences.job_types,
              experienceLevels: preferences.experience_levels,
              // Pass premium filters (only for Pro/Executive users)
              excludedCompanies: (preferences.subscription_tier !== "free") ? preferences.excluded_companies : undefined,
              excludedKeywords: (preferences.subscription_tier !== "free") ? preferences.excluded_keywords : undefined,
            };

            logger.info("🔍 Triggering JSearch discovery", {
              userId,
              roles: jsearchPayload.roles,
              locations: jsearchPayload.locations,
              daysBack: jsearchPayload.daysBack,
              maxPages: jsearchPayload.maxPages,
              tier: preferences.subscription_tier,
            });

            const jsearchResult =
              await jsearchScraper.triggerAndWait(jsearchPayload);

            if (jsearchResult.ok && jsearchResult.output) {
              const output = jsearchResult.output;

              if (output.success) {
                jsearchJobs = output.jobsFound || 0;
                const saved = output.saved || 0;

                if (preferences.auto_save_discovered_jobs) {
                  autoSavedJobs += saved;
                  totalOpportunities += saved;
                } else {
                  totalOpportunities += jsearchJobs;
                }

                jobDiscoverySucceeded = true;

                logger.info("✅ JSearch discovery completed", {
                  userId,
                  jobsFound: jsearchJobs,
                  saved: saved,
                  autoSaveEnabled: preferences.auto_save_discovered_jobs,
                  processingTimeMs: output.processingTimeMs,
                });
              } else {
                logger.warn("⚠️ JSearch discovery failed", {
                  userId,
                  error: output.error,
                });
              }
            } else {
              logger.error("❌ JSearch task execution failed", {
                userId,
                taskId: jsearchResult.id,
              });
            }
          } catch (error) {
            logger.error("❌ JSearch discovery error", {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Log if JSearch failed
        if (!jobDiscoverySucceeded) {
          if (!ENABLE_JSEARCH) {
            logger.info(
              "📝 Job discovery skipped - JSearch API key not configured",
            );
          } else {
            logger.warn(
              "📝 Job discovery failed - JSearch not available or failed",
              {
                jsearchEnabled: ENABLE_JSEARCH,
              },
            );
          }
        }
      } else {
        logger.info(
          "📝 Job discovery skipped - not scheduled for today or no roles configured",
          {
            tier: preferences.subscription_tier,
            todayIsDiscoveryRunDay,
            hasRoles: preferences.target_roles.length > 0,
          },
        );
      }

      // 2. LinkedIn Discovery (using ScrapingDog) - Available for all tiers

      if (preferences.target_roles.length > 0) {
        try {
          // Define page limits based on subscription tier
          const getPageLimit = (tier: string) => {
            switch (tier) {
              case "executive":
                return 10;
              case "pro":
                return 5;
              default:
                return 1;
            }
          };

          const linkedinPayload = {
            userId,
            keywords: preferences.target_roles.join(", "),
            location: preferences.target_locations[0] || undefined,
            geoId: undefined, // Let LinkedIn scraper handle geoId mapping from location
            pages: getPageLimit(preferences.subscription_tier),
            datePosted:
              preferences.subscription_tier === "pro" ||
              preferences.subscription_tier === "executive"
                ? ("past-24h" as const)
                : ("past-week" as const),
            remoteFilter:
              preferences.remote_preference === "remote_only"
                ? ("remote" as const)
                : preferences.remote_preference === "hybrid"
                  ? ("hybrid" as const)
                  : preferences.remote_preference === "on_site"
                    ? ("on-site" as const)
                    : ("any" as const),
            jobType: (preferences.job_types.length > 0
              ? (preferences.job_types[0] as string)
                  .toLowerCase()
                  .replace(" ", "-")
              : "any") as
              | "full-time"
              | "part-time"
              | "contract"
              | "temporary"
              | "internship"
              | "any",
            experienceLevel: (preferences.experience_levels.length > 0
              ? (preferences.experience_levels[0] as string).toLowerCase()
              : "any") as
              | "internship"
              | "entry"
              | "associate"
              | "mid-senior"
              | "director"
              | "executive"
              | "any",
            autoSave: true, // Allow auto-save according to user preference
          };

          const linkedinResult =
            await linkedinScraper.triggerAndWait(linkedinPayload);

          if (linkedinResult.ok && linkedinResult.output) {
            const output = linkedinResult.output;
            linkedinJobs = output.jobsFound || 0;

            // Check if output has autoSaved property (when jobs were found and processed)
            if ("autoSaved" in output) {
              autoSavedJobs += output.autoSaved || 0;
              totalOpportunities += output.autoSaved || 0; // Count auto-saved jobs in total
            }

            logger.info("LinkedIn scraping completed with ScrapingDog", {
              userId,
              jobsFound: linkedinJobs,
              autoSaved: "autoSaved" in output ? output.autoSaved || 0 : 0,
              autoSaveEnabled: preferences.auto_save_discovered_jobs,
            });
          } else {
            logger.error("LinkedIn scraping failed", {
              userId,
              taskId: linkedinResult.id,
            });
          }
        } catch (error) {
          logger.error("LinkedIn discovery error", { userId, error });
        }
      }

      // 3. Enhanced Web Discovery (using Serper API + AI Analysis)
      if (preferences.target_roles.length > 0) {
        try {
          const webResults = await searchJobsWithSerper(preferences);

          for (const result of webResults) {
            // Process result with AI enhancement for premium tiers
            const processedJob = await processSerperResultWithAI(
              result,
              preferences,
            );

            // Filter out excluded companies
            if (
              preferences.excluded_companies.some((excluded) =>
                processedJob.company
                  .toLowerCase()
                  .includes(excluded.toLowerCase()),
              )
            ) {
              continue;
            }

            // Filter out excluded keywords
            if (
              preferences.excluded_keywords.some(
                (keyword) =>
                  processedJob.title
                    .toLowerCase()
                    .includes(keyword.toLowerCase()) ||
                  (processedJob.description &&
                    processedJob.description
                      .toLowerCase()
                      .includes(keyword.toLowerCase())),
              )
            ) {
              continue;
            }

            // Check for duplicates
            const duplicateCheck = await checkForDuplicateJob(
              supabase,
              userId,
              {
                title: processedJob.title,
                company: processedJob.company,
                location: processedJob.location,
                url: processedJob.url,
              },
            );

            if (duplicateCheck.isDuplicate) {
              logger.info("Skipping duplicate Serper job", {
                title: processedJob.title,
                company: processedJob.company,
                reason: duplicateCheck.reason,
                existingId: duplicateCheck.existingId,
              });
              continue;
            }

            // Convert to universal job format
            const universalJobData = {
              source_vendor: "serper" as const,
              external_job_id: undefined, // Serper doesn't provide external IDs
              title: processedJob.title,
              company: processedJob.company,
              location: processedJob.location,
              description: processedJob.description,
              job_url: processedJob.url,
              posted_at: new Date().toISOString(), // Serper doesn't provide posted dates
              // Enhanced fields from AI analysis
              salary_json: processedJob.salary_json,
              employment_type: processedJob.employment_type,
              experience_level: processedJob.experience_level,
              company_url: processedJob.company_url,
              company_logo: processedJob.company_logo,
              industries: processedJob.industries,
              apply_link: processedJob.apply_link,
              extra_data: {
                searchKeywords: processedJob.searchKeywords,
                analysis_confidence: processedJob.analysis_confidence,
                skills_required: processedJob.skills_required,
                skills_preferred: processedJob.skills_preferred,
              },
            };

            // Determine job status based on auto-save preference
            const jobStatus = preferences.auto_save_discovered_jobs
              ? "auto_saved"
              : "discovered";

            // Save to universal jobs system
            const { jobId, success } = await saveJobWithUserAssociation(
              universalJobData,
              userId,
              undefined, // No discovery run ID for Serper jobs yet
              jobStatus,
            );

            if (success && jobId) {
              webJobs++;

              // If auto-save is enabled, also create application
              if (preferences.auto_save_discovered_jobs) {
                const applicationId =
                  await createEnhancedOpportunityApplication(
                    supabase,
                    userId,
                    {
                      title: processedJob.title,
                      company: processedJob.company,
                      location:
                        processedJob.location ||
                        preferences.target_locations[0] ||
                        "Unknown",
                      url: processedJob.url,
                      description: processedJob.description,
                      source: "serper",
                      searchKeywords: processedJob.searchKeywords,
                      salary_json: processedJob.salary_json,
                      employment_type: processedJob.employment_type,
                      experience_level: processedJob.experience_level,
                    },
                    preferences,
                  );

                if (applicationId) {
                  autoSavedJobs++;
                  totalOpportunities++;

                  logger.info("Enhanced web job processed and auto-saved", {
                    jobId,
                    applicationId,
                    title: processedJob.title,
                    company: processedJob.company,
                    confidence: processedJob.analysis_confidence,
                    hasAIEnhancement: !!processedJob.analysis_confidence,
                    skillsExtracted:
                      (processedJob.skills_required?.length || 0) +
                      (processedJob.skills_preferred?.length || 0),
                  });
                }
              } else {
                logger.info(
                  "Web job discovered and saved to universal jobs (auto-save disabled)",
                  {
                    jobId,
                    title: processedJob.title,
                    company: processedJob.company,
                    url: processedJob.url,
                    userId,
                    confidence: processedJob.analysis_confidence,
                    hasAIEnhancement: !!processedJob.analysis_confidence,
                    skillsExtracted:
                      (processedJob.skills_required?.length || 0) +
                      (processedJob.skills_preferred?.length || 0),
                  },
                );
              }
            } else {
              logger.warn("Failed to save Serper job to universal jobs", {
                title: processedJob.title,
                company: processedJob.company,
                url: processedJob.url,
              });
            }
          }
        } catch (error) {
          logger.error("Enhanced web discovery failed", { userId, error });
        }
      }

      // ATS Discovery has been removed - previously supported Greenhouse & Lever
      // This functionality has been replaced with enhanced web discovery via Serper

      // Update last discovery time
      await updateLastDiscoveryTime(supabase, userId);

      // Send daily digest notification if there are new opportunities
      if (totalOpportunities > 0 || autoSavedJobs > 0) {
        await sendDailyDigestNotification(userId, {
          totalOpportunities,
          linkedinJobs,
          jsearchJobs,
          webJobs,
          autoSavedJobs,
        });
      }

      // Trigger cache revalidation once at the end if we created any applications
      if (totalOpportunities > 0 || autoSavedJobs > 0) {
        try {
          await triggerApplicationsRevalidation();
          logger.info("Cache revalidation triggered after job discovery", {
            userId,
            totalOpportunities,
            autoSavedJobs,
          });
        } catch (error) {
          // Don't fail the discovery if revalidation fails
          logger.error("Failed to trigger cache revalidation", { error });
        }
      }

      logger.info("Job discovery completed", {
        userId,
        totalOpportunities,
        linkedinJobs,
        jsearchJobs,
        webJobs,
        autoSavedJobs,
        subscriptionTier: preferences.subscription_tier,
        autoSaveEnabled: preferences.auto_save_discovered_jobs,
      });

      return {
        success: true,
        totalOpportunities,
        linkedinJobs,
        jsearchJobs,
        webJobs,
        autoSavedJobs,
        subscriptionTier: preferences.subscription_tier,
        autoSaveEnabled: preferences.auto_save_discovered_jobs,
      };
    } catch (error) {
      logger.error("Job discovery failed", { userId, error });
      throw error;
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled Tasks (Tiered)
// ═══════════════════════════════════════════════════════════════════════════

// Daily discovery for Executive users only (Fantasic runs daily)
export const dailyJobDiscoveryForExecutive = schedules.task({
  id: "daily-job-discovery-executive",
  cron: "0 9 * * *", // 9 AM UTC daily
  run: async () => {
    const supabase = createClient();

    logger.info("Starting daily job discovery for Executive users");

    // Get Executive users with active preferences
    const executiveUsers = await getActiveUsers(supabase, "executive");

    logger.info("Found executive users for daily discovery", {
      executiveUsers: executiveUsers.length,
    });

    let successCount = 0;
    let errorCount = 0;

    // Process users in batches to avoid overwhelming the system
    const BATCH_SIZE = 3; // Conservative for API limits
    for (let i = 0; i < executiveUsers.length; i += BATCH_SIZE) {
      const batch = executiveUsers.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (userId) => {
          try {
            await runJobDiscovery.trigger({
              userId,
              forceRun: false,
              testMode: false,
            });
            successCount++;
          } catch (error) {
            logger.error("Failed to trigger discovery for user", {
              userId,
              error,
            });
            errorCount++;
          }
        }),
      );

      // Rate limiting between batches
      if (i + BATCH_SIZE < executiveUsers.length) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    return {
      totalUsers: executiveUsers.length,
      successCount,
      errorCount,
      message: `Daily discovery triggered for ${successCount}/${executiveUsers.length} executive users`,
    };
  },
});

// Daily discovery for Pro users (LinkedIn & Serper daily, JSearch only on Mondays)
export const dailyJobDiscoveryForPro = schedules.task({
  id: "daily-job-discovery-pro",
  cron: "0 9 * * *", // 9 AM UTC daily
  run: async () => {
    const supabase = createClient();

    logger.info("Starting daily job discovery for Pro users");

    // Get Pro users with active preferences
    const proUsers = await getActiveUsers(supabase, "pro");

    logger.info("Found pro users for daily discovery", {
      proUsers: proUsers.length,
    });

    let successCount = 0;
    let errorCount = 0;

    const BATCH_SIZE = 5;
    for (let i = 0; i < proUsers.length; i += BATCH_SIZE) {
      const batch = proUsers.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (userId) => {
          try {
            await runJobDiscovery.trigger({
              userId,
              forceRun: false,
              testMode: false,
            });
            successCount++;
          } catch (error) {
            logger.error("Failed to trigger discovery for user", {
              userId,
              error,
            });
            errorCount++;
          }
        }),
      );

      if (i + BATCH_SIZE < proUsers.length) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
      }
    }

    return {
      totalUsers: proUsers.length,
      successCount,
      errorCount,
      message: `Daily discovery triggered for ${successCount}/${proUsers.length} pro users`,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Manual Trigger Function (for testing and user-initiated discovery)
// ═══════════════════════════════════════════════════════════════════════════

export const triggerManualJobDiscovery = task({
  id: "trigger-manual-job-discovery",
  run: async (payload: { userId: string; testMode?: boolean }) => {
    logger.info("Manual job discovery triggered", {
      userId: payload.userId,
      testMode: payload.testMode,
    });

    // Manual discovery should bypass all scheduling restrictions
    const result = await runJobDiscovery.trigger({
      userId: payload.userId,
      forceRun: true, // Manual triggers should bypass restrictions
      testMode: payload.testMode || false,
    });

    return {
      success: true,
      taskId: result.id,
      message: "Manual job discovery started successfully",
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Notification System (Placeholder for Supabase Edge Functions + Resend)
// ═══════════════════════════════════════════════════════════════════════════

async function sendDailyDigestNotification(
  userId: string,
  stats: {
    totalOpportunities: number;
    linkedinJobs: number;
    jsearchJobs: number;
    webJobs: number;
    autoSavedJobs: number;
  },
): Promise<void> {
  // TODO: Implement using Supabase Edge Functions + Resend
  // This will send email/push notifications about new opportunities

  logger.info("📧 TODO: Send daily digest notification", {
    userId,
    stats,
    message: `${stats.totalOpportunities} new opportunities found (${stats.autoSavedJobs} auto-saved) - JSearch: ${stats.jsearchJobs}, LinkedIn: ${stats.linkedinJobs}, Web: ${stats.webJobs}`,
  });

  // Placeholder for future implementation:
  // 1. Call Supabase Edge Function
  // 2. Edge Function uses Resend to send email
  // 3. Include summary of new opportunities
  // 4. Link to dashboard to review
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache Revalidation Helper – not inside Next.js request, so call API route
// ═══════════════════════════════════════════════════════════════════════════

async function triggerApplicationsRevalidation() {
  try {
    const baseUrl = process.env.APP_BASE_URL;
    const secret = process.env.REVALIDATE_SECRET;
    if (!baseUrl || !secret) return;

    await fetch(`${baseUrl}/api/revalidate/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
    });
  } catch (err) {
    logger.error("Failed to trigger applications cache revalidation", {
      error: (err as Error).message,
    });
  }
}

// Export for use in other modules
export { createOpportunityApplication };
