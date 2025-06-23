-- =====================================================================
-- Fix column ambiguity in check_fantastic_usage_limits function
-- Version 3 - 2025-06-19
-- =====================================================================

-- Drop and recreate the function with proper table aliases to avoid ambiguity
DROP FUNCTION IF EXISTS public.check_fantastic_usage_limits(UUID, TEXT, INTEGER);

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
  reset_date DATE,
  subscription_tier TEXT
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier TEXT;
  v_current_month CHAR(7);
  v_usage_record RECORD;
  v_bucket_settings RECORD;
  v_user_counts RECORD;
  v_calculated_limit INTEGER;
BEGIN
  -- Derive user tier with explicit table reference
  SELECT p.subscription_tier INTO v_tier
  FROM public.profiles p
  WHERE p.id = p_user_id;

  v_tier := COALESCE(p_tier, v_tier, 'free');
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');

  -- Fetch current usage row
  SELECT * INTO v_usage_record
  FROM public.scraper_vendor_usage svu
  WHERE svu.user_id = p_user_id
    AND svu.vendor = 'fantastic'
    AND svu.period = v_current_month;

  -- Initialise if missing
  IF v_usage_record IS NULL THEN
    INSERT INTO public.scraper_vendor_usage (
      user_id, vendor, period, jobs_fetched, requests_made, rows_used
    ) VALUES (
      p_user_id, 'fantastic', v_current_month, 0, 0, 0
    );
    v_usage_record.jobs_fetched := 0;
    v_usage_record.requests_made := 0;
  END IF;

  -- Dynamic bucket calculation with explicit table aliases
  IF v_tier IN ('pro', 'elite', 'executive') THEN
    SELECT * INTO v_bucket_settings
    FROM public.fantastic_bucket_settings fbs
    WHERE fbs.setting_name = 'default';

    SELECT COUNT(*) FILTER (WHERE p.subscription_tier = 'pro')  AS pro_count,
           COUNT(*) FILTER (WHERE p.subscription_tier = 'elite' OR p.subscription_tier = 'executive') AS elite_count
    INTO v_user_counts
    FROM public.profiles p
    INNER JOIN public.user_job_discovery_preferences udp ON p.id = udp.user_id
    WHERE udp.is_active = TRUE AND udp.auto_discovery_enabled = TRUE;

    IF v_tier = 'pro' THEN
      v_calculated_limit := GREATEST(
        v_bucket_settings.pro_floor,
        LEAST(
          v_bucket_settings.pro_ceiling,
          (v_bucket_settings.total_monthly_budget * v_bucket_settings.pro_percentage / 100.0) / GREATEST(v_user_counts.pro_count, 1)
        )
      );
    ELSE -- executive or elite
      v_calculated_limit := GREATEST(
        v_bucket_settings.elite_floor,
        LEAST(
          v_bucket_settings.elite_ceiling,
          (v_bucket_settings.total_monthly_budget * v_bucket_settings.elite_percentage / 100.0) / GREATEST(v_user_counts.elite_count, 1)
        )
      );
    END IF;
  ELSE
    v_calculated_limit := 0;
  END IF;

  -- Return with explicit column naming to avoid ambiguity
  RETURN QUERY SELECT
    (v_usage_record.jobs_fetched + p_required_jobs) <= v_calculated_limit AS can_proceed,
    v_usage_record.jobs_fetched::INTEGER AS jobs_used,
    v_calculated_limit::INTEGER AS jobs_limit,
    v_usage_record.requests_made::INTEGER AS requests_used,
    CASE
      WHEN v_tier = 'free' THEN 0
      WHEN v_tier = 'pro' THEN 20
      ELSE 50
    END AS requests_limit,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE AS reset_date,
    v_tier AS subscription_tier;
END;
$$;

COMMENT ON FUNCTION public.check_fantastic_usage_limits IS 'Checks Fantastic API usage limits with proper table aliases to avoid column ambiguity';

-- =====================================================================
-- Patch 3.1 – Enforce global budget inside recalculate_fantastic_buckets
-- Raises an error when the calculated allocation would exceed the
-- configured total_monthly_budget. This prevents accidental
-- oversubscription instead of merely logging a warning.
-- =====================================================================

-- Drop and recreate the function with an allocation guard
DROP FUNCTION IF EXISTS public.recalculate_fantastic_buckets();

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
  v_total_allocation INTEGER;
BEGIN
  -- Fetch current settings
  SELECT * INTO v_bucket_settings
  FROM public.fantastic_bucket_settings
  WHERE setting_name = 'default';

  -- Count active users (same criteria as check_fantastic_usage_limits)
  SELECT 
    COUNT(*) FILTER (WHERE p.subscription_tier = 'pro') AS pro_count,
    COUNT(*) FILTER (WHERE p.subscription_tier = 'elite' OR p.subscription_tier = 'executive') AS elite_count
  INTO v_user_counts
  FROM public.profiles p
  INNER JOIN public.user_job_discovery_preferences udp ON p.id = udp.user_id
  WHERE udp.is_active = TRUE AND udp.auto_discovery_enabled = TRUE;

  -- Calculate provisional per-user limits
  v_pro_limit := GREATEST(
    v_bucket_settings.pro_floor,
    LEAST(
      v_bucket_settings.pro_ceiling,
      (v_bucket_settings.total_monthly_budget * v_bucket_settings.pro_percentage / 100.0) / GREATEST(v_user_counts.pro_count, 1)
    )
  );

  v_elite_limit := GREATEST(
    v_bucket_settings.elite_floor,
    LEAST(
      v_bucket_settings.elite_ceiling,
      (v_bucket_settings.total_monthly_budget * v_bucket_settings.elite_percentage / 100.0) / GREATEST(v_user_counts.elite_count, 1)
    )
  );

  -- Compute overall allocation and enforce hard cap
  v_total_allocation := (v_user_counts.pro_count * v_pro_limit) + (v_user_counts.elite_count * v_elite_limit);

  IF v_total_allocation > v_bucket_settings.total_monthly_budget THEN
    RAISE EXCEPTION 'Total Fantastic bucket allocation (% jobs) exceeds global budget (% jobs). Adjust percentage/floor/ceiling values.',
      v_total_allocation, v_bucket_settings.total_monthly_budget;
  END IF;

  -- Return allocation per tier
  RETURN QUERY 
  SELECT 'pro'::TEXT, v_user_counts.pro_count, v_pro_limit, (v_user_counts.pro_count * v_pro_limit)
  UNION ALL
  SELECT 'elite'::TEXT, v_user_counts.elite_count, v_elite_limit, (v_user_counts.elite_count * v_elite_limit);
END;
$$;

COMMENT ON FUNCTION public.recalculate_fantastic_buckets IS 'Recalculates per-user quota allocations and enforces the global monthly budget.';
