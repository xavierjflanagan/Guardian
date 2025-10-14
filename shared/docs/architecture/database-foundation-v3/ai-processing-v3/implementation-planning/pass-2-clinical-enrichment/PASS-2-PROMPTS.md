# Pass 2 Clinical Enrichment - AI Prompts

**Status:** Draft - AI Prompt Engineering Specification
**Created:** 30 September 2025
**Last Updated:** 30 September 2025

---

## Overview

This document defines the complete AI prompt system for Pass 2 clinical enrichment. It specifies the exact prompts, extraction flow, and schema guidance needed to convert Pass 1 entity detection results into structured clinical data following the hub-and-spoke architecture.

---

## Pass 2 Architecture Summary

**Input:** Pass 1 entity detection results + cached raw file (same downscaled image/file as that used in pass 1) +/- OCR text (tbc whether we will need/use ocr data in pass 2 input, and note the OCR-provided bbox spatial data will already be attached to the pass 1 entity output data)
**Output:** Structured clinical data written to V3 database tables
**Model:** GPT5-mini (same as for pass 1, for now)

**Extraction Priority:**
1. **Step 0:** `healthcare_encounters` (visit context - ALWAYS FIRST)
2. **Step 1-N:** For each clinical entity: `patient_clinical_events` (hub) → spoke tables → `medical_code_assignments`

**Hub-and-Spoke Enforcement:**
- Every clinical detail record MUST reference a `patient_clinical_events` parent via `event_id`
- All events within same visit MUST reference the same `encounter_id`

**Foreign Key Relationships:**

The hub-and-spoke architecture uses semantic foreign key naming (e.g., `event_id`, `encounter_id`) rather than verbose table prefixes (e.g., `patient_clinical_events_id`). This follows standard SQL practice where the column name conveys meaning and the `REFERENCES` clause defines the relationship.

1. **encounter_id** (Healthcare Context → Clinical Event)
   - **Pattern**: `patient_clinical_events.encounter_id` REFERENCES `healthcare_encounters(id)`
   - **Purpose**: Links a clinical event to its visit context (e.g., GP visit, hospital admission)
   - **Constraint**: All events from the same visit share the same `encounter_id`

2. **event_id** (Clinical Event → Clinical Details)
   - **Pattern**: `[spoke_table].event_id` REFERENCES `patient_clinical_events(id)`
   - **Purpose**: Links clinical detail records (observations, interventions) to their parent event
   - **Applies to**: All 7 spoke tables (observations, interventions, vitals, conditions, allergies, medications, immunizations)
   - **Constraint**: Every spoke record MUST have a valid `event_id` (NOT NULL constraint enforced)

---

## System Prompt (Base Instructions)

```
# ROLE
You are a medical data extraction specialist working with the Exora Healthcare Platform. Your task is to extract structured clinical data from medical documents and format it according to the V3 database schema.

# CORE PRINCIPLES

1. ENCOUNTER-FIRST EXTRACTION
   - ALWAYS extract healthcare_encounters FIRST before any clinical events
   - All clinical events from the same visit must reference the same encounter_id
   - One encounter per healthcare visit, regardless of how many vitals/medications/observations

2. HUB-AND-SPOKE ARCHITECTURE
   - Every clinical detail is a child of a patient_clinical_events hub record
   - Create the hub event FIRST, then create spoke records referencing the event_id
   - Never create spoke records without a parent event

3. MEDICAL CODING (Step 1.5)
   - You will be provided with candidate medical codes from vector embedding search
   - NEVER generate medical codes freely - only select from the provided candidates
   - Assign both universal codes (LOINC/SNOMED/RxNorm) and regional codes (PBS/MBS) when available
   - Provide confidence scores for code assignments

4. CONFIDENCE SCORING
   - Always provide confidence scores (0.0-1.0) for extracted data
   - Flag records with confidence < 0.80 for manual review
   - Safety-critical items (medications, vaccines) require confidence >= 0.900

5. DATA INTEGRITY
   - Extract only what you see in the document - do not infer or assume
   - Use null for missing optional fields
   - Preserve original text when uncertain about normalization
   - Link all data back to source via shell_file_id

# EXTRACTION FLOW

You will process documents in stages:

STAGE 0: healthcare_encounters (Visit Context)
  → Returns: encounter_id
  → Used by: All patient_clinical_events in this visit

STAGE 1-N: For each clinical entity (BP, HR, medications, etc.)
  → Step N.1: patient_clinical_events (hub with encounter_id reference)
    Returns: event_id
  → Step N.2: Clinical detail (spoke referencing event_id)
    - activity_type: observation → patient_observations + patient_vitals
    - activity_type: intervention → patient_interventions
  → Step N.3: medical_code_assignments (code the entity)
    - Select best match from provided candidate codes
    - Provide confidence score

# SCHEMA GUIDANCE

You will receive bridge schemas in JSON format that define the exact structure for each table.
Follow these schemas precisely:
- Required fields must be present
- Optional fields can be null if not found in document
- Follow enum constraints exactly (no variations)
- Respect data types and formats (UUID, TIMESTAMPTZ, NUMERIC precision)

# OUTPUT FORMAT

Return structured JSON following this format:

{
  "encounter": { /* healthcare_encounters record */ },
  "clinical_events": [
    {
      "event": { /* patient_clinical_events record */ },
      "observations": [ /* patient_observations records */ ],
      "interventions": [ /* patient_interventions records */ ],
      "vitals": [ /* patient_vitals records */ ],
      "code_assignments": [ /* medical_code_assignments records */ ]
    }
  ],
  "processing_metadata": {
    "confidence_summary": { /* overall confidence metrics */ },
    "manual_review_flags": [ /* records flagged for review */ ]
  }
}
```

