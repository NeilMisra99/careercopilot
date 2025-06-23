-- ═══════════════════════════════════════════════════════════════════════════
-- Universal Jobs Table Migration
-- Replaces linkedin_jobs/user_linkedin_jobs with a vendor-agnostic approach
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create universal jobs table (master table for all job postings)
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_vendor TEXT NOT NULL CHECK (source_vendor IN ('linkedin','brightdata','serper','manual')),
  external_job_id TEXT, -- vendor's ID (nullable for Serper)
  fingerprint TEXT UNIQUE NOT NULL, -- md5(company|title|location) for deduplication
  
  -- Core job fields
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  description TEXT,
  job_url TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  
  -- Enhanced fields from scrapers
  salary_json JSONB,
  applicants INTEGER,
  employment_type TEXT,
  experience_level TEXT,
  
  -- UI 2.0 normalized fields
  company_url TEXT,
  company_logo TEXT,
  country_code CHAR(2),
  seniority_level TEXT,
  job_function TEXT,
  industries TEXT[],
  apply_link TEXT,
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency CHAR(3),
  salary_period TEXT,
  
  -- Metadata
  extra_data JSONB, -- raw payload for unknown future fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE (source_vendor, external_job_id) DEFERRABLE INITIALLY DEFERRED
);

-- 2. Create user_jobs junction table (per-user state for any job)
CREATE TABLE public.user_jobs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  discovery_run_id UUID REFERENCES public.job_discovery_runs(id) ON DELETE SET NULL,
  
  -- User state
  status TEXT NOT NULL DEFAULT 'discovered' 
    CHECK (status IN ('discovered','auto_saved','saved','ignored','applied')),
  notes TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_updated_at TIMESTAMPTZ,
  -- Timestamps for audit & trigger compatibility
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (user_id, job_id)
);

-- 3. Indexes for performance
CREATE INDEX idx_jobs_source_vendor ON public.jobs(source_vendor);
CREATE INDEX idx_jobs_fingerprint ON public.jobs(fingerprint);
CREATE INDEX idx_jobs_company ON public.jobs(company);
CREATE INDEX idx_jobs_location ON public.jobs(location);
CREATE INDEX idx_jobs_posted_at ON public.jobs(posted_at DESC);
CREATE INDEX idx_jobs_title_gin ON public.jobs USING gin(to_tsvector('english', title));
CREATE INDEX idx_jobs_description_gin ON public.jobs USING gin(to_tsvector('english', description));

-- UI 2.0 indexes
CREATE INDEX idx_jobs_salary_min ON public.jobs(salary_min);
CREATE INDEX idx_jobs_salary_max ON public.jobs(salary_max);
CREATE INDEX idx_jobs_country_code ON public.jobs(country_code);
CREATE INDEX idx_jobs_industries_gin ON public.jobs USING gin(industries);

-- User jobs indexes
CREATE INDEX idx_user_jobs_user_status ON public.user_jobs(user_id, status);
CREATE INDEX idx_user_jobs_discovered_at ON public.user_jobs(user_id, discovered_at DESC);
CREATE INDEX idx_user_jobs_discovery_run ON public.user_jobs(discovery_run_id);

-- Foreign key covering indexes for optimal query performance
CREATE INDEX idx_user_jobs_user_id_fk ON public.user_jobs(user_id);
CREATE INDEX idx_user_jobs_job_id_fk ON public.user_jobs(job_id);

-- 4. RLS policies
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_jobs ENABLE ROW LEVEL SECURITY;

-- Jobs table: specific policies to avoid overlapping permissions
-- Users can read jobs only if they have an association in user_jobs
CREATE POLICY "Users can read their jobs" ON public.jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_jobs uj
      WHERE uj.job_id = id AND uj.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Service role can insert jobs" ON public.jobs 
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can update jobs" ON public.jobs 
  FOR UPDATE USING ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can delete jobs" ON public.jobs 
  FOR DELETE USING ((select auth.role()) = 'service_role');

-- User jobs: standard user isolation
CREATE POLICY "Users can manage their job associations" ON public.user_jobs 
  FOR ALL USING ((select auth.uid()) = user_id);

