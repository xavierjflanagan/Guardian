-- =============================================================================
-- API RATE LIMIT CHECK - FIXED VERSION
-- =============================================================================
-- PURPOSE: Check if API rate limiting table exists and is populated
-- DATE: September 2, 2025
-- USAGE: Run this script to see rate limit status
-- =============================================================================

-- Step 1: Check table existence and structure
SELECT 
    'Table Structure' as check_category,
    column_name as check_item,
    data_type as status,
    COALESCE('Default: ' || column_default, 'No default') as details
FROM information_schema.columns 
WHERE table_name = 'api_rate_limits' AND table_schema = 'public'
ORDER BY ordinal_position;