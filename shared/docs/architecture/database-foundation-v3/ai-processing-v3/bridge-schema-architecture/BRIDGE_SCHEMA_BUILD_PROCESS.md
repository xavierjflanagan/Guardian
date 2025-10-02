# Bridge Schema Build Process - Assembly Line Documentation

**Date Created:** 30 September 2025
**Status:** Build Process Complete 1st October 2025 ✅
**Purpose:** Document the systematic three-tier bridge schema creation workflow to ensure consistency and prevent crashes/rework

---

## Overview

This document describes the assembly line process for creating bridge schemas for all Pass 2 tables. Each table requires three schema versions (source, detailed, minimal) that must be perfectly aligned with the database source of truth.

---

## Three-Tier Schema Architecture

### Tier 1: Source Schema (`.md` format)
**Location:** `bridge-schemas/source/pass-2/[table_name].md`
**Purpose:** Human reference documentation and database validation
**Format:** Markdown with SQL and TypeScript
**Audience:** Developers, schema validation, troubleshooting

**Contents:**
- Complete SQL CREATE TABLE statement from database source of truth
- Full TypeScript interface with all fields documented
- O3 classification guides (where applicable)
- Example extractions showing realistic data
- Critical notes about database specifics
- Validation checklists
- Database constraint notes

**Critical Requirements:**
- Must match database source of truth EXACTLY (field names, types, constraints, defaults)
- Include line number references to source SQL files
- Document any FK constraints added via ALTER TABLE
- Clarify logical requirements vs database-enforced constraints
- Remove any fields that don't exist in actual database schema

### Tier 2: Detailed Schema (`.json` format)
**Location:** `bridge-schemas/detailed/pass-2/[table_name].json`
**Purpose:** Default AI processing schema with rich medical context
**Format:** JSON
**Audience:** AI models (GPT-4, Claude, etc.)

**Contents:**
- Table and pass identification
- Clinical context and description
- Required fields list
- Detailed field definitions with:
  - Type and format information
  - Clinical guidance and examples
  - Multiple realistic examples per field
  - Enum value definitions and explanations
- Complete extraction examples (2-3 scenarios)
- Extraction guidelines
- Confidence thresholds
- Validation rules

**Critical Requirements:**
- Must derive ALL information from source schema (no invention)
- Rich medical context for clinical decision-making
- Multiple examples showing field usage variations
- Clear guidance for ambiguous scenarios
- Safety-critical item handling instructions
- Confidence scoring guidance

### Tier 3: Minimal Schema (`.json` format)
**Location:** `bridge-schemas/minimal/pass-2/[table_name].json`
**Format:** JSON
**Purpose:** Token-optimized schema for large documents or budget constraints
**Audience:** AI models with token limitations

**Contents:**
- Table and pass identification
- Required fields list
- Field types (condensed format: "string?", "uuid", "enum_value1|enum_value2")
- Condensed O3 classification (if applicable)
- Single minimal example
- No verbose descriptions or guidance

**Critical Requirements:**
- Must contain ALL required and optional fields from source schema
- Use condensed type notation for brevity
- Single working example that demonstrates structure
- ~85-90% token reduction vs detailed schema
- NO cutting corners - all fields must be present

---

## Assembly Line Process (File-by-File)

### Step 1: Create Source Schema (.md)
**Responsibility:** Claude Code
**Input:** Database source of truth SQL file (`/current_schema/*.sql`)
**Output:** Complete source schema markdown file

**Process:**
1. Read the actual database table definition from source SQL files
2. Extract complete CREATE TABLE statement with all columns, types, constraints
3. Create TypeScript interface mapping all database fields
4. Add clinical context and O3 classification guides (where applicable)
5. Create 2-3 realistic extraction examples
6. Add critical notes about:
   - Required vs optional fields
   - UUID reference fields (context vs extraction)
   - Numeric precision requirements
   - Array and JSONB field formats
   - Temporal management (which tables have it)
   - FK constraint timing (inline vs ALTER TABLE)
