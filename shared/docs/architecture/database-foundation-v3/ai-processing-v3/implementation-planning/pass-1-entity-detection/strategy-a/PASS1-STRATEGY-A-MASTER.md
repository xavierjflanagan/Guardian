# Pass 1 Strategy-A Master Design & Implementation

**Created:** 2025-11-28
**Status:** Implementation Phase - Phase 0 Complete, Phase 1 Ready
**Owner:** Xavier Flanagan
**Last Updated:** 2025-11-29

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Prerequisites | COMPLETE | 6/6 tasks - safe-split infrastructure |
| Phase 1: Database Setup | COMPLETE | 12/12 tasks - Migration 71 |
| Phase 2: Core Implementation | COMPLETE | 8 files, 3141 lines - pass1-v2 module |
| Phase 3: Worker Integration | COMPLETE | ~360 lines removed, simplified to ~50 lines |
| Phase 4: Testing | Not Started | |
| Phase 5: Cleanup | Not Started | |

**Latest Updates (2025-11-29):**
- **Phase 3: Worker Integration COMPLETE**
  - Replaced legacy pass1 imports with pass1-v2 module
  - Removed env flags (ENABLE_PASS1, PASS1_OCR_ONLY) - Pass 1 always enabled
  - Replaced Pass1EntityDetector with Pass1Detector (createPass1Detector factory)
  - Deleted ~360 lines of legacy Pass 1 code (vision mode, 7-table inserts)
  - New runPass1() is ~50 lines - calls Pass1Detector.processShellFile()
  - worker.ts version bumped to 2.1
- **Phase 2: Core Implementation COMPLETE**
  - 8 files in `apps/render-worker/src/pass1-v2/` (3141 lines)
- Phase 0-1: safe-split infrastructure, Migration 71

---

## 1. Vision & Design Summary

Pass 1 Strategy-A transforms entity detection from a heavy vision-based system (~22,000 output tokens) into a lightweight OCR-only classifier (~2,700-3,800 output tokens).

### Core Principles

1. **Encounter-Centric Processing**: Pass 1 receives ONE complete post-reconciled `healthcare_encounter` per API call (from Pass 0.5). Not chunks, not pending encounters.

2. **Minimal Output Schema**: Only fields needed for Pass 1.5 (code shortlisting) and Pass 2 (enrichment):
   - Entity identification: `original_text`, `entity_type`, `aliases[]`
   - Spatial: `y_coordinate`, `page_number`
   - Bridge schema zone: `schema_type`, `y_range_start`, `y_range_end`

   Note: `entity_type` maps directly to `universal_medical_codes.entity_type` for Pass 1.5 filtering. No separate category/subtype needed. No confidence score - quality signal comes from Pass 1.5 similarity scores and Pass 2 validation.

3. **Bridge Schema Zone Detection**: Pass 1 identifies Y-coordinate regions for each bridge schema type, enabling Pass 2 to receive relevant schemas as context. Zones may overlap (e.g., side-by-side medication and conditions lists share the same Y-range) - each schema type gets its own zone record. Pass 2 uses zones as hints, not rigid routing.

4. **Safe-Split Batching**: Large encounters use safe-split points (consolidated during Pass 0.5 reconciliation) to batch Pass 1 API calls.

   **Batching Configuration:**
   - `MIN_PAGES_PER_BATCH: 3` - Avoid tiny batches with high prompt overhead ratio
   - `MAX_PAGES_PER_BATCH: 10` - Ensure parallelism benefits on large encounters
   - `HARD_CEILING_PAGES: 50` - Absolute max before forced arbitrary split (last resort)

   **Batching Logic:**
   - 1-10 pages: Single batch (no split needed)
   - 11-50 pages with safe-splits: Use splits to create optimal batches of ~10 pages
   - 11-50 pages without safe-splits: Single batch (suboptimal but works)
   - 51+ pages with safe-splits: Use splits to create optimal batches
   - 51+ pages without safe-splits: Forced arbitrary splits at 50-page intervals (fallback)

   **Pass 0.5 Constraint:** Target ~1 safe-split point per 5 pages (balances batching flexibility vs output tokens).

5. **Parallel Processing**: Pass 1 leverages parallelism at two levels:
   - **Level A (Multi-Encounter)**: If a shell_file contains multiple encounters (from Pass 0.5), all encounters are processed in parallel
   - **Level B (Multi-Batch)**: If a single encounter is split into batches via safe-split points, all batches are processed in parallel

   Example: A 100-page file with 5 encounters, each with 2 batches = 10 parallel API calls. Speedup of 5-20x vs sequential processing.

