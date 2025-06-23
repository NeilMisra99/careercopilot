-- =====================================================================
-- JSearch Quota Tracking Migration
-- Version 1 - 2025-06-20
-- =====================================================================

-- 1. Create JSearch usage tracking table
CREATE TABLE IF NOT EXISTS public.jsearch_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_period CHAR(7) NOT NULL, -- Format: YYYY-MM
  requests_made INTEGER DEFAULT 0,
  cost_units INTEGER DEFAULT 0, -- Track actual cost units (considering multipliers)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one record per user per month
  UNIQUE(user_id, usage_period)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_jsearch_usage_user_period
  ON public.jsearch_usage(user_id, usage_period);

-- 2. Create JSearch quota settings table
CREATE TABLE IF NOT EXISTS public.jsearch_quota_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL UNIQUE CHECK (tier IN ('free', 'pro', 'executive')),
  monthly_requests_limit INTEGER NOT NULL DEFAULT 0,
  max_pages_per_request INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default quota settings (initially restrictive for Pro/Executive only)
INSERT INTO public.jsearch_quota_settings (tier, monthly_requests_limit, max_pages_per_request, enabled) 
VALUES 
  ('free', 0, 1, false), -- Free tier disabled for JSearch
  ('pro', 100, 3, true), -- Pro: 100 requests/month, max 3 pages per request
  ('executive', 300, 5, true) -- Executive: 300 requests/month, max 5 pages per request
ON CONFLICT (tier) DO NOTHING;

