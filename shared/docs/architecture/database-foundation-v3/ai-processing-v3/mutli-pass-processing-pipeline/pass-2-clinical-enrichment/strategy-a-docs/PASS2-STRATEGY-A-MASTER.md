# Pass 2 Strategy-A Master Design & Implementation

**Created:** 2025-12-03
**Status:** Phase 1 In Progress (Table/Bridge-Schema Triage)
**Owner:** Xavier
**Last Updated:** 2025-12-04

---

## Core Architecture Decisions (Finalized 2025-12-04)

This section documents the authoritative architectural decisions for Pass 2.

### 1. The Lean Hub Principle

The hub table (`patient_clinical_events`) should be **lean and focused**, acting as a directory/index rather than a data warehouse.

| Hub Contains | Hub Does NOT Contain |
|--------------|---------------------|
| IDs (entity, patient, source) | Clinical values (BP readings, doses) |
| `activity_type` (routing) | Clinical codes (SNOMED, LOINC, ICD-10) |
| `clinical_purposes[]` (analytics) | Body site, route, method details |
| `event_date`, `created_at` | Reference ranges, units |
| `spoke_table`, `spoke_record_id` | Interpretation fields |
| `confidence_score` | Entity-specific metadata |

**Implication:** Many columns currently on the hub will be reviewed and potentially moved to spoke tables or removed.

### 2. Routing Logic Clarification

**Critical insight:** The `clinical_purposes[]` array is for **analytics only**, NOT for routing.

```
Routing Flow:
1. activity_type (observation vs intervention) -> Primary branch
2. Entity subtype (vitals, lab, condition, etc.) -> Specific spoke selection
3. clinical_purposes[] -> Stored on hub for queries, does NOT affect routing
```

### 3. Observation vs Intervention Definition

**Observation:** Does NOT change the patient's body or physiological state.
- Includes: Labs, vitals, physical exam findings, imaging results
- Includes "observation states": conditions, allergies (patient HAS diabetes - observed fact)

**Intervention:** DOES change (or intends to change) the patient's body or state.
- Includes: Medications, procedures, surgeries, vaccinations, therapies

### 4. Spoke Table Architecture (Revised 2025-12-04)

**Critical Decision:** Delete `patient_observations` and `patient_interventions`. Every entity type gets a dedicated table.

**Rationale:** Pre-launch with no users. Design it right from the start. No catch-all tables.

**Target State: 21 Spoke Tables**

| Category | Tables |
|----------|--------|
| **Existing (5)** | vitals, conditions, allergies, medications, immunizations |
| **Tier 1 New (6)** | family_history, social_history, travel_history, symptoms, lab_results, procedures |
| **Tier 2 New (6)** | imaging_results, physical_findings, advance_directives, risk_scores, goals, care_plans |
| **Tier 3 New (3)** | scores_scales, treatments, devices |
| **Infrastructure (1)** | unstructured_clinical_notes (orphan handler) |

**Orphan Handler:** `patient_unstructured_clinical_notes` catches true edge cases with minimal structure. Tracks AI classification attempts for gap analysis.

**Full details:** See `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`

### 5. Temporal vs Point-in-Time (Revised)

| Table Type | Examples | Tracking |
|------------|----------|----------|
| **Point-in-Time** | vitals, immunizations, procedures, labs | `event_date` only |
| **Temporal State** | social_history | `valid_from`/`valid_to` |
| **Point-in-Time State** | conditions, allergies, family_history | Snapshot of what was known |

**Note:** Medications, conditions, and allergies were reconsidered. They record what was documented at a point in time, not necessarily the current state. Supersession logic may still be useful but is not a primary design driver.

### 6. Pass 2 vs Pass 3 Boundary

Pass 2 and Pass 3 have distinct, non-overlapping responsibilities:

| Pass 2 (Clinical Extraction) | Pass 3 (Narrative Generation) |
|------------------------------|-------------------------------|
| Discovers clinical entities from OCR text | Creates clinical narratives from extracted entities |
| Classifies entities (activity_type, clinical_purposes[]) | Links entities to narratives via `narrative_event_links` |
| Writes structured data to spoke tables | Populates `primary_narrative_id` on entity records |
| Single API call per encounter batch | Single API call with access to patient context |
| Output: Database rows in spoke tables | Output: Narrative records + relationship links |

