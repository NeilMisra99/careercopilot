-- Add sync status tracking columns to user_email_integrations table
ALTER TABLE public.user_email_integrations ADD COLUMN sync_in_progress BOOLEAN DEFAULT FALSE;
ALTER TABLE public.user_email_integrations ADD COLUMN last_sync_started_at TIMESTAMPTZ;
ALTER TABLE public.user_email_integrations ADD COLUMN last_sync_completed_at TIMESTAMPTZ;
ALTER TABLE public.user_email_integrations ADD COLUMN last_sync_summary JSONB; -- { emails_processed: 5, applications_found: 2, error: null }

-- Add index for efficient querying of sync status
CREATE INDEX IF NOT EXISTS idx_user_email_integrations_sync_in_progress 
ON public.user_email_integrations(user_id, sync_in_progress) 
WHERE sync_in_progress = TRUE;

-- Add comments for clarity
COMMENT ON COLUMN public.user_email_integrations.sync_in_progress IS 'TRUE when a sync operation is currently running for this integration';
COMMENT ON COLUMN public.user_email_integrations.last_sync_started_at IS 'Timestamp when the most recent sync operation started';
COMMENT ON COLUMN public.user_email_integrations.last_sync_completed_at IS 'Timestamp when the most recent sync operation completed (success or failure)';
COMMENT ON COLUMN public.user_email_integrations.last_sync_summary IS 'JSON summary of the last sync operation including counts and any errors';
