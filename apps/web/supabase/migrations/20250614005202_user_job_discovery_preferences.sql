-- Phase 1: Proactive Job Discovery Infrastructure
-- User job discovery preferences, subscription tiers, and related tables

-- ❶ Add subscription tier to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'executive'));

-- ❷ Create user job discovery preferences table
CREATE TABLE public.user_job_discovery_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Job search criteria
    target_roles TEXT[] DEFAULT '{}', -- Array of role titles: ["Senior Frontend Engineer", "React Developer"]
    target_companies TEXT[] DEFAULT '{}', -- Array of company names: ["Google", "Apple", "Microsoft"]
    target_locations TEXT[] DEFAULT '{}', -- Array of locations: ["Remote", "San Francisco", "New York"]
    keywords TEXT[] DEFAULT '{}', -- Additional keywords: ["React", "TypeScript", "Node.js"]
    
    -- Search preferences
    salary_range_min INTEGER, -- Minimum salary expectation
    salary_range_max INTEGER, -- Maximum salary expectation
    experience_level TEXT, -- "Entry level", "Mid-senior level", etc.
    job_types TEXT[] DEFAULT '{}', -- ["Full-time", "Contract", "Remote"]
    excluded_companies TEXT[] DEFAULT '{}', -- Companies to avoid
    
    -- Discovery settings
    auto_discovery_enabled BOOLEAN DEFAULT true,
    discovery_frequency TEXT DEFAULT 'weekly' CHECK (discovery_frequency IN ('daily', 'weekly', 'monthly', 'disabled')),
    max_jobs_per_discovery INTEGER DEFAULT 25, -- Limit jobs per discovery run
    
    -- Notification preferences
    email_notifications BOOLEAN DEFAULT true,
    instant_notifications BOOLEAN DEFAULT false, -- For high-priority matches
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ❂ Indexes for user job discovery preferences
CREATE INDEX idx_user_job_discovery_preferences_user_id ON public.user_job_discovery_preferences(user_id);
CREATE INDEX idx_user_job_discovery_preferences_auto_enabled ON public.user_job_discovery_preferences(user_id, auto_discovery_enabled) WHERE auto_discovery_enabled = true;
CREATE INDEX idx_user_job_discovery_preferences_frequency ON public.user_job_discovery_preferences(discovery_frequency);

-- Add missing foreign key indexes to fix unindexed foreign key warnings
CREATE INDEX IF NOT EXISTS idx_user_job_discovery_preferences_user_id_fk ON public.user_job_discovery_preferences(user_id);

-- ❂ RLS Policy
ALTER TABLE public.user_job_discovery_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own job discovery preferences" ON public.user_job_discovery_preferences
    FOR ALL USING ((select auth.uid()) = user_id);

-- ❸ Create job discovery runs table (tracking proactive discovery execution)
CREATE TABLE public.job_discovery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Run details
    run_type TEXT NOT NULL CHECK (run_type IN ('scheduled', 'manual', 'test')),
    discovery_source TEXT NOT NULL CHECK (discovery_source IN ('linkedin', 'serper_web', 'combined')),
    
    -- Search parameters used
    search_criteria JSONB NOT NULL, -- Store the actual search params used
    
    -- Results
    jobs_discovered INTEGER DEFAULT 0,
    jobs_created_as_opportunities INTEGER DEFAULT 0,
    jobs_deduplicated INTEGER DEFAULT 0, -- Jobs we already had
    
    -- Status tracking
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error', 'cancelled')),
    error_message TEXT,
    
    -- Performance metrics
    execution_time_ms INTEGER, -- How long the discovery took
    api_calls_made INTEGER DEFAULT 0,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ❂ Indexes for job discovery runs
CREATE INDEX idx_job_discovery_runs_user_id ON public.job_discovery_runs(user_id, created_at DESC);
CREATE INDEX idx_job_discovery_runs_status ON public.job_discovery_runs(status);
CREATE INDEX idx_job_discovery_runs_run_type ON public.job_discovery_runs(run_type, created_at DESC);
CREATE INDEX idx_job_discovery_runs_source ON public.job_discovery_runs(discovery_source);

-- Add missing foreign key indexes to fix unindexed foreign key warnings
CREATE INDEX IF NOT EXISTS idx_job_discovery_runs_user_id_fk ON public.job_discovery_runs(user_id);

-- ❂ RLS Policy
ALTER TABLE public.job_discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own discovery runs" ON public.job_discovery_runs
    FOR ALL USING ((select auth.uid()) = user_id);

