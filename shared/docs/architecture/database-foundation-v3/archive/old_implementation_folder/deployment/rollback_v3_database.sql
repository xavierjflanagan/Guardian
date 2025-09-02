-- =============================================================================
-- DATABASE V3 ROLLBACK SCRIPT
-- =============================================================================
-- Purpose: Safe rollback of Database V3 deployment
-- WARNING: This will remove all V3 tables and data
-- Status: Emergency use only - for deployment failures
-- Created: 2025-08-28

-- =============================================================================
-- ROLLBACK CONFIRMATION
-- =============================================================================

DO $$
DECLARE
    confirmation_required TEXT := 'I UNDERSTAND THIS WILL DELETE ALL V3 DATA';
    user_confirmation TEXT := '';
BEGIN
    RAISE NOTICE '=== DATABASE V3 ROLLBACK WARNING ===';
    RAISE NOTICE 'This script will PERMANENTLY DELETE all V3 database tables and data.';
    RAISE NOTICE 'This action CANNOT be undone.';
    RAISE NOTICE '';
    RAISE NOTICE 'To proceed, you must manually edit this script and set:';
    RAISE NOTICE 'user_confirmation := ''%'';', confirmation_required;
    RAISE NOTICE '';
    
    -- Require manual confirmation by editing the script
    user_confirmation := ''; -- EDIT THIS LINE TO CONFIRM ROLLBACK
    
    IF user_confirmation != confirmation_required THEN
        RAISE EXCEPTION 'ROLLBACK CANCELLED: Confirmation required. Edit script to confirm.';
    END IF;
    
    RAISE NOTICE '⚠️  ROLLBACK CONFIRMED - Proceeding with V3 database removal...';
END $$;

-- =============================================================================
-- PRE-ROLLBACK BACKUP REMINDER
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== BACKUP REMINDER ===';
    RAISE NOTICE 'Recommended: Create backup before rollback:';
    RAISE NOTICE '  pg_dump --schema-only > v3_schema_backup.sql';
    RAISE NOTICE '  pg_dump --data-only > v3_data_backup.sql';
    RAISE NOTICE '';
    RAISE NOTICE 'Press Ctrl+C now to cancel and create backups';
    RAISE NOTICE 'Continuing rollback in 10 seconds...';
    
    PERFORM pg_sleep(10);
END $$;

-- =============================================================================
-- ROLLBACK PHASE 1: DROP FOREIGN KEY CONSTRAINTS
-- =============================================================================

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE '=== PHASE 1: REMOVING FOREIGN KEY CONSTRAINTS ===';
    
    -- Drop all foreign key constraints to avoid dependency issues
    FOR constraint_record IN 
        SELECT conname, conrelid::regclass AS table_name
        FROM pg_constraint 
        WHERE contype = 'f' 
        AND connamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', 
                      constraint_record.table_name, constraint_record.conname);
        RAISE NOTICE 'Dropped constraint % from %', constraint_record.conname, constraint_record.table_name;
    END LOOP;
    
    RAISE NOTICE '✅ Foreign key constraints removed';
END $$;

-- =============================================================================
-- ROLLBACK PHASE 2: DROP V3 TABLES (Reverse Order)
-- =============================================================================

DO $$
DECLARE
    table_name TEXT;
    v3_tables TEXT[] := ARRAY[
        -- Phase 7: System tables
        'user_events', 'failed_audit_events', 'job_queue',
        
        -- Phase 6: Security tables
        'user_consent_preferences', 'patient_consent_audit', 'patient_consents',
        
        -- Phase 5: Healthcare provider tables
        'healthcare_provider_context', 'provider_clinical_notes', 'clinical_alert_rules',
        'provider_action_items', 'provider_access_log_2027_q4', 'provider_access_log_2027_q3',
        'provider_access_log_2027_q2', 'provider_access_log_2027_q1', 'provider_access_log_2026_q4',
        'provider_access_log_2026_q3', 'provider_access_log_2026_q2', 'provider_access_log_2026_q1',
        'provider_access_log_2025_q4', 'provider_access_log_2025_q3', 'provider_access_log_2025_q2',
        'provider_access_log_2025_q1', 'provider_access_log', 'patient_provider_access',
        'registered_doctors_au', 'provider_registry',
        
        -- Phase 4: AI processing tables
        'narrative_view_cache', 'dual_lens_user_preferences', 'shell_file_synthesis_results',
        'semantic_processing_sessions', 'narrative_creation_audit', 'manual_review_queue',
        'ai_confidence_scoring', 'profile_classification_audit', 'entity_processing_audit_v2',
        'ai_processing_sessions',
        
        -- Phase 3: Clinical core tables
        'patient_medications', 'patient_immunizations', 'patient_vitals', 'patient_allergies',
        'patient_conditions', 'healthcare_timeline_events', 'healthcare_encounters',
        'patient_interventions', 'patient_observations', 'patient_clinical_events',
        'narrative_source_mappings', 'narrative_vital_links', 'narrative_immunization_links',
        'narrative_allergy_links', 'narrative_medication_links', 'narrative_condition_links',
        'clinical_narratives', 'shell_files', 'medication_reference', 'medical_condition_codes',
        
        -- Phase 2: Profile tables
        'profile_appointments', 'profile_auth_progression', 'profile_detection_patterns',
        'profile_verification_rules', 'pregnancy_journey_events', 'smart_health_features',
        'user_profile_context', 'profile_access_permissions', 'user_profiles',
        
        -- Phase 1: Foundation tables
        'implementation_sessions', 'feature_flags', 'system_configuration', 
        'system_notifications', 'audit_log'
    ];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 2: REMOVING V3 TABLES ===';
    
    FOREACH table_name IN ARRAY v3_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = table_name AND table_schema = 'public') THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', table_name);
            RAISE NOTICE 'Dropped table: %', table_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ V3 tables removed';
