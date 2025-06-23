-- =====================================================================
-- Job Discovery Limits & Quota Re-work Migration
-- Version 1 - 2025-06-19
-- =====================================================================

-- 0.1 Ensure legacy compatibility column (usage_period) exists until full standardisation
ALTER TABLE public.scraper_vendor_usage
  ADD COLUMN IF NOT EXISTS usage_period CHAR(7);
-- Back-fill existing data
UPDATE public.scraper_vendor_usage
  SET usage_period = COALESCE(usage_period, period)
  WHERE usage_period IS NULL AND period IS NOT NULL;

-- 1. Enhance scraper_vendor_usage table with detailed tracking
ALTER TABLE public.scraper_vendor_usage
  ADD COLUMN IF NOT EXISTS jobs_fetched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requests_made INTEGER DEFAULT 0;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scraper_vendor_usage_user_period_vendor
  ON public.scraper_vendor_usage(user_id, usage_period, vendor);

-- 2. Create bucket_settings table for dynamic quota allocation
CREATE TABLE IF NOT EXISTS public.fantastic_bucket_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_name TEXT NOT NULL UNIQUE,
  pro_percentage DECIMAL(5,2) DEFAULT 40.0, -- 40% of total bucket for Pro users
  elite_percentage DECIMAL(5,2) DEFAULT 60.0, -- 60% of total bucket for Elite users
  pro_floor INTEGER DEFAULT 50, -- Minimum quota per Pro user
  pro_ceiling INTEGER DEFAULT 150, -- Maximum quota per Pro user
  elite_floor INTEGER DEFAULT 150, -- Minimum quota per Elite user
  elite_ceiling INTEGER DEFAULT 400, -- Maximum quota per Elite user
  total_monthly_budget INTEGER DEFAULT 5000, -- Total jobs available per month
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.fantastic_bucket_settings (setting_name) 
VALUES ('default') 
ON CONFLICT (setting_name) DO NOTHING;

-- 3. Enhanced function to check Fantastic usage limits with bucket logic
CREATE OR REPLACE FUNCTION public.check_fantastic_usage_limits(
  p_user_id UUID,
  p_tier TEXT DEFAULT NULL,
  p_required_jobs INTEGER DEFAULT 1
)
RETURNS TABLE(
  can_proceed BOOLEAN,
  jobs_used INTEGER,
  jobs_limit INTEGER,
  requests_used INTEGER,
  requests_limit INTEGER,
  reset_date DATE
) 
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier TEXT;
  v_current_month TEXT;
  v_usage_record RECORD;
  v_bucket_settings RECORD;
  v_user_counts RECORD;
  v_calculated_limit INTEGER;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier 
  FROM public.profiles 
  WHERE id = p_user_id;
  
  -- Use provided tier if available, otherwise fallback to profile tier or 'free'
  v_tier := COALESCE(p_tier, v_tier, 'free');
  
  -- Get current month key
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
  
  -- Get current usage for the user
  SELECT * INTO v_usage_record
  FROM public.scraper_vendor_usage
  WHERE user_id = p_user_id 
    AND vendor = 'fantastic'
    AND usage_period = v_current_month;
  
  -- Initialize usage if not found
  IF v_usage_record IS NULL THEN
    INSERT INTO public.scraper_vendor_usage (
      user_id, vendor, usage_period, jobs_fetched, requests_made, month_spend_usd
    ) VALUES (
      p_user_id, 'fantastic', v_current_month, 0, 0, 0
    );
    v_usage_record.jobs_fetched := 0;
    v_usage_record.requests_made := 0;
  END IF;
  
  -- Calculate dynamic limits based on tier and bucket allocation
  IF v_tier IN ('pro', 'elite') THEN
    -- Get bucket settings
    SELECT * INTO v_bucket_settings
    FROM public.fantastic_bucket_settings
    WHERE setting_name = 'default';
    
    -- Count active users in each tier
    SELECT 
      COUNT(*) FILTER (WHERE subscription_tier = 'pro') as pro_count,
      COUNT(*) FILTER (WHERE subscription_tier = 'elite') as elite_count
    INTO v_user_counts
    FROM public.profiles p
    INNER JOIN public.user_job_discovery_preferences udp ON p.id = udp.user_id
    WHERE udp.is_active = true AND udp.auto_discovery_enabled = true;
    
    IF v_tier = 'pro' THEN
      -- Calculate Pro user limit: (total_budget * pro_percentage) / pro_users
      v_calculated_limit := GREATEST(
        v_bucket_settings.pro_floor,
        LEAST(
          v_bucket_settings.pro_ceiling,
          (v_bucket_settings.total_monthly_budget * v_bucket_settings.pro_percentage / 100.0) / 
          GREATEST(v_user_counts.pro_count, 1)
        )
      );
    ELSE -- elite
      -- Calculate Elite user limit: (total_budget * elite_percentage) / elite_users  
      v_calculated_limit := GREATEST(
        v_bucket_settings.elite_floor,
        LEAST(
          v_bucket_settings.elite_ceiling,
          (v_bucket_settings.total_monthly_budget * v_bucket_settings.elite_percentage / 100.0) /
          GREATEST(v_user_counts.elite_count, 1)
        )
      );
    END IF;
  ELSE
    -- Free tier gets no Fantastic access
    v_calculated_limit := 0;
  END IF;
  
  -- Return usage status
  RETURN QUERY SELECT
    (v_usage_record.jobs_fetched + p_required_jobs) <= v_calculated_limit,
    v_usage_record.jobs_fetched::INTEGER,
    v_calculated_limit::INTEGER,
    v_usage_record.requests_made::INTEGER,
    CASE 
      WHEN v_tier = 'free' THEN 0
      WHEN v_tier = 'pro' THEN 20 -- 20 requests per month for Pro
      ELSE 50 -- 50 requests per month for Elite
    END,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE;