---

## Document-Specific Prompt Template

```
# DOCUMENT PROCESSING REQUEST

## Context
- Patient ID: {patient_id}
- Shell File ID: {shell_file_id}
- Processing Session ID: {processing_session_id}
- Document Type: {document_type}

## Pass 1 Entity Detection Results

{pass_1_entity_summary}

Total Entities Detected:
- clinical_event: {clinical_event_count}
- healthcare_context: {healthcare_context_count}
- document_structure: {document_structure_count} (skip these)

## Document Content

{full_document_text}

## OCR Spatial Data (for reference)

{ocr_spatial_summary}

## Bridge Schemas

You have been provided with the following bridge schemas to guide extraction:

### ALWAYS REQUIRED:
- healthcare_encounters (extract FIRST)
- patient_clinical_events (hub for all clinical entities)

### CONDITIONAL (based on Pass 1 detection):
{conditional_schema_list}

### Medical Coding Candidates (Step 1.5)

For each entity requiring medical coding, you will be provided with pre-computed candidate codes:

{medical_code_candidates}

## Extraction Instructions

1. START WITH healthcare_encounters
   - Review the full document for visit-level context
   - Extract: encounter_type, encounter_date, provider_name, facility_name
   - Extract narrative fields: chief_complaint, summary, clinical_impression, plan
   - Return the encounter_id for use in all subsequent events

2. FOR EACH clinical_event entity from Pass 1:

   a) Create patient_clinical_events (hub):
      - Reference encounter_id from Step 1
      - Classify activity_type (observation vs intervention)
      - Assign clinical_purposes (monitoring, treatment, diagnosis, etc.)
      - Extract event-level context: method, body_site, performed_by, facility_name

   b) Create spoke record(s):
      - For observations: Create patient_observations record
      - For vitals: ALSO create patient_vitals record (both reference same event_id)
      - For interventions: Create patient_interventions record
      - Reference the event_id from step 2a

   c) Assign medical codes:
      - Review provided candidate codes
      - Select best match based on clinical context
      - Assign universal code (LOINC/SNOMED/RxNorm)
      - Assign regional code (PBS/MBS) if available
      - Provide confidence score for each assignment

3. QUALITY CHECKS:
   - Verify all event_id references are valid
   - Verify all events reference the same encounter_id
   - Verify all required fields are present
   - Flag any low-confidence extractions (< 0.80) for manual review
   - Flag safety-critical items (medications) with confidence < 0.900

## Output

Return the complete extraction as structured JSON following the schemas provided.
```

---

## Schema Tier Selection Logic

Pass 2 dynamically selects schema tier based on document complexity:

**Simple Documents (1-5 clinical events):**
- Use `detailed` schemas from `bridge-schemas/detailed/pass-2/`
- Rich medical context and multiple examples
- Token cost: ~27,000 tokens for all 18 tables

**Complex Documents (6+ clinical events):**
- Use `minimal` schemas from `bridge-schemas/minimal/pass-2/`
- Condensed format with single example
- Token cost: ~3,600 tokens for all 18 tables
- 85-90% token savings

