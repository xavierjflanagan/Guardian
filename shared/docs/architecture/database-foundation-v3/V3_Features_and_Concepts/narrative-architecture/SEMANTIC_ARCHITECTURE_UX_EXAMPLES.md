# Semantic Architecture: UX Query Examples

**Created:** 2025-08-27
**Updated:** 2025-09-25 - Aligned with clinical_event_id architecture
**Purpose:** Demonstrate the clinical narrative linking system UX capabilities
**Status:** V3 Database Implementation Guide - Updated for Russian Babushka Doll Context  

## Executive Summary

This document demonstrates how the semantic architecture with clinical narrative linking creates powerful storytelling UX experiences. Every clinical data point (condition, medication, allergy, etc.) can tell its complete story through narrative connections.

## UX Experience Examples

### Example 1: Click on "Metformin 500mg" in Medications List

**Database Query Flow (Updated for clinical_event_id Architecture):**
```sql
-- Step 1: Get medication details and primary narrative
SELECT
    pm.medication_name,
    pm.prescribed_dose || ' ' || pm.frequency as dosage,
    pm.start_date as prescribed_date,
    pm.primary_narrative_id,
    pm.clinical_event_id,
    cn.title,
    cn.summary as ai_narrative_summary,
    cn.narrative_type
FROM patient_medications pm
LEFT JOIN clinical_narratives cn ON pm.primary_narrative_id = cn.id
WHERE pm.id = $medication_id AND pm.is_current = true;

-- Step 2: Get complete clinical context via clinical_event_id (Russian Babushka Doll)
SELECT
    -- Conditions from same clinical events
    pc.condition_name,
    pc.status,
    pc.onset_date,
    -- Healthcare encounter context
    he.provider_name as prescribed_by,
    he.specialty,
    he.facility_name,
    he.encounter_type,
    -- Clinical reasoning from master event
    pce.healthcare_context
FROM patient_medications pm
JOIN patient_clinical_events pce ON pm.clinical_event_id = pce.id
LEFT JOIN patient_conditions pc ON pc.clinical_event_id = pce.id
LEFT JOIN healthcare_encounters he ON he.clinical_event_id = pce.id
WHERE pm.id = $medication_id;

-- Step 3: Get related narratives through narrative relationships
SELECT
    cn.title as narrative_title,
    cn.summary as ai_narrative_summary,
    cn.narrative_type,
    nr.relationship_type,
    cn.created_at
FROM patient_medications pm
JOIN narrative_relationships nr ON (pm.primary_narrative_id = nr.child_narrative_id
                                   OR pm.primary_narrative_id = nr.parent_narrative_id)
JOIN clinical_narratives cn ON (cn.id = nr.parent_narrative_id
                               OR cn.id = nr.child_narrative_id)
WHERE pm.id = $medication_id
  AND cn.id != pm.primary_narrative_id  -- Exclude self
  AND cn.is_current = true
ORDER BY cn.created_at;
```

**UI Popup Display:**
```
💊 Metformin 500mg
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Medication Context
Prescribed: March 15, 2022 by Dr. Martinez (Endocrinology)
Current Status: Active | Daily dosing

🏥 Treating Condition
Type 2 Diabetes Mellitus (diagnosed March 2022)
├─ Status: Well-controlled (A1C 6.8%)
├─ Click to view condition details →

📖 Clinical Story
Primary Narrative: "Diabetes Management Journey"  
Role in Story: Initial first-line therapy for glucose control
Prescription Context: Started after failed dietary modifications
Therapeutic Outcome: Achieved target A1C reduction with excellent tolerance

📅 Journey Timeline
Current Phase: Maintenance therapy (stable dosing)
Started: June 2022 (3 months post-diagnosis)
Next Review: Annual diabetes comprehensive exam

🔗 Related Narratives (2)
├─ Primary: Diabetes Management Journey → Click to read full story
└─ Recent: Annual Physical 2024 → Medication review and continuation

[View Full Diabetes Story] [View All Related Documents]
```

### Example 2: Click on "Penicillin Allergy" in Allergies List