6. **No Context Package**: Pass 1 batches do NOT include encounter-level context summaries. Entity classification is local (word/phrase level) - "Metformin 500mg" is a medication regardless of document type. Context is a Pass 2 concern.

7. **Non-Text Blocks**: Charts, graphs, diagrams are NOT handled by Pass 1. Pass 1 is OCR-only (no vision). Non-text regions are identified during OCR/Pass 0.5 and handled by Pass 2 with targeted vision calls.

### Pipeline Position

```
Pass 0.5: OCR -> Chunks -> Pending Encounters -> RECONCILIATION -> healthcare_encounters
                                                                          |
                                                            safe_split_points (NEW column)
                                                                          |
                                                                          v
Pass 1:   Receives ONE healthcare_encounter (or part of an encounter via safe_split_points if large)
          |
          v
          Outputs: pass1_entity_detections (minimal schema)
                   pass1_bridge_schema_zones (Y-ranges per schema type)
          |
          v
Pass 1.5: Medical code shortlisting per entity (existing system)
          |
          v
Pass 2:   Enrichment batched by bridge_schema_zone (parallel processing)
```

### Token Economics Target

| Metric | Legacy Pass 1 | Strategy-A Target |
|--------|---------------|-------------------|
| Input tokens | ~10,600 (image heavy) | ~2,000 (OCR text only) |
| Output tokens | ~22,000 | ~2,700-3,800 |
| Total tokens | ~26,000 | ~5,000-6,000 |
| **Reduction** | baseline | **~80%** |

---

## 2. File Organization

### Documentation Structure
```
shared/docs/architecture/database-foundation-v3/ai-processing-v3/
  implementation-planning/pass-1-entity-detection/
    strategy-a/
      PASS1-STRATEGY-A-MASTER.md                    <-- THIS FILE (design + implementation tracker)
      01-PASS-1-STRATEGY-A-AUDIT.md                 <-- Existing audit of old system
      02-PASS-1-OCT-2025-JOB-AUDIT.md               <-- Existing job audit
      03-prompt-caching-deep-dive.md                 <-- Prompt caching mechanics reference
      04-rate-limits-monitoring-retry-strategy.md   <-- Rate limits, monitoring, retry logic
      05-hierarchical-observability-system.md       <-- Metrics, audit, error tracking tables
    archive-pre-strategy-a/                         <-- Old Pass 1 docs (already moved)
```

### Code Structure
```
apps/render-worker/src/
  pass1/                    <-- OLD (keep as reference, do not modify)
    Pass1EntityDetector.ts
    pass1-prompts.ts
    pass1-prompts-minimal-test.ts
    pass1-database-builder.ts
    pass1-types.ts
    pass1-translation.ts
    pass1-schema-mapping.ts
    index.ts
    README.md
    __tests__/
      Pass1EntityDetector-cost-calculation.test.ts
      pass1-translation-truncation.test.ts

  pass1-v2/                 <-- NEW (Strategy-A implementation) - COMPLETE
    Pass1Detector.ts        <-- Main orchestrator (647 lines)
    pass1-v2-types.ts       <-- Type definitions (377 lines)
    pass1-v2-prompt.ts      <-- Prompt generation (221 lines)
    pass1-v2-output-parser.ts  <-- Parse AI response (425 lines)
    pass1-v2-batching.ts    <-- Safe-split batching (413 lines)
    pass1-v2-database.ts    <-- Database operations (625 lines)
    pass1-v2-error-handler.ts  <-- Error taxonomy + retry (291 lines)
    index.ts                <-- Public exports (143 lines)
```

### Database Schema Location
```
shared/docs/architecture/database-foundation-v3/current_schema/
  04_ai_processing.sql      <-- Will add pass1_entity_detections table
                            <-- Will add pass1_bridge_schema_zones table
```

---

## 3. Existing Assets Inventory

### Scripts to ARCHIVE (keep for reference, do not use)
| File | Location | Notes |
|------|----------|-------|
| Pass1EntityDetector.ts | `pass1/` | 1,100+ lines, vision-based |
| pass1-prompts.ts | `pass1/` | Heavy prompt with cross-validation |
| pass1-database-builder.ts | `pass1/` | Writes to 7 tables |
| pass1-translation.ts | `pass1/` | Complex entity transformation |
| pass1-schema-mapping.ts | `pass1/` | May reuse entity_type mappings |
| pass1-types.ts | `pass1/` | Overly complex types |

### Scripts to REUSE (no changes needed)
| File | Location | Notes |
|------|----------|-------|
| retry.ts | `utils/` | OpenAI retry wrapper with exponential backoff |
| logger.ts | `utils/` | Structured logging |
| logger-types.ts | `utils/` | Logger type definitions |

