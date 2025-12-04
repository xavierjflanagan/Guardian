# Pass 0.5 Implementation Plan

**Date:** October 28, 2025
**Status:** ✅ Phase 1 MVP IMPLEMENTED (2025-10-30)
**Phase:** Phase 1 MVP - Encounter Discovery Only
**Scope:** Task 1 only (skip batching - Task 2 deferred to Phase 2)

**Implementation Status:**
- ✅ Database migration executed (migration_history/2025-10-30_34_pass_0_5_infrastructure.sql)
- ✅ Worker implementation complete (apps/render-worker/src/pass05/)
- ✅ Source of truth schemas updated
- ⏳ Pass 1/2 integration pending
- ⏳ Testing with sample files pending

---

## Overview

This document provides technical implementation details for Pass 0.5 Intelligence Layer.

**What we're building:**
- Pass 0.5 worker function that extracts healthcare encounters from OCR text
- Fork logic: runs for all uploads, but skips batching analysis if <18 pages
- Database schema to store shell file manifests and encounter spatial data
- Pass 1/2 integration to consume pre-identified encounters

**What we're NOT building yet:**
- Batch boundary analysis (Task 2) - deferred to Phase 2
- Multi-batch processing - files ≥18 pages will fail gracefully
- Parallel execution infrastructure

---

## Architecture Flow

### Complete Flow

**Pass 0.5: Encounter Discovery**
```
Output:
- healthcare_encounters table: Full encounter records with IDs
- shell_file_manifests table: Lightweight encounter metadata
```

**Pass 1: Entity Detection**
```
Step 1: Load manifest (lightweight metadata)
  → manifest.encounters = [{ encounterId, type, dateRange, spatialRegions, ... }]

Step 2: Detect entities (AI analysis)
  → entities = [{ type, text, page, bbox, ... }]

Step 3: FUNCTIONAL bbox assignment (NO AI - post-processing)
  → For each entity: autoAssignEncounter(entity.bbox, manifest.encounters)
  → Result: entity.encounterId = "enc-uuid-123"

Step 4: Write to database WITH encounter_id
  → entity_processing_audit: { entity_id, encounter_id, ... }
```

**Pass 2: Clinical Enrichment**
```
Step 1: Load manifest (same lightweight metadata)
  → manifest.encounters = [{ encounterId, type, dateRange, ... }]

Step 2: Load Pass 1 entities from database
  → entities = [{ entity_id, type, text, encounter_id, ... }]
  → Entities ALREADY have encounter_id assigned

Step 3: For each entity, look up encounter context
  → encounterContext = manifest.encounters.find(enc => enc.encounterId === entity.encounter_id)

Step 4: Pass 2 AI prompt includes ALL encounters ONCE (not per entity)
  → Encounters listed at top of prompt
  → Entities reference encounter_id for context lookup
```

**Pass 4 (Phase 2): Master Encounter Grouping**
```
Step 1: Scan healthcare_encounters for duplicate detection
  → Find encounters with matching: date, type, facility/provider

Step 2: Group duplicates using Union-Find algorithm
  → Handles N-way matching (3, 4, 5+ documents about same encounter)

Step 3: Assign master_encounter_id to grouped encounters
  → Non-destructive grouping (original IDs preserved)

Step 4: Frontend displays consolidated view
  → Shows single encounter with "X documents" badge
  → All entities from all grouped encounters displayed together
```

### Flow Diagram

```
Pass 0.5:
  ├─→ Creates encounters in database (full details)
  └─→ Creates manifest (lightweight metadata with IDs + spatial regions)

Pass 1:
  ├─→ Loads manifest (lightweight)
  ├─→ Detects entities (AI vision analysis)
  ├─→ Auto-assigns encounter_id (functional bbox → manifest spatial regions)
  └─→ Writes entities WITH encounter_id to database

Pass 2:
  ├─→ Loads manifest (lightweight)
  ├─→ Loads Pass 1 entities (already have encounter_id)
  ├─→ Builds AI prompt: Encounters listed ONCE at top
  ├─→ For each entity: lookup encounter_id in manifest → get context
  └─→ Enriches entity using encounter context (AI)

Pass 4 (Phase 2 - Deduplication):
  ├─→ Scans all patient encounters for duplicates
  ├─→ Groups matching encounters (exact date + type + facility)
  ├─→ Assigns master_encounter_id to grouped encounters
  └─→ Frontend shows consolidated view (one encounter per group)
```

### Key Architectural Decisions

**1. Functional Assignment (Not AI)**
- Encounter assignment uses geometric containment (IoU overlap)
- No AI tokens spent on assignment
- Fast, deterministic, auditable