**Schema Loading:**
```typescript
function selectSchemaTier(clinicalEventCount: number): 'detailed' | 'minimal' {
  if (clinicalEventCount <= 5) {
    return 'detailed'; // Rich context for accuracy
  } else {
    return 'minimal'; // Token optimization for complex docs
  }
}

function loadPass2Schemas(
  pass1Results: Pass1Results,
  tier: 'detailed' | 'minimal'
): BridgeSchema[] {
  const schemas: BridgeSchema[] = [];

  // ALWAYS include these
  schemas.push(
    loadSchema('healthcare_encounters', tier),
    loadSchema('patient_clinical_events', tier),
    loadSchema('medical_code_assignments', tier)
  );

  // CONDITIONAL based on Pass 1 entity detection
  if (pass1Results.hasObservations) {
    schemas.push(loadSchema('patient_observations', tier));
  }

  if (pass1Results.hasVitals) {
    schemas.push(loadSchema('patient_vitals', tier));
  }

  if (pass1Results.hasInterventions) {
    schemas.push(loadSchema('patient_interventions', tier));
  }

  // ... additional tables based on Pass 1 results

  return schemas;
}
```

---

## Example: Blood Pressure Document Prompt

**Document:** BP reading with 3 vitals (BP, HR, Temp) + medication

**Pass 1 Results:**
- clinical_event: 4 entities (BP measurement, HR measurement, Temp measurement, Lisinopril)
- healthcare_context: 3 entities (Dr. Smith, Memorial Clinic, March 15, 2024)

**Schema Tier:** `detailed` (only 4 clinical events)

**Schemas Loaded:**
1. healthcare_encounters (detailed)
2. patient_clinical_events (detailed)
3. patient_observations (detailed)
4. patient_vitals (detailed)
5. patient_interventions (detailed)
6. medical_code_assignments (detailed)

**Prompt:**

```
# DOCUMENT PROCESSING REQUEST

## Context
- Patient ID: patient-uuid-123
- Shell File ID: shell-uuid-456
- Document Type: Blood Pressure Reading

## Pass 1 Entity Detection Results

4 clinical_event entities detected:
1. "Blood Pressure: 128/82 mmHg (seated, left arm)"
2. "Heart Rate: 72 bpm"
3. "Temperature: 98.6°F"
4. "Lisinopril 10mg daily"

3 healthcare_context entities detected:
1. "Dr. Sarah Smith, MD"
2. "Memorial Clinic"
3. "March 15, 2024"

## Document Content

Blood Pressure Reading - Memorial Clinic
Date: March 15, 2024
Patient: John Doe

Vital Signs:
- Blood Pressure: 128/82 mmHg (seated, left arm)
- Heart Rate: 72 bpm
- Temperature: 98.6°F

Clinical Note: Patient reports feeling well. BP slightly elevated but within
acceptable range. Continue current antihypertensive medication (Lisinopril 10mg daily).
Advised to monitor sodium intake and maintain regular exercise.

Dr. Sarah Smith, MD

## Bridge Schemas

[healthcare_encounters detailed schema - 1,500 tokens]
[patient_clinical_events detailed schema - 1,500 tokens]
[patient_observations detailed schema - 1,500 tokens]
[patient_vitals detailed schema - 1,500 tokens]
[patient_interventions detailed schema - 1,500 tokens]
[medical_code_assignments detailed schema - 1,500 tokens]

## Medical Coding Candidates (Step 1.5)

For "Blood Pressure: 128/82 mmHg":
- LOINC 85354-9 "Blood pressure panel" (similarity: 0.94)
- LOINC 85352-3 "Blood pressure systolic and diastolic" (similarity: 0.92)
- SNOMED 75367002 "Blood pressure (observable entity)" (similarity: 0.89)

For "Heart Rate: 72 bpm":
- LOINC 8867-4 "Heart rate" (similarity: 0.96)
- SNOMED 364075005 "Heart rate (observable entity)" (similarity: 0.93)

For "Temperature: 98.6°F":
- LOINC 8310-5 "Body temperature" (similarity: 0.95)
- SNOMED 276885007 "Core body temperature" (similarity: 0.91)

For "Lisinopril 10mg daily":
- RxNorm 314076 "Lisinopril 10 MG Oral Tablet" (similarity: 0.96)
- PBS 8254K "Lisinopril 10mg tablet" (similarity: 0.94, country: AUS)

## Extraction Instructions

[Standard instructions as above]

## Output

Return the complete extraction as structured JSON.
```

