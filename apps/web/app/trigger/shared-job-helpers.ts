import { createHash } from "crypto";
import createClient from "./create-client";

// ═══════════════════════════════════════════════════════════════════════════
// Shared Job Helpers for Universal Jobs System
// Used by all scrapers: LinkedIn, Bright Data, Serper
// ═══════════════════════════════════════════════════════════════════════════

export interface UniversalJobData {
  source_vendor: "linkedin" | "serper" | "manual" | "jsearch";
  external_job_id?: string; // vendor's ID (nullable for Serper)
  title: string;
  company: string;
  location?: string;
  description?: string;
  job_url: string;
  posted_at?: string; // ISO date string

  // Enhanced fields from scrapers
  salary_json?: unknown;
  applicants?: number;
  employment_type?: string;
  experience_level?: string;

  // UI 2.0 normalized fields
  company_url?: string;
  company_logo?: string;
  country_code?: string;
  seniority_level?: string;
  job_function?: string;
  industries?: string[];
  apply_link?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;

  // Raw data for future mining
  extra_data?: unknown;
}

export interface UserJobStatus {
  user_id: string;
  job_id: string;
  discovery_run_id?: string;
  status: "discovered" | "auto_saved" | "saved" | "ignored" | "applied";
  notes?: string;
}

// Generate fingerprint for deduplication
function generateJobFingerprint(
  company: string,
  title: string,
  location: string = "",
): string {
  const normalizedCompany = company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();

  const normalizedTitle = title
    .toLowerCase()
    .replace(/\b(sr|senior|jr|junior)\b\.?/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();

  const normalizedLocation = location
    .toLowerCase()
    .replace(/\b(remote|hybrid|on-site)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();

  const input = `${normalizedCompany}|${normalizedTitle}|${normalizedLocation}`;
  return createHash("md5").update(input).digest("hex");
}

/**
 * Upsert a job into the universal jobs table
 * Returns the job ID for linking to user_jobs
 */
export async function upsertJob(
  jobData: UniversalJobData,
): Promise<string | null> {
  const supabase = createClient();

  try {
    // Generate fingerprint for deduplication
    const fingerprint = generateJobFingerprint(
      jobData.company,
      jobData.title,
      jobData.location || "",
    );

    // Use the database function for atomic upsert
    const { data, error } = await supabase.rpc("upsert_job", {
      p_source_vendor: jobData.source_vendor,
      p_external_job_id: jobData.external_job_id || null,
      p_fingerprint: fingerprint,
      p_title: jobData.title,
      p_company: jobData.company,
      p_location: jobData.location || null,
      p_description: jobData.description || null,
      p_job_url: jobData.job_url,
      p_posted_at: jobData.posted_at || null,
      p_salary_json: jobData.salary_json || null,
      p_applicants: jobData.applicants || null,
      p_employment_type: jobData.employment_type || null,
      p_experience_level: jobData.experience_level || null,
      p_company_url: jobData.company_url || null,
      p_company_logo: jobData.company_logo || null,
      p_country_code: jobData.country_code || null,
      p_seniority_level: jobData.seniority_level || null,
      p_job_function: jobData.job_function || null,
      p_industries: jobData.industries || null,
      p_apply_link: jobData.apply_link || null,
      p_salary_min: jobData.salary_min || null,
      p_salary_max: jobData.salary_max || null,
      p_salary_currency: jobData.salary_currency || null,
      p_salary_period: jobData.salary_period || null,
      p_extra_data: jobData.extra_data || null,
    });

    if (error) {
      console.error("Failed to upsert job:", error);
      return null;
    }

    return data as string;
  } catch (error) {
    console.error("Error upserting job:", error);
    return null;
  }
}

/**
 * Associate a user with a job and track their interaction state
 */
export async function upsertUserJob(
  userId: string,
  jobId: string,
  discoveryRunId?: string,
  status:
    | "discovered"
    | "auto_saved"
    | "saved"
    | "ignored"
    | "applied" = "discovered",
  notes?: string,
): Promise<boolean> {
  const supabase = createClient();

  try {
    // Use the database function for atomic upsert
    const { error } = await supabase.rpc("upsert_user_job", {
      p_user_id: userId,
      p_job_id: jobId,
      p_discovery_run_id: discoveryRunId || null,
      p_status: status,
      p_notes: notes || null,
    });

    if (error) {
      console.error("Failed to upsert user job:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error upserting user job:", error);
    return false;
  }
}

/**
 * Save a job and create user association in one transaction
 * This is the main function scrapers should use
 */
export async function saveJobWithUserAssociation(
  jobData: UniversalJobData,
  userId: string,
  discoveryRunId?: string,
  status:
    | "discovered"
    | "auto_saved"
    | "saved"
    | "ignored"
    | "applied" = "discovered",
  notes?: string,
): Promise<{ jobId: string | null; success: boolean }> {
  try {
    // First upsert the job
    const jobId = await upsertJob(jobData);
    if (!jobId) {
      return { jobId: null, success: false };
    }

    // Then create the user association
    const userJobSuccess = await upsertUserJob(
      userId,
      jobId,
      discoveryRunId,
      status,
      notes,
    );

    return { jobId, success: userJobSuccess };
  } catch (error) {
    console.error("Error saving job with user association:", error);
    return { jobId: null, success: false };
  }
}

/**
 * Normalize currency format - must be exactly 3 characters for DB constraint
 */
export function normalizeCurrency(
  currency?: string | null,
): string | undefined {
  if (!currency) return undefined;

  const rawCurrency = currency.trim();
  // Convert common symbols to ISO codes
  if (rawCurrency === "$" || rawCurrency === "USD") {
    return "USD";
  } else if (rawCurrency === "CAD" || rawCurrency.includes("CAD")) {
    return "CAD";
  } else if (rawCurrency === "€" || rawCurrency === "EUR") {
    return "EUR";
  } else if (rawCurrency === "£" || rawCurrency === "GBP") {
    return "GBP";
  } else if (rawCurrency.length === 3) {
    return rawCurrency.toUpperCase();
  } else {
    // Default to USD for unrecognized formats
    return "USD";
  }
}

/**
 * Extract country code from location string
 */
export function extractCountryCode(location: string): string | undefined {
  if (!location) return undefined;

  const countryMap: Record<string, string> = {
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

  const lower = location.trim().toLowerCase();

  // Check for exact matches first
  for (const [country, code] of Object.entries(countryMap)) {
    if (lower.includes(country)) {
      return code;
    }
  }

  // Fallback: extract last part after comma (common format: "City, Country")
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].toLowerCase();
    return countryMap[lastPart] || lastPart.toUpperCase().slice(0, 2);
  }

  return undefined;
}
