-- Add star_generation_status column to interview_sessions table
-- This follows the same pattern as question_generation_status and brief_generation_status

ALTER TABLE public.interview_sessions 
ADD COLUMN star_generation_status text DEFAULT NULL;

-- Add a comment to document the column
COMMENT ON COLUMN public.interview_sessions.star_generation_status IS 'Status of STAR story generation: null (not started), processing, completed, failed';