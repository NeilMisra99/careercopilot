-- ═══════════════════════════════════════════════════════════════════════════
-- Data Normalization & UI 2.0 Migration
-- Phase 2: Maximum Bright Data Intelligence Implementation
-- ═══════════════════════════════════════════════════════════════════════════

-- A) Add New Normalized Columns to Applications Table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS company_url TEXT,
ADD COLUMN IF NOT EXISTS company_logo TEXT,
ADD COLUMN IF NOT EXISTS country_code CHAR(2),
ADD COLUMN IF NOT EXISTS seniority_level TEXT,
ADD COLUMN IF NOT EXISTS job_function TEXT,
ADD COLUMN IF NOT EXISTS industries TEXT[],
ADD COLUMN IF NOT EXISTS apply_link TEXT,
ADD COLUMN IF NOT EXISTS salary_min NUMERIC,
ADD COLUMN IF NOT EXISTS salary_max NUMERIC,
ADD COLUMN IF NOT EXISTS salary_currency CHAR(3),
ADD COLUMN IF NOT EXISTS salary_period TEXT;

-- B) Add New Normalized Columns to LinkedIn Jobs Table  
ALTER TABLE public.linkedin_jobs
ADD COLUMN IF NOT EXISTS company_url TEXT,
ADD COLUMN IF NOT EXISTS company_logo TEXT,
ADD COLUMN IF NOT EXISTS country_code CHAR(2),
ADD COLUMN IF NOT EXISTS seniority_level TEXT,
ADD COLUMN IF NOT EXISTS job_function TEXT,
ADD COLUMN IF NOT EXISTS industries TEXT[],
ADD COLUMN IF NOT EXISTS apply_link TEXT,
ADD COLUMN IF NOT EXISTS salary_min NUMERIC,
ADD COLUMN IF NOT EXISTS salary_max NUMERIC,
ADD COLUMN IF NOT EXISTS salary_currency CHAR(3),
ADD COLUMN IF NOT EXISTS salary_period TEXT;

-- C) Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_applications_company_url ON public.applications(company_url);
CREATE INDEX IF NOT EXISTS idx_applications_country_code ON public.applications(country_code);
CREATE INDEX IF NOT EXISTS idx_applications_seniority_level ON public.applications(seniority_level);
CREATE INDEX IF NOT EXISTS idx_applications_job_function ON public.applications(job_function);
CREATE INDEX IF NOT EXISTS idx_applications_industries_gin ON public.applications USING gin(industries);
CREATE INDEX IF NOT EXISTS idx_applications_salary_min ON public.applications(salary_min);
CREATE INDEX IF NOT EXISTS idx_applications_salary_max ON public.applications(salary_max);
CREATE INDEX IF NOT EXISTS idx_applications_salary_currency ON public.applications(salary_currency);

CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_company_url ON public.linkedin_jobs(company_url);
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_country_code ON public.linkedin_jobs(country_code);
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_seniority_level ON public.linkedin_jobs(seniority_level);
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_job_function ON public.linkedin_jobs(job_function);
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_industries_gin ON public.linkedin_jobs USING gin(industries);
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_salary_min ON public.linkedin_jobs(salary_min);
CREATE INDEX IF NOT EXISTS idx_linkedin_jobs_salary_max ON public.linkedin_jobs(salary_max);

-- D) Add Check Constraints for Data Quality
ALTER TABLE public.applications 
ADD CONSTRAINT chk_salary_currency_format CHECK (salary_currency IS NULL OR length(salary_currency) = 3),
ADD CONSTRAINT chk_country_code_format CHECK (country_code IS NULL OR length(country_code) = 2),
ADD CONSTRAINT chk_salary_min_positive CHECK (salary_min IS NULL OR salary_min >= 0),
ADD CONSTRAINT chk_salary_max_positive CHECK (salary_max IS NULL OR salary_max >= 0),
ADD CONSTRAINT chk_salary_range_valid CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min
);

ALTER TABLE public.linkedin_jobs
ADD CONSTRAINT chk_lj_salary_currency_format CHECK (salary_currency IS NULL OR length(salary_currency) = 3),
ADD CONSTRAINT chk_lj_country_code_format CHECK (country_code IS NULL OR length(country_code) = 2),
ADD CONSTRAINT chk_lj_salary_min_positive CHECK (salary_min IS NULL OR salary_min >= 0),
ADD CONSTRAINT chk_lj_salary_max_positive CHECK (salary_max IS NULL OR salary_max >= 0),
ADD CONSTRAINT chk_lj_salary_range_valid CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min
);

-- E) Create Helper Function for Future Normalization
CREATE OR REPLACE FUNCTION extract_and_normalize_job_data(
    extra_data_param JSONB,
    salary_json_param JSONB DEFAULT NULL
)
RETURNS TABLE(
    company_url TEXT,
    company_logo TEXT,
    country_code CHAR(2),
    seniority_level TEXT,
    job_function TEXT,
    industries TEXT[],
    apply_link TEXT,
    salary_min NUMERIC,
    salary_max NUMERIC,
    salary_currency CHAR(3),
    salary_period TEXT
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY SELECT
        extra_data_param->>'company_url',
        extra_data_param->>'company_logo',
        (extra_data_param->>'country_code')::CHAR(2),
        extra_data_param->>'job_seniority_level',
        extra_data_param->>'job_function',
        CASE 
            WHEN extra_data_param->>'job_industries' IS NOT NULL 
            THEN ARRAY[extra_data_param->>'job_industries']
            ELSE NULL 
        END,
        extra_data_param->>'apply_link',
        CASE 
            WHEN salary_json_param->>'min_amount' IS NOT NULL 
            THEN (salary_json_param->>'min_amount')::numeric
            ELSE NULL 
        END,
        CASE 
            WHEN salary_json_param->>'max_amount' IS NOT NULL 
            THEN (salary_json_param->>'max_amount')::numeric
            ELSE NULL 
        END,
        (salary_json_param->>'currency')::CHAR(3),
        salary_json_param->>'payment_period';
END;
$$;

-- F) Add Comments for Documentation
COMMENT ON COLUMN public.applications.company_url IS 'Direct company URL from job posting data for View Company CTA';
COMMENT ON COLUMN public.applications.company_logo IS 'Company logo URL for avatar display on job cards';
COMMENT ON COLUMN public.applications.country_code IS 'ISO 2-letter country code for flag icons and geo-filters';
COMMENT ON COLUMN public.applications.seniority_level IS 'Job seniority level for filtering and matching (e.g., Mid-Senior level)';
COMMENT ON COLUMN public.applications.job_function IS 'Job function category for analytics and alerts';
COMMENT ON COLUMN public.applications.industries IS 'Array of industry classifications with GIN index for filtering';
COMMENT ON COLUMN public.applications.apply_link IS 'Direct application URL for 1-click Apply button';
COMMENT ON COLUMN public.applications.salary_min IS 'Minimum salary amount in normalized numeric format';
COMMENT ON COLUMN public.applications.salary_max IS 'Maximum salary amount in normalized numeric format';
COMMENT ON COLUMN public.applications.salary_currency IS 'ISO 3-letter currency code (USD, CAD, EUR, etc.)';
COMMENT ON COLUMN public.applications.salary_period IS 'Salary payment period (yearly, monthly, hourly, etc.)';

COMMENT ON FUNCTION extract_and_normalize_job_data(JSONB, JSONB) IS 'Helper function to extract and normalize job data from JSON payloads for consistent data processing';