**2. Manifest = Lookup Table**
- Lightweight encounter metadata with IDs
- Not full encounter details (stay in database)
- Pass 1/2 use for reference only

**3. Encounters Listed Once in Pass 2 Prompt**
- All encounters for file listed at top of prompt
- Entities reference encounter_id
- Saves tokens vs repeating encounter context per entity

---

## Database Schema

### 1. New Table: shell_file_manifests

**Purpose:** Store Pass 0.5 analysis output (encounter metadata, structural analysis)

```sql
CREATE TABLE shell_file_manifests (
  -- Primary key
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Manifest metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pass_0_5_version TEXT NOT NULL DEFAULT '1.0.0',
  processing_time_ms INTEGER,

  -- File analysis
  total_pages INTEGER NOT NULL,
  total_encounters_found INTEGER NOT NULL,
  ocr_average_confidence NUMERIC(3,2),  -- 0.00-1.00

  -- Batching metadata (NULL for Phase 1 MVP)
  batching_required BOOLEAN NOT NULL DEFAULT FALSE,
  batch_count INTEGER DEFAULT 1,

  -- Manifest content (JSONB)
  manifest_data JSONB NOT NULL,
  -- Structure:
  -- {
  --   "encounters": [
  --     {
  --       "encounterId": "uuid",
  --       "encounterType": "inpatient",
  --       "isRealWorldVisit": true,
  --       "dateRange": { "start": "2024-03-10", "end": "2024-03-15" },
  --       "provider": "Dr Smith",
  --       "facility": "St Vincent's Hospital",
  --       "pageRanges": [[1, 10], [15, 18]],
  --       "spatialBounds": [
  --         { "page": 1, "boundingBox": { "vertices": [...] } }
  --       ]
  --     }
  --   ],
  --   "batches": null  // Phase 1: always null
  -- }

  -- Audit
  ai_model_used TEXT NOT NULL,  -- 'gpt-4o-mini'
  ai_cost_usd NUMERIC(10,6),

  UNIQUE(shell_file_id)
);

CREATE INDEX idx_manifests_shell_file ON shell_file_manifests(shell_file_id);
CREATE INDEX idx_manifests_patient ON shell_file_manifests(patient_id);
CREATE INDEX idx_manifests_created ON shell_file_manifests(created_at);
```

---

### 2. Update Table: healthcare_encounters

**Purpose:** Add spatial and provenance fields for Pass 0.5 encounter data

```sql
-- Migration: Add Pass 0.5 fields to healthcare_encounters
ALTER TABLE healthcare_encounters
  -- Spatial data
  ADD COLUMN page_ranges INT[][] DEFAULT '{}',  -- [[1,5], [10,12]] for non-contiguous
  ADD COLUMN spatial_bounds JSONB,  -- Array of {page, boundingBox}
  -- Structure:
  -- [
  --   { "page": 1, "boundingBox": { "vertices": [{x, y}, {x, y}, {x, y}, {x, y}] } },
  --   { "page": 2, "boundingBox": { "vertices": [...] } }
  -- ]

  -- Provenance
  ADD COLUMN identified_in_pass TEXT DEFAULT 'pass_2',  -- 'pass_0_5' or 'pass_2'
  ADD COLUMN is_real_world_visit BOOLEAN DEFAULT TRUE,

  -- Pass 0.5 metadata
  ADD COLUMN pass_0_5_confidence NUMERIC(3,2),  -- AI confidence in encounter extraction
  ADD COLUMN ocr_average_confidence NUMERIC(3,2);  -- Average OCR confidence for pages

-- Index for Pass 0.5 queries
CREATE INDEX idx_encounters_identified_in_pass ON healthcare_encounters(identified_in_pass);
CREATE INDEX idx_encounters_real_world ON healthcare_encounters(is_real_world_visit);

-- Add constraint: page_ranges required if identified_in_pass = 'pass_0_5'
ALTER TABLE healthcare_encounters
  ADD CONSTRAINT check_pass_0_5_page_ranges
  CHECK (
    identified_in_pass != 'pass_0_5' OR
    (page_ranges IS NOT NULL AND array_length(page_ranges, 1) > 0)
  );
```

---

### 3. Update Table: shell_files

**Purpose:** Add Pass 0.5 processing flag

```sql
-- Migration: Add Pass 0.5 metadata to shell_files
ALTER TABLE shell_files
  ADD COLUMN pass_0_5_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN pass_0_5_completed_at TIMESTAMPTZ,
  ADD COLUMN pass_0_5_error TEXT;  -- Error message if Pass 0.5 failed

CREATE INDEX idx_shell_files_pass_0_5_completed ON shell_files(pass_0_5_completed);
```

