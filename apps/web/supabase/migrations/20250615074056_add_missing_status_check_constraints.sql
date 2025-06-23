-- ═══════════════════════════════════════════════════════════════════════════
-- Add Missing CHECK Constraints for Status Columns
-- ═══════════════════════════════════════════════════════════════════════════
-- This migration adds CHECK constraints for status columns that are missing them
-- based on actual usage patterns found in the codebase.

-- SECURITY DEFINER ANALYSIS:
-- The functions in this migration do NOT use SECURITY DEFINER because:
-- 1. They are called from service role contexts (Trigger.dev tasks, Workers)
-- 2. Service role already has full database privileges
-- 3. No RLS bypass needed since callers have sufficient permissions
-- 4. Following principle of least privilege - avoid unnecessary privilege escalation

-- 1. Add CHECK constraint for resumes.parsing_status
-- Used values: 'pending', 'processing', 'completed', 'failed'
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_parsing_status_check;
ALTER TABLE public.resumes ADD CONSTRAINT resumes_parsing_status_check 
CHECK (parsing_status IN ('pending', 'processing', 'completed', 'failed'));

-- 2. Add CHECK constraint for user_email_integrations.sync_status  
-- Used values: 'active', 'error', 'disabled', 'paused', 'revoked'
ALTER TABLE public.user_email_integrations DROP CONSTRAINT IF EXISTS user_email_integrations_sync_status_check;
ALTER TABLE public.user_email_integrations ADD CONSTRAINT user_email_integrations_sync_status_check 
CHECK (sync_status IN ('active', 'error', 'disabled', 'paused', 'revoked'));

