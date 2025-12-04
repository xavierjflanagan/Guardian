# 07 - Spoke Table Architecture

**Created:** 2025-12-04
**Status:** Planning Document (Major Revision 2025-12-04)
**Owner:** Xavier
**Purpose:** Define the complete spoke table architecture for Pass 2 clinical extraction

---

## Executive Summary

The hub-and-spoke architecture requires dedicated spoke tables for each clinical entity type. This document defines all spoke tables needed for comprehensive clinical data extraction.

**Key Principle:** Every clinical entity type gets its own dedicated table. No generic catch-all tables.

**Critical Decision (2025-12-04):** The generic `patient_observations` and `patient_interventions` tables will be **deleted**. All entity types will have dedicated tables. A minimal `patient_unstructured_clinical_notes` table handles true edge cases.

---

## Architecture Overview

### Target State: Complete Spoke Table Set

| Category | Tables | Status |
|----------|--------|--------|
| **Existing (Keep)** | patient_vitals, patient_conditions, patient_allergies, patient_medications, patient_immunizations | Operational |
| **DELETE** | patient_observations, patient_interventions | To be removed |
| **Tier 1 (New)** | patient_family_history, patient_social_history, patient_travel_history, patient_symptoms, patient_lab_results, patient_procedures | Design complete |
| **Tier 2 (New)** | patient_imaging_results, patient_physical_findings, patient_advance_directives, patient_risk_scores, patient_goals, patient_care_plans | Design complete |
| **Tier 3 (New)** | patient_scores_scales, patient_treatments, patient_devices | Design complete |
| **Infrastructure** | patient_unstructured_clinical_notes | Orphan handler |

**Total:** 5 existing + 6 Tier 1 + 6 Tier 2 + 3 Tier 3 + 1 infrastructure = **21 spoke tables**

---

## Why Delete patient_observations and patient_interventions?

**Context:** We are pre-launch with no users and no legacy data.

**Problems with catch-all tables:**
1. Schema bloat - many nullable columns trying to handle diverse entity types
2. Complex bridge schemas trying to cover all cases
3. Less intuitive data model for developers and AI
4. Query complexity - need to filter by type constantly
5. No enforcement of entity-specific required fields

**Solution:** Design it right from the start. Every entity type gets a proper home.

**The orphan handler:** `patient_unstructured_clinical_notes` catches true edge cases without becoming a dumping ground.

---

## Existing Tables (Keep As-Is)

These 5 specific tables are well-designed and remain unchanged:

| Table | Branch | Purpose |
|-------|--------|---------|
| `patient_vitals` | observation | Blood pressure, heart rate, temperature, etc. |
| `patient_conditions` | observation (state) | Diagnoses, problems, chronic conditions |
| `patient_allergies` | observation (state) | Drug allergies, food allergies, environmental |
| `patient_medications` | intervention | Prescriptions, OTC medications |
| `patient_immunizations` | intervention | Vaccines, immunizations |

---

## Tier 1: High Priority New Tables

These tables are needed immediately - they represent common clinical entities with no current home.

---

### `patient_family_history`

**Branch:** observation (state)

**Rationale:**
- Data about OTHER PEOPLE (relatives), not the patient
- Unique fields: relationship, relative's condition, age at onset
- Critical for risk assessment and genetic counseling
- High frequency in medical records

