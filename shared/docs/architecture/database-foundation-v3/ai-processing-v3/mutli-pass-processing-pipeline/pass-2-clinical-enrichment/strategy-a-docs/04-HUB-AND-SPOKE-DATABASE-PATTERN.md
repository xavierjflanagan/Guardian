# 04 - Hub-and-Spoke Database Pattern

**Created:** 2025-12-03
**Status:** Architectural Foundation (Hub Triage Complete 2025-12-04)
**Owner:** Xavier
**Source:** Extracted from archive/01-planning.md, PASS-2-OVERVIEW.md, and O3 classification model

---

## Overview

The hub-and-spoke pattern is the foundational database architecture for clinical data in Exora V3. Every clinical entity discovered by Pass 2 creates a hub record first, then one or more spoke records for type-specific details.

**Core principle:** "Every clinical entity is a child of a `patient_clinical_events` hub record."

**Foundation:** The O3 Two-Axis Clinical Model defines how entities are classified and routed.

---

## Architectural Philosophy (Revised 2025-12-04)

### The Lean Hub Principle

The hub table (`patient_clinical_events`) should be **lean and focused**, acting as a directory/index rather than a data warehouse. Think of it as answering: "What type of thing is this, and where are the details?"

| Hub Role | Description |
|----------|-------------|
| **Identity** | Core linkage (IDs, patient, source document) |
| **Routing** | `activity_type` determines observation vs intervention branch |
| **Analytics** | `clinical_purposes[]` enables population health queries |
| **Linking** | Points to where the clinical detail lives (spoke table + ID) |
| **Spatial** | Page reference for document location |
| **Audit** | When we created/updated the record |
| **Lifecycle** | Archived status for soft-hide compliance |

### What Belongs on the Hub vs Spokes

| On Hub (Lean) | On Spokes (Rich) |
|---------------|------------------|
| `activity_type` | Specific values (BP readings, doses) |
| `clinical_purposes[]` | Clinical codes (SNOMED, LOINC, ICD-10) |
| `spoke_table`, `spoke_record_id` | Event dates and timestamps |
| `source_page_number` | Body site, route, method details |
| `archived`, `archived_reason` | Reference ranges, units |
| `created_at`, `updated_at` | Entity-specific metadata |

**Key Decision (2025-12-04):** Temporal data (event dates) belongs on spoke tables, NOT the hub. Each spoke has tailored date fields for its entity type. Entities inherit encounter context via `encounter_id`.

### Routing Clarification

**Critical insight:** The `clinical_purposes[]` array is for **analytics only**, not for routing.

```
Routing Decision Tree:

Clinical Entity Discovered
         |
         v
Classify activity_type: observation or intervention
         |
    +----+----+
    |         |
    v         v
observation  intervention
    |         |
    v         v
What specific type?
    |         |
    +----+----+
         |
         v
Route to specific spoke table
```

The routing logic is:
1. **activity_type** (observation vs intervention) - primary branch
2. **Entity subtype** (vitals vs lab vs condition, etc.) - specific spoke selection
3. **clinical_purposes[]** - stored on hub for analytics, NOT used for routing

---

## O3 Two-Axis Classification (The Routing Logic)

The hub-and-spoke pattern is powered by the O3 two-axis classification model. When Pass 2 discovers a clinical entity, it classifies it on two axes:

### Primary Axis: `activity_type` (Spoke Routing)

Determines which spoke table receives the detailed data:

| Value | Definition | Routes To |
|-------|------------|-----------|
| `observation` | Information gathering that doesn't change patient state | `patient_vitals`, `patient_lab_results`, `patient_conditions`, `patient_symptoms`, `patient_physical_findings`, `patient_imaging_results`, etc. |
| `intervention` | Actions that change or intend to change patient state | `patient_medications`, `patient_immunizations`, `patient_procedures`, `patient_treatments`, etc. |

**Examples:**
- Lab test, vital sign, physical exam finding, symptom -> `observation`
- Prescription, procedure, vaccination, therapy -> `intervention`

**Note:** `patient_observations` and `patient_interventions` catch-all tables have been deleted. Every entity type routes to a dedicated spoke table.

### Secondary Axis: `clinical_purposes[]` (Hub Enrichment)

An array of healthcare intents stored on the hub record for analytics:

| Value | Definition | Example |
|-------|------------|---------|
| `screening` | Asymptomatic disease detection | Annual wellness blood panel |
| `diagnostic` | Determining cause of symptoms | HbA1c for suspected diabetes |
| `therapeutic` | Treatment delivery | Insulin prescription |
| `monitoring` | Tracking conditions over time | Follow-up blood pressure check |
| `preventive` | Disease prevention | Influenza vaccination |

