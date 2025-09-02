-- =============================================================================
-- API RATE LIMIT POPULATION CHECK
-- =============================================================================
-- PURPOSE: Check if api_rate_limits table is populated
-- DATE: September 2, 2025
-- USAGE: Run this after the structure check to see population status
-- =============================================================================

-- Check population status
SELECT 
    'Population Status' as check_category,
    'Record Count' as check_item,
    COUNT(*)::text || ' records in api_rate_limits' as status,
    CASE 
        WHEN COUNT(*) = 0 THEN '❌ MANUAL POPULATION REQUIRED'
        ELSE '✅ Table populated'
    END as details
FROM api_rate_limits;