END;
$$;

-- 4. Function to debit Fantastic usage
CREATE OR REPLACE FUNCTION public.debit_fantastic_usage(
  p_user_id UUID,
  p_jobs INTEGER,
  p_requests INTEGER DEFAULT 1
)
RETURNS BOOLEAN
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_month TEXT;
BEGIN
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
  
  -- Update or insert usage record
  INSERT INTO public.scraper_vendor_usage (
    user_id, vendor, usage_period, jobs_fetched, requests_made, month_spend_usd
  ) VALUES (
    p_user_id, 'fantastic', v_current_month, p_jobs, p_requests, 0
  )
  ON CONFLICT (user_id, vendor, usage_period) 
  DO UPDATE SET
    jobs_fetched = scraper_vendor_usage.jobs_fetched + p_jobs,
    requests_made = scraper_vendor_usage.requests_made + p_requests,
    updated_at = NOW();
    
  RETURN TRUE;
END;
$$;

-- 5. Function to recalculate and cache bucket allocations (for daily cron)
CREATE OR REPLACE FUNCTION public.recalculate_fantastic_buckets()
RETURNS TABLE(
  tier TEXT,
  active_users INTEGER,
  per_user_limit INTEGER,
  total_allocation INTEGER
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_bucket_settings RECORD;
  v_user_counts RECORD;
  v_pro_limit INTEGER;
  v_elite_limit INTEGER;
BEGIN
  -- Get current bucket settings
  SELECT * INTO v_bucket_settings
  FROM public.fantastic_bucket_settings
  WHERE setting_name = 'default';
  
  -- Count active users
  SELECT 
    COUNT(*) FILTER (WHERE subscription_tier = 'pro') as pro_count,
    COUNT(*) FILTER (WHERE subscription_tier = 'elite') as elite_count
  INTO v_user_counts
  FROM public.profiles p
  INNER JOIN public.user_job_discovery_preferences udp ON p.id = udp.user_id
  WHERE udp.is_active = true AND udp.auto_discovery_enabled = true;
  
  -- Calculate limits
  v_pro_limit := GREATEST(
    v_bucket_settings.pro_floor,
    LEAST(
      v_bucket_settings.pro_ceiling,
      (v_bucket_settings.total_monthly_budget * v_bucket_settings.pro_percentage / 100.0) / 
      GREATEST(v_user_counts.pro_count, 1)
    )
  );
  
  v_elite_limit := GREATEST(
    v_bucket_settings.elite_floor,
    LEAST(
      v_bucket_settings.elite_ceiling,
      (v_bucket_settings.total_monthly_budget * v_bucket_settings.elite_percentage / 100.0) /
      GREATEST(v_user_counts.elite_count, 1)
    )
  );
  
  -- Return calculated allocations
  RETURN QUERY 
  SELECT 'pro'::TEXT, v_user_counts.pro_count, v_pro_limit, (v_user_counts.pro_count * v_pro_limit)
  UNION ALL
  SELECT 'elite'::TEXT, v_user_counts.elite_count, v_elite_limit, (v_user_counts.elite_count * v_elite_limit);
END;
$$;

-- 6. Function to get manual search limits by tier
CREATE OR REPLACE FUNCTION public.get_manual_search_limits(p_user_id UUID)
RETURNS TABLE(
  can_search BOOLEAN,
  searches_used INTEGER,
  daily_limit INTEGER,
  subscription_tier TEXT,
  resets_at TIMESTAMPTZ
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier TEXT;
  v_today DATE;
  v_usage_count INTEGER;
  v_daily_limit INTEGER;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier 
  FROM public.profiles 
  WHERE id = p_user_id;
  
  v_tier := COALESCE(v_tier, 'free');
  v_today := CURRENT_DATE;
  
  -- Get today's manual search count
  SELECT COUNT(*) INTO v_usage_count
  FROM public.manual_search_usage
  WHERE user_id = p_user_id 
    AND search_date = v_today;
  
  -- Set daily limits by tier
  v_daily_limit := CASE 
    WHEN v_tier = 'free' THEN 5
    WHEN v_tier = 'pro' THEN 50  
    WHEN v_tier = 'elite' THEN 5
    ELSE 5
  END;
  
  RETURN QUERY SELECT
    v_usage_count < v_daily_limit,
    v_usage_count,
    v_daily_limit,
    v_tier,
    (v_today + INTERVAL '1 day')::TIMESTAMPTZ;
END;
$$;

-- Drop existing function if present to avoid return type conflicts
DROP FUNCTION IF EXISTS public.increment_manual_search_usage(UUID);

-- Re-create with original return signature (detailed response)
CREATE OR REPLACE FUNCTION public.increment_manual_search_usage(p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  searches_used INTEGER,
  daily_limit INTEGER,
  message TEXT
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_subscription_tier TEXT;
  v_daily_limit INTEGER;
  v_today DATE := CURRENT_DATE;
  v_current_count INTEGER;
BEGIN
  -- Determine user tier
  SELECT COALESCE(subscription_tier, 'free')
    INTO v_subscription_tier
  FROM public.profiles
  WHERE id = p_user_id;

  -- Fallback
  IF v_subscription_tier IS NULL THEN
    v_subscription_tier := 'free';
  END IF;

  -- Tier-based limits
  CASE v_subscription_tier
    WHEN 'free' THEN v_daily_limit := 5;
    WHEN 'pro' THEN v_daily_limit := 50;
    WHEN 'executive' THEN v_daily_limit := 200;
    ELSE v_daily_limit := 5;
  END CASE;

  -- Upsert usage row
  INSERT INTO public.manual_search_usage (user_id, search_date, search_count, subscription_tier)
  VALUES (p_user_id, v_today, 1, v_subscription_tier)
  ON CONFLICT (user_id, search_date)
  DO UPDATE SET 
    search_count = manual_search_usage.search_count + 1,
    subscription_tier = EXCLUDED.subscription_tier,
    updated_at = NOW()
  RETURNING search_count INTO v_current_count;

  -- Enforce limit
  IF v_current_count > v_daily_limit THEN
    -- rollback increment
    UPDATE public.manual_search_usage
      SET search_count = search_count - 1,
          updated_at = NOW()
    WHERE user_id = p_user_id AND search_date = v_today;

    RETURN QUERY SELECT false, v_current_count - 1, v_daily_limit, 'Daily search limit exceeded';
  ELSE
    RETURN QUERY SELECT true, v_current_count, v_daily_limit, 'Search recorded successfully';
  END IF;
END;
$$;

-- 8. Add updated_at trigger for bucket_settings
CREATE TRIGGER update_fantastic_bucket_settings_updated_at 
  BEFORE UPDATE ON public.fantastic_bucket_settings
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- 9. Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_fantastic_bucket_settings_name 
  ON public.fantastic_bucket_settings(setting_name);

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier_active
  ON public.profiles(subscription_tier) 
  WHERE subscription_tier IS NOT NULL;

-- 10. Add comments for documentation
COMMENT ON TABLE public.fantastic_bucket_settings IS 'Dynamic quota allocation settings for Fantastic API usage across subscription tiers';
COMMENT ON FUNCTION public.check_fantastic_usage_limits IS 'Checks current Fantastic API usage against dynamic bucket-based limits';
COMMENT ON FUNCTION public.debit_fantastic_usage IS 'Records Fantastic API usage for billing and quota tracking';
COMMENT ON FUNCTION public.recalculate_fantastic_buckets IS 'Recalculates per-user quota allocations based on active user counts';
COMMENT ON FUNCTION public.get_manual_search_limits IS 'Returns manual search limits and current usage for a user';
COMMENT ON FUNCTION public.increment_manual_search_usage IS 'Increments manual search usage counter for quota tracking';