### Scripts NOT NEEDED in Strategy-A (were used by old Pass 1)
| File | Location | Notes |
|------|----------|-------|
| ~~image-processing.ts~~ | ~~`utils/`~~ | **DELETED 2025-11-29** - Was dead code (zero imports). `format-processor/` handles all image optimization. |
| format-processor/ | `utils/` | ACTIVELY USED upstream in worker.ts:540 for PDF/TIFF/HEIC processing before OCR. Not relevant to Pass 1 (receives post-OCR text). |

### Tables to DEPRECATE (stop writing to)
| Table | Current Use | Strategy-A Status |
|-------|-------------|-------------------|
| entity_processing_audit | Pass 1 entity storage | DEPRECATE - replaced by pass1_entity_detections |
| profile_classification_audit | Profile safety | DEPRECATE - not needed in Strategy-A |
| ai_confidence_scoring | Low-confidence tracking | DEPRECATE - no confidence scores in Strategy-A |
| manual_review_queue | Review flagging | KEEP - but Pass 1 won't write to it |

### Tables to KEEP (continue using)
| Table | Current Use | Strategy-A Status |
|-------|-------------|-------------------|
| ai_processing_sessions | multi-pass session tracking | KEEP - Pass 1 creates session record |
| pass1_entity_metrics | Processing metrics | KEEP - update schema for v2 metrics |
| healthcare_encounters | Encounter data | KEEP - Pass 1 reads from this |
| shell_files | File metadata | KEEP - Pass 1 updates status |

### Tables to CREATE (new for Strategy-A)
| Table | Purpose |
|-------|---------|
| pass1_entity_detections | Minimal entity storage |
| pass1_bridge_schema_zones | Y-coordinate ranges per schema type |

### Tables to MODIFY (add columns)
| Table | Column to Add | Purpose | Status |
|-------|---------------|---------|--------|
| healthcare_encounters | safe_split_points JSONB | Consolidated safe-splits from pass05 reconciliation | **DONE** - Migration 70, 2025-11-29 |

---

## 4. New Component Designs

### 4.1 Pass 1 Prompt

**System Message:**
```
You are a medical document entity classifier. Identify clinical entities and their types from OCR text. Output minimal JSON only.
```

**User Prompt Structure:**

Note: The `[Y:###]` markers are added dynamically by the Prompt Generator. The database stores raw OCR text in `enhanced_ocr_text` without markers. This keeps the source data clean for other passes.

```
ENCOUNTER OCR TEXT (Y-coordinates per line):
[Y:###] text text text
[Y:###] text text text
...

TASK:
1. Identify all clinical entities (medications, conditions, procedures, observations, allergies, lab_results, vital_signs, physical_findings)
2. For each entity output: original_text, entity_type, aliases (max 3), y_coordinate, page_number
3. Identify bridge_schema_zones: Y-ranges where specific schema types apply
   - Create ONE zone per schema_type (not multiple schema_types per zone)
   - Zones MAY overlap if multiple schema types share the same Y-region (e.g., side-by-side lists or a referral letter mentioning allergies, lab results, medications all in the same line or paragraph)
   - Keep zones focused

OUTPUT JSON SCHEMA:
{
  "entities": [
    {
      "id": "e1",
      "original_text": "Metformin 500mg",
      "entity_type": "medication",
      "aliases": ["metformin", "glucophage"],
      "y_coordinate": 245,
      "page_number": 1
    }
  ],
  "bridge_schema_zones": [
    {
      "schema_type": "medications",
      "page_number": 1,
      "y_start": 200,
      "y_end": 350
    },
    {
      "schema_type": "conditions",
      "page_number": 1,
      "y_start": 200,
      "y_end": 350
    },
    {
      "schema_type": "lab_results",
      "page_number": 1,
      "y_start": 400,
      "y_end": 600
    }
  ]
}
```

### 4.2 Database Schema: pass1_entity_detections

```sql
CREATE TABLE pass1_entity_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),

  -- Entity identification
  entity_sequence INTEGER NOT NULL,  -- Order within encounter (e1, e2, etc.)
  original_text TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'medication', 'condition', 'procedure', 'observation',
    'allergy', 'lab_result', 'vital_sign', 'physical_finding'
  )),
  aliases TEXT[] DEFAULT '{}',

  -- Spatial
  y_coordinate INTEGER,
  page_number INTEGER NOT NULL DEFAULT 1,

  -- Link to bridge schema zone
  bridge_schema_zone_id UUID REFERENCES pass1_bridge_schema_zones(id),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pass1_entities_encounter ON pass1_entity_detections(healthcare_encounter_id);
CREATE INDEX idx_pass1_entities_type ON pass1_entity_detections(entity_type);
CREATE INDEX idx_pass1_entities_shell_file ON pass1_entity_detections(shell_file_id);
```

