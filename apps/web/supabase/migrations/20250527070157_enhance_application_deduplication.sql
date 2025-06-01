-- Enhance application deduplication support

-- Enable pg_trgm extension for similarity functions
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Add application sources table to track multiple sources for the same application
CREATE TABLE IF NOT EXISTS public.application_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('email', 'manual', 'linkedin', 'indeed', 'glassdoor', 'company_direct', 'recruiter')),
    source_email_id TEXT,
    source_thread_id TEXT, 
    source_url TEXT,
    source_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(application_id, source_type, source_email_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_application_sources_application_id ON public.application_sources(application_id);
CREATE INDEX IF NOT EXISTS idx_application_sources_source_type ON public.application_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_application_sources_source_email_id ON public.application_sources(source_email_id);

-- Add trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.application_sources
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- Add deduplication tracking to applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS duplicate_detection_status TEXT CHECK (duplicate_detection_status IN ('pending', 'analyzed', 'merged_from', 'merged_to')) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS duplicate_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS duplicate_reasoning TEXT,
ADD COLUMN IF NOT EXISTS merged_from_application_id UUID REFERENCES public.applications(id),
ADD COLUMN IF NOT EXISTS duplicate_analysis_at TIMESTAMPTZ;

-- Add indexes for deduplication queries
CREATE INDEX IF NOT EXISTS idx_applications_duplicate_status ON public.applications(duplicate_detection_status);
CREATE INDEX IF NOT EXISTS idx_applications_merged_from ON public.applications(merged_from_application_id);

-- Function to normalize company names for better duplicate detection
CREATE OR REPLACE FUNCTION public.normalize_company_name(company_name TEXT)
RETURNS TEXT 
SET search_path = ''
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF company_name IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Convert to lowercase and trim
    company_name := LOWER(TRIM(company_name));
    
    -- Remove common legal entity suffixes
    company_name := REGEXP_REPLACE(company_name, '\s+(inc\.?|corp\.?|corporation|ltd\.?|limited|llc|co\.?)$', '', 'i');
    
    -- Remove common punctuation
    company_name := REGEXP_REPLACE(company_name, '[.,\-_]', ' ', 'g');
    
    -- Normalize multiple spaces to single space
    company_name := REGEXP_REPLACE(company_name, '\s+', ' ', 'g');
    
    -- Trim again after transformations
    company_name := TRIM(company_name);
    
    RETURN company_name;
END;
$$;

-- Function to normalize role titles for better duplicate detection  
CREATE OR REPLACE FUNCTION public.normalize_role_title(role_title TEXT)
RETURNS TEXT 
SET search_path = ''
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF role_title IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Convert to lowercase and trim
    role_title := LOWER(TRIM(role_title));
    
    -- Remove common suffixes like (Remote), (Hybrid), etc.
    role_title := REGEXP_REPLACE(role_title, '\s*\([^)]*\)\s*$', '', 'i');
    
    -- Normalize common abbreviations
    role_title := REGEXP_REPLACE(role_title, '\bsr\.?\s+', 'senior ', 'gi');
    role_title := REGEXP_REPLACE(role_title, '\bjr\.?\s+', 'junior ', 'gi');
    role_title := REGEXP_REPLACE(role_title, '\bfrontend\b', 'front end', 'gi');
    role_title := REGEXP_REPLACE(role_title, '\bbackend\b', 'back end', 'gi');
    role_title := REGEXP_REPLACE(role_title, '\bfullstack\b', 'full stack', 'gi');
    
    -- Normalize multiple spaces to single space
    role_title := REGEXP_REPLACE(role_title, '\s+', ' ', 'g');
    
    -- Trim again after transformations
    role_title := TRIM(role_title);
    
    RETURN role_title;
END;
$$;

-- Add computed columns for normalized names (as indexes)
CREATE INDEX IF NOT EXISTS idx_applications_normalized_company ON public.applications(normalize_company_name(company_name));
CREATE INDEX IF NOT EXISTS idx_applications_normalized_role ON public.applications(normalize_role_title(role));

-- View for finding potential duplicates
CREATE OR REPLACE VIEW public.potential_duplicate_applications AS
SELECT 
    a1.id as app1_id,
    a1.company_name as app1_company,
    a1.role as app1_role,
    a1.application_date as app1_date,
    a1.duplicate_detection_status as app1_status,
    
    a2.id as app2_id, 
    a2.company_name as app2_company,
    a2.role as app2_role,
    a2.application_date as app2_date,
    a2.duplicate_detection_status as app2_status,
    
    -- Similarity scores
    similarity(normalize_company_name(a1.company_name), normalize_company_name(a2.company_name)) as company_similarity,
    similarity(normalize_role_title(a1.role), normalize_role_title(a2.role)) as role_similarity,
    ABS(a1.application_date::DATE - a2.application_date::DATE) as date_diff_days
    
FROM public.applications a1
JOIN public.applications a2 ON a1.user_id = a2.user_id AND a1.id < a2.id
WHERE 
    -- Only consider applications that haven't been processed or merged
    a1.duplicate_detection_status IN ('pending', 'analyzed')
    AND a2.duplicate_detection_status IN ('pending', 'analyzed')
    -- Company names are somewhat similar
    AND similarity(normalize_company_name(a1.company_name), normalize_company_name(a2.company_name)) > 0.3
    -- Roles are somewhat similar
    AND similarity(normalize_role_title(a1.role), normalize_role_title(a2.role)) > 0.5
    -- Applied within reasonable timeframe (90 days)
    AND ABS(a1.application_date::DATE - a2.application_date::DATE) <= 90;

-- Enable Row Level Security
ALTER TABLE public.application_sources ENABLE ROW LEVEL SECURITY;

-- RLS policies for application_sources
CREATE POLICY "Users can view their own application sources" ON public.application_sources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.applications 
      WHERE applications.id = application_sources.application_id 
      AND applications.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert their own application sources" ON public.application_sources
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications 
      WHERE applications.id = application_sources.application_id 
      AND applications.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update their own application sources" ON public.application_sources
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.applications 
      WHERE applications.id = application_sources.application_id 
      AND applications.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete their own application sources" ON public.application_sources
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.applications 
      WHERE applications.id = application_sources.application_id 
      AND applications.user_id = (select auth.uid())
    )
  );

-- Add comment
COMMENT ON TABLE public.application_sources IS 'Tracks multiple sources for the same job application (email, LinkedIn, company direct, etc.)';
COMMENT ON TABLE public.applications IS 'Enhanced with deduplication tracking and merged application support';
