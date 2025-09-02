-- =============================================================================
-- 06_SECURITY_HOTFIX.SQL - GPT-5 Security Hardening
-- =============================================================================
-- PURPOSE: Apply security fixes to 06_security.sql (v1.0 → v1.1)
-- DATE: September 2, 2025
-- DEPLOYMENT: Run this script against Supabase to apply hotfixes
--
-- FIXES APPLIED:
-- 1. Added dependency checks for clinical_alert_rules and provider_action_items tables
-- 2. Added WITH CHECK clauses to narrative link policies (6 policies)
-- 3. Added WITH CHECK clauses to AI processing policies (2 policies)
-- =============================================================================

BEGIN;

-- =============================================================================
-- VERIFICATION: Confirm dependencies exist before attempting policy updates
-- =============================================================================

DO $$
BEGIN
    -- Verify required tables exist for policy creation
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_alert_rules') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_alert_rules missing. Run 05_healthcare_journey.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_action_items') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: provider_action_items missing. Run 05_healthcare_journey.sql first.';
    END IF;
    
    -- Verify narrative link tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'narrative_condition_links') THEN
        RAISE NOTICE 'narrative_condition_links table not found - this is expected if 06_security.sql not yet deployed';
        RETURN;
    END IF;
    
    RAISE NOTICE 'All dependency checks passed, proceeding with policy updates';
END $$;

-- =============================================================================
-- FIX 1: Update narrative link policies with WITH CHECK clauses
-- =============================================================================

-- narrative_condition_links policy update
DROP POLICY IF EXISTS narrative_condition_links_access ON narrative_condition_links;
CREATE POLICY narrative_condition_links_access ON narrative_condition_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_condition_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_condition_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- narrative_medication_links policy update
DROP POLICY IF EXISTS narrative_medication_links_access ON narrative_medication_links;
CREATE POLICY narrative_medication_links_access ON narrative_medication_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_medication_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_medication_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- narrative_allergy_links policy update
DROP POLICY IF EXISTS narrative_allergy_links_access ON narrative_allergy_links;
CREATE POLICY narrative_allergy_links_access ON narrative_allergy_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_allergy_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_allergy_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- narrative_immunization_links policy update
DROP POLICY IF EXISTS narrative_immunization_links_access ON narrative_immunization_links;
CREATE POLICY narrative_immunization_links_access ON narrative_immunization_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_immunization_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_immunization_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- narrative_vital_links policy update
DROP POLICY IF EXISTS narrative_vital_links_access ON narrative_vital_links;
CREATE POLICY narrative_vital_links_access ON narrative_vital_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_vital_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_vital_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- narrative_source_mappings policy update
DROP POLICY IF EXISTS narrative_source_mappings_access ON narrative_source_mappings;
CREATE POLICY narrative_source_mappings_access ON narrative_source_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_source_mappings.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_source_mappings.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- =============================================================================
-- FIX 2: Update AI processing policies with WITH CHECK clauses
-- =============================================================================

-- narrative_creation_audit policy update
DROP POLICY IF EXISTS narrative_creation_audit_access ON narrative_creation_audit;
CREATE POLICY narrative_creation_audit_access ON narrative_creation_audit
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM semantic_processing_sessions sps
            WHERE sps.id = narrative_creation_audit.semantic_processing_session_id
            AND has_semantic_data_access(auth.uid(), sps.patient_id, 'ai_processing')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM semantic_processing_sessions sps
            WHERE sps.id = narrative_creation_audit.semantic_processing_session_id
            AND has_semantic_data_access(auth.uid(), sps.patient_id, 'ai_processing')
        )
    );

-- shell_file_synthesis_results policy update
DROP POLICY IF EXISTS shell_file_synthesis_results_access ON shell_file_synthesis_results;
CREATE POLICY shell_file_synthesis_results_access ON shell_file_synthesis_results
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM shell_files sf
            WHERE sf.id = shell_file_synthesis_results.shell_file_id
            AND has_semantic_data_access(auth.uid(), sf.patient_id, 'ai_processing')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM shell_files sf
            WHERE sf.id = shell_file_synthesis_results.shell_file_id
            AND has_semantic_data_access(auth.uid(), sf.patient_id, 'ai_processing')
        )
    );

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '06_security_hotfix.sql completed successfully';
    RAISE NOTICE 'Applied fixes: dependency checks, WITH CHECK clauses for narrative links and AI processing';
    RAISE NOTICE 'Updated 8 policies with proper write restrictions';
    RAISE NOTICE 'Source file updated to v1.1 for future deployments';
END $$;