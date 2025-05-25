BEGIN;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS source_email_id TEXT,
ADD COLUMN IF NOT EXISTS source_thread_id TEXT;

-- Add an index for potential lookups on source_email_id
CREATE INDEX IF NOT EXISTS idx_applications_source_email_id ON public.applications(source_email_id);

-- Optional: Add a comment to describe the new columns
COMMENT ON COLUMN public.applications.source_email_id IS 'The unique ID of the source email message that led to this application entry.';
COMMENT ON COLUMN public.applications.source_thread_id IS 'The unique ID of the source email thread related to this application.';

COMMIT; 