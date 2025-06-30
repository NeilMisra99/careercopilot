-- Add 'jsearch' to the discovery_source check constraint in applications table
-- This allows JSearch-discovered jobs to be saved with discovery_source = 'jsearch'

-- Drop the existing constraint
ALTER TABLE public.applications 
DROP CONSTRAINT IF EXISTS applications_discovery_source_check;

-- Add the updated constraint with 'jsearch' included
ALTER TABLE public.applications 
ADD CONSTRAINT applications_discovery_source_check 
CHECK (discovery_source IN ('linkedin', 'serper', 'brightdata', 'serper_web', 'manual', 'email_sync', 'jsearch'));

-- Add a comment explaining the constraint
COMMENT ON CONSTRAINT applications_discovery_source_check ON public.applications IS 'Ensures discovery_source is one of: linkedin, brightdata, serper, serper_web, manual, email_sync, jsearch';