### 4.3 Database Schema: pass1_bridge_schema_zones

```sql
CREATE TABLE pass1_bridge_schema_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),

  -- Zone definition
  schema_type TEXT NOT NULL,  -- 'medications', 'lab_results', 'vitals', etc.
  page_number INTEGER NOT NULL,
  y_start INTEGER NOT NULL,
  y_end INTEGER NOT NULL,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_y_range CHECK (y_end > y_start)
);

-- Indexes
CREATE INDEX idx_bridge_zones_encounter ON pass1_bridge_schema_zones(healthcare_encounter_id);
CREATE INDEX idx_bridge_zones_schema ON pass1_bridge_schema_zones(schema_type);
```

### 4.4 Database Schema: healthcare_encounters (ADD COLUMN)

```sql
ALTER TABLE healthcare_encounters
ADD COLUMN safe_split_points JSONB DEFAULT NULL;

COMMENT ON COLUMN healthcare_encounters.safe_split_points IS
  'Consolidated safe-split points from reconciliation. Array of {page, y, type} objects for batching large encounters in Pass 1/2.';
```

### 4.5 TypeScript Types

```typescript
// pass1-v2-types.ts

export type Pass1EntityType =
  | 'medication'
  | 'condition'
  | 'procedure'
  | 'observation'
  | 'allergy'
  | 'lab_result'
  | 'vital_sign'
  | 'physical_finding';

export interface Pass1Entity {
  id: string;
  original_text: string;
  entity_type: Pass1EntityType;
  aliases: string[];
  y_coordinate: number | null;
  page_number: number;
}

export interface Pass1BridgeSchemaZone {
  schema_type: string;  // 'medications', 'lab_results', 'vitals', etc.
  page_number: number;
  y_start: number;
  y_end: number;
}

export interface Pass1AIResponse {
  entities: Pass1Entity[];
  bridge_schema_zones: Pass1BridgeSchemaZone[];
}

export interface Pass1Input {
  healthcare_encounter_id: string;
  shell_file_id: string;
  patient_id: string;
  enhanced_ocr_text: string;  // Y-only format from Pass 0.5
  page_count: number;
  safe_split_points?: SafeSplitPoint[];
}

export type SafeSplitType = 'header' | 'footer' | 'whitespace' | 'page_break' | 'section_end' | 'forced';

export interface SafeSplitPoint {
  page: number;
  y: number;
  type: SafeSplitType;  // Union type prevents magic strings
}

export interface Pass1EntityDetectionRecord {
  healthcare_encounter_id: string;
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;
  entity_sequence: number;
  original_text: string;
  entity_type: Pass1EntityType;
  aliases: string[];
  y_coordinate: number | null;
  page_number: number;
  bridge_schema_zone_id?: string;
}
```

### 4.6 Zone-Entity Linking Algorithm

The AI outputs zones and entities separately. The parser links them via Y-coordinate overlap:

```typescript
// Step 1: Insert zones first, get back generated UUIDs
const insertedZones = await supabase
  .from('pass1_bridge_schema_zones')
  .insert(aiResponse.bridge_schema_zones.map(z => ({
    healthcare_encounter_id: encounter.id,
    processing_session_id: sessionId,
    schema_type: z.schema_type,
    page_number: z.page_number,
    y_start: z.y_start,
    y_end: z.y_end
  })))
  .select('id, schema_type, page_number, y_start, y_end');

// Step 2: For each entity, find matching zone by page + Y overlap
function findMatchingZone(entity: Pass1Entity, zones: InsertedZone[]): string | null {
  const candidates = zones.filter(z =>
    z.page_number === entity.page_number &&
    entity.y_coordinate !== null &&
    entity.y_coordinate >= z.y_start &&
    entity.y_coordinate <= z.y_end
  );

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  // Multiple overlapping zones - pick by schema_type matching entity_type
  const typeMatch = candidates.find(z =>
    schemaTypeMatchesEntityType(z.schema_type, entity.entity_type)
  );
  return typeMatch?.id ?? candidates[0].id;
}

// Step 3: Build entity records with zone links
const entityRecords = aiResponse.entities.map((e, i) => ({
  healthcare_encounter_id: encounter.id,
  shell_file_id: encounter.shell_file_id,
  patient_id: encounter.patient_id,
  processing_session_id: sessionId,
  entity_sequence: i + 1,
  original_text: e.original_text,
  entity_type: e.entity_type,
  aliases: e.aliases,
  y_coordinate: e.y_coordinate,
  page_number: e.page_number,
  bridge_schema_zone_id: findMatchingZone(e, insertedZones.data)
}));

// Step 4: Insert entities
await supabase.from('pass1_entity_detections').insert(entityRecords);
```

