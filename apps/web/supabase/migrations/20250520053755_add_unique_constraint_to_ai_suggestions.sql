BEGIN;

-- Add a unique constraint to prevent duplicate suggestions for the same application and type.
-- The IF NOT EXISTS clause makes the migration script re-runnable without error 
-- if the index (which backs the unique constraint) already exists.
ALTER TABLE public.ai_suggestions
ADD CONSTRAINT uq_ai_suggestions_app_type UNIQUE (related_application_id, suggestion_type);

COMMIT;
