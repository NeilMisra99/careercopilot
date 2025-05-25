BEGIN;

-- 1. Drop the existing unique index that depends on the old dedupe_key.
DROP INDEX IF EXISTS public.idx_applications_user_dedupe;

-- 2. Drop the old dedupe_key column. This removes its dependency on the old function.
ALTER TABLE public.applications
DROP COLUMN IF EXISTS dedupe_key;

-- 3. Drop the old function signature.
DROP FUNCTION IF EXISTS public.make_application_dedupe_key(text, date);

-- 4. Create the new IMMUTABLE helper function for the dedupe key to include role.
-- Drop the new signature just in case it somehow exists from a partial previous attempt.
DROP FUNCTION IF EXISTS public.make_application_dedupe_key(text, text, date);

CREATE OR REPLACE FUNCTION public.make_application_dedupe_key(p_company TEXT, p_role TEXT, p_app_date DATE)
RETURNS TEXT
SET search_path = ''
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(trim(p_company)) || '|' || lower(trim(COALESCE(p_role, ''))) || '|' || to_char(p_app_date, 'YYYY-MM-DD');
$$;
COMMENT ON FUNCTION public.make_application_dedupe_key(TEXT, TEXT, DATE) IS 'Creates a deduplication key using company, role, and application date. Role is coalesced to empty string if NULL.';

-- 5. Add the new generated column using the updated immutable helper function
-- that now includes the role.
ALTER TABLE public.applications
ADD COLUMN dedupe_key TEXT GENERATED ALWAYS AS (
    public.make_application_dedupe_key(company_name, role, application_date)
) STORED;
COMMENT ON COLUMN public.applications.dedupe_key IS 'Generated key for deduplication, based on user_id, company_name, role, and application_date.';

-- 6. Recreate the unique index for deduplication using the new dedupe_key.
CREATE UNIQUE INDEX idx_applications_user_dedupe
ON public.applications(user_id, dedupe_key);

COMMIT;
