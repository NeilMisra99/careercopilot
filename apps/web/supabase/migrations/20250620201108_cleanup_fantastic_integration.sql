-- =====================================================================
-- Cleanup Fantastic Integration Migration
-- Version 1 - 2025-06-20
-- =====================================================================

-- This migration removes all Fantastic-related database objects as we migrate to JSearch

-- 1. Drop Fantastic-related functions
DROP FUNCTION IF EXISTS public.check_fantastic_usage_limits(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.check_fantastic_usage_limits(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.debit_fantastic_usage(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.recalculate_fantastic_buckets();

-- 2. Drop Fantastic-related views
DROP VIEW IF EXISTS public.fantastic_usage_summary;

-- 3.1 Clean up any Fantastic-related triggers (run before dropping table)
DROP TRIGGER IF EXISTS update_fantastic_bucket_settings_updated_at ON public.fantastic_bucket_settings;

-- 3. Drop Fantastic-related tables
DROP TABLE IF EXISTS public.fantastic_bucket_settings CASCADE;

-- 4. Remove Fantastic vendor from scraper_vendor_usage (if it exists)
-- First, backup any existing data for reference
CREATE TABLE IF NOT EXISTS public.fantastic_usage_backup AS
SELECT * FROM public.scraper_vendor_usage 
WHERE vendor = 'fantastic';

-- Ensure fantastic_usage_backup has a surrogate primary key for uniqueness
ALTER TABLE public.fantastic_usage_backup
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.fantastic_usage_backup
  ADD CONSTRAINT fantastic_usage_backup_pkey PRIMARY KEY(id);

-- Add covering index for jsearch_usage.user_id foreign key to improve performance
CREATE INDEX IF NOT EXISTS idx_jsearch_usage_user_id ON public.jsearch_usage(user_id);

-- Then remove Fantastic entries
DELETE FROM public.scraper_vendor_usage WHERE vendor = 'fantastic';

-- 5. Remove any Fantastic-related indexes
DROP INDEX IF EXISTS idx_fantastic_bucket_settings_name;
DROP INDEX IF EXISTS idx_scraper_vendor_usage_user_period_vendor;

-- Recreate the vendor usage index without Fantastic dependency
CREATE INDEX IF NOT EXISTS idx_scraper_vendor_usage_user_period_vendor
  ON public.scraper_vendor_usage(user_id, period, vendor);

-- 6. Update any job records that might reference fantastic as source_vendor
UPDATE public.jobs 
SET source_vendor = 'legacy', 
    extra_data = COALESCE(extra_data, '{}')::jsonb || '{"migrated_from": "fantastic"}'::jsonb
WHERE source_vendor = 'fantastic';

-- Update user_jobs table if needed
UPDATE public.user_jobs 
SET notes = COALESCE(notes, '') || ' [Migrated from Fantastic]'
WHERE job_id IN (
  SELECT id FROM public.jobs 
  WHERE extra_data->>'migrated_from' = 'fantastic'
);

-- 7. Add comment documenting the cleanup
COMMENT ON TABLE public.fantastic_usage_backup IS 'Backup of Fantastic usage data before cleanup migration on 2025-06-20. Safe to drop after migration is verified.';

-- 8. Optional: Create a summary of what was cleaned up
DO $$
DECLARE
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM public.fantastic_usage_backup;
  
  RAISE NOTICE 'Fantastic cleanup completed:';
  RAISE NOTICE '- Backed up % Fantastic usage records', backup_count;
  RAISE NOTICE '- Dropped functions: check_fantastic_usage_limits, debit_fantastic_usage, recalculate_fantastic_buckets';
  RAISE NOTICE '- Dropped table: fantastic_bucket_settings';
  RAISE NOTICE '- Updated job records with fantastic source_vendor';
  RAISE NOTICE '- Cleanup migration completed successfully';
END $$;

-- =====================================================================
-- Fix ambiguity in increment_manual_search_usage function
-- Version 1 - 2025-06-21
-- =====================================================================

-- Drop existing function to avoid duplicate declaration
DROP FUNCTION IF EXISTS public.increment_manual_search_usage(UUID);

-- Re-create function with fully-qualified column references
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
    v_today DATE;
    v_current_count INTEGER;
BEGIN
    v_today := CURRENT_DATE;

    -- Get user's subscription tier
    SELECT COALESCE(pr.subscription_tier, 'free')
    INTO v_subscription_tier
    FROM public.profiles pr
    WHERE pr.id = p_user_id;

    -- Fallback to free if no profile row exists
    IF v_subscription_tier IS NULL THEN
        v_subscription_tier := 'free';
    END IF;

    -- Determine tier limits
    CASE v_subscription_tier
        WHEN 'free' THEN v_daily_limit := 5;
        WHEN 'pro' THEN v_daily_limit := 50;
        WHEN 'executive' THEN v_daily_limit := 200;
        ELSE v_daily_limit := 5;
    END CASE;

    -- Insert or update the usage row atomically
    INSERT INTO public.manual_search_usage AS msu (user_id, search_date, search_count, subscription_tier)
    VALUES (p_user_id, v_today, 1, v_subscription_tier)
    ON CONFLICT (user_id, search_date)
    DO UPDATE SET 
        search_count       = msu.search_count + 1,
        subscription_tier  = EXCLUDED.subscription_tier,
        updated_at         = NOW()
    RETURNING msu.search_count INTO v_current_count;

    -- Enforce tier limit
    IF v_current_count > v_daily_limit THEN
        -- Revert the increment that broke the limit
        UPDATE public.manual_search_usage AS msu
        SET search_count = msu.search_count - 1,
            updated_at   = NOW()
        WHERE msu.user_id = p_user_id
          AND msu.search_date = v_today;

        RETURN QUERY SELECT
            FALSE,
            v_current_count - 1,
            v_daily_limit,
            'Daily search limit exceeded';
    ELSE
        RETURN QUERY SELECT
            TRUE,
            v_current_count,
            v_daily_limit,
            'Search recorded successfully';
    END IF;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.increment_manual_search_usage(UUID) TO authenticated; 