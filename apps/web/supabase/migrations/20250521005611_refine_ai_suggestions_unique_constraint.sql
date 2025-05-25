BEGIN;

-- 1. Drop the existing unique constraint.
ALTER TABLE public.ai_suggestions
DROP CONSTRAINT IF EXISTS uq_ai_suggestions_app_type;

-- 2. Add a new unique constraint that includes suggested_status.
-- Using NULLS NOT DISTINCT ensures that multiple rows with NULL in suggested_status
-- (for the same related_application_id and suggestion_type) are considered duplicates.
-- This is available in PostgreSQL 15+. If using an older version, a functional unique index
-- using COALESCE(suggested_status, 'some_magic_null_placeholder_string') might be needed.
-- Assuming Supabase uses a recent enough PostgreSQL version.
ALTER TABLE public.ai_suggestions
ADD CONSTRAINT uq_ai_suggestions_app_type_status 
UNIQUE NULLS NOT DISTINCT (related_application_id, suggestion_type, suggested_status);

COMMENT ON CONSTRAINT uq_ai_suggestions_app_type_status ON public.ai_suggestions 
IS 'Ensures that AI suggestions are unique based on the application, type, and the specific status suggested. Allows multiple status updates for the same application if the status is different.';

COMMIT;
