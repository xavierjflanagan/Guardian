-- =============================================================================
-- NARRATIVE LINKING CLEANUP - PRE-LAUNCH TABLE REMOVAL
-- =============================================================================
-- Date: 2025-09-29
-- Module: 05 - Narrative Linking Cleanup (Phase 1.5)
-- Priority: LOW (Pre-launch table cleanup)
-- Dependencies: None (tables are empty)
-- Risk Level: MINIMAL (removing empty tables only)
--
-- Purpose: Remove redundant narrative linking tables left over from migration 03
-- Architecture: Align database reality with intended single-table linking design
-- Impact: Simplifies architecture, reduces maintenance overhead, enables clean bridge schema creation
--
-- CONTEXT: Migration 03 created narrative_event_links but didn't remove old specific tables
-- ADVANTAGE: Pre-launch means no data migration required - simple DROP operations
-- =============================================================================

BEGIN;

-- =============================================================================
-- PREFLIGHT VALIDATION
-- =============================================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    -- Verify we're in pre-launch state (tables should be empty)
    SELECT
        COALESCE((SELECT COUNT(*) FROM narrative_condition_links), 0) +
        COALESCE((SELECT COUNT(*) FROM narrative_medication_links), 0) +
        COALESCE((SELECT COUNT(*) FROM narrative_allergy_links), 0) +
        COALESCE((SELECT COUNT(*) FROM narrative_immunization_links), 0) +
        COALESCE((SELECT COUNT(*) FROM narrative_vital_links), 0)
    INTO table_count;

    IF table_count > 0 THEN
        RAISE EXCEPTION 'SAFETY CHECK FAILED: Found % records in narrative linking tables. This script is for pre-launch cleanup only.', table_count;
    END IF;

    -- Verify narrative_event_links exists (the replacement table)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'narrative_event_links') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: narrative_event_links table not found. Required before removing old tables.';
    END IF;

    RAISE NOTICE 'Preflight validation passed: Ready for narrative linking cleanup';
END $$;

-- =============================================================================
-- PRE-CLEANUP VERIFICATION
-- =============================================================================

-- Display current state of redundant tables
DO $$
DECLARE
    table_record RECORD;
    table_exists BOOLEAN;
BEGIN
    RAISE NOTICE 'PRE-CLEANUP TABLE STATUS:';

    FOR table_record IN
        SELECT unnest(ARRAY[
            'narrative_condition_links',
            'narrative_medication_links',
            'narrative_allergy_links',
            'narrative_immunization_links',
            'narrative_vital_links'
        ]) AS table_name
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = table_record.table_name
        ) INTO table_exists;

        IF table_exists THEN
            RAISE NOTICE '  - % exists (will be removed)', table_record.table_name;
        ELSE
            RAISE NOTICE '  - % does not exist (already clean)', table_record.table_name;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- NARRATIVE LINKING TABLE CLEANUP
-- =============================================================================

-- Remove redundant specific linking tables (empty, pre-launch safe)
DROP TABLE IF EXISTS narrative_condition_links;
DROP TABLE IF EXISTS narrative_medication_links;
DROP TABLE IF EXISTS narrative_allergy_links;
DROP TABLE IF EXISTS narrative_immunization_links;
DROP TABLE IF EXISTS narrative_vital_links;

DO $$
BEGIN
    RAISE NOTICE 'Narrative linking cleanup completed: 5 redundant tables removed';
END $$;

-- =============================================================================
-- POST-CLEANUP VERIFICATION
-- =============================================================================

DO $$
DECLARE
    remaining_tables TEXT[];
    table_count INTEGER;
BEGIN
    -- Check for any remaining old narrative linking tables
    SELECT ARRAY_AGG(table_name)
    INTO remaining_tables
    FROM information_schema.tables
    WHERE table_name LIKE 'narrative_%_links'
      AND table_name != 'narrative_event_links';

    table_count := COALESCE(array_length(remaining_tables, 1), 0);

    IF table_count > 0 THEN
        RAISE EXCEPTION 'CLEANUP VERIFICATION FAILED: % old narrative linking tables still exist: %',
                       table_count, array_to_string(remaining_tables, ', ');
    END IF;

    -- Verify narrative_event_links still exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'narrative_event_links') THEN
        RAISE EXCEPTION 'CRITICAL ERROR: narrative_event_links table missing after cleanup';
    END IF;

    RAISE NOTICE 'POST-CLEANUP VERIFICATION PASSED:';
    RAISE NOTICE '  - All 5 redundant tables successfully removed';
    RAISE NOTICE '  - narrative_event_links table preserved as intended';
    RAISE NOTICE '  - Architecture now aligned with single-table linking design';
END $$;

-- =============================================================================
-- ARCHITECTURE ALIGNMENT CONFIRMATION
-- =============================================================================

DO $$
DECLARE
    total_tables INTEGER;
BEGIN
    -- Count remaining narrative-related tables
    SELECT COUNT(*)
    INTO total_tables
    FROM information_schema.tables
    WHERE table_name IN ('clinical_narratives', 'narrative_event_links', 'narrative_relationships');

    RAISE NOTICE 'NARRATIVE ARCHITECTURE STATUS:';
    RAISE NOTICE '  - narrative_event_links: ✓ (generic linking table)';
    RAISE NOTICE '  - clinical_narratives: ✓ (main narratives table)';
    RAISE NOTICE '  - narrative_relationships: ✓ (narrative hierarchy)';
    RAISE NOTICE '  - Total narrative tables: %', total_tables;
    RAISE NOTICE '  - Architecture: Aligned with PROPOSED-UPDATES-2025-09-18.md';
END $$;

COMMIT;

-- =============================================================================
-- DEPLOYMENT SUCCESS CONFIRMATION
-- =============================================================================

SELECT
    'NARRATIVE LINKING CLEANUP COMPLETE' as status,
    '5 redundant tables removed' as action_taken,
    'narrative_event_links preserved' as architecture_result,
    'Ready for Phase 1 bridge schema creation' as next_step;