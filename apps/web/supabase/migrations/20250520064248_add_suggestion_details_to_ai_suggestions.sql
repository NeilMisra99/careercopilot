BEGIN;

ALTER TABLE public.ai_suggestions
ADD COLUMN IF NOT EXISTS suggestion_details JSONB;

COMMENT ON COLUMN public.ai_suggestions.suggestion_details IS 'Stores detailed structured data from the AI related to the suggestion, supplementing other specific columns.';

COMMIT; 