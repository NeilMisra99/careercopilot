// Core types for company enrichment feature
export interface CompanyEnrichmentData {
  id: string;
  companyName: string;
  normalizedName: string;
  domain?: string;
  logoUrl?: string;
  description?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  headquarters?: string;
  website?: string;
  linkedinUrl?: string;
  fundingInfo?: FundingData;
  newsData?: NewsData[];
  confidenceScore: number;
  dataSources: EnrichmentSource[];
  lastEnrichedAt: string;
  createdAt: string;
  updatedAt: string;
  // New grounding metadata for AI-generated content
  groundingMetadata?: GroundingMetadata;
}

// Enrichment data before database save (database-generated fields are optional)
export interface CompanyEnrichmentInput {
  companyName: string;
  normalizedName: string;
  domain?: string;
  logoUrl?: string;
  description?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  headquarters?: string;
  website?: string;
  linkedinUrl?: string;
  fundingInfo?: FundingData;
  newsData?: NewsData[];
  confidenceScore: number;
  dataSources: EnrichmentSource[];
  lastEnrichedAt: string;
  // New grounding metadata for AI-generated content
  groundingMetadata?: GroundingMetadata;
}

// Quick enrichment data for real-time use (essential data only)
export interface QuickEnrichmentData {
  companyName: string;
  normalizedName: string;
  domain?: string;
  logoUrl?: string;
  website?: string;
  description?: string;
  industry?: string;
  confidenceScore: number;
  dataSources: EnrichmentSource[];
  cached: boolean;
  responseTime: number; // milliseconds
  // New grounding metadata for AI-generated content
  groundingMetadata?: GroundingMetadata;
}

export interface FundingData {
  totalFunding?: string;
  lastRound?: {
    type: string;
    amount: string;
    date: string;
    investors: string[];
  };
  valuation?: string;
  fundingHistory?: {
    type: string;
    amount: string;
    date: string;
    investors: string[];
  }[];
}

export interface NewsData {
  title: string;
  summary: string;
  publishedAt: string;
  source: string;
  sentiment?: "positive" | "negative" | "neutral";
  url?: string;
}

export interface EnrichmentSource {
  provider:
    | "clearbit"
    | "opencorporates"
    | "coresignal"
    | "newsdata"
    | "uplead"
    | "intellizence"
    | "google"
    | "duckduckgo"
    | "direct"
    | "multi_source"
    | "linkedin"
    | "domain_analysis"
    | "inference"
    | "ai_research";
  fields: string[];
  confidence: number;
  retrievedAt: string;
}

// API request/response types
export interface EnrichmentRequest {
  companyName: string;
  domain?: string;
  forceRefresh?: boolean;
  priority?: "high" | "medium" | "low";
}

// Quick enrichment request (for real-time use)
export interface QuickEnrichmentRequest {
  companyName: string;
  domain?: string;
  includeFields?: ("logo" | "domain" | "description" | "industry")[];
  timeoutMs?: number; // Max time to wait for response
}

export interface EnrichmentResponse {
  success: boolean;
  data?: CompanyEnrichmentData;
  error?: string;
  cached?: boolean;
  sourceErrors?: { provider: string; error: string }[];
}

// Quick enrichment response
export interface QuickEnrichmentResponse {
  success: boolean;
  data?: QuickEnrichmentData;
  error?: string;
  cached?: boolean;
  partial?: boolean; // Some data sources may have failed
  sourceErrors?: { provider: string; error: string }[];
}

// Batch enrichment types
export interface BatchEnrichmentRequest {
  applications: { id: string; companyName: string }[];
  batchSize?: number;
  priorityCompanies?: string[];
}

export interface BatchEnrichmentResponse {
  success: boolean;
  enrichedCount: number;
  failedCount: number;
  taskIds?: string[];
  errors?: { applicationId: string; error: string }[];
}

// Quality scoring
export interface EnrichmentQuality {
  completeness: number; // 0-1
  reliability: number; // 0-1
  freshness: number; // 0-1
  consistency: number; // 0-1
  overallScore: number; // 0-1
}

// Rate limiting
export interface ProviderQuota {
  provider: string;
  dailyLimit: number;
  currentUsage: number;
  resetTime: string;
}

// Worker integration types
export interface WorkerEnrichmentPayload {
  companyName: string;
  applicationIds?: string[];
  priority?: "high" | "medium" | "low";
  forceRefresh?: boolean;
  comprehensive?: boolean; // Flag for full vs quick enrichment
}

export interface WorkerEnrichmentResult {
  success: boolean;
  companyEnrichmentId?: string;
  enrichmentData?: CompanyEnrichmentData | QuickEnrichmentData;
  errors?: string[];
  apiUsage?: { provider: string; callsUsed: number }[];
  responseTime?: number;
  cached?: boolean;
}

// Database types for applications
export type EnrichmentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export interface ApplicationWithEnrichment {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  enriched_company_id?: string;
  enrichment_status: EnrichmentStatus;
  enrichment_last_attempted_at?: string;
  // Joined enrichment data
  enrichment?: CompanyEnrichmentData;
}

// Google Generative AI grounding metadata types
export interface GroundingMetadata {
  webSearchQueries?: string[];
  searchEntryPoint?: {
    renderedContent?: string;
  };
  groundingSupports?: GroundingSupport[];
  retrievalQueries?: string[];
}

export interface GroundingSupport {
  segment?: {
    startIndex: number;
    endIndex: number;
    text: string;
  };
  groundingChunkIndices?: number[];
  confidenceScores?: number[];
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}
