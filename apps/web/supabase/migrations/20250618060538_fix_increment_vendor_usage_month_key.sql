-- Fix increment_vendor_usage to populate month_key (legacy column)
-- Timestamp: 2025-06-18 10:15 UTC

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

  -- -----------------------------------------------------------------------
  -- Ensure GLOBAL usage row exists (user_id IS NULL)
  -- -----------------------------------------------------------------------
  INSERT INTO public.scraper_vendor_usage (vendor, period, month_key, user_id, rows_used, updated_at)
  VALUES (p_vendor, v_period, v_period, NULL, 0, now())
  ON CONFLICT (vendor, period) WHERE user_id IS NULL
  DO NOTHING;

  -- Lock and fetch current usage
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

  -- -----------------------------------------------------------------------
  -- USER-LEVEL tracking (optional)
  -- -----------------------------------------------------------------------
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.scraper_vendor_usage (vendor, period, month_key, user_id, rows_used, updated_at)
    VALUES (p_vendor, v_period, v_period, p_user_id, 0, now())
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