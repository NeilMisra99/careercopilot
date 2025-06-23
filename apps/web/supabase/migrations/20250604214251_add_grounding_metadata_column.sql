-- Add grounding metadata column to company enrichment table
ALTER TABLE public.company_enrichment
ADD COLUMN grounding_metadata JSONB;
 
-- Add comment for the new column
COMMENT ON COLUMN public.company_enrichment.grounding_metadata IS 'Google Generative AI grounding metadata including web search queries and grounding supports.'; 