**Example Data:**
```
"Mother: breast cancer age 52, alive"
"Father: MI age 55, deceased age 60"
"Maternal grandmother: dementia"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `relationship` | TEXT | mother, father, sibling, grandparent, etc. |
| `relationship_detail` | TEXT | "maternal grandmother", "half-brother" |
| `family_side` | TEXT | maternal, paternal, both, unknown |
| `degree_of_relation` | TEXT | first_degree, second_degree, other, unknown |
| `condition_name_verbatim` | TEXT | Exactly as stated in document |
| `condition_name_normalized` | TEXT | Standardized condition name |
| `relative_age_at_onset` | INTEGER | Age when condition appeared |
| `relative_current_status` | TEXT | alive, deceased, unknown |
| `relative_age_at_death` | INTEGER | If deceased |
| `notes` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Note:** One row per relative-condition combination. If "Mother: breast cancer and diabetes", create two rows.

**Temporal:** POINT-IN-TIME

---

### `patient_social_history`

**Branch:** observation (state)

**Rationale:**
- Unique data fields per category (tobacco, alcohol, substances, occupation, etc.)
- Single table with `social_history_type` enum + JSONB for type-specific fields
- High frequency in medical records

**Example Data:**
```
"Smoking: 1 pack/day x 20 years, quit 2015"
"Alcohol: 2-3 beers/week"
"Occupation: construction worker (asbestos exposure)"
"Lives alone, single"
```

**social_history_type enum values:**
- `tobacco_use`
- `alcohol_use`
- `substance_use`
- `occupation`
- `living_situation`
- `exercise`
- `diet`
- `sleep`
- `sexual_history`
- `other`

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `social_history_type` | TEXT | See enum above |
| `status` | TEXT | current, former, never, unknown |
| `description_verbatim` | TEXT | Exactly as stated |
| `description_normalized` | TEXT | Standardized |
| `quantity` | TEXT | "1 pack/day", "2-3 drinks/week" |
| `duration` | TEXT | "20 years", "since 2010" |
| `quit_date` | DATE | If applicable |
| `type_specific_data` | JSONB | Category-specific structured data |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**type_specific_data examples:**
```json
// tobacco_use
{ "product_type": "cigarettes", "pack_years": 20, "start_year": 2000 }

// substance_use
{ "substance_name": "heroin", "route": "IV", "frequency": "daily", "last_use_date": "2024-03-10" }

// occupation
{ "job_title": "construction worker", "industry": "construction", "exposures": ["asbestos", "silica"], "years_in_role": 10 }
```

**Temporal:** TEMPORAL (social history changes over time)

---

### `patient_travel_history`

**Branch:** observation (state)

**Rationale:**
- Data about PLACES, not conditions or treatments
- Critical for infectious disease differential (endemic areas)
- Unique fields: destination, dates, purpose, exposures

**Example Data:**
```
"Recent travel to Thailand (2 weeks ago)"
"Visited rural India, ate street food"
"Cruise ship travel, GI symptoms on return"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `destination` | TEXT | Country/region visited |
| `destination_detail` | TEXT | Specific area (rural, urban, etc.) |
| `travel_start_date` | DATE | When travel began |
| `travel_end_date` | DATE | When travel ended |
| `travel_purpose` | TEXT | vacation, work, immigration, military, residency |
| `exposures` | TEXT[] | Array of potential exposures |
| `notes_verbatim` | TEXT | Exactly as stated |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

### `patient_symptoms`

**Branch:** observation (expressed)

**Rationale:**
- **Expressed observations** - patient-reported, not clinically detected
- Blob approach: Store verbatim text with minimal normalization
- Preserves patient voice and variable language

**Key Insight:** Symptoms represent what the patient SAYS, not what the clinician FINDS.

**Example Data:**
```
"Chest pain, sharp, worse with breathing"
"Feeling tired all the time for 3 weeks"
"Headache behind my eyes, throbbing"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `symptom_description_verbatim` | TEXT | Exactly as stated - the primary blob |
| `symptom_category` | TEXT | pain, fatigue, respiratory, GI, neurological, etc. |
| `reported_severity` | TEXT | "severe", "mild", "10/10" - as stated |
| `onset_description` | TEXT | "3 weeks ago", "sudden", "gradual" - as stated |
| `duration_description` | TEXT | "constant", "comes and goes", "2 hours" - as stated |
| `associated_factors` | TEXT | "worse with eating", "better with rest" - as stated |
| `body_location_verbatim` | TEXT | "behind my eyes", "left side of chest" - as stated |
| `is_chief_complaint` | BOOLEAN | Primary reason for visit |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Pass 3 Integration:** Pass 3 links symptoms to condition narratives via `narrative_event_links`

**Temporal:** POINT-IN-TIME

---

### `patient_lab_results`

**Branch:** observation

**Rationale:**
- Highly structured data with unique fields
- LOINC codes, reference ranges, units, specimen type
- Extremely high volume in medical records

**Example Data:**
```
"Hemoglobin: 7.2 g/dL (L) [ref: 12.0-16.0]"
"HbA1c: 8.2% (above goal)"
"CBC with differential - WBC: 12,500/uL"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `test_name_verbatim` | TEXT | Exactly as stated |
| `test_name_normalized` | TEXT | Standardized test name |
| `panel_name` | TEXT | CMP, CBC, Lipid Panel, etc. (groups related tests) |
| `loinc_code` | TEXT | LOINC code if printed in document |
| `value_numeric` | NUMERIC | Numeric result |
| `value_text` | TEXT | Text result (positive/negative, etc.) |
| `unit` | TEXT | Measurement unit |
| `reference_range_low` | NUMERIC | Normal low |
| `reference_range_high` | NUMERIC | Normal high |
| `interpretation` | TEXT | normal, high, low, critical, abnormal |
| `result_status` | TEXT | final, preliminary, corrected, amended |
| `specimen_type` | TEXT | blood, urine, CSF, etc. |
| `collection_datetime` | TIMESTAMPTZ | When specimen collected |
| `result_datetime` | TIMESTAMPTZ | When result reported |
| `performing_lab` | TEXT | Lab name if stated |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

