-- Job Discovery Enhancements for Phase 1 Implementation
-- Add missing fields needed by universal-job-discovery.ts

-- ❶ Add missing fields to user_job_discovery_preferences
ALTER TABLE public.user_job_discovery_preferences 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS remote_preference TEXT DEFAULT 'any' CHECK (remote_preference IN ('remote_only', 'hybrid', 'on_site', 'any')),
ADD COLUMN IF NOT EXISTS excluded_keywords TEXT[] DEFAULT '{}';

-- ❷ Rename and enhance some existing columns for consistency
ALTER TABLE public.user_job_discovery_preferences ALTER COLUMN keywords DROP NOT NULL;
ALTER TABLE public.user_job_discovery_preferences ALTER COLUMN salary_range_min TYPE INTEGER USING salary_range_min::INTEGER;
ALTER TABLE public.user_job_discovery_preferences RENAME COLUMN salary_range_min TO salary_min;
ALTER TABLE public.user_job_discovery_preferences DROP COLUMN IF EXISTS salary_range_max; -- We'll use salary_min for minimum threshold

-- ❸ Add opportunity-related fields to applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS needs_user_review BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS opportunity_source TEXT CHECK (opportunity_source IN ('linkedin', 'serper', 'manual', 'email_sync')),
ADD COLUMN IF NOT EXISTS opportunity_discovered_at TIMESTAMPTZ;

-- ❹ Create manual search usage tracking table
CREATE TABLE IF NOT EXISTS public.manual_search_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_date DATE NOT NULL DEFAULT CURRENT_DATE,
    search_count INTEGER NOT NULL DEFAULT 1,
    subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'executive')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure one record per user per day
    UNIQUE(user_id, search_date)
);

-- ❺ Update RLS policies for enhanced job discovery preferences
DROP POLICY IF EXISTS "Users can manage their own job discovery preferences" ON public.user_job_discovery_preferences;
CREATE POLICY "Users can manage their own job discovery preferences" ON public.user_job_discovery_preferences
    FOR ALL USING ((select auth.uid()) = user_id);

-- ❻ Add RLS policies for manual search usage
ALTER TABLE public.manual_search_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own manual search usage" ON public.manual_search_usage
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own manual search usage" ON public.manual_search_usage
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own manual search usage" ON public.manual_search_usage
    FOR UPDATE USING ((select auth.uid()) = user_id);