-- ❹ Create discovered jobs staging table (before conversion to applications)
CREATE TABLE public.discovered_jobs_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discovery_run_id UUID NOT NULL REFERENCES public.job_discovery_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Job details (normalized across sources)
    external_job_id TEXT NOT NULL, -- ID from source (LinkedIn job_id, or generated for web scraping)
    source_platform TEXT NOT NULL CHECK (source_platform IN ('linkedin', 'greenhouse', 'lever', 'workday', 'other')),
    source_url TEXT NOT NULL,
    
    -- Core job data
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    company_url TEXT,
    location TEXT,
    description TEXT,
    
    -- Additional details
    salary_range TEXT,
    employment_type TEXT,
    experience_level TEXT,
    posted_date DATE,
    apply_url TEXT,
    
    -- Discovery metadata
    discovery_source TEXT NOT NULL, -- 'linkedin', 'serper_web'
    search_query_used TEXT, -- What query found this job
    relevance_score DECIMAL(3,2), -- AI-calculated relevance (0.00-1.00)
    
    -- Processing status
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'converted_to_application', 'duplicate_ignored', 'low_relevance_ignored', 'processing_error')),
    application_id UUID REFERENCES public.applications(id), -- Link to created application
    
    -- Metadata
    discovered_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ❂ Indexes for discovered jobs staging
CREATE INDEX idx_discovered_jobs_staging_discovery_run ON public.discovered_jobs_staging(discovery_run_id);
CREATE INDEX idx_discovered_jobs_staging_user_id ON public.discovered_jobs_staging(user_id, discovered_at DESC);
CREATE INDEX idx_discovered_jobs_staging_external_id ON public.discovered_jobs_staging(external_job_id, source_platform);
CREATE INDEX idx_discovered_jobs_staging_processing_status ON public.discovered_jobs_staging(processing_status);
CREATE INDEX idx_discovered_jobs_staging_relevance_score ON public.discovered_jobs_staging(relevance_score DESC) WHERE relevance_score IS NOT NULL;

-- Add missing foreign key indexes to fix unindexed foreign key warnings
CREATE INDEX IF NOT EXISTS idx_discovered_jobs_staging_application_id ON public.discovered_jobs_staging(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discovered_jobs_staging_discovery_run_id_fk ON public.discovered_jobs_staging(discovery_run_id);
CREATE INDEX IF NOT EXISTS idx_discovered_jobs_staging_user_id_fk ON public.discovered_jobs_staging(user_id);

-- ❂ RLS Policy
ALTER TABLE public.discovered_jobs_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own discovered jobs staging" ON public.discovered_jobs_staging
    FOR ALL USING ((select auth.uid()) = user_id);

-- ❺ Add job discovery specific columns to applications table
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS discovery_run_id UUID REFERENCES public.job_discovery_runs(id);
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS discovery_source TEXT CHECK (discovery_source IN ('linkedin', 'serper_web', 'manual', 'email_sync'));
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS relevance_score DECIMAL(3,2) CHECK (relevance_score >= 0.00 AND relevance_score <= 1.00);
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN DEFAULT false;

-- ❂ Index for discovery-related application queries
CREATE INDEX IF NOT EXISTS idx_applications_discovery_run ON public.applications(discovery_run_id) WHERE discovery_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_discovery_source ON public.applications(discovery_source) WHERE discovery_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_auto_discovered ON public.applications(user_id, auto_discovered, application_date DESC) WHERE auto_discovered = true;
CREATE INDEX IF NOT EXISTS idx_applications_relevance_score ON public.applications(user_id, relevance_score DESC) WHERE relevance_score IS NOT NULL;

-- ❻ Create function to automatically create user job discovery preferences
CREATE OR REPLACE FUNCTION create_default_job_discovery_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Create default job discovery preferences for new users
    INSERT INTO public.user_job_discovery_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- ❂ Trigger to create default preferences for new users
CREATE TRIGGER create_default_job_discovery_preferences_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_default_job_discovery_preferences();

-- ❼ Create updated_at triggers for new tables
CREATE TRIGGER update_user_job_discovery_preferences_updated_at 
    BEFORE UPDATE ON public.user_job_discovery_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_discovery_runs_updated_at 
    BEFORE UPDATE ON public.job_discovery_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discovered_jobs_staging_updated_at 
    BEFORE UPDATE ON public.discovered_jobs_staging
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ❽ Enable realtime for job discovery tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_job_discovery_preferences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_discovery_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.discovered_jobs_staging;

-- ❾ Create indexes for efficient subscription tier queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(id, subscription_tier) WHERE subscription_tier IS NOT NULL;

-- ❿ Add comments for documentation
COMMENT ON TABLE public.user_job_discovery_preferences IS 'Stores user preferences for automated job discovery including target roles, companies, and notification settings';
COMMENT ON TABLE public.job_discovery_runs IS 'Tracks execution of proactive job discovery runs with performance metrics and results';
COMMENT ON TABLE public.discovered_jobs_staging IS 'Staging area for jobs discovered via automated processes before conversion to applications';
COMMENT ON COLUMN public.applications.discovery_run_id IS 'Links applications created from automated job discovery to their discovery run';
COMMENT ON COLUMN public.applications.auto_discovered IS 'Indicates if this application was created through automated job discovery';
COMMENT ON COLUMN public.profiles.subscription_tier IS 'User subscription tier affecting job discovery frequency and features';
