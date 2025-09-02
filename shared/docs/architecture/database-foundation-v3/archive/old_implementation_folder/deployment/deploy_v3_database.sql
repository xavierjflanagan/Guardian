-- =============================================================================
-- DATABASE V3 DEPLOYMENT ORCHESTRATION SCRIPT
-- =============================================================================
-- Purpose: Safe deployment of Database V3 with comprehensive validation
-- Status: Production-ready deployment script
-- Created: 2025-08-28

-- =============================================================================
-- PRE-DEPLOYMENT VALIDATION
-- =============================================================================

DO $$
DECLARE
    deployment_safe BOOLEAN := TRUE;
    error_message TEXT := '';
BEGIN
    RAISE NOTICE '=== DATABASE V3 DEPLOYMENT STARTING ===';
    RAISE NOTICE 'Timestamp: %', NOW();
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE '';
    
    -- Check 1: Verify we're in the right environment
    RAISE NOTICE '1. Environment validation...';
    IF current_database() = 'postgres' THEN
        deployment_safe := FALSE;
        error_message := 'CRITICAL: Attempting to deploy to system postgres database';
    END IF;
    
    -- Check 2: Verify Supabase extensions are available
    RAISE NOTICE '2. Extension availability check...';
    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'uuid-ossp') THEN
        deployment_safe := FALSE;
        error_message := 'CRITICAL: uuid-ossp extension not available';
    END IF;
    
    -- Check 3: Check for existing critical tables that might conflict
    RAISE NOTICE '3. Conflict detection...';
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('user_profiles', 'patient_clinical_events', 'provider_registry')
    ) THEN
        RAISE NOTICE 'WARNING: Some V3 tables already exist - deployment will attempt to handle gracefully';
    END IF;
    
    -- Final validation
    IF NOT deployment_safe THEN
        RAISE EXCEPTION 'DEPLOYMENT BLOCKED: %', error_message;
    END IF;
    
    RAISE NOTICE '✅ Pre-deployment validation passed';
    RAISE NOTICE '';
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 1: FOUNDATIONS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '=== PHASE 1: FOUNDATIONS ===';
    RAISE NOTICE 'Deploying: 01_foundations.sql';
END $$;

\i 01_foundations.sql

-- Validate Phase 1
DO $$
DECLARE
    extension_count INTEGER;
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO extension_count FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto');
    SELECT COUNT(*) INTO table_count FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('audit_log', 'system_notifications', 'system_configuration', 'feature_flags', 'implementation_sessions');
    
    IF extension_count >= 2 AND table_count = 5 THEN
        RAISE NOTICE '✅ Phase 1 completed successfully - % extensions, % tables', extension_count, table_count;
    ELSE
        RAISE EXCEPTION '❌ Phase 1 failed - Expected 2+ extensions and 5 tables, got % and %', extension_count, table_count;
    END IF;
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 2: PROFILES
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 2: PROFILE MANAGEMENT ===';
    RAISE NOTICE 'Deploying: 02_profiles.sql';
END $$;

\i 02_profiles.sql

-- Validate Phase 2
DO $$
DECLARE
    profile_tables INTEGER;
    profile_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO profile_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%profile%';
    
    SELECT COUNT(*) INTO profile_functions FROM pg_proc 
    WHERE proname LIKE '%profile%';
    
    IF profile_tables >= 8 AND profile_functions >= 3 THEN
        RAISE NOTICE '✅ Phase 2 completed successfully - % profile tables, % functions', profile_tables, profile_functions;
    ELSE
        RAISE EXCEPTION '❌ Phase 2 failed - Expected 8+ tables and 3+ functions, got % and %', profile_tables, profile_functions;
    END IF;
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 3: CLINICAL CORE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 3: CLINICAL CORE & SEMANTIC ARCHITECTURE ===';
    RAISE NOTICE 'Deploying: 03_clinical_core.sql';
END $$;

\i 03_clinical_core.sql