### `patient_procedures`

**Branch:** intervention

**Rationale:**
- Unique fields: approach, anesthesia, complications, operative findings
- High billing/coding importance (CPT codes)
- Includes surgeries, biopsies, catheterizations, endoscopies

**Example Data:**
```
"Laparoscopic cholecystectomy, uncomplicated"
"Colonoscopy with polypectomy x2"
"Cardiac catheterization via right femoral approach"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `procedure_name_verbatim` | TEXT | Exactly as stated |
| `procedure_name_normalized` | TEXT | Standardized name |
| `procedure_type` | TEXT | surgical, diagnostic, therapeutic, biopsy |
| `body_site` | TEXT | Anatomical location |
| `laterality` | TEXT | left, right, bilateral |
| `approach` | TEXT | laparoscopic, open, percutaneous, etc. |
| `anesthesia_type` | TEXT | general, local, sedation, none |
| `findings` | TEXT | Operative/procedure findings |
| `complications` | TEXT | If any stated |
| `outcome` | TEXT | successful, incomplete, aborted |
| `performing_provider` | TEXT | Surgeon/proceduralist name |
| `performing_facility` | TEXT | Hospital/clinic name |
| `cpt_code` | TEXT | CPT code if printed in document |
| `procedure_datetime` | TIMESTAMPTZ | When performed |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

## Tier 2: Medium Priority New Tables

These tables handle important but less frequent clinical entities.

---

### `patient_imaging_results`

**Branch:** observation

**Rationale:**
- Unique fields: modality, body region, impression, technique
- Distinct from lab results (no reference ranges, different structure)

**Example Data:**
```
"Chest X-ray: No acute cardiopulmonary process"
"CT Abdomen: 3cm hepatic lesion, recommend MRI"
"MRI Brain: No acute intracranial abnormality"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `imaging_modality` | TEXT | X-ray, CT, MRI, US, PET, etc. |
| `body_region` | TEXT | Chest, abdomen, brain, spine, etc. |
| `study_name_verbatim` | TEXT | Exactly as stated |
| `technique` | TEXT | With/without contrast, etc. |
| `findings_verbatim` | TEXT | Full findings text |
| `impression` | TEXT | Radiologist impression/conclusion |
| `comparison` | TEXT | Prior studies compared |
| `performing_radiologist` | TEXT | If stated |
| `performing_facility` | TEXT | Imaging center name |
| `study_datetime` | TIMESTAMPTZ | When performed |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

### `patient_physical_findings`

**Branch:** observation

**Rationale:**
- Physical exam findings with unique gradation systems
- Distinct from vitals (which are numeric measurements)
- Complex body site mapping

