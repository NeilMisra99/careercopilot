-- ═══════════════════════════════════════════════════════════════════════════
-- LinkedIn Job Scraper Tables (Updated for ScrapingDog API)
-- ═══════════════════════════════════════════════════════════════════════════

-- ❶ LinkedIn Scrape Runs Table
CREATE TABLE public.linkedin_scrape_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keywords TEXT NOT NULL,
    location TEXT,
    geo_id TEXT, -- LinkedIn's location ID for ScrapingDog
    pages_requested INTEGER NOT NULL DEFAULT 1,
    pages_fetched INTEGER NOT NULL DEFAULT 0,
    jobs_found INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error', 'cancelled')),
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for linkedin_scrape_runs
CREATE INDEX idx_linkedin_scrape_runs_user_id ON public.linkedin_scrape_runs(user_id);
CREATE INDEX idx_linkedin_scrape_runs_status ON public.linkedin_scrape_runs(status);
CREATE INDEX idx_linkedin_scrape_runs_created_at ON public.linkedin_scrape_runs(created_at DESC);

-- Add missing foreign key indexes to fix unindexed foreign key warnings
CREATE INDEX IF NOT EXISTS idx_linkedin_scrape_runs_user_id_fk ON public.linkedin_scrape_runs(user_id);

-- ❷ LinkedIn Jobs Table (Simplified for ScrapingDog)
-- Based on ScrapingDog response: job_position, job_link, job_id, company_name, company_profile, job_location, job_posting_date, company_logo_url
CREATE TABLE public.linkedin_jobs (
    job_id TEXT PRIMARY KEY, -- ScrapingDog returns job_id as string
    title TEXT NOT NULL, -- job_position from ScrapingDog
    company TEXT NOT NULL, -- company_name from ScrapingDog
    location TEXT, -- job_location from ScrapingDog
    description TEXT, -- Will be fetched separately if needed
    job_url TEXT, -- job_link from ScrapingDog
    salary_range TEXT, -- Not provided by ScrapingDog basic response
    employment_type TEXT, -- Not provided by ScrapingDog basic response
    experience_level TEXT, -- Not provided by ScrapingDog basic response
    posted_at TIMESTAMPTZ, -- job_posting_date from ScrapingDog (converted)
    
    -- ScrapingDog specific fields
    company_profile_url TEXT, -- company_profile from ScrapingDog
    company_logo_url TEXT, -- company_logo_url from ScrapingDog (if available)
    
    -- Metadata
    scraped_last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for linkedin_jobs (simplified)
CREATE INDEX idx_linkedin_jobs_company ON public.linkedin_jobs(company);
CREATE INDEX idx_linkedin_jobs_location ON public.linkedin_jobs(location);
CREATE INDEX idx_linkedin_jobs_title ON public.linkedin_jobs USING gin(to_tsvector('english', title));
CREATE INDEX idx_linkedin_jobs_description ON public.linkedin_jobs USING gin(to_tsvector('english', description));
CREATE INDEX idx_linkedin_jobs_posted_at ON public.linkedin_jobs(posted_at DESC);
CREATE INDEX idx_linkedin_jobs_scraped_last_at ON public.linkedin_jobs(scraped_last_at DESC);

-- ❸ User LinkedIn Jobs Junction Table
CREATE TABLE public.user_linkedin_jobs (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL REFERENCES public.linkedin_jobs(job_id) ON DELETE CASCADE,
    scrape_run_id UUID NOT NULL REFERENCES public.linkedin_scrape_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'saved', 'ignored', 'applied')),
    notes TEXT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_updated_at TIMESTAMPTZ,
    
    PRIMARY KEY (user_id, job_id)
);

-- Indexes for user_linkedin_jobs
CREATE INDEX idx_user_linkedin_jobs_user_status ON public.user_linkedin_jobs(user_id, status);
CREATE INDEX idx_user_linkedin_jobs_discovered_at ON public.user_linkedin_jobs(discovered_at DESC);
CREATE INDEX idx_user_linkedin_jobs_scrape_run ON public.user_linkedin_jobs(scrape_run_id);
CREATE INDEX idx_user_linkedin_jobs_job_id ON public.user_linkedin_jobs(job_id);

-- Add missing foreign key indexes to fix unindexed foreign key warnings
CREATE INDEX IF NOT EXISTS idx_user_linkedin_jobs_user_id_fk ON public.user_linkedin_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_linkedin_jobs_job_id_fk ON public.user_linkedin_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_user_linkedin_jobs_scrape_run_id_fk ON public.user_linkedin_jobs(scrape_run_id);

-- ❹ Row Level Security (RLS)
ALTER TABLE public.linkedin_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_linkedin_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own scrape runs" ON public.linkedin_scrape_runs FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert their own scrape runs" ON public.linkedin_scrape_runs FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update their own scrape runs" ON public.linkedin_scrape_runs FOR UPDATE USING ((select auth.uid()) = user_id);

-- Users can only see LinkedIn jobs they've discovered (through user_linkedin_jobs table)
CREATE POLICY "Users can read their discovered LinkedIn jobs" ON public.linkedin_jobs 
FOR SELECT USING (
  job_id IN (
    SELECT job_id FROM public.user_linkedin_jobs 
    WHERE user_id = (select auth.uid())
  )
);

-- System can insert new jobs (service role only)
CREATE POLICY "System can insert LinkedIn jobs" ON public.linkedin_jobs 
FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

-- System can update job data (service role only)  
CREATE POLICY "System can update LinkedIn jobs" ON public.linkedin_jobs 
FOR UPDATE USING ((select auth.role()) = 'service_role');

CREATE POLICY "Users can view their own job associations" ON public.user_linkedin_jobs FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert their own job associations" ON public.user_linkedin_jobs FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update their own job associations" ON public.user_linkedin_jobs FOR UPDATE USING ((select auth.uid()) = user_id);

-- ❺ Updated At Triggers
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

CREATE TRIGGER update_linkedin_scrape_runs_updated_at BEFORE UPDATE ON public.linkedin_scrape_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_linkedin_jobs_updated_at BEFORE UPDATE ON public.linkedin_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_linkedin_jobs_updated_at BEFORE UPDATE ON public.user_linkedin_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
