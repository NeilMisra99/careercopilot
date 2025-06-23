-- =====================================================================
-- Patch Fantastic Usage Limits function to include subscription_tier
-- Version 2 - 2025-06-19  (follow-up to job_discovery_limits_rework)
-- =====================================================================

-- =============================================================
--  Patch 2.1  – 2025-06-19
--  Standardise on period (CHAR(7)) in scraper_vendor_usage
--  • Drop legacy month_key / usage_period columns
--  • Re-create composite index with period
--  • Update check_fantastic_usage_limits + debit_fantastic_usage to use period
-- =============================================================

-- 1. Clean up duplicate/legacy columns
ALTER TABLE public.scraper_vendor_usage
  DROP COLUMN IF EXISTS usage_period,
  DROP COLUMN IF EXISTS month_key;

-- 2. Ensure canonical column exists with correct type
ALTER TABLE public.scraper_vendor_usage
  ADD COLUMN IF NOT EXISTS period CHAR(7);

-- 3. Re-create helper index on (user_id, period, vendor)
DROP INDEX IF EXISTS idx_scraper_vendor_usage_user_period_vendor;
CREATE INDEX IF NOT EXISTS idx_scraper_vendor_usage_user_period_vendor
  ON public.scraper_vendor_usage (user_id, period, vendor);

-- 4. Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS public.check_fantastic_usage_limits(UUID, TEXT, INTEGER);

-- 5. Create updated check_fantastic_usage_limits to reference period column
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
  -- Derive user tier
  SELECT subscription_tier INTO v_tier
  FROM public.profiles
  WHERE id = p_user_id;

  v_tier := COALESCE(p_tier, v_tier, 'free');
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');

  -- Fetch current usage row
  SELECT * INTO v_usage_record
  FROM public.scraper_vendor_usage
  WHERE user_id = p_user_id
    AND vendor = 'fantastic'
    AND period = v_current_month;

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

  -- Dynamic bucket calculation (unchanged)
  IF v_tier IN ('pro', 'elite') THEN
    SELECT * INTO v_bucket_settings
    FROM public.fantastic_bucket_settings
    WHERE setting_name = 'default';

    SELECT COUNT(*) FILTER (WHERE subscription_tier = 'pro')  AS pro_count,
           COUNT(*) FILTER (WHERE subscription_tier = 'elite') AS elite_count
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
    ELSE
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

  RETURN QUERY SELECT
    (v_usage_record.jobs_fetched + p_required_jobs) <= v_calculated_limit,
    v_usage_record.jobs_fetched::INTEGER,
    v_calculated_limit::INTEGER,
    v_usage_record.requests_made::INTEGER,
    CASE
      WHEN v_tier = 'free' THEN 0
      WHEN v_tier = 'pro' THEN 20
      ELSE 50
    END,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE,
    v_tier;
END;
$$;

COMMENT ON FUNCTION public.check_fantastic_usage_limits IS 'Uses unified period column (char(7)); returns subscription_tier for downstream use';

-- 6. Replace debit_fantastic_usage to reference period column
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
  v_current_month CHAR(7);
BEGIN
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');

  INSERT INTO public.scraper_vendor_usage (
    user_id, vendor, period, jobs_fetched, requests_made, rows_used
  ) VALUES (
    p_user_id, 'fantastic', v_current_month, p_jobs, p_requests, 0
  )
  ON CONFLICT (user_id, vendor, period)
  DO UPDATE SET
    jobs_fetched = scraper_vendor_usage.jobs_fetched + p_jobs,
    requests_made = scraper_vendor_usage.requests_made + p_requests,
    updated_at = NOW();

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.debit_fantastic_usage IS 'Debits usage against unified period column'; 