---

### 4. New Table: pass05_encounter_metrics

**Purpose:** Session-level performance and cost tracking for Pass 0.5 execution

**Why not use Pass 1's monitoring infrastructure?**
Pass 1 has 6 monitoring tables because it outputs 40-100 safety-critical entities per file requiring per-entity audit trails, multi-dimensional confidence scoring, and manual review queues. Pass 0.5 outputs only 1-3 low-risk structural encounters per file, making session-level metrics sufficient. The encounters themselves are already fully tracked in `healthcare_encounters` + `shell_file_manifests`.

```sql
-- Migration: Add Pass 0.5 performance metrics table
CREATE TABLE pass05_encounter_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

  -- Pass 0.5 Specific Metrics
  encounters_detected INTEGER NOT NULL,          -- 1-3 typically
  real_world_encounters INTEGER NOT NULL,        -- vs pseudo-encounters
  pseudo_encounters INTEGER NOT NULL,

  -- Performance
  processing_time_ms INTEGER NOT NULL,
  processing_time_seconds NUMERIC(10,2) GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 1000.0, 2)) STORED,

  -- AI Model Info
  ai_model_used TEXT NOT NULL,                   -- 'gpt-4o-mini'

  -- Token Breakdown (for cost calculation)
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- Quality Metrics
  ocr_average_confidence NUMERIC(3,2),           -- 0.00-1.00
  encounter_confidence_average NUMERIC(3,2),     -- Average across all encounters
  encounter_types_found TEXT[],                  -- ['inpatient', 'pseudo_medication_list']

  -- Page Analysis
  total_pages INTEGER NOT NULL,
  pages_per_encounter NUMERIC(5,2),              -- Average pages per encounter

  -- Batching Metadata (Phase 1: always FALSE, Phase 2: populated)
  batching_required BOOLEAN NOT NULL DEFAULT FALSE,
  batch_count INTEGER DEFAULT 1,

  -- Compliance Audit Trail
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pass05_metrics_shell_file ON pass05_encounter_metrics(shell_file_id);
CREATE INDEX idx_pass05_metrics_session ON pass05_encounter_metrics(processing_session_id);
CREATE INDEX idx_pass05_metrics_created ON pass05_encounter_metrics(created_at);
```

---

## Implementation Files

All implementation code has been completed and is available in the following locations:

### Database Migration

**File:** `shared/docs/architecture/database-foundation-v3/migration_history/2025-10-30_34_pass_0_5_infrastructure.sql`

**Executed:** 2025-10-30

**Changes:**
- Created `shell_file_manifests` table (encounter discovery output)
- Created `pass05_encounter_metrics` table (performance tracking)
- Added 11 columns to `healthcare_encounters` (Pass 0.5 fields + Phase 2 master_encounter_id)
- Added 3 columns to `shell_files` (pass_0_5_completed tracking)
- Added 4 columns to `entity_processing_audit` (encounter assignment tracking)
- Created 12 new indexes
- Enabled RLS on shell_file_manifests

**Source of Truth Updated:**
- `current_schema/03_clinical_core.sql`
- `current_schema/04_ai_processing.sql`
- `current_schema/08_job_coordination.sql`

### Worker Implementation

**Location:** `apps/render-worker/src/pass05/`

**Files:**

1. **`types.ts`** - TypeScript interfaces
   - `ShellFileManifest` - Pass 0.5 output structure
   - `EncounterMetadata` - Individual encounter data
   - `SpatialBound` - Bounding box data for functional assignment
   - `Pass05Input/Output` - Function signatures
   - `GoogleCloudVisionOCR` - OCR data structures

2. **`aiPrompts.ts`** - AI Prompt with Timeline Test
   - `buildEncounterDiscoveryPrompt()` - Generates GPT-4o-mini prompt
   - **Timeline Test Rules:**
     - Real-world: date AND (provider OR facility)
     - Planned: future appointment with date + provider/facility
     - Pseudo: missing date/provider/facility OR administrative docs
   - Non-overlapping page range constraints
   - Confidence scoring guidelines

3. **`encounterDiscovery.ts`** - OpenAI API Integration
   - `discoverEncounters()` - Main encounter extraction function
   - Uses GPT-4o-mini (text-only, not vision)
   - Temperature 0.1 for consistency
   - JSON response format
   - Cost calculation: $0.15/$0.60 per 1M tokens

