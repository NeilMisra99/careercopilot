-- Add Fantastic (Active Jobs DB) vendor support
-- Following FANTASTIC_INTEGRATION_PLAN.md requirements

-- 1. Add 'fantastic' to source_vendor constraint
ALTER TABLE public.jobs 
DROP CONSTRAINT IF EXISTS jobs_source_vendor_check;

ALTER TABLE public.jobs 
ADD CONSTRAINT jobs_source_vendor_check 
CHECK (source_vendor IN ('linkedin','brightdata','serper','manual','fantastic'));

-- 2. Update scraper_vendor_usage table structure for better tracking
-- The existing table tracks monthly spend, but we need row-based usage for Fantastic
ALTER TABLE public.scraper_vendor_usage 
  ADD COLUMN IF NOT EXISTS period CHAR(7), -- e.g. '2025-06' (YYYY-MM format)
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS rows_used INTEGER DEFAULT 0 NOT NULL;

-- Update the primary key to accommodate user-level tracking
ALTER TABLE public.scraper_vendor_usage 
DROP CONSTRAINT IF EXISTS scraper_vendor_usage_pk;

-- Create unique constraints to handle both global (user_id IS NULL) and user-level tracking
-- Add a surrogate primary key
ALTER TABLE public.scraper_vendor_usage 
ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;

-- Create unique constraint for global tracking (user_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_vendor_usage_global
ON public.scraper_vendor_usage (vendor, period)
WHERE user_id IS NULL;

-- Create unique constraint for user-level tracking (user_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_vendor_usage_user
ON public.scraper_vendor_usage (vendor, period, user_id)
WHERE user_id IS NOT NULL;

-- 3. Create/update the increment_vendor_usage function per the integration plan
CREATE OR REPLACE FUNCTION public.increment_vendor_usage(
  p_vendor TEXT,
  p_amount INTEGER,
  p_user_id UUID DEFAULT NULL
) 
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_period CHAR(7) := to_char(CURRENT_DATE, 'YYYY-MM');
  v_cap INTEGER;
  v_used INTEGER;
BEGIN
  -- Set hard caps based on vendor
  IF p_vendor = 'fantastic' THEN
    v_cap := 5000; -- rows / month (global)
  ELSIF p_vendor = 'brightdata' THEN
    v_cap := 10000; -- existing Bright Data cap
  ELSE
    -- For other vendors, use existing logic or skip caps
    RETURN;
  END IF;

  -- Global usage row (user_id IS NULL)
  INSERT INTO public.scraper_vendor_usage (vendor, period, user_id, rows_used, updated_at)
  VALUES (p_vendor, v_period, NULL, 0, now())
  ON CONFLICT (vendor, period) WHERE user_id IS NULL
  DO NOTHING;

  -- Get current usage with row lock
  SELECT COALESCE(rows_used, 0) INTO v_used
  FROM public.scraper_vendor_usage
  WHERE vendor = p_vendor 
    AND period = v_period 
    AND user_id IS NULL 
  FOR UPDATE;

  -- Check global cap
  IF COALESCE(v_used, 0) + p_amount > v_cap THEN
    RAISE EXCEPTION 'Vendor % global cap reached (% + % > %)', 
      p_vendor, COALESCE(v_used, 0), p_amount, v_cap;
  END IF;

  -- Update global usage
  UPDATE public.scraper_vendor_usage
  SET rows_used = COALESCE(rows_used, 0) + p_amount, 
      updated_at = now()
  WHERE vendor = p_vendor 
    AND period = v_period 
    AND user_id IS NULL;

  -- User-level tracking (optional – used for per-user quotas)
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.scraper_vendor_usage (vendor, period, user_id, rows_used, updated_at)
    VALUES (p_vendor, v_period, p_user_id, 0, now())
    ON CONFLICT (vendor, period, user_id) WHERE user_id IS NOT NULL
    DO NOTHING;

    UPDATE public.scraper_vendor_usage
    SET rows_used = COALESCE(rows_used, 0) + p_amount, 
        updated_at = now()
    WHERE vendor = p_vendor 
      AND period = v_period 
      AND user_id = p_user_id;
  END IF;
END;
$$;

-- 4. Create helper function to get vendor usage stats
CREATE OR REPLACE FUNCTION public.get_vendor_usage_stats(
  p_vendor TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  vendor TEXT,
  period CHAR(7),
  rows_used INTEGER,
  cap INTEGER,
  remaining INTEGER,
  user_id UUID
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_period CHAR(7) := to_char(CURRENT_DATE, 'YYYY-MM');
  v_cap INTEGER;
BEGIN
  -- Set caps based on vendor
  IF p_vendor = 'fantastic' THEN
    v_cap := 5000;
  ELSIF p_vendor = 'brightdata' THEN
    v_cap := 10000;
  ELSE
    v_cap := 0;
  END IF;

  RETURN QUERY
  SELECT 
    s.vendor,
    s.period,
    COALESCE(s.rows_used, 0) as rows_used,
    v_cap as cap,
    GREATEST(0, v_cap - COALESCE(s.rows_used, 0)) as remaining,
    s.user_id
  FROM public.scraper_vendor_usage s
  WHERE s.vendor = p_vendor 
    AND s.period = v_period
    AND (p_user_id IS NULL OR s.user_id = p_user_id OR s.user_id IS NULL)
  ORDER BY s.user_id NULLS FIRST;
END;
$$;

-- 5. Add index for better performance on the new columns
CREATE INDEX IF NOT EXISTS idx_scraper_vendor_usage_period 
  ON public.scraper_vendor_usage(period);

CREATE INDEX IF NOT EXISTS idx_scraper_vendor_usage_user_id 
  ON public.scraper_vendor_usage(user_id);

-- 6. Update shared-job-helpers.ts UniversalJobData interface
-- This is just a comment for reference - the TypeScript interface will need to be updated
-- to include 'fantastic' in the source_vendor union type