-- 3. Function to check JSearch usage limits
CREATE OR REPLACE FUNCTION public.check_jsearch_usage_limits(
  p_user_id UUID,
  p_required_requests INTEGER DEFAULT 1
)
RETURNS TABLE(
  can_proceed BOOLEAN,
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
  v_quota_settings RECORD;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier 
  FROM public.profiles 
  WHERE id = p_user_id;
  
  -- Use tier or fallback to 'free'
  v_tier := COALESCE(v_tier, 'free');
  
  -- Get current month key
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
  
  -- Get quota settings for tier
  SELECT * INTO v_quota_settings
  FROM public.jsearch_quota_settings
  WHERE tier = v_tier;
  
  -- If no settings found or JSearch disabled for tier, deny access
  IF v_quota_settings IS NULL OR NOT v_quota_settings.enabled THEN
    RETURN QUERY SELECT
      false,
      0::INTEGER,
      0::INTEGER,
      (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE;
    RETURN;
  END IF;
  
  -- Get current usage for the user
  SELECT * INTO v_usage_record
  FROM public.jsearch_usage
  WHERE user_id = p_user_id 
    AND usage_period = v_current_month;
  
  -- Initialize usage if not found
  IF v_usage_record IS NULL THEN
    INSERT INTO public.jsearch_usage (
      user_id, usage_period, requests_made, cost_units
    ) VALUES (
      p_user_id, v_current_month, 0, 0
    );
    v_usage_record.requests_made := 0;
  END IF;
  
  -- Return usage status
  RETURN QUERY SELECT
    (v_usage_record.requests_made + p_required_requests) <= v_quota_settings.monthly_requests_limit,
    v_usage_record.requests_made::INTEGER,
    v_quota_settings.monthly_requests_limit::INTEGER,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE;
END;
$$;

-- 4. Function to debit JSearch usage
CREATE OR REPLACE FUNCTION public.debit_jsearch_usage(
  p_user_id UUID,
  p_requests INTEGER,
  p_cost_multiplier INTEGER DEFAULT 1
)
RETURNS BOOLEAN
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_month TEXT;
  v_cost_units INTEGER;
BEGIN
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
  v_cost_units := p_requests * p_cost_multiplier;
  
  -- Update or insert usage record
  INSERT INTO public.jsearch_usage (
    user_id, usage_period, requests_made, cost_units
  ) VALUES (
    p_user_id, v_current_month, p_requests, v_cost_units
  )
  ON CONFLICT (user_id, usage_period) 
  DO UPDATE SET
    requests_made = jsearch_usage.requests_made + p_requests,
    cost_units = jsearch_usage.cost_units + v_cost_units,
    updated_at = NOW();
    
  RETURN TRUE;
END;
$$;

-- 5. Function to get JSearch quota status for a user
CREATE OR REPLACE FUNCTION public.get_jsearch_quota_status(p_user_id UUID)
RETURNS TABLE(
  tier TEXT,
  requests_used INTEGER,
  requests_limit INTEGER,
  cost_units_used INTEGER,
  max_pages_per_request INTEGER,
  enabled BOOLEAN,
  reset_date DATE,
  usage_percentage NUMERIC
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier TEXT;
  v_current_month TEXT;
  v_usage_record RECORD;
  v_quota_settings RECORD;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier 
  FROM public.profiles 
  WHERE id = p_user_id;
  
  v_tier := COALESCE(v_tier, 'free');
  v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
  
  -- Get quota settings
  SELECT * INTO v_quota_settings
  FROM public.jsearch_quota_settings
  WHERE tier = v_tier;
  
  -- Get usage
  SELECT * INTO v_usage_record
  FROM public.jsearch_usage
  WHERE user_id = p_user_id 
    AND usage_period = v_current_month;
  
  -- Return status
  RETURN QUERY SELECT
    v_tier,
    COALESCE(v_usage_record.requests_made, 0)::INTEGER,
    COALESCE(v_quota_settings.monthly_requests_limit, 0)::INTEGER,
    COALESCE(v_usage_record.cost_units, 0)::INTEGER,
    COALESCE(v_quota_settings.max_pages_per_request, 1)::INTEGER,
    COALESCE(v_quota_settings.enabled, false),
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE,
    CASE 
      WHEN v_quota_settings.monthly_requests_limit > 0 THEN
        ROUND((COALESCE(v_usage_record.requests_made, 0)::NUMERIC / v_quota_settings.monthly_requests_limit::NUMERIC) * 100, 2)
      ELSE 0
    END;
END;
$$;

-- 6. Add updated_at triggers
CREATE TRIGGER update_jsearch_usage_updated_at 
  BEFORE UPDATE ON public.jsearch_usage
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

CREATE TRIGGER update_jsearch_quota_settings_updated_at 
  BEFORE UPDATE ON public.jsearch_quota_settings
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- 7. Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_jsearch_quota_settings_tier_enabled
  ON public.jsearch_quota_settings(tier, enabled);

-- 8. Add Row Level Security (RLS)
ALTER TABLE public.jsearch_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsearch_quota_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for jsearch_usage (users can only see their own usage)
CREATE POLICY "Users can view own JSearch usage" ON public.jsearch_usage
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own JSearch usage" ON public.jsearch_usage
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own JSearch usage" ON public.jsearch_usage
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- RLS policies for jsearch_quota_settings (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view JSearch quota settings" ON public.jsearch_quota_settings
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- 9. Add comments for documentation
COMMENT ON TABLE public.jsearch_usage IS 'Tracks JSearch API usage per user per month for quota management';
COMMENT ON TABLE public.jsearch_quota_settings IS 'JSearch API quota limits and settings per subscription tier';
COMMENT ON FUNCTION public.check_jsearch_usage_limits IS 'Checks current JSearch API usage against tier-based limits';
COMMENT ON FUNCTION public.debit_jsearch_usage IS 'Records JSearch API usage with cost multipliers for billing and quota tracking';
COMMENT ON FUNCTION public.get_jsearch_quota_status IS 'Returns comprehensive JSearch quota status for a user';

-- 10. Add constraint for valid usage periods (YYYY-MM format)
ALTER TABLE public.jsearch_usage 
  ADD CONSTRAINT valid_usage_period 
  CHECK (usage_period ~ '^\d{4}-\d{2}$');

-- 11. Create admin view for monitoring JSearch usage
CREATE OR REPLACE VIEW public.jsearch_usage_summary AS
SELECT 
  js.tier,
  COUNT(ju.user_id) as active_users,
  SUM(ju.requests_made) as total_requests,
  SUM(ju.cost_units) as total_cost_units,
  AVG(ju.requests_made) as avg_requests_per_user,
  js.monthly_requests_limit,
  js.enabled
FROM public.jsearch_quota_settings js
LEFT JOIN public.jsearch_usage ju ON true
LEFT JOIN public.profiles p ON ju.user_id = p.id AND p.subscription_tier = js.tier
WHERE ju.usage_period = TO_CHAR(NOW(), 'YYYY-MM') OR ju.usage_period IS NULL
GROUP BY js.tier, js.monthly_requests_limit, js.enabled
ORDER BY js.tier;

COMMENT ON VIEW public.jsearch_usage_summary IS 'Administrative view of JSearch usage across all tiers for current month';