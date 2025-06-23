"use server";

import { companyEnrichmentService } from "@/lib/services/company-enrichment";
import { aiCompanyEnrichmentService } from "@/lib/services/company-enrichment-ai";
import type {
  CompanyEnrichmentData,
  EnrichmentSource,
  FundingData,
  GroundingMetadata,
  NewsData,
  QuickEnrichmentData,
} from "@/lib/types/company-enrichment";
import { getWorkerUrl } from "@/lib/worker-utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

interface CachedCompanyData {
  success: boolean;
  data?: {
    id?: string;
    last_enriched_at?: string;
    lastEnrichedAt?: string;
    description?: string;
    industry?: string;
    company_size?: string;
    founded_year?: number;
    headquarters?: string;
    funding_info?: FundingData;
    news_data?: NewsData[];
    domain?: string;
    logo_url?: string;
    website?: string;
    linkedin_url?: string;
    confidence_score?: number;
    data_sources?: EnrichmentSource[];
    grounding_metadata?: GroundingMetadata;
    created_at?: string;
    updated_at?: string;
    enrichment_type?: string;
    quick_enriched_at?: string;
    comprehensive_enriched_at?: string;
    [key: string]: unknown;
  };
  error?: string;
  status?: number;
}

const DATA_FRESHNESS_HOURS = 24; // Data is considered fresh for 24 hours

// Utility function to check if data is within freshness window
function isWithinDataFreshnessWindow(
  timestamp: string | null | undefined,
): boolean {
  if (!timestamp) return false;
  const cacheAge = Date.now() - new Date(timestamp).getTime();
  return cacheAge < DATA_FRESHNESS_HOURS * 60 * 60 * 1000;
}

/**
 * Server Action: Get cached enrichment data for a company
 */
