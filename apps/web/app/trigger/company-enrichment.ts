import { logger, schedules, task } from "@trigger.dev/sdk/v3";
import createClient from "./create-client";

// MOVED: Import the company enrichment service directly
import { companyEnrichmentService } from "@/lib/services/company-enrichment";

// Simple groupBy implementation to avoid lodash dependency
function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = String(item[key]);
      groups[groupKey] = groups[groupKey] || [];
      groups[groupKey].push(item);
      return groups;
    },
    {} as Record<string, T[]>,
  );
}

// Type for application data from database
interface ApplicationData {
  id: string;
  company_name: string;
  enrichment_status?: string;
  enrichment_last_attempted_at?: string;
}

// Enrich existing applications that don't have enrichment data
export const enrichExistingApplications = task({
  id: "enrich-existing-applications",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: {
    batchSize?: number;
    priorityCompanies?: string[];
  }) => {
    const supabase = createClient();
    const batchSize = payload.batchSize || 50;

    logger.info("Starting company enrichment for existing applications", {
      batchSize,
    });

    // Get applications that need enrichment
    const { data: applications, error } = await supabase
      .from("applications")
      .select(
        "id, company_name, enrichment_status, enrichment_last_attempted_at",
      )
      .or(
        "enrichment_status.is.null,enrichment_status.eq.pending,enrichment_status.eq.failed",
      )
      .limit(batchSize)
      .returns<ApplicationData[]>();

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    if (!applications?.length) {
      logger.info("No applications need enrichment");
      return { enrichedCount: 0, message: "No applications to enrich" };
    }

    // Group by company to avoid duplicate API calls
    const companiesByName = groupBy(applications, "company_name");

    let enrichedCount = 0;
    let failedCount = 0;

    for (const [companyName, apps] of Object.entries(companiesByName)) {
      try {
        // Mark as processing
        await supabase
          .from("applications")
          .update({
            enrichment_status: "processing",
            enrichment_last_attempted_at: new Date().toISOString(),
          })
          .in(
            "id",
            apps.map((app) => app.id),
          );

        // Trigger individual enrichment
        const enrichResult = await enrichSingleCompany.trigger({
          companyName,
          applicationIds: apps.map((app) => app.id),
        });

        logger.info(`Triggered enrichment for ${companyName}`, {
          taskId: enrichResult.id,
          applicationCount: apps.length,
        });

        enrichedCount += apps.length;

        // Rate limiting - respect API limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Failed to trigger enrichment for ${companyName}`, {
          error,
        });

        // Mark as failed
        await supabase
          .from("applications")
          .update({ enrichment_status: "failed" })
          .in(
            "id",
            apps.map((app) => app.id),
          );

        failedCount += apps.length;
      }
    }

    return {
      enrichedCount,
      failedCount,
      message: `Triggered enrichment for ${enrichedCount} applications, ${failedCount} failed`,
    };
  },
});

// Enrich a single company (comprehensive background enrichment)
export const enrichSingleCompany = task({
  id: "enrich-single-company",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
  },
  run: async (payload: { companyName: string; applicationIds: string[] }) => {
    const supabase = createClient(); // This already uses service role

    try {
      logger.info(`Starting enrichment for company: ${payload.companyName}`);

      // MOVED: Use the enrichment service directly instead of HTTP calls
      // Check for existing enrichment data first
      const { data: existingData } = await supabase
        .from("company_enrichment")
        .select("*")
        .eq("normalized_name", payload.companyName.toLowerCase().trim())
        .single();

      let enrichmentData;

      if (existingData) {
        // Check if data is still fresh (within 7 days)
        const lastEnriched = new Date(existingData.last_enriched_at);
        const isStale =
          Date.now() - lastEnriched.getTime() > 7 * 24 * 60 * 60 * 1000;

        if (!isStale) {
          logger.info(
            `Using cached enrichment data for ${payload.companyName}`,
          );
          enrichmentData = existingData;
        }
      }

      // If no fresh data, perform comprehensive enrichment
      if (!enrichmentData) {
        logger.info(`Performing fresh enrichment for ${payload.companyName}`);

        const enrichmentResult =
          await companyEnrichmentService.enrichComprehensive(
            payload.companyName,
            undefined, // domain
          );

        // Save enrichment data directly with service role
        const { data: savedData, error: saveError } = await supabase
          .from("company_enrichment")
          .upsert(
            {
              company_name: enrichmentResult.companyName,
              normalized_name: enrichmentResult.normalizedName,
              domain: enrichmentResult.domain,
              logo_url: enrichmentResult.logoUrl,
              description: enrichmentResult.description,
              industry: enrichmentResult.industry,
              company_size: enrichmentResult.companySize,
              founded_year: enrichmentResult.foundedYear,
              headquarters: enrichmentResult.headquarters,
              website: enrichmentResult.website,
              linkedin_url: enrichmentResult.linkedinUrl,
              funding_info: enrichmentResult.fundingInfo,
              news_data: enrichmentResult.newsData,
              confidence_score: enrichmentResult.confidenceScore,
              data_sources: enrichmentResult.dataSources,
              last_enriched_at: new Date().toISOString(),
            },
            {
              onConflict: "normalized_name",
            },
          )
          .select()
          .single();

        if (saveError) {
          throw new Error(
            `Failed to save enrichment data: ${saveError.message}`,
          );
        }

        enrichmentData = savedData;
        logger.info(
          `Successfully saved enrichment data for ${payload.companyName}`,
        );
      }

      // Verify the enrichment data has a valid ID
      if (!enrichmentData?.id) {
        throw new Error("Invalid enrichment data: missing ID");
      }

      // Update applications with enrichment data
      const { error } = await supabase
        .from("applications")
        .update({
          enrichment_status: "completed",
          enriched_company_id: enrichmentData.id,
        })
        .in("id", payload.applicationIds);

      if (error) {
        throw new Error(`Failed to update applications: ${error.message}`);
      }

      logger.info(`Successfully enriched company: ${payload.companyName}`, {
        enrichmentId: enrichmentData.id,
        applicationIds: payload.applicationIds,
        cached: !!existingData,
      });

      return {
        success: true,
        enrichmentData,
        applicationsUpdated: payload.applicationIds.length,
        cached: !!existingData,
      };
    } catch (error) {
      logger.error(`Failed to enrich company: ${payload.companyName}`, {
        error,
        applicationIds: payload.applicationIds,
      });

      // Mark as failed
      await supabase
        .from("applications")
        .update({ enrichment_status: "failed" })
        .in("id", payload.applicationIds);

      throw error;
    }
  },
});

