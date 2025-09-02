-- =============================================================================
-- COMPREHENSIVE RLS POLICY VALIDATION - ENHANCED VERSION
-- =============================================================================
-- PURPOSE: Test RLS policies with proper authentication context and comprehensive checks
-- DATE: September 2, 2025
-- BASED ON: GPT-5 security review recommendations
-- USAGE: Run this script in Supabase SQL Editor for thorough RLS testing
-- =============================================================================

-- =============================================================================
-- SETUP: Simulate authenticated user context for proper RLS testing
-- =============================================================================

-- Simulate an authenticated user context (replace with a real user UUID if available)
SET LOCAL role authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000","email":"test@example.com"}',
  true
);

-- =============================================================================
-- COMPREHENSIVE RLS TESTS
-- =============================================================================

WITH 
-- Test 1: Enhanced RLS Status Check (using proper pg_class join)
rls_status_check AS (
    SELECT
        'RLS Status' AS test_category,
        c.relname AS test_item,
        CASE WHEN c.relrowsecurity THEN 'RLS Enabled' ELSE 'RLS Disabled' END AS status,
        n.nspname AS details
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public'
    AND c.relkind = 'r'  -- Only tables
    AND c.relname IN (
        'user_profiles', 'patient_clinical_events', 'shell_files', 'audit_log',
        'patient_medications', 'patient_conditions', 'patient_allergies', 'patient_immunizations',
        'clinical_narratives', 'healthcare_encounters', 'narrative_condition_links',
        'narrative_medication_links', 'narrative_allergy_links', 'narrative_immunization_links',
        'narrative_vital_links', 'narrative_source_mappings', 'job_queue', 'user_usage_tracking'
    )
),

-- Test 2: RLS Policy Presence Check
rls_policies_check AS (
    SELECT 
        'RLS Policies' as test_category,
        tablename || '.' || policyname as test_item,
        'Policy exists' as status,
        'Cmd: ' || cmd || ', Roles: ' || COALESCE(array_to_string(roles, ','), 'public') as details
    FROM pg_policies
    WHERE schemaname='public'
    AND tablename IN (
        'user_profiles', 'patient_clinical_events', 'shell_files', 'audit_log',
        'patient_medications', 'patient_conditions', 'patient_allergies', 'patient_immunizations'
    )
),

-- Test 3: Data Access Under Authentication Context
authenticated_access_check AS (
    SELECT 
        'Authenticated Access' as test_category,
        'Profile Count' as test_item,
        COUNT(*) || ' profiles accessible' as status,
        'Under authenticated user context' as details
    FROM user_profiles
    
    UNION ALL
    
    SELECT 
        'Authenticated Access' as test_category,
        'Clinical Events' as test_item,
        COUNT(*) || ' events accessible' as status,
        'Under authenticated user context' as details
    FROM patient_clinical_events
    
    UNION ALL
    
    SELECT 
        'Authenticated Access' as test_category,
        'Shell Files' as test_item,
        COUNT(*) || ' files accessible' as status,
        'Under authenticated user context' as details
    FROM shell_files
    
    UNION ALL
    
    SELECT 
        'Authenticated Access' as test_category,
        'Patient Medications' as test_item,
        COUNT(*) || ' medication records accessible' as status,
        'Under authenticated user context' as details
    FROM patient_medications
),

-- Test 4: Security Functions with Authentication Context
security_functions_auth AS (
    SELECT 
        'Security Functions' as test_category,
        'is_admin()' as test_item,
        CASE WHEN is_admin() THEN 'Returns TRUE' ELSE 'Returns FALSE' END as status,
        'Admin check under auth context' as details
        
    UNION ALL
    
    SELECT 
        'Security Functions' as test_category,
        'Function Availability' as test_item,
        COUNT(*) || ' security functions available' as status,
        'has_profile_access, has_profile_access_level, etc.' as details
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
    AND p.proname IN ('has_profile_access', 'has_profile_access_level', 'has_semantic_data_access', 'is_admin')
),

-- Test 5: RLS Policy Summary Statistics
rls_summary_stats AS (
    SELECT 
        'RLS Summary' as test_category,
        'Total RLS Policies' as test_item,
        COUNT(*) || ' policies active' as status,
        'Across ' || COUNT(DISTINCT tablename) || ' tables' as details
    FROM pg_policies
    WHERE schemaname = 'public'
    
    UNION ALL
    
    SELECT 
        'RLS Summary' as test_category,
        'RLS Enabled Tables' as test_item,
        COUNT(*) || ' tables with RLS enabled' as status,
        'In public schema' as details
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
),

-- Test 6: Critical Tables Protection Check
critical_tables_protection AS (
    WITH critical_tables AS (
        SELECT unnest(ARRAY[
            'user_profiles', 'patient_clinical_events', 'shell_files', 'audit_log',
            'patient_medications', 'patient_conditions', 'patient_allergies'
        ]) as table_name
    )
    SELECT 
        'Critical Protection' as test_category,
        ct.table_name as test_item,
        CASE 
            WHEN c.relrowsecurity AND p.policy_count > 0 THEN 'Protected (RLS + Policies)'
            WHEN c.relrowsecurity THEN 'RLS Enabled (No Policies Found)'
            ELSE 'NOT PROTECTED'
        END as status,
        COALESCE(p.policy_count::text || ' policies', '0 policies') as details
    FROM critical_tables ct
    LEFT JOIN pg_class c ON c.relname = ct.table_name
    LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    LEFT JOIN (
        SELECT tablename, COUNT(*) as policy_count
        FROM pg_policies 
        WHERE schemaname = 'public'
        GROUP BY tablename
    ) p ON p.tablename = ct.table_name
)

-- Combine all test results
SELECT test_category, test_item, status, details
FROM rls_status_check

UNION ALL

SELECT test_category, test_item, status, details
FROM rls_policies_check

UNION ALL

SELECT test_category, test_item, status, details
FROM authenticated_access_check

UNION ALL

SELECT test_category, test_item, status, details
FROM security_functions_auth

UNION ALL

SELECT test_category, test_item, status, details
FROM rls_summary_stats

UNION ALL

SELECT test_category, test_item, status, details
FROM critical_tables_protection

ORDER BY test_category, test_item;

-- =============================================================================
-- WRITE-PATH RLS TEST (Expect failures for non-owned data)
-- =============================================================================

-- Note: These INSERT attempts should FAIL due to RLS WITH CHECK clauses
-- Uncomment to test write-path RLS enforcement:

/*
-- Test write-path RLS on user_profiles (should fail for foreign profile)
INSERT INTO user_profiles (id, display_name, date_of_birth, phone, email, address)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Test User', '1990-01-01', '555-0123', 'test@example.com', '123 Test St');

-- Test write-path RLS on patient_medications (should fail for foreign patient)
INSERT INTO patient_medications (patient_id, medication_name, prescribed_dose, frequency, status)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Test Medication', '10mg', 'Daily', 'active');
*/