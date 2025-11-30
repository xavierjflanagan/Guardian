# Bridge Schema Architecture

**Last Updated:** 3 October 2025
**Purpose:** Define database extraction requirements for V3 AI processing pipeline
**Status:** Pass 1 & Pass 2 schemas complete (25 schemas total)

---

## Quick Reference

**What are bridge schemas?**
Specifications defining what data AI models must extract and how to structure it for database insertion.

**Directory structure:**
```
bridge-schema-architecture/
├── README.md (this file)
├── BRIDGE_SCHEMA_BUILD_PROCESS.md (creation guide)
├── bridge-schemas/
│   ├── source/          (Human-readable .md documentation)
│   ├── detailed/        (Complete .json specs for AI prompts)
│   ├── minimal/         (Token-optimized .json specs for AI prompts)
│   ├── entity_classifier.ts (Legacy - archived)
│   ├── schema_loader.ts (Legacy - archived)
│   └── usage_example.ts (Legacy - archived)
└── tests/               (Schema validation and token analysis)
```

---

## Three-Tier Schema System

Each database table has **three versions** of its bridge schema:

### 1. Source Schemas (`.md` files)
**Location:** `bridge-schemas/source/pass-{1,2,3}/`
**Purpose:** Human-readable documentation and reference
**Contains:**
- Complete field descriptions
- Database table structure (SQL)
- AI extraction requirements
- Example extractions
- Migration history

**Files:**
- **Pass 1:** 7 schemas (2 pass-specific + 5 multi-pass)
- **Pass 2:** 18 schemas (13 pass-specific + 5 multi-pass)
- **Pass 3:** Not yet created

### 2. Detailed Schemas (`.json` files)
**Location:** `bridge-schemas/detailed/pass-{1,2}/`
**Purpose:** Complete field specifications for AI prompt construction
**Contains:**
- Full field descriptions
- Validation rules
- Clinical context
- Examples with guidance
- Type definitions

**Usage:** Future Pass 2 implementation (send to AI for clinical data extraction)
**Status:** Created but not yet used in implementation

### 3. Minimal Schemas (`.json` files)
**Location:** `bridge-schemas/minimal/pass-{1,2}/`
**Purpose:** Token-optimized specifications for AI prompts
**Contains:**
- Essential field info only
- Reduced token usage
- Quick reference format
- Quality indicators
- Cross-pass join keys

**Usage:** Future Pass 2 implementation (token-optimized AI prompts)
**Status:** Created but not yet used in implementation

---

## Schema Organization by Pass

### Pass 1 Entity Detection (7 tables)

**Pass-Specific Tables (2):**
```
pass1_entity_metrics.{md,json}       - Entity detection performance metrics
profile_classification_audit.{md,json} - Profile classification audit
```

**Multi-Pass Tables (5)** - stored in `pass-1-versions/` subdirectory:
```
ai_confidence_scoring.{md,json}      - Confidence scores (Pass 1 INSERT)
ai_processing_sessions.{md,json}     - Processing sessions (Pass 1 INSERT)
entity_processing_audit.{md,json}    - Entity audit (Pass 1 INSERT)
manual_review_queue.{md,json}        - Manual review (Pass 1 INSERT)
shell_files.{md,json}                - File status (Pass 1 UPDATE)
```

### Pass 2 Clinical Enrichment (18 tables)

**Pass-Specific Tables (13):**
```
pass2_clinical_metrics.{md,json}     - Clinical enrichment metrics
patient_conditions.{md,json}         - Medical diagnoses
patient_medications.{md,json}        - Medication records
patient_observations.{md,json}       - Lab results and assessments
patient_interventions.{md,json}      - Medical procedures
patient_allergies.{md,json}          - Allergy records
patient_immunizations.{md,json}      - Vaccination records
patient_vitals.{md,json}             - Vital signs
patient_clinical_events.{md,json}    - Clinical events
healthcare_encounters.{md,json}      - Healthcare visits
medical_code_assignments.{md,json}   - Medical coding
profile_appointments.{md,json}       - Appointments
user_profiles.{md,json}              - Profile enrichment
```

**Multi-Pass Tables (5)** - stored in `pass-2-versions/` subdirectory:
```
ai_confidence_scoring.{md,json}      - Confidence scores (Pass 2 UPDATE)
ai_processing_sessions.{md,json}     - Processing sessions (Pass 2 UPDATE)
entity_processing_audit.{md,json}    - Entity audit (Pass 2 UPDATE)
manual_review_queue.{md,json}        - Manual review (Pass 2 UPDATE)
shell_files.{md,json}                - File status (Pass 2 UPDATE)
```

### Pass 3 Semantic Narratives (Future)
Not yet created - planned for timeline generation and semantic relationships.

---

## Current Implementation Status