**Key Insight:** Pass 2 does NOT create inter-entity relationships. It extracts entities to tables. Pass 3 creates the semantic connections between entities through narratives.

**Example Flow:**
```
Pass 2 extracts:
  - Symptom: "chest pain, worse with exertion"  -> patient_symptoms
  - Condition: "coronary artery disease"        -> patient_conditions
  - Medication: "aspirin 81mg daily"            -> patient_medications

Pass 3 creates:
  - Narrative: "Cardiac Workup and Management"
  - Links: symptom -> narrative, condition -> narrative, medication -> narrative
  - Sets primary_narrative_id on each entity record
```

**Reference:** See narrative architecture docs in `V3_Features_and_Concepts/narrative-architecture/`

---

## Architecture Summary

Pass 2 is the **primary clinical extraction engine**. It receives OCR batches with relevant bridge schemas and outputs structured clinical data directly to the hub-and-spoke database architecture.

**Key architectural decisions:**

| Decision | Description |
|----------|-------------|
| **O3 Two-Axis Classification** | Every entity classified by `activity_type` (observation/intervention) and `clinical_purposes[]` (screening, diagnostic, therapeutic, monitoring, preventive). Activity type determines spoke routing; purposes are hub-level analytics. |
| **Pass 1 = Schema Router** | Pass 1 identifies which bridge schemas are needed per batch. It does NOT detect individual entities. |
| **Pass 2 = Discovery + Enrichment** | Pass 2 discovers AND extracts clinical entities in one step. No entity handoff from Pass 1. |
| **Direct to Hub-and-Spoke** | Pass 2 writes directly to `patient_clinical_events` (hub) + spoke tables. No intermediate entity tables. |
| **Lean Hub, Rich Spokes** | Hub contains routing/linking/analytics. Spokes contain all clinical detail. |
| **No Catch-All Tables** | Every entity type gets a dedicated spoke table. `patient_observations` and `patient_interventions` deleted. |
| **Orphan Handler** | `patient_unstructured_clinical_notes` catches true edge cases with minimal structure. |
| **Pass 2.5 = Medical Codes** | Medical code assignment happens post-Pass 2 via Agentic Waterfall. Not during Pass 2. |
| **Token Optimization** | AI outputs only clinical content. IDs, encounter references, timestamps added server-side. |

**Reference docs:**
- `04-HUB-AND-SPOKE-DATABASE-PATTERN.md` - Database architecture + lean hub principle
- `05-PASS2-AS-PRIMARY-EXTRACTOR.md` - Pass 2's role explained
- `06-AI-OUTPUT-TOKEN-OPTIMIZATION.md` - Minimizing output tokens
- `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md` - Spoke table evolution plan

---

## Current State Summary

| Aspect | Status |
|--------|--------|
| Phase 1: Table Triage | COMPLETE - Hub triaged (16 columns), 5 spokes confirmed, 16 new tables designed |
| Phase 2: Bridge Schema Sizing | Not Started |
| Phase 3: Bridge Schema Reconstruction | Not Started |
| Phase 4: Zone Feature Implementation | Not Started |
| Phase 5: Pass 2 Worker | Not Started |
| Phase 6: Pass 2.5 Medical Codes | Not Started |
| Phase 7: Testing & Validation | Not Started |

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Table/Bridge-Schema Triage | COMPLETE | Hub triaged to 16 columns (down from ~40). 5 existing spokes confirmed. obs/int tables deleted. 16 new tables designed. Total: 21 spoke tables + 1 lean hub. |
| Phase 2: Bridge Schema Sizing | READY | Phase 1 complete - can begin |
| Phase 3: Bridge Schema Reconstruction | BLOCKED | Waiting on Phase 2 |
| Phase 4: Zone Feature Implementation | BLOCKED | Waiting on Phase 2/3 |
| Phase 5: Pass 2 Worker | BLOCKED | Waiting on Phase 3/4 |
| Phase 6: Pass 2.5 Medical Code Assignment | BLOCKED | Waiting on Phase 5 |
| Phase 7: Testing & Validation | BLOCKED | Waiting on Phase 5/6 |

---

## Phase 1: Table/Bridge-Schema Triage

### Purpose

Before building bridge schemas, we must determine:
1. Which existing bridge schema files are actually needed for Pass 2
2. Which tables are missing (family history, social history, etc.)
3. What columns each table needs for clinical entity enrichment

