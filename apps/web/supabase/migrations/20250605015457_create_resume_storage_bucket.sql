-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('resumes', 'resumes', false);

-- Allow authenticated users to upload their own resumes
CREATE POLICY "Users can upload their own resumes" 
ON storage.objects FOR INSERT 
WITH CHECK ((select auth.uid())::text = (storage.foldername(name))[1]);

-- Allow users to view their own resumes
CREATE POLICY "Users can view their own resumes" 
ON storage.objects FOR SELECT 
USING ((select auth.uid())::text = (storage.foldername(name))[1]);

-- Allow users to update their own resumes
CREATE POLICY "Users can update their own resumes" 
ON storage.objects FOR UPDATE 
USING ((select auth.uid())::text = (storage.foldername(name))[1]);

-- Allow users to delete their own resumes
CREATE POLICY "Users can delete their own resumes" 
ON storage.objects FOR DELETE 
USING ((select auth.uid())::text = (storage.foldername(name))[1]);
