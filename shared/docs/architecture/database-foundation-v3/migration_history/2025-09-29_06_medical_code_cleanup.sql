-- =============================================================================
-- MEDICAL CODE ARCHITECTURE CLEANUP - VESTIGIAL TABLE REMOVAL
-- =============================================================================
-- Date: 2025-09-29
-- Module: 06 - Medical Code Cleanup (Phase 1.6)
-- Priority: MEDIUM (Architecture simplification)
-- Dependencies: None (unused tables and columns)
-- Risk Level: MINIMAL (removing unused database objects only)
--
-- Purpose: Remove unused FK-based medical code system, keep vector-based system
-- Architecture: Simplify to single vector-based medical code assignment system
-- Impact: Cleaner schema, reduced maintenance overhead, eliminates dual-system confusion
--
-- CONTEXT: Two medical code systems exist but only vector-based system is used
-- ADVANTAGE: Pre-launch means no data in unused tables - safe surgical removal
-- =============================================================================

BEGIN;

-- =============================================================================
-- PREFLIGHT VALIDATION
-- =============================================================================

DO $$
DECLARE
    old_table_count INTEGER;
    old_column_refs INTEGER;
BEGIN
    -- Verify unused tables are empty (should be 0)
    SELECT
        COALESCE((SELECT COUNT(*) FROM medical_condition_codes), 0) +
        COALESCE((SELECT COUNT(*) FROM medication_reference), 0)
    INTO old_table_count;

    -- Verify unused FK columns have no data (should be 0)
    SELECT
        COALESCE((SELECT COUNT(*) FROM patient_conditions WHERE medical_condition_code_id IS NOT NULL), 0) +
        COALESCE((SELECT COUNT(*) FROM patient_medications WHERE medication_reference_id IS NOT NULL), 0) +
        COALESCE((SELECT COUNT(*) FROM patient_allergies WHERE medication_reference_id IS NOT NULL), 0)
    INTO old_column_refs;

    IF old_table_count > 0 THEN
        RAISE EXCEPTION 'SAFETY CHECK FAILED: Found % records in unused medical code tables. Manual review required.', old_table_count;
    END IF;

    IF old_column_refs > 0 THEN
        RAISE EXCEPTION 'SAFETY CHECK FAILED: Found % FK references in unused columns. Manual review required.', old_column_refs;
    END IF;

    -- Verify new vector system exists (the working replacement)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'universal_medical_codes') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: universal_medical_codes table not found. Vector system required before removing old system.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medical_code_assignments') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: medical_code_assignments table not found. Vector system required before removing old system.';
    END IF;

    RAISE NOTICE 'Preflight validation passed: Ready for medical code architecture cleanup';
END $$;

-- =============================================================================
-- PRE-CLEANUP VERIFICATION
-- =============================================================================

-- Display current state of unused objects
DO $$
DECLARE
    table_record RECORD;
    column_record RECORD;
    table_exists BOOLEAN;
    column_exists BOOLEAN;
BEGIN
    RAISE NOTICE 'PRE-CLEANUP MEDICAL CODE ARCHITECTURE STATUS:';

    -- Check unused tables
    FOR table_record IN
        SELECT unnest(ARRAY[
            'medical_condition_codes',
            'medication_reference'
        ]) AS table_name
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = table_record.table_name
              AND table_schema = 'public'
        ) INTO table_exists;

        IF table_exists THEN
            RAISE NOTICE '  - Table % exists (will be removed)', table_record.table_name;
        ELSE
            RAISE NOTICE '  - Table % does not exist (already clean)', table_record.table_name;
        END IF;
    END LOOP;

    -- Check unused FK columns
    FOR column_record IN
        SELECT * FROM (VALUES
            ('patient_conditions', 'medical_condition_code_id'),
            ('patient_medications', 'medication_reference_id'),
            ('patient_allergies', 'medication_reference_id')
        ) AS t(table_name, column_name)
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = column_record.table_name
              AND column_name = column_record.column_name
              AND table_schema = 'public'
        ) INTO column_exists;

        IF column_exists THEN
            RAISE NOTICE '  - Column %.% exists (will be removed)', column_record.table_name, column_record.column_name;
        ELSE
            RAISE NOTICE '  - Column %.% does not exist (already clean)', column_record.table_name, column_record.column_name;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- MEDICAL CODE ARCHITECTURE CLEANUP
-- =============================================================================

-- Step 1: Remove unused FK columns (safe - no data references)
DO $$
BEGIN
    -- patient_conditions.medical_condition_code_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patient_conditions'
          AND column_name = 'medical_condition_code_id'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE patient_conditions DROP COLUMN medical_condition_code_id;
        RAISE NOTICE 'Dropped column: patient_conditions.medical_condition_code_id';
    END IF;

    -- patient_medications.medication_reference_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patient_medications'
          AND column_name = 'medication_reference_id'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE patient_medications DROP COLUMN medication_reference_id;
        RAISE NOTICE 'Dropped column: patient_medications.medication_reference_id';
    END IF;

    -- patient_allergies.medication_reference_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patient_allergies'
          AND column_name = 'medication_reference_id'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE patient_allergies DROP COLUMN medication_reference_id;
        RAISE NOTICE 'Dropped column: patient_allergies.medication_reference_id';
    END IF;
