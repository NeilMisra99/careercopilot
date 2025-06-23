-- Add Bright Data vendor support and enhanced LinkedIn job fields

-- 1. Usage tracking table (monthly spend)
CREATE TABLE IF NOT EXISTS public.scraper_vendor_usage (
  vendor TEXT NOT NULL,
  month_key TEXT NOT NULL, -- e.g. '2025-06'
  month_spend_usd NUMERIC DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT scraper_vendor_usage_pk PRIMARY KEY (vendor, month_key)
);

-- Maintain updated_at automatically
CREATE OR REPLACE FUNCTION public.moddatetime()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::TEXT, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scraper_vendor_usage_updated ON public.scraper_vendor_usage;
CREATE TRIGGER trg_scraper_vendor_usage_updated
BEFORE UPDATE ON public.scraper_vendor_usage
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- 2. RPC helper to increment spend atomically
CREATE OR REPLACE FUNCTION public.increment_vendor_spend(p_vendor TEXT, p_amount NUMERIC)
RETURNS VOID
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_month TEXT := TO_CHAR(timezone('utc'::TEXT, NOW()), 'YYYY-MM');
BEGIN
  INSERT INTO public.scraper_vendor_usage (vendor, month_key, month_spend_usd)
  VALUES (p_vendor, v_month, p_amount)
  ON CONFLICT (vendor, month_key)
  DO UPDATE SET month_spend_usd = public.scraper_vendor_usage.month_spend_usd + p_amount;
END;
$$;

-- 3. Enhance linkedin_jobs to accommodate Bright Data fields
ALTER TABLE IF EXISTS public.linkedin_jobs
  ADD COLUMN IF NOT EXISTS source_vendor TEXT DEFAULT 'scrapingdog',
  ADD COLUMN IF NOT EXISTS salary_json JSONB,
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS experience_level TEXT,
  ADD COLUMN IF NOT EXISTS applicants INTEGER,
  ADD COLUMN IF NOT EXISTS extra_data JSONB;

-- 4. Helpful index
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_source_vendor ON public.linkedin_jobs(source_vendor);

-- 5. Cleanup obsolete view (moved to new analytics pipeline)
DROP VIEW IF EXISTS public.job_discovery_user_stats;

-- 6. Foreign-key performance indexes (safety – may already exist)
CREATE INDEX IF NOT EXISTS idx_user_email_integrations_user_id_fk 
  ON public.user_email_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_linkedin_jobs_job_id_fk 
  ON public.user_linkedin_jobs(job_id); 