**Database Query Flow (Updated for clinical_event_id Architecture):**
```sql
-- Get allergy details with complete clinical context
SELECT
    pa.allergen_name,
    pa.severity,
    pa.reaction_description,
    pa.primary_narrative_id,
    pa.clinical_event_id,
    cn.title,
    cn.summary as ai_narrative_summary,
    -- Discovery context from clinical event
    pce.healthcare_context,
    pce.event_date as discovered_date,
    -- Healthcare encounter context
    he.provider_name as discovering_provider,
    he.specialty,
    he.encounter_type,
    he.clinical_impression
FROM patient_allergies pa
LEFT JOIN clinical_narratives cn ON pa.primary_narrative_id = cn.id
JOIN patient_clinical_events pce ON pa.clinical_event_id = pce.id
LEFT JOIN healthcare_encounters he ON he.clinical_event_id = pce.id
WHERE pa.id = $allergy_id AND pa.is_current = true;
```

**UI Popup Display:**
```
⚠️ Penicillin Allergy - SEVERE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 Allergy Details  
Severity: Severe (Urticaria and respiratory symptoms)
Discovered: January 15, 2023

📖 Discovery Story
Narrative: "Pneumonia Treatment Episode"
Discovery Context: Discovered during initial antibiotic treatment for community-acquired pneumonia
Reaction: Patient developed widespread urticaria and mild wheezing within 2 hours of amoxicillin/clavulanate administration
Clinical Impact: Required antibiotic change to azithromycin and delayed recovery by 3 days

👨‍⚕️ Healthcare Impact
├─ Provider Notified: Dr. Johnson (Primary Care)
├─ Alternative Selected: Azithromycin (Z-pack)  
├─ Recovery Time: Extended by 3 days due to therapy change
└─ Current Status: Well-documented across all providers

🔗 Full Story Context
[Read Complete Pneumonia Treatment Story] - See how this allergy discovery affected the entire treatment journey

⚡ Safety Alerts
└─ Cross-reactivity: Avoid all penicillins and cephalosporins
```

### Example 3: Click on "Type 2 Diabetes" in Conditions List

**Database Query Flow (Updated for clinical_event_id Architecture):**
```sql
-- Get condition with primary narrative
SELECT
    pc.condition_name,
    pc.status,
    pc.onset_date as diagnosed_date,
    pc.primary_narrative_id,
    pc.clinical_event_id,
    cn.title,
    cn.summary as ai_narrative_summary,
    cn.narrative_type,
    cn.narrative_start_date,
    cn.narrative_end_date,
    cn.is_current
FROM patient_conditions pc
LEFT JOIN clinical_narratives cn ON pc.primary_narrative_id = cn.id
WHERE pc.id = $condition_id AND pc.is_current = true;

-- Get all medications treating this condition (via shared clinical events)
SELECT DISTINCT
    pm.medication_name,
    pm.prescribed_dose || ' ' || pm.frequency as dosage,
    pm.status,
    pm.start_date as prescribed_date,
    he.provider_name as prescribed_by,
    pce.healthcare_context::json->>'clinical_reasoning' as prescription_context
FROM patient_conditions pc
JOIN patient_clinical_events pce ON pc.clinical_event_id = pce.id
JOIN patient_medications pm ON pm.clinical_event_id = pce.id
LEFT JOIN healthcare_encounters he ON he.clinical_event_id = pce.id
WHERE pc.id = $condition_id
  AND pm.is_current = true
ORDER BY pm.start_date;

-- Get all related narratives through narrative relationships
SELECT
    cn.title as narrative_title,
    cn.summary as ai_narrative_summary,
    cn.narrative_start_date,
    cn.narrative_end_date,
    cn.narrative_type,
    nr.relationship_type,
    nr.relationship_strength
FROM patient_conditions pc
JOIN narrative_relationships nr ON (pc.primary_narrative_id = nr.child_narrative_id
                                   OR pc.primary_narrative_id = nr.parent_narrative_id)
JOIN clinical_narratives cn ON (cn.id = nr.parent_narrative_id
                               OR cn.id = nr.child_narrative_id)
WHERE pc.id = $condition_id
  AND cn.id != pc.primary_narrative_id  -- Exclude self
  AND cn.is_current = true
ORDER BY cn.narrative_start_date;
```

