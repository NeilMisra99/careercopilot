-- Create the ai_suggestions table
CREATE TABLE public.ai_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_email_data JSONB, -- Store relevant parts of the email or its reference
  suggested_company_name TEXT,
  suggested_role TEXT,
  suggested_status TEXT, -- Storing as TEXT for now, can be mapped to ENUM on confirmation
  suggestion_type TEXT NOT NULL, -- e.g., 'NEW_APPLICATION', 'STATUS_UPDATE'
  related_application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL, -- For status updates
  confidence_score NUMERIC(5, 4), -- e.g., 0.9876
  is_confirmed BOOLEAN DEFAULT FALSE NOT NULL,
  is_rejected BOOLEAN DEFAULT FALSE NOT NULL, -- If user explicitly rejects the suggestion
  processed_at TIMESTAMPTZ, -- When the user confirmed or rejected
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL
);

-- Add indexes
CREATE INDEX idx_ai_suggestions_user_id ON public.ai_suggestions(user_id);
CREATE INDEX idx_ai_suggestions_suggestion_type ON public.ai_suggestions(suggestion_type);
CREATE INDEX idx_ai_suggestions_related_application_id ON public.ai_suggestions(related_application_id);

-- Set up Row Level Security (RLS)
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

-- Policies for ai_suggestions
CREATE POLICY "Users can view their own AI suggestions."
  ON public.ai_suggestions FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own AI suggestions (typically done by backend worker)."
  ON public.ai_suggestions FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id); -- Or a service_role key if inserted by a worker

CREATE POLICY "Users can update their own AI suggestions (e.g., confirm, reject)."
  ON public.ai_suggestions FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Note: Deletion of suggestions might be restricted or handled via a flag.
-- For now, allowing users to delete their own suggestions.
CREATE POLICY "Users can delete their own AI suggestions."
  ON public.ai_suggestions FOR DELETE
  USING ((select auth.uid()) = user_id);

-- Add comments
COMMENT ON TABLE public.ai_suggestions IS 'Stores AI-generated suggestions from parsed emails for users to review.';
COMMENT ON COLUMN public.ai_suggestions.user_id IS 'References the user for whom the suggestion was made.';
COMMENT ON COLUMN public.ai_suggestions.raw_email_data IS 'Relevant data extracted from the email.';
COMMENT ON COLUMN public.ai_suggestions.suggestion_type IS 'Type of suggestion, e.g., NEW_APPLICATION, STATUS_UPDATE.';
COMMENT ON COLUMN public.ai_suggestions.related_application_id IS 'If suggestion is an update, links to the existing application.';
COMMENT ON COLUMN public.ai_suggestions.is_confirmed IS 'True if the user confirmed and acted upon the suggestion.';
COMMENT ON COLUMN public.ai_suggestions.is_rejected IS 'True if the user explicitly rejected the suggestion.';
COMMENT ON COLUMN public.ai_suggestions.processed_at IS 'Timestamp when the suggestion was confirmed or rejected by the user.';

-- Future consideration: The INSERT policy might need to allow service_role key if the
-- worker directly inserts into this table without impersonating the user.
-- For now, assuming the worker might operate under user context or we adjust this later.
