-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.moddatetime()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::TEXT, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to profiles table
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- Apply trigger to applications table
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- Apply trigger to ai_suggestions table
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- Apply trigger to application_documents table
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.application_documents
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime();