-- ❼ Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_user_job_discovery_preferences_is_active 
ON public.user_job_discovery_preferences(user_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_job_discovery_preferences_last_discovery 
ON public.user_job_discovery_preferences(last_discovery_at DESC) WHERE last_discovery_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_needs_review 
ON public.applications(user_id, needs_user_review, created_at DESC) WHERE needs_user_review = true;

CREATE INDEX IF NOT EXISTS idx_applications_opportunity_source 
ON public.applications(opportunity_source, opportunity_discovered_at DESC) WHERE opportunity_source IS NOT NULL;

-- Manual search usage indexes
CREATE INDEX IF NOT EXISTS idx_manual_search_usage_user_date 
ON public.manual_search_usage(user_id, search_date DESC);

CREATE INDEX IF NOT EXISTS idx_manual_search_usage_date 
ON public.manual_search_usage(search_date DESC);

-- Add missing foreign key indexes to fix unindexed foreign key warnings
CREATE INDEX IF NOT EXISTS idx_manual_search_usage_user_id_fk 
ON public.manual_search_usage(user_id);

-- ❽ Create function to check manual search limits
CREATE OR REPLACE FUNCTION check_manual_search_limit(p_user_id UUID)
RETURNS TABLE (
    can_search BOOLEAN,
    searches_used INTEGER,
    daily_limit INTEGER,
    subscription_tier TEXT,
    resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_subscription_tier TEXT;
    v_daily_limit INTEGER;
    v_searches_used INTEGER;
    v_today DATE;
BEGIN
    v_today := CURRENT_DATE;
    
    -- Get user's subscription tier
    SELECT COALESCE(pr.subscription_tier, 'free')
    INTO v_subscription_tier
    FROM public.profiles pr
    WHERE pr.id = p_user_id;
    
    -- If no profile found, default to free
    IF v_subscription_tier IS NULL THEN
        v_subscription_tier := 'free';
    END IF;
    
    -- Set daily limits based on tier
    CASE v_subscription_tier
        WHEN 'free' THEN v_daily_limit := 5;
        WHEN 'pro' THEN v_daily_limit := 50;
        WHEN 'executive' THEN v_daily_limit := 200;
        ELSE v_daily_limit := 5; -- Default to free tier
    END CASE;
    
    -- Get today's search count
    SELECT COALESCE(msu.search_count, 0)
    INTO v_searches_used
    FROM public.manual_search_usage msu
    WHERE msu.user_id = p_user_id 
    AND msu.search_date = v_today;
    
    -- If no record found, user hasn't searched today
    IF v_searches_used IS NULL THEN
        v_searches_used := 0;
    END IF;
    
    RETURN QUERY SELECT 
        (v_searches_used < v_daily_limit) as can_search,
        v_searches_used as searches_used,
        v_daily_limit as daily_limit,
        v_subscription_tier as subscription_tier,
        (v_today + INTERVAL '1 day')::TIMESTAMPTZ as resets_at;
END;
$$;

-- ❾ Create function to increment manual search usage
CREATE OR REPLACE FUNCTION increment_manual_search_usage(p_user_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    searches_used INTEGER,
    daily_limit INTEGER,
    message TEXT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_subscription_tier TEXT;
    v_daily_limit INTEGER;
    v_today DATE;
    v_current_count INTEGER;
BEGIN
    v_today := CURRENT_DATE;
    
    -- Get user's subscription tier
    SELECT COALESCE(pr.subscription_tier, 'free')
    INTO v_subscription_tier
    FROM public.profiles pr
    WHERE pr.id = p_user_id;
    
    -- If no profile found, default to free
    IF v_subscription_tier IS NULL THEN
        v_subscription_tier := 'free';
    END IF;
    
    -- Set daily limits based on tier
    CASE v_subscription_tier
        WHEN 'free' THEN v_daily_limit := 5;
        WHEN 'pro' THEN v_daily_limit := 50;
        WHEN 'executive' THEN v_daily_limit := 200;
        ELSE v_daily_limit := 5; -- Default to free tier
    END CASE;
    
    -- Insert or update usage record
    INSERT INTO public.manual_search_usage (user_id, search_date, search_count, subscription_tier)
    VALUES (p_user_id, v_today, 1, v_subscription_tier)
    ON CONFLICT (user_id, search_date)
    DO UPDATE SET 
        search_count = manual_search_usage.search_count + 1,
        subscription_tier = EXCLUDED.subscription_tier,
        updated_at = now()
    RETURNING search_count INTO v_current_count;
    
    -- Check if limit exceeded
    IF v_current_count > v_daily_limit THEN
        -- Rollback the increment
        UPDATE public.manual_search_usage 
        SET search_count = search_count - 1,
            updated_at = now()
        WHERE user_id = p_user_id AND search_date = v_today;
        
        RETURN QUERY SELECT 
            false as success,
            (v_current_count - 1) as searches_used,
            v_daily_limit as daily_limit,
            'Daily search limit exceeded' as message;
    ELSE
        RETURN QUERY SELECT 
            true as success,
            v_current_count as searches_used,
            v_daily_limit as daily_limit,
            'Search recorded successfully' as message;
    END IF;
END;
$$;

-- ❿ Create function to clean up old discovery data (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_discovery_data(days_old INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete old discovery runs and their related staging data
    WITH deleted AS (
        DELETE FROM public.job_discovery_runs 
        WHERE created_at < now() - (days_old || ' days')::INTERVAL
        AND status IN ('completed', 'error')
        RETURNING id
    )
    SELECT count(*) INTO deleted_count FROM deleted;
    
    -- Clean up orphaned staging records
    DELETE FROM public.discovered_jobs_staging 
    WHERE discovery_run_id NOT IN (
        SELECT id FROM public.job_discovery_runs
    );
    
    -- Clean up old manual search usage records (keep 1 year)
    DELETE FROM public.manual_search_usage 
    WHERE search_date < CURRENT_DATE - INTERVAL '1 year';
    
    RETURN deleted_count;
END;
$$;

-- ⓫ Create function to get users ready for job discovery by tier
CREATE OR REPLACE FUNCTION get_users_for_discovery(target_tier TEXT DEFAULT NULL)
RETURNS TABLE (
    user_id UUID,
    subscription_tier TEXT,
    last_discovery_at TIMESTAMPTZ,
    target_roles TEXT[],
    target_locations TEXT[]
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.user_id,
        COALESCE(pr.subscription_tier, 'free') as subscription_tier,
        p.last_discovery_at,
        p.target_roles,
        p.target_locations
    FROM public.user_job_discovery_preferences p
    LEFT JOIN public.profiles pr ON p.user_id = pr.id
    WHERE p.is_active = true
    AND p.auto_discovery_enabled = true
    AND array_length(p.target_roles, 1) > 0
    AND (target_tier IS NULL OR COALESCE(pr.subscription_tier, 'free') = target_tier);
END;
$$;

-- ⓬ Add helpful view for job discovery stats
CREATE OR REPLACE VIEW job_discovery_user_stats AS
SELECT 
    u.user_id,
    COALESCE(pr.subscription_tier, 'free') as subscription_tier,
    COUNT(DISTINCT jr.id) as total_discovery_runs,
    COUNT(DISTINCT jr.id) FILTER (WHERE jr.created_at > now() - INTERVAL '30 days') as runs_last_30_days,
    SUM(jr.jobs_discovered) as total_jobs_discovered,
    SUM(jr.jobs_created_as_opportunities) as total_opportunities_created,
    MAX(jr.completed_at) as last_discovery_completed,
    COUNT(DISTINCT a.id) FILTER (WHERE a.opportunity_source IS NOT NULL) as opportunity_applications,
    COUNT(DISTINCT a.id) FILTER (WHERE a.opportunity_source IS NOT NULL AND a.status != 'Opportunity') as converted_opportunities,
    -- Manual search stats
    COALESCE(SUM(msu.search_count) FILTER (WHERE msu.search_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as manual_searches_last_30_days,
    COALESCE(msu_today.search_count, 0) as manual_searches_today
FROM public.user_job_discovery_preferences u
LEFT JOIN public.profiles pr ON u.user_id = pr.id
LEFT JOIN public.job_discovery_runs jr ON u.user_id = jr.user_id
LEFT JOIN public.applications a ON u.user_id = a.user_id
LEFT JOIN public.manual_search_usage msu ON u.user_id = msu.user_id
LEFT JOIN public.manual_search_usage msu_today ON u.user_id = msu_today.user_id AND msu_today.search_date = CURRENT_DATE
WHERE u.is_active = true
GROUP BY u.user_id, pr.subscription_tier, msu_today.search_count;

-- ⓭ Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_old_discovery_data(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_users_for_discovery(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION check_manual_search_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_manual_search_usage(UUID) TO authenticated;
GRANT SELECT ON job_discovery_user_stats TO authenticated;
GRANT ALL ON public.manual_search_usage TO authenticated;

-- ⓮ Enable realtime for enhanced tables (if not already enabled)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'applications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'manual_search_usage'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_search_usage;
    END IF;
END $$;

-- ⓯ Add trigger for updated_at on manual_search_usage
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.manual_search_usage
    FOR EACH ROW EXECUTE FUNCTION public.moddatetime(updated_at);
