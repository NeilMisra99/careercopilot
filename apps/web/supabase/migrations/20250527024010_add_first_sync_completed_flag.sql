-- Add first_sync_completed flag to track when users complete their initial email sync
-- This distinguishes between first-time setup sync and subsequent force syncs

ALTER TABLE public.user_email_integrations 
ADD COLUMN first_sync_completed BOOLEAN DEFAULT FALSE NOT NULL;

-- Add index for efficient querying of users who haven't completed first sync
CREATE INDEX IF NOT EXISTS idx_user_email_integrations_first_sync_completed 
ON public.user_email_integrations(user_id, first_sync_completed) 
WHERE first_sync_completed = FALSE;

-- Add comment for clarity
COMMENT ON COLUMN public.user_email_integrations.first_sync_completed IS 'TRUE when the user has completed their initial email sync from the setup page. Used to control access to setup vs dashboard.';