**Example Data:**
```
"Lungs: Crackles bilateral bases"
"Heart: Grade 3/6 systolic murmur, left sternal border"
"Extremities: 2+ pitting edema bilateral lower"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `system` | TEXT | cardiovascular, respiratory, musculoskeletal, etc. |
| `body_site` | TEXT | Specific anatomical location |
| `laterality` | TEXT | left, right, bilateral |
| `finding_verbatim` | TEXT | Exactly as stated |
| `finding_normalized` | TEXT | Standardized |
| `severity_grade` | TEXT | +1, +2, grade 3/6, etc. |
| `is_normal` | BOOLEAN | Normal finding vs abnormal |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

### `patient_advance_directives`

**Branch:** observation (state)

**Rationale:**
- Clinically critical for emergency decision-making
- Unique fields: directive type, proxy information, legal status
- Must be easily queryable for safety

**Example Data:**
```
"DNR/DNI documented, signed 2023-05-15"
"Healthcare proxy: Jane Smith (spouse)"
"POLST form on file: comfort measures only"
"Living will: no artificial nutrition/hydration"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `directive_type` | TEXT | dnr, dni, full_code, comfort_care, limited_intervention, healthcare_proxy, living_will, polst |
| `directive_status` | TEXT | active, revoked, unknown |
| `effective_date` | DATE | When directive became active |
| `expiration_date` | DATE | If applicable |
| `proxy_name` | TEXT | Healthcare proxy name if applicable |
| `proxy_relationship` | TEXT | spouse, child, sibling, friend, attorney, etc. |
| `proxy_contact` | TEXT | Phone or address if stated |
| `specific_instructions_verbatim` | TEXT | Full text of specific wishes |
| `document_location` | TEXT | "Page 1", "POLST form", "attached" |
| `witnessed_by` | TEXT | Witness names if stated |
| `notarized` | BOOLEAN | If document was notarized |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** TEMPORAL (directives can be revoked/updated)

---

### `patient_risk_scores`

**Branch:** observation

**Rationale:**
- Calculated risk predictions based on multiple clinical inputs
- Very common in medical records (ASCVD, CHA2DS2-VASc, FRAX, etc.)
- Distinct from assessment scales (PHQ-9) which are questionnaire-based

**Example Data:**
```
"10-year ASCVD risk: 12.5%"
"CHA2DS2-VASc score: 4 (high stroke risk)"
"FRAX: 15% major osteoporotic fracture risk"
"Wells score: 6 (PE likely)"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `score_name` | TEXT | ASCVD, CHA2DS2-VASc, FRAX, Wells, MELD, etc. |
| `score_value` | NUMERIC | The calculated score |
| `score_unit` | TEXT | %, points, etc. |
| `score_interpretation` | TEXT | low, moderate, high, very_high |
| `risk_category` | TEXT | cardiovascular, stroke, fracture, bleeding, etc. |
| `time_horizon` | TEXT | "10-year", "30-day", "lifetime" |
| `input_factors_verbatim` | TEXT | What factors were used (if stated) |
| `calculation_method` | TEXT | If specific calculator mentioned |
| `notes_verbatim` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

### `patient_goals`

**Branch:** observation (state)

**Rationale:**
- Patient-centered goals not necessarily tied to specific conditions
- Important for care coordination and patient engagement
- Distinct from care plans (which are provider-driven)

**Example Data:**
```
"Patient goal: walk without walker by summer"
"Goal: reduce HbA1c to <7%"
"Patient wishes to remain independent at home"
"Goal: lose 20 pounds"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `goal_description_verbatim` | TEXT | Exactly as stated |
| `goal_category` | TEXT | clinical, functional, lifestyle, safety, independence |
| `target_metric` | TEXT | Specific measurable target if stated |
| `target_date` | DATE | If specified |
| `status` | TEXT | active, achieved, abandoned, modified, in_progress |
| `related_condition_verbatim` | TEXT | If goal mentions a condition |
| `priority` | TEXT | primary, secondary, patient_stated |
| `notes_verbatim` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** TEMPORAL (goals can be achieved, modified, abandoned)

---

### `patient_care_plans`

**Branch:** intervention

**Rationale:**
- Provider-driven treatment plans and follow-up instructions
- Often not tied to a single condition
- Distinct from patient goals (which are patient-driven)