-- 3. Add CHECK constraint for applications.enrichment_status
-- Used values: 'pending', 'processing', 'completed', 'failed', 'skipped'
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_enrichment_status_check;
ALTER TABLE public.applications ADD CONSTRAINT applications_enrichment_status_check 
CHECK (enrichment_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- 4. Update user_linkedin_jobs status constraint to include 'auto_saved'
-- Used values: 'discovered', 'saved', 'ignored', 'applied', 'auto_saved'
ALTER TABLE public.user_linkedin_jobs DROP CONSTRAINT IF EXISTS user_linkedin_jobs_status_check;
ALTER TABLE public.user_linkedin_jobs ADD CONSTRAINT user_linkedin_jobs_status_check 
CHECK (status IN ('discovered', 'saved', 'ignored', 'applied', 'auto_saved'));

-- 5. Add CHECK constraint for linkedin_scrape_runs.status
-- Used values: 'running', 'completed', 'error', 'cancelled'
ALTER TABLE public.linkedin_scrape_runs DROP CONSTRAINT IF EXISTS linkedin_scrape_runs_status_check;
ALTER TABLE public.linkedin_scrape_runs ADD CONSTRAINT linkedin_scrape_runs_status_check 
CHECK (status IN ('running', 'completed', 'error', 'cancelled'));

-- 6. Fix the database function to use TEXT instead of non-existent enum
CREATE OR REPLACE FUNCTION update_job_discovery_status(
  p_user_id UUID,
  p_job_id TEXT,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Validate status value
  IF p_status NOT IN ('discovered', 'saved', 'ignored', 'applied', 'auto_saved') THEN
    RAISE EXCEPTION 'Invalid status value: %', p_status;
  END IF;

  -- Update user_linkedin_jobs record
  UPDATE public.user_linkedin_jobs 
  SET 
    status = p_status,
    notes = p_notes,
    status_updated_at = NOW()
  WHERE user_id = p_user_id AND job_id = p_job_id;

  -- Check if any rows were updated
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  RETURN v_updated > 0;
END;
$$;

-- 7. Fix the create_auto_saved_job function to use TEXT instead of enum
CREATE OR REPLACE FUNCTION create_auto_saved_job(
  p_user_id UUID,
  p_job_id TEXT,
  p_scrape_run_id BIGINT,
  p_application_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_success BOOLEAN := FALSE;
BEGIN
  -- Create or update user_linkedin_jobs record with auto_saved status
  INSERT INTO public.user_linkedin_jobs (
    user_id,
    job_id,
    scrape_run_id,
    status,
    discovered_at,
    status_updated_at
  ) VALUES (
    p_user_id,
    p_job_id,
    p_scrape_run_id,
    'auto_saved',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, job_id) 
  DO UPDATE SET
    status = 'auto_saved',
    status_updated_at = NOW();

  GET DIAGNOSTICS v_success = ROW_COUNT;
  
  RETURN v_success > 0;
END;
$$;

-- 8. Add indexes for performance on status columns
CREATE INDEX IF NOT EXISTS idx_resumes_parsing_status 
ON public.resumes(parsing_status) 
WHERE parsing_status IN ('processing', 'pending');

CREATE INDEX IF NOT EXISTS idx_user_email_integrations_sync_status 
ON public.user_email_integrations(sync_status) 
WHERE sync_status = 'active';

CREATE INDEX IF NOT EXISTS idx_applications_enrichment_status 
ON public.applications(enrichment_status) 
WHERE enrichment_status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_linkedin_scrape_runs_status 
ON public.linkedin_scrape_runs(status) 
WHERE status = 'running';

-- 9. Add comments for documentation
COMMENT ON CONSTRAINT resumes_parsing_status_check ON public.resumes IS 
'Ensures parsing_status is one of: pending, processing, completed, failed';

COMMENT ON CONSTRAINT user_email_integrations_sync_status_check ON public.user_email_integrations IS 
'Ensures sync_status is one of: active, error, disabled, paused, revoked';

COMMENT ON CONSTRAINT applications_enrichment_status_check ON public.applications IS 
'Ensures enrichment_status is one of: pending, processing, completed, failed, skipped';

COMMENT ON CONSTRAINT user_linkedin_jobs_status_check ON public.user_linkedin_jobs IS 
'Ensures status is one of: discovered, saved, ignored, applied, auto_saved';

COMMENT ON CONSTRAINT linkedin_scrape_runs_status_check ON public.linkedin_scrape_runs IS 
'Ensures status is one of: running, completed, error, cancelled';

-- 9. Add Phase 2: Maximum Bright Data Intelligence fields
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS opportunity_score INTEGER,
ADD COLUMN IF NOT EXISTS opportunity_reasoning TEXT[],
ADD COLUMN IF NOT EXISTS market_intelligence JSONB,
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS discovery_source TEXT,
ADD COLUMN IF NOT EXISTS search_keywords TEXT,
ADD COLUMN IF NOT EXISTS salary_json JSONB,
ADD COLUMN IF NOT EXISTS employment_type TEXT,
ADD COLUMN IF NOT EXISTS experience_level TEXT,
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS applicants INTEGER;

-- Add indexes for opportunity intelligence queries
CREATE INDEX IF NOT EXISTS idx_applications_opportunity_score 
ON public.applications(user_id, opportunity_score DESC) 
WHERE opportunity_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_golden_opportunities 
ON public.applications(user_id, created_at DESC) 
WHERE (market_intelligence->>'golden_opportunity')::boolean = true;

CREATE INDEX IF NOT EXISTS idx_applications_competition_level 
ON public.applications(user_id, (market_intelligence->>'competition_level')) 
WHERE market_intelligence IS NOT NULL;

-- Additional indexes for Phase 2 enhanced discovery
CREATE INDEX IF NOT EXISTS idx_applications_discovery_source 
ON public.applications(user_id, discovery_source) 
WHERE discovery_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_posted_at 
ON public.applications(user_id, posted_at DESC) 
WHERE posted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_applicants 
ON public.applications(user_id, applicants ASC) 
WHERE applicants IS NOT NULL;

-- Add comments for the new fields
COMMENT ON COLUMN public.applications.opportunity_score IS 'Phase 2: Opportunity score (0-100) calculated from Bright Data intelligence';
COMMENT ON COLUMN public.applications.opportunity_reasoning IS 'Phase 2: Array of reasoning strings explaining the opportunity score';
COMMENT ON COLUMN public.applications.market_intelligence IS 'Phase 2: Market intelligence JSON containing salary_percentile, competition_level, urgency_level, seniority_alignment, golden_opportunity';
COMMENT ON COLUMN public.applications.source_type IS 'Phase 2: Source type for auto-discovered opportunities (e.g., job_discovery)';
COMMENT ON COLUMN public.applications.discovery_source IS 'Phase 2: Discovery source vendor (brightdata, linkedin, serper)';
COMMENT ON COLUMN public.applications.search_keywords IS 'Phase 2: Keywords used to discover this opportunity';
COMMENT ON COLUMN public.applications.salary_json IS 'Phase 2: Structured salary data from Bright Data (JSON format)';
COMMENT ON COLUMN public.applications.employment_type IS 'Phase 2: Employment type from job posting (Full-time, Contract, etc.)';
COMMENT ON COLUMN public.applications.experience_level IS 'Phase 2: Experience level from job posting (Entry level, Mid-Senior, etc.)';
COMMENT ON COLUMN public.applications.posted_at IS 'Phase 2: Job posting date from source';
COMMENT ON COLUMN public.applications.applicants IS 'Phase 2: Number of applicants from Bright Data';

-- 10. Update discovery_source constraint to include new vendors
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_discovery_source_check;
ALTER TABLE public.applications ADD CONSTRAINT applications_discovery_source_check 
CHECK (discovery_source IN ('linkedin', 'serper', 'brightdata', 'serper_web', 'manual', 'email_sync'));

COMMENT ON CONSTRAINT applications_discovery_source_check ON public.applications IS 'Ensures discovery_source is one of: linkedin, brightdata, serper, serper_web, manual, email_sync';