**UI Full Page Display:**
```
🩺 Type 2 Diabetes Mellitus - WELL CONTROLLED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Condition Overview
Status: Active, Well-Controlled | Diagnosed: March 15, 2022
Diagnosing Provider: Dr. Martinez, Endocrinology
Last A1C: 6.8% (Target achieved) | Next Review: March 2025

📖 Primary Clinical Story: "Diabetes Management Journey"
This 24-month journey chronicles the evolution from initial diagnosis (A1C 8.2%) through medication optimization, lifestyle interventions, and achievement of excellent glycemic control (A1C 6.8%). The narrative demonstrates successful collaborative care between primary care and endocrinology with strong patient engagement in self-management.

Timeline: March 2022 - Present (Ongoing) | Complexity: Moderate

💊 Current Treatment Plan (3 medications)
├─ Metformin 500mg BID - Primary therapy | Started June 2022
│   Role: First-line glucose control | Outcome: A1C reduced to 7.2%
├─ Lisinopril 10mg daily - Cardiovascular protection | Started August 2022  
│   Role: ACE inhibitor for diabetic nephropathy prevention
└─ Atorvastatin 20mg - Lipid management | Started October 2022
    Role: Statin therapy for cardiovascular risk reduction

📅 Journey Milestones & Narratives
┌─ March 2022: Initial Diagnosis
│   📖 "Diabetes Diagnosis Workup" - Routine physical reveals elevated glucose
│   └─ Outcome: A1C 8.2%, referred to endocrinology
│   
├─ June 2022: Treatment Initiation  
│   📖 "Diabetes Management Optimization" - First-line therapy beginning
│   └─ Outcome: Metformin started, diabetes education completed
│   
├─ September 2022: Early Progress Assessment
│   📖 "Quarterly Diabetes Monitoring" - First treatment response
│   └─ Outcome: A1C improved to 7.2%, patient compliance excellent
│   
├─ March 2023: Target Achievement
│   📖 "Annual Diabetes Comprehensive Review" - Achieving glycemic goals
│   └─ Outcome: A1C 6.8%, no diabetic complications detected
│   
└─ December 2024: Current Maintenance
    📖 "Ongoing Diabetes Maintenance" - Stable long-term management
    └─ Status: Continued excellent control, lifestyle maintained

🔍 Clinical Insights
├─ Patient Response: Excellent medication tolerance and lifestyle adherence
├─ Complications: None detected (annual eye/foot exams normal)
├─ Provider Coordination: Seamless primary care and endocrinology collaboration
└─ Quality Metrics: Achieved all diabetes quality measures

🔗 Related Health Topics
├─ Hypertension (secondary condition) - Managed concurrently
├─ Hyperlipidemia (comorbidity) - Addressed as part of comprehensive care
└─ Preventive Care (screening focus) - Enhanced monitoring protocols

[View Complete Journey Timeline] [Export Diabetes Summary] [Share with Provider]
```

## Technical Implementation: UX Helper Functions

```sql
-- Function to get complete clinical context for any item
CREATE OR REPLACE FUNCTION get_clinical_item_context(
    item_type TEXT, -- 'medication', 'condition', 'allergy', 'immunization', 'vital'
    item_id UUID
) RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}';
    primary_narrative RECORD;
    linked_narratives JSONB := '[]';
    related_conditions JSONB := '[]';
    related_medications JSONB := '[]';
BEGIN
    -- Get primary narrative context
    CASE item_type
        WHEN 'medication' THEN
            SELECT cn.* INTO primary_narrative
            FROM patient_medications pm
            JOIN clinical_narratives cn ON pm.primary_narrative_id = cn.id
            WHERE pm.id = item_id;
            
        WHEN 'condition' THEN
            SELECT cn.* INTO primary_narrative  
            FROM patient_conditions pc
            JOIN clinical_narratives cn ON pc.primary_narrative_id = cn.id
            WHERE pc.id = item_id;
            
        -- Add other cases for allergies, immunizations, etc.
    END CASE;
    
    -- Build comprehensive context response
    result := jsonb_build_object(
        'primary_narrative', row_to_json(primary_narrative),
        'linked_narratives', linked_narratives,
        'related_conditions', related_conditions,
        'related_medications', related_medications,
        'clinical_context', 'full'
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get narrative-aware timeline for patient
CREATE OR REPLACE FUNCTION get_patient_narrative_timeline(
    p_patient_id UUID,
    date_range TSTZRANGE DEFAULT NULL
) RETURNS TABLE (
    event_date TIMESTAMPTZ,
    event_type TEXT,
    narrative_context TEXT,
    clinical_significance TEXT,
    summary TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pce.event_date,
        pce.event_type,
        cn.narrative_purpose,
        pce.clinical_significance,
        COALESCE(cn.ai_narrative_summary, pce.summary)
    FROM patient_clinical_events pce
    LEFT JOIN clinical_narratives cn ON pce.narrative_id = cn.id
    WHERE pce.patient_id = p_patient_id
    AND (date_range IS NULL OR pce.event_date <@ date_range)
    ORDER BY pce.event_date DESC;
END;
$$ LANGUAGE plpgsql;
```

