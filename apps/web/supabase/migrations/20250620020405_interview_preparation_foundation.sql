-- Interview Preparation Foundation Tables
-- This migration creates the core tables for the Interview Preparation Suite

-- Interview sessions table
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('behavioral', 'technical', 'company_specific', 'mixed')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generated interview questions
CREATE TABLE interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('behavioral', 'technical', 'company_culture', 'role_specific')),
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  suggested_answer TEXT,
  star_story_ids UUID[] DEFAULT '{}',
  source TEXT, -- 'ai_generated', 'company_research', 'role_analysis'
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STAR stories extracted from resumes
CREATE TABLE star_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  situation TEXT NOT NULL,
  task TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  skills_demonstrated TEXT[] DEFAULT '{}',
  achievement_metrics JSONB, -- quantified results
  story_category TEXT, -- 'leadership', 'problem_solving', 'teamwork', etc.
  confidence_score DECIMAL(3,2) DEFAULT 0.80,
  source_section TEXT, -- which resume section this came from
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interview prep briefs (company + role + resume analysis)
CREATE TABLE interview_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
  company_research JSONB, -- recent news, culture, values
  role_analysis JSONB, -- key requirements, team structure
  match_insights JSONB, -- strengths to highlight, gaps to address
  talking_points TEXT[],
  questions_to_ask TEXT[],
  red_flags_to_avoid TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_interview_sessions_user_id ON interview_sessions(user_id, created_at DESC);
CREATE INDEX idx_interview_sessions_application ON interview_sessions(application_id);
CREATE INDEX idx_interview_questions_session_id ON interview_questions(session_id, order_index);
CREATE INDEX idx_star_stories_user_id ON star_stories(user_id, resume_id);
CREATE INDEX idx_star_stories_category ON star_stories(user_id, story_category);
CREATE INDEX idx_interview_briefs_session_id ON interview_briefs(session_id);

-- Add updated_at trigger for interview_sessions
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

CREATE TRIGGER update_interview_sessions_updated_at BEFORE UPDATE
    ON interview_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interview_briefs_updated_at BEFORE UPDATE
    ON interview_briefs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_briefs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Interview Sessions policies
CREATE POLICY "Users can view their own interview sessions" ON interview_sessions FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can insert their own interview sessions" ON interview_sessions FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own interview sessions" ON interview_sessions FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own interview sessions" ON interview_sessions FOR DELETE USING (user_id = (select auth.uid()));

-- Interview Questions policies (via session ownership)
CREATE POLICY "Users can view questions for their sessions" ON interview_questions FOR SELECT USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);
CREATE POLICY "Users can insert questions for their sessions" ON interview_questions FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);
CREATE POLICY "Users can update questions for their sessions" ON interview_questions FOR UPDATE USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);
CREATE POLICY "Users can delete questions for their sessions" ON interview_questions FOR DELETE USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);

-- STAR Stories policies
CREATE POLICY "Users can view their own star stories" ON star_stories FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can insert their own star stories" ON star_stories FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own star stories" ON star_stories FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own star stories" ON star_stories FOR DELETE USING (user_id = (select auth.uid()));

-- Interview Briefs policies (via session ownership)
CREATE POLICY "Users can view briefs for their sessions" ON interview_briefs FOR SELECT USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);
CREATE POLICY "Users can insert briefs for their sessions" ON interview_briefs FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);
CREATE POLICY "Users can update briefs for their sessions" ON interview_briefs FOR UPDATE USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);
CREATE POLICY "Users can delete briefs for their sessions" ON interview_briefs FOR DELETE USING (
  session_id IN (SELECT id FROM interview_sessions WHERE user_id = (select auth.uid()))
);