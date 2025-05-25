CREATE TABLE public.user_email_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- e.g., 'gmail', 'outlook'
  email_address TEXT NOT NULL, -- The email address of the connected account
  refresh_token_encrypted TEXT NOT NULL, -- Stores IV:encrypted_refresh_token
  access_token_encrypted TEXT, -- Stores IV:encrypted_access_token (optional, can be fetched on demand)
  access_token_expires_at TIMESTAMPTZ,
  scopes JSONB, -- Granted OAuth scopes
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT, -- e.g., 'active', 'error', 'revoked', 'paused'
  sync_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_email_integrations_user_provider_email_unique UNIQUE (user_id, provider, email_address)
);

ALTER TABLE public.user_email_integrations ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups by user_id
CREATE INDEX idx_user_email_integrations_user_id ON public.user_email_integrations(user_id);

-- Optional: Trigger to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_email_integrations_updated_at
BEFORE UPDATE ON public.user_email_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies (examples, adjust to your needs)

-- Users can view their own integrations
CREATE POLICY "Allow users to view their own email integrations"
ON public.user_email_integrations
FOR SELECT
USING ((select auth.uid()) = user_id);

-- Users can insert their own integrations (service_role or backend handles this initially)
-- For direct insertion by users (if ever needed, though likely backend-only):
-- CREATE POLICY "Allow users to insert their own email integrations"
-- ON public.user_email_integrations
-- FOR INSERT
-- WITH CHECK (auth.uid() = user_id);

-- Users can update their own integrations (e.g., for sync status by a user-invoked action, or by backend)
CREATE POLICY "Allow users to update their own email integrations"
ON public.user_email_integrations
FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- Users can delete their own integrations
CREATE POLICY "Allow users to delete their own email integrations"
ON public.user_email_integrations
FOR DELETE
USING ((select auth.uid()) = user_id);

COMMENT ON COLUMN public.user_email_integrations.provider IS 'e.g., gmail, outlook';
COMMENT ON COLUMN public.user_email_integrations.email_address IS 'The email address of the connected account';
COMMENT ON COLUMN public.user_email_integrations.refresh_token_encrypted IS 'Stores IV:encrypted_refresh_token';
COMMENT ON COLUMN public.user_email_integrations.access_token_encrypted IS 'Stores IV:encrypted_access_token (optional, can be fetched on demand)';
COMMENT ON COLUMN public.user_email_integrations.sync_status IS 'e.g., active, error, revoked, paused';