### Pass 1 (Entity Detection)
**Bridge Schemas:** ✅ Complete (7 schemas in all 3 formats)
**Implementation:** ✅ Complete - TypeScript in `apps/render-worker/src/pass1/`
**Schema Usage:**
- Source `.md` files: Used as reference documentation
- Detailed/Minimal `.json`: Created but NOT currently used
- Pass 1 uses hardcoded TypeScript for database record creation
- Does NOT send schemas to AI (just entity classification taxonomy)

### Pass 2 (Clinical Enrichment)
**Bridge Schemas:** ✅ Complete (18 schemas in all 3 formats)
**Implementation:** ⏳ Not yet started
**Planned Schema Usage:**
- Detailed `.json`: Send to AI in prompts for clinical data extraction
- Minimal `.json`: Token-optimized alternative for cost reduction
- AI will receive database schemas and return structured clinical data

### Pass 3 (Semantic Narratives)
**Bridge Schemas:** 🔲 Not yet created
**Implementation:** 🔲 Not yet started

---

## Key Architectural Patterns

### Multi-Pass Tables
Tables updated across multiple passes have separate schema versions:
- **Pass 1 version:** INSERT operations (create initial records)
- **Pass 2 version:** UPDATE operations (enrich with clinical data)
- **Pass 3 version:** UPDATE operations (add semantic relationships)

**Example:** `entity_processing_audit`
- Pass 1: Create entity record with detection metadata
- Pass 2: Update with clinical enrichment status
- Pass 3: Update with narrative relationships

### Cross-Pass Join Keys
All schemas reference these keys for cross-pass analytics:
- `processing_session_id` - Primary join key across all passes
- `profile_id` - Per-patient aggregation
- `shell_file_id` - Per-document tracking

### Required vs Optional Fields
Each schema clearly marks:
- **Required fields:** Must be populated by AI
- **Optional fields:** Populated when available
- **Confidence scores:** Always required for quality tracking

---

## Legacy Files (Archived)

The following TypeScript files in `bridge-schemas/` are **legacy examples only**:

```
entity_classifier.ts  - Example Pass 1 entity classifier (ARCHIVED)
schema_loader.ts      - Example schema loading utility (ARCHIVED)
usage_example.ts      - Example usage patterns (ARCHIVED)
```

**Note:** These are NOT used in current implementation. Actual Pass 1 implementation is in `apps/render-worker/src/pass1/`.

---

## Tests Directory

### `tests/schema_test_example.js`
Basic schema validation test

### `tests/token_analysis/`
Token usage analysis for schema optimization:
- `comprehensive_schema_analysis.js` - Full schema token analysis
- `medical_coding_standards_analysis.js` - Medical coding token analysis
- `optimized_coding_test.js` - Optimized schema testing
- `token_count_comparison.js` - Schema size comparison

### `tests/accuracy_comparison/medical_document_samples/`
Sample medical documents for testing extraction accuracy

---

## File Count Summary

```
Total Files: 75

Source Schemas:
├── Pass 1: 7 .md files (2 direct + 5 in pass-1-versions/)
└── Pass 2: 18 .md files (13 direct + 5 in pass-2-versions/)

Detailed JSON Schemas:
├── Pass 1: 7 .json files
└── Pass 2: 18 .json files

Minimal JSON Schemas:
├── Pass 1: 7 .json files
└── Pass 2: 18 .json files

Legacy TypeScript: 3 files (archived examples)
Test Files: 8 files
Documentation: 2 files (README.md, BRIDGE_SCHEMA_BUILD_PROCESS.md)
```

---

## Usage Workflow

### For Pass 1 (Current)
1. Read source `.md` files as reference
2. Use hardcoded TypeScript in `apps/render-worker/src/pass1/`
3. Schemas NOT sent to AI
4. AI returns entity classifications only
5. TypeScript code builds database records

### For Pass 2 (Future)
1. Load detailed or minimal `.json` schemas
2. Include schemas in AI prompts
3. AI extracts clinical data matching schema structure
4. Validate AI output against schema
5. Insert into database tables

### For Pass 3 (Planned)
1. Create Pass 3 source schemas
2. Generate detailed/minimal JSON versions
3. Implement semantic narrative extraction
4. Update multi-pass tables

---

## Quick Start

**If system crashes and needs context:**

1. **Read this README** - Understand three-tier system and current status
2. **Check implementation:**
   - Pass 1: `apps/render-worker/src/pass1/` (TypeScript implementation)
   - Pass 2: Not yet implemented
3. **Schema locations:**
   - Documentation: `bridge-schemas/source/pass-{1,2}/`
   - AI prompts (future): `bridge-schemas/{detailed,minimal}/pass-{1,2}/`
4. **Key insight:** Bridge schemas define database OUTPUT requirements, not AI INPUT (except Pass 2+)

---

**For detailed schema creation process, see:** `BRIDGE_SCHEMA_BUILD_PROCESS.md`