**Matching rules:**
1. Entity must be on same page as zone
2. Entity Y-coordinate must fall within zone's y_start/y_end range
3. If multiple zones match (overlapping), prefer zone whose schema_type matches entity_type
4. If still ambiguous, use first matching zone
5. If no zone matches, `bridge_schema_zone_id` is NULL (entity outside any zone)

---

## 5. Implementation Checklist

Single source of truth for progress tracking. Check off items as completed.

### Phase 0: Prerequisites (Pass 0.5 Enhancement)

| Status | Task | Notes |
|--------|------|-------|
| [x] | Add `safe_split_points` column to `healthcare_encounters` table | Migration 70 - 2025-11-29 |
| [x] | Update Pass 0.5 to limit safe-split output | Updated prompt v12 to ~1 per 5 pages (reduced from 1/3 for token savings) - 2025-11-29 |
| [x] | Update Pass 0.5 reconciler to consolidate safe-splits | Filter per-encounter from all chunks, pass to RPC - 2025-11-29 |
| [x] | Test reconciliation with safe-split consolidation | Verified: 71-page doc, 2 chunks (12+25 splits) merged to 37 in healthcare_encounters - 2025-11-29 |
| [x] | Audit `image-processing.ts` usage | NOT used by current pipeline. `downscaleImageBase64()` exists but is never called. `format-processor` handles all image optimization. Pass 1 Strategy-A doesn't need it (OCR-only). - 2025-11-29 |
| [x] | Audit `format-processor/` usage | ACTIVELY USED in worker.ts:540. `preprocessForOCR()` handles PDF/TIFF page extraction, HEIC conversion, and JPEG optimization before OCR. Pass 1 receives post-OCR text, so this is upstream and irrelevant to Strategy-A. - 2025-11-29 |

### Phase 1: Database Setup (COMPLETE - Migration 71)

| Status | Task | Notes |
|--------|------|-------|
| [x] | Create `pass1_entity_detections` table | Migration 71 - 2025-11-29 |
| [x] | Create `pass1_bridge_schema_zones` table | Migration 71 - 2025-11-29 |
| [x] | Create `pass1_batch_results` table | Migration 71 - 2025-11-29 |
| [x] | Create `pass1_encounter_results` table | Migration 71 - 2025-11-29 |
| [x] | Add columns to `pass1_entity_metrics` | Migration 71 - ai_model_used, encounters_total/succeeded/failed, batches_total/succeeded, total_retries_used, failure_encounter_id, error_code, error_summary |
| [x] | Add columns to `ai_processing_summary` | Migration 71 - pass05_metrics_id, failure_encounter_id, failure_batch_index, error_code, error_drill_down |
| [x] | Add columns to `ai_processing_sessions` | Migration 71 - pass05_status, pass1_status, pass1_5_status, pass2_status, pass3_status, failure_pass, failure_encounter_id, error_code_v2 |
| [x] | Verify `job_queue` compatibility | No changes needed - verified 2025-11-29 |
| [x] | Add RLS policies for new tables | Migration 71 - Service role write, user read via patient_id |
| [x] | Update `current_schema/04_ai_processing.sql` | Updated 2025-11-29 - Added Section 2C with new tables and RLS |
| [x] | Update `current_schema/08_job_coordination.sql` | Updated 2025-11-29 - Added hierarchical observability section |
| [x] | Add `had_transient_failure` and `transient_error_history` to `pass1_batch_results` | Included in Migration 71 table creation |

### Phase 2: Core Implementation (COMPLETE - 2025-11-29)

| Status | Task | Notes |
|--------|------|-------|
| [x] | Create `pass1-v2/` folder structure | 8 files, 3153 lines |
| [x] | Implement `pass1-v2-types.ts` | 377 lines - all types + constants |
| [x] | Implement `pass1-v2-prompt.ts` | 221 lines - uses pre-formatted OCR |
| [x] | Implement `pass1-v2-output-parser.ts` | 425 lines - JSON extraction + validation |
| [x] | Implement `pass1-v2-batching.ts` | 413 lines - safe-split batching |
| [x] | Implement `pass1-v2-database.ts` | 625 lines - all DB operations |
| [x] | Implement `pass1-v2-error-handler.ts` | 291 lines - error taxonomy |
| [x] | Implement `Pass1Detector.ts` | 647 lines - main orchestrator |
| [x] | Implement `index.ts` | 143 lines - public exports |
| [x] | Implement retry wrapper with exponential backoff | In error-handler + Pass1Detector |
| [x] | Implement `classifyError()` function | 15 error codes with categories |
| [x] | Implement `isRetryable()` function | Per error code retryability |
| [x] | Create encounter result record at batch start | `createEncounterResult()` |
| [x] | Create batch result record per batch | `createBatchResult()` |
| [x] | Aggregate batch results to encounter | `updateEncounterResult()` |
| [x] | Propagate failure info to pipeline summary | Via session status updates |
| [x] | Preserve transient error history on success | `had_transient_failure` flag |

