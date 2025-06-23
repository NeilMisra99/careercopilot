-- Resume Foundation Schema
-- Phase 1: Resume Management and Job Matching

-- Create resume storage table
CREATE TABLE IF NOT EXISTS public.resumes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Basic resume info
    name varchar(255) NOT NULL,
    version_number integer DEFAULT 1,
    is_primary boolean DEFAULT false,
    
    -- File storage
    file_path text, -- Supabase Storage path
    file_name text,
    file_size bigint,
    file_type varchar(50), -- 'pdf', 'docx', etc.
    
    -- Parsing status
    parsing_status varchar(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    parsing_error text,
    parsed_at timestamp with time zone,
    
    -- AI extraction results
    raw_text text, -- Full extracted text
    parsed_data jsonb, -- Full AI parsing result
    
    -- Structured data (extracted by AI)
    full_name text,
    email text,
    phone text,
    location text,
    summary text,
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    
    -- Constraints
    UNIQUE(user_id, name, version_number)
);

-- Create experiences table
CREATE TABLE IF NOT EXISTS public.resume_experiences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    
    -- Experience details
    company_name text NOT NULL,
    job_title text NOT NULL,
    start_date date,
    end_date date, -- NULL for current position
    is_current boolean DEFAULT false,
    location text,
    
    -- Description and achievements
    description text,
    achievements text[], -- Array of achievement bullets
    
    -- Skills used in this role
    skills_used text[], -- Array of skills
    
    -- AI confidence and metadata
    ai_confidence decimal(3,2), -- 0.00 to 1.00
    ai_extracted boolean DEFAULT true,
    
    -- Ordering within resume
    display_order integer DEFAULT 0,
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create education table
CREATE TABLE IF NOT EXISTS public.resume_education (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    
    -- Education details
    institution text NOT NULL,
    degree text,
    field_of_study text,
    start_date date,
    end_date date,
    grade_gpa text,
    
    -- Additional info
    description text,
    relevant_coursework text[],
    
    -- AI metadata
    ai_confidence decimal(3,2),
    ai_extracted boolean DEFAULT true,
    
    -- Ordering
    display_order integer DEFAULT 0,
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create skills table with categorization
CREATE TABLE IF NOT EXISTS public.resume_skills (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    
    -- Skill details
    skill_name text NOT NULL,
    skill_category varchar(100), -- 'programming', 'frameworks', 'tools', 'languages', 'soft_skills', etc.
    proficiency_level text, -- 'beginner', 'intermediate', 'advanced', 'expert', or longer AI-generated descriptions
    years_experience integer,
    
    -- Context where skill was mentioned
    mentioned_in_section varchar(100), -- 'experience', 'skills', 'projects', etc.
    context_company text, -- Which company/experience it was mentioned with
    
    -- AI extraction metadata
    ai_confidence decimal(3,2),
    ai_extracted boolean DEFAULT true,
    normalized_skill_name text, -- AI-normalized version for matching
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    
    -- Prevent duplicate skills per resume
    UNIQUE(resume_id, skill_name)
);

-- Create projects table (for personal/side projects)
CREATE TABLE IF NOT EXISTS public.resume_projects (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    
    -- Project details
    project_name text NOT NULL,
    description text,
    technologies_used text[],
    project_url text,
    github_url text,
    start_date date,
    end_date date,
    
    -- AI metadata
    ai_confidence decimal(3,2),
    ai_extracted boolean DEFAULT true,
    
    -- Ordering
    display_order integer DEFAULT 0,
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create certifications table
CREATE TABLE IF NOT EXISTS public.resume_certifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    
    -- Certification details
    certification_name text NOT NULL,
    issuing_organization text,
    issue_date date,
    expiry_date date,
    credential_id text,
    credential_url text,
    
    -- AI metadata
    ai_confidence decimal(3,2),
    ai_extracted boolean DEFAULT true,
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create job-resume matching table
CREATE TABLE IF NOT EXISTS public.application_resume_matches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    
    -- Overall matching scores
    overall_fit_score decimal(4,2), -- 0.00 to 100.00
    skills_match_score decimal(4,2),
    experience_match_score decimal(4,2),
    education_match_score decimal(4,2),
    
    -- Matching details
    matched_skills text[], -- Skills that match job requirements
    missing_skills text[], -- Skills gap analysis
    relevant_experiences jsonb, -- Which experiences are most relevant
    
    -- Job requirements analysis
    job_requirements_extracted text[],
    job_required_skills text[],
    job_preferred_skills text[],
    job_experience_level text, -- 'entry', 'mid', 'senior', 'lead', 'executive', or longer AI-generated descriptions
    job_education_requirements text[],
    
    -- AI analysis metadata
    match_analysis_confidence decimal(3,2),
    match_reasoning text, -- AI explanation of the match
    suggestions_for_improvement text[], -- How to improve the match
    
    -- Timestamps
    calculated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    
    -- Ensure one match per application-resume pair
    UNIQUE(application_id, resume_id)
);

-- Add resume columns to existing applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS resume_id uuid REFERENCES public.resumes(id),
ADD COLUMN IF NOT EXISTS resume_fit_score decimal(4,2),
ADD COLUMN IF NOT EXISTS job_description text,
ADD COLUMN IF NOT EXISTS job_requirements text[],
ADD COLUMN IF NOT EXISTS required_skills text[],
ADD COLUMN IF NOT EXISTS preferred_skills text[];

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_parsing_status ON public.resumes(parsing_status);
CREATE INDEX IF NOT EXISTS idx_resumes_is_primary ON public.resumes(user_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_resume_experiences_resume_id ON public.resume_experiences(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_experiences_company ON public.resume_experiences(company_name);
CREATE INDEX IF NOT EXISTS idx_resume_experiences_current ON public.resume_experiences(is_current);

CREATE INDEX IF NOT EXISTS idx_resume_education_resume_id ON public.resume_education(resume_id);

CREATE INDEX IF NOT EXISTS idx_resume_skills_resume_id ON public.resume_skills(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_skills_category ON public.resume_skills(skill_category);
CREATE INDEX IF NOT EXISTS idx_resume_skills_normalized ON public.resume_skills(normalized_skill_name);

CREATE INDEX IF NOT EXISTS idx_resume_projects_resume_id ON public.resume_projects(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_certifications_resume_id ON public.resume_certifications(resume_id);

CREATE INDEX IF NOT EXISTS idx_application_resume_matches_application ON public.application_resume_matches(application_id);
CREATE INDEX IF NOT EXISTS idx_application_resume_matches_resume ON public.application_resume_matches(resume_id);
CREATE INDEX IF NOT EXISTS idx_application_resume_matches_score ON public.application_resume_matches(overall_fit_score);

-- Add missing foreign key index for applications.resume_id
CREATE INDEX IF NOT EXISTS idx_applications_resume_id ON public.applications(resume_id);

-- Enable Row Level Security
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_resume_matches ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can manage their own resumes" ON public.resumes
    FOR ALL USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can manage their resume experiences" ON public.resume_experiences
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.resumes 
            WHERE id = resume_experiences.resume_id 
            AND user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can manage their resume education" ON public.resume_education
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.resumes 
            WHERE id = resume_education.resume_id 
            AND user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can manage their resume skills" ON public.resume_skills
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.resumes 
            WHERE id = resume_skills.resume_id 
            AND user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can manage their resume projects" ON public.resume_projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.resumes 
            WHERE id = resume_projects.resume_id 
            AND user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can manage their resume certifications" ON public.resume_certifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.resumes 
            WHERE id = resume_certifications.resume_id 
            AND user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can view their application resume matches" ON public.application_resume_matches
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.resumes r ON r.id = application_resume_matches.resume_id
            WHERE a.id = application_resume_matches.application_id 
            AND a.user_id = (select auth.uid())
            AND r.user_id = (select auth.uid())
        )
    );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON public.resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resume_experiences_updated_at BEFORE UPDATE ON public.resume_experiences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resume_education_updated_at BEFORE UPDATE ON public.resume_education
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resume_skills_updated_at BEFORE UPDATE ON public.resume_skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resume_projects_updated_at BEFORE UPDATE ON public.resume_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resume_certifications_updated_at BEFORE UPDATE ON public.resume_certifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_application_resume_matches_updated_at BEFORE UPDATE ON public.application_resume_matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to ensure only one primary resume per user
CREATE OR REPLACE FUNCTION ensure_single_primary_resume()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- If this resume is being set as primary, unset all other primary resumes for this user
    IF NEW.is_primary = true THEN
        UPDATE public.resumes 
        SET is_primary = false 
        WHERE user_id = NEW.user_id 
        AND id != NEW.id 
        AND is_primary = true;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for primary resume constraint
CREATE TRIGGER ensure_single_primary_resume_trigger
    BEFORE INSERT OR UPDATE ON public.resumes
    FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_resume();
