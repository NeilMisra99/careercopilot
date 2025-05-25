-- Create table for failed email reviews
CREATE TABLE IF NOT EXISTS public.failed_email_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL,
    email_id TEXT NOT NULL,
    email_thread_id TEXT,
    email_subject TEXT,
    email_from TEXT,
    email_date TIMESTAMPTZ,
    email_snippet TEXT,
    email_body TEXT,
    failure_reason TEXT NOT NULL,
    failure_count INTEGER DEFAULT 1,
    failed_at TIMESTAMPTZ DEFAULT NOW(),
    needs_review BOOLEAN DEFAULT TRUE,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    manual_correction JSONB, -- Store manual corrections made by user
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint to prevent duplicate failed emails per user
CREATE UNIQUE INDEX IF NOT EXISTS failed_email_reviews_user_email_unique 
ON public.failed_email_reviews (user_id, email_id);

-- Create index for efficient querying by user
CREATE INDEX IF NOT EXISTS failed_email_reviews_user_id_idx 
ON public.failed_email_reviews (user_id);

-- Create index for querying pending reviews
CREATE INDEX IF NOT EXISTS failed_email_reviews_needs_review_idx 
ON public.failed_email_reviews (needs_review, user_id);

-- Enable Row Level Security
ALTER TABLE public.failed_email_reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for users to only see their own failed emails
CREATE POLICY "Users can view their own failed emails" ON public.failed_email_reviews
    FOR ALL USING (auth.uid() = user_id);

-- Add trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_failed_email_reviews_updated_at
    BEFORE UPDATE ON public.failed_email_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