**Expected AI Output:**

```json
{
  "encounter": {
    "patient_id": "patient-uuid-123",
    "encounter_type": "outpatient",
    "encounter_date": "2024-03-15",
    "provider_name": "Dr. Sarah Smith, MD",
    "facility_name": "Memorial Clinic",
    "chief_complaint": "Routine blood pressure monitoring",
    "summary": "Patient presents for routine BP check. Vitals stable, BP slightly elevated but acceptable. Continue current medication regimen.",
    "clinical_impression": "Hypertension - controlled",
    "plan": "Continue Lisinopril 10mg daily. Monitor sodium intake and maintain regular exercise.",
    "ai_extracted": true,
    "ai_confidence": 0.91
  },
  "clinical_events": [
    {
      "event": {
        "patient_id": "patient-uuid-123",
        "shell_file_id": "shell-uuid-456",
        "encounter_id": "{{encounter_id_from_above}}",
        "activity_type": "observation",
        "clinical_purposes": ["monitoring", "chronic_disease_management"],
        "event_name": "Blood Pressure Measurement",
        "event_date": "2024-03-15",
        "method": "automated blood pressure cuff",
        "body_site": "left_arm",
        "performed_by": "Dr. Sarah Smith, MD",
        "facility_name": "Memorial Clinic",
        "ai_extracted": true,
        "ai_confidence": 0.95
      },
      "observations": [
        {
          "observation_category": "vital-signs",
          "observation_type": "blood_pressure",
          "value_text": "128/82 mmHg",
          "value_numeric": 128.0,
          "value_secondary": 82.0,
          "unit": "mmHg",
          "interpretation": "slightly_elevated",
          "body_site": "left_arm",
          "method": "automated_cuff",
          "position": "seated",
          "ai_extracted": true,
          "ai_confidence": 0.98
        }
      ],
      "vitals": [
        {
          "patient_id": "patient-uuid-123",
          "vital_type": "blood_pressure",
          "measurement_value": {
            "systolic": 128,
            "diastolic": 82,
            "position": "seated",
            "arm": "left"
          },
          "unit": "mmHg",
          "measurement_date": "2024-03-15T00:00:00Z",
          "body_site": "left_arm",
          "method": "automated blood pressure cuff",
          "ai_extracted": true,
          "ai_confidence": 0.98
        }
      ],
      "code_assignments": [
        {
          "entity_table": "patient_observations",
          "universal_code_system": "LOINC",
          "universal_code": "85354-9",
          "universal_display": "Blood pressure panel",
          "universal_confidence": 0.94
        }
      ]
    },
    {
      "event": {
        "patient_id": "patient-uuid-123",
        "shell_file_id": "shell-uuid-456",
        "encounter_id": "{{same_encounter_id}}",
        "activity_type": "observation",
        "clinical_purposes": ["monitoring"],
        "event_name": "Heart Rate Measurement",
        "event_date": "2024-03-15",
        "performed_by": "Dr. Sarah Smith, MD",
        "facility_name": "Memorial Clinic",
        "ai_extracted": true,
        "ai_confidence": 0.95
      },
      "observations": [
        {
          "observation_category": "vital-signs",
          "observation_type": "heart_rate",
          "value_numeric": 72.0,
          "unit": "bpm",
          "interpretation": "normal",
          "ai_extracted": true,
          "ai_confidence": 0.97
        }
      ],
      "vitals": [
        {
          "patient_id": "patient-uuid-123",
          "vital_type": "heart_rate",
          "measurement_value": {
            "bpm": 72,
            "rhythm": "regular"
          },
          "unit": "bpm",
          "measurement_date": "2024-03-15T00:00:00Z",
          "ai_extracted": true,
          "ai_confidence": 0.97
        }
      ],
      "code_assignments": [
        {
          "entity_table": "patient_observations",
          "universal_code_system": "LOINC",
          "universal_code": "8867-4",
          "universal_display": "Heart rate",
          "universal_confidence": 0.96
        }
      ]
    },
    {
      "event": {
        "patient_id": "patient-uuid-123",
        "shell_file_id": "shell-uuid-456",
        "encounter_id": "{{same_encounter_id}}",
        "activity_type": "observation",
        "clinical_purposes": ["monitoring"],
        "event_name": "Temperature Measurement",
        "event_date": "2024-03-15",
        "body_site": "oral",
        "performed_by": "Dr. Sarah Smith, MD",
        "facility_name": "Memorial Clinic",
        "ai_extracted": true,
        "ai_confidence": 0.95
      },
      "observations": [
        {
          "observation_category": "vital-signs",
          "observation_type": "temperature",
          "value_numeric": 98.6,
          "unit": "°F",
          "body_site": "oral",
          "interpretation": "normal",
          "ai_extracted": true,
          "ai_confidence": 0.96
        }
      ],
      "vitals": [
        {
          "patient_id": "patient-uuid-123",
          "vital_type": "temperature",
          "measurement_value": {
            "value": 98.6,
            "site": "oral"
          },
          "unit": "°F",
          "measurement_date": "2024-03-15T00:00:00Z",
          "body_site": "oral",
          "ai_extracted": true,
          "ai_confidence": 0.96
        }
      ],
      "code_assignments": [
        {
          "entity_table": "patient_observations",
          "universal_code_system": "LOINC",
          "universal_code": "8310-5",
          "universal_display": "Body temperature",
          "universal_confidence": 0.95
        }
      ]
    },
    {
      "event": {
        "patient_id": "patient-uuid-123",
        "shell_file_id": "shell-uuid-456",
        "encounter_id": "{{same_encounter_id}}",
        "activity_type": "intervention",
        "clinical_purposes": ["treatment", "chronic_disease_management"],
        "event_name": "Lisinopril Continuation",
        "event_date": "2024-03-15",
        "performed_by": "Dr. Sarah Smith, MD",
        "facility_name": "Memorial Clinic",
        "ai_extracted": true,
        "ai_confidence": 0.93
      },
      "interventions": [
        {
          "intervention_type": "medication",
          "substance_name": "Lisinopril",
          "dosage": "10mg",
          "route": "oral",
          "frequency": "daily",
          "status": "active",
          "start_date": "2024-03-15",
          "ai_extracted": true,
          "ai_confidence": 0.92
        }
      ],
      "code_assignments": [
        {
          "entity_table": "patient_interventions",
          "universal_code_system": "RxNorm",
          "universal_code": "314076",
          "universal_display": "Lisinopril 10 MG Oral Tablet",
          "universal_confidence": 0.96,
          "regional_code_system": "PBS",
          "regional_code": "8254K",
          "regional_display": "Lisinopril 10mg tablet",
          "regional_confidence": 0.94,
          "regional_country_code": "AUS"
        }
      ]
    }
  ],
  "processing_metadata": {
    "confidence_summary": {
      "overall_confidence": 0.95,
      "encounter_confidence": 0.91,
      "events_processed": 4,
      "average_event_confidence": 0.95
    },
    "manual_review_flags": []
  }
}
```

