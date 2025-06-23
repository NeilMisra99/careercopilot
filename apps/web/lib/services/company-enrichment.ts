import type {
  CompanyEnrichmentInput,
  EnrichmentSource,
  FundingData,
  NewsData,
  QuickEnrichmentData,
} from "@/lib/types/company-enrichment";

/**
 * Company Enrichment Service
 *
 * Handles the actual enrichment logic using external APIs.
 * This service runs in the main Next.js app, not in workers.
 * Workers are only used for database CRUD operations.
 */
export class CompanyEnrichmentService {
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = 10000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Quick enrichment for real-time use (forms, immediate feedback)
   * Uses only fast, lightweight APIs with short timeout
   */
  async enrichQuick(
    companyName: string,
    domain?: string,
  ): Promise<QuickEnrichmentData> {
    const startTime = Date.now();
    const normalizedName = companyName.toLowerCase().trim();

    try {
      // For quick enrichment, we focus on fast logo lookup
      const targetDomain = domain || this.guessDomain(companyName);
      const logoResult = await this.getCompanyLogo(targetDomain);

      const dataSources: EnrichmentSource[] = [];
      let confidenceScore = 0.5; // Base confidence

      // Extract logo
      let logoUrl: string | undefined;
      if (logoResult.logoUrl && logoResult.source) {
        logoUrl = logoResult.logoUrl;
        dataSources.push(logoResult.source);
        confidenceScore += 0.2;
      }

      return {
        companyName,
        normalizedName,
        domain: targetDomain,
        logoUrl,
        confidenceScore: Math.min(1.0, confidenceScore),
        dataSources,
        responseTime: Date.now() - startTime,
        cached: false,
      };
    } catch (error) {
      console.error("Quick enrichment failed:", error);
      throw new Error(`Quick enrichment failed: ${error}`);
    }
  }