**Note:** A single entity can have multiple purposes (e.g., blood pressure check could be `[screening, monitoring]`).

### Classification Examples

| Medical Activity | activity_type | clinical_purposes | Hub | Spoke |
|-----------------|---------------|-------------------|-----|-------|
| Blood pressure during annual physical | observation | [screening, monitoring] | patient_clinical_events | patient_vitals |
| Influenza vaccination | intervention | [preventive] | patient_clinical_events | patient_immunizations |
| Hemoglobin test for suspected anemia | observation | [diagnostic] | patient_clinical_events | patient_lab_results |
| Blood pressure medication prescription | intervention | [therapeutic] | patient_clinical_events | patient_medications |
| Chest pain complaint | observation | [diagnostic] | patient_clinical_events | patient_symptoms |
| Appendectomy | intervention | [therapeutic] | patient_clinical_events | patient_procedures |

---

## The Pattern

```
                    healthcare_encounters
                           |
                           | encounter_id
                           v
                  patient_clinical_events (HUB)
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
    patient_        patient_         patient_
    medications     conditions       vitals
      (spoke)         (spoke)         (spoke)
```

### Hub Table: `patient_clinical_events` (Lean Schema - Triaged 2025-12-04)

The central record for every clinical entity. **16 columns** after triage (down from ~40).

| Column | Type | Purpose |
|--------|------|---------|
| **IDENTITY** |||
| `id` | UUID PK | Core entity UUID |
| `patient_id` | UUID FK | Owner for RLS |
| `encounter_id` | UUID FK | Links to encounter |
| `shell_file_id` | UUID FK | Source document |
| **ROUTING** |||
| `activity_type` | TEXT | 'observation' or 'intervention' |
| **ANALYTICS** |||
| `clinical_purposes` | TEXT[] | O3 purposes array |
| **LINKING** |||
| `narrative_id` | UUID FK | Pass 3 narrative link (nullable) |
| `spoke_table` | TEXT | Which spoke table has details |
| `spoke_record_id` | UUID | FK to spoke record |
| **SPATIAL** |||
| `source_page_number` | INTEGER | Page reference in document |
| **AUDIT** |||
| `created_at` | TIMESTAMPTZ | When record created |
| `updated_at` | TIMESTAMPTZ | When record modified |
| **LIFECYCLE** |||
| `archived` | BOOLEAN | Soft-hide flag |
| `archived_reason` | TEXT | Why archived |
| `archived_at` | TIMESTAMPTZ | When archived |
| **REVIEW** |||
| `reviewed_by` | UUID FK | Manual reviewer |
| `reviewed_at` | TIMESTAMPTZ | When reviewed |

#### Columns Removed from Hub (Triage 2025-12-04)

| Removed Column | Reason |
|----------------|--------|
| `event_name`, `method`, `body_site` | Clinical detail belongs on spokes |
| `event_date`, `service_date` | Spokes own temporal data with tailored fields |
| `performed_by`, `facility_name` | On procedure spoke |
| `snomed_code`, `loinc_code`, `cpt_code`, `icd10_code` | On spokes or medical_code_assignments |
| `ai_extracted`, `ai_confidence`, `requires_review` | AI confidence is meaningless; always AI-extracted |
| `ai_model_version`, `ai_processing_version`, `entity_id` | Tracked elsewhere; Strategy-A removes Pass 1 handoff |
| `confidence_score`, `requires_manual_review`, `ai_confidence_scores` | Duplicates or confidence meaningless |
| `entity_extraction_completed`, `clinical_data_extracted` | Tracked in job queue |
| `ai_document_summary`, `ai_file_purpose`, `ai_key_findings`, `ai_file_confidence` | File-level data belongs on shell_files |
| `coding_confidence`, `coding_method` | In medical_code_assignments |
| `contains_phi`, `encryption_key_id`, `retention_period` | Assume PHI; infrastructure concerns |
| `deleted_at` | Redundant with archived pattern |
| `is_synthetic` | Pre-launch, not needed |

### Spoke Tables (21 Total - Architecture Finalized 2025-12-04)

Each spoke table stores type-specific enrichment data. **No catch-all tables** - every entity type has a dedicated table.

#### Existing Spoke Tables (5 - Keep)