### Triage Process

For each table/bridge-schema, we perform a 4-step review:

| Step | Question | Outcomes |
|------|----------|----------|
| **Step A: Needed?** | Is this table a Pass 2 target? | KEEP / REMOVE / MERGE |
| **Step B: Synced?** | Does bridge schema match current DB? | Yes / No (list gaps) |
| **Step C: Columns?** | What enrichment data do we want? | Column audit complete |
| **Step D: Temporal?** | Does this table need valid_from/valid_to? | TEMPORAL / POINT-IN-TIME |

**Step D guidance (from O3 model):**
- **TEMPORAL** (social_history): Patient state that changes over time
- **POINT-IN-TIME** (vitals, labs, immunizations, procedures, symptoms): Snapshot values that don't supersede
- **POINT-IN-TIME STATE** (conditions, allergies, family_history, medications): Recorded state at point of documentation

**Step A Outcomes:**
- **KEEP** - Primary clinical entity table that Pass 2 writes to
- **REMOVE** - Metrics/audit/infrastructure table (not a Pass 2 target)
- **MERGE** - Should be absorbed into another table
- **NEW** - Table doesn't exist yet, needs to be created

### Progress Tracker - Existing Tables (13 direct + 5 multi-pass)

#### Primary Clinical Entity Tables (Existing - Keep)

| Table | Source File | Step A | Step B | Step C | Step D | Status |
|-------|-------------|--------|--------|--------|--------|--------|
| patient_conditions | `patient_conditions.md` | KEEP | YES | DONE | POINT-IN-TIME | DONE |
| patient_medications | `patient_medications.md` | KEEP | YES | DONE | POINT-IN-TIME | DONE |
| patient_allergies | `patient_allergies.md` | KEEP | YES | DONE | POINT-IN-TIME | DONE |
| patient_vitals | `patient_vitals.md` | KEEP | YES | DONE | POINT-IN-TIME | DONE |
| patient_immunizations | `patient_immunizations.md` | KEEP | YES (gaps) | DONE | POINT-IN-TIME | DONE |

#### Catch-All Tables (DELETE)

| Table | Source File | Step A | Rationale | Status |
|-------|-------------|--------|-----------|--------|
| patient_observations | `patient_observations.md` | DELETE | Replaced by dedicated tables (labs, imaging, physical_findings, scores_scales, symptoms) | MARKED FOR DELETION |
| patient_interventions | `patient_interventions.md` | DELETE | Replaced by dedicated tables (procedures, treatments, devices) | MARKED FOR DELETION |

#### Hub Table (Triaged 2025-12-04)

| Table | Source File | Step A | Step B | Step C | Step D | Status |
|-------|-------------|--------|--------|--------|--------|--------|
| patient_clinical_events | `patient_clinical_events.md` | KEEP | REDESIGNED | 16 columns | N/A (spokes own dates) | DONE |

#### Context Tables

| Table | Source File | Step A | Step B | Step C | Step D | Status |
|-------|-------------|--------|--------|--------|--------|--------|
| healthcare_encounters | `healthcare_encounters.md` | - | - | - | N/A | Not Started |

#### Supporting Tables

| Table | Source File | Step A | Step B | Step C | Step D | Status |
|-------|-------------|--------|--------|--------|--------|--------|
| medical_code_assignments | `medical_code_assignments.md` | - | - | - | N/A | Not Started |
| profile_appointments | `profile_appointments.md` | - | - | - | N/A | Not Started |
| user_profiles | `user_profiles.md` | - | - | - | N/A | Not Started |

#### Metrics/Audit Tables (likely REMOVE candidates)

| Table | Source File | Step A | Step B | Step C | Step D | Status |
|-------|-------------|--------|--------|--------|--------|--------|
| pass2_clinical_metrics | `pass2_clinical_metrics.md` | - | - | - | N/A | Not Started |

#### Multi-Pass Tables (in `pass-2-versions/`)

These are tables that Pass 1 created and Pass 2 updates. May not need bridge schemas.

