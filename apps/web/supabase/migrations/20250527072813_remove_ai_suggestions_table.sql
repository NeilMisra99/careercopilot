-- Remove AI suggestions table and related references
-- This simplifies the architecture by removing the intermediate suggestions step

-- 1. Drop foreign key constraint from applications table if it exists
ALTER TABLE IF EXISTS public.applications 
DROP CONSTRAINT IF EXISTS applications_related_suggestion_id_fkey;

-- 2. Remove the related_suggestion_id column from applications table if it exists
-- (This column might not exist, but we'll handle it gracefully)
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' 
        AND column_name = 'related_suggestion_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.applications DROP COLUMN related_suggestion_id;
    END IF;
END $$;

-- 3. Drop indexes related to ai_suggestions
DROP INDEX IF EXISTS idx_ai_suggestions_user_id;
DROP INDEX IF EXISTS idx_ai_suggestions_suggestion_type;
DROP INDEX IF EXISTS idx_ai_suggestions_related_application_id;

-- 4. Drop the ai_suggestions table entirely
DROP TABLE IF EXISTS public.ai_suggestions CASCADE;

-- 5. Add a new status to applications to handle "AI pending review" applications
-- This replaces the ai_suggestions workflow with a simpler status-based approach
DO $$
BEGIN
    -- Check if the enum type exists and add the new status if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'Pending Review' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status_enum')
    ) THEN
        ALTER TYPE public.application_status_enum ADD VALUE 'Pending Review';
    END IF;
END $$;

-- 6. Add columns to applications table to handle AI-suggested applications
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS ai_suggested BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_reasoning TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS needs_user_review BOOLEAN DEFAULT FALSE;

-- 7. Create index for applications that need user review
CREATE INDEX IF NOT EXISTS idx_applications_needs_review 
ON public.applications(user_id, needs_user_review) 
WHERE needs_user_review = TRUE;

-- 8. Create index for AI suggested applications
CREATE INDEX IF NOT EXISTS idx_applications_ai_suggested 
ON public.applications(user_id, ai_suggested) 
WHERE ai_suggested = TRUE;