### Phase 3: Worker Integration (COMPLETE - 2025-11-29)

| Status | Task | Notes |
|--------|------|-------|
| [x] | Replace Pass 1 imports in worker.ts | `createPass1Detector, Pass1Detector` from pass1-v2 |
| [x] | Remove legacy env flags | ENABLE_PASS1, PASS1_OCR_ONLY removed |
| [x] | Replace detector initialization | `createPass1Detector(supabase, { openai_api_key })` |
| [x] | Simplify runPass1() | ~50 lines, calls `processShellFile()` |
| [x] | Delete legacy Pass 1 methods | ~360 lines removed (vision mode, 7-table inserts) |
| [x] | Verify TypeScript compilation | 0 errors |

### Phase 4: Testing & Validation

| Status | Task | Notes |
|--------|------|-------|
| [ ] | Unit tests for prompt generation | |
| [ ] | Unit tests for output parsing | |
| [ ] | Integration test: single encounter processing | |
| [ ] | Integration test: large encounter with safe-split batching | |
| [ ] | Measure token usage reduction | Target: 80% reduction |

### Phase 5: Cleanup & Documentation

| Status | Task | Notes |
|--------|------|-------|
| [ ] | Delete old `pass1/` folder | Pre-launch: no need to archive |
| [ ] | Remove legacy Pass 1 env flags from worker.ts | `ENABLE_PASS1`, `PASS1_OCR_ONLY` |
| [ ] | Update CLAUDE.md with Pass 1 info | |
| [ ] | Document Pass 1.5 integration points | How entities flow to code shortlisting |

---

## 6. Dependencies & Blockers

| Dependency | Status | Impact |
|------------|--------|--------|
| Pass 0.5 reconciliation must write `safe_split_points` | **DONE** | Migration 70 + reconciler update complete |
| Pass 1.5 must accept new entity format | TO VERIFY | May need adapter |
| Pass 2 design must be finalized | PENDING | Bridge schema zone design depends on Pass 2 needs |

### Downstream Integration Notes

**Pass 1.5 Integration:**
- Pass 1.5 reads from `pass1_entity_detections` instead of `entity_processing_audit`
- `entity_type` values are identical (see Section 7) - no schema translation needed
- Pass 1.5 owner must verify query compatibility before Pass 1 Strategy-A goes live

**Pass 2 Integration:**
- Pass 2 will receive `bridge_schema_zone_id` references to batch entities by zone
- Pass 2 can query zones via: `SELECT * FROM pass1_bridge_schema_zones WHERE healthcare_encounter_id = ?`
- Pass 2 design should define how zones are used (one API call per zone? multiple zones per call?)
- This is a **consumer dependency** - Pass 2 design can proceed independently, just needs to consume zones

---

## 7. Reference: Entity Type Mapping

Maps Pass 1 `entity_type` to Pass 1.5 `universal_medical_codes.entity_type`:

| Pass 1 entity_type | Pass 1.5 entity_type | Notes |
|--------------------|---------------------|-------|
| medication | medication | Direct match |
| condition | condition | Direct match |
| procedure | procedure | Direct match |
| observation | observation | Direct match |
| allergy | allergy | Direct match |
| lab_result | lab_result | Direct match |
| vital_sign | vital_sign | Direct match |
| physical_finding | physical_finding | Direct match |

No translation needed - types align with existing Pass 1.5 schema.

---

## 8. Worker Integration Reference

### 8.1 Current worker.ts Architecture (Legacy Pass 1)

**Location:** `apps/render-worker/src/worker.ts`

The current worker implements Pass 1 with two modes controlled by environment variables:

**Configuration (Lines 98-104):**
```typescript
passes: {
  pass05Enabled: true,                                    // Always on
  pass1Enabled: process.env.ENABLE_PASS1 === 'true',     // Default: false
  pass2Enabled: false,                                    // Not implemented
  pass1OcrOnly: process.env.PASS1_OCR_ONLY === 'true',   // Strategy-A test mode
}
```