// Weekly company data refresh for stale data
export const weeklyCompanyDataRefresh = schedules.task({
  id: "weekly-company-data-refresh",
  cron: "0 2 * * 1", // Every Monday at 2 AM UTC
  run: async () => {
    const supabase = createClient();

    logger.info("Starting weekly company data refresh");

    // Get companies that haven't been updated in the last week
    const { data: staleCompanies } = await supabase
      .from("company_enrichment")
      .select("company_name, id")
      .lt(
        "last_enriched_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .limit(100);

    if (staleCompanies?.length) {
      logger.info(`Found ${staleCompanies.length} stale companies to refresh`);

      // Trigger refresh for stale companies
      for (const company of staleCompanies) {
        try {
          await refreshCompanyData.trigger({
            companyName: company.company_name,
            forceRefresh: true,
          });
        } catch (error) {
          logger.error(
            `Failed to trigger refresh for ${company.company_name}`,
            { error },
          );
        }

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return {
      refreshedCount: staleCompanies?.length || 0,
      message: `Triggered refresh for ${staleCompanies?.length || 0} companies`,
    };
  },
});

// Refresh specific company data
export const refreshCompanyData = task({
  id: "refresh-company-data",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: { companyName: string; forceRefresh?: boolean }) => {
    const supabase = createClient();

    logger.info(`Refreshing company data for: ${payload.companyName}`);

    // Get all applications for this company
    const { data: applications } = await supabase
      .from("applications")
      .select("id")
      .eq("company_name", payload.companyName);

    if (applications?.length) {
      // Trigger enrichment for all applications of this company
      const result = await enrichSingleCompany.trigger({
        companyName: payload.companyName,
        applicationIds: applications.map((app: { id: string }) => app.id),
      });

      return {
        success: true,
        taskId: result.id,
        applicationsCount: applications.length,
      };
    }

    return {
      success: true,
      message: `No applications found for ${payload.companyName}`,
    };
  },
});

// Auto-enrich new applications when they're created
export const autoEnrichNewApplication = task({
  id: "auto-enrich-new-application",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
  },
  run: async (payload: { applicationId: string; companyName: string }) => {
    const supabase = createClient();

    logger.info(`Auto-enriching new application`, {
      applicationId: payload.applicationId,
      companyName: payload.companyName,
    });

    // Check if we already have enrichment data for this company
    const { data: existingEnrichment } = await supabase
      .from("company_enrichment")
      .select("id")
      .eq("normalized_name", payload.companyName.toLowerCase().trim())
      .single();

    if (existingEnrichment) {
      // Link existing enrichment data
      await supabase
        .from("applications")
        .update({
          enriched_company_id: existingEnrichment.id,
          enrichment_status: "completed",
        })
        .eq("id", payload.applicationId);

      logger.info(`Linked existing enrichment data for ${payload.companyName}`);
      return {
        success: true,
        cached: true,
        enrichmentId: existingEnrichment.id,
      };
    }

    // Trigger fresh enrichment
    const result = await enrichSingleCompany.trigger({
      companyName: payload.companyName,
      applicationIds: [payload.applicationId],
    });

    return {
      success: true,
      cached: false,
      taskId: result.id,
    };
  },
});
