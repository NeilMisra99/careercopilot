-- Add deterministic fingerprint column for faster deduplication
-- Fingerprint = md5(normalized_company|normalized_title|normalized_location)

-- 1. Add column to applications table
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS job_fingerprint TEXT;

-- 2. Add column to linkedin_jobs table (helps correlate vendor data)
ALTER TABLE public.linkedin_jobs
ADD COLUMN IF NOT EXISTS job_fingerprint TEXT;

-- 3. Unique constraint per user to enforce dedup at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_fingerprint
ON public.applications(user_id, job_fingerprint)
WHERE job_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.applications.job_fingerprint IS 'Deterministic MD5 hash of normalized company|title|location for deduplication';
COMMENT ON COLUMN public.linkedin_jobs.job_fingerprint IS 'Deterministic MD5 hash aligned with applications.job_fingerprint'; 