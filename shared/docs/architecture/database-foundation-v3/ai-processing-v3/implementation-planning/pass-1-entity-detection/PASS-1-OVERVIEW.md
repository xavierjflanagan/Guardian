# Pass 1 Entity Detection - Architectural Overview

**Status:** ✅ OPERATIONAL (Mid October 2025)
**Location:** `apps/render-worker/src/pass1/` (3,116 lines TypeScript, 8 files)
**Last Updated:** October 13, 2025

---

## What is Pass 1?

Pass 1 is the **entity detection and classification** stage of Exora's three-pass AI processing pipeline for medical documents. It serves as the foundation that enables intelligent, targeted processing in subsequent passes.

**The Three-Pass Pipeline:**
1. **Pass 1 (Entity Detection)** - Identify and classify every piece of information in a medical document
2. **Pass 2 (Clinical Extraction)** - Extract structured clinical data from Pass 1 entities (schema designed, not yet implemented)
3. **Pass 3 (Narrative Generation)** - Generate patient-friendly healthcare 'journeys' (planned)

Pass 1's responsibility is to detect ALL entities in a document and classify them using the 3-Category Classification System, determining which entities require full medical analysis (Pass 2) versus simple logging (document structure).

---

## Three-Category Classification System

Pass 1 classifies every detected entity into one of 3 categories, each with different processing requirements:

### Category 1: Clinical Events (Full Pass 2 Enrichment)
**11 subtypes requiring medical analysis:**
- `vital_sign`, `lab_result`, `physical_finding`, `symptom`
- `medication`, `procedure`, `immunization`
- `diagnosis`, `allergy`, `healthcare_encounter`, `clinical_other`

**Pass 2 Action:** Full medical enrichment + timeline integration + schema population

### Category 2: Healthcare Context (Limited Pass 2 Enrichment)
**10 subtypes requiring profile/context matching:**
- `patient_identifier`, `provider_identifier`, `facility_identifier`
- `appointment`, `referral`, `care_coordination`
- `insurance_information`, `billing_code`, `authorization`, `healthcare_context_other`

**Pass 2 Action:** Profile matching + contextual schemas + compliance tracking

### Category 3: Document Structure (Logging Only)
**8 subtypes that skip Pass 2:**
- `header`, `footer`, `logo`, `page_marker`
- `signature_line`, `watermark`, `form_structure`, `document_structure_other`

**Pass 2 Action:** None - logged for completeness only

**For complete taxonomy:** See `apps/render-worker/src/pass1/pass1-types.ts` (EntityCategory, EntitySubtype types)

---

## Processing Flow

### 1. Input Preparation
- **Raw file:** Document image/PDF (base64-encoded)
- **OCR data:** Google Cloud Vision spatial mapping for coordinates
- **Metadata:** Patient ID, shell file ID, processing session ID

### 2. AI Entity Detection
- **Model:** Currently GPT-5 Mini (OpenAI GPT-5 Mini - latest version as of Oct 2025)
- **Prompt:** Dual-input (OCR output + raw file) classification prompt with complete taxonomy
- **Cross-validation:** AI vision interpretation vs OCR text comparison
- **Output:** JSON with detected entities, confidence scores, quality metrics

### 3. Translation & Schema Assignment
- **Translation:** AI response → database format (see `pass1-translation.ts`)
- **Schema mapping:** Automatic assignment of required Pass 2 schemas (see `pass1-schema-mapping.ts`)
- **Quality indicators:** Confidence scoring, manual review flagging

### 4. Database Writes (7 Tables)
Pass 1 writes to **7 tables** via `pass1-database-builder.ts`:

1. **`ai_processing_sessions`** - Session coordination record (INSERT)
2. **`entity_processing_audit`** - All detected entities with metadata (bulk INSERT)
3. **`shell_files`** - Processing status update (UPDATE)
4. **`profile_classification_audit`** - Patient safety validation (INSERT)
5. **`pass1_entity_metrics`** - Performance and quality metrics (INSERT)
6. **`ai_confidence_scoring`** - Confidence tracking for low-confidence entities (conditional INSERT)
7. **`manual_review_queue`** - Low-confidence entities flagged for review (conditional INSERT)

**Note:** `job_queue` table is NOT counted in this list because it's infrastructure managed by Edge Functions and RPC functions (`enqueue_job_v3`, `claim_next_job_v3`, `complete_job`). Pass 1 reads from job_queue but never directly INSERTs to it.

### 5. Pass 2 Queue
Entities with `pass2_status = 'pending'` (clinical + healthcare context categories) are queued for Pass 2 enrichment.