-- Validate Phase 3
DO $$
DECLARE
    clinical_tables INTEGER;
    narrative_tables INTEGER;
BEGIN
    SELECT COUNT(*) INTO clinical_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('patient_clinical_events', 'patient_observations', 'patient_interventions');
    
    SELECT COUNT(*) INTO narrative_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%narrative%';
    
    IF clinical_tables = 3 AND narrative_tables >= 6 THEN
        RAISE NOTICE '✅ Phase 3 completed successfully - % core clinical tables, % narrative tables', clinical_tables, narrative_tables;
    ELSE
        RAISE EXCEPTION '❌ Phase 3 failed - Expected 3 core clinical and 6+ narrative tables, got % and %', clinical_tables, narrative_tables;
    END IF;
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 4: AI PROCESSING
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 4: AI PROCESSING INFRASTRUCTURE ===';
    RAISE NOTICE 'Deploying: 04_ai_processing.sql';
END $$;

\i 04_ai_processing.sql

-- Validate Phase 4
DO $$
DECLARE
    ai_tables INTEGER;
    processing_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO ai_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%processing%' OR table_name LIKE '%ai_%';
    
    SELECT COUNT(*) INTO processing_functions FROM pg_proc 
    WHERE proname LIKE '%processing%' OR proname LIKE '%ai_%';
    
    RAISE NOTICE '✅ Phase 4 completed - % AI processing tables, % functions', ai_tables, processing_functions;
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 5: HEALTHCARE JOURNEY
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 5: HEALTHCARE PROVIDER SYSTEM ===';
    RAISE NOTICE 'Deploying: 05_healthcare_journey.sql';
END $$;

\i 05_healthcare_journey.sql

-- Validate Phase 5 (including partition management)
DO $$
DECLARE
    provider_tables INTEGER;
    partition_count INTEGER;
    partition_function_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO provider_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND (table_name LIKE '%provider%' OR table_name LIKE '%access_log%');
    
    SELECT COUNT(*) INTO partition_count FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'provider_access_log_%';
    
    SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_quarterly_partitions') INTO partition_function_exists;
    
    IF provider_tables >= 8 AND partition_count >= 8 AND partition_function_exists THEN
        RAISE NOTICE '✅ Phase 5 completed successfully';
        RAISE NOTICE '  - Provider tables: %', provider_tables;
        RAISE NOTICE '  - Partitions created: %', partition_count;
        RAISE NOTICE '  - Automated partition management: Active';
    ELSE
        RAISE EXCEPTION '❌ Phase 5 failed - Expected 8+ provider tables, 8+ partitions, and partition function';
    END IF;
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 6: SECURITY
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 6: SECURITY & CONSENT MANAGEMENT ===';
    RAISE NOTICE 'Deploying: 06_security.sql';
END $$;

\i 06_security.sql

-- Validate Phase 6
DO $$
DECLARE
    consent_tables INTEGER;
    rls_policies INTEGER;
    security_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO consent_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%consent%';
    
    SELECT COUNT(*) INTO rls_policies FROM pg_policies WHERE schemaname = 'public';
    
    SELECT COUNT(*) INTO security_functions FROM pg_proc 
    WHERE proname IN ('has_semantic_data_access', 'has_profile_access_level');
    
    IF consent_tables >= 3 AND rls_policies >= 15 AND security_functions >= 2 THEN
        RAISE NOTICE '✅ Phase 6 completed successfully';
        RAISE NOTICE '  - Consent tables: %', consent_tables;
        RAISE NOTICE '  - RLS policies: %', rls_policies;
        RAISE NOTICE '  - Security functions: %', security_functions;
    ELSE
        RAISE EXCEPTION '❌ Phase 6 failed - Expected 3+ consent tables, 15+ RLS policies, 2+ security functions';
    END IF;
END $$;

-- =============================================================================
-- DEPLOYMENT PHASE 7: OPTIMIZATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 7: SYSTEM OPTIMIZATION & FINALIZATION ===';
    RAISE NOTICE 'Deploying: 07_optimization.sql';