**Pass 1 Detector Initialization (Lines 169-184):**
```typescript
if (config.passes.pass1Enabled && config.openai.apiKey) {
  const pass1Config: Pass1Config = {
    openai_api_key: config.openai.apiKey,
    model: 'gpt-5-mini',
    temperature: 0.1,
    max_tokens: 32000,
    confidence_threshold: 0.7,
  };
  this.pass1Detector = new Pass1EntityDetector(pass1Config);
}
```

**Pipeline Flow (Lines 490-518):**
```
processAIJob()
  -> runOCRProcessing()      // Steps 1-9
  -> runPass05()             // Encounter discovery
  -> runPass1() [if enabled] // Entity detection
```

### 8.2 Legacy Pass 1 Methods (to be deleted)

Pre-launch: these methods will be deleted entirely, not maintained.

| Method | Lines | Purpose |
|--------|-------|---------|
| `runPass1()` | 1219-1326 | Mode router (vision vs OCR-only) |
| `runPass1OCROnly()` | 1337-1380 | Load enhanced OCR, call detector |
| `processPass1OCROnlyDetection()` | 1387-1463 | Build input, call OpenAI, update status |
| `processPass1EntityDetection()` | 1470-1519 | Legacy vision mode processing |
| `insertPass1DatabaseRecords()` | 1525-1613 | Write to 7 tables |

### 8.3 Strategy-A Worker Changes (Pre-Launch)

**Environment Variables:**
```bash
# Remove all legacy flags:
# ENABLE_PASS1           # Delete
# PASS1_OCR_ONLY         # Delete
# No new flags needed - Pass 1 runs unconditionally after Pass 0.5
```

**New Pass 1 Flow (Parallel Processing with Retry-Until-Complete):**
```typescript
// In processAIJob(), after runPass05():
const encounters = await this.loadEncountersForShellFile(payload.shell_file_id);

// LEVEL A: Process all encounters in parallel
await Promise.all(encounters.map(encounter =>
  this.processEncounterWithRetry(encounter)
));

// --- Retry-Until-Complete Logic ---
async processEncounterWithRetry(encounter: Encounter, maxRetries = 3): Promise<void> {
  const batches = needsBatching(encounter)
    ? splitEncounterByBatchPoints(encounter)
    : [createSingleBatch(encounter)];

  // Track batch states
  const batchStates: BatchState[] = batches.map((batch, i) => ({
    index: i, batch, status: 'pending', attempt: 0, result: null
  }));

  while (true) {
    // Find batches needing work
    const pending = batchStates.filter(
      b => b.status === 'pending' || (b.status === 'failed' && b.attempt < maxRetries)
    );
    if (pending.length === 0) break;

    // Process pending/failed batches in parallel
    const results = await Promise.allSettled(
      pending.map(async (state) => {
        state.status = 'processing';
        state.attempt++;
        const result = await this.runPass1Batch(state.batch);
        return { index: state.index, result };
      })
    );

    // Update states
    for (const r of results) {
      if (r.status === 'fulfilled') {
        batchStates[r.value.index].status = 'succeeded';
        batchStates[r.value.index].result = r.value.result;
      } else {
        const failed = pending.find(p => p.status === 'processing');
        if (failed) failed.status = 'failed';
      }
    }

    // Backoff before retry round
    if (batchStates.some(b => b.status === 'failed')) {
      await sleep(1000 * Math.pow(2, batchStates[0].attempt - 1));
    }
  }

  // Final check - all must succeed or encounter fails entirely
  if (batchStates.some(b => b.status === 'failed')) {
    throw new Error(`Encounter ${encounter.id}: batches failed after ${maxRetries} retries`);
  }

  // All succeeded - merge and save
  await this.savePass1Results(encounter, batchStates);
}
```

**Key Points:**
- Successful batches wait in memory while failed batches retry
- Only failed batches are re-attempted (no wasted API calls)
- Exponential backoff between retry rounds
- Encounter either fully completes or fully fails (no partial state)
- Status is `pass1_complete` or stays at `pass05_complete` for retry

**Key Differences from Legacy:**

| Aspect | Legacy Pass 1 | Strategy-A Pass 1 |
|--------|---------------|-------------------|
| Input unit | shell_file | healthcare_encounter |
| OCR format | XY coordinates | Y-only coordinates |
| Image download | Yes (vision mode) | No |
| Database tables | 7 tables | 2 tables |
| Output schema | Complex (category/subtype) | Minimal (entity_type) |
| Confidence scores | Yes | No |
| Token count | ~26,000 | ~5,000-6,000 |
| Processing | Sequential | Parallel (encounters + batches) |
| Non-text blocks | Attempted via vision | Deferred to Pass 2 |

