-- Add enrichment type tracking to company_enrichment table
-- This allows us to explicitly track whether quick or comprehensive enrichment was performed

ALTER TABLE public.company_enrichment 
ADD COLUMN IF NOT EXISTS enrichment_type TEXT CHECK (enrichment_type IN ('quick', 'comprehensive')) DEFAULT 'quick',
ADD COLUMN IF NOT EXISTS quick_enriched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS comprehensive_enriched_at TIMESTAMPTZ;

-- Backfill existing data as 'quick' enrichment
UPDATE public.company_enrichment 
SET enrichment_type = 'quick', 
    quick_enriched_at = last_enriched_at
WHERE enrichment_type IS NULL;

-- Make enrichment_type NOT NULL after backfill
ALTER TABLE public.company_enrichment 
ALTER COLUMN enrichment_type SET NOT NULL;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_company_enrichment_type ON public.company_enrichment(enrichment_type, last_enriched_at);
CREATE INDEX IF NOT EXISTS idx_company_enrichment_comprehensive ON public.company_enrichment(normalized_name, comprehensive_enriched_at) WHERE comprehensive_enriched_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.company_enrichment.enrichment_type IS 'Type of enrichment: quick (basic data) or comprehensive (full data with funding, news, etc.)';
COMMENT ON COLUMN public.company_enrichment.quick_enriched_at IS 'Timestamp when quick enrichment was last performed';
COMMENT ON COLUMN public.company_enrichment.comprehensive_enriched_at IS 'Timestamp when comprehensive enrichment was last performed';