4. **`manifestBuilder.ts`** - Response Parser & Validator
   - `parseEncounterResponse()` - Validates AI output
   - Validates non-overlapping page ranges (throws error if violated)
   - Creates encounters in database (UPSERT for idempotency)
   - Extracts spatial bounds from OCR pages
   - Returns enriched encounter metadata with database UUIDs

5. **`databaseWriter.ts`** - Database Persistence
   - `writeManifestToDatabase()` - Atomic write operations
   - Inserts to `shell_file_manifests`
   - Upserts to `pass05_encounter_metrics` (by processing_session_id)
   - Updates `shell_files.pass_0_5_completed`
   - Logs metrics (encounters found, tokens used, cost)

6. **`index.ts`** - Main Orchestrator
   - `runPass05()` - Entry point function
   - Idempotency check (returns existing manifest if found)
   - Phase 1 MVP page limit (max 17 pages, fails gracefully for ≥18)
   - Coordinates: discovery → parsing → validation → database write
   - Returns `Pass05Output` with success/error and metrics

### Implementation Architecture

```
runPass05(input) Flow:
├─→ 1. Check idempotency (return if already processed)
├─→ 2. Validate page count (<18 for Phase 1)
├─→ 3. discoverEncounters()
│   ├─→ Build prompt with Timeline Test rules
│   ├─→ Call GPT-4o-mini (text analysis)
│   └─→ Return AI response + token usage
├─→ 4. parseEncounterResponse()
│   ├─→ Validate non-overlapping pages
│   ├─→ Create encounters in DB (get UUIDs)
│   ├─→ Extract spatial bounds from OCR
│   └─→ Return EncounterMetadata[]
├─→ 5. Build ShellFileManifest
├─→ 6. writeManifestToDatabase()
│   ├─→ Insert manifest
│   ├─→ Upsert metrics
│   └─→ Update shell_files completion status
└─→ 7. Return Pass05Output (success + metrics)
```

### Key Design Decisions

**Timeline Test (Real-World Encounter Criteria):**
- Original proposal: date AND provider AND facility (too strict)
- **Final decision**: date AND (provider OR facility) - loosened
- Rationale: Many valid encounters have location OR provider, not both
- Examples:
  - ✅ "ED visit 2024-03-10" (date + clinical setting)
  - ✅ "GP visit with Dr. Smith 2024-01-15" (date + provider)
  - ❌ "Recent hospital admission" (vague date → pseudo-encounter)

