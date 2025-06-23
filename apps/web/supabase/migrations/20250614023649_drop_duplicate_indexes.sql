-- Fix Duplicate Indexes
-- Remove duplicate indexes that were created both manually and automatically by foreign key constraints

-- ❶ Fix discovered_jobs_staging table duplicates
-- Keep the manually created index, drop the foreign key auto-generated one
DROP INDEX IF EXISTS public.idx_discovered_jobs_staging_discovery_run_id_fk;

-- ❷ Fix linkedin_scrape_runs table duplicates  
-- Keep the manually created index, drop the foreign key auto-generated one
DROP INDEX IF EXISTS public.idx_linkedin_scrape_runs_user_id_fk;

-- ❸ Fix user_job_discovery_preferences table duplicates
-- Keep the manually created index, drop the foreign key auto-generated one
DROP INDEX IF EXISTS public.idx_user_job_discovery_preferences_user_id_fk;

-- ❹ Fix user_linkedin_jobs table duplicates
-- Keep the manually created indexes, drop the foreign key auto-generated ones
DROP INDEX IF EXISTS public.idx_user_linkedin_jobs_job_id_fk;
DROP INDEX IF EXISTS public.idx_user_linkedin_jobs_scrape_run_id_fk;

-- Note: We keep the manually created indexes because they often have better naming
-- and may have additional conditions or ordering that the auto-generated ones don't have 

-- Drop duplicate indexes that were created in multiple migrations
DROP INDEX IF EXISTS idx_user_email_integrations_user_id;
DROP INDEX IF EXISTS idx_user_linkedin_jobs_user_id;
DROP INDEX IF EXISTS idx_user_linkedin_jobs_job_id;
DROP INDEX IF EXISTS idx_user_linkedin_jobs_scrape_run_id;
DROP INDEX IF EXISTS idx_application_resume_matches_user_id;
DROP INDEX IF EXISTS idx_resume_recommendations_user_id;
DROP INDEX IF EXISTS idx_resume_recommendations_resume_id;
DROP INDEX IF EXISTS idx_resume_recommendations_application_id;
DROP INDEX IF EXISTS idx_job_discovery_runs_user_id;
DROP INDEX IF EXISTS idx_discovered_jobs_staging_discovery_run_id;
DROP INDEX IF EXISTS idx_discovered_jobs_staging_user_id;

-- Add auto-save feature for discovered jobs
-- This enables Pro/Executive users to automatically save discovered jobs to applications

-- Add auto_save_discovered_jobs column to user preferences
ALTER TABLE public.user_job_discovery_preferences 
ADD COLUMN IF NOT EXISTS auto_save_discovered_jobs BOOLEAN DEFAULT false;

-- Set default to true for Pro and Executive users
UPDATE public.user_job_discovery_preferences 
SET auto_save_discovered_jobs = true 
WHERE user_id IN (
  SELECT id FROM public.profiles 
  WHERE subscription_tier IN ('pro', 'executive')
);

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_job_discovery_preferences_auto_save 
ON public.user_job_discovery_preferences(user_id, auto_save_discovered_jobs) 
WHERE auto_save_discovered_jobs = true;

-- Add auto_discovered column to applications table to track auto-discovered jobs
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN DEFAULT false;

-- Add index for efficient querying of auto-discovered applications
CREATE INDEX IF NOT EXISTS idx_applications_auto_discovered 
ON public.applications(user_id, auto_discovered) 
WHERE auto_discovered = true;

-- Add comment for documentation
COMMENT ON COLUMN public.applications.auto_discovered IS 'Indicates if this application was automatically created from job discovery';
COMMENT ON COLUMN public.user_job_discovery_preferences.auto_save_discovered_jobs IS 'Enables automatic saving of discovered jobs to applications for premium users'; 