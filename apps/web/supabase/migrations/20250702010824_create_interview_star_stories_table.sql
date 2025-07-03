-- Replace star_stories with interview_star_stories for session-specific STAR stories
-- This migration drops the generic star_stories table and creates interview_star_stories
-- that are tied to specific interview sessions (and thus to specific job applications)

-- First, drop the existing star_stories table and its dependencies
DROP POLICY IF EXISTS "Users can delete their own star stories" ON star_stories;
DROP POLICY IF EXISTS "Users can update their own star stories" ON star_stories;
DROP POLICY IF EXISTS "Users can insert their own star stories" ON star_stories;
DROP POLICY IF EXISTS "Users can view their own star stories" ON star_stories;

DROP INDEX IF EXISTS idx_star_stories_category;
DROP INDEX IF EXISTS idx_star_stories_user_id;

DROP TABLE IF EXISTS star_stories CASCADE;

-- Create interview_star_stories table following the same pattern as interview_questions and interview_briefs
CREATE TABLE interview_star_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  situation TEXT NOT NULL,
  task TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  skills_demonstrated TEXT[] DEFAULT '{}',
  achievement_metrics JSONB, -- quantified results (e.g., {"revenue_impact": "$50K", "efficiency_gain": "30%"})
  story_category TEXT, -- 'leadership', 'problem_solving', 'teamwork', 'innovation', 'communication', 'achievement', 'technical_expertise'
  confidence_score DECIMAL(3,2) DEFAULT 0.80 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  source_section TEXT, -- which resume section this came from ('experience', 'projects', 'achievements', etc.)
  usage_count INTEGER DEFAULT 0, -- how many times this story has been used/practiced
  relevance_score DECIMAL(3,2), -- AI-calculated relevance to the specific job application (0.00-1.00)
  job_alignment_notes TEXT, -- AI-generated notes on why this story is relevant to the specific job
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE interview_star_stories IS 'STAR stories specifically tailored for individual interview sessions, considering both resume content and job application context';
COMMENT ON COLUMN interview_star_stories.session_id IS 'Links story to specific interview session and thus to specific job application';
COMMENT ON COLUMN interview_star_stories.relevance_score IS 'AI-calculated score (0.00-1.00) indicating how relevant this story is to the specific job requirements';
COMMENT ON COLUMN interview_star_stories.job_alignment_notes IS 'AI-generated explanation of why this story is relevant to the specific job/company';
COMMENT ON COLUMN interview_star_stories.usage_count IS 'Tracks how often the user has practiced or used this story';

-- Add indexes for performance
CREATE INDEX idx_interview_star_stories_session_id ON interview_star_stories(session_id, relevance_score DESC);
CREATE INDEX idx_interview_star_stories_category ON interview_star_stories(session_id, story_category);
CREATE INDEX idx_interview_star_stories_confidence ON interview_star_stories(session_id, confidence_score DESC);
CREATE INDEX idx_interview_star_stories_usage ON interview_star_stories(session_id, usage_count);

-- Add GIN indexes for array searches
CREATE INDEX idx_interview_star_stories_skills ON interview_star_stories USING GIN (skills_demonstrated);

-- Add updated_at trigger
CREATE TRIGGER update_interview_star_stories_updated_at BEFORE UPDATE
    ON interview_star_stories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE interview_star_stories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (similar to interview_questions - access via session ownership)
CREATE POLICY "Users can view star stories for their sessions" ON interview_star_stories FOR SELECT USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);

CREATE POLICY "Users can insert star stories for their sessions" ON interview_star_stories FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);

CREATE POLICY "Users can update star stories for their sessions" ON interview_star_stories FOR UPDATE USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);

CREATE POLICY "Users can delete star stories for their sessions" ON interview_star_stories FOR DELETE USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);