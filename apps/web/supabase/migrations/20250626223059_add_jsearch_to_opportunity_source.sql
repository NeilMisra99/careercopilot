-- Add 'jsearch' to the opportunity_source check constraint in applications table
-- This allows JSearch-discovered jobs to be saved as opportunities

-- Drop the existing constraint
ALTER TABLE public.applications 
DROP CONSTRAINT IF EXISTS applications_opportunity_source_check;

-- Add the updated constraint with 'jsearch' included
ALTER TABLE public.applications 
ADD CONSTRAINT applications_opportunity_source_check 
CHECK (opportunity_source IN ('linkedin', 'serper', 'manual', 'email_sync', 'jsearch'));

-- Add a comment explaining the constraint
COMMENT ON CONSTRAINT applications_opportunity_source_check ON public.applications IS 'Restricts opportunity_source to valid job discovery sources including jsearch';