# Semantic Architecture: UX Query Examples

**Created:** 2025-08-27  
**Purpose:** Demonstrate the clinical narrative linking system UX capabilities  
**Status:** V3 Database Implementation Guide  

## Executive Summary

This document demonstrates how the semantic architecture with clinical narrative linking creates powerful storytelling UX experiences. Every clinical data point (condition, medication, allergy, etc.) can tell its complete story through narrative connections.

## UX Experience Examples

### Example 1: Click on "Metformin 500mg" in Medications List

**Database Query Flow:**
```sql
-- Step 1: Get medication details and primary narrative
SELECT 
    pm.medication_name,
    pm.dosage,
    pm.prescribed_date,
    pm.prescribed_by,
    pm.primary_narrative_id,
    cn.ai_narrative_summary,
    cn.narrative_purpose,
    cn.clinical_classification
FROM patient_medications pm
LEFT JOIN clinical_narratives cn ON pm.primary_narrative_id = cn.id
WHERE pm.id = $medication_id;

-- Step 2: Get linked conditions for this medication
SELECT 
    pc.condition_name,
    pc.status,
    pc.diagnosed_date,
    ncl.medication_role,
    ncl.prescription_context,
    ncl.therapeutic_outcome
FROM patient_medications pm
JOIN narrative_medication_links nml ON pm.primary_narrative_id = nml.narrative_id
JOIN narrative_condition_links ncl ON nml.narrative_id = ncl.narrative_id  
JOIN patient_conditions pc ON ncl.condition_id = pc.id
WHERE pm.id = $medication_id;

-- Step 3: Get all narratives this medication appears in
SELECT 
    cn.narrative_purpose,
    cn.ai_narrative_summary,
    nml.medication_role,
    nml.prescription_context,
    nml.medication_phase
FROM narrative_medication_links nml
JOIN clinical_narratives cn ON nml.narrative_id = cn.id
WHERE nml.medication_id = $medication_id
ORDER BY cn.narrative_start_date;
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

**Database Query Flow:**
```sql
-- Get allergy details with discovery narrative
SELECT 
    pa.allergen_name,
    pa.severity,
    pa.reaction_description,
    pa.primary_narrative_id,
    cn.ai_narrative_summary,
    cn.narrative_purpose,
    nal.discovery_circumstances,
    nal.reaction_description_in_narrative,
    nal.clinical_impact
FROM patient_allergies pa
LEFT JOIN clinical_narratives cn ON pa.primary_narrative_id = cn.id
LEFT JOIN narrative_allergy_links nal ON pa.id = nal.allergy_id AND pa.primary_narrative_id = nal.narrative_id
WHERE pa.id = $allergy_id;
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

**Database Query Flow:**
```sql
-- Get condition with all linked narratives and treatments
SELECT 
    pc.condition_name,
    pc.status,
    pc.diagnosed_date,
    pc.diagnosed_by,
    pc.primary_narrative_id,
    cn.ai_narrative_summary,
    cn.narrative_purpose,
    cn.clinical_classification,
    cn.narrative_start_date,
    cn.narrative_end_date,
    cn.is_ongoing
FROM patient_conditions pc
LEFT JOIN clinical_narratives cn ON pc.primary_narrative_id = cn.id
WHERE pc.id = $condition_id;

-- Get all medications treating this condition
SELECT 
    pm.medication_name,
    pm.dosage,
    pm.status,
    pm.prescribed_date,
    nml.medication_role,
    nml.therapeutic_outcome,
    nml.medication_phase
FROM narrative_condition_links ncl
JOIN narrative_medication_links nml ON ncl.narrative_id = nml.narrative_id
JOIN patient_medications pm ON nml.medication_id = pm.id  
WHERE ncl.condition_id = $condition_id
ORDER BY pm.prescribed_date;

-- Get all related narratives for this condition
SELECT 
    cn.narrative_purpose,
    cn.ai_narrative_summary,
    cn.narrative_start_date,
    cn.narrative_end_date,
    cn.clinical_classification,
    ncl.link_type,
    ncl.condition_phase,
    ncl.condition_role_in_narrative
FROM narrative_condition_links ncl
JOIN clinical_narratives cn ON ncl.narrative_id = cn.id
WHERE ncl.condition_id = $condition_id
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

## Architecture Decision: Junction Tables Approach

**Decision Date:** 2025-08-27  
**Decision:** Keep comprehensive junction tables approach for clinical narrative linking  
**Trade-off Accepted:** ~20% increase in Pass 3 token costs for full UX vision support

### Token Cost Impact Analysis
- **Pass 2 Impact:** None (no changes to core extraction)
- **Pass 3 Impact:** +20% tokens (~150-200 additional tokens per document)
- **Annual Cost Estimate:** ~$2,000-4,000 additional AI costs for rich UX features
- **Business Justification:** Clinical safety and UX benefits justify token cost increase

### Alternative Approaches Considered
1. **Lazy Population:** On-demand AI calls when user clicks (rejected - user delays)
2. **Simpler Context Fields:** Single text fields vs structured data (rejected - limited UX)
3. **Essential Links Only:** Conditions + medications only (rejected - incomplete vision)

**Final Decision:** Full junction tables implementation provides complete UX vision and clinical storytelling capabilities that align with healthcare product goals.

## Conclusion

The semantic architecture with clinical narrative linking transforms healthcare data from isolated facts into meaningful stories. This creates profound UX improvements where every clinical data point can tell its complete story, enabling both patients and providers to understand healthcare as coherent narratives rather than fragmented information.

**Architecture Status:** ✅ **IMPLEMENTED** - Full junction tables approach with comprehensive clinical linking system.