END $$;

-- =============================================================================
-- ROLLBACK PHASE 3: DROP V3 FUNCTIONS
-- =============================================================================

DO $$
DECLARE
    function_record RECORD;
    v3_functions TEXT[] := ARRAY[
        'database_health_check', 'performance_metrics', 'data_quality_assessment',
        'has_semantic_data_access', 'check_partition_coverage', 'create_quarterly_partitions',
        'get_user_profiles', 'has_profile_access_level', 'has_profile_access'
    ];
    func_name TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 3: REMOVING V3 FUNCTIONS ===';
    
    FOREACH func_name IN ARRAY v3_functions LOOP
        -- Drop all overloads of the function
        FOR function_record IN 
            SELECT proname, oidvectortypes(proargtypes) as args
            FROM pg_proc 
            WHERE proname = func_name
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %I(%s) CASCADE', 
                          function_record.proname, function_record.args);
            RAISE NOTICE 'Dropped function: %(%)', function_record.proname, function_record.args;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '✅ V3 functions removed';
END $$;

-- =============================================================================
-- ROLLBACK PHASE 4: CLEAN UP POLICIES AND INDEXES
-- =============================================================================

DO $$
DECLARE
    policy_record RECORD;
    index_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== PHASE 4: CLEANING UP POLICIES AND INDEXES ===';
    
    -- Remove any orphaned RLS policies
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        -- Policies should be automatically dropped with tables, but clean up any orphans
        RAISE NOTICE 'Policy cleanup: %.%.%', policy_record.schemaname, policy_record.tablename, policy_record.policyname;
    END LOOP;
    
    -- Remove any orphaned indexes
    FOR index_record IN 
        SELECT indexname
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', index_record.indexname);
        RAISE NOTICE 'Cleaned up index: %', index_record.indexname;
    END LOOP;
    
    RAISE NOTICE '✅ Policies and indexes cleaned up';
END $$;

-- =============================================================================
-- ROLLBACK VALIDATION
-- =============================================================================

DO $$
DECLARE
    remaining_tables INTEGER;
    remaining_functions INTEGER;
    remaining_policies INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== ROLLBACK VALIDATION ===';
    
    -- Count remaining V3 objects
    SELECT COUNT(*) INTO remaining_tables 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    AND table_name IN (
        'user_profiles', 'patient_clinical_events', 'provider_registry', 
        'clinical_narratives', 'shell_files'
    );
    
    SELECT COUNT(*) INTO remaining_functions
    FROM pg_proc 
    WHERE proname IN ('has_profile_access', 'has_semantic_data_access', 'create_quarterly_partitions');
    
    SELECT COUNT(*) INTO remaining_policies
    FROM pg_policies 
    WHERE schemaname = 'public';
    
    RAISE NOTICE 'Rollback Summary:';
    RAISE NOTICE '  - Remaining V3 tables: %', remaining_tables;
    RAISE NOTICE '  - Remaining V3 functions: %', remaining_functions;
    RAISE NOTICE '  - Remaining policies: %', remaining_policies;
    
    IF remaining_tables = 0 AND remaining_functions = 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '✅ DATABASE V3 ROLLBACK SUCCESSFUL';
        RAISE NOTICE 'All V3 database objects have been removed';
        RAISE NOTICE 'Database is back to pre-V3 state';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '⚠️  ROLLBACK PARTIALLY SUCCESSFUL';
        RAISE NOTICE 'Some objects may remain - manual cleanup may be required';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Rollback completed at: %', NOW();
END $$;