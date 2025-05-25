BEGIN;

ALTER TABLE public.ai_suggestions
ADD COLUMN IF NOT EXISTS suggestion_lifecycle_status TEXT NOT NULL DEFAULT 'Pending';

COMMENT ON COLUMN public.ai_suggestions.suggestion_lifecycle_status IS 'The lifecycle status of the suggestion itself (e.g., Pending, Confirmed, Rejected by user).';

-- Optional: If you want to explicitly set is_confirmed/is_rejected based on this new status in the future, you might add triggers.
-- For now, default 'Pending' aligns with is_confirmed=false, is_rejected=false.

COMMIT;
