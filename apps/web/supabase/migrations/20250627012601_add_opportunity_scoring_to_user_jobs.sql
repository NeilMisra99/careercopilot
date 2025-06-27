-- up
ALTER TABLE public.user_jobs
  ADD COLUMN IF NOT EXISTS opportunity_score INTEGER,
  ADD COLUMN IF NOT EXISTS opportunity_reasoning TEXT[],
  ADD COLUMN IF NOT EXISTS market_intelligence JSONB,
  ADD COLUMN IF NOT EXISTS golden_opportunity BOOLEAN,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,2),
  -- Component breakdown for advanced analytics
  ADD COLUMN IF NOT EXISTS salary_score INTEGER,
  ADD COLUMN IF NOT EXISTS competition_score INTEGER,
  ADD COLUMN IF NOT EXISTS timing_score INTEGER,
  ADD COLUMN IF NOT EXISTS seniority_match_score INTEGER;

-- Helpful index to quickly sort/filter by score in dashboards
CREATE INDEX IF NOT EXISTS idx_user_jobs_opportunity_score
  ON public.user_jobs (opportunity_score DESC NULLS LAST);
