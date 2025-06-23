-- Create company enrichment cache table
CREATE TABLE public.company_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE, -- For deduplication - MUST be unique for upsert conflicts
  domain TEXT,
  logo_url TEXT,
  description TEXT,
  industry TEXT,
  company_size TEXT,
  founded_year INTEGER,
  headquarters TEXT,
  website TEXT,
  linkedin_url TEXT,
  funding_info JSONB, -- Store funding rounds, investors, etc.
  news_data JSONB, -- Recent news and updates
  confidence_score DECIMAL(3,2), -- Overall data confidence (0-1)
  data_sources JSONB, -- Track which APIs provided which data
  last_enriched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for efficient lookups (normalized_name already has unique constraint)
CREATE INDEX idx_company_enrichment_domain ON public.company_enrichment(domain);
CREATE INDEX idx_company_enrichment_last_enriched ON public.company_enrichment(last_enriched_at);

-- Add enrichment tracking fields to applications table
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS enriched_company_id UUID REFERENCES public.company_enrichment(id),
ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
ADD COLUMN IF NOT EXISTS enrichment_last_attempted_at TIMESTAMPTZ;

-- Add indexes for enrichment tracking
CREATE INDEX IF NOT EXISTS idx_applications_enriched_company_id ON public.applications(enriched_company_id);
CREATE INDEX IF NOT EXISTS idx_applications_enrichment_status ON public.applications(enrichment_status);

-- Set up Row Level Security (RLS) for company_enrichment
ALTER TABLE public.company_enrichment ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_enrichment table
-- Company enrichment data should be accessible to all authenticated users
-- since multiple users may work at the same company or look up the same companies

-- Allow authenticated users to read all company enrichment data
CREATE POLICY "company_enrichment_read_policy" ON public.company_enrichment
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert new company enrichment data
CREATE POLICY "company_enrichment_insert_policy" ON public.company_enrichment
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update existing company enrichment data
-- (for refreshing stale data)
CREATE POLICY "company_enrichment_update_policy" ON public.company_enrichment
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow service role full access (for background tasks)
CREATE POLICY "company_enrichment_service_role_policy" ON public.company_enrichment
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER handle_updated_at_company_enrichment 
  BEFORE UPDATE ON public.company_enrichment
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- Add comments
COMMENT ON TABLE public.company_enrichment IS 'Stores enriched company data from various APIs to enhance job applications.';
COMMENT ON COLUMN public.company_enrichment.normalized_name IS 'Normalized company name for deduplication and matching.';
COMMENT ON COLUMN public.company_enrichment.confidence_score IS 'Overall confidence score (0-1) based on data quality and source reliability.';
COMMENT ON COLUMN public.company_enrichment.data_sources IS 'JSON array tracking which APIs provided which data fields.';
COMMENT ON COLUMN public.applications.enriched_company_id IS 'References enriched company data if available.';
COMMENT ON COLUMN public.applications.enrichment_status IS 'Status of company enrichment process for this application.';