**Example Data:**
```
"Plan: weekly physical therapy for 6 weeks"
"Care plan: home health nursing visits 3x/week"
"Discharge plan: follow up with cardiology in 2 weeks"
"Palliative care consult ordered"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `plan_description_verbatim` | TEXT | Exactly as stated |
| `plan_type` | TEXT | treatment, follow_up, discharge, home_health, palliative, hospice, rehabilitation |
| `frequency` | TEXT | "3x/week", "daily", "as needed" |
| `duration` | TEXT | "6 weeks", "ongoing", "until follow-up" |
| `start_date` | DATE | If specified |
| `end_date` | DATE | If specified |
| `status` | TEXT | planned, active, completed, cancelled |
| `responsible_provider` | TEXT | Who is responsible for plan |
| `responsible_facility` | TEXT | Where plan will be executed |
| `related_condition_verbatim` | TEXT | If plan mentions a condition |
| `notes_verbatim` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** TEMPORAL (plans have lifecycle)

---

## Tier 3: Lower Priority New Tables

These tables handle less common but still valid clinical entities.

---

### `patient_scores_scales`

**Branch:** observation

**Rationale:**
- Standardized assessment instruments (questionnaire-based)
- PHQ-9, GAD-7, MMSE, GCS, APGAR, pain scales
- Distinct from risk scores (which are calculated predictions)

**Example Data:**
```
"PHQ-9: 12 (moderate depression)"
"MMSE: 24/30"
"Pain scale: 7/10"
"Glasgow Coma Scale: 15"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `scale_name` | TEXT | PHQ-9, GAD-7, MMSE, GCS, APGAR, pain_scale, etc. |
| `score_value` | NUMERIC | The score |
| `score_max` | NUMERIC | Maximum possible score |
| `interpretation` | TEXT | normal, mild, moderate, severe |
| `domain` | TEXT | mental_health, cognitive, pain, consciousness, neonatal |
| `subscores` | JSONB | Component scores if applicable |
| `notes_verbatim` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** POINT-IN-TIME

---

### `patient_treatments`

**Branch:** intervention

**Rationale:**
- Ongoing therapeutic interventions not captured elsewhere
- PT/OT sessions, dialysis, radiation, chemotherapy cycles
- Distinct from procedures (one-time) and medications (drug-based)

**Example Data:**
```
"Physical therapy: 2x/week for 8 weeks"
"Hemodialysis: 3x/week"
"Radiation therapy: 30 fractions completed"
"Chemotherapy cycle 4 of 6"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `treatment_name_verbatim` | TEXT | Exactly as stated |
| `treatment_type` | TEXT | physical_therapy, occupational_therapy, dialysis, radiation, chemotherapy, wound_care, infusion |
| `frequency` | TEXT | "2x/week", "daily", "every 3 weeks" |
| `duration` | TEXT | "8 weeks", "ongoing" |
| `sessions_completed` | INTEGER | If stated |
| `sessions_planned` | INTEGER | Total sessions if stated |
| `cycle_number` | TEXT | "cycle 4 of 6" |
| `provider` | TEXT | Therapist/provider name |
| `facility` | TEXT | Where treatment occurs |
| `status` | TEXT | planned, in_progress, completed, discontinued |
| `notes_verbatim` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** TEMPORAL (treatments have lifecycle)

---

### `patient_devices`

**Branch:** intervention (but persistent state)

**Rationale:**
- Medical devices present in/on patient
- Hybrid: intervention event (implant) + ongoing state (device present)
- Pacemakers, stents, joint replacements, insulin pumps

**Example Data:**
```
"Pacemaker: Medtronic dual-chamber, implanted 2022"
"Left knee replacement (2019)"
"Insulin pump: Omnipod"
"Port-a-cath in place for chemotherapy"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `device_name_verbatim` | TEXT | Exactly as stated |
| `device_type` | TEXT | pacemaker, defibrillator, stent, joint_replacement, pump, port, prosthetic, hearing_aid |
| `manufacturer` | TEXT | Device manufacturer |
| `model` | TEXT | Device model if stated |
| `serial_number` | TEXT | If stated |
| `body_site` | TEXT | Where device is located |
| `laterality` | TEXT | left, right, bilateral |
| `implant_date` | DATE | When implanted |
| `removal_date` | DATE | If removed |
| `status` | TEXT | active, inactive, removed, malfunctioning |
| `mri_compatible` | BOOLEAN | If stated |
| `notes_verbatim` | TEXT | Additional context |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Temporal:** TEMPORAL (device status changes)

---

## Infrastructure: Orphan Handler

### `patient_unstructured_clinical_notes`

**Purpose:** Catch-all for true edge cases that don't fit any specific table.

**Design Philosophy:**
- Intentionally minimal structure
- NOT a dumping ground - AI should try all specific tables first
- Tracks what the AI attempted to classify as (useful for identifying gaps)
- Simple schema that won't accumulate nullable columns