| Spoke Table | Entity Type | Branch | Examples |
|-------------|-------------|--------|----------|
| `patient_medications` | Prescriptions, OTC | intervention | Lisinopril 10mg daily |
| `patient_conditions` | Diagnoses, problems | observation (state) | Essential hypertension |
| `patient_allergies` | Allergic reactions | observation (state) | Penicillin allergy |
| `patient_vitals` | Vital signs | observation | BP 128/82, HR 72 |
| `patient_immunizations` | Vaccines | intervention | Influenza vaccine |

#### Deleted Tables (Catch-All - Removed)

| Deleted Table | Replacement |
|---------------|-------------|
| `patient_observations` | Split into: lab_results, imaging_results, physical_findings, symptoms, scores_scales |
| `patient_interventions` | Split into: procedures, treatments, devices |

#### New Spoke Tables (16 - To Be Created)

| Category | Tables |
|----------|--------|
| **Tier 1 (6)** | family_history, social_history, travel_history, symptoms, lab_results, procedures |
| **Tier 2 (6)** | imaging_results, physical_findings, advance_directives, risk_scores, goals, care_plans |
| **Tier 3 (3)** | scores_scales, treatments, devices |
| **Infrastructure (1)** | unstructured_clinical_notes (orphan handler) |

**Full details:** See `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md` for complete column specifications.

---

## Composite Foreign Key Enforcement

Migration 08 established composite foreign keys to ensure patient_id consistency:

```sql
-- All 7 spoke tables have this constraint
FOREIGN KEY (event_id, patient_id)
  REFERENCES patient_clinical_events(id, patient_id)
  ON DELETE CASCADE
```

This ensures:
1. Every spoke record links to a valid hub record
2. The patient_id on the spoke matches the patient_id on the hub
3. Deleting a hub cascades to delete its spokes

---

## Write Order (Critical)

Pass 2 must write in this order:

```
1. healthcare_encounters exists (from Pass 0.5)
       |
       v
2. INSERT patient_clinical_events (hub)
   - Returns event_id (the core entity UUID)
       |
       v
3. INSERT spoke record (medications/conditions/etc.)
   - Uses event_id from step 2
   - Uses same patient_id as hub
       |
       v
4. (Later) Pass 2.5 assigns medical code
   - Links to hub via event_id
```

**Why this order matters:**
- Spoke tables have NOT NULL foreign key to hub
- Database will reject spoke INSERT if hub doesn't exist
- Composite FK validates patient_id match

---

## Example: Blood Pressure Measurement

```
Step 1: Hub record (lean - no clinical detail)
INSERT INTO patient_clinical_events (
  id,                    -- uuid-hub-123
  patient_id,            -- uuid-patient
  encounter_id,          -- uuid-encounter (from Pass 0.5)
  shell_file_id,         -- uuid-document
  activity_type,         -- 'observation'
  clinical_purposes,     -- ARRAY['monitoring']
  spoke_table,           -- 'patient_vitals'
  spoke_record_id,       -- uuid-spoke-456
  source_page_number     -- 2
);

Step 2: Spoke record (vitals - owns all clinical detail)
INSERT INTO patient_vitals (
  id,                    -- uuid-spoke-456
  event_id,              -- uuid-hub-123 (links to hub)
  patient_id,            -- uuid-patient (must match hub)
  vital_type,            -- 'blood_pressure'
  systolic_value,        -- 128
  diastolic_value,       -- 82
  measurement_unit,      -- 'mmHg'
  measurement_datetime   -- '2025-11-15T10:30:00Z' (spoke owns the date)
);
```

**Note:** The hub has no `event_date` - the spoke's `measurement_datetime` is the authoritative timestamp. The hub just points to where the data lives.

---

## One Hub, One Spoke (Simplified Model)

With the deletion of catch-all tables, each hub record points to exactly **one** spoke record:

```
Hub: patient_clinical_events (id: uuid-123)
  |
  +-- spoke_table: 'patient_vitals'
  +-- spoke_record_id: uuid-456
       |
       v
  patient_vitals (id: uuid-456, event_id: uuid-123)
```

The `spoke_table` and `spoke_record_id` fields on the hub provide direct lookup. No ambiguity about where the data lives.

---

## The Hub as Core Entity ID

In Strategy-A, the `patient_clinical_events.id` serves as the core entity identifier:

| Old Model | New Model (Strategy-A) |
|-----------|------------------------|
| `entity_processing_audit.id` -> hub -> spoke | `patient_clinical_events.id` -> spoke |
| Three tables in chain | Two tables in chain |
| Pass 1 entity -> Pass 2 enrichment | Pass 2 discovery + enrichment |

