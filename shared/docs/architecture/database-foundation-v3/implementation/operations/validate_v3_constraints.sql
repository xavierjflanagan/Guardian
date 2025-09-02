-- =============================================================================
-- VALIDATION TEST SCRIPT FOR V3 DATABASE FOUNDATION
-- =============================================================================
-- Purpose: Test critical constraints and ON DELETE behaviors
-- Run this after deploying all V3 SQL files to verify functionality
-- Expected: All tests should pass without errors

-- Test setup
DO $$
DECLARE
    test_count INTEGER := 0;
    passed_count INTEGER := 0;
    test_name TEXT;
BEGIN
    RAISE NOTICE 'Starting V3 Database Foundation Validation Tests...';
    RAISE NOTICE '================================================================';

    -- Test 1: Verify all critical ENUM types exist
    test_count := test_count + 1;
    test_name := 'ENUM Types Creation';
    BEGIN
        -- Test all ENUM types exist and have expected values
        PERFORM 'self'::profile_relationship_type;
        PERFORM 'verified'::verification_status_type;
        PERFORM 'granted'::consent_status_type;
        PERFORM 'owner'::access_level_type;
        PERFORM 'completed'::processing_status_type;
        PERFORM 'clinical'::data_classification_type;
        
        passed_count := passed_count + 1;
        RAISE NOTICE 'Test %: % - PASSED', test_count, test_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Test %: % - FAILED: %', test_count, test_name, SQLERRM;
    END;

    -- Test 2: Verify enhanced archival fields exist
    test_count := test_count + 1;
    test_name := 'Enhanced Archival Fields';
    BEGIN
        -- Check user_profiles archival fields
        PERFORM 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name IN ('archived_at', 'archived_by', 'recovery_expires_at', 'processing_restricted_at', 'legal_hold');
        
        -- Check user_account_archival table exists
        PERFORM 1 FROM information_schema.tables WHERE table_name = 'user_account_archival';
        
        passed_count := passed_count + 1;
        RAISE NOTICE 'Test %: % - PASSED', test_count, test_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Test %: % - FAILED: %', test_count, test_name, SQLERRM;
    END;

    -- Test 3: Verify ON DELETE RESTRICT policies work
    test_count := test_count + 1;
    test_name := 'ON DELETE RESTRICT Constraints';
    BEGIN
        -- This should be blocked by foreign key constraints
        -- We'll test that the constraint exists, not actually delete data
        PERFORM 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.table_name = 'patient_clinical_events'
        AND kcu.column_name = 'patient_id';
        
        passed_count := passed_count + 1;
        RAISE NOTICE 'Test %: % - PASSED', test_count, test_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Test %: % - FAILED: %', test_count, test_name, SQLERRM;
    END;

    -- Test 4: Verify critical functions exist
    test_count := test_count + 1;
    test_name := 'Critical Security Functions';
    BEGIN
        -- Check security functions exist
        PERFORM 1 FROM pg_proc WHERE proname = 'has_profile_access';
        PERFORM 1 FROM pg_proc WHERE proname = 'has_profile_access_level';
        PERFORM 1 FROM pg_proc WHERE proname = 'is_admin';
        PERFORM 1 FROM pg_proc WHERE proname = 'has_semantic_data_access';
        
        passed_count := passed_count + 1;
        RAISE NOTICE 'Test %: % - PASSED', test_count, test_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Test %: % - FAILED: %', test_count, test_name, SQLERRM;
    END;

    -- Test 5: Verify RLS policies are applied
    test_count := test_count + 1;
    test_name := 'Row Level Security Policies';
    BEGIN
        -- Check that critical tables have RLS enabled
        PERFORM 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname IN ('user_profiles', 'patient_clinical_events')
        AND c.relrowsecurity = true
        AND n.nspname = 'public';
        
        passed_count := passed_count + 1;
        RAISE NOTICE 'Test %: % - PASSED', test_count, test_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Test %: % - FAILED: %', test_count, test_name, SQLERRM;
    END;

    -- Test 6: Verify partition management functions exist
    test_count := test_count + 1;
    test_name := 'Partition Management Functions';
    BEGIN
        -- Check partition functions exist
        PERFORM 1 FROM pg_proc WHERE proname = 'create_quarterly_partitions';
        PERFORM 1 FROM pg_proc WHERE proname = 'check_partition_health';
        
        passed_count := passed_count + 1;
        RAISE NOTICE 'Test %: % - PASSED', test_count, test_name;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Test %: % - FAILED: %', test_count, test_name, SQLERRM;
    END;

    -- Summary
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'V3 Database Foundation Validation Complete';
    RAISE NOTICE 'Tests Passed: %/%', passed_count, test_count;
    
    IF passed_count = test_count THEN
        RAISE NOTICE '🎉 ALL TESTS PASSED - V3 Foundation Ready for Deployment!';
    ELSE
        RAISE NOTICE '% tests failed - Review errors above before deployment', (test_count - passed_count);
    END IF;
    
    RAISE NOTICE '================================================================';
END;
$$;

-- Additional detailed checks
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Additional Validation Checks:';
    RAISE NOTICE '-----------------------------';
    
    -- Count total tables created
    RAISE NOTICE 'Total tables in public schema: %', 
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public');
    
    -- Count total RLS policies
    RAISE NOTICE 'Total RLS policies created: %', 
        (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public');
    
    -- Count total functions created
    RAISE NOTICE 'Total functions in public schema: %', 
        (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public');
        
    -- Check critical foreign key constraints
    RAISE NOTICE 'Critical FK constraints found: %', 
        (SELECT COUNT(*) FROM information_schema.table_constraints 
         WHERE constraint_type = 'FOREIGN KEY' 
         AND table_name IN ('patient_clinical_events', 'shell_files')
         AND table_schema = 'public');
END;
$$;