END $$;

-- Step 2: Remove unused tables (safe - no data, no queries)
DROP TABLE IF EXISTS medical_condition_codes;
DROP TABLE IF EXISTS medication_reference;

DO $$
BEGIN
    RAISE NOTICE 'Medical code architecture cleanup completed:';
    RAISE NOTICE '  - 3 unused FK columns removed from clinical tables';
    RAISE NOTICE '  - 2 unused reference tables removed';
    RAISE NOTICE '  - Architecture simplified to single vector-based system';
END $$;

-- =============================================================================
-- POST-CLEANUP VERIFICATION
-- =============================================================================

DO $$
DECLARE
    remaining_old_tables TEXT[];
    remaining_old_columns TEXT[];
    old_table_count INTEGER;
    old_column_count INTEGER;
BEGIN
    -- Check for any remaining old tables
    SELECT ARRAY_AGG(table_name)
    INTO remaining_old_tables
    FROM information_schema.tables
    WHERE table_name IN ('medical_condition_codes', 'medication_reference')
      AND table_schema = 'public';

    old_table_count := COALESCE(array_length(remaining_old_tables, 1), 0);

    -- Check for any remaining old FK columns
    SELECT ARRAY_AGG(table_name || '.' || column_name)
    INTO remaining_old_columns
    FROM information_schema.columns
    WHERE (table_name = 'patient_conditions' AND column_name = 'medical_condition_code_id')
       OR (table_name = 'patient_medications' AND column_name = 'medication_reference_id')
       OR (table_name = 'patient_allergies' AND column_name = 'medication_reference_id')
      AND table_schema = 'public';

    old_column_count := COALESCE(array_length(remaining_old_columns, 1), 0);

    IF old_table_count > 0 THEN
        RAISE EXCEPTION 'CLEANUP VERIFICATION FAILED: % old tables still exist: %',
                       old_table_count, array_to_string(remaining_old_tables, ', ');
    END IF;

    IF old_column_count > 0 THEN
        RAISE EXCEPTION 'CLEANUP VERIFICATION FAILED: % old FK columns still exist: %',
                       old_column_count, array_to_string(remaining_old_columns, ', ');
    END IF;

    -- Verify vector system still exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'universal_medical_codes') THEN
        RAISE EXCEPTION 'CRITICAL ERROR: universal_medical_codes table missing after cleanup';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medical_code_assignments') THEN
        RAISE EXCEPTION 'CRITICAL ERROR: medical_code_assignments table missing after cleanup';
    END IF;

    RAISE NOTICE 'POST-CLEANUP VERIFICATION PASSED:';
    RAISE NOTICE '  - All unused tables successfully removed';
    RAISE NOTICE '  - All unused FK columns successfully removed';
    RAISE NOTICE '  - Vector-based medical code system preserved';
    RAISE NOTICE '  - Architecture now simplified to single working system';
END $$;

-- =============================================================================
-- ARCHITECTURE ALIGNMENT CONFIRMATION
-- =============================================================================

DO $$
DECLARE
    vector_tables INTEGER;
    clinical_tables INTEGER;
BEGIN
    -- Count remaining medical code tables (should be 3: universal, regional, assignments)
    SELECT COUNT(*)
    INTO vector_tables
    FROM information_schema.tables
    WHERE table_name IN ('universal_medical_codes', 'regional_medical_codes', 'medical_code_assignments')
      AND table_schema = 'public';

    -- Count clinical tables that used to have FK columns
    SELECT COUNT(*)
    INTO clinical_tables
    FROM information_schema.tables
    WHERE table_name IN ('patient_conditions', 'patient_medications', 'patient_allergies')
      AND table_schema = 'public';

    RAISE NOTICE 'MEDICAL CODE ARCHITECTURE STATUS:';
    RAISE NOTICE '  - Vector system tables: % (universal_medical_codes, regional_medical_codes, medical_code_assignments)', vector_tables;
    RAISE NOTICE '  - Clinical tables: % (cleaned of unused FK columns)', clinical_tables;
    RAISE NOTICE '  - Architecture: Single vector-based medical code assignment system';
    RAISE NOTICE '  - Eliminated: Dual-system confusion and maintenance overhead';
END $$;

COMMIT;

-- =============================================================================
-- DEPLOYMENT SUCCESS CONFIRMATION
-- =============================================================================

SELECT
    'MEDICAL CODE ARCHITECTURE CLEANUP COMPLETE' as status,
    '2 unused tables + 3 unused FK columns removed' as action_taken,
    'Single vector-based medical code system' as architecture_result,
    'Ready for bridge schema creation with simplified architecture' as next_step;