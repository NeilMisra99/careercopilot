-- Update jobs source_vendor constraint to remove brightdata/fantastic and add jsearch
-- This fixes the constraint violation when inserting JSearch jobs

-- Drop the existing constraint
ALTER TABLE public.jobs 
DROP CONSTRAINT IF EXISTS jobs_source_vendor_check;

-- Add new constraint with updated vendor list
-- Removed: brightdata, fantastic
-- Added: jsearch
ALTER TABLE public.jobs 
ADD CONSTRAINT jobs_source_vendor_check 
CHECK (source_vendor IN ('linkedin','serper','manual','jsearch'));