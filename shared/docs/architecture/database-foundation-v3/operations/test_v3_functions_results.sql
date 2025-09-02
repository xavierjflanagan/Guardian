-- =============================================================================
-- V3 FUNCTION INTEGRATION TEST - TABLE RESULTS FORMAT
-- =============================================================================
-- PURPOSE: Test V3 RPC functions and return results as visible tables
-- DATE: September 2, 2025
-- USAGE: Run this script in Supabase SQL Editor to see function test results
-- =============================================================================

WITH 
-- Test 1: V3 RPC Functions Existence Check
v3_functions_check AS (
    SELECT 
        'V3 RPC Functions' as test_category,
        expected_function as test_item,
        CASE 
            WHEN p.proname IS NOT NULL THEN '✅ Function exists'
            ELSE '❌ Function missing'
        END as status,
        'Available for job coordination' as details
    FROM (VALUES 
        ('enqueue_job_v3'), ('claim_next_job_v3'), ('complete_job'),
        ('update_job_heartbeat'), ('reschedule_job')
    ) AS expected(expected_function)
    LEFT JOIN pg_proc p ON p.proname = expected.expected_function
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),

-- Test 2: API Capacity Functions
api_capacity_functions AS (
    SELECT 
        'API Capacity Functions' as test_category,
        expected_function as test_item,
        CASE 
            WHEN p.proname IS NOT NULL THEN '✅ Function exists'
            ELSE '❌ Function missing'
        END as status,
        'Rate limiting capability' as details
    FROM (VALUES 
        ('acquire_api_capacity'), ('release_api_capacity')
    ) AS expected(expected_function)
    LEFT JOIN pg_proc p ON p.proname = expected.expected_function
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),

-- Test 3: Usage Tracking Functions
usage_tracking_functions AS (
    SELECT 
        'Usage Tracking Functions' as test_category,
        expected_function as test_item,
        CASE 
            WHEN p.proname IS NOT NULL THEN '✅ Function exists'
            ELSE '❌ Function missing'
        END as status,
        'Usage monitoring capability' as details
    FROM (VALUES 
        ('track_shell_file_upload_usage'), ('track_ai_processing_usage'), ('get_user_usage_status')
    ) AS expected(expected_function)
    LEFT JOIN pg_proc p ON p.proname = expected.expected_function
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),

-- Test 4: Security Functions
security_functions AS (
    SELECT 
        'Security Functions' as test_category,
        expected_function as test_item,
        CASE 
            WHEN p.proname IS NOT NULL THEN '✅ Function exists'
            ELSE '❌ Function missing'
        END as status,
        'Access control capability' as details
    FROM (VALUES 
        ('is_admin'), ('has_profile_access'), ('has_profile_access_level'), ('has_semantic_data_access')
    ) AS expected(expected_function)
    LEFT JOIN pg_proc p ON p.proname = expected.expected_function
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),

-- Test 5: Supporting Infrastructure Tables
infrastructure_tables AS (
    SELECT 
        'Infrastructure Tables' as test_category,
        expected_table as test_item,
        CASE 
            WHEN t.table_name IS NOT NULL THEN '✅ Table exists'
            ELSE '❌ Table missing'
        END as status,
        'Supporting V3 operations' as details
    FROM (VALUES 
        ('job_queue'), ('api_rate_limits'), ('user_usage_tracking'), ('failed_audit_events')
    ) AS expected(expected_table)
    LEFT JOIN information_schema.tables t ON t.table_name = expected.expected_table AND t.table_schema = 'public'
),

-- Test 6: Job Queue Status
job_queue_status AS (
    SELECT 
        'Job Queue Status' as test_category,
        'Queue Health' as test_item,
        '✅ ' || COUNT(*) || ' jobs in queue' as status,
        'Jobs by status: ' || STRING_AGG(status || '(' || cnt || ')', ', ') as details
    FROM (
        SELECT status, COUNT(*) as cnt
        FROM job_queue 
        GROUP BY status
    ) queue_stats
),

-- Test 7: Usage Tracking Data
usage_data_status AS (
    SELECT 
        'Usage Data Status' as test_category,
        'Tracking Records' as test_item,
        '✅ ' || COUNT(*) || ' usage records' as status,
        COUNT(DISTINCT profile_id) || ' profiles tracked' as details
    FROM user_usage_tracking
),

-- Test 8: Profile Access Test
profile_access_test AS (
    SELECT 
        'Profile Access Test' as test_category,
        'Available Profiles' as test_item,
        '✅ ' || COUNT(*) || ' profiles accessible' as status,
        'Through current security context' as details
    FROM user_profiles
),

-- Test 9: Integration Readiness Summary
integration_summary AS (
    SELECT 
        'Integration Summary' as test_category,
        'Overall Status' as test_item,
        CASE 
            WHEN (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
                  WHERE n.nspname = 'public' AND p.proname IN ('enqueue_job_v3', 'claim_next_job_v3', 'complete_job')) = 3 
            THEN '✅ V3 JOB COORDINATION READY'
            ELSE '❌ V3 FUNCTIONS INCOMPLETE'
        END as status,
        'Core V3 job processing functions validated' as details
)

-- Combine all test results
SELECT test_category, test_item, status, details
FROM v3_functions_check

UNION ALL

SELECT test_category, test_item, status, details
FROM api_capacity_functions

UNION ALL

SELECT test_category, test_item, status, details
FROM usage_tracking_functions

UNION ALL

SELECT test_category, test_item, status, details
FROM security_functions

UNION ALL

SELECT test_category, test_item, status, details
FROM infrastructure_tables

UNION ALL

SELECT test_category, test_item, status, details
FROM job_queue_status

UNION ALL

SELECT test_category, test_item, status, details
FROM usage_data_status

UNION ALL

SELECT test_category, test_item, status, details
FROM profile_access_test

UNION ALL

SELECT test_category, test_item, status, details
FROM integration_summary

ORDER BY test_category, test_item;