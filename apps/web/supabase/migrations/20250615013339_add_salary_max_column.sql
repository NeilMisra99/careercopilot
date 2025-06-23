-- Add missing columns to user_job_discovery_preferences table
-- These columns were missing from the original schema but are needed by the frontend and backend

-- Add salary_max column (was dropped in enhancement migration)
ALTER TABLE public.user_job_discovery_preferences 
ADD COLUMN IF NOT EXISTS salary_max INTEGER;

-- Add experience_levels array column (frontend expects array, not singular experience_level)
ALTER TABLE public.user_job_discovery_preferences 
ADD COLUMN IF NOT EXISTS experience_levels TEXT[] DEFAULT '{}';

-- Add auto_save_discovered_jobs column (different from auto_discovery_enabled)
ALTER TABLE public.user_job_discovery_preferences 
ADD COLUMN IF NOT EXISTS auto_save_discovered_jobs BOOLEAN DEFAULT false;

-- Add comments for clarity
COMMENT ON COLUMN public.user_job_discovery_preferences.salary_max IS 'Maximum salary expectation for job discovery';
COMMENT ON COLUMN public.user_job_discovery_preferences.salary_min IS 'Minimum salary expectation for job discovery';
COMMENT ON COLUMN public.user_job_discovery_preferences.experience_levels IS 'Array of experience levels: ["entry", "mid-senior", "director"]';
COMMENT ON COLUMN public.user_job_discovery_preferences.auto_save_discovered_jobs IS 'Whether to automatically save discovered jobs as applications (premium feature)';

-- Add indexes for enhanced deduplication performance
CREATE INDEX IF NOT EXISTS idx_applications_deduplication_lookup 
ON public.applications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_company_role_location 
ON public.applications(user_id, company_name, role, location);