export async function getCachedEnrichmentData(
  companyName: string,
): Promise<CachedCompanyData> {
  try {
    const cookieStore = await cookies();
    const cacheResponse = await fetch(
      `${getWorkerUrl()}/api/company-enrichment?company=${encodeURIComponent(companyName)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieStore.toString(),
        },
      },
    );

    if (!cacheResponse.ok) {
      if (cacheResponse.status === 404) {
        return {
          success: false,
          error: "No enrichment data found",
          status: 404,
        };
      }

      return {
        success: false,
        error: "Failed to fetch cached data",
        status: 500,
      };
    }

    const cacheData = await cacheResponse.json();

    return cacheData;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      status: 500,
    };
  }
}

/**
 * Helper function to check if cached data is suitable for the request
 */
function isCachedDataSuitable(
  cacheData: CachedCompanyData,
  comprehensive: boolean,
  companyName: string,
): { suitable: boolean; reason?: string } {
  if (!cacheData.success || !cacheData.data) {
    return { suitable: false, reason: "No cached data available" };
  }

  console.log(`📋 [ACTION] Checking cache for ${companyName}`);

  const data = cacheData.data;

  // Parse the lastEnrichedAt timestamp
  const lastEnrichedAt = (data.lastEnrichedAt || data.raw_lastEnrichedAt) as
    | string
    | undefined;
  const isDataFresh = isWithinDataFreshnessWindow(lastEnrichedAt);

  if (!isDataFresh) {
    return {
      suitable: false,
      reason: `Cached data is stale (older than ${DATA_FRESHNESS_HOURS} hours)`,
    };
  }

  // For comprehensive enrichment, check if comprehensive enrichment was actually performed
  if (comprehensive) {
    const hasComprehensiveEnrichment = !!data.comprehensiveEnrichedAt;

    if (!hasComprehensiveEnrichment) {
      return {
        suitable: false,
        reason:
          "Cached data only has quick enrichment, need comprehensive enrichment",
      };
    }

    // Check if comprehensive enrichment is fresh (within last 24 hours)
    const isComprehensiveFresh = isWithinDataFreshnessWindow(
      data.comprehensiveEnrichedAt as string | undefined,
    );
    if (!isComprehensiveFresh) {
      return {
        suitable: false,
        reason: "Comprehensive enrichment data is stale",
      };
    }
  }

  return { suitable: true };
}

/**
 * Server Action: Quick company enrichment (for real-time form enhancement)
 */
export async function enrichCompanyQuick(
  companyName: string,
  domain?: string,
): Promise<{
  success: boolean;
  data?: QuickEnrichmentData;
  cached?: boolean;
  error?: string;
  responseTime?: number;
}> {
  const startTime = Date.now();

  try {
    if (!companyName?.trim()) {
      return {
        success: false,
        error: "Company name is required",
      };
    }

    const trimmedCompanyName = companyName.trim();

    // Check cache first
    const cacheData = await getCachedEnrichmentData(trimmedCompanyName);

    if (cacheData.success) {
      const suitabilityCheck = isCachedDataSuitable(
        cacheData,
        false, // not comprehensive
        trimmedCompanyName,
      );

      if (suitabilityCheck.suitable) {
        const responseTime = Date.now() - startTime;

        // Convert cached data to QuickEnrichmentData format
        const quickData: QuickEnrichmentData = {
          companyName: trimmedCompanyName,
          normalizedName: trimmedCompanyName.toLowerCase().trim(),
          domain: cacheData.data?.domain as string | undefined,
          logoUrl: cacheData.data?.logoUrl as string | undefined,
          website: cacheData.data?.website as string | undefined,
          description: cacheData.data?.description as string | undefined,
          industry: cacheData.data?.industry as string | undefined,
          confidenceScore: (cacheData.data?.confidenceScore as number) || 0.8,
          dataSources:
            (cacheData.data?.dataSources as EnrichmentSource[]) || [],
          cached: true,
          responseTime,
          groundingMetadata: cacheData.data?.groundingMetadata as
            | GroundingMetadata
            | undefined,
        };

        return {
          success: true,
          data: quickData,
          cached: true,
          responseTime,
        };
      }
    }

    // Perform fresh enrichment using AI service
    const enrichmentData = await aiCompanyEnrichmentService.enrichCompany(
      trimmedCompanyName,
      domain,
    );

    // Always try to get logo separately for reliability (same as comprehensive enrichment)
    try {
      const logoResult = await companyEnrichmentService.enrichQuick(
        trimmedCompanyName,
        domain || enrichmentData.domain,
      );
      if (logoResult.logoUrl && !enrichmentData.logoUrl) {
        enrichmentData.logoUrl = logoResult.logoUrl;
        enrichmentData.dataSources.push({
          provider: "google",
          fields: ["logoUrl"],
          confidence: 0.9,
          retrievedAt: new Date().toISOString(),
        });
      }
    } catch (logoError) {
      console.warn(
        `❌ [ACTION] Logo enrichment failed in quick enrichment:`,
        logoError,
      );
    }

    // Convert to QuickEnrichmentData format
    const quickData: QuickEnrichmentData = {
      companyName: enrichmentData.companyName,
      normalizedName: enrichmentData.normalizedName,
      domain: enrichmentData.domain,
      logoUrl: enrichmentData.logoUrl,
      website: enrichmentData.website,
      description: enrichmentData.description,
      industry: enrichmentData.industry,
      confidenceScore: enrichmentData.confidenceScore,
      dataSources: enrichmentData.dataSources,
      cached: false,
      responseTime: Date.now() - startTime,
      groundingMetadata: enrichmentData.groundingMetadata,
    };

    // Store in cache via worker
    try {
      const cookieStore = await cookies();

      // Prepare data for storage with enrichment type tracking
      const enrichmentDataToStore = {
        ...enrichmentData,
        // Use the user's original input for normalized name (not AI-returned name)
        // This ensures consistent cache lookups regardless of AI response variations
        normalizedName: trimmedCompanyName.toLowerCase().trim(),
        enrichmentType: "quick",
        quickEnrichedAt: new Date().toISOString(),
      };

      const storeResponse = await fetch(
        `${getWorkerUrl()}/api/company-enrichment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieStore.toString(),
          },
          body: JSON.stringify(enrichmentDataToStore),
        },
      );

      if (!storeResponse.ok) {
        console.warn(
          `❌ [ACTION] Failed to store enrichment data: ${storeResponse.status}`,
        );
      }
    } catch (storeError) {
      console.warn(`❌ [ACTION] Failed to store enrichment data:`, storeError);
    }

    return {
      success: true,
      data: quickData,
      cached: false,
      responseTime: quickData.responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [ACTION] Quick enrichment failed:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Enrichment failed",
      responseTime,
    };
  }
}

/**
 * Server Action: Comprehensive company enrichment
 */
