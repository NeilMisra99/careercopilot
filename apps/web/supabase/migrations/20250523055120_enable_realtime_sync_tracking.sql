-- Enable realtime for sync progress tracking
-- This allows frontend components to subscribe to sync state changes

-- Add user_email_integrations table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE user_email_integrations;

-- Ensure RLS is enabled for security
ALTER TABLE user_email_integrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for users to only see their own integrations
CREATE POLICY "Users can view their own email integrations" ON user_email_integrations
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Create RLS policy for realtime updates (users can only see updates to their own data)
CREATE POLICY "Users can receive realtime updates for their own integrations" ON user_email_integrations
  FOR ALL USING ((select auth.uid()) = user_id);
