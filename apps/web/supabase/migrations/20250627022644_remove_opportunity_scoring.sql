-- Remove opportunity scoring columns from user_jobs table
ALTER TABLE public.user_jobs
  DROP COLUMN IF EXISTS opportunity_score,
  DROP COLUMN IF EXISTS opportunity_reasoning,
  DROP COLUMN IF EXISTS market_intelligence,
  DROP COLUMN IF EXISTS golden_opportunity,
  DROP COLUMN IF EXISTS ai_confidence,
  DROP COLUMN IF EXISTS salary_score,
  DROP COLUMN IF EXISTS competition_score,
  DROP COLUMN IF EXISTS timing_score,
  DROP COLUMN IF EXISTS seniority_match_score;

-- Drop the opportunity score index
DROP INDEX IF EXISTS idx_user_jobs_opportunity_score;