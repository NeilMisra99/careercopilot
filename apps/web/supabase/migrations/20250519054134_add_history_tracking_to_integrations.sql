-- Add last_history_id to track the last processed Gmail history record
ALTER TABLE public.user_email_integrations
ADD COLUMN IF NOT EXISTS last_history_id BIGINT;

-- Add last_history_synced_at to track when the last sync occurred for an integration
ALTER TABLE public.user_email_integrations
ADD COLUMN IF NOT EXISTS last_history_synced_at TIMESTAMPTZ;

-- Add an index for efficient querying of integrations due for sync
CREATE INDEX IF NOT EXISTS idx_user_email_integrations_sync_status_last_synced
ON public.user_email_integrations (sync_status, last_history_synced_at)
WHERE sync_status = 'active'; -- Only index active integrations, as these are the ones we'll query

-- Optional: Add an index on user_id and provider if not already covered and frequently used for fetching specific integrations
-- CREATE INDEX IF NOT EXISTS idx_user_email_integrations_user_id_provider ON public.user_email_integrations(user_id, provider);
-- This might already be covered by idx_user_email_integrations_user_id if provider is always 'gmail' for this table for now.

COMMENT ON COLUMN public.user_email_integrations.last_history_id IS 'The last Gmail history ID processed for this integration. Used to fetch only new changes since the last sync.';
COMMENT ON COLUMN public.user_email_integrations.last_history_synced_at IS 'Timestamp of the last successful email fetch and queue operation for this integration.'; 