export async function enrichCompanyComprehensive(
  companyName: string,
  domain?: string,
  forceRefresh?: boolean,
): Promise<{
  success: boolean;
  data?: CompanyEnrichmentData;
  cached?: boolean;
  error?: string;
  sourceErrors?: { provider: string; error: string }[];
}> {
  try {
    if (!companyName?.trim()) {
      return {
        success: false,
        error: "Company name is required",
      };
    }

    const trimmedCompanyName = companyName.trim();

    // Check cache first (unless force refresh is requested)
    if (!forceRefresh) {
      const cacheData = await getCachedEnrichmentData(trimmedCompanyName);

      if (cacheData.success) {
        const suitabilityCheck = isCachedDataSuitable(
          cacheData,
          true, // comprehensive
          trimmedCompanyName,
        );

        if (suitabilityCheck.suitable) {
          // Convert cached data to CompanyEnrichmentData format
          const comprehensiveData: CompanyEnrichmentData = {
            id: (cacheData.data?.id as string) || crypto.randomUUID(),
            companyName:
              (cacheData.data?.companyName as string) || trimmedCompanyName,
            // Use the user's original input for consistency
            normalizedName: trimmedCompanyName.toLowerCase().trim(),
            domain: cacheData.data?.domain as string | undefined,
            logoUrl: cacheData.data?.logoUrl as string | undefined,
            description: cacheData.data?.description as string | undefined,
            industry: cacheData.data?.industry as string | undefined,
            companySize: cacheData.data?.companySize as string | undefined,
            foundedYear: cacheData.data?.foundedYear as number | undefined,
            headquarters: cacheData.data?.headquarters as string | undefined,
            website: cacheData.data?.website as string | undefined,
            linkedinUrl: cacheData.data?.linkedinUrl as string | undefined,
            fundingInfo: cacheData.data?.fundingInfo as FundingData | undefined,
            newsData: (cacheData.data?.newsData as NewsData[]) || [],
            confidenceScore: (cacheData.data?.confidenceScore as number) || 0.8,
            dataSources:
              (cacheData.data?.dataSources as EnrichmentSource[]) || [],
            lastEnrichedAt:
              (cacheData.data?.lastEnrichedAt as string) ||
              new Date().toISOString(),
            createdAt:
              (cacheData.data?.createdAt as string) || new Date().toISOString(),
            updatedAt:
              (cacheData.data?.updatedAt as string) || new Date().toISOString(),
            groundingMetadata: cacheData.data?.groundingMetadata as
              | GroundingMetadata
              | undefined,
          };

          return {
            success: true,
            data: comprehensiveData,
            cached: true,
          };
        }
      }
    }

    let enrichmentData;
    const sourceErrors: { provider: string; error: string }[] = [];

    try {
      // Primary: AI-powered enrichment
      enrichmentData = await aiCompanyEnrichmentService.enrichCompany(
        trimmedCompanyName,
        domain,
      );
    } catch (aiError) {
      console.warn(
        `❌ [ACTION] AI enrichment failed, falling back to traditional APIs:`,
        aiError,
      );
      sourceErrors.push({
        provider: "ai_research",
        error:
          aiError instanceof Error ? aiError.message : "AI enrichment failed",
      });

      // Fallback: Traditional API enrichment
      enrichmentData = await companyEnrichmentService.enrichComprehensive(
        trimmedCompanyName,
        domain,
      );
    }

    // Always try to get logo separately for reliability
    try {
      const logoResult = await companyEnrichmentService.enrichQuick(
        trimmedCompanyName,
        domain || enrichmentData.domain,
      );
      if (logoResult.logoUrl && !enrichmentData.logoUrl) {
        enrichmentData.logoUrl = logoResult.logoUrl;
        enrichmentData.dataSources.push({
          provider: "google",
          fields: ["logoUrl"],
          confidence: 0.9,
          retrievedAt: new Date().toISOString(),
        });
      }
    } catch (logoError) {
      console.warn(`❌ [ACTION] Logo enrichment failed:`, logoError);
    }

    // Store in cache via worker
    try {
      const cookieStore = await cookies();

      // Prepare data for storage with enrichment type tracking
      const enrichmentDataToStore = {
        companyName: enrichmentData.companyName,
        // Use the user's original input for normalized name (not AI-returned name)
        // This ensures consistent cache lookups regardless of AI response variations
        normalizedName: trimmedCompanyName.toLowerCase().trim(),
        domain: enrichmentData.domain,
        logoUrl: enrichmentData.logoUrl,
        description: enrichmentData.description,
        industry: enrichmentData.industry,
        companySize: enrichmentData.companySize,
        foundedYear: enrichmentData.foundedYear,
        headquarters: enrichmentData.headquarters,
        website: enrichmentData.website,
        linkedinUrl: enrichmentData.linkedinUrl,
        fundingInfo: enrichmentData.fundingInfo,
        newsData: enrichmentData.newsData,
        confidenceScore: enrichmentData.confidenceScore,
        dataSources: enrichmentData.dataSources,
        groundingMetadata: enrichmentData.groundingMetadata,
        // Add enrichment type tracking
        enrichmentType: "comprehensive",
        comprehensiveEnrichedAt: new Date().toISOString(),
      };

      const storeResponse = await fetch(
        `${getWorkerUrl()}/api/company-enrichment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieStore.toString(),
          },
          body: JSON.stringify(enrichmentDataToStore),
        },
      );

      if (!storeResponse.ok) {
        console.warn(
          `❌ [ACTION] Failed to store comprehensive enrichment data: ${storeResponse.status}`,
        );
      } else {
        const storeResult = await storeResponse.json();

        // Update enrichmentData with the database ID if available
        if (storeResult.data?.id) {
          (enrichmentData as CompanyEnrichmentData).id = storeResult.data.id;
        }
      }
    } catch (storeError) {
      console.warn(`❌ [ACTION] Failed to store enrichment data:`, storeError);
    }

    // Convert to full CompanyEnrichmentData format
    const comprehensiveData: CompanyEnrichmentData = {
      id: (enrichmentData as CompanyEnrichmentData).id || crypto.randomUUID(),
      ...enrichmentData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Revalidate any pages that might show this data
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/add-application");

    return {
      success: true,
      data: comprehensiveData,
      cached: false,
      sourceErrors: sourceErrors.length > 0 ? sourceErrors : undefined,
    };
  } catch (error) {
    console.error(`❌ [ACTION] Comprehensive enrichment failed:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Enrichment failed",
    };
  }
}