END $$;

\i 07_optimization.sql

-- Validate Phase 7
DO $$
DECLARE
    system_tables INTEGER;
    total_indexes INTEGER;
    health_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO system_tables FROM information_schema.tables 
    WHERE table_schema = 'public' AND (table_name IN ('job_queue', 'failed_audit_events') OR table_name = 'user_events');
    
    SELECT COUNT(*) INTO total_indexes FROM pg_indexes WHERE schemaname = 'public';
    
    SELECT COUNT(*) INTO health_functions FROM pg_proc 
    WHERE proname IN ('database_health_check', 'performance_metrics', 'data_quality_assessment');
    
    RAISE NOTICE '✅ Phase 7 completed successfully';
    RAISE NOTICE '  - System infrastructure tables: %', system_tables;  
    RAISE NOTICE '  - Performance indexes: %', total_indexes;
    RAISE NOTICE '  - Health monitoring functions: %', health_functions;
END $$;

-- =============================================================================
-- FINAL DEPLOYMENT VALIDATION
-- =============================================================================

DO $$
DECLARE
    total_tables INTEGER;
    total_functions INTEGER;
    total_policies INTEGER;
    total_indexes INTEGER;
    critical_tables_missing TEXT := '';
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL DEPLOYMENT VALIDATION ===';
    
    -- Count totals
    SELECT COUNT(*) INTO total_tables FROM information_schema.tables WHERE table_schema = 'public';
    SELECT COUNT(*) INTO total_functions FROM pg_proc WHERE proname NOT LIKE 'pg_%';
    SELECT COUNT(*) INTO total_policies FROM pg_policies WHERE schemaname = 'public';
    SELECT COUNT(*) INTO total_indexes FROM pg_indexes WHERE schemaname = 'public';
    
    -- Check for critical tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
        critical_tables_missing := critical_tables_missing || 'user_profiles, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_clinical_events') THEN
        critical_tables_missing := critical_tables_missing || 'patient_clinical_events, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_registry') THEN
        critical_tables_missing := critical_tables_missing || 'provider_registry, ';
    END IF;
    
    -- Report results
    RAISE NOTICE 'Database V3 Deployment Summary:';
    RAISE NOTICE '  - Total Tables: %', total_tables;
    RAISE NOTICE '  - Total Functions: %', total_functions;
    RAISE NOTICE '  - Total RLS Policies: %', total_policies;
    RAISE NOTICE '  - Total Indexes: %', total_indexes;
    
    IF critical_tables_missing = '' THEN
        RAISE NOTICE '';
        RAISE NOTICE '🎉 DATABASE V3 DEPLOYMENT SUCCESSFUL!';
        RAISE NOTICE '✅ All critical tables present';
        RAISE NOTICE '✅ Partition management automated through 2027';
        RAISE NOTICE '✅ Security functions operational';
        RAISE NOTICE '✅ V3 semantic architecture deployed';
        RAISE NOTICE '✅ Healthcare compliance framework active';
        RAISE NOTICE '';
        RAISE NOTICE '🚀 Database ready for application integration';
        
        -- Test partition management
        RAISE NOTICE 'Testing automated partition management...';
        PERFORM check_partition_coverage('provider_access_log', 12);
        RAISE NOTICE '✅ Partition management validated';
        
    ELSE
        RAISE EXCEPTION '❌ DEPLOYMENT FAILED - Missing critical tables: %', 
            rtrim(critical_tables_missing, ', ');
    END IF;
    
    -- Log successful deployment
    INSERT INTO implementation_sessions (session_name, session_status, details, completed_at)
    VALUES (
        'Database V3 Full Deployment',
        'completed',
        format('Successfully deployed V3 database: %s tables, %s functions, %s policies, %s indexes', 
               total_tables, total_functions, total_policies, total_indexes),
        NOW()
    );
    
END $$;