| Table | Source File | Step A | Step B | Step C | Step D | Status |
|-------|-------------|--------|--------|--------|--------|--------|
| ai_confidence_scoring | `pass-2-versions/ai_confidence_scoring.md` | - | - | - | N/A | Not Started |
| ai_processing_sessions | `pass-2-versions/ai_processing_sessions.md` | - | - | - | N/A | Not Started |
| entity_processing_audit | `pass-2-versions/entity_processing_audit.md` | - | - | - | N/A | Not Started |
| manual_review_queue | `pass-2-versions/manual_review_queue.md` | - | - | - | N/A | Not Started |
| shell_files | `pass-2-versions/shell_files.md` | - | - | - | N/A | Not Started |

### Progress Tracker - Tier 1 New Tables

High-priority new tables that fill critical gaps in the schema.

| Proposed Table | Rationale | Step A | Step D | Status |
|----------------|-----------|--------|--------|--------|
| patient_family_history | Data about RELATIVES, not patient. Unique fields: relationship, family_side, degree_of_relation, age_at_onset. | NEW | POINT-IN-TIME | Design Complete |
| patient_social_history | Smoking, alcohol, drugs, occupation, living situation. Unique structure per category. | NEW | TEMPORAL | Design Complete |
| patient_travel_history | Data about PLACES. Endemic exposure risk, travel dates, destinations. | NEW | POINT-IN-TIME | Design Complete |
| patient_symptoms | EXPRESSED observations (patient-reported). Blob approach preserves patient voice. Pass 3 links to conditions via narratives. | NEW | POINT-IN-TIME | Design Complete |
| patient_lab_results | Highest volume, unique fields (LOINC, reference ranges, specimen type, panel_name, result_status). | NEW | POINT-IN-TIME | Design Complete |
| patient_procedures | High billing importance, unique fields (approach, anesthesia, complications, performing_provider, performing_facility). | NEW | POINT-IN-TIME | Design Complete |

### Progress Tracker - Tier 2 New Tables

Secondary priority tables for specific clinical entity types.

| Proposed Table | Rationale | Step A | Step D | Status |
|----------------|-----------|--------|--------|--------|
| patient_imaging_results | Unique modality/body region structure, radiology reports. | NEW | POINT-IN-TIME | Design Complete |
| patient_physical_findings | Exam findings with body system organization, gradation systems. | NEW | POINT-IN-TIME | Design Complete |
| patient_advance_directives | DNR/DNI, healthcare proxy, living wills. Legal document references. | NEW | POINT-IN-TIME | Design Complete |
| patient_risk_scores | Calculated risk assessments (Framingham, CHADS2, MELD, etc.). Score name, value, interpretation. | NEW | POINT-IN-TIME | Design Complete |
| patient_goals | Patient care goals, often tied to conditions but not always. | NEW | POINT-IN-TIME | Design Complete |
| patient_care_plans | Multi-step treatment plans, often encounter-specific. | NEW | POINT-IN-TIME | Design Complete |

### Progress Tracker - Tier 3 New Tables

Lower priority tables for edge cases and specialized data.

| Proposed Table | Rationale | Step A | Step D | Status |
|----------------|-----------|--------|--------|--------|
| patient_scores_scales | Standardized assessment instruments (PHQ-9, MMSE, etc.). | NEW | POINT-IN-TIME | Design Complete |
| patient_treatments | Non-medication/non-procedure therapies (PT, OT, RT). | NEW | POINT-IN-TIME | Design Complete |
| patient_devices | Medical devices, prosthetics, implants (pacemakers, hearing aids). | NEW | POINT-IN-TIME | Design Complete |

### Progress Tracker - Infrastructure Tables

| Proposed Table | Rationale | Step A | Status |
|----------------|-----------|--------|--------|
| patient_unstructured_clinical_notes | Orphan handler for entities that don't fit any spoke table. Tracks AI classification attempts for gap analysis. | NEW | Design Complete |

### Progress Tracker - Merged Decisions

| Original Proposal | Decision | Rationale |
|-------------------|----------|-----------|
| patient_lifestyle | MERGE into patient_social_history | Not distinct enough for separate table |
| patient_review_of_systems | No table | Documentation section, not entity type. Individual findings go to symptoms or physical_findings. |

**Full analysis:** See `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`

### Source File Update Template

When reviewing each table, update the source file header to:

