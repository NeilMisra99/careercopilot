-- Enable realtime for Interview Prep tables
-- This allows real-time updates for interview question/brief generation progress

-- Add generation progress columns to interview_sessions
ALTER TABLE interview_sessions 
ADD COLUMN IF NOT EXISTS question_generation_status TEXT NOT NULL DEFAULT 'idle' CHECK (question_generation_status IN ('idle', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS brief_generation_status TEXT NOT NULL DEFAULT 'idle' CHECK (brief_generation_status IN ('idle', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS generation_progress INTEGER DEFAULT 0 CHECK (generation_progress >= 0 AND generation_progress <= 100),
ADD COLUMN IF NOT EXISTS generation_metadata JSONB; -- For storing generation progress details

-- Create indexes for efficient querying of generation status
CREATE INDEX IF NOT EXISTS idx_interview_sessions_question_generation 
ON interview_sessions(user_id, question_generation_status) 
WHERE question_generation_status IN ('processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_interview_sessions_brief_generation 
ON interview_sessions(user_id, brief_generation_status) 
WHERE brief_generation_status IN ('processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_interview_sessions_generation_progress 
ON interview_sessions(user_id, generation_progress) 
WHERE generation_progress > 0 AND generation_progress < 100;

-- Add covering indexes for foreign key columns (performance fixes)
CREATE INDEX IF NOT EXISTS idx_interview_questions_session_id_fkey 
  ON interview_questions(session_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_resume_id_fkey 
  ON interview_sessions(resume_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id_fkey 
  ON interview_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_star_stories_resume_id_fkey 
  ON star_stories(resume_id);

CREATE INDEX IF NOT EXISTS idx_star_stories_user_id_fkey 
  ON star_stories(user_id);

-- Add tables to realtime publication for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.interview_sessions;

-- Add comments for documentation
COMMENT ON COLUMN interview_sessions.question_generation_status IS 'Status of AI question generation: idle, processing, completed, failed';
COMMENT ON COLUMN interview_sessions.brief_generation_status IS 'Status of AI brief generation: idle, processing, completed, failed';
COMMENT ON COLUMN interview_sessions.generation_progress IS 'Progress percentage (0-100) for current generation task';
COMMENT ON COLUMN interview_sessions.generation_metadata IS 'Metadata for generation progress (step details, error messages, etc.)';
