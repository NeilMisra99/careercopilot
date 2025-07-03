-- Drop the existing check constraint
ALTER TABLE public.interview_sessions 
DROP CONSTRAINT IF EXISTS interview_sessions_status_check;

-- Add new check constraint with updated status values
ALTER TABLE public.interview_sessions 
ADD CONSTRAINT interview_sessions_status_check 
CHECK (status IN ('preparing', 'ready', 'completed'));

-- Update the default value
ALTER TABLE public.interview_sessions 
ALTER COLUMN status SET DEFAULT 'preparing';

-- Add comment to document the new status flow
COMMENT ON COLUMN public.interview_sessions.status IS 'Session status: preparing (AI generating content), ready (AI done, ready to use), completed (user finished preparing)';