**Example Data (true orphans):**
```
"Patient requests copy of records for new physician"
"Discussed treatment options, patient declined surgery"
"Letter from specialist received and reviewed"
"Patient brought in photo of medication bottles"
```

**Proposed Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to hub (required) |
| `patient_id` | UUID | For RLS (composite FK) |
| `note_type` | TEXT | administrative, clinical_observation, communication, decision, other |
| `content_verbatim` | TEXT | The full extracted text blob |
| `ai_classification_attempted` | TEXT | What the AI thought it might be but couldn't route |
| `y_anchor_start` | INTEGER | Spatial reference |
| `y_anchor_end` | INTEGER | Multi-line support |
| `verbatim_text_vertices` | JSONB | Bounding box |
| `created_at` | TIMESTAMPTZ | Audit |

**Usage:** If `ai_classification_attempted` shows patterns (e.g., many "imaging_result"), that signals our imaging table is missing something.

**Temporal:** POINT-IN-TIME

---

## Implementation Roadmap

### Phase 1: Delete Catch-All Tables

1. Remove `patient_observations` from schema
2. Remove `patient_interventions` from schema
3. Remove associated bridge schemas

### Phase 2: Create Tier 1 Tables

**Priority Order:**
1. `patient_family_history`
2. `patient_social_history`
3. `patient_travel_history`
4. `patient_symptoms`
5. `patient_lab_results`
6. `patient_procedures`

**For each table:**
- Create database migration
- Create bridge schema (source .md, detailed .json, minimal .json)
- Update Pass 2 routing logic

### Phase 3: Create Tier 2 Tables

1. `patient_imaging_results`
2. `patient_physical_findings`
3. `patient_advance_directives`
4. `patient_risk_scores`
5. `patient_goals`
6. `patient_care_plans`

### Phase 4: Create Tier 3 Tables

1. `patient_scores_scales`
2. `patient_treatments`
3. `patient_devices`

### Phase 5: Create Infrastructure Table

1. `patient_unstructured_clinical_notes`

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-04 | Tier 1 includes family/social/travel history | These have no current home and are clinically important |
| 2025-12-04 | Labs and procedures are high-priority splits | Highest volume and most distinct data structures |
| 2025-12-04 | patient_symptoms added as Tier 1 with blob approach | Expressed observations differ from detected observations; minimal normalization preserves patient voice |
| 2025-12-04 | Y-zone auto-linking rejected | Too complex, too many output tokens, high false positive risk; Pass 3 narratives handle inter-entity relationships instead |
| 2025-12-04 | Pass 2 is extraction-only, Pass 3 handles relationships | Clean separation of concerns; Pass 2 extracts to tables, Pass 3 creates narrative links |
| 2025-12-04 | **DELETE patient_observations and patient_interventions** | Pre-launch with no users; design it right from the start; no catch-all tables |
| 2025-12-04 | patient_unstructured_clinical_notes as orphan handler | Minimal structure for true edge cases; tracks AI classification attempts for gap analysis |
| 2025-12-04 | family_side and degree_of_relation added to family_history | Important for clinical risk stratification; queryable fields |
| 2025-12-04 | result_status and panel_name added to lab_results | Clinically important for safety and grouping |
| 2025-12-04 | performing_provider/facility added to procedures | Belongs on procedure table, not hub (lean hub principle) |
| 2025-12-04 | patient_advance_directives added to Tier 2 | Clinically critical for emergency decision-making |
| 2025-12-04 | patient_risk_scores added to Tier 2 | Very common in medical records; distinct from assessment scales |
| 2025-12-04 | patient_goals added to Tier 2 | Patient-centered goals need storage; not always tied to conditions |
| 2025-12-04 | patient_care_plans added to Tier 2 | Provider-driven plans need storage; distinct from patient goals |
| 2025-12-04 | Tier 3 tables fully designed | patient_scores_scales, patient_treatments, patient_devices all need dedicated tables |

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
- **Pass 3 Integration:** `08-PASS3-NARRATIVE-INTEGRATION.md`
- **Bridge Schema Architecture:** `../bridge-schema-architecture/README.md`

---

**Last Updated:** 2025-12-04