### 8.4 Database Status Updates

**Status values (shell_files.status):**
- `processing` - Job started
- `pass05_complete` - Encounter discovery finished
- `pass1_complete` - Entity detection finished (all batches succeeded)

---

## 9. Open Questions

1. **Alias generation**: Should Pass 1 generate aliases or defer to Pass 1.5's synonym matching? Current design has Pass 1 output max 3 aliases.

2. **Multi-page encounters**: How to handle entities that span page boundaries? Current design assigns entity to the page where it starts.

---

## 10. Design Decisions Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Remove metadata block from AI output | 2025-11-28 | `total_entities` redundant (use array length), `processing_note` unnecessary. Saves ~50-100 tokens. |
| Use `schema_type` string not UUID | 2025-11-28 | Bridge schemas are predefined categories, not database records. Human-readable strings like "medications" are clearer. |
| Allow overlapping zones, one schema_type per zone | 2025-11-28 | Handles side-by-side lists (e.g., medications + conditions at same Y-range). Prevents lazy giant zones. |
| No confidence scores in Pass 1 | 2025-11-28 | Quality signal comes from Pass 1.5 similarity scores and Pass 2 validation. Removes unnecessary output tokens. |
| Parallel processing at two levels | 2025-11-28 | Level A: all encounters processed in parallel. Level B: all batches within an encounter processed in parallel. 5-20x speedup for large files. |
| No context package for batches | 2025-11-28 | Entity classification is local (word/phrase level). "Metformin 500mg" is a medication regardless of document type. Context is a Pass 2 concern. |
| Non-text blocks deferred to Pass 2 | 2025-11-28 | Pass 1 is OCR-only (no vision). Charts, graphs, diagrams require vision capability. Pass 2 handles with targeted vision calls. |
| Pre-launch: delete legacy, no feature flags | 2025-11-28 | No production users, no backward compatibility needed. Simply replace old implementation. |
| Batching config: MIN=3, MAX=10, CEILING=50 | 2025-11-29 | MIN 3 pages avoids high prompt overhead ratio (~27%). MAX 10 keeps batches manageable. CEILING 50 matches Pass 0.5 chunk size for forced splits when no safe-splits available. |
| No job failure for missing safe-splits | 2025-11-29 | Batching is for speed, not correctness. Process as single batch if no splits available. Only use forced arbitrary splits (at 50-page intervals) as last resort for 51+ page encounters. |
| Pass 0.5 safe-split limit: ~1 per 5 pages | 2025-11-29 | Balances batching flexibility vs output tokens. Originally 1/3, reduced to 1/5 after testing showed sufficient coverage with lower token cost. |
| Retry-until-complete (not partial saves) | 2025-11-29 | Failed batches retry while successful batches wait in memory. Encounter either fully completes or fully fails. No `pass1_partial` status - Pass 2 needs complete data to batch by zones. |
| Y-markers added by Prompt Generator, not stored | 2025-11-29 | Database stores raw OCR text in `enhanced_ocr_text`. `[Y:###]` markers added dynamically at prompt generation. Keeps source data clean for other passes. |
| SafeSplitType as union type | 2025-11-29 | `'header' | 'footer' | 'whitespace' | 'page_break' | 'section_end' | 'forced'` prevents magic strings and enables exhaustive switch statements. |
| Zone-entity linking via Y-overlap | 2025-11-29 | Zones inserted first (get UUIDs), then entities linked by matching page + Y-coordinate within zone range. If multiple overlapping zones, prefer schema_type matching entity_type. |
| Hierarchical observability with structured tables | 2025-11-29 | Use `pass1_batch_results` and `pass1_encounter_results` tables (mirroring Pass 0.5 pattern) instead of event log. Full design in `05-hierarchical-observability-system.md`. |
| Scope observability to AI pipeline only | 2025-11-29 | Pre-AI stages (upload, OCR) omitted from this design. Future `file_pipeline_*` and `master_pipeline_summary` tables may track full pipeline. |
| Standardized error codes across passes | 2025-11-29 | Error taxonomy: API errors (RATE_LIMIT, API_5XX), processing errors (PARSE_JSON, CONTEXT_TOO_LARGE), data errors (OCR_QUALITY_LOW). Enables consistent debugging. |
| Remove confidence from Pass 0.5 AI output | 2025-11-29 | AI confidence scores not actionable - quality comes from Pass 1.5 similarity and Pass 2 validation. Saves ~12 tokens/encounter + ~5 tokens/split. TypeScript defaults to 0.5. |
| Delete unused image-processing.ts | 2025-11-29 | Zero imports in codebase. `format-processor/` handles all image optimization. Removed 250 lines of dead code. |