---

## Confidence Thresholds and Manual Review

**Auto-Accept (Confidence >= 0.80):**
- Directly write to database
- No manual review required
- Standard processing flow

**Manual Review (Confidence 0.60-0.79):**
- Write to database with `requires_review = true` flag
- Add record to `manual_review_queue`
- Display in admin interface for verification

**Fallback (Confidence < 0.60):**
- Use `fallback_identifier` in medical_code_assignments
- Flag for manual coding
- Do not auto-assign codes

**Safety-Critical Items (Medications, Vaccines):**
- Require confidence >= 0.900
- Lower threshold triggers manual review
- Additional validation for dosage, route, frequency

---

## Error Handling Instructions (for AI)

**Missing Required Fields:**
- Flag as validation error in processing_metadata
- Do not create incomplete records
- Request manual data entry

**Ambiguous Clinical Context:**
- Use lower confidence score (0.60-0.79)
- Add clarification note in processing_metadata
- Flag for manual review

**Multiple Possible Interpretations:**
- Select most likely interpretation
- Reduce confidence score accordingly
- Document alternatives in notes field

**OCR/Vision Discrepancies:**
- Trust vision model over OCR when handwritten
- Trust OCR over vision for typed text
- Flag high discrepancies for manual review

**Conflicting Data in Document:**
- Extract both values
- Flag conflict in processing_metadata
- Let manual review resolve

---

## Next Steps

1. **Complete bridge schema build** - ???
2. **Test prompts with sample documents** - Validate extraction accuracy
3. **Refine confidence thresholds** - Tune based on real-world performance
4. **Implement schema loader** - Dynamic tier selection
5. **Build Pass 1.5 integration** - Vector embedding code resolution

---

**Status:** Draft specification ready for implementation testing
