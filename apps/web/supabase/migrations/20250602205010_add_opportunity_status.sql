-- Add 'Opportunity' status to application_status_enum
-- This status represents when a recruiter or company reaches out to present a job opportunity
-- before the user has actually applied to the position

DO $$
BEGIN
    -- Check if the enum type exists and add the new status if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'Opportunity' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status_enum')
    ) THEN
        ALTER TYPE public.application_status_enum ADD VALUE 'Opportunity';
    END IF;
END $$;

-- Add comment to document the new status
COMMENT ON TYPE public.application_status_enum IS 'Enum for application statuses: Opportunity (recruiter outreach), Wishlist, Applied, Screening, Interviewing, Offer, Rejected, Withdrawn, Pending Review';