**For complete flow:** See `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (`processDocument()` method)

---

## Production Metrics (Mid October 2025)

**Based on actual production data from test-10 (October 12, 2025):**

- **Cost per document:** ~$0.032 USD (weighted average across 10 runs)
  - Input tokens: ~11,344 average per run
  - Output tokens: ~14,077-16,596 average per run
  - Total tokens: ~23,000-28,000 per 1-page document
  - **Source:** [openai-usage-and-cost-report-2025-10-12.md](./pass1-hypothesis-tests-results/openai-usage-and-cost-report-2025-10-12.md)
- **Processing time:** 3-4 minutes (Pass 1 AI entity detection), 6-8 minutes total (end-to-end including OCR, database writes, and job coordination)
- **AI model:** GPT-5 Mini (gpt-5-mini-2025-08-07)
  - Input pricing: $0.25 per 1M tokens
  - Output pricing: $2.00 per 1M tokens
- **OCR provider:** Google Cloud Vision
- **Code size:** 3,116 lines TypeScript across 8 files
- **Quality:** 92-95% average confidence, 95-100% AI-OCR agreement

**Historical context:** Pre-Pass-1 system used AWS Textract at ~$2-3 per document (85-90% cost reduction achieved)

**For detailed cost breakdown:** See [test-10-migration-22-23-database-schema-validation.md](./pass1-hypothesis-tests-results/test-10-migration-22-23-database-schema-validation.md)

---

## Key Implementation Files

### Files Sent to AI Model

**AI Processing (GPT-5 Mini receives data from these):**
- `pass1-prompts.ts` - System message and classification prompt (actual text sent to AI)
- `pass1-types.ts` - Defines expected JSON response structure (AI must match this format)

**What AI receives:** Raw document image (base64) + OCR text + OCR spatial mapping (bounding boxes)

**What AI returns:** JSON with detected entities, confidence scores, quality metrics

### Files for AI Response Processing

**Core Detection:**
- `Pass1EntityDetector.ts` - Main detection class (24,665 bytes)
  - Constructs OpenAI API call with prompt
  - Validates AI response structure
  - Returns `Pass1ProcessingResult`
- `pass1-prompts.ts` - AI prompt templates (12,618 bytes)
- `pass1-types.ts` - TypeScript interfaces (14,746 bytes)

**Data Processing:**
- `pass1-translation.ts` - AI → database translation (17,532 bytes)
  - Transforms AI JSON response to database format
  - Applies safety guards and defaults
- `pass1-schema-mapping.ts` - Entity → schema mappings (9,982 bytes)
  - Determines which Pass 2 schemas each entity needs
  - Assigns processing priority
- `pass1-database-builder.ts` - 7-table record builder (15,393 bytes)
  - Builds records for all 7 database tables
  - Returns complete `Pass1DatabaseRecords` object

### Worker Infrastructure Files (NOT sent to AI)

**Integration:**
- `index.ts` - Public exports (1,659 bytes)
  - Exports `Pass1EntityDetector` class
  - Exports all Pass 1 types (TypeScript type checking)
  - Exports helper functions (schema mapping, translation, prompts)
  - **Purpose:** Clean module interface for other code to import Pass 1 functionality
- `worker.ts` - Job queue coordination (1,047 lines)
  - Claims jobs from `job_queue` using `claim_next_job_v3()` RPC
  - Downloads files from Supabase Storage
  - Runs OCR (Google Cloud Vision)
  - Calls Pass 1 Entity Detector
  - Inserts Pass 1 results into 7 database tables
  - Updates job heartbeat
  - Completes/fails jobs
  - **Purpose:** Background worker that orchestrates the entire Pass 1 pipeline

**Total:** 3,116 lines across 8 TypeScript files + tests

### Visual Flow: Which Files Do What

```
worker.ts (Job Coordination)
  ↓
  1. Claims job from job_queue (claim_next_job_v3 RPC)
  2. Downloads file from Supabase Storage
  3. Runs Google Cloud Vision OCR
  ↓
Pass1EntityDetector.ts (AI Processing)
  ↓ Uses prompts from →  pass1-prompts.ts (sent to GPT-5 Mini)
  ↓ AI returns JSON →    pass1-types.ts (validates structure)
  ↓
pass1-translation.ts (AI → Database Format)
  ↓
pass1-schema-mapping.ts (Assign Required Schemas)
  ↓
pass1-database-builder.ts (Build 7 Table Records)
  ↓
worker.ts (Database Writes)
  ↓
  Inserts into 7 tables:
  - ai_processing_sessions
  - entity_processing_audit (bulk)
  - shell_files (UPDATE)
  - profile_classification_audit
  - pass1_entity_metrics
  - ai_confidence_scoring (conditional)
  - manual_review_queue (conditional)
  ↓
worker.ts completes job (complete_job RPC)
  ↓
