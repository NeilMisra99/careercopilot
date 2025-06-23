-- Add sync rate limiting fields to user_email_integrations table
-- This replaces the KV-based rate limiting system from Cloudflare Workers

-- Add rate limiting fields
ALTER TABLE public.user_email_integrations 
ADD COLUMN last_manual_sync_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN next_sync_allowed_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN sync_rate_limit_minutes INTEGER DEFAULT 5;

-- Add indexes for efficient rate limit checks
CREATE INDEX IF NOT EXISTS idx_user_email_integrations_rate_limiting 
ON public.user_email_integrations(user_id, provider, next_sync_allowed_at);

CREATE INDEX IF NOT EXISTS idx_user_email_integrations_last_manual_sync 
ON public.user_email_integrations(user_id, provider, last_manual_sync_at);

-- Add helpful comments
COMMENT ON COLUMN public.user_email_integrations.last_manual_sync_at IS 'Timestamp of the last manual sync initiated by the user';
COMMENT ON COLUMN public.user_email_integrations.next_sync_allowed_at IS 'Timestamp when the next manual sync is allowed (rate limiting)';
COMMENT ON COLUMN public.user_email_integrations.sync_rate_limit_minutes IS 'Number of minutes between allowed manual syncs (default: 5 minutes)';

-- Create a function to check if a user can sync now
CREATE OR REPLACE FUNCTION public.can_user_sync_now(p_user_id UUID, p_provider TEXT DEFAULT 'gmail')
RETURNS BOOLEAN 
SET search_path = ''
AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 
        FROM public.user_email_integrations 
        WHERE user_id = p_user_id 
        AND provider = p_provider 
        AND next_sync_allowed_at > NOW()
        AND sync_status = 'active'
    );
END;
$$ LANGUAGE plpgsql;

-- Create a function to update rate limiting after sync
CREATE OR REPLACE FUNCTION public.set_sync_rate_limit(p_user_id UUID, p_provider TEXT DEFAULT 'gmail')
RETURNS VOID 
SET search_path = ''
AS $$
BEGIN
    UPDATE public.user_email_integrations
    SET 
        last_manual_sync_at = NOW(),
        next_sync_allowed_at = NOW() + INTERVAL '1 minute' * sync_rate_limit_minutes
    WHERE user_id = p_user_id 
    AND provider = p_provider 
    AND sync_status = 'active';
END;
$$ LANGUAGE plpgsql;
