-- Add email_date column to application_sources for proper chronological sorting

ALTER TABLE public.application_sources 
ADD COLUMN IF NOT EXISTS email_date TIMESTAMPTZ;

-- Add index for performance when sorting by email date
CREATE INDEX IF NOT EXISTS idx_application_sources_email_date ON public.application_sources(email_date);

-- Add comment
COMMENT ON COLUMN public.application_sources.email_date IS 'The actual date/time when the email was sent/received, used for chronological sorting';
