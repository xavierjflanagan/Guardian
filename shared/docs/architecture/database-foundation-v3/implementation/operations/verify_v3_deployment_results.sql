-- =============================================================================
-- VERIFY_V3_DEPLOYMENT_RESULTS.SQL - Phase 3: Deployment Verification (Results View)
-- =============================================================================
-- PURPOSE: Verify complete V3 architecture deployment with visible results
-- DATE: September 2, 2025
-- USAGE: Run this script in Supabase SQL Editor to see verification results as table
-- =============================================================================

-- =============================================================================
-- 1. VERIFY ALL 19 CLINICAL TABLES (03_clinical_core.sql)
-- =============================================================================

WITH clinical_table_check AS (
    SELECT 
        '1. Clinical Tables' as check_category,
        expected_table,
        CASE WHEN t.table_name IS NOT NULL THEN '✅ Found' ELSE '❌ Missing' END as status
    FROM (
        VALUES 
        ('shell_files'), ('clinical_narratives'), ('patient_clinical_events'),
        ('patient_conditions'), ('patient_medications'), ('patient_allergies'),
        ('patient_immunizations'), ('patient_vital_signs'), ('patient_lab_results'),
        ('patient_procedures'), ('patient_imaging'), ('patient_referrals'),
        ('healthcare_encounters'), ('narrative_condition_links'), ('narrative_medication_links'),
        ('narrative_allergy_links'), ('narrative_immunization_links'), ('narrative_vital_links'),
        ('narrative_source_mappings')
    ) AS expected(expected_table)
    LEFT JOIN information_schema.tables t ON t.table_name = expected.expected_table AND t.table_schema = 'public'
),

-- =============================================================================
-- 2. VERIFY V3 RPC FUNCTIONS (08_job_coordination.sql)
-- =============================================================================

rpc_function_check AS (
    SELECT 
        '2. V3 RPC Functions' as check_category,
        expected_function as expected_table,
        CASE WHEN p.proname IS NOT NULL THEN '✅ Found' ELSE '❌ Missing' END as status
    FROM (
        VALUES 
        ('enqueue_job_v3'), ('claim_next_job_v3'), ('complete_job'),
        ('update_job_heartbeat'), ('reschedule_job'),
        ('acquire_api_capacity'), ('release_api_capacity'),
        ('track_shell_file_upload_usage'), ('track_ai_processing_usage'), ('get_user_usage_status')
    ) AS expected(expected_function)
    LEFT JOIN pg_proc p ON p.proname = expected.expected_function
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),

-- =============================================================================
-- 3. VERIFY SECURITY FUNCTIONS
-- =============================================================================

security_function_check AS (
    SELECT 
        '3. Security Functions' as check_category,
        expected_function as expected_table,
        CASE WHEN p.proname IS NOT NULL THEN '✅ Found' ELSE '❌ Missing' END as status
    FROM (
        VALUES 
        ('is_admin'), ('has_profile_access'), ('has_profile_access_level'), ('has_semantic_data_access')
    ) AS expected(expected_function)
    LEFT JOIN pg_proc p ON p.proname = expected.expected_function
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),

-- =============================================================================
-- 4. VERIFY INFRASTRUCTURE TABLES
-- =============================================================================

infrastructure_check AS (
    SELECT 
        '4. Infrastructure Tables' as check_category,
        expected_table,
        CASE WHEN t.table_name IS NOT NULL THEN '✅ Found' ELSE '❌ Missing' END as status
    FROM (
        VALUES 
        ('job_queue'), ('failed_audit_events'), ('api_rate_limits'), 
        ('user_usage_tracking'), ('user_profiles'), ('audit_log')
    ) AS expected(expected_table)
    LEFT JOIN information_schema.tables t ON t.table_name = expected.expected_table AND t.table_schema = 'public'
),

-- =============================================================================
-- 5. SUMMARY STATISTICS
-- =============================================================================

summary_stats AS (
    SELECT 
        '5. Summary Statistics' as check_category,
        metric as expected_table,
        count_value::text || ' ' || description as status
    FROM (
        SELECT 'Total Tables' as metric, COUNT(*)::text as count_value, 'tables in public schema' as description
        FROM information_schema.tables WHERE table_schema = 'public'
        
        UNION ALL
        
        SELECT 'RLS Policies' as metric, COUNT(*)::text as count_value, 'RLS policies active' as description
        FROM pg_policies WHERE schemaname = 'public'
        
        UNION ALL
        
        SELECT 'RLS Enabled Tables' as metric, COUNT(*)::text as count_value, 'tables with RLS enabled' as description
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
        
        UNION ALL
        
        SELECT 'Functions' as metric, COUNT(*)::text as count_value, 'functions in public schema' as description
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
    ) stats
)

-- Combine all checks
SELECT check_category, expected_table, status
FROM clinical_table_check
UNION ALL
SELECT check_category, expected_table, status
FROM rpc_function_check
UNION ALL
SELECT check_category, expected_table, status
FROM security_function_check
UNION ALL
SELECT check_category, expected_table, status
FROM infrastructure_check
UNION ALL
SELECT check_category, expected_table, status
FROM summary_stats
ORDER BY check_category, expected_table;