job_queue updated (infrastructure - not written by Pass 1)
```

**Key takeaway:** `index.ts` exports everything cleanly, `worker.ts` orchestrates the pipeline, and the core Pass 1 files handle AI processing and database writes.

---

## Recent Improvements (October 2025)

### Database Schema Optimizations
- **Migration 15:** Token breakdown for accurate cost calculation (removed redundant vision_tokens_used)
- **Migration 16-17:** Removed 5 redundant columns from entity_processing_audit (pass1_model_used, pass1_vision_processing, pass1_token_usage, pass1_image_tokens, pass1_cost_estimate) - use JOINs to pass1_entity_metrics instead
- **Migration 22:** Job queue observability (heartbeat_at clearing, actual_duration auto-calculation)
- **Migration 23:** Renamed ai_model_version → ai_model_name for semantic clarity

### Worker Data Quality Enhancements
1. **Worker ID Configuration:** Fixed worker_id population in job_queue
2. **Safety Flags Validation:** Confirmed flag extraction working correctly (false positive in audit)
3. **Job Coordination:** Validated shell_files linkage to job_queue
4. **Manual Review Titles:** Improved review_title generation logic
5. **Duration Calculations:** Validated processing_duration_seconds accuracy


---

## Architecture Decisions

### Why Dual-Input Processing?
Pass 1 uses BOTH raw document images (for AI vision) AND OCR spatial data (for coordinates):
- **AI vision** provides superior medical context interpretation (formatting, layout, clinical meaning)
- **OCR spatial data** provides precise bounding box coordinates for click-to-zoom functionality
- **Cross-validation** enables AI-OCR agreement scoring and discrepancy detection

### Why Three Categories?
Separating entities into clinical/context/structure categories enables:
- **Targeted processing:** Only clinical events receive costly medical analysis and data enrichment (tailored bridge schemas + shortlisted medical codes (pass 1.5), prepared for pass 2 that are specicic to the identified/extracted clincial event).
- **Profile safety:** Healthcare context enables patient identity validation
- **Complete coverage:** Document structure logged but doesn't inflate Pass 2 workload

### Why Schema Mapping in Pass 1?
Pass 1 determines which database schemas each entity requires (e.g., `vital_sign` → `patient_clinical_events`, `patient_observations`, `patient_vitals`). This enables:
- **Pass 2 optimization:** Load only required schemas and matching medical codes, per entity.
- **Database efficiency:** Targeted INSERT operations instead of full-table scans
- **Clear separation:** Pass 1 = detection, Pass 2 = enrichment

---

## Integration with 3-Pass AI Pipeline

### Pass 1 → Pass 2 Handoff
**What Pass 1 Provides:**
- Detected entities with categories and subtypes
- Required schema mappings for each entity
- Indirect provision of shortlisted vector-embedding-matched medical codes (performed by pass 1.5)
- Confidence scores and quality indicators
- Spatial coordinates for click-to-zoom
- Manual review flags for low-confidence entities

**What Pass 2 Will Use:**
- Filter: `WHERE pass2_status = 'pending'` (clinical + healthcare context only)
- Load schemas: Based on `requires_schemas` array from Pass 1
- Processing priority: Use Pass 1's `processing_priority` field
- Quality context: Use confidence scores to adjust processing strategy

**Pass 2 Status:** Schema designed, implementation pending (see [Pass 2 bridge schemas](../bridge-schema-architecture/bridge-schemas/source/pass-2/))

### Pass 2 → Pass 3 Handoff
**Pass 3 (Narrative Generation):** Planned and designed, but not yet published. Will use structured clinical data from Pass 2 to generate patient-friendly medical summaries.

---

## Current TODO Items

### Critical Tasks (Deferred until after Pass 2)
Per [pass1-audits/README.md](./pass1-audits/README.md):

1. **Profile Classification Implementation** (2-3 days)
   - Currently hardcoded to 'self' profile type
   - Need AI-powered profile matching logic
   - Multi-child profile scenario handling

2. **ai_confidence_scoring Rewrite** (1-2 days)
   - Worker INSERT failing due to schema mismatch
   - Need to rewrite buildAIConfidenceScoringRecords()
   - Fix field name mismatches (11 columns → 24 columns expected)

**Decision:** Both tasks deferred until Pass 2 is operational (user decision, October 13, 2025)

### Completed (October Weeks 1 & 2, 2025)
- ✅ All 11 critical issues from Oct 3 code review resolved (9 fully fixed, 1 partial, 1 intentional deferral)
- ✅ Database schema optimizations (Migrations 15-17, 22-23)
- ✅ Worker data quality enhancements (5 improvements validated)
- ✅ Cost calculation fixes (5.46× reduction)
- ✅ Flag extraction validation (confirmed working, false positive)

---

## For More Detail

**Database Audits & Improvements:**
- [pass1-audits/README.md](./pass1-audits/README.md) - Current TODO items, audit findings
- [pass1-audits/pass1-audit-consolidated-fixes.md](./pass1-audits/pass1-audit-consolidated-fixes.md) - Complete implementation tracking

**Implementation History:**
- [archive/](./archive/) - Pre-implementation planning docs (Oct 3, 2025)
- [archive/CLAUDE-CODE-REVIEW-RESPONSE-2025-10-03.md](./archive/CLAUDE-CODE-REVIEW-RESPONSE-2025-10-03.md) - Independent verification of code review findings

**Enhancement Tracking:**
- [enhancements/](./enhancements/) - Worker data quality improvements and validation tests

**Production Validation:**
- [pass1-hypothesis-tests-results/](./pass1-hypothesis-tests-results/) - Test results, cost reports, migration validations

**TypeScript Source (Production Code):**
- `apps/render-worker/src/pass1/` - All 8 implementation files
- See individual file links above for specific functionality

---

**Last Updated:** October 13, 2025
**Document Type:** Architectural overview with links to source code
**Maintenance:** Update metrics and TODO section as system evolves
