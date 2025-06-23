import type {
  CompanyEnrichmentInput,
  GroundingMetadata,
} from "@/lib/types/company-enrichment";
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProviderMetadata,
} from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const model = google("gemini-2.0-flash", {
  useSearchGrounding: true,
  dynamicRetrievalConfig: {
    mode: "MODE_DYNAMIC",
    dynamicThreshold: 0.8,
  },
});

// Schema for structured company data extraction
const CompanyDataSchema = z.object({
  companyName: z.string().describe("Official company name"),
  industry: z
    .string()
    .describe(
      "Primary industry (e.g., Financial Services, Technology, Healthcare)",
    ),
  description: z.string().describe("Brief company description (1-2 sentences)"),
  foundedYear: z.number().optional().describe("Year the company was founded"),
  headquarters: z
    .string()
    .optional()
    .describe("Primary headquarters location (City, State/Province, Country)"),
  companySize: z
    .enum([
      "1-10 employees",
      "11-50 employees",
      "51-200 employees",
      "201-500 employees",
      "501-1,000 employees",
      "1,001-5,000 employees",
      "5,001-10,000 employees",
      "10,000+ employees",
    ])
    .describe("Approximate number of employees"),
  website: z.string().optional().describe("Official company website URL"),
  isPublicCompany: z
    .boolean()
    .describe("Whether the company is publicly traded"),
  notableInfo: z
    .array(z.string())
    .max(3)
    .describe(
      "Up to 3 notable facts about the company (recent news, achievements, etc.)",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence level in the accuracy of this information"),
});

export class AICompanyEnrichmentService {
  private readonly model = model;

  /**
   * Enrich company data using AI with web grounding
   */
  async enrichCompany(
    companyName: string,
    domain?: string,
  ): Promise<CompanyEnrichmentInput> {
    try {
      // Use generateText to capture grounding metadata
      const { text, providerMetadata } = await generateText({
        model: this.model,
        prompt: `
Research the company "${companyName}" and provide comprehensive information in the following JSON format:

${domain ? `The company's domain is: ${domain}` : ""}

Return ONLY a valid JSON object with this exact structure:
{
  "companyName": "Official company name",
  "industry": "Primary industry (Financial Services, Technology, Healthcare, Manufacturing, Retail & E-commerce, Energy, Real Estate, Professional Services, Education, Media & Entertainment, Transportation & Logistics, Government & Non-profit, or Other)",
  "description": "Brief company description (1-2 sentences)",
  "foundedYear": 2000,
  "headquarters": "City, State/Province, Country",
  "companySize": "one of: 1-10 employees, 11-50 employees, 51-200 employees, 201-500 employees, 501-1,000 employees, 1,001-5,000 employees, 5,001-10,000 employees, 10,000+ employees",
  "website": "https://company.com",
  "isPublicCompany": true,
  "notableInfo": ["Notable fact 1", "Notable fact 2", "Notable fact 3"],
  "confidence": 0.9
}

Research thoroughly using current, verifiable information. Focus on:
1. Official company name and primary industry
2. Brief description of what the company does
3. When it was founded and where it's headquartered  
4. Approximate company size (number of employees)
5. Whether it's a public or private company
6. Any notable recent information (funding, acquisitions, major news)

Include recent updates from 2023-2024 if available. If unsure about specific details, indicate lower confidence.
        `,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "ai-company-enrichment-with-grounding",
        },
      });

      // Extract grounding metadata
      const groundingMetadata = this.extractGroundingMetadata(providerMetadata);

      // Parse the JSON response
      let aiData: z.infer<typeof CompanyDataSchema>;
      try {
        // Clean the response to extract just the JSON
        // Try multiple approaches to extract valid JSON
        let parsedData: unknown;

        // First, try to parse the entire response as JSON
        try {
          parsedData = JSON.parse(text);
        } catch {
          // If that fails, try to extract JSON between first { and matching }
          let jsonString = "";
          let braceCount = 0;
          let startIndex = -1;

          for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === "{") {
              if (startIndex === -1) {
                startIndex = i;
              }
              braceCount++;
            } else if (char === "}") {
              braceCount--;

              if (braceCount === 0 && startIndex !== -1) {
                jsonString = text.substring(startIndex, i + 1);
                break;
              }
            }
          }

          if (jsonString) {
            parsedData = JSON.parse(jsonString);
          } else {
            // Final fallback: use regex but clean it
            const jsonMatch = text.match(/\{[\s\S]*?\}/);
            const matchedString = jsonMatch ? jsonMatch[0] : text;
            parsedData = JSON.parse(matchedString);
          }
        }

        aiData = CompanyDataSchema.parse(parsedData);
      } catch (parseError) {
        console.warn(
          "Failed to parse AI response as JSON, falling back to structured generation:",
          parseError,
        );
        console.warn("Raw AI response:", text.substring(0, 500) + "...");

        // Fallback to generateObject if JSON parsing fails
        const fallbackResult = await generateObject({
          model: this.model,
          schema: CompanyDataSchema,
          prompt: `Research "${companyName}" and provide accurate company information.`,
        });
        aiData = fallbackResult.object;
      }

      const normalizedName = companyName.toLowerCase().trim();

      const enrichmentData: CompanyEnrichmentInput = {
        companyName: aiData.companyName,
        normalizedName,
        domain: domain || this.extractDomainFromWebsite(aiData.website),
        logoUrl: undefined, // We'll still get logos separately for reliability
        description: aiData.description,
        industry: aiData.industry,
        companySize: aiData.companySize,
        foundedYear: aiData.foundedYear,
        headquarters: aiData.headquarters,
        website: aiData.website,
        linkedinUrl: undefined, // Can be inferred later
        fundingInfo: undefined, // Could extract from notableInfo
        newsData: aiData.notableInfo.map((info) => ({
          title: "Notable Information",
          summary: info,
          publishedAt: new Date().toISOString(),
          source: "AI Research with Web Grounding",
          sentiment: "neutral" as const,
        })),
        confidenceScore: aiData.confidence,
        dataSources: [
          {
            provider: "ai_research" as const,
            fields: Object.keys(aiData).filter(
              (key) => aiData[key as keyof typeof aiData] !== undefined,
            ),
            confidence: aiData.confidence,
            retrievedAt: new Date().toISOString(),
          },
        ],
        lastEnrichedAt: new Date().toISOString(),
        groundingMetadata,
      };

      return enrichmentData;
    } catch (error) {
      console.error("AI company enrichment failed:", error);

      // Return minimal fallback data
      return {
        companyName,
        normalizedName: companyName.toLowerCase().trim(),
        domain: domain || this.guessDomain(companyName),
        confidenceScore: 0.1,
        dataSources: [],
        lastEnrichedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Quick enrichment for real-time use (faster, less detailed)
   */
  async enrichQuick(companyName: string): Promise<{
    companyName: string;
    industry?: string;
    description?: string;
    logoUrl?: string;
    confidence: number;
    groundingMetadata?: GroundingMetadata;
  }> {
    try {
      const { text, providerMetadata } = await generateText({
        model: this.model,
        prompt: `Quickly research "${companyName}" and provide ONLY this JSON format:
{
  "industry": "Primary industry",
  "description": "Brief description (max 150 characters)",
  "confidence": 0.9
}

Focus on speed and accuracy. Return only the JSON object.`,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "ai-company-quick-enrichment-with-grounding",
        },
      });

      // Extract grounding metadata
      const groundingMetadata = this.extractGroundingMetadata(providerMetadata);

      // Parse response
      let result: unknown;
      try {
        // First, try to parse the entire response as JSON
        result = JSON.parse(text);
      } catch {
        // If that fails, try to extract JSON between first { and matching }
        let jsonString = "";
        let braceCount = 0;
        let startIndex = -1;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];

          if (char === "{") {
            if (startIndex === -1) {
              startIndex = i;
            }
            braceCount++;
          } else if (char === "}") {
            braceCount--;

            if (braceCount === 0 && startIndex !== -1) {
              jsonString = text.substring(startIndex, i + 1);
              break;
            }
          }
        }

        if (jsonString) {
          result = JSON.parse(jsonString);
        } else {
          // Final fallback: use regex but clean it
          const jsonMatch = text.match(/\{[\s\S]*?\}/);
          const matchedString = jsonMatch ? jsonMatch[0] : text;
          result = JSON.parse(matchedString);
        }
      }

      const parsedResult = result as {
        industry?: string;
        description?: string;
        confidence?: number;
      };

      return {
        companyName,
        industry: parsedResult.industry,
        description: parsedResult.description,
        confidence: parsedResult.confidence || 0.5,
        groundingMetadata,
      };
    } catch (error) {
      console.error("Quick AI enrichment failed:", error);
      return {
        companyName,
        confidence: 0.1,
      };
    }
  }

  /**
   * Extract grounding metadata from Google provider metadata
   */
  private extractGroundingMetadata(
    providerMetadata: Record<string, unknown> | undefined,
  ): GroundingMetadata | undefined {
    try {
      const metadata = providerMetadata?.google as
        | GoogleGenerativeAIProviderMetadata
        | undefined;

      if (!metadata?.groundingMetadata) {
        return undefined;
      }

      const grounding = metadata.groundingMetadata;

      return {
        webSearchQueries: grounding.webSearchQueries || [],
        searchEntryPoint: grounding.searchEntryPoint
          ? {
              renderedContent: grounding.searchEntryPoint.renderedContent,
            }
          : undefined,
        groundingSupports:
          grounding.groundingSupports
            ?.map((support) => ({
              segment:
                support.segment &&
                typeof support.segment.startIndex === "number" &&
                typeof support.segment.endIndex === "number" &&
                typeof support.segment.text === "string"
                  ? {
                      startIndex: support.segment.startIndex,
                      endIndex: support.segment.endIndex,
                      text: support.segment.text,
                    }
                  : undefined,
              groundingChunkIndices: support.groundingChunkIndices || [],
              confidenceScores: support.confidenceScores || [],
            }))
            .filter((support) => support.segment !== undefined) || [],
        retrievalQueries: grounding.retrievalQueries || [],
      };
    } catch (error) {
      console.warn("Failed to extract grounding metadata:", error);
      return undefined;
    }
  }

  private extractDomainFromWebsite(website?: string): string | undefined {
    if (!website) return undefined;
    try {
      const url = new URL(
        website.startsWith("http") ? website : `https://${website}`,
      );
      return url.hostname.replace("www.", "");
    } catch {
      return undefined;
    }
  }

  private guessDomain(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .concat(".com");
  }
}

// Export singleton
export const aiCompanyEnrichmentService = new AICompanyEnrichmentService();
