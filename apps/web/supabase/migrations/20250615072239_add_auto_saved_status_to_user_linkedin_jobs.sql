-- ═══════════════════════════════════════════════════════════════════════════
-- Add 'auto_saved' status to user_linkedin_jobs for better job discovery tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. First, drop the existing CHECK constraint
ALTER TABLE public.user_linkedin_jobs DROP CONSTRAINT IF EXISTS user_linkedin_jobs_status_check;

-- 2. Add the new CHECK constraint with 'auto_saved' included
ALTER TABLE public.user_linkedin_jobs ADD CONSTRAINT user_linkedin_jobs_status_check 
CHECK (status IN ('discovered', 'saved', 'ignored', 'applied', 'auto_saved'));

-- 3. Add index for the new status to optimize queries
CREATE INDEX IF NOT EXISTS idx_user_linkedin_jobs_auto_saved 
ON public.user_linkedin_jobs(user_id, status) 
WHERE status = 'auto_saved';

-- 4. Add composite index for discovery stats queries
CREATE INDEX IF NOT EXISTS idx_user_linkedin_jobs_discovery_stats 
ON public.user_linkedin_jobs(user_id, status, discovered_at);

-- 5. Update existing 'saved' records to 'auto_saved' where they were auto-discovered
-- This identifies jobs that were automatically saved based on auto_discovered flag in applications
UPDATE public.user_linkedin_jobs 
SET status = 'auto_saved', status_updated_at = NOW()
WHERE status = 'saved' 
  AND job_id IN (
    SELECT DISTINCT lj.job_id 
    FROM public.linkedin_jobs lj
    JOIN public.applications a ON (
      LOWER(a.company_name) = LOWER(lj.company) 
      AND LOWER(a.role) = LOWER(lj.title)
      AND a.auto_discovered = true
      AND a.opportunity_source = 'linkedin'
    )
  );

-- 6. Create function to get comprehensive job discovery stats
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
    FROM public.user_linkedin_jobs
    WHERE user_id = p_user_id
  ),
  app_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE auto_discovered = true AND opportunity_source IN ('linkedin', 'serper')) as auto_saved_apps
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

-- 7. Create function to update job status with proper auto-save detection
CREATE OR REPLACE FUNCTION update_job_discovery_status(
  p_user_id UUID,
  p_job_id TEXT,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  valid_statuses TEXT[] := ARRAY['discovered', 'saved', 'ignored', 'applied', 'auto_saved'];
BEGIN
  -- Validate status
  IF p_status != ALL(valid_statuses) THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: %', p_status, array_to_string(valid_statuses, ', ');
  END IF;

  -- Update the job status
  UPDATE public.user_linkedin_jobs 
  SET 
    status = p_status,
    notes = COALESCE(p_notes, notes),
    status_updated_at = NOW()
  WHERE user_id = p_user_id AND job_id = p_job_id;

  -- Return true if a row was updated
  RETURN FOUND;
END;
$$;

-- 8. Create function to handle auto-saved job creation
CREATE OR REPLACE FUNCTION create_auto_saved_job(
  p_user_id UUID,
  p_job_id TEXT,
  p_scrape_run_id UUID,
  p_application_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert or update the user_linkedin_jobs record with auto_saved status
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

  RETURN TRUE;
END;
$$;

-- 9. Add helpful comments for future reference
COMMENT ON FUNCTION get_job_discovery_stats(UUID) IS 'Returns comprehensive job discovery statistics for a user, including auto-saved vs manually saved jobs';
COMMENT ON FUNCTION update_job_discovery_status(UUID, TEXT, TEXT, TEXT) IS 'Updates job discovery status with validation and proper timestamp handling';
COMMENT ON FUNCTION create_auto_saved_job(UUID, TEXT, UUID, TEXT) IS 'Creates or updates a job record with auto_saved status for premium auto-save feature';

-- 10. Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_job_discovery_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_job_discovery_status(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_auto_saved_job(UUID, TEXT, UUID, TEXT) TO service_role;
