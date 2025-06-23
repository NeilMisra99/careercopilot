-- Add real-time progress tracking fields to resumes table
-- These fields enable live progress updates during resume parsing

-- Add parsing progress fields
ALTER TABLE public.resumes 
ADD COLUMN IF NOT EXISTS parsing_progress INTEGER CHECK (parsing_progress >= 0 AND parsing_progress <= 100),
ADD COLUMN IF NOT EXISTS parsing_stage TEXT CHECK (parsing_stage IN ('initializing', 'extracting', 'analyzing', 'saving', 'completed')),
ADD COLUMN IF NOT EXISTS parsing_message TEXT,
ADD COLUMN IF NOT EXISTS parsing_data JSONB; -- For real-time progress metadata (different from parsed_data which is final result)

-- Add indexes for real-time queries
CREATE INDEX IF NOT EXISTS idx_resumes_parsing_progress ON public.resumes(user_id, parsing_status, parsing_progress) 
WHERE parsing_status IN ('processing', 'pending');

CREATE INDEX IF NOT EXISTS idx_resumes_parsing_stage ON public.resumes(parsing_stage) 
WHERE parsing_stage IS NOT NULL;

-- Enable real-time for the resumes table (for progress updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.resumes;

-- Add comments for documentation
COMMENT ON COLUMN public.resumes.parsing_progress IS 'Progress percentage (0-100) for real-time updates during resume parsing';
COMMENT ON COLUMN public.resumes.parsing_stage IS 'Current parsing stage for real-time progress display';
COMMENT ON COLUMN public.resumes.parsing_message IS 'Human-readable message describing current parsing activity';
COMMENT ON COLUMN public.resumes.parsing_data IS 'Real-time progress metadata (confidence, extracted counts, etc.) - different from parsed_data which stores final structured result';