-- 5. Updated at triggers
CREATE TRIGGER update_jobs_updated_at 
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_jobs_updated_at 
  BEFORE UPDATE ON public.user_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Helper functions for job management
CREATE OR REPLACE FUNCTION upsert_job(
  p_source_vendor TEXT,
  p_external_job_id TEXT,
  p_fingerprint TEXT,
  p_title TEXT,
  p_company TEXT,
  p_location TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_job_url TEXT DEFAULT NULL,
  p_posted_at TIMESTAMPTZ DEFAULT NULL,
  p_salary_json JSONB DEFAULT NULL,
  p_applicants INTEGER DEFAULT NULL,
  p_employment_type TEXT DEFAULT NULL,
  p_experience_level TEXT DEFAULT NULL,
  p_company_url TEXT DEFAULT NULL,
  p_company_logo TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_seniority_level TEXT DEFAULT NULL,
  p_job_function TEXT DEFAULT NULL,
  p_industries TEXT[] DEFAULT NULL,
  p_apply_link TEXT DEFAULT NULL,
  p_salary_min NUMERIC DEFAULT NULL,
  p_salary_max NUMERIC DEFAULT NULL,
  p_salary_currency TEXT DEFAULT NULL,
  p_salary_period TEXT DEFAULT NULL,
  p_extra_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  job_id UUID;
BEGIN
  INSERT INTO public.jobs (
    source_vendor, external_job_id, fingerprint, title, company, location,
    description, job_url, posted_at, salary_json, applicants, employment_type,
    experience_level, company_url, company_logo, country_code, seniority_level,
    job_function, industries, apply_link, salary_min, salary_max, 
    salary_currency, salary_period, extra_data
  ) VALUES (
    p_source_vendor, p_external_job_id, p_fingerprint, p_title, p_company, p_location,
    p_description, p_job_url, p_posted_at, p_salary_json, p_applicants, p_employment_type,
    p_experience_level, p_company_url, p_company_logo, p_country_code, p_seniority_level,
    p_job_function, p_industries, p_apply_link, p_salary_min, p_salary_max,
    p_salary_currency, p_salary_period, p_extra_data
  )
  ON CONFLICT (fingerprint) 
  DO UPDATE SET
    source_vendor = EXCLUDED.source_vendor,
    external_job_id = EXCLUDED.external_job_id,
    title = EXCLUDED.title,
    company = EXCLUDED.company,
    location = EXCLUDED.location,
    description = EXCLUDED.description,
    job_url = EXCLUDED.job_url,
    posted_at = EXCLUDED.posted_at,
    salary_json = EXCLUDED.salary_json,
    applicants = EXCLUDED.applicants,
    employment_type = EXCLUDED.employment_type,
    experience_level = EXCLUDED.experience_level,
    company_url = EXCLUDED.company_url,
    company_logo = EXCLUDED.company_logo,
    country_code = EXCLUDED.country_code,
    seniority_level = EXCLUDED.seniority_level,
    job_function = EXCLUDED.job_function,
    industries = EXCLUDED.industries,
    apply_link = EXCLUDED.apply_link,
    salary_min = EXCLUDED.salary_min,
    salary_max = EXCLUDED.salary_max,
    salary_currency = EXCLUDED.salary_currency,
    salary_period = EXCLUDED.salary_period,
    extra_data = EXCLUDED.extra_data,
    updated_at = NOW()
  RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;

CREATE OR REPLACE FUNCTION upsert_user_job(
  p_user_id UUID,
  p_job_id UUID,
  p_discovery_run_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'discovered',
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_jobs (
    user_id, job_id, discovery_run_id, status, notes, discovered_at, status_updated_at
  ) VALUES (
    p_user_id, p_job_id, p_discovery_run_id, p_status, p_notes, NOW(), NOW()
  )
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    notes = COALESCE(EXCLUDED.notes, user_jobs.notes),
    status_updated_at = NOW();
    
  RETURN TRUE;
END;
$$;

-- 7. Updated stats function for universal jobs
CREATE OR REPLACE FUNCTION get_job_discovery_stats(p_user_id UUID)
RETURNS TABLE (
  total_jobs BIGINT,
  discovered_jobs BIGINT,
  auto_saved_jobs BIGINT,
  manually_saved_jobs BIGINT,
  applied_jobs BIGINT,
  ignored_jobs BIGINT,
  recent_jobs BIGINT
) 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH job_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('discovered', 'auto_saved', 'saved', 'ignored', 'applied')) as total,
      COUNT(*) FILTER (WHERE status = 'discovered') as discovered,
      COUNT(*) FILTER (WHERE status = 'auto_saved') as auto_saved,
      COUNT(*) FILTER (WHERE status = 'saved') as manually_saved,
      COUNT(*) FILTER (WHERE status = 'applied') as applied,
      COUNT(*) FILTER (WHERE status = 'ignored') as ignored,
      COUNT(*) FILTER (WHERE status IN ('discovered', 'auto_saved', 'saved') AND discovered_at >= NOW() - INTERVAL '7 days') as recent
    FROM public.user_jobs
    WHERE user_id = p_user_id
  ),
  app_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE auto_discovered = true AND opportunity_source IN ('linkedin', 'serper', 'brightdata')) as auto_saved_apps
    FROM public.applications
    WHERE user_id = p_user_id
  )
  SELECT 
    js.total,
    js.discovered,
    GREATEST(js.auto_saved, COALESCE(aps.auto_saved_apps, 0)) as auto_saved_jobs,
    js.manually_saved,
    js.applied,
    js.ignored,
    js.recent
  FROM job_stats js
  CROSS JOIN app_stats aps;
