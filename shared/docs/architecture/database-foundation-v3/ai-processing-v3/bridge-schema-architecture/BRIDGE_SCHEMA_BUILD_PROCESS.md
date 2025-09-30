# Bridge Schema Build Process - Assembly Line Documentation

**Date Created:** 30 September 2025
**Status:** Active Build Process
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
**Status:** 6 of 18 Pass 2 tables complete (3/3 tiers each)

- [x] patient_clinical_events (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_observations (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_interventions (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] patient_vitals (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] medical_code_assignments (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)
- [x] healthcare_encounters (source ✅ + GPT-5 review ✅ + detailed ✅ + minimal ✅)

### Remaining Pass 2 Tables (12 tables)

**Core Clinical Data Extraction (6 tables):**
- [ ] patient_conditions
- [ ] patient_allergies
- [ ] patient_medications
- [ ] patient_immunizations
- [ ] user_profiles
- [ ] profile_appointments
- [ ] pass2_clinical_metrics

**Pass 2 Versions (5 multi-pass tables):**
- [ ] shell_files (pass-2-versions)
- [ ] ai_processing_sessions (pass-2-versions)
- [ ] manual_review_queue (pass-2-versions)
- [ ] ai_confidence_scoring (pass-2-versions)
- [ ] entity_processing_audit (pass-2-versions)

**Total Schemas Required:** 18 tables × 3 tiers = 54 schema files

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

---

**END OF DOCUMENT**

Update this document as the assembly line progresses. Document any issues, patterns, or lessons learned.