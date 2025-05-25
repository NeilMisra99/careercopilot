-- Define an ENUM type for application statuses
CREATE TYPE public.application_status_enum AS ENUM (
  'Wishlist',
  'Applied',
  'Screening',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn'
);

-- Create the applications table
CREATE TABLE public.applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  role TEXT NOT NULL,
  job_url TEXT,
  status public.application_status_enum NOT NULL DEFAULT 'Applied', -- Default status when an application is created
  applied_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL
);

-- Add indexes for frequently queried columns
CREATE INDEX idx_applications_user_id ON public.applications(user_id);
CREATE INDEX idx_applications_status ON public.applications(status);

-- Set up Row Level Security (RLS)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Policies for applications
CREATE POLICY "Users can view their own applications."
  ON public.applications FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own applications."
  ON public.applications FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own applications."
  ON public.applications FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own applications."
  ON public.applications FOR DELETE
  USING ((select auth.uid()) = user_id);

-- Add comments to the table and columns
COMMENT ON TABLE public.applications IS 'Stores job application details for users.';
COMMENT ON COLUMN public.applications.user_id IS 'References the user who owns this application.';
COMMENT ON COLUMN public.applications.status IS 'Current status of the application, using the application_status_enum type.';
COMMENT ON COLUMN public.applications.applied_at IS 'Date when the application was submitted or logged.';