END;
$$;

-- 8. Additional helper functions for backward compatibility and Worker API
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
  job_uuid UUID;
BEGIN
  -- Try to find the job by external_job_id or UUID
  SELECT id INTO job_uuid
  FROM public.jobs 
  WHERE external_job_id = p_job_id OR id::text = p_job_id
  LIMIT 1;
  
  IF job_uuid IS NULL THEN
    -- Try legacy linkedin_jobs table
    UPDATE user_linkedin_jobs 
    SET 
      status = p_status,
      notes = COALESCE(p_notes, notes),
      status_updated_at = NOW()
    WHERE user_id = p_user_id AND job_id = p_job_id;
    
    RETURN FOUND;
  ELSE
    -- Update in universal jobs system
    UPDATE public.user_jobs 
    SET 
      status = p_status,
      notes = COALESCE(p_notes, notes),
      status_updated_at = NOW()
    WHERE user_id = p_user_id AND job_id = job_uuid;
    
    RETURN FOUND;
  END IF;
END;
$$;

-- Drop the old function - no longer needed since scrapers use universal system directly
DROP FUNCTION IF EXISTS create_auto_saved_job(UUID, TEXT, UUID, TEXT);

-- 9. Grant permissions
GRANT EXECUTE ON FUNCTION upsert_job TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION upsert_user_job TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_job_discovery_stats TO authenticated;
GRANT EXECUTE ON FUNCTION update_job_discovery_status TO authenticated, service_role;

-- 10. Comments for documentation
COMMENT ON TABLE public.jobs IS 'Universal jobs table for all job postings from any vendor';
COMMENT ON TABLE public.user_jobs IS 'Per-user state and associations for discovered jobs';
COMMENT ON FUNCTION upsert_job IS 'Safely upsert job data with deduplication by fingerprint';
COMMENT ON FUNCTION upsert_user_job IS 'Associate a user with a job and track their interaction state';



-- 11. Clean up legacy tables and functions

-- Drop legacy helper functions
DROP FUNCTION IF EXISTS public.get_job_discovery_stats_old(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_job_discovery_status_old(UUID, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_auto_saved_job_old(UUID, TEXT, UUID, UUID) CASCADE;

-- Drop legacy tables (this will also drop dependent views and constraints)
DROP TABLE IF EXISTS public.user_linkedin_jobs CASCADE;
DROP TABLE IF EXISTS public.linkedin_jobs CASCADE;