7. Include validation checklist
8. Add database constraint notes section

**Quality Checks:**
- [ ] SQL exactly matches source database schema (no extra/missing fields)
- [ ] Line numbers reference actual source SQL location
- [ ] All data types match exactly (TEXT, UUID, TIMESTAMPTZ, NUMERIC(4,3), etc.)
- [ ] All CHECK constraints documented
- [ ] All DEFAULT values documented
- [ ] All FK references documented with timing notes
- [ ] Temporal columns only included if table actually has them

### Step 2: GPT-5 Review
**Responsibility:** Human operator with GPT-5
**Input:** Completed source schema markdown file
**Output:** Review feedback with specific issues flagged

**Review Focus:**
1. **Field Accuracy**: Compare every field against database source SQL
2. **Type Precision**: Verify data types, precision, scale match exactly
3. **Constraint Validation**: Check all CHECK constraints, DEFAULTs, NOT NULLs
4. **Temporal Columns**: Verify temporal management columns only on correct tables
5. **FK References**: Validate foreign key constraint timing (inline vs ALTER TABLE)
6. **Documentation Gaps**: Flag missing or incorrect documentation

**Common Issues to Catch:**
- Temporal columns incorrectly added to tables that don't have them
- FK constraints shown inline when they're actually added via ALTER TABLE
- Logical requirements (e.g., array length) described as DB constraints
- Fields from similar tables incorrectly copied over
- Numeric precision mismatches (NUMERIC(4,3) vs NUMERIC(3,2))
- Missing database-specific fields

**Resolution Process:**
1. GPT-5 provides detailed issue list with evidence (SQL line numbers)
2. Human reviews and approves corrections
3. Claude Code applies all corrections
4. Update source schema with corrections
5. Proceed to Step 3 only after source schema is verified correct

### Step 3: Create Detailed Schema (.json)
**Responsibility:** Claude Code
**Input:** Verified source schema markdown file
**Output:** Rich JSON schema for AI processing

**Process:**
1. Extract all fields from source schema
2. For each field, create detailed definition:
   - Type and format
   - Description
   - Required vs optional
   - Examples (multiple variations)
   - Clinical guidance
   - Enum values with explanations (where applicable)
3. Create complete extraction examples (2-3 scenarios)
4. Add extraction guidelines section
5. Add confidence threshold guidance
6. Add validation rules section

**Quality Checks:**
- [ ] ALL fields from source schema included (no omissions)
- [ ] Field types match source schema exactly
- [ ] Required fields list matches source schema
- [ ] Examples demonstrate realistic extraction scenarios
- [ ] Clinical guidance provides actionable AI instructions
- [ ] Enum values fully explained
- [ ] No fields invented that don't exist in source schema

### Step 4: Create Minimal Schema (.json)
**Responsibility:** Claude Code
**Input:** Verified source schema markdown file
**Output:** Token-optimized JSON schema

**Process:**
1. Extract all fields from source schema
2. Create condensed field type notation:
   - Required: `"field_name": "type"`
   - Optional: `"field_name": "type?"`
   - Enums: `"field_name": "value1|value2|value3"`
   - Context fields: `"field_name": "type (context)"`
   - Defaults: `"field_name": "type (default_value)"`
3. Create single minimal working example
4. Add condensed O3 classification guide (if applicable)

**Quality Checks:**
- [ ] ALL fields from source schema included
- [ ] Required fields list matches source schema
- [ ] Field types match source schema (condensed notation)
- [ ] Example is valid and complete
- [ ] ~85-90% token reduction achieved vs detailed schema
- [ ] No corners cut - all fields present even if condensed

---

## Progress Tracking

### Completed Tables
**Status:** 10 of 18 Pass 2 tables complete (3/3 tiers each)