```markdown
# [table_name] Bridge Schema (Source) - Pass 2

**Triage Status:** [Not Started | Step A Complete | Step B Complete | Step C Complete | Step D Complete | DONE]
**Step A Decision:** [KEEP | REMOVE | MERGE into X | NEW]
**Step A Rationale:** [Why this decision]
**Step B Sync:** [Pending | Verified against 03_clinical_core.sql lines X-Y | GAPS: list]
**Step C Columns:** [Pending | Complete - see Column Audit section below]
**Step D Temporal:** [TEMPORAL | POINT-IN-TIME | N/A] - [Rationale]
**Last Triage Update:** YYYY-MM-DD
**Original Created:** [keep original date]
```

### Working Order (Updated 2025-12-04)

Remaining triage work:

1. **Hub table triage** - Apply lean hub principle
   - patient_clinical_events (the hub) - Which columns stay vs move to spokes?
   - healthcare_encounters - Review for Pass 2 relevance

2. **Supporting tables** - Determine Pass 2 involvement
   - medical_code_assignments (Pass 2.5 target)
   - profile_appointments
   - user_profiles

3. **Multi-pass tables** - Likely REMOVE from Pass 2 scope
   - pass2_clinical_metrics
   - ai_confidence_scoring, ai_processing_sessions, etc.

**Already Complete:**
- 5 existing spoke tables triaged (conditions, medications, allergies, vitals, immunizations)
- 2 catch-all tables marked for deletion (observations, interventions)
- 16 new tables designed (6 Tier 1, 6 Tier 2, 3 Tier 3, 1 orphan handler)

---

## Phase 2: Bridge Schema Sizing Analysis

**Status:** BLOCKED - Waiting on Phase 1

Once Phase 1 identifies which tables need bridge schemas, we will:

1. Count tokens for each bridge schema (detailed vs minimal versions)
2. Model worst-case scenarios ("1-page file needing all schemas")
3. Determine if Level 1-2 zones (encounters + safe-splits) are sufficient
4. Decide if Level 3 zones are needed

**Key Question:** What's the total token load if Pass 2 receives ALL bridge schemas for a single batch?

---

## Phase 3: Bridge Schema Reconstruction

**Status:** BLOCKED - Waiting on Phase 1

For each KEEP table from Phase 1:

1. Review Step C column audit
2. Rebuild bridge schema from ground up
3. Create source (.md), detailed (.json), minimal (.json) versions
4. Validate token counts against Phase 2 targets

**Reference:** Existing schemas in `bridge-schema-architecture/bridge-schemas/`

---

## Phase 4: Zone Feature Implementation

**Status:** BLOCKED - Waiting on Phase 2/3

Implement the bridge schema zone system:

1. Verify `pass1_bridge_schema_zones` table is ready
2. Update Pass 1 to output `schema_types_needed[]` per batch
3. Build zone-to-schema routing for Pass 2
4. Test with real documents

**Reference:** `02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md`

---

## Phase 5: Pass 2 Worker Implementation

**Status:** BLOCKED - Waiting on Phase 3/4

Build the Pass 2 worker:

1. Create `apps/render-worker/src/pass2/` structure
2. Implement zone-based parallel processing
3. Prompt engineering with new bridge schemas
4. Database writes to hub-and-spoke tables

---

## Phase 6: Pass 2.5 Medical Code Assignment

**Status:** BLOCKED - Waiting on Phase 5

Implement the Agentic Waterfall for medical codes:

