CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix multiple permissive policies on user_email_integrations table
-- Drop all existing conflicting policies
DROP POLICY IF EXISTS "Allow users to view their own email integrations" ON public.user_email_integrations;
DROP POLICY IF EXISTS "Users can view their own email integrations" ON public.user_email_integrations;
DROP POLICY IF EXISTS "Users can receive realtime updates for their own integrations" ON public.user_email_integrations;
DROP POLICY IF EXISTS "Allow users to update their own email integrations" ON public.user_email_integrations;
DROP POLICY IF EXISTS "Allow users to delete their own email integrations" ON public.user_email_integrations;

-- Create single consolidated policies for each action
CREATE POLICY "Users can view their own email integrations" ON public.user_email_integrations
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own email integrations" ON public.user_email_integrations
    FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own email integrations" ON public.user_email_integrations
    FOR DELETE USING ((select auth.uid()) = user_id);

-- Note: INSERT is intentionally excluded - email integrations should only be created through OAuth flows

DROP POLICY IF EXISTS "Users can view their own failed emails" ON public.failed_email_reviews;

CREATE POLICY "Users can view their own failed emails" ON public.failed_email_reviews
    FOR ALL USING ((select auth.uid()) = user_id);

-- Fix unindexed foreign key performance issue
CREATE INDEX IF NOT EXISTS idx_failed_email_reviews_reviewed_by 
    ON public.failed_email_reviews(reviewed_by);

-- Add missing columns to applications table that are expected by the code
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS salary_range TEXT,
ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT FALSE;

-- Add comments for the new columns
COMMENT ON COLUMN public.applications.location IS 'Job location (city, state, remote, etc.)';
COMMENT ON COLUMN public.applications.salary_range IS 'Salary range or compensation details';
COMMENT ON COLUMN public.applications.manual_entry IS 'Whether this application was manually entered vs auto-detected from email';