- [x] patient_clinical_events (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_observations (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_interventions (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_vitals (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] medical_code_assignments (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] healthcare_encounters (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_medications (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_conditions (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_allergies (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_immunizations (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)

### Completed Pass 2 Tables (3 additional tables)
**Status:** 13 of 18 Pass 2 tables complete (3/3 tiers each)

- [x] user_profiles (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] profile_appointments (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] pass2_clinical_metrics (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)

### Completed Pass 1 Tables (3 tables)
**Status:** 3 of 3 Pass 1 single-pass tables complete (3/3 tiers each)

- [x] pass1_entity_metrics (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] profile_classification_audit (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)

### Completed Multi-Pass Tables (5 tables × 2 versions × 3 tiers = 30 schemas)

**Status:** ✅ ALL 30 MULTI-PASS SCHEMAS COMPLETE! (Completed: 1 October 2025)

**Multi-Pass Architecture:**
Each of these 5 tables has TWO bridge schema versions:
- **Pass 1 Version (CREATE):** Initializes record during entity detection
- **Pass 2 Version (UPDATE):** Updates record during clinical enrichment

**Build Order (by dependency/complexity):**
1. [x] shell_files (Pass 1 ✅ + Pass 2 ✅) - Document container foundation
2. [x] ai_processing_sessions (Pass 1 ✅ + Pass 2 ✅) - Session coordination layer
3. [x] entity_processing_audit (Pass 1 ✅ + Pass 2 ✅) - Core per-entity audit trail (most complex)
4. [x] ai_confidence_scoring (Pass 1 ✅ + Pass 2 ✅) - Confidence metadata layer (optional Pass 2 updates)
5. [x] manual_review_queue (Pass 1 ✅ + Pass 2 ✅) - Review workflow management (Pass 2 creates new items)

**Total Schemas Required:**
- Pass 2 single-pass: 13 tables × 3 tiers = 39 schemas ✅ COMPLETE
- Pass 1 single-pass: 2 tables × 3 tiers = 6 schemas ✅ COMPLETE
- Multi-pass: 5 tables × 2 versions × 3 tiers = 30 schemas ✅ COMPLETE
- **Grand Total:** 75 schema files ✅ ALL COMPLETE!

---

## Multi-Pass Table Architecture

### Overview
5 tables span both Pass 1 and Pass 2, requiring separate bridge schema versions for each pass. These tables use a CREATE (Pass 1) → UPDATE (Pass 2) pattern.

### The 5 Multi-Pass Tables

**1. shell_files** - Document container and processing orchestrator
- **Pass 1 CREATE:** File upload, OCR processing, entity detection metadata
- **Pass 2 UPDATE:** Clinical enrichment completion status, final processing metrics
- **Database Location:** `03_clinical_core.sql`
- **Foreign Key Note:** Referenced by patient_vitals.source_shell_file_id

**2. ai_processing_sessions** - Session coordination across passes
- **Pass 1 CREATE:** Session initialization, entity detection tracking, Pass 1 metrics
- **Pass 2 UPDATE:** Clinical enrichment status, Pass 2 completion metrics, final totals
- **Database Location:** `04_ai_processing.sql`
- **Foreign Key Note:** Referenced by all metrics tables via processing_session_id

**3. entity_processing_audit** - Per-entity audit trail (MOST COMPLEX)
- **Pass 1 CREATE:** Entity detection, spatial location, OCR cross-validation, Pass 1 confidence
- **Pass 2 UPDATE:** Clinical enrichment results, links to final clinical tables, Pass 2 confidence
- **Database Location:** `04_ai_processing.sql`
- **Foreign Key Note:** Links to 7 clinical tables via final_*_id columns

**4. ai_confidence_scoring** - Confidence tracking across passes
- **Pass 1 CREATE:** Entity detection confidence scores, OCR agreement scores
- **Pass 2 UPDATE:** Clinical enrichment confidence scores, cross-validation results
- **Database Location:** `04_ai_processing.sql`

**5. manual_review_queue** - Review queue management
- **Pass 1 CREATE:** Enqueue low-confidence entities, contamination risks, safety flags
- **Pass 2 UPDATE:** Clinical enrichment review results, resolution status
- **Database Location:** `04_ai_processing.sql`

### Pass 1 vs Pass 2 Bridge Schema Differences

**Pass 1 Version (CREATE focus):**
- AI instruction: "Create new record with these fields during entity detection"
- Populates: Entity identity, detection confidence, spatial location, OCR data
- Sets status fields to initial values (e.g., pass2_status='pending')
- Focus: What data to capture when entity is FIRST detected

**Pass 2 Version (UPDATE focus):**
- AI instruction: "Update existing record with these fields during clinical enrichment"
- Populates: Enrichment results, clinical confidence, final table links, completion timestamps
- Updates status fields to final values (e.g., pass2_status='completed')
- Focus: What data to add when entity is ENRICHED with clinical context

**Example Field Distribution (entity_processing_audit):**

Pass 1 CREATE fields:
```
entity_id, original_text, entity_category, entity_subtype,
spatial_bbox, page_number, pass1_confidence, requires_schemas,
processing_priority, pass1_model_used, ai_visual_interpretation,
ocr_reference_text, ai_ocr_agreement_score
```

Pass 2 UPDATE fields:
```
pass2_status, pass2_confidence, pass2_started_at, pass2_completed_at,
enrichment_errors, final_event_id, final_observation_id,
final_intervention_id, pass2_model_used, pass2_token_usage
```

### Build Process for Multi-Pass Tables

**For each of the 5 tables, execute this sequence:**

1. **Create Pass 1 Source Schema** (`.md` in `source/pass-1/pass-1-versions/`)
   - Focus on CREATE operation fields
   - Document which fields are populated during entity detection
   - Include Pass 1 examples

2. **GPT-5 Review Pass 1 Source** (mandatory)
   - Verify CREATE fields match database
   - Check Pass 1 logic correctness

3. **Create Pass 1 Detailed + Minimal Schemas** (`.json` in `detailed/pass-1/` and `minimal/pass-1/`)
   - Derive from Pass 1 source schema
   - Focus on CREATE operation guidance

4. **Create Pass 2 Source Schema** (`.md` in `source/pass-2/pass-2-versions/`)
   - Focus on UPDATE operation fields
   - Document which fields are populated during clinical enrichment
   - Include Pass 2 examples

5. **GPT-5 Review Pass 2 Source** (mandatory)
   - Verify UPDATE fields match database
   - Check Pass 2 logic correctness

6. **Create Pass 2 Detailed + Minimal Schemas** (`.json` in `detailed/pass-2/` and `minimal/pass-2/`)
   - Derive from Pass 2 source schema
   - Focus on UPDATE operation guidance

**Total: 6 schemas per table (3 for Pass 1, 3 for Pass 2)**

---

## Database Source of Truth Files

All source schemas must reference these authoritative SQL files:

```
/shared/docs/architecture/database-foundation-v3/current_schema/
├── 01_foundations.sql        # System infrastructure (no Pass 2 tables)
├── 02_profiles.sql            # user_profiles, profile_appointments
├── 03_clinical_core.sql       # 10 core clinical tables + shell_files
├── 04_ai_processing.sql       # AI processing infrastructure
├── 05_healthcare_journey.sql  # (no Pass 2 tables in scope)
├── 06_security.sql            # (no Pass 2 tables in scope)
├── 07_optimization.sql        # (no Pass 2 tables in scope)
└── 08_job_coordination.sql    # pass2_clinical_metrics
```

**Migration Files (for temporal management verification):**
```
/shared/docs/architecture/database-foundation-v3/migration_history/
└── 2025-09-25_02_temporal_data_management.sql  # Lists which tables have temporal columns
```

---

## Critical Rules - NO EXCEPTIONS

1. **Never invent fields**: Every field must exist in the database source of truth SQL
2. **Verify temporal columns**: Only 9 specific tables have temporal management columns (patient_clinical_events is NOT one of them)
3. **Check FK timing**: Some FK constraints are added via ALTER TABLE, not inline
4. **Include all fields**: Minimal schemas must include ALL fields (condensed notation is OK, omission is NOT)
5. **Match precision exactly**: NUMERIC(4,3) ≠ NUMERIC(3,2) - get it right
6. **Trust the source schema**: Detailed and minimal schemas derive from source, not from assumptions
7. **GPT-5 review is mandatory**: Do not proceed to detailed/minimal without source schema verification
8. **Document references**: Include SQL line numbers for traceability

---

## Recovery Process (In Case of Crash)

If Claude Code crashes during this process:

1. Check this document for the last completed table
2. Review the progress tracking section
3. Identify which step was in progress (source, review, detailed, or minimal)
4. Resume from that step for the next incomplete table
5. Never skip the GPT-5 review step
6. Verify all three tiers exist before marking a table as complete

---

## Schema Validation Checklist (Per Table)

Before marking a table as complete, verify:

- [ ] Source schema exists in `source/pass-2/[table_name].md`
- [ ] Source schema passed GPT-5 review with all issues resolved
- [ ] Source schema matches database SQL exactly
- [ ] Detailed schema exists in `detailed/pass-2/[table_name].json`
- [ ] Detailed schema includes all fields from source schema
- [ ] Detailed schema provides rich medical context and examples
- [ ] Minimal schema exists in `minimal/pass-2/[table_name].json`
- [ ] Minimal schema includes all fields from source schema (condensed)
- [ ] Minimal schema achieves ~85-90% token reduction
- [ ] All three tiers are internally consistent

---

## Token Budget Analysis

**Per Table Estimates:**
- Source schema (not sent to AI): ~200-250 lines
- Detailed schema (default): ~400-500 lines
- Minimal schema (budget mode): ~50-70 lines

**Token Savings:**
- Minimal vs Detailed: ~85-90% reduction
- Estimated tokens per table: Detailed ~1,500 tokens, Minimal ~200 tokens

**Full Pass 2 Context:**
- Using all detailed schemas: ~27,000 tokens (18 tables × 1,500)
- Using all minimal schemas: ~3,600 tokens (18 tables × 200)

---

## Notes and Observations

**2025-09-30 - patient_clinical_events completion:**
- GPT-5 review caught critical error: temporal columns incorrectly included on patient_clinical_events
- Temporal columns only exist on 9 specialized tables, not the hub table
- This highlights importance of mandatory GPT-5 review step
- Source schema now includes prominent warning about temporal column locations

**2025-09-30 - patient_observations completion:**
- GPT-5 review approved source schema with no issues
- Detail table with event_id FK to patient_clinical_events
- HAS temporal columns (confirmed in migration line 994)
- Value fields strategy: at least ONE value field required (value_text, value_numeric, value_secondary, or value_boolean)

**2025-09-30 - patient_interventions completion:**
- GPT-5 review approved source schema with no issues
- Detail table for intervention events (medications, procedures, surgeries, therapies)
- HAS temporal columns (confirmed in migration line 993)
- Contextual field usage varies by intervention_type (substance_name for meds, technique for procedures)
- Safety-critical handling: medications/vaccines require confidence >= 0.900

**2025-09-30 - patient_vitals completion:**
- GPT-5 review approved source schema with no issues
- Unique table characteristics:
  - Uses patient_id directly (NOT event_id like observations/interventions)
  - JSONB measurement_value with structure varying by vital_type (10 DB-enforced enum values)
  - Two different numeric precisions: ai_confidence (4,3) vs confidence_score (3,2)
  - Five NOT NULL required fields: patient_id, vital_type, measurement_value, unit, measurement_date
  - HAS temporal columns (confirmed in migration line 993)

**2025-09-30 - medical_code_assignments completion:**
- GPT-5 review approved source schema with no issues
- Generic entity-to-code mapping table (9 allowed entity tables)
- Step 1.5 processing: Vector embedding-based code resolution BETWEEN Pass 1 and Pass 2
- Key architecture: AI selects from 10-20 pre-verified candidates (never generates codes freely)
- Parallel dual-code strategy: Universal (SNOMED/RxNorm/LOINC) + Regional (PBS/MBS/ACIR)
- Confidence thresholds: ≥0.80 auto-accept, 0.60-0.79 needs review, <0.60 use fallback
- NO temporal columns (not in the 9 temporal-managed tables list)
- UNIQUE constraint on (entity_table, entity_id) ensures one code per entity
- DECIMAL(3,2) precision for all confidence scores (2 decimal places)

**2025-09-30 - healthcare_encounters completion:**
- GPT-5 review approved source schema with no issues
- Healthcare encounters and provider visits tracking
- encounter_type NOT NULL with 6 allowed values: outpatient, inpatient, emergency, specialist, telehealth, diagnostic
- TEXT[] arrays for billing_codes and related_shell_file_ids
- NUMERIC(4,3) precision for both ai_confidence and confidence_score (3 decimal places)
- HAS temporal columns (confirmed in migration line 192)
- Narrative fields: chief_complaint, summary, clinical_impression, plan
- Five comprehensive examples covering all encounter types

**2025-10-01 - patient_medications completion:**
- GPT-5 review approved source schema with no issues
- Medication records with prescription details, dosing, and status management
- HAS patient_id column (denormalized for RLS performance) with composite FK to patient_clinical_events
- Migration 08: event_id NOT NULL, renamed medication_reference_id FK column removed in migration 06
- status CHECK constraint with 5 values: active, completed, discontinued, on_hold, cancelled
- Safety-critical handling: requires_review=true if ai_confidence < 0.900
- Multiple medication coding systems: rxnorm_code, pbs_code, atc_code
- INTERVAL type for duration_prescribed (PostgreSQL interval format)

**2025-10-01 - patient_conditions completion:**
- GPT-5 review approved source schema with no issues
- Medical conditions and diagnoses with temporal tracking and severity management
- shell_file_id is NOT NULL (unique requirement for this table)
- Migration 08: event_id renamed from clinical_event_id and made NOT NULL
- primary_narrative_id for Pass 3 semantic narrative linking (optional, ON DELETE SET NULL)
- 3 CHECK constraints: condition_system (3 values), severity (4 values), status (5 values)
- Temporal date fields: onset_date, diagnosed_date, resolved_date (all DATE type, not TIMESTAMPTZ)

**2025-10-01 - patient_allergies completion:**
- GPT-5 review approved source schema with no issues
- Patient allergies and adverse reactions - SAFETY-CRITICAL data
- 4 CHECK constraints: allergen_type (5 values), reaction_type (4 values), severity (4 values), status (4 values)
- TEXT[] array for symptoms field (PostgreSQL array type)
- Safety rule: ALWAYS requires_review=true for severe or life_threatening severity regardless of ai_confidence
- medication_reference_id FK column removed in migration 06 (vestigial cleanup)
- Two different numeric precisions: ai_confidence (4,3) vs confidence_score (3,2)

**2025-10-01 - patient_immunizations completion:**
- GPT-5 review approved source schema with no issues
- Vaccination records with healthcare standards integration - SAFETY-CRITICAL data
- 4 required NOT NULL fields: patient_id, event_id, vaccine_name, administration_date
- administration_date is TIMESTAMPTZ (includes time and timezone), expiration_date is DATE (date only)
- clinical_validation_status CHECK constraint with 4 values: pending, validated, requires_review, rejected
- 2 TEXT[] arrays: contraindications, adverse_reactions (any adverse reactions trigger requires_review=true)
- Multiple healthcare coding systems: SNOMED, CPT, CVX, NDC, ACIR (Australian), PBS (Australian)
- dose_amount uses NUMERIC(6,3) - 6 total digits with 3 decimal places (e.g., 0.300 mL)

---

## Multi-Pass Schema Completion (1 October 2025)

### shell_files (Pass 1 + Pass 2) - COMPLETE

**Pass 1 CREATE (GPT-5 approved):**
- File upload and OCR processing initialization
- Key fields: filename, file_size_bytes, mime_type, storage_path, status='uploaded'
- File classification: file_type, file_subtype, confidence_score
- Content analysis: extracted_text, ocr_confidence, page_count
- Processing initialization: processing_started_at (default NOW())
- Pass 1 populates all physical file metadata and initial processing status

**Pass 2 UPDATE (GPT-5 approved):**
- Clinical enrichment completion tracking
- Updates: status='completed', processing_completed_at, processing_duration_seconds
- Cost tracking: processing_cost_estimate (ADD Pass 2 costs, don't replace)
- Uses COALESCE pattern to avoid overwriting timestamps: COALESCE(processing_completed_at, NOW())
- Idempotent UPDATE with WHERE status='processing' guard
- Pass 3 fields (ai_synthesized_summary, narrative_count) remain NULL

**Key Patterns:**
- Cost accumulation: Pass 2 ADDS to Pass 1 costs
- Status progression: 'uploaded' → 'processing' (Pass 1) → 'completed' (Pass 2)
- Timestamp safety: Use COALESCE to set once, never overwrite

---

### ai_processing_sessions (Pass 1 + Pass 2) - COMPLETE

**Pass 1 CREATE (GPT-5 approved with INTERVAL format note):**
- Session coordination and entity detection tracking
- Required: patient_id, shell_file_id, session_type
- Session initialization: session_status='initiated', workflow_step='entity_detection'
- Processing metadata: ai_model_version='v3', processing_mode='automated'
- Progress tracking: total_steps=5 (default), completed_steps=0
- Quality metrics: overall_confidence, quality_score from entity detection
- Start time: processing_started_at=NOW()

**Pass 2 UPDATE (GPT-5 approved):**
- Session completion tracking
- Updates: session_status='completed'|'failed', workflow_step='completed'
- Completion: completed_steps=total_steps, processing_completed_at=NOW()
- Duration: total_processing_time (INTERVAL type, calculate from started_at to completed_at)
- Quality updates: overall_confidence (use COALESCE), quality_score
- Error handling: error_message, error_context (include pass='pass-2')
- Idempotent: WHERE session_status='processing' guard

**Key Patterns:**
- INTERVAL type for total_processing_time (PostgreSQL duration format)
- Cross-pass coordination: All metrics tables reference this via processing_session_id
- Error context includes pass identifier for troubleshooting

---

### entity_processing_audit (Pass 1 + Pass 2) - COMPLETE

**Pass 1 CREATE (GPT-5 approved with patient_id CASCADE note):**
- Most complex multi-pass table - complete per-entity audit trail
- Required: shell_file_id, patient_id, processing_session_id, entity_id, original_text, entity_category, entity_subtype
- Entity identity: entity_id pattern "entity_001", "entity_002" (zero-padded sequential)
- Spatial mapping: spatial_bbox (JSONB), page_number, location_context, unique_marker
- Pass 1 confidence: pass1_confidence, requires_schemas (TEXT[]), processing_priority (5 enum values)
- AI-OCR cross-validation: ai_visual_interpretation, ocr_reference_text, ai_ocr_agreement_score
- Discrepancy tracking: discrepancy_type, discrepancy_notes, visual_quality_assessment
- Quality flags: validation_flags (TEXT[]), cross_validation_score, manual_review_required
- Profile safety: profile_verification_confidence, pii_sensitivity_level
- Pass 2 coordination: pass2_status='pending'|'skipped' (document_structure entities skip Pass 2)

**Pass 2 UPDATE (GPT-5 approved):**
- Clinical enrichment results and final clinical data linkage
- Updates: pass2_status='completed'|'failed', pass2_confidence
- Timing: pass2_started_at (set once with COALESCE), pass2_completed_at
- Metrics: pass2_model_used, pass2_token_usage, pass2_cost_estimate
- Final clinical links (populate ONE OR MORE based on entity_subtype):
  - final_event_id, final_encounter_id, final_observation_id
  - final_intervention_id, final_condition_id, final_allergy_id, final_vital_id
- Entity subtype mapping: vital signs → both observations + vitals, medications → interventions, diagnoses → conditions + events
- Error handling: enrichment_errors if Pass 2 fails

**Key Patterns:**
- Foreign key note: patient_id is NOT NULL without CASCADE (shell_file_id and processing_session_id have CASCADE)
- Multiple final links: Some entities link to multiple clinical tables for complete context
- Document structure skip: entity_category='document_structure' has pass2_status='skipped', no final links

---

### ai_confidence_scoring (Pass 1 + Pass 2) - COMPLETE

**Pass 1 CREATE (GPT-5 approved):**
- Entity detection confidence metrics and quality tracking
- Required: processing_session_id only (most flexible multi-pass table)
- Optional: entity_processing_audit_id (session-level vs entity-level scoring)
- Confidence breakdown: entity_detection_confidence, text_extraction_confidence, spatial_alignment_confidence
- Model-specific: vision_model_confidence, language_model_confidence, classification_model_confidence
- Composite scores: overall_confidence, reliability_score, clinical_relevance_score
- Quality indicators: confidence_trend (improving|stable|declining), outlier_detection, confidence_flags (TEXT[])
- Human validation: human_validation_available, human_agreement_score, model_accuracy_score
- Model performance: processing_time_ms, model_version, calibration_score

**Pass 2 UPDATE (GPT-5 approved - optional operation):**
- Optional clinical enrichment confidence updates
- Updates: clinical_coding_confidence (clinical classification confidence)
- May update: overall_confidence (recalculate with Pass 2), reliability_score, confidence_flags (append Pass 2 flags)
- Use array_append() to ADD Pass 2 flags without removing Pass 1 flags
- Timestamp note: updated_at must be manually set (no automatic trigger)

**Key Patterns:**
- LEAST rigid Pass separation: Pass 2 updates are ENTIRELY OPTIONAL and ADDITIVE
- Most deployments may skip Pass 2 updates and use Pass 1 metrics only
- Confidence calculation examples provided in source schema (weighted average, variance-based reliability)

---

### manual_review_queue (Pass 1 + Pass 2) - COMPLETE

**Pass 1 CREATE (GPT-5 approved with duplicate key fix):**
- Human review queue for low-confidence detection and safety concerns
- Required: patient_id, processing_session_id, shell_file_id, review_type, review_title, review_description
- Review types (Pass 1 focus): entity_validation, profile_classification, low_confidence, contamination_risk, safety_concern
- Priority levels: low|normal|high|urgent|critical (critical/urgent BLOCK Pass 2 until resolved)
- AI context: ai_confidence_score, ai_concerns (TEXT[]), flagged_issues (TEXT[])
- Review content: review_title (short), review_description (detailed), ai_suggestions
- Clinical context: JSONB with page numbers, entity IDs, detected names, etc.
- Assignment: assigned_reviewer, assigned_at, estimated_review_time (default '15 minutes' INTERVAL)
- Workflow: review_status='pending' (Pass 1 initialization)

**Pass 2 CREATE (new items, optional):**
- Creates NEW review items (does NOT update Pass 1 items)
- Review type (Pass 2 focus): clinical_accuracy
- Optional creation: Only create if clinical enrichment confidence < threshold
- Priority: Typically normal|high (not critical/urgent - Pass 2 reviews typically NON-BLOCKING)
- AI concerns (Pass 2 examples): ambiguous_clinical_context, missing_date_information, multiple_possible_codes
- Clinical context: Include entity_id, pass2_confidence, missing_fields, possible_codes

**Key Patterns:**
- UNIQUE multi-pass pattern: Pass 2 CREATES new items, doesn't UPDATE Pass 1 items
- Processing gates: Critical/urgent reviews from Pass 1 BLOCK Pass 2 until completed
- Same table structure for both passes, distinguished by review_type field

---

**END OF DOCUMENT**

Update this document as the assembly line progresses. Document any issues, patterns, or lessons learned.