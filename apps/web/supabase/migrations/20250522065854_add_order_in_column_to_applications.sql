ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS order_in_column INTEGER DEFAULT 0;

COMMENT ON COLUMN public.applications.order_in_column IS 'Stores the display order of the application within its current status column on the Kanban board.';

-- Potentially, backfill existing data if necessary, e.g., based on created_at or applied_at per status group.
-- For now, new applications will get 0, and client-side logic will handle ordering.
-- Or, a more sophisticated backfill:
DO $$
DECLARE
    status_record RECORD;
    rank_counter INTEGER;
BEGIN
    FOR status_record IN SELECT DISTINCT status FROM public.applications LOOP
        rank_counter := 0;
        FOR status_record IN 
            SELECT id 
            FROM public.applications 
            WHERE status = status_record.status 
            ORDER BY COALESCE(applied_at, created_at) ASC
        LOOP
            UPDATE public.applications 
            SET order_in_column = rank_counter 
            WHERE id = status_record.id;
            rank_counter := rank_counter + 1;
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE public.applications
ALTER COLUMN order_in_column SET NOT NULL;

ALTER TABLE public.applications
ALTER COLUMN order_in_column SET DEFAULT 0; 