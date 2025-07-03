-- Enhance Interview Questions with Advanced Fields
-- This migration adds comprehensive fields to make questions more valuable and actionable

-- Add new columns to interview_questions table
ALTER TABLE interview_questions 
ADD COLUMN IF NOT EXISTS context TEXT, -- Why this question matters for the role/company
ADD COLUMN IF NOT EXISTS expected_structure TEXT, -- How to structure the answer (STAR, PAR, etc.)
ADD COLUMN IF NOT EXISTS follow_ups TEXT[] DEFAULT '{}', -- Potential interviewer follow-up questions
ADD COLUMN IF NOT EXISTS skills_assessed TEXT[] DEFAULT '{}', -- Key skills this question evaluates
ADD COLUMN IF NOT EXISTS estimated_time INTEGER, -- Expected answer duration in minutes
ADD COLUMN IF NOT EXISTS interview_flow_position TEXT CHECK (interview_flow_position IN ('opening', 'early', 'middle', 'late', 'closing')), -- Position in interview flow
ADD COLUMN IF NOT EXISTS personalization_notes TEXT, -- Tailored advice for this specific candidate
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2) DEFAULT 0.80 CHECK (quality_score >= 0.0 AND quality_score <= 1.0), -- AI-generated quality rating
ADD COLUMN IF NOT EXISTS complexity_level INTEGER DEFAULT 3 CHECK (complexity_level >= 1 AND complexity_level <= 5), -- 1=basic, 5=expert level
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}', -- Searchable tags like 'leadership', 'conflict-resolution'
ADD COLUMN IF NOT EXISTS preparation_time INTEGER, -- How long to prepare for this question (minutes)
ADD COLUMN IF NOT EXISTS answer_framework TEXT, -- Suggested framework: 'STAR', 'PAR', 'CAR', 'SAO'
ADD COLUMN IF NOT EXISTS industry_specific BOOLEAN DEFAULT false, -- Whether this is industry-specific
ADD COLUMN IF NOT EXISTS followup_depth INTEGER DEFAULT 1 CHECK (followup_depth >= 0 AND followup_depth <= 3); -- Expected follow-up complexity

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_interview_questions_tags ON interview_questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_interview_questions_skills_assessed ON interview_questions USING GIN(skills_assessed);
CREATE INDEX IF NOT EXISTS idx_interview_questions_flow_position ON interview_questions(interview_flow_position);
CREATE INDEX IF NOT EXISTS idx_interview_questions_quality_score ON interview_questions(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_interview_questions_complexity ON interview_questions(complexity_level);

-- Add useful indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_interview_questions_session_difficulty ON interview_questions(session_id, difficulty, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_interview_questions_session_type_flow ON interview_questions(session_id, question_type, interview_flow_position);

-- Add comments for documentation
COMMENT ON COLUMN interview_questions.context IS 'Explanation of why this question is relevant for the role, company, or candidate background';
COMMENT ON COLUMN interview_questions.expected_structure IS 'Guidance on how to structure the answer effectively';
COMMENT ON COLUMN interview_questions.follow_ups IS 'Array of potential follow-up questions the interviewer might ask';
COMMENT ON COLUMN interview_questions.skills_assessed IS 'Key skills or competencies this question evaluates';
COMMENT ON COLUMN interview_questions.estimated_time IS 'Expected time to answer this question in minutes';
COMMENT ON COLUMN interview_questions.interview_flow_position IS 'Where this question typically fits in interview flow';
COMMENT ON COLUMN interview_questions.personalization_notes IS 'Specific advice tailored to this candidates background';
COMMENT ON COLUMN interview_questions.quality_score IS 'AI-generated score for question relevance and quality (0.0-1.0)';
COMMENT ON COLUMN interview_questions.complexity_level IS 'Cognitive complexity level from 1 (basic) to 5 (expert)';
COMMENT ON COLUMN interview_questions.tags IS 'Searchable tags for categorizing questions by theme';
COMMENT ON COLUMN interview_questions.preparation_time IS 'Recommended preparation time for this question in minutes';
COMMENT ON COLUMN interview_questions.answer_framework IS 'Suggested answer structure framework';
COMMENT ON COLUMN interview_questions.industry_specific IS 'Whether this question requires industry-specific knowledge';
COMMENT ON COLUMN interview_questions.followup_depth IS 'Expected depth of follow-up questioning (0-3)';

-- Create a function to automatically set quality score based on question completeness
CREATE OR REPLACE FUNCTION calculate_question_quality_score()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
    score DECIMAL(3,2) := 0.5; -- Base score
BEGIN
    -- Award points for completeness
    IF NEW.context IS NOT NULL AND length(NEW.context) > 20 THEN
        score := score + 0.1;
    END IF;
    
    IF NEW.expected_structure IS NOT NULL AND length(NEW.expected_structure) > 10 THEN
        score := score + 0.1;
    END IF;
    
    IF NEW.follow_ups IS NOT NULL AND array_length(NEW.follow_ups, 1) > 0 THEN
        score := score + 0.1;
    END IF;
    
    IF NEW.skills_assessed IS NOT NULL AND array_length(NEW.skills_assessed, 1) > 0 THEN
        score := score + 0.1;
    END IF;
    
    IF NEW.estimated_time IS NOT NULL AND NEW.estimated_time > 0 THEN
        score := score + 0.05;
    END IF;
    
    IF NEW.personalization_notes IS NOT NULL AND length(NEW.personalization_notes) > 10 THEN
        score := score + 0.15;
    END IF;
    
    -- Cap at 1.0
    IF score > 1.0 THEN
        score := 1.0;
    END IF;
    
    NEW.quality_score := score;
    RETURN NEW;
END;
$$;

-- Create trigger to auto-calculate quality score
CREATE TRIGGER calculate_interview_question_quality
    BEFORE INSERT OR UPDATE ON interview_questions
    FOR EACH ROW
    WHEN (NEW.quality_score IS NULL OR NEW.quality_score = 0.80) -- Only auto-calculate if not explicitly set
    EXECUTE FUNCTION calculate_question_quality_score();