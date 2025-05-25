-- Create the application_documents table
CREATE TABLE public.application_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- For RLS and direct queries
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE, -- Path in R2, must be unique
  file_type TEXT NOT NULL, -- e.g., 'resume', 'cover_letter', 'portfolio', 'other'
  mime_type TEXT, -- e.g., 'application/pdf', 'image/png'
  file_size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL
);

-- Add indexes
CREATE INDEX idx_application_documents_application_id ON public.application_documents(application_id);
CREATE INDEX idx_application_documents_user_id ON public.application_documents(user_id);
CREATE INDEX idx_application_documents_file_type ON public.application_documents(file_type);

-- Set up Row Level Security (RLS)
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

-- Policies for application_documents
CREATE POLICY "Users can view documents for their own applications."
  ON public.application_documents FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert documents for their own applications."
  ON public.application_documents FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id AND
              EXISTS (SELECT 1 FROM public.applications app WHERE app.id = application_id AND app.user_id = (select auth.uid())));

CREATE POLICY "Users can update documents for their own applications."
  ON public.application_documents FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id AND
              EXISTS (SELECT 1 FROM public.applications app WHERE app.id = application_id AND app.user_id = (select auth.uid())));

CREATE POLICY "Users can delete documents for their own applications."
  ON public.application_documents FOR DELETE
  USING ((select auth.uid()) = user_id AND
         EXISTS (SELECT 1 FROM public.applications app WHERE app.id = application_id AND app.user_id = (select auth.uid())));

-- Add comments
COMMENT ON TABLE public.application_documents IS 'Stores metadata for documents associated with job applications.';
COMMENT ON COLUMN public.application_documents.application_id IS 'Link to the application this document belongs to.';
COMMENT ON COLUMN public.application_documents.user_id IS 'References the user who owns this document (via the application).';
COMMENT ON COLUMN public.application_documents.storage_path IS 'Unique path/key of the file in R2 storage.';
COMMENT ON COLUMN public.application_documents.file_type IS 'Category of the document (e.g., resume, cover_letter).';
