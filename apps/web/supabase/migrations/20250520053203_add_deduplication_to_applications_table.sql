BEGIN;

-- Ensure application_date column exists. If it doesn't, add it with a default based on applied_at.
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS application_date DATE;

-- 1. Back-fill application_date where NULL.
UPDATE public.applications
SET application_date = COALESCE(applied_at::date, created_at::date, '1970-01-01'::date)
WHERE application_date IS NULL;

ALTER TABLE public.applications
ALTER COLUMN application_date SET NOT NULL;

-- 2. Create an IMMUTABLE helper function for the dedupe key (once per database)
CREATE OR REPLACE FUNCTION public.make_application_dedupe_key(p_company text, p_app_date date)
RETURNS text
SET search_path = ''
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(trim(p_company)) || '|' || to_char(p_app_date, 'YYYY-MM-DD');
$$;

-- 3. Drop existing faulty column if it exists
ALTER TABLE public.applications
DROP COLUMN IF EXISTS dedupe_key;

-- 4. Add the new generated column using the immutable helper
ALTER TABLE public.applications
ADD COLUMN dedupe_key text GENERATED ALWAYS AS (
    public.make_application_dedupe_key(company_name, application_date)
) STORED;

-- 5. Unique index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_dedupe
ON public.applications(user_id, dedupe_key);

COMMIT;