The hub IS the entity record. No intermediate tables.

---

## Temporal Tracking Classification

Not all spoke tables are equal. Different tables have different temporal needs:

### Temporal State Tables

These represent ongoing patient state that can change over time. May require `valid_from`/`valid_to` columns:

| Table | Why Temporal | Example Change |
|-------|--------------|----------------|
| `patient_social_history` | Living situation, occupation change | Smoker -> Former smoker |

### Point-in-Time State Tables

These record what was documented at a point in time. The record itself doesn't change, but new records may be added:

| Table | Why Point-in-Time State | Example |
|-------|-------------------------|---------|
| `patient_conditions` | Document said "diabetes" on this date | Diabetes diagnosed 2025-06-05 |
| `patient_allergies` | Document said "penicillin allergy" on this date | Allergy noted 2025-03-20 |
| `patient_medications` | Document said "Lisinopril 10mg" on this date | Prescription from 2025-06-05 |
| `patient_family_history` | Document said "father had heart disease" | Recorded 2025-06-05 |

### Point-in-Time Observation Tables

These are pure snapshots - the value at a point in time is forever that value:

| Table | Why Point-in-Time | Example |
|-------|-------------------|---------|
| `patient_vitals` | BP on June 5 is forever BP on June 5 | BP 128/82 on 2025-06-05 |
| `patient_lab_results` | Lab result is a snapshot | HbA1c 7.2% on 2025-06-05 |
| `patient_immunizations` | Vaccination happened or didn't | Flu shot on 2025-10-15 |
| `patient_procedures` | Procedure was performed | Appendectomy on 2025-03-20 |
| `patient_symptoms` | Patient reported this symptom | Chest pain on 2025-06-05 |

### Key Insight

**Spokes own their temporal fields.** Each spoke table has date/time columns tailored to its entity type:
- `patient_vitals.measurement_datetime`
- `patient_procedures.procedure_date`
- `patient_lab_results.collection_date`, `result_date`
- `patient_symptoms.onset_date`, `reported_date`

The hub does NOT have an `event_date` - it inherits temporal context from the encounter and delegates to spokes.

---

## Database Source of Truth

- **Table definitions:** `current_schema/03_clinical_core.sql`
- **Hub-and-spoke constraints:** Migration 08 (`2025-09-30_08_enforce_hub_spoke_architecture.sql`)
- **Spoke table line numbers:** Lines 280-835 in 03_clinical_core.sql
- **O3 model origin:** `ai-processing-v2/02-clinical-classification/README.md`
- **Temporal strategy origin:** `V3_Features_and_Concepts/temporal-data-management/archive/temporal-health-data-evolution-strategy-v1.md`

---

## Phase 1 Triage Results (Complete 2025-12-04)

Phase 1 table triage is complete:

### Hub Table Triage
- **16 columns** retained (down from ~40)
- Removed: event_date (spokes own dates), all AI confidence columns, all medical codes, clinical detail fields
- Added: spoke_table, spoke_record_id for direct linking

### Spoke Table Triage
- **5 existing tables** retained (vitals, conditions, allergies, medications, immunizations)
- **2 catch-all tables** deleted (observations, interventions)
- **16 new tables** designed (see 07-SPOKE-TABLE-EVOLUTION-ROADMAP.md)
- **21 total spoke tables** in target architecture

---

## The Observation vs Intervention Distinction

A key insight from the O3 model that clarifies classification:

**Observation:** Does NOT change the patient's body or physiological state.
- Gathering information, measuring, assessing, diagnosing
- Examples: Lab tests, vital signs, physical exam findings, imaging results
- Includes "observation states" like conditions and allergies (the patient HAS diabetes - this is observed information, not an action that changed them)

**Intervention:** DOES change (or intends to change) the patient's body or state.
- Treating, administering, performing, prescribing
- Examples: Medications, surgeries, procedures, vaccinations, therapies

This distinction is the primary routing switch for spoke table selection.

---

## Related Documentation

- **Spoke Evolution Roadmap:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md` - Full plan for splitting generic tables
- **Bridge Schema Zone Architecture:** `02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md` - Zone hierarchy design
- **Pass 2 as Primary Extractor:** `05-PASS2-AS-PRIMARY-EXTRACTOR.md` - Pass 2's discovery role
- **O3 Classification Origin:** `ai-processing-v2/02-clinical-classification/README.md` - Original O3 model

---

**Last Updated:** 2025-12-04