  /**
   * Comprehensive enrichment for background processing
   * Uses multiple APIs and more detailed data collection
   */
  async enrichComprehensive(
    companyName: string,
    domain?: string,
  ): Promise<CompanyEnrichmentInput> {
    const normalizedName = companyName.toLowerCase().trim();

    try {
      // Run all enrichment APIs in parallel
      const targetDomain = domain || this.guessDomain(companyName);
      const [logoResult, basicInfoResult, fundingResult, newsResult] =
        await Promise.allSettled([
          this.getCompanyLogo(targetDomain),
          this.getBasicInfo(companyName, targetDomain),
          this.getFundingInfo(companyName, targetDomain),
          this.getNewsData(companyName),
        ]);

      const dataSources: EnrichmentSource[] = [];
      let confidenceScore = 0.5;

      // Process results
      let logoUrl: string | undefined;
      let description: string | undefined;
      let industry: string | undefined;
      let website: string | undefined;
      let extractedDomain: string | undefined;
      let companySize: string | undefined;
      let foundedYear: number | undefined;
      let headquarters: string | undefined;
      let linkedinUrl: string | undefined;
      let fundingInfo: FundingData | undefined;
      let newsData: NewsData[] = [];

      // Extract logo
      if (
        logoResult.status === "fulfilled" &&
        logoResult.value?.logoUrl &&
        logoResult.value?.source
      ) {
        logoUrl = logoResult.value.logoUrl;
        dataSources.push(logoResult.value.source);
        confidenceScore += 0.15;
      }

      // Extract basic info
      if (basicInfoResult.status === "fulfilled" && basicInfoResult.value) {
        const info = basicInfoResult.value;
        description = info.description;
        industry = info.industry;
        website = info.website;
        extractedDomain = info.domain;
        companySize = info.companySize;
        foundedYear = info.foundedYear;
        headquarters = info.headquarters;
        linkedinUrl = info.linkedinUrl;
        dataSources.push(info.source);
        confidenceScore += 0.4;
      }

      // Extract funding info
      if (fundingResult.status === "fulfilled" && fundingResult.value) {
        fundingInfo = fundingResult.value.data;
        dataSources.push(fundingResult.value.source);
        confidenceScore += 0.2;
      }

      // Extract news data
      if (newsResult.status === "fulfilled" && newsResult.value) {
        newsData = newsResult.value.articles;
        dataSources.push(newsResult.value.source);
        confidenceScore += 0.15;
      }

      const result: CompanyEnrichmentInput = {
        companyName,
        normalizedName,
        domain: extractedDomain || targetDomain,
        logoUrl,
        description,
        industry,
        companySize,
        foundedYear,
        headquarters,
        website: website || this.guessWebsite(companyName),
        linkedinUrl,
        fundingInfo,
        newsData,
        confidenceScore: Math.min(1.0, confidenceScore),
        dataSources,
        lastEnrichedAt: new Date().toISOString(),
      };

      return result;
    } catch (error) {
      console.error("Comprehensive enrichment failed:", error);

      // Return fallback data
      return {
        companyName,
        normalizedName,
        domain: domain || this.guessDomain(companyName),
        logoUrl: undefined,
        description: undefined,
        industry: undefined,
        companySize: undefined,
        foundedYear: undefined,
        headquarters: undefined,
        website: this.guessWebsite(companyName),
        linkedinUrl: undefined,
        fundingInfo: undefined,
        newsData: [],
        confidenceScore: 0.1,
        dataSources: [],
        lastEnrichedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Get company logo from multiple free services (NO API KEYS NEEDED!)
   * Uses a fallback approach with several reliable sources
   */
  private async getCompanyLogo(
    domain: string,
  ): Promise<{ logoUrl: string | null; source: EnrichmentSource | null }> {
    if (!domain) {
      return { logoUrl: null, source: null };
    }

    const targetDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    // Strategy: Try multiple free logo services in order of quality
    const logoServices = [
      {
        name: "google_favicon",
        url: `https://www.google.com/s2/favicons?domain=${targetDomain}&sz=128`,
        provider: "google" as const,
        confidence: 0.9, // Google has the best logo quality
      },
      {
        name: "duckduckgo_favicon",
        url: `https://icons.duckduckgo.com/ip3/${targetDomain}.ico`,
        provider: "duckduckgo" as const,
        confidence: 0.7,
      },
      {
        name: "favicon_fallback",
        url: `https://${targetDomain}/favicon.ico`,
        provider: "direct" as const,
        confidence: 0.6,
      },
    ];

    for (const service of logoServices) {
      try {
        // Use AbortController for timeout instead of fetch timeout option
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(service.url, {
          method: "HEAD", // Just check if the logo exists
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return {
            logoUrl: service.url,
            source: {
              provider: service.provider,
              fields: ["logoUrl"],
              confidence: service.confidence,
              retrievedAt: new Date().toISOString(),
            },
          };
        }
      } catch (error) {
        console.warn(`${service.name} logo fetch failed:`, error);
        continue;
      }
    }

    return { logoUrl: null, source: null };
  }

  /**
   * Get basic company information
   */
  private async getBasicInfo(
    companyName: string,
    domain?: string,
  ): Promise<{
    description?: string;
    industry?: string;
    website?: string;
    domain?: string;
    companySize?: string;
    foundedYear?: number;
    headquarters?: string;
    linkedinUrl?: string;
    source: EnrichmentSource;
  } | null> {
    try {
      // Try multiple data sources in parallel
      const [openCorpResult, linkedinResult, domainResult] =
        await Promise.allSettled([
          this.searchOpenCorporates(companyName),
          this.searchLinkedInCompany(companyName, domain),
          this.getDomainInfo(domain || this.guessDomain(companyName)),
        ]);

      let result: Record<string, unknown> = {};
      const sources: string[] = [];

      // Process OpenCorporates data
      if (openCorpResult.status === "fulfilled" && openCorpResult.value) {
        const data = openCorpResult.value;
        result = { ...result, ...data };
        sources.push("opencorporates");
      }

      // Process LinkedIn data (if available)
      if (linkedinResult.status === "fulfilled" && linkedinResult.value) {
        const data = linkedinResult.value;
        result = { ...result, ...data };
        sources.push("linkedin");
      }

      // Process domain-based data
      if (domainResult.status === "fulfilled" && domainResult.value) {
        const data = domainResult.value;
        result = { ...result, ...data };
        sources.push("domain_analysis");
      }

      // Fallback to basic inference if no data found
      if (Object.keys(result).length === 0) {
        result = {
          website: this.guessWebsite(companyName),
          domain: domain || this.guessDomain(companyName),
          linkedinUrl: `https://linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, "-")}`,
        };
        sources.push("inference");
      }

      return {
        ...result,
        source: {
          provider: (sources.length > 1
            ? "multi_source"
            : sources[0]) as EnrichmentSource["provider"],
          fields: Object.keys(result),
          confidence:
            sources.length > 1
              ? 0.8
              : sources.includes("opencorporates")
                ? 0.7
                : 0.4,
          retrievedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Basic info enrichment failed:", error);
      return null;
    }
  }

  /**
   * Search OpenCorporates for company information
   */
  private async searchOpenCorporates(
    companyName: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(companyName)}&format=json&limit=5`,
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "CareerCopilot Job Application Tracker (Educational)",
          },
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenCorporates API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results?.companies?.length > 0) {
        // Find the best match (exact name match or first result)
        const exactMatch = data.results.companies.find((company: unknown) => {
          const comp = company as { company?: { name?: string } };
          return (
            comp.company?.name
              ?.toLowerCase()
              .includes(companyName.toLowerCase()) ||
            companyName
              .toLowerCase()
              .includes(comp.company?.name?.toLowerCase() || "")
          );
        });

        const bestMatch = exactMatch || data.results.companies[0];
        const company = (bestMatch as { company?: Record<string, unknown> })
          .company;

        if (!company) return null;

        return {
          description: company.name
            ? `${company.name} is a ${company.company_type || "company"} incorporated in ${company.jurisdiction_code || "unknown jurisdiction"}.`
            : undefined,
          industry: this.inferIndustryFromName(companyName),
          headquarters: company.jurisdiction_code
            ? this.getLocationFromJurisdiction(
                company.jurisdiction_code as string,
              )
            : undefined,
          foundedYear: company.incorporation_date
            ? new Date(company.incorporation_date as string).getFullYear()
            : undefined,
          website: company.registry_url
            ? undefined
            : this.guessWebsite(companyName),
          domain: this.guessDomain(companyName),
        };
      }
    } catch (error) {
      console.warn("OpenCorporates search failed:", error);
    }

    return null;
  }

  /**
   * Search for LinkedIn company information
   */
  private async searchLinkedInCompany(
    companyName: string,
    domain?: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      // Try to construct LinkedIn URL and verify it exists
      const linkedinSlug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");

      const possibleUrls = [
        `https://linkedin.com/company/${linkedinSlug}`,
        `https://linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, "")}`,
      ];

      if (domain) {
        const domainName = domain.replace(/\.(com|org|net|co\.uk|ca)$/, "");
        possibleUrls.push(`https://linkedin.com/company/${domainName}`);
      }

      // Check if any LinkedIn URL is accessible (simplified check)
      for (const url of possibleUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const response = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok || response.status === 403) {
            // 403 might mean it exists but blocks bots
            return {
              linkedinUrl: url,
              companySize: this.inferCompanySizeFromName(companyName),
            };
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.warn("LinkedIn search failed:", error);
    }

    return null;
  }

  /**
   * Get information from domain analysis
   */
  private async getDomainInfo(
    domain: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const cleanDomain = domain
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");

      // Simple domain-based inference
      return {
        website: `https://${cleanDomain}`,
        domain: cleanDomain,
        industry: this.inferIndustryFromDomain(cleanDomain),
      };
    } catch (error) {
      console.warn("Domain info failed:", error);
    }

    return null;
  }

  /**
   * Infer industry from company name
   */
  private inferIndustryFromName(companyName: string): string {
    const name = companyName.toLowerCase();

    // Banking and Finance
    if (
      name.includes("bank") ||
      name.includes("financial") ||
      name.includes("credit") ||
      name.includes("capital") ||
      name.includes("investment") ||
      name.includes("insurance")
    ) {
      return "Financial Services";
    }

    // Technology
    if (
      name.includes("tech") ||
      name.includes("software") ||
      name.includes("systems") ||
      name.includes("data") ||
      name.includes("digital") ||
      name.includes("cyber")
    ) {
      return "Technology";
    }

    // Healthcare
    if (
      name.includes("health") ||
      name.includes("medical") ||
      name.includes("pharma") ||
      name.includes("bio") ||
      name.includes("care")
    ) {
      return "Healthcare";
    }

    // Manufacturing
    if (
      name.includes("manufacturing") ||
      name.includes("industrial") ||
      name.includes("motors") ||
      name.includes("automotive") ||
      name.includes("steel") ||
      name.includes("materials")
    ) {
      return "Manufacturing";
    }

    // Retail
    if (
      name.includes("retail") ||
      name.includes("store") ||
      name.includes("shop") ||
      name.includes("market") ||
      name.includes("commerce")
    ) {
      return "Retail";
    }

    // Energy
    if (
      name.includes("energy") ||
      name.includes("oil") ||
      name.includes("gas") ||
      name.includes("petroleum") ||
      name.includes("electric") ||
      name.includes("power")
    ) {
      return "Energy";
    }

    // Telecommunications
    if (
      name.includes("telecom") ||
      name.includes("wireless") ||
      name.includes("mobile") ||
      name.includes("communications") ||
      name.includes("internet")
    ) {
      return "Telecommunications";
    }

    return "Business Services";
  }

  /**
   * Infer company size from company name
   */
  private inferCompanySizeFromName(companyName: string): string {
    const name = companyName.toLowerCase();

    // Large corporations (banks, major tech, etc.)
    if (
      name.includes("bank") ||
      name.includes("microsoft") ||
      name.includes("google") ||
      name.includes("apple") ||
      name.includes("amazon") ||
      name.includes("meta") ||
      name.includes("corporation") ||
      name.includes("corp") ||
      name.includes("inc")
    ) {
      return "10,000+ employees";
    }

    // Medium-large companies
    if (
      name.includes("systems") ||
      name.includes("solutions") ||
      name.includes("group") ||
      name.includes("international") ||
      name.includes("global")
    ) {
      return "1,000-10,000 employees";
    }

    // Medium companies
    if (
      name.includes("technologies") ||
      name.includes("services") ||
      name.includes("consulting")
    ) {
      return "500-1,000 employees";
    }

    // Default to mid-size
    return "100-500 employees";
  }

  /**
   * Infer industry from domain
   */
  private inferIndustryFromDomain(domain: string): string {
    if (domain.includes(".gov")) return "Government";
    if (domain.includes(".edu")) return "Education";
    if (domain.includes(".org")) return "Non-profit";

    // Check TLD for location/industry hints
    if (domain.endsWith(".bank")) return "Financial Services";
    if (domain.endsWith(".health")) return "Healthcare";
    if (domain.endsWith(".tech")) return "Technology";

    return "Business Services";
  }

  /**
   * Get location from jurisdiction code
   */
  private getLocationFromJurisdiction(jurisdictionCode: string): string {
    const jurisdictions: Record<string, string> = {
      us_ca: "California, USA",
      us_ny: "New York, USA",
      us_tx: "Texas, USA",
      us_fl: "Florida, USA",
      ca_on: "Ontario, Canada",
      ca_bc: "British Columbia, Canada",
      ca_qc: "Quebec, Canada",
      gb: "United Kingdom",
      ie: "Ireland",
      de: "Germany",
      fr: "France",
      au: "Australia",
      sg: "Singapore",
      hk: "Hong Kong",
    };

    return jurisdictions[jurisdictionCode] || jurisdictionCode.toUpperCase();
  }

  private async getFundingInfo(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _companyName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _domain?: string,
  ): Promise<{ data: FundingData; source: EnrichmentSource } | null> {
    // TODO: Implement actual funding data API calls
    return null;
  }

  private async getNewsData(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _companyName: string,
  ): Promise<{ articles: NewsData[]; source: EnrichmentSource } | null> {
    // TODO: Implement actual news API calls
    return null;
  }

  private guessDomain(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .concat(".com");
  }

  private guessWebsite(companyName: string): string {
    return `https://${this.guessDomain(companyName)}`;
  }
}

// Export a singleton instance
export const companyEnrichmentService = new CompanyEnrichmentService();