1. Primary tier (patient's existing codes)
2. Secondary tier (Exora internal cache)
3. Tertiary tier (universal medical codes)
4. Exora-originated codes (fallback)

**Reference:** `01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md`

---

## Phase 7: Testing & Validation

**Status:** BLOCKED - Waiting on Phase 5/6

1. Accuracy testing with real medical documents
2. Token usage validation
3. Performance benchmarking
4. Edge case handling

---

## File Organization

```
strategy-a-docs/
├── PASS2-STRATEGY-A-MASTER.md              # This file (dashboard + phases)
├── 00-STRATEGY-A-DESIGN-NOTES.md           # Original thinking (Dec 2025)
├── 01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md  # Pass 2.5 Agentic Waterfall
├── 02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md   # Zone hierarchy design
├── 03-FINE-TUNED-EXORA-MODEL-VISION.md     # Future: custom model
├── 04-HUB-AND-SPOKE-DATABASE-PATTERN.md    # Database architecture + lean hub principle
├── 05-PASS2-AS-PRIMARY-EXTRACTOR.md        # Pass 2's discovery+enrichment role
├── 06-AI-OUTPUT-TOKEN-OPTIMIZATION.md      # Minimizing AI output tokens
├── 07-SPOKE-TABLE-EVOLUTION-ROADMAP.md     # Spoke table evolution plan
├── 08-PASS3-NARRATIVE-INTEGRATION.md       # How Pass 3 narratives integrate with Pass 2 entities
└── README.md                                # Folder navigation

bridge-schema-architecture/bridge-schemas/source/pass-2/
├── patient_conditions.md                    # Working documents for Phase 1
├── patient_medications.md                   # (updated during triage)
├── ... (13 more files)
└── pass-2-versions/                         # Multi-pass table schemas
    └── ... (5 files)
```

---

## Key Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Pass 0.5 (encounters, safe-splits) | Operational | Provides zone boundaries |
| Pass 1 (schema routing) | Needs Update | Currently outputs entities; needs refactor to output `schema_types_needed[]` only |
| Database schema (03_clinical_core.sql) | Complete | Source of truth for columns |
| Existing bridge schemas | Complete | Reference for reconstruction |

---

## Obsolete Tables (Strategy-A Changes)

The following tables were designed for the old "Pass 1 detects, Pass 2 enriches" model and are now obsolete:

| Table | Original Purpose | New Status |
|-------|------------------|------------|
| `entity_processing_audit` | Track Pass 1 entities for Pass 2 | OBSOLETE - Pass 2 writes directly to hub |
| `pass1_entity_detections` | Store Pass 1 detected entities | OBSOLETE - Pass 2 discovers its own entities |

**Tables that remain relevant:**
- `pass1_bridge_schema_zones` - Still used for L3 zone detection (future)
- `pass1_entity_metrics` - Repurpose for Pass 1 schema routing metrics

---

## Open Questions (Updated 2025-12-04)

### Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| New tables for family/social/travel history? | YES - Tier 1 | No current home in schema; unique data structures |
| New table for symptoms? | YES - Tier 1 | Blob approach preserves patient voice; Pass 3 links to conditions |
| Split labs from observations? | YES - Tier 1 | Highest volume, unique fields (LOINC, ranges) |
| Split procedures from interventions? | YES - Tier 1 | High billing importance, unique fields |
| Delete patient_observations? | YES | No catch-all tables; every entity type gets dedicated table |
| Delete patient_interventions? | YES | No catch-all tables; every entity type gets dedicated table |
| New tables for advance_directives, risk_scores, goals, care_plans? | YES - Tier 2 | Common clinical entities with unique structures |
| New tables for imaging, physical_findings? | YES - Tier 2 | Distinct entity types with unique field requirements |
| New tables for scores_scales, treatments, devices? | YES - Tier 3 | Lower priority but still need dedicated tables |
| Orphan handler table? | YES - Infrastructure | `patient_unstructured_clinical_notes` for true edge cases |
| ROS handling? | No table | Documentation section; individual findings go to symptoms or physical_findings |
| Lifestyle data? | MERGE into social_history | Not distinct enough for separate table |
| clinical_purposes[] for routing? | NO - Analytics only | Routing is activity_type + entity subtype only |
| Hub table columns? | 16 columns (down from ~40) | Removed: event_date (spokes own), AI confidence (meaningless), medical codes (on spokes), clinical detail (on spokes) |
| Hub event_date? | REMOVE | Spokes own temporal data with tailored date fields; entities inherit encounter context |
| Hub AI confidence columns? | REMOVE | ai_extracted, ai_confidence, requires_review all removed - confidence meaningless |
| Hub archived vs deleted_at? | Keep archived, remove deleted_at | archived pattern for soft-hide compliance; deleted_at redundant |

### Still Open

1. **Migration execution:** When to create the 16 new tables and delete obs/int tables?
2. **Bridge schema creation:** Detailed and minimal JSON schemas for all 21 spoke tables
3. **Phase 2 sizing:** Token counts for bridge schemas to validate context window fit

---

## Related Documentation

- **Pass 1 Reference:** `../pass-1-entity-detection/strategy-a/PASS1-STRATEGY-A-MASTER.md`
- **Database Schema:** `../../../current_schema/03_clinical_core.sql`
- **Bridge Schema Architecture:** `../bridge-schema-architecture/README.md`
- **Medical Code Assignment:** `01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md`
- **Zone Architecture:** `02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md`

---

**Last Updated:** 2025-12-04