**Planned Encounters:**
- Future appointments with specific date + provider/facility
- `isRealWorldVisit: false` (hasn't happened yet)
- Enables referral tracking and appointment scheduling features

**Pseudo-Encounters:**
- Documents without timeline-worthy context
- Missing date OR missing provider/facility
- Administrative documents, standalone lists
- Types: medication lists, insurance cards, lab reports without visit context

**Non-Overlapping Pages (Phase 1 Requirement):**
- Each page belongs to exactly ONE encounter
- If page has content from multiple encounters, AI chooses dominant encounter
- Validation enforced in `validateNonOverlappingPageRanges()`
- Throws error if violation detected (AI must retry)

**Idempotency Strategy:**
- Manifest check: Return existing if `shell_file_manifests.shell_file_id` exists
- Encounter creation: UPSERT on unique constraint (patient + shell_file + type + date + page_ranges)
- Metrics: UPSERT on `processing_session_id` (one record per session)

**Phase 2: Master Encounter Grouping:**
- Infrastructure fields added in migration: `master_encounter_id`, `master_encounter_confidence`, `all_shell_file_ids`
- Algorithm: Union-Find for N-way matching (handles 2, 3, 5+ documents)
- Criteria: EXACT match on date + type + (facility OR provider)
- Non-destructive: Original encounter IDs preserved
- Implementation deferred to Phase 2

**For full implementation details, see:**
- TypeScript types: `apps/render-worker/src/pass05/types.ts`
- AI prompts: `apps/render-worker/src/pass05/aiPrompts.ts`
- Worker functions: `apps/render-worker/src/pass05/index.ts`, `encounterDiscovery.ts`, `manifestBuilder.ts`, `databaseWriter.ts`
- Database migration: `migration_history/2025-10-30_34_pass_0_5_infrastructure.sql`
- Source of truth schemas: `current_schema/03_clinical_core.sql`, `04_ai_processing.sql`, `08_job_coordination.sql`

---

## Success Metrics

**Phase 1 MVP (Encounter Discovery Only):**

- **Encounter Detection Accuracy:** >95% (manual review of 100 test files)
- **Processing Time:** <5 seconds per file (<18 pages)
- **Cost:** <$0.05 per file (OCR + Pass 0.5 combined)
- **Pass 1 Improvement:** +10-15% entity classification accuracy (with encounter context)
- **Pass 2 Speed:** 30-40% faster (skip Step 0 encounter extraction)
- **Encounter Duplication (Phase 1):** <10% duplicate encounter IDs (acceptable for MVP)

**Phase 2 (With Master Encounter Grouping):**

- **Encounter Duplication (Phase 2):** <1% ungrouped duplicates (after master_encounter_id assignment)
- **Grouping Accuracy:** >98% correct groupings (false positives <2%)
- **Deduplication Speed:** <500ms per patient (nightly batch processing)

---

## Phase 2 Enhancements (Future)

**Not included in Phase 1 MVP - defer until after production validation:**

### 1. OCR Confidence Gating
- **Goal:** Improve safety for low-quality OCR (handwritten notes, poor scans)
- **Implementation:** Skip functional encounter assignment if entity OCR confidence < threshold (e.g., 0.6)
- **Behavior:** Flag low-confidence entities for manual review or AI-based assignment
- **Rationale:** Prevents incorrect auto-assignment of critical data (prescriptions, dosages)

### 2. Advanced Spatial Bounds
- **Current:** Entire page bounding boxes (Phase 1)
- **Future:** Union of OCR blocks/paragraphs spanning encounter content
- **Benefit:** Tighter spatial regions for better multi-encounter page handling
- **Trade-off:** More complex bbox derivation, higher compute cost

### 3. Performance Optimization
- **GIN Index on JSONB:** If querying specific encounter fields from `manifest_data` becomes common:
  ```sql
  CREATE INDEX idx_manifests_data_gin ON shell_file_manifests USING GIN (manifest_data);
  ```
- **Model Configuration:** Runtime config file for model selection, pricing caps, and fallback models
- **Batch Processing:** Parallel encounter creation for large files (when batching implemented)

### 4. Enhanced Telemetry
- **Per-file metrics:** Input/output tokens, model latency, OCR confidence distribution
- **Assignment analytics:** Coverage rate, ambiguity rate (multiple encounters matched), fallback usage
- **Feature flags:** Enable/disable bbox assignment, region pruning, confidence gating

### 5. Idempotency Improvements
- **Current:** Manifest-level idempotency check (Phase 1) ✅
- **Future:** Transaction wrapper for atomic encounter + manifest creation
- **Benefit:** Cleaner rollback on partial failures

### 6. Master Encounter Grouping (Deduplication)
- **Goal:** Group multiple documents about the same healthcare encounter
- **Problem:** Same admission uploaded in different documents creates duplicate encounter IDs
- **Solution:** Post-pipeline process assigns master_encounter_id to group related encounters
- **Algorithm:** N-way matching using Union-Find for transitive grouping (handles 2, 3, 5+ documents)
- **Criteria:** Exact match on date + type + (facility OR provider) - no fuzzy matching
- **Safety:** Non-destructive (original IDs preserved), reversible, confidence-based
- **Frontend:** Shows grouped view with "X documents" badges
- **Implementation:** See "Encounter Deduplication Algorithm" section above

---

## Next Steps

**Phase 1 MVP:**
1. ✅ **Create database migration** (shell_file_manifests, healthcare_encounters updates, master_encounter_id fields) - COMPLETED 2025-10-30
2. ✅ **Implement Pass 0.5 worker function** (encounterDiscovery.ts) - COMPLETED 2025-10-30
3. ✅ **Write AI prompt** (aiPrompts.ts with Timeline Test guardrails) - COMPLETED 2025-10-30
4. **Test with sample files** (1-page, 5-page, 10-page, 18-page edge case)
5. **Integrate with Pass 1** (load manifest, assign encounters)
6. **Integrate with Pass 2** (skip Step 0, use pre-created encounters)
7. **Deploy to staging** (test with real uploads)

**Phase 2 (Deduplication):**
8. **Implement master encounter grouping** (assignMasterEncounterIds function with Union-Find algorithm)
9. **Add deduplication to pipeline** (run after Pass 3 or as nightly batch)
10. **Update frontend queries** (group by master_encounter_id, show document counts)
11. **Test N-way grouping** (verify 3, 4, 5+ document scenarios)
12. **Manual review queue** (for confidence scores 0.80-0.95)

---

**Document Status:** IMPLEMENTATION IN PROGRESS
**Phase:** Phase 1 MVP - Encounter Discovery Only
**Completed:** Database migration, worker implementation, AI prompts (2025-10-30)
**Next:** Test with sample files, then integrate with Pass 1 and Pass 2
