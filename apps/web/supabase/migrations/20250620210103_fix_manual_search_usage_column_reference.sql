-- =====================================================================
-- Fix manual_search_usage column reference in functions
-- The table uses 'search_date' column but functions were referencing 'date'
-- =====================================================================

-- Drop and recreate the check_manual_search_limit function with correct column reference
DROP FUNCTION IF EXISTS public.check_manual_search_limit(UUID);

CREATE OR REPLACE FUNCTION public.check_manual_search_limit(p_user_id UUID)
RETURNS TABLE (
    can_search BOOLEAN,
    searches_used INTEGER,
    daily_limit INTEGER,
    message TEXT,
    subscription_tier TEXT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_subscription_tier TEXT;
    v_daily_limit INTEGER;
    v_today DATE;
    v_searches_today INTEGER;
BEGIN
    -- Get today's date
    v_today := CURRENT_DATE;
    
    -- Get user's subscription tier from profiles
    SELECT p.subscription_tier INTO v_subscription_tier
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- If no profile found, default to 'free'
    IF v_subscription_tier IS NULL THEN
        v_subscription_tier := 'free';
    END IF;
    
    -- Set daily limit based on subscription tier
    CASE v_subscription_tier
        WHEN 'pro' THEN v_daily_limit := 50;
        WHEN 'premium' THEN v_daily_limit := 100;
        ELSE v_daily_limit := 10; -- free tier
    END CASE;
    
    -- Get or create today's usage record (using correct column name: search_date)
    INSERT INTO public.manual_search_usage (user_id, search_date, search_count, subscription_tier)
    VALUES (p_user_id, v_today, 0, v_subscription_tier)
    ON CONFLICT (user_id, search_date) 
    DO UPDATE SET subscription_tier = v_subscription_tier
    RETURNING search_count INTO v_searches_today;
    
    -- Return the result
    RETURN QUERY
    SELECT 
        v_searches_today < v_daily_limit AS can_search,
        v_searches_today AS searches_used,
        v_daily_limit AS daily_limit,
        CASE 
            WHEN v_searches_today >= v_daily_limit THEN 
                'Daily search limit reached. Upgrade to get more searches.'
            ELSE 
                'Search available'
        END AS message,
        v_subscription_tier AS subscription_tier;
END;
$$;

-- Drop and recreate the increment_manual_search_usage function with correct column reference
DROP FUNCTION IF EXISTS public.increment_manual_search_usage(UUID);

CREATE OR REPLACE FUNCTION public.increment_manual_search_usage(p_user_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    searches_used INTEGER,
    daily_limit INTEGER,
    message TEXT
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
    v_subscription_tier TEXT;
    v_daily_limit INTEGER;
    v_today DATE;
    v_searches_today INTEGER;
    v_new_count INTEGER;
BEGIN
    -- Get today's date
    v_today := CURRENT_DATE;
    
    -- Get user's subscription tier from profiles
    SELECT p.subscription_tier INTO v_subscription_tier
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- If no profile found, default to 'free'
    IF v_subscription_tier IS NULL THEN
        v_subscription_tier := 'free';
    END IF;
    
    -- Set daily limit based on subscription tier
    CASE v_subscription_tier
        WHEN 'pro' THEN v_daily_limit := 50;
        WHEN 'premium' THEN v_daily_limit := 100;
        ELSE v_daily_limit := 10; -- free tier
    END CASE;
    
    -- Get current usage (using correct column name: search_date)
    SELECT msu.search_count INTO v_searches_today
    FROM public.manual_search_usage msu
    WHERE msu.user_id = p_user_id AND msu.search_date = v_today;
    
    -- If no record exists, create one
    IF v_searches_today IS NULL THEN
        v_searches_today := 0;
    END IF;
    
    -- Check if limit reached
    IF v_searches_today >= v_daily_limit THEN
        RETURN QUERY
        SELECT 
            FALSE AS success,
            v_searches_today AS searches_used,
            v_daily_limit AS daily_limit,
            'Daily search limit reached. Upgrade to get more searches.' AS message;
        RETURN;
    END IF;
    
    -- Increment usage
    v_new_count := v_searches_today + 1;
    
    INSERT INTO public.manual_search_usage (user_id, search_date, search_count, subscription_tier)
    VALUES (p_user_id, v_today, v_new_count, v_subscription_tier)
    ON CONFLICT (user_id, search_date) 
    DO UPDATE SET 
        search_count = v_new_count,
        subscription_tier = v_subscription_tier;
    
    -- Return success
    RETURN QUERY
    SELECT 
        TRUE AS success,
        v_new_count AS searches_used,
        v_daily_limit AS daily_limit,
        'Search recorded successfully' AS message;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_manual_search_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_manual_search_usage(UUID) TO authenticated;