## Benefits Summary

### For Patients
- **Every clinical item tells its story** - Click any medication, condition, or allergy to see its complete narrative context
- **Understand clinical relationships** - See how conditions, treatments, and outcomes connect
- **Meaningful healthcare timeline** - Clinical events organized by story, not just chronology
- **Provider context** - Understand which providers contributed to each aspect of care

### For Healthcare Providers  
- **Complete clinical context** - Every data point includes its narrative background
- **Treatment rationale visibility** - Understand why medications were started, changed, or discontinued
- **Clinical decision support** - Narrative context informs better care decisions
- **Care coordination** - See how different providers and treatments fit into patient's story

### For Healthcare System
- **Rich clinical intelligence** - Data organized by medical meaning, not administrative convenience
- **Quality improvement** - Analyze narrative patterns for care optimization
- **Clinical research** - Study treatment journeys and outcomes by narrative type
- **Patient engagement** - Storytelling approach increases patient understanding and compliance

## Architecture Decision: Clinical Event ID Approach (UPDATED 2025-09-25)

**Original Decision Date:** 2025-08-27 - Junction tables approach
**Updated Decision Date:** 2025-09-25 - Clinical event ID approach
**Decision:** Russian Babushka Doll context assembly via clinical_event_id references
**Trade-off:** Eliminated junction table complexity while maintaining full UX capabilities

### New Architecture Benefits
- **Simplified Queries:** Single clinical_event_id provides access to all contextual layers
- **Pass 3 Efficiency:** Complete context assembly through simple queries
- **Reduced Complexity:** No complex junction table maintenance
- **Same UX Vision:** All examples above still achievable with cleaner architecture

### Context Assembly Strategy
```sql
-- Pass 3 gets complete context for any clinical event
SELECT * FROM patient_medications WHERE clinical_event_id = 'event_001';
SELECT * FROM patient_conditions WHERE clinical_event_id = 'event_001';
SELECT * FROM healthcare_encounters WHERE clinical_event_id = 'event_001';
SELECT * FROM healthcare_timeline_events WHERE clinical_event_id = 'event_001';
```

### Implementation Notes
- **UX Examples Above:** Still valid - same rich context, simpler data model
- **Junction Tables:** Being eliminated in favor of clinical_event_id + narrative_relationships
- **Context Richness:** Maintained through Russian Babushka Doll architecture
- **Performance:** Improved through simpler query patterns

**Final Decision:** Clinical event ID approach provides the same complete UX vision with significantly reduced architectural complexity and better performance characteristics.

## Conclusion

The semantic architecture with clinical narrative linking transforms healthcare data from isolated facts into meaningful stories. This creates profound UX improvements where every clinical data point can tell its complete story, enabling both patients and providers to understand healthcare as coherent narratives rather than fragmented information.

**Architecture Status:** 🔄 **UPDATED** - Clinical event ID approach with Russian Babushka Doll context assembly for comprehensive clinical linking system.

**Implementation Note:** The UX examples in this document demonstrate the end-state user experience. The underlying queries have been updated to use the new clinical_event_id architecture, but the user experience remains identical - every clinical item can still tell its complete story with full contextual richness.