-- =============================================================================
-- V3 ARCHITECTURE TEST QUERIES - Clinical Data Retrieval
-- =============================================================================
-- PURPOSE: Validate V3 hub-and-spoke architecture with real-world clinical queries
-- TEST: Extract 'past surgeries' and 'past interventions' from V3 architecture
-- =============================================================================

-- =============================================================================
-- TEST 1: PAST SURGERIES - Hub-and-Spoke Approach
-- =============================================================================

-- Query 1A: All Past Surgeries (Comprehensive View)
SELECT 
    pce.id as event_id,
    pce.event_name,
    pce.event_date,
    pce.body_site,
    pce.performed_by,
    pce.facility_name,
    pi.technique,
    pi.equipment_used,
    pi.immediate_outcome,
    pi.complications,
    pi.followup_required,
    -- Source information
    sf.filename as source_document,
    cn.narrative_content as clinical_story,
    -- Confidence scoring
    pce.ai_confidence,
    pce.requires_review
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
LEFT JOIN shell_files sf ON sf.id = pce.shell_file_id
LEFT JOIN clinical_narratives cn ON cn.id = pce.narrative_id
WHERE pce.patient_id = $1  -- Replace with actual patient_id
AND pce.activity_type = 'intervention'
AND pi.intervention_type IN ('surgery', 'major_procedure')
AND pce.event_date < NOW()  -- Past events only
ORDER BY pce.event_date DESC;

-- Query 1B: Surgery Summary with Timeline Context
SELECT 
    hte.display_primary as surgery_name,
    hte.display_secondary as procedure_details,
    hte.event_date,
    hte.display_category,
    hte.provider_name,
    hte.facility_name,
    -- Rich context from hub
    pce.cpt_code,
    pce.icd10_code,
    pi.immediate_outcome,
    pi.complications,
    -- Narrative context
    cn.ai_narrative_summary as clinical_context
FROM healthcare_timeline_events hte
JOIN patient_clinical_events pce ON pce.id = hte.clinical_event_id
JOIN patient_interventions pi ON pi.event_id = pce.id
LEFT JOIN clinical_narratives cn ON cn.id = pce.narrative_id
WHERE hte.patient_id = $1
AND hte.display_category = 'treatment'
AND hte.display_subcategory IN ('surgery', 'major_procedure')
ORDER BY hte.event_date DESC;

-- =============================================================================
-- TEST 2: ALL PAST INTERVENTIONS - Flexible Classification
-- =============================================================================

-- Query 2A: All Interventions by Type (Hierarchical View)
SELECT 
    pi.intervention_type,
    COUNT(*) as intervention_count,
    MIN(pce.event_date) as first_occurrence,
    MAX(pce.event_date) as most_recent,
    STRING_AGG(DISTINCT pce.event_name, ', ') as intervention_names
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
WHERE pce.patient_id = $1
AND pce.activity_type = 'intervention'
AND pce.event_date < NOW()
GROUP BY pi.intervention_type
ORDER BY most_recent DESC;

-- Query 2B: Detailed Intervention History with Clinical Context
SELECT 
    pce.event_date,
    pce.event_name,
    pi.intervention_type,
    pi.technique,
    -- Clinical context
    pce.clinical_purposes,
    pce.method,
    pce.body_site,
    -- Outcomes
    pi.immediate_outcome,
    pi.complications,
    pi.followup_required,
    -- Provider context
    he.provider_name,
    he.provider_specialty,
    he.facility_type,
    -- AI processing context
    pce.ai_confidence,
    CASE WHEN pce.requires_review THEN '⚠️ Needs Review' ELSE '✅ Validated' END as validation_status
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
LEFT JOIN healthcare_encounters he ON he.id = pce.encounter_id
WHERE pce.patient_id = $1
AND pce.activity_type = 'intervention'
ORDER BY pce.event_date DESC;

-- =============================================================================
-- TEST 3: MEDICATION INTERVENTIONS - Specialized Table Integration
-- =============================================================================

-- Query 3: Medication Administration History (Hybrid Approach)
SELECT 
    -- From specialized medication table (ongoing prescriptions)
    pm.medication_name as prescribed_medication,
    pm.prescribed_dose,
    pm.frequency,
    pm.start_date,
    pm.end_date,
    pm.status as prescription_status,
    -- From intervention events (administration events)
    pce.event_date as administration_date,
    pi.dose_amount as administered_dose,
    pi.route as administration_route,
    pi.immediate_outcome,
    -- Clinical context
    pm.indication,
    pm.prescribing_provider,
    -- Source documents
    sf.filename as source_document
FROM patient_medications pm
LEFT JOIN patient_clinical_events pce ON pce.patient_id = pm.patient_id
LEFT JOIN patient_interventions pi ON pi.event_id = pce.id AND pi.substance_name ILIKE '%' || pm.medication_name || '%'
LEFT JOIN shell_files sf ON sf.id = pm.source_shell_file_id
WHERE pm.patient_id = $1
AND (pm.status != 'active' OR pce.event_date < NOW())  -- Past medications or past administrations
ORDER BY COALESCE(pce.event_date, pm.start_date) DESC;

-- =============================================================================
-- TEST 4: SURGICAL PROCEDURES WITH NARRATIVE CONTEXT
-- =============================================================================

-- Query 4: Surgery Stories - Full Clinical Narrative
SELECT 
    pce.event_name as surgery_name,
    pce.event_date,
    pi.technique,
    pi.equipment_used,
    pi.immediate_outcome,
    -- Rich narrative context
    cn.narrative_content as surgery_story,
    cn.ai_narrative_summary as key_points,
    -- Source context
    sf.ai_synthesized_summary as document_summary,
    -- Links to related clinical data
    ncl.link_context as related_conditions,
    nml.medication_context as related_medications
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
LEFT JOIN clinical_narratives cn ON cn.id = pce.narrative_id
LEFT JOIN shell_files sf ON sf.id = pce.shell_file_id
LEFT JOIN narrative_condition_links ncl ON ncl.narrative_id = cn.id
LEFT JOIN narrative_medication_links nml ON nml.narrative_id = cn.id
WHERE pce.patient_id = $1
AND pi.intervention_type IN ('surgery', 'major_procedure')
ORDER BY pce.event_date DESC;

-- =============================================================================
-- TEST 5: PERFORMANCE VALIDATION
-- =============================================================================

-- Query 5: Index Usage Validation (Check if queries use indexes efficiently)
EXPLAIN ANALYZE
SELECT pce.event_name, pce.event_date, pi.intervention_type
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
WHERE pce.patient_id = $1
AND pce.activity_type = 'intervention'
AND pce.event_date BETWEEN '2020-01-01' AND '2024-12-31'
ORDER BY pce.event_date DESC;