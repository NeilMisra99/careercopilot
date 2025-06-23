-- Job-Resume Matching Enhancements Migration

-- Add user_id to application_resume_matches for better performance and RLS
ALTER TABLE public.application_resume_matches 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing records to have user_id (backfill)
UPDATE public.application_resume_matches 
SET user_id = a.user_id
FROM public.applications a
WHERE a.id = application_resume_matches.application_id
AND application_resume_matches.user_id IS NULL;

-- Make user_id NOT NULL after backfill
ALTER TABLE public.application_resume_matches 
ALTER COLUMN user_id SET NOT NULL;

-- Add the columns that the job-resume-matcher code expects
ALTER TABLE public.application_resume_matches 
ADD COLUMN IF NOT EXISTS job_analysis text, -- JSON string of job requirements analysis
ADD COLUMN IF NOT EXISTS strengths text, -- Bullet-pointed strengths
ADD COLUMN IF NOT EXISTS weaknesses text, -- Bullet-pointed weaknesses/gaps  
ADD COLUMN IF NOT EXISTS recommendations text; -- Bullet-pointed recommendations

-- Add performance indexes for job-resume matching
CREATE INDEX IF NOT EXISTS idx_application_resume_matches_user_id ON public.application_resume_matches(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_resume_matches_scores ON public.application_resume_matches(user_id, overall_fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_application_resume_matches_application_user ON public.application_resume_matches(application_id, user_id);

-- Add missing foreign key index for user_id in application_resume_matches
CREATE INDEX IF NOT EXISTS idx_application_resume_matches_user_id_fk ON public.application_resume_matches(user_id);

-- Create resume recommendations table for tracking optimization suggestions
CREATE TABLE IF NOT EXISTS public.resume_recommendations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE, -- Optional: recommendations can be job-specific
    
    -- Recommendation details
    recommendation_type varchar(50) NOT NULL, -- 'skill_gap', 'experience_gap', 'keyword_optimization', 'format_improvement'
    title text NOT NULL,
    description text NOT NULL,
    priority integer DEFAULT 3 CHECK (priority >= 1 AND priority <= 5), -- 1-5 (5 being highest)
    
    -- Recommendation data
    suggested_action text, -- JSON or text describing what to do
    impact_score integer, -- Expected improvement in match score (1-100)
    difficulty_level varchar(20) DEFAULT 'medium', -- 'easy', 'medium', 'hard'
    
    -- Status tracking
    is_applied boolean DEFAULT false,
    applied_at timestamp with time zone,
    user_feedback text, -- User's response to the recommendation
    
    -- Metadata
    confidence_score decimal(3,2), -- AI confidence in this recommendation (0.00-1.00)
    source_analysis jsonb, -- Store detailed analysis that led to this recommendation
    
    -- Timestamps
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for resume recommendations
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_user_id ON public.resume_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_resume_id ON public.resume_recommendations(resume_id, priority DESC);
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_application_id ON public.resume_recommendations(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_type_priority ON public.resume_recommendations(recommendation_type, priority DESC);
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_unapplied ON public.resume_recommendations(user_id, is_applied) WHERE is_applied = false;

-- Add missing foreign key indexes for resume_recommendations
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_user_id_fk ON public.resume_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_resume_id_fk ON public.resume_recommendations(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_recommendations_application_id_fk ON public.resume_recommendations(application_id);

-- Enable RLS for resume recommendations
ALTER TABLE public.resume_recommendations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for resume recommendations
CREATE POLICY "Users can manage their own resume recommendations" ON public.resume_recommendations
    FOR ALL USING ((select auth.uid()) = user_id);

-- Update RLS policy for application_resume_matches to use the new user_id field
DROP POLICY IF EXISTS "Users can view their application resume matches" ON public.application_resume_matches;

CREATE POLICY "Users can view their application resume matches" ON public.application_resume_matches
    FOR ALL USING ((select auth.uid()) = user_id);

-- Create trigger for resume recommendations updated_at
CREATE TRIGGER update_resume_recommendations_updated_at 
    BEFORE UPDATE ON public.resume_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add additional columns to applications table for better job description storage
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS job_url_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS last_scraped_at timestamp with time zone;

-- Create indexes for applications job matching queries
CREATE INDEX IF NOT EXISTS idx_applications_resume_fit_score ON public.applications(user_id, resume_fit_score DESC) WHERE resume_fit_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_job_analysis ON public.applications(user_id) WHERE job_requirements IS NOT NULL;

-- Enable realtime for matches and recommendations tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.application_resume_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.resume_recommendations;

-- Create table to track resume parsing completion events
CREATE TABLE IF NOT EXISTS public.resume_parsing_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type varchar(50) NOT NULL, -- 'parsing_completed', 'matching_triggered'
    created_at timestamp with time zone DEFAULT now()
);

-- Add missing foreign key indexes for resume_parsing_events
CREATE INDEX IF NOT EXISTS idx_resume_parsing_events_resume_id ON public.resume_parsing_events(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_parsing_events_user_id ON public.resume_parsing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_parsing_events_event_type ON public.resume_parsing_events(event_type, created_at DESC);

-- Create function to automatically trigger matching when resume parsing completes
CREATE OR REPLACE FUNCTION trigger_resume_matching()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Only trigger if parsing status changed to 'completed'
    IF OLD.parsing_status != 'completed' AND NEW.parsing_status = 'completed' THEN
        -- Log the parsing completion event
        INSERT INTO public.resume_parsing_events (resume_id, user_id, event_type)
        VALUES (NEW.id, NEW.user_id, 'parsing_completed');
        
        -- The actual matching will be triggered by the application layer
        -- listening for these events via realtime subscriptions
        RAISE NOTICE 'Resume parsing completed for resume_id: %, triggering matching', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for auto-matching when resume parsing completes
CREATE TRIGGER trigger_resume_matching_trigger
    AFTER UPDATE ON public.resumes
    FOR EACH ROW EXECUTE FUNCTION trigger_resume_matching();

-- Enable realtime for parsing events
ALTER PUBLICATION supabase_realtime ADD TABLE public.resume_parsing_events;


