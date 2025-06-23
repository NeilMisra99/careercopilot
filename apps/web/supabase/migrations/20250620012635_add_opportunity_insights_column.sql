-- Add opportunity_insights column to applications table for personalized AI insights
ALTER TABLE public.applications 
ADD COLUMN opportunity_insights JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.applications.opportunity_insights IS 'Personalized AI-generated insights comparing job opportunity to user''s resume, including skill matches, growth opportunities, and competitive advantages';

-- Create index for JSONB queries (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_applications_opportunity_insights_gin 
ON public.applications USING gin (opportunity_insights);

-- Create partial index for applications with insights (for faster filtering)
CREATE INDEX IF NOT EXISTS idx_applications_with_insights 
ON public.applications (id) 
WHERE opportunity_insights IS NOT NULL;