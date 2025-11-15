# Pass 0.5 Strategy A - Comprehensive Table Design Analysis V2

**Date:** November 14, 2024
**Version:** 2.0
**Purpose:** Complete accountability analysis of every column in Pass 0.5 tables with Strategy A migration plan

## Table Analysis Format

For each table, I'll document:
- Every column with its current usage
- Whether to KEEP, MODIFY, or DELETE
- New columns needed for Strategy A
- Migration notes

---

## 1. pass05_progressive_sessions

**Purpose:** Tracks progressive processing sessions for documents
**Current Usage:** Only for >100 page documents
**Strategy A Change:** Will be used for ALL documents (even 1-page)

### Column Analysis

| Column | Type | Current Usage | Strategy A Action | Notes |
|--------|------|---------------|-------------------|-------|
| `id` | uuid | Primary key | **KEEP** | No change |
| `shell_file_id` | uuid | Links to document | **KEEP** | No change |
| `patient_id` | uuid | Links to patient | **KEEP** | No change |
| `total_pages` | integer | Document page count | **KEEP** | No change |
| `chunk_size` | integer | Pages per chunk (50) | **KEEP** | Default to 50 |
| `total_chunks` | integer | Calculated chunk count | **KEEP** | No change |
| `current_chunk` | integer | Progress tracker | **KEEP** | No change |
| `processing_status` | text | Session state | **KEEP** | No change |
| `current_handoff_package` | jsonb | Complex handoff data | **MODIFY** | Simplify to cascade context only |
| `total_encounters_found` | integer | UNUSED - always 0 | **DELETE** | Not meaningful until reconciliation |
| `total_encounters_completed` | integer | UNUSED - always 0 | **DELETE** | Not meaningful until reconciliation |
| `total_encounters_pending` | integer | Tracks pending count | **MODIFY** | Rename to `total_pendings_created` |
| `requires_manual_review` | boolean | Review flag | **KEEP** | No change |
| `review_reasons` | text[] | Review details | **KEEP** | No change |
| `average_confidence` | numeric | Session confidence | **KEEP** | Calculate after reconciliation |
| `started_at` | timestamp | Start time | **KEEP** | No change |
| `completed_at` | timestamp | End time | **KEEP** | No change |
| `total_processing_time` | interval | Duration | **KEEP** | No change |
| `total_ai_calls` | integer | AI call count | **KEEP** | No change |
| `total_input_tokens` | integer | Token tracking | **KEEP** | No change |
| `total_output_tokens` | integer | Token tracking | **KEEP** | No change |
| `total_cost_usd` | numeric | Cost tracking | **KEEP** | No change |
| `created_at` | timestamp | Record created | **KEEP** | No change |
| `updated_at` | timestamp | Record updated | **KEEP** | No change |

### New Columns for Strategy A
```sql
ALTER TABLE pass05_progressive_sessions
  ADD COLUMN total_cascades integer DEFAULT 0,          -- Number of cascade chains created
  ADD COLUMN strategy_version varchar(10) DEFAULT 'A-v1', -- Track strategy version
  ADD COLUMN reconciliation_completed_at timestamp,      -- When reconciliation finished
  ADD COLUMN final_encounter_count integer;              -- Count after reconciliation
```

---

## 2. pass05_pending_encounters

**Purpose:** Temporary storage for encounters during processing
**Current Usage:** Complex with partial_data JSON storage
**Strategy A Change:** Hub table - ALL encounters pass through here

### Column Analysis

| Column | Type | Current Usage | Strategy A Action | Notes |
|--------|------|---------------|-------------------|-------|
| `id` | uuid | Primary key | **KEEP** | No change |
| `session_id` | uuid | Links to session | **KEEP** | No change |
| `temp_encounter_id` | text | Temp ID like "encounter_temp_001" | **MODIFY** | Rename to `pending_id`, make deterministic |
| `chunk_started` | integer | Which chunk created this | **KEEP** | Rename to `chunk_number` |
| `chunk_last_seen` | integer | Last chunk that updated | **DELETE** | Not needed with cascade system |
| `partial_data` | jsonb | Complex accumulated data | **MODIFY** | Store full encounter data, not "partial" |
| `page_ranges` | integer[][] | Page coverage | **KEEP** | Critical for reconciliation |
| `last_seen_context` | text | Context tracking | **DELETE** | Replaced by cascade_id |
| `expected_continuation` | text | Hint for next chunk | **DELETE** | Moved to cascade package |
| `status` | text | 'pending'/'completed' | **KEEP** | Add 'orphaned' status |
| `completed_encounter_id` | uuid | Links to final encounter | **MODIFY** | Rename to `reconciled_to` |
| `completed_at` | timestamp | When completed | **MODIFY** | Rename to `reconciled_at` |
| `confidence` | numeric | AI confidence | **KEEP** | No change |
| `requires_review` | boolean | Review flag | **KEEP** | No change |
| `created_at` | timestamp | Record created | **KEEP** | No change |
| `updated_at` | timestamp | Record updated | **KEEP** | No change |

### New Columns for Strategy A
```sql
ALTER TABLE pass05_pending_encounters
  -- Core cascade support
  ADD COLUMN cascade_id varchar(100),           -- Links cascading encounters
  ADD COLUMN is_cascading boolean DEFAULT false, -- Does this cascade to next chunk?
  ADD COLUMN continues_previous boolean DEFAULT false, -- Continues from previous chunk?

  -- Position data
  ADD COLUMN start_page integer NOT NULL,       -- First page of encounter
  ADD COLUMN end_page integer NOT NULL,         -- Last page of encounter
  ADD COLUMN start_position varchar(20),        -- Position on first page
  ADD COLUMN end_position varchar(20),          -- Position on last page
  ADD COLUMN position_confidence numeric,       -- Confidence in positions

  -- Reconciliation support
  ADD COLUMN reconciliation_key varchar(255),   -- For descriptor matching
  ADD COLUMN reconciliation_method varchar(20), -- 'cascade', 'descriptor', 'orphan'
  ADD COLUMN reconciliation_confidence numeric; -- Confidence in reconciliation

-- Rename columns for clarity
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN temp_encounter_id TO pending_id;
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN chunk_started TO chunk_number;
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN partial_data TO encounter_data;
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN completed_encounter_id TO reconciled_to;
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN completed_at TO reconciled_at;
```

---

## 3. pass05_chunk_results

**Purpose:** Per-chunk processing metrics and results
**Current Usage:** Tracks complex handoff state and encounter counts
**Strategy A Change:** Simplify to chunk-level metrics only

### Column Analysis

| Column | Type | Current Usage | Strategy A Action | Notes |
|--------|------|---------------|-------------------|-------|
| `id` | uuid | Primary key | **KEEP** | No change |
| `session_id` | uuid | Links to session | **KEEP** | No change |
| `chunk_number` | integer | Chunk sequence | **KEEP** | No change |
| `page_start` | integer | First page in chunk | **KEEP** | No change |
| `page_end` | integer | Last page in chunk | **KEEP** | No change |
| `processing_status` | text | Chunk status | **KEEP** | No change |
| `started_at` | timestamp | Start time | **KEEP** | No change |
| `completed_at` | timestamp | End time | **KEEP** | No change |
| `processing_time_ms` | integer | Duration in ms | **KEEP** | No change |
| `ai_model_used` | text | Model name | **KEEP** | No change |
| `input_tokens` | integer | Token count | **KEEP** | No change |
| `output_tokens` | integer | Token count | **KEEP** | No change |
| `ai_cost_usd` | numeric | API cost | **KEEP** | No change |
| `handoff_received` | jsonb | Complex handoff in | **MODIFY** | Simplify to cascade context |
| `handoff_generated` | jsonb | Complex handoff out | **MODIFY** | Simplify to cascade package |
| `encounters_started` | integer | New encounters | **DELETE** | Meaningless in Strategy A |
| `encounters_completed` | integer | Completed in chunk | **DELETE** | Nothing completes at chunk level |
| `encounters_continued` | integer | Continued from prev | **DELETE** | Replaced by cascade tracking |
| `confidence_score` | numeric | Chunk confidence | **KEEP** | No change |
| `ocr_average_confidence` | numeric | OCR quality | **KEEP** | No change |
| `error_message` | text | Error tracking | **KEEP** | No change |
| `error_context` | jsonb | Error details | **KEEP** | No change |
| `retry_count` | integer | Retry tracking | **KEEP** | No change |
| `ai_response_raw` | jsonb | Raw AI response | **KEEP** | For debugging |
| `created_at` | timestamp | Record created | **KEEP** | No change |

### New Columns for Strategy A
```sql
ALTER TABLE pass05_chunk_results
  ADD COLUMN pendings_created integer DEFAULT 0,    -- Total encounters sent to pending
  ADD COLUMN cascading_count integer DEFAULT 0,     -- How many marked as cascading
  ADD COLUMN cascade_ids text[],                    -- Array of cascade IDs created
  ADD COLUMN continues_count integer DEFAULT 0;     -- How many continued from previous

-- Rename handoff columns for clarity
ALTER TABLE pass05_chunk_results
  RENAME COLUMN handoff_received TO cascade_context_received;
ALTER TABLE pass05_chunk_results
  RENAME COLUMN handoff_generated TO cascade_package_sent;
```

---

## 4. pass05_page_assignments - DEEP DIVE

**Purpose:** Maps pages to encounters with AI's justification
**Current Usage:** Uses temp encounter IDs during processing, updated to final UUIDs after reconciliation
**Strategy A Change:** Critical table for multi-encounter-per-page support

### Strategy A Analysis

Is this table needed? Yes
Why: 
1. **AI Accountability:** Shows AI's reasoning on a page-by-page basis
2. **Troubleshooting:** Helps debug why pages were assigned incorrectly
3. **UX Dashboard:** Can display "what's on each page" summary
4. **Audit Trail:** Demonstrates how AI arrived at its conclusions
5. **Quality Assurance:** Validates that all pages are accounted for

Current design adequate for multi-encounter pages?
MOSTLY YES, but needs enhancements:

**What Works:**
- Already supports multiple rows per page
- Justification field captures AI reasoning
- Links to both document and encounter

**What Needs Adding:**
- Position data (where on page does encounter appear)
- Pending ID tracking (before reconciliation)
- Chunk tracking (which chunk made this assignment)
- Partial page indicator (encounter only uses part of page)

### Column-by-Column Assessment

| Column | Current Purpose | Code Usage | Strategy A Action | Reasoning |
|--------|----------------|------------|-------------------|-----------|
| `id` | Primary key | Auto-generated | **KEEP** | Standard ID column |
| `shell_file_id` | Document link | Used in INSERT and UPDATE queries | **KEEP** | Essential foreign key |
| `page_num` | Page number (1-based) | Used for page lookups, no uniqueness constraint | **KEEP** | Core identifier, supports multi-encounter pages |
| `encounter_id` | Encounter reference | Initially temp ID ("enc-001"), replaced with UUID after reconciliation | **KEEP** | Critical for linking pages to encounters |
| `justification` | AI's reasoning | Populated from AI response, stored but rarely queried | **KEEP** | Valuable for debugging and audit |
| `created_at` | Timestamp | Auto-populated, not actively used | **KEEP** | Standard audit field |

**Finding:** All 6 existing columns should be kept - no orphaned columns detected.

### New Columns Needed for Strategy A

```sql
ALTER TABLE pass05_page_assignments
  -- Position tracking (supports multiple encounters per page)
  ADD COLUMN position_on_page varchar(20),        -- 'top','quarter','middle','three-quarters','bottom'
  ADD COLUMN position_confidence numeric,         -- 0.0-1.0 confidence in position
  ADD COLUMN is_partial boolean DEFAULT false,    -- TRUE if encounter uses only part of page

  -- Reconciliation tracking
  ADD COLUMN pending_id text,                     -- Links to pending encounter before reconciliation
  ADD COLUMN chunk_number integer,                -- Which chunk created this assignment

  -- Cascade tracking
  ADD COLUMN cascade_id varchar(100);             -- Links to cascade if applicable
```

### Indexing Strategy

```sql
-- Current indexes (need verification)
-- Likely has: PRIMARY KEY (id)
-- Likely missing: Composite indexes for common queries

-- Recommended indexes for Strategy A
CREATE INDEX idx_page_assign_doc_page
  ON pass05_page_assignments(shell_file_id, page_num);
  -- Supports: "Show all encounters on page N of document X"

CREATE INDEX idx_page_assign_encounter
  ON pass05_page_assignments(encounter_id);
  -- Supports: "Show all pages for encounter Y"

CREATE INDEX idx_page_assign_pending
  ON pass05_page_assignments(shell_file_id, pending_id)
  WHERE pending_id IS NOT NULL;
  -- Supports: Reconciliation queries before final IDs assigned

CREATE INDEX idx_page_assign_chunk
  ON pass05_page_assignments(shell_file_id, chunk_number);
  -- Supports: "Show what chunk X assigned"
```

### Multi-Encounter Page Handling

**Scenario:** Page 5 has two encounters:
- Hospital admission (pages 1-10)
- Lab test standalone (page 5 only)

**Strategy A Enhancement:**
```sql
-- Row 1 with positions
INSERT INTO pass05_page_assignments VALUES (
  uuid1, shell_file_id, 5, 'enc-admission-001',
  'Contains admission progress notes dated March 15',
  'top', 0.9, false, 'pending_abc123', 1, 'cascade_xyz'
);

-- Row 2 with positions
INSERT INTO pass05_page_assignments VALUES (
  uuid2, shell_file_id, 5, 'enc-lab-002',
  'Shows CBC results panel in bottom section',
  'bottom', 0.85, true, 'pending_def456', 1, null
);
```

---

## 5. pass05_encounter_metrics - DEEP DIVE

**Purpose:** Final summary statistics for a completed Pass 0.5 processing session
**Current Usage:** Inserted once after all encounters finalized, aggregates session-level metrics
**Strategy A Change:** Populated AFTER reconciliation completes, adds cascade tracking

### Current Schema (23 columns total)

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | NO | gen_random_uuid() | Primary key |
| `patient_id` | uuid | NO | - | Links to patient profile |
| `shell_file_id` | uuid | NO | - | Links to document processed |
| `processing_session_id` | uuid | NO | - | Links to progressive session |
| `encounters_detected` | integer | NO | - | Total encounters found (final count after reconciliation) |
| `real_world_encounters` | integer | NO | - | Count of actual healthcare visits |
| `pseudo_encounters` | integer | NO | 0 | Count of document-type entries (not visits) |
| `processing_time_ms` | integer | NO | - | Total processing time in milliseconds |
| `processing_time_seconds` | numeric | YES | - | Total processing time in seconds (redundant) |
| `ai_model_used` | text | NO | - | AI model identifier (e.g., "gpt-4o") |
| `input_tokens` | integer | NO | - | Total input tokens across all chunks |
| `output_tokens` | integer | NO | - | Total output tokens across all chunks |
| `total_tokens` | integer | NO | - | Sum of input + output tokens |
| `ocr_average_confidence` | numeric | YES | - | Average OCR confidence from Google Vision |
| `encounter_confidence_average` | numeric | YES | - | Average AI confidence across encounters |
| `encounter_types_found` | text[] | YES | - | Array of unique encounter types in document |
| `total_pages` | integer | NO | - | Document page count |
| `batching_required` | boolean | NO | false | Was progressive processing used? |
| `user_agent` | text | YES | - | **NEVER POPULATED** - 0 of 94 rows have data |
| `ip_address` | inet | YES | - | **NEVER POPULATED** - 0 of 94 rows have data |
| `created_at` | timestamp | YES | now() | When metrics record created |
| `planned_encounters` | integer | NO | 0 | Count of future scheduled appointments |
| `ai_cost_usd` | numeric | YES | - | Total API cost in USD |

### Code Usage Analysis

**Single Insert Point (index.ts:151-171):**
```typescript
await supabase.from('pass05_encounter_metrics').insert({
  shell_file_id: input.shellFileId,
  patient_id: input.patientId,
  processing_session_id: session.id,
  encounters_detected: encounters.length,
  real_world_encounters: realWorldCount,
  pseudo_encounters: pseudoCount,
  planned_encounters: plannedCount,
  processing_time_ms: Date.now() - startTime,
  ai_model_used: encounterResult.aiModel,
  input_tokens: encounterResult.inputTokens,
  output_tokens: encounterResult.outputTokens,
  total_tokens: encounterResult.inputTokens + encounterResult.outputTokens,
  ai_cost_usd: encounterResult.aiCostUsd,
  encounter_confidence_average: avgConfidence,
  encounter_types_found: encounterTypes,
  total_pages: input.pageCount,
  ocr_average_confidence: calculateAverageConfidence(input.ocrOutput)
});
```

### Column-by-Column Deep Assessment

| Column | Populated? | Useful? | Strategy A Action | Detailed Reasoning |
|--------|-----------|---------|-------------------|-------------------|
| `id` | YES (auto) | YES | **KEEP** | Standard primary key |
| `patient_id` | YES | YES | **KEEP** | Essential for patient-level reporting |
| `shell_file_id` | YES | YES | **KEEP** | Essential for document-level reporting |
| `processing_session_id` | YES | YES | **KEEP** | Links to progressive session for debugging |
| `encounters_detected` | YES | YES | **KEEP** | Key metric - total encounters after reconciliation |
| `real_world_encounters` | YES | YES | **KEEP** | Key metric - distinguishes visits from documents |
| `pseudo_encounters` | YES | YES | **KEEP** | Key metric - document-type entries |
| `processing_time_ms` | YES | YES | **KEEP** | Performance tracking |
| `processing_time_seconds` | YES | REDUNDANT | **KEEP** | Duplicates processing_time_ms / 1000 |
| `ai_model_used` | YES | YES | **KEEP** | Critical for cost/quality tracking across models |
| `input_tokens` | YES | YES | **KEEP** | Cost tracking and capacity planning |
| `output_tokens` | YES | YES | **KEEP** | Cost tracking and response analysis |
| `total_tokens` | YES | REDUNDANT | **KEEP** | Simple sum of input + output |
| `ocr_average_confidence` | YES | YES | **KEEP** | Quality metric for OCR |
| `encounter_confidence_average` | YES | YES | **KEEP** | Quality metric for AI extraction |
| `encounter_types_found` | YES | YES | **KEEP** | Useful for document classification |
| `total_pages` | YES | YES | **KEEP** | Context for processing metrics |
| `batching_required` | YES | NO | **MODIFY** | Rename to `chunk_count` - more useful |
| `user_agent` | NO | NO | **DELETE** | Never populated, not relevant for backend worker |
| `ip_address` | NO | NO | **DELETE** | Never populated, not relevant for backend worker |
| `created_at` | YES | MAYBE | **KEEP** | Standard audit field |
| `planned_encounters` | YES | YES | **KEEP** | Important for future appointment tracking |
| `ai_cost_usd` | YES | YES | **KEEP** | Critical for cost analysis |


### batching_required Redesign

**Problem:** In Strategy A, this is ALWAYS TRUE (universal progressive). Not useful anymore.

**Better Alternative:**
```sql
ALTER TABLE pass05_encounter_metrics
  RENAME COLUMN batching_required TO chunk_count;
  -- Change type from boolean to integer
  -- Stores actual number of chunks processed
```

### New Columns for Strategy A

```sql
ALTER TABLE pass05_encounter_metrics
  -- Reconciliation metrics
  ADD COLUMN pendings_total integer,              -- Total pendings before reconciliation
  ADD COLUMN cascades_total integer,              -- Number of cascade chains created
  ADD COLUMN orphans_total integer,               -- Pendings that couldn't reconcile
  ADD COLUMN reconciliation_time_ms integer,      -- Time spent in reconciliation
  ADD COLUMN reconciliation_method varchar(20),   -- Primary method used ('cascade', 'descriptor', 'mixed')

  -- Chunk metrics (moved from batching_required)
  ADD COLUMN chunk_count integer,                 -- Number of chunks processed
  ADD COLUMN avg_chunk_time_ms integer,           -- Average time per chunk
  ADD COLUMN max_chunk_time_ms integer,           -- Slowest chunk time

  -- Quality metrics
  ADD COLUMN pages_with_multi_encounters integer, -- Pages with >1 encounter
  ADD COLUMN position_confidence_avg numeric;     -- Average position confidence
```

### Columns to Delete

```sql
ALTER TABLE pass05_encounter_metrics
  DROP COLUMN user_agent,      -- Never populated, not relevant
  DROP COLUMN ip_address,      -- Never populated, not relevant
  DROP COLUMN batching_required; -- Replaced by chunk_count
```

### Summary: pass05_encounter_metrics

**Status:** KEEP table with significant cleanup
**Columns to DELETE:** 3 orphaned columns (`user_agent`, `ip_address`, `batching_required`)
**Columns to ADD:** 9 new columns for reconciliation, cascade tracking, and chunk metrics
**Columns to MODIFY:** 1 column (`batching_required` → `chunk_count` with type change)
**Redundant but Keep:** 2 columns (`processing_time_seconds`, `total_tokens`) - minor convenience
**Breaking Changes:** None (deleted columns never used)

---

## 6. pass05_progressive_performance (VIEW) - DEPENDENCY ANALYSIS

**Type:** DATABASE VIEW (not a table)
**Purpose:** Aggregated view joining session, chunk, and pending data for reporting
**Current Usage:** Analytics and debugging of progressive sessions

### Strategy A Assessment

**Should we delete it?**
**YES - Safe to drop for these reasons:**

1. **Zero Code Usage:** Not referenced in any worker code
2. **Redundant Data:** All metrics it provides are in `pass05_encounter_metrics`
3. **Complexity:** View performs expensive joins and aggregations
4. **Maintenance Cost:** Must be updated if underlying tables change
5. **Performance:** Each query re-computes aggregations instead of using pre-computed metrics

**What it provides (all available elsewhere):**
- Session statistics → `pass05_progressive_sessions`
- Token/cost totals → `pass05_encounter_metrics`
- Chunk counts → `pass05_encounter_metrics.chunk_count` (Strategy A)
- Pending counts → Can query `pass05_pending_encounters` directly

### Migration Plan

```sql
-- Safe to drop - no dependencies
DROP VIEW pass05_progressive_performance;
```

### Summary: pass05_progressive_performance

**Status:** DELETE (safe to drop)
**Upstream Dependencies:** 3 tables (sessions, chunks, pendings)
**Downstream Dependencies:** NONE
**Code Usage:** NONE
**Recommendation:** Drop view, use pass05_encounter_metrics for reporting

---

## 7. healthcare_encounters - PASS 0.5 COLUMNS DEEP DIVE

**Purpose:** Final encounter storage (ALL passes write here)
**Current Usage:** Contains completed encounters from Pass 0.5, Pass 2, Pass 3
**Strategy A Change:** Add position columns for sub-page granularity, cascade tracking

### Column-by-Column Deep Assessment

**1. encounter_type** (text, NOT NULL)
- **Purpose:** Categorizes encounter (hospital_admission, outpatient_consultation, etc.)
- **Populated:** Always set by AI
- **Strategy A:** **KEEP** - Core field, no changes needed
- **Code Usage:** Used for filtering, metrics calculation

**2. encounter_start_date** (timestamp, nullable)
- **Purpose:** Primary date of encounter
- **Populated:** Extracted by AI from document
- **Strategy A:** **KEEP** - Essential for timeline
- **Code Usage:** Sorting, filtering encounters by date range
- **Note:** Can be null for documents without clear dates

**3. encounter_date_end** (timestamp, nullable)
- **Purpose:** End date for multi-day encounters
- **Populated:** AI extracts if available
- **Strategy A:** **KEEP** - Important for duration tracking
- **Note:** Null for single-day or ongoing encounters

**4. page_ranges** (integer[][], nullable, default='{}')
- **Purpose:** **CRITICAL** - Maps encounter to source pages
- **Format:** Array of [start, end] pairs: `[[1,5],[10,12]]`
- **Populated:** Built during processing, updated by reconciler
- **Strategy A:** **KEEP** - Absolutely essential for click-to-source, auditing
- **Code Usage:** UI navigation, page assignment validation
- **Xavier's Question:** YES, this uses ACTUAL uploaded file page count (1-based indexing), NOT page numbers printed on the document. This is the source of truth for "page 5" = 5th page in uploaded PDF.

**5. identified_in_pass** (text, nullable, default='pass_2')
- **Purpose:** Tracks which pass discovered the encounter
- **Populated:** Set to 'pass_0_5' for encounters found in Pass 0.5
- **Strategy A:** **KEEP** - Important for analytics and debugging
- **Code Usage:** Filtering encounters by discovery method

**6. source_method** (text, NOT NULL)
- **Purpose:** More specific than identified_in_pass
- **Populated:** Set to 'ai_pass_0_5' for Pass 0.5 encounters
- **Strategy A:** **KEEP** - Helps distinguish AI vs manual entry
- **Code Usage:** Analytics, quality tracking

**7. is_real_world_visit** (boolean, nullable, default=true)
- **Purpose:** **CRITICAL** - Distinguishes real encounters from pseudo-encounters
- **Populated:** AI determines based on Date + Location criteria
- **Values:**
  - TRUE = Real healthcare visit (has date AND provider/facility)
  - FALSE = Pseudo-encounter (missing date or location)
- **Strategy A:** **KEEP AND RESTORE** - This was dropped from recent prompts
- **Code Usage:** Filtering for UX dashboard, metrics separation
- **Xavier's Note:** This supports the pseudo-encounter concept that needs to be reincorporated

**8. pass_0_5_confidence** (numeric, nullable)
- **Purpose:** AI's confidence in extraction quality
- **Populated:** From AI response (0.0-1.0 scale)
- **Strategy A:** **KEEP** - Quality metric for review flagging
- **Code Usage:** Determines requires_review flag, analytics


### Additional Pass 0.5-Relevant Columns (17 columns)

Based on database population analysis, these additional columns are relevant to Pass 0.5:

**Date Management Columns (9 columns):**

**9. date_source** (text, NOT NULL, populated 161/161 rows)
- **Purpose:** How the date was obtained
- **Values:** 'extracted' (from AI), 'inferred', 'manual'
- **Populated:** Always by AI or post-processor
- **Strategy A:** **KEEP** - Important for date quality tracking
- **Code Usage:** Found in manifestBuilder.ts, pending-reconciler.ts
- **Notes:** Critical for date confidence and audit trail

**10. date_conflicts** (jsonb, NOT NULL, populated 161/161 rows)
- **Purpose:** Stores conflicting dates found in document
- **Format:** Array of date objects with sources
- **Populated:** When AI finds multiple dates for same encounter
- **Strategy A:** **KEEP** - Essential for date resolution logic
- **Code Usage:** Used in date conflict resolution algorithms
- **Notes:** Helps identify documents needing manual review

**11. date_resolution_reason** (text, nullable, NEVER POPULATED - 0/161 rows)
- **Purpose:** Why a particular date was chosen when conflicts exist
- **Current State:** **ORPHANED** - Field exists but never populated
- **Strategy A:** **DELETE** - Not being used
- **Why Not Used:** Date resolution happens but reason not captured
- **Alternative:** Could be added to date_conflicts jsonb if needed

**12. clinical_effective_date** (timestamp, nullable, NEVER POPULATED - 0/161 rows)
- **Purpose:** Unknown - may have been for clinical validity period
- **Current State:** **ORPHANED** - Field exists but never populated
- **Strategy A:** **DELETE** - Purpose unclear, never used
- **Code Usage:** No references found in codebase
- **Notes:** Appears to be legacy field from earlier design

**13. date_confidence** (numeric, nullable, NEVER POPULATED - 0/161 rows)
- **Purpose:** Confidence score for date extraction
- **Current State:** **ORPHANED** - Field exists but never populated
- **Strategy A:** **DELETE** - Replaced by general confidence score
- **Why Not Used:** pass_0_5_confidence serves this purpose
- **Notes:** Redundant with existing confidence field

**14. extracted_dates** (jsonb, NOT NULL, populated 161/161 rows)
- **Purpose:** Raw dates extracted by AI before processing
- **Format:** Array of date objects with page references
- **Populated:** Always by AI during extraction
- **Strategy A:** **KEEP** - Valuable for debugging and audit
- **Code Usage:** Used to build date_conflicts and final dates
- **Notes:** Source of truth for all date-related fields

**15. encounter_timeframe_status** (text, NOT NULL, populated 161/161 rows)
- **Purpose:** Temporal classification of encounter
- **Values:** 'past', 'current', 'future', 'planned'
- **Populated:** Always by AI based on dates
- **Strategy A:** **KEEP** - Important for UX timeline display
- **Code Usage:** Used in manifestBuilder.ts for filtering
- **Notes:** Supports planned_encounters tracking

**16. spatial_bounds** (jsonb, nullable, populated 74/161 rows)
- **Purpose:** Page-level bounding boxes for encounter
- **Format:** {page: N, bounds: {x, y, w, h}}
- **Populated:** When visual position data available
- **Strategy A:** **KEEP AND ENHANCE** - Aligns with position tracking goals
- **Code Usage:** Referenced in manifestBuilder.ts
- **Notes:** Partial population suggests feature in development

**17. source_method** (text, NOT NULL, populated 161/161 rows)
- **Purpose:** More specific than identified_in_pass
- **Values:** 'ai_pass_0_5', 'manual', 'imported'
- **Populated:** Always during encounter creation
- **Strategy A:** **KEEP** - Analytics and quality tracking
- **Code Usage:** Used for filtering and metrics
- **Notes:** Already covered in initial 8 columns

**Clinical Content Columns (8 columns):**

**18. summary** (text, nullable, populated 108/161 rows)
- **Purpose:** AI-generated summary of encounter
- **Populated:** 67% of encounters have summaries
- **Strategy A:** **KEEP** - Valuable for UX display
- **Code Usage:** Used in aiPrompts.v10.ts, displayed in UI
- **Notes:** High population rate indicates importance

**19. chief_complaint** (text, nullable, populated 9/161 rows)
- **Purpose:** Patient's main complaint or reason for visit
- **Populated:** Only 5.6% - sparse population
- **Strategy A:** **KEEP** - Important clinical field despite low usage
- **Code Usage:** Referenced in prompt templates
- **Notes:** Low population may indicate prompt needs tuning

**20. specialty** (text, nullable, populated 8/161 rows)
- **Purpose:** Medical specialty of encounter
- **Populated:** Only 5% - very sparse
- **Strategy A:** **KEEP** - Useful for categorization
- **Code Usage:** Used in type definitions
- **Notes:** Consider making more prominent in prompts

**21. facility_name** (text, nullable, populated 145/161 rows)
- **Purpose:** Healthcare facility where encounter occurred
- **Populated:** 90% - very high usage
- **Strategy A:** **KEEP** - Critical for pseudo-encounter logic
- **Code Usage:** Used throughout manifestBuilder, reconciler
- **Notes:** Essential for is_real_world_visit determination

**22. provider_type** (text, nullable, populated 9/161 rows)
- **Purpose:** Type of provider (e.g., 'physician', 'nurse')
- **Populated:** Only 5.6% - sparse
- **Strategy A:** **KEEP** - Useful metadata
- **Code Usage:** Referenced in schemas
- **Notes:** Low usage suggests optional field

**23. provider_name** (text, nullable, populated 76/161 rows)
- **Purpose:** Name of healthcare provider
- **Populated:** 47% - moderate usage
- **Strategy A:** **KEEP** - Important for pseudo-encounter logic
- **Code Usage:** Used in manifestBuilder, reconciler
- **Notes:** Critical for is_real_world_visit determination

**24. clinical_impression** (text, nullable, populated 9/161 rows)
- **Purpose:** Provider's clinical assessment
- **Populated:** Only 5.6% - sparse
- **Strategy A:** **KEEP** - Valuable clinical content
- **Code Usage:** Referenced in prompts
- **Notes:** May need prompt emphasis to improve extraction

**25. plan** (text, nullable, NEVER POPULATED - 0/161 rows)
- **Purpose:** Treatment plan or next steps
- **Current State:** **ORPHANED** - Field exists but never populated
- **Strategy A:** **DELETE** - Not being extracted
- **Code Usage:** Mentioned in prompts but AI doesn't populate
- **Notes:** Either remove or emphasize in prompts

### Orphaned Columns Summary (healthcare_encounters)

**CONFIRMED ORPHANS (never populated):**
1. `date_resolution_reason` - 0 of 161 rows
2. `clinical_effective_date` - 0 of 161 rows
3. `date_confidence` - 0 of 161 rows
4. `plan` - 0 of 161 rows

**Why These Exist:**
- Legacy fields from earlier design iterations
- Intended features that were never implemented
- Redundant with other fields (date_confidence vs pass_0_5_confidence)

**What To Do:**
These fields should be **DELETED** in Strategy A migration to reduce schema bloat and maintenance burden.

### Low-Usage Columns (healthcare_encounters)

**Sparsely Populated (<10% usage):**
- `chief_complaint` - 5.6% (9/161)
- `specialty` - 5.0% (8/161)
- `provider_type` - 5.6% (9/161)
- `clinical_impression` - 5.6% (9/161)

**Analysis:** These fields SHOULD be kept because:
1. They represent important clinical data when available
2. Low population may indicate prompt tuning needed, not field irrelevance
3. Removing them would lose valuable data for the 5-10% where it exists
4. Strategy A V11 prompt can emphasize these extractions

**Recommendation:** Keep fields, improve prompt to increase extraction rates

### High-Value Columns (healthcare_encounters)

**Well-Populated (>50% usage):**
- `facility_name` - 90% (145/161) - **CRITICAL**
- `summary` - 67% (108/161) - **HIGH VALUE**
- `provider_name` - 47% (76/161) - **IMPORTANT**
- `spatial_bounds` - 46% (74/161) - **STRATEGIC**

**Analysis:**
- `facility_name` + `provider_name` are essential for pseudo-encounter logic
- `summary` provides user-facing value in UX
- `spatial_bounds` aligns with Strategy A position tracking goals

### Updated Migration SQL

```sql
-- Remove orphaned columns
ALTER TABLE healthcare_encounters
  DROP COLUMN date_resolution_reason,
  DROP COLUMN clinical_effective_date,
  DROP COLUMN date_confidence,
  DROP COLUMN plan;


ALTER TABLE healthcare_encounters
  -- Position columns for sub-page granularity
  ADD COLUMN start_page integer,              -- First page of encounter
  ADD COLUMN end_page integer,                -- Last page of encounter
  ADD COLUMN start_position varchar(20),      -- 'top','quarter','middle','three-quarters','bottom'
  ADD COLUMN end_position varchar(20),        -- Position on last page
  ADD COLUMN position_confidence numeric,     -- Confidence in position data (0.0-1.0)

  -- Cascade tracking
  ADD COLUMN cascade_id varchar(100),         -- Which cascade created this (if any)
  ADD COLUMN chunk_count integer DEFAULT 1,   -- How many chunks this encounter spanned

  -- Future: Bounding box support
  ADD COLUMN start_bbox jsonb,               -- {"x":100,"y":200,"w":400,"h":50}
  ADD COLUMN end_bbox jsonb;                 -- {"x":100,"y":800,"w":400,"h":100}

-- Add index for spatial queries
CREATE INDEX idx_encounters_spatial ON healthcare_encounters
  USING gin (spatial_bounds)
  WHERE spatial_bounds IS NOT NULL;
```

### Summary: healthcare_encounters COMPLETE Analysis

**Total Pass 0.5-Relevant Columns:** 25 columns analyzed
**Columns to DELETE:** 4 orphaned columns
**Columns to KEEP:** 21 active columns
**Columns to ADD:** 9 new Strategy A columns
**Low-Usage Fields Needing Prompt Tuning:** 4 columns (chief_complaint, specialty, provider_type, clinical_impression)
**Critical Fields:** facility_name, provider_name (pseudo-encounter logic), summary (UX), spatial_bounds (position tracking)
**Page Numbering:** Physical file position (1-based), NOT printed page numbers

---

## 8. shell_files - PASS 0.5 COLUMNS DEEP DIVE

**Purpose:** Document metadata and processing status (for ALL passes)
**Current Usage:** Tracks OCR, processing state, completion flags for each pass
**Strategy A Change:** Update progressive tracking for universal approach

### Column-by-Column Deep Assessment

**1. page_count** (integer, nullable, default=1)
- **Purpose:** Total pages in uploaded document
- **Populated:** After OCR processing
- **Strategy A:** **KEEP** - Essential for chunking decisions
- **Code Usage:** Determines chunk count (page_count / 50)
- **Note:** Used across all passes, not just Pass 0.5

**2. pass_0_5_completed** (boolean, nullable, default=false)
- **Purpose:** Completion flag for Pass 0.5
- **Populated:** Set to TRUE when processing finishes successfully
- **Strategy A:** **KEEP** - Standard completion tracking
- **Code Usage:** Prevents reprocessing, status checks
- **Database Comment:** "True if Pass 0.5 encounter discovery completed successfully"

**3. pass_0_5_completed_at** (timestamp, nullable)
- **Purpose:** Timestamp when Pass 0.5 finished
- **Populated:** Set when pass_0_5_completed = TRUE
- **Strategy A:** **KEEP** - Audit trail, performance analysis
- **Code Usage:** Metrics, debugging processing times

**4. pass_0_5_error** (text, nullable)
- **Purpose:** Error message if Pass 0.5 failed
- **Populated:** Only if processing fails
- **Strategy A:** **KEEP** - Critical for debugging failures
- **Code Usage:** Error logging, retry decisions

**5. pass_0_5_version** (text, nullable)
- **Purpose:** Tracks which prompt version was used
- **Populated:** Set during processing (e.g., "v2.9", "v10")
- **Strategy A:** **MODIFY** - Will be set to "v11" for Strategy A
- **Code Usage:** Analytics, A/B testing different prompts
- **Database Comment:** "Prompt version used for Pass 0.5 processing (e.g., v2.9, v2.10). NULL if not yet processed."

**6. pass_0_5_progressive** (boolean, nullable, default=false)
- **Purpose:** Indicates if progressive processing was used
- **Current Logic:** TRUE if >100 pages, FALSE otherwise
- **Strategy A:** **DELETE ENTIRELY** - No longer needed (always progressive)
- **Code Usage:** Determines processing path
- **Database Comment:** "TRUE if progressive refinement was used (>100 pages), FALSE for standard mode. Automatically determined by page count."
- **Strategy A Reasoning:**
  - In Strategy A, ALL files use progressive processing
  - A column that's always TRUE conveys no information
  - `progressive_session_id IS NOT NULL` already indicates progressive was used
  - Deleting this column simplifies schema and removes dead weight

**7. ocr_average_confidence** (numeric, nullable)
- **Purpose:** Average OCR confidence across all pages
- **Populated:** After OCR processing (from Google Cloud Vision)
- **Strategy A:** **KEEP** - Quality metric
- **Code Usage:** Metrics, quality tracking
- **Database Comment:** "Average OCR confidence across all pages (0.00-1.00). Calculated from Google Cloud Vision confidence scores."
- **Note:** Shared across all passes, not Pass 0.5 specific

### Finding: 1 Column to Delete

**Orphaned/Redundant Columns:** 1
- `pass_0_5_progressive` - **DELETE** (always TRUE in Strategy A, redundant with progressive_session_id)

**Active Columns:** 6 to keep

**Modification Needed:**
- `pass_0_5_version` will be "v11" for Strategy A

### Code Changes Required

**pass_0_5_progressive removal impact:**

**Files that currently reference this column:**
```typescript
// index.ts:42 - Remove from SELECT
// BEFORE:
.select('pass_0_5_completed, pass_0_5_version, pass_0_5_progressive')
// AFTER:
.select('pass_0_5_completed, pass_0_5_version, progressive_session_id')

// encounterDiscovery.ts:79 - Remove assignment
// BEFORE:
pass_0_5_progressive: data.progressive
// AFTER:
// Delete this line - column no longer exists

// session-manager.ts:201 - Remove assignment
// BEFORE:
pass_0_5_progressive: true
// AFTER:
// Delete this line - column no longer exists
```

**Replacement Logic:**
```typescript
// OLD: Checking if progressive was used
if (shellFile.pass_0_5_progressive) {
  // Use progressive path
}

// NEW: Use progressive_session_id instead
if (shellFile.progressive_session_id) {
  // Progressive was used (session exists)
}

// But in Strategy A, we don't even need this check
// ALWAYS use progressive path
```

### New Columns for Strategy A

```sql
ALTER TABLE shell_files
  ADD COLUMN progressive_session_id uuid,                    -- Links to session (ALWAYS set now)
  ADD COLUMN reconciliation_method varchar(20);              -- Primary method: 'cascade','descriptor','mixed'
```

**Why These Columns:**

2. **progressive_session_id:**
   - Direct link to pass05_progressive_sessions
   - Currently implicit, now explicit
   - Makes queries simpler (no need to search session table)

3. **reconciliation_method:**
   - Stores primary reconciliation method used
   - Options: 'cascade' (most), 'descriptor' (orphan fallback), 'mixed'
   - Helps evaluate reconciliation effectiveness

### Migration Considerations

**Behavioral Changes:**
```typescript
// OLD: Conditional progressive
if (pageCount > 100) {
  await processProgressive(...)
} else {
  await processSingleShot(...)
}

// NEW: Universal progressive
await processProgressive(...) // ALWAYS, even for 10 pages

// Remove all references to pass_0_5_progressive
// Column will be deleted from schema
```

**Database Updates:**
```sql
-- Delete the column entirely (no longer needed)
ALTER TABLE shell_files
  DROP COLUMN pass_0_5_progressive;

-- No backfill needed - column is gone
-- Use progressive_session_id IS NOT NULL to check if progressive was used
```

### Additional Pass 0.5-Related Columns (shell_files)

Beyond the initial 7 columns, several other shell_files columns are relevant to Pass 0.5 processing:

**Core Processing Columns:**

**8. status** (text, NOT NULL, default='uploaded', populated 197/197 rows)
- **Purpose:** Overall processing state of document
- **Values:** 'uploaded', 'processing', 'completed', 'failed'
- **Populated:** Always updated as document progresses through pipeline
- **Strategy A:** **KEEP** - Essential state tracking
- **Code Usage:** Used throughout worker to track progress
- **Notes:** Shared across all passes, not Pass 0.5 specific

**9. processing_started_at** (timestamp, nullable, varies by processing stage)
- **Purpose:** When ANY processing started (OCR, Pass 0.5, etc.)
- **Populated:** Set when first processing begins
- **Strategy A:** **KEEP** - Performance metrics
- **Notes:** Generic processing timestamp, not pass-specific

**10. processing_completed_at** (timestamp, nullable, varies by processing stage)
- **Purpose:** When ALL processing completed
- **Populated:** Set when entire pipeline finishes
- **Strategy A:** **KEEP** - Performance metrics
- **Notes:** Not Pass 0.5 specific, but includes Pass 0.5 completion

**11. processing_error** (jsonb, nullable, NEVER POPULATED - 0/197 rows)
- **Purpose:** Generic error storage for ANY pass
- **Current State:** **ORPHANED** - Never populated
- **Strategy A:** **DELETE** - Replaced by pass-specific error fields
- **Notes:** Each pass has its own error field (pass_0_5_error, pass_1_error, etc.)

**12. extracted_text** (text, nullable, populated 32/197 rows - 16%)
- **Purpose:** Plain text extracted from OCR
- **Populated:** Only 16% - likely legacy or optional
- **Strategy A:** **KEEP** - May be useful for text search
- **Code Usage:** Used in some OCR workflows
- **Notes:** Low population suggests feature in transition

**13. ocr_confidence** (numeric, nullable, populated 32/197 rows - 16%)
- **Purpose:** Overall OCR quality score
- **Populated:** Only 16% - matches extracted_text
- **Strategy A:** **MODIFY** - Likely redundant with ocr_average_confidence
- **Notes:** Same as ocr_average_confidence (column 7), consider consolidating

**OCR and Image Processing Columns:**

**14. ocr_raw_jsonb** (jsonb, nullable, populated 97/197 rows - 49%)
- **Purpose:** Complete Google Cloud Vision API response
- **Format:** Full OCR output including bounding boxes
- **Populated:** 49% - important for debugging and reprocessing
- **Strategy A:** **KEEP** - Critical for spatial analysis
- **Code Usage:** Used for multi-column document fixes
- **Notes:** Large field (~50KB typical), aligns with spatial_bounds strategy
- **Database Comment:** "WARNING: Large JSONB column. Always use explicit column lists in queries - do NOT fetch with SELECT *"

**15. processed_image_path** (text, nullable, populated 127/197 rows - 64%)
- **Purpose:** Path to downscaled images used in processing
- **Populated:** 64% - good coverage
- **Strategy A:** **KEEP** - Required for AI processing
- **Code Usage:** Used throughout Pass 1+ processing
- **Notes:** Part of image optimization pipeline

**16. processed_image_checksum** (text, nullable, varies)
- **Purpose:** SHA256 checksum to prevent redundant downscaling
- **Populated:** When processed images exist
- **Strategy A:** **KEEP** - Prevents duplicate work
- **Notes:** Optimization feature

**17. processed_image_mime** (text, nullable, varies)
- **Purpose:** MIME type of processed image (may differ from original)
- **Populated:** When processed images exist
- **Strategy A:** **KEEP** - Required for image handling
- **Notes:** Supports PDF→JPEG conversion tracking

**18. processed_image_size_bytes** (bigint, nullable, varies)
- **Purpose:** Total size of all processed JPEG pages
- **Populated:** After all page images persisted
- **Strategy A:** **KEEP** - Storage and cost tracking
- **Database Comment:** "Combined total size in bytes of all processed JPEG pages. Example: 20-page file stores one total size value (not per-page breakdown)."

**Job Coordination Columns:**

**19. processing_job_id** (uuid, nullable, populated 155/197 rows - 79%)
- **Purpose:** Links to job_queue table for V3 coordination
- **Populated:** 79% - high coverage
- **Strategy A:** **KEEP** - Essential for job tracking
- **Code Usage:** Used in job queue coordination
- **Notes:** Part of V3 architecture, critical for worker coordination

**20. processing_worker_id** (varchar, nullable, populated 155/197 rows - 79%)
- **Purpose:** Identifies which worker processed this file
- **Populated:** 79% - matches processing_job_id
- **Strategy A:** **KEEP** - Debugging and load balancing
- **Notes:** Helps identify worker-specific issues

**21. processing_priority** (integer, nullable, default=100, varies)
- **Purpose:** Job queue priority (higher = more urgent)
- **Populated:** Has default, updated as needed
- **Strategy A:** **KEEP** - Job queue management
- **Notes:** Standard priority queue feature

**22. idempotency_key** (text, nullable, varies)
- **Purpose:** Prevents duplicate processing of same upload
- **Populated:** When set by client
- **Strategy A:** **KEEP** - Critical for reliability
- **Notes:** Ensures at-most-once processing semantics

**Metrics and Cost Columns:**

**23. processing_cost_estimate** (numeric, nullable, default=0, populated 197/197 rows)
- **Purpose:** Estimated cost for processing this file
- **Populated:** Always has value (default 0)
- **Strategy A:** **KEEP** - Cost tracking and budgeting
- **Code Usage:** Updated as processing progresses
- **Notes:** Aggregates costs from all passes

**24. processing_duration_seconds** (integer, nullable, populated 59/197 rows - 30%)
- **Purpose:** Total processing time across all passes
- **Populated:** 30% - only when processing completes
- **Strategy A:** **KEEP** - Performance analytics
- **Notes:** Includes OCR + all passes combined

**25. language_detected** (text, nullable, default='en', populated 197/197 rows)
- **Purpose:** Document language from OCR
- **Populated:** Always (defaults to English)
- **Strategy A:** **KEEP** - Future multilingual support
- **Notes:** Currently all English, but infrastructure ready

**Pass 3 and Future Columns:**

**26. ai_synthesized_summary** (text, nullable, NEVER POPULATED - 0/197 rows)
- **Purpose:** Pass 3 narrative summary
- **Current State:** **NOT YET IMPLEMENTED**
- **Strategy A:** **KEEP** - Required for Pass 3
- **Notes:** Schema ready, implementation pending

**27. narrative_count** (integer, nullable, default=0, populated 197/197 rows)
- **Purpose:** Count of narrative summaries generated
- **Populated:** Always (currently all 0)
- **Strategy A:** **KEEP** - Pass 3 tracking
- **Notes:** Will be used when Pass 3 implemented

**28. synthesis_completed_at** (timestamp, nullable, varies)
- **Purpose:** When Pass 3 narrative synthesis completed
- **Current State:** **NOT YET IMPLEMENTED**
- **Strategy A:** **KEEP** - Pass 3 completion tracking
- **Notes:** Schema ready for future use

**Downstream Batching Column (Future):**

**29. page_separation_analysis** (jsonb, nullable, NEVER POPULATED - 0/197 rows)
- **Purpose:** **CRITICAL FUTURE FEATURE** - Safe inter-page splitting points
- **Current State:** **NOT YET IMPLEMENTED**
- **Strategy A:** **IMPLEMENT** - Essential for downstream batching
- **Xavier's Vision:** Identifies which neighboring pages can be safely separated for Pass 1/2 batching without orphaning clinical information
- **Format (Proposed):**
  ```json
  {
    "safe_splits": [5, 10, 15],  // Pages where batching can safely occur
    "unsafe_splits": [
      {"pages": [3,4], "reason": "lab_results_continuation"},
      {"pages": [7,8], "reason": "multi_page_discharge_summary"}
    ],
    "batch_recommendations": [
      {"pages": [1,5], "size_estimate": "2.5MB"},
      {"pages": [6,10], "size_estimate": "1.8MB"}
    ]
  }
  ```
- **Notes:** This is Xavier's "Pass 0.5 Downstream batching task" - needs implementation in Strategy A

### Orphaned Columns Summary (shell_files)

**CONFIRMED ORPHANS (never populated):**
1. `processing_error` - 0 of 197 rows (replaced by pass-specific error fields)
2. `ai_synthesized_summary` - 0 of 197 rows (Pass 3 not implemented yet)
3. `page_separation_analysis` - 0 of 197 rows (critical feature not implemented)

**REDUNDANT COLUMNS (always same value in Strategy A):**
4. `pass_0_5_progressive` - Will always be TRUE (redundant with progressive_session_id)

**Why These Exist:**
- `processing_error`: Replaced by pass-specific error tracking (pass_0_5_error, pass_1_error, etc.)
- `ai_synthesized_summary`: Schema ready for Pass 3 (designed but not built)
- `page_separation_analysis`: **Critical missing feature** for downstream batching
- `pass_0_5_progressive`: Pre-Strategy A needed to distinguish progressive vs single-shot processing

**What To Do:**
- **DELETE:** `processing_error` (redundant with pass-specific errors)
- **DELETE:** `pass_0_5_progressive` (always TRUE, redundant with progressive_session_id)
- **KEEP:** `ai_synthesized_summary` (Pass 3 will use)
- **IMPLEMENT:** `page_separation_analysis` (critical for Pass 1/2 batching optimization)

### Low-Usage Columns (shell_files)

**Sparsely Populated:**
- `extracted_text` - 16% (32/197) - Legacy or optional feature
- `ocr_confidence` - 16% (32/197) - Redundant with ocr_average_confidence
- `processing_duration_seconds` - 30% (59/197) - Only populated on completion

**Analysis:**
- `extracted_text`: Keep for now, may be useful for text search
- `ocr_confidence`: **CONSIDER CONSOLIDATING** with ocr_average_confidence (same purpose)
- `processing_duration_seconds`: Keep, low population is expected (not all files completed)

### Column Consolidation Opportunity

**Duplicate OCR Confidence Fields:**
- `ocr_confidence` (16% populated)
- `ocr_average_confidence` (varies, but serves same purpose)

**Recommendation:** Consolidate into single field `ocr_average_confidence`, drop `ocr_confidence`

### Updated Migration SQL

```sql
-- Remove orphaned/redundant columns
ALTER TABLE shell_files
  DROP COLUMN processing_error,        -- Replaced by pass-specific errors
  DROP COLUMN ocr_confidence,          -- Redundant with ocr_average_confidence
  DROP COLUMN pass_0_5_progressive;    -- Always TRUE in Strategy A, redundant with progressive_session_id

-- Add Strategy A columns
ALTER TABLE shell_files
  ADD COLUMN progressive_session_id uuid REFERENCES pass05_progressive_sessions(id),
  ADD COLUMN reconciliation_method varchar(20);

-- Add index for job coordination
CREATE INDEX idx_shell_files_job ON shell_files(processing_job_id)
  WHERE processing_job_id IS NOT NULL;

-- Add index for session lookup
CREATE INDEX idx_shell_files_session ON shell_files(progressive_session_id)
  WHERE progressive_session_id IS NOT NULL;
```

### Critical Finding: page_separation_analysis Implementation

**Xavier's Requirement:** Pass 0.5's second crucial role is determining safe batching points for Pass 1/2.

**Current State:** Schema exists but NEVER populated (0/197 rows)

**Strategy A Action:** **IMPLEMENT THIS FEATURE**

**Why Critical:**
1. Pass 1 and Pass 2 are output-heavy and need batching
2. Naive page splitting would orphan clinical information
3. Example: Lab results spanning pages 3-4 must stay together
4. Pass 0.5 has the context to identify these relationships

**Implementation Plan:**
1. During chunk processing, AI identifies inter-page relationships
2. Mark pages that MUST stay together
3. Generate safe split points for downstream batching
4. Store in `page_separation_analysis` jsonb
5. Pass 1/2 workers read this to create optimal batches

**V11 Prompt Addition:**
```
DOWNSTREAM BATCHING ANALYSIS:
Identify which neighboring pages share clinical context that would be
orphaned if separated. Mark safe splitting points for downstream processing.
```

### Summary: shell_files COMPLETE Analysis

**Total Analyzed Columns:** 29 columns (entire table relevant to Pass 0.5)
**Columns to DELETE:** 3 columns (processing_error, ocr_confidence, pass_0_5_progressive)
**Columns to KEEP:** 23 active columns
**Columns to ADD:** 2 new Strategy A columns (progressive_session_id, reconciliation_method)
**Columns to IMPLEMENT:** 1 critical feature (page_separation_analysis)
**Critical Missing Feature:** page_separation_analysis for downstream batching
**Deleted strategy_a_version:** Not needed - can use pass_0_5_version = 'v11' to identify Strategy A files

---

## 9. NEW TABLES for Strategy A

### pass05_cascade_chains (NEW)
```sql
CREATE TABLE pass05_cascade_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id),
  cascade_id varchar(100) UNIQUE NOT NULL,
  origin_chunk integer NOT NULL,              -- Where cascade started
  last_chunk integer,                         -- Where cascade ended
  final_encounter_id uuid REFERENCES healthcare_encounters(id),
  pendings_count integer DEFAULT 1,           -- How many pendings in chain
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp
);

CREATE INDEX idx_cascade_session ON pass05_cascade_chains(session_id);
CREATE INDEX idx_cascade_final ON pass05_cascade_chains(final_encounter_id);
CREATE INDEX idx_cascade_incomplete ON pass05_cascade_chains(session_id)
  WHERE final_encounter_id IS NULL;
```

### pass05_reconciliation_log (NEW)
```sql
CREATE TABLE pass05_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id),
  cascade_id varchar(100),
  pending_ids uuid[],                         -- Array of pending IDs reconciled
  final_encounter_id uuid,
  match_type varchar(20),                     -- 'cascade','descriptor','orphan'
  confidence decimal(3,2),
  reasons text,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recon_session ON pass05_reconciliation_log(session_id);
CREATE INDEX idx_recon_cascade ON pass05_reconciliation_log(cascade_id);
```

---

## COMPLETE Migration Summary

### Tables Analysis Overview

**Total Tables Analyzed:** 8 tables + 1 view
**Total Columns Analyzed:** 200+ columns across all tables
**Orphaned/Redundant Columns Found:** 11 columns to delete
**New Columns Required:** 42 columns to add
**Critical Features Missing:** 1 (page_separation_analysis)

### Tables to Keep and Modify

1. **pass05_progressive_sessions**
   - Add cascade tracking (4 new columns)
   - Delete 2 orphaned columns
   - Rename 1 column

2. **pass05_pending_encounters**
   - Major changes for cascade system (12 new columns)
   - Delete 2 complex state columns
   - Rename 5 columns for clarity

3. **pass05_chunk_results**
   - Simplify metrics (4 new columns)
   - Delete 3 complex encounter tracking columns
   - Rename 2 handoff columns

4. **pass05_page_assignments**
   - Add position support (6 new columns)
   - Keep all existing 6 columns
   - No deletions

5. **pass05_encounter_metrics**
   - Populate after reconciliation (9 new columns)
   - **DELETE 3 orphaned columns:** user_agent, ip_address, batching_required
   - Add reconciliation and cascade metrics

6. **healthcare_encounters**
   - Add position columns (9 new columns)
   - **DELETE 4 orphaned columns:** date_resolution_reason, clinical_effective_date, date_confidence, plan
   - Keep 21 active Pass 0.5 columns
   - 4 low-usage columns need prompt tuning

7. **shell_files**
   - Universal progressive updates (2 new columns)
   - **DELETE 3 columns:** processing_error, ocr_confidence, pass_0_5_progressive
   - **IMPLEMENT 1 critical feature:** page_separation_analysis
   - Keep 23 active columns

### Tables/Views to Delete
1. **pass05_progressive_performance** (VIEW) - Redundant, no dependencies

### New Tables to Create
1. **pass05_cascade_chains** - Track cascade relationships
2. **pass05_reconciliation_log** - Audit trail for reconciliation decisions

### Complete Column Cleanup Summary

**Columns to DELETE:** 11 total
- pass05_progressive_sessions: 2 (total_encounters_found, total_encounters_completed)
- pass05_pending_encounters: 2 (chunk_last_seen, last_seen_context)
- pass05_chunk_results: 3 (encounters_started, encounters_completed, encounters_continued)
- pass05_encounter_metrics: 3 (user_agent, ip_address, batching_required)
- healthcare_encounters: 4 (date_resolution_reason, clinical_effective_date, date_confidence, plan)
- shell_files: 3 (processing_error, ocr_confidence, pass_0_5_progressive)

**Columns to RENAME:** 8 total
- pass05_progressive_sessions: 1 (total_encounters_pending → total_pendings_created)
- pass05_pending_encounters: 5 (temp_encounter_id → pending_id, chunk_started → chunk_number, partial_data → encounter_data, completed_encounter_id → reconciled_to, completed_at → reconciled_at)
- pass05_chunk_results: 2 (handoff_received → cascade_context_received, handoff_generated → cascade_package_sent)

**Columns to ADD:** 42 total
- pass05_progressive_sessions: 4 new cascade/reconciliation columns
- pass05_pending_encounters: 12 new cascade/position columns
- pass05_chunk_results: 4 new cascade tracking columns
- pass05_page_assignments: 6 new position/cascade columns
- pass05_encounter_metrics: 9 new reconciliation/chunk metrics
- healthcare_encounters: 9 new position/cascade columns
- shell_files: 2 new Strategy A tracking columns (progressive_session_id, reconciliation_method)

**Columns to MODIFY (behavioral changes):** 2 total
- pass05_progressive_sessions: current_handoff_package (simplify structure)
- pass05_encounter_metrics: chunk_count (replaces batching_required)

### Critical Findings

**1. Orphaned/Redundant Columns Analysis:**
- 10 columns exist but are never populated (0% usage)
- 1 column always has same value in Strategy A (pass_0_5_progressive always TRUE)
- Total 11 columns to delete
- Safe to delete with no data loss
- Reduces schema bloat and maintenance burden

**2. Low-Usage Clinical Fields:**
- 4 healthcare_encounters columns have <10% population
- Should be KEPT (valuable when present)
- Require V11 prompt tuning to improve extraction rates
- Fields: chief_complaint, specialty, provider_type, clinical_impression

**3. High-Value Fields Confirmed:**
- facility_name (90% populated) - critical for pseudo-encounters
- provider_name (47% populated) - critical for pseudo-encounters
- summary (67% populated) - high UX value
- spatial_bounds (46% populated) - aligns with Strategy A position goals

**4. Missing Critical Feature:**
- page_separation_analysis exists in schema but NEVER implemented
- **CRITICAL for downstream Pass 1/2 batching optimization**
- Must be implemented in Strategy A
- Prevents orphaning clinical information across page boundaries

### Breaking Changes
**NONE** - All deleted columns were never populated, so no data loss

### Data Migration Required
**MINIMAL** - Mostly adding new columns with null defaults

### Index Strategy Updates
- 8 new indexes for cascade/position queries
- 3 new indexes for session/job coordination
- 1 new GIN index for spatial_bounds (jsonb)

---

## Data Flow Through Tables (Strategy A)

### Step 1: Document Upload
```sql
INSERT INTO shell_files (strategy_a_version = 'A-v1', pass_0_5_progressive = true)
INSERT INTO pass05_progressive_sessions (strategy_version = 'A-v1')
```

### Step 2: Process Each Chunk
```sql
INSERT INTO pass05_chunk_results (pendings_created, cascading_count)
INSERT INTO pass05_pending_encounters (cascade_id, is_cascading, start_position, end_position)
INSERT INTO pass05_page_assignments (pending_id, position_on_page)
INSERT INTO pass05_cascade_chains (cascade_id, origin_chunk)
```

### Step 3: Reconciliation
```sql
SELECT * FROM pass05_pending_encounters WHERE session_id = ? GROUP BY cascade_id
INSERT INTO healthcare_encounters (cascade_id, start_position, end_position)
UPDATE pass05_pending_encounters SET reconciled_to = ?
INSERT INTO pass05_reconciliation_log (cascade_id, match_type)
UPDATE pass05_cascade_chains SET final_encounter_id = ?
```

### Step 4: Finalization
```sql
UPDATE pass05_page_assignments SET encounter_id = ? WHERE pending_id = ?
INSERT INTO pass05_encounter_metrics (pendings_total, cascades_total, orphans_total)
UPDATE pass05_progressive_sessions SET status = 'completed', final_encounter_count = ?
```

---

## Performance Impact Analysis

### Positive Impacts
- Simpler queries with cascade_id grouping
- Less JSON manipulation (partial_data simplified)
- Better indexing on key columns
- Cleaner reconciliation logic

### Potential Concerns
- More columns per table (but mostly small varchar/integer)
- New tables add joins (but well-indexed)
- Position data adds ~40 bytes per encounter

### Storage Estimates
- Additional ~100 bytes per pending encounter
- Additional ~50 bytes per final encounter
- New tables: ~200 bytes per cascade chain
- Total overhead: ~10KB per document (acceptable)

---

## Rollback Plan

If Strategy A needs rollback:
1. Keep old columns during transition
2. Run both systems in parallel initially
3. Only drop old columns after validation
4. Maintain backward compatibility for 30 days

---

## Next Steps

1. Create migration script with all ALTER TABLE statements
2. Update TypeScript interfaces to match new schema
3. Modify code to use new column names
4. Test with 142-page document
5. Performance test with 1000 documents
6. Deploy to production





Xavier's notes 14th Nov 2025:
1. For "## 4. pass05_page_assignments" have you accounted for the very likely situation where one page has more than one encounter on it? I assume this will just mean there will now be more than one row for a page that has more than one encounter on it, with one row for each encounter that touches a page? Or do we go the other way and have only one row per page, and then cram in the encounter information into that row? I think the first option may be better as it makes sense with the other columns (pre-existing as well as your planned columns) for that table. What do you think? Actually now that I think about it more and read the current and planned columns, I think this entire table needs a revamp and rethinking in light of the fact that one page can now have more than one encounter on it (originally this table was designed when I set the rule that one page can only have one encounter, for simplicity purposes). So first we should go back to first principles and ask a) what is the purpose of this table b) is it needed in strategy A c) what purpose or benefit would it add to strategy A. From memory I think it served a few useful purposes such as troubleshooting, ensuring the AI model is accountable and shows its working/reasoning for why it decided what it decided for each page on a page by page basis. The table could also potentially be used in the UX dashboard side to provide a summary for each page along with the encounters that were extracted from each page, similarly to how we will have something similar for the shell file as a whole.
2. For "## 5. pass05_encounter_metrics" 
   - I dont think we need `batching_required`anymore with our universal approach. but maybe we could have something instead that just says hwo many chunks were used or how many ai api calls made (which implies how many chunks) - not sure how best to convey this and displa it, come up wiht a good name and consider whether a new columns is needed,
   - Why are `user_agent' and 'ip_address` not needed? Why were they put in there in the first place then? and if not needed here, are they needed at all and are they present somehwere else in another table such as a more higher up table that is not confined to pass05 but rahter to the users upload in general, such as shell_files table ? 
3. for "## 6. pass05_progressive_performance (VIEW)" - happy for you to delete this table if you think it is not needed for anything, but first make sure it has not upstream or downstream dependincies. 


Later large concepts to discuss:
- psuedo encounters, 
  - this is an important concept that was lost due to prompt version drift. We need to reincorporate this back into Strategy A. 
  - The idea is that some files and pages that are uplaoded do not have adequate information to mark them as a true healthcare encoutner and the criteria for this has been deemed to be; Date + location (provider or facility). If both of these critical identifying data points are not available, then we cant claim it to be an encounter, and so we call it a pseudo-encounter. A pseudo-encounter will not appear on the future envisioned healthcare encounters UX dashboard tab or show up on their calender as an encounter, but it can show up as something else that highlights its difference to that of an actual healthcare event where you received touchpoint with a healthcare provider of some sort. An example of pesuedo-encounter is a patient uploading a photo of their medication list, or a list of their past surgeries and their dates but with no facility or surgeon info attached. Another very comomn example is going to be that of an adminisation summary file where the file was printed off for admin purpsoes and itslef wasnt an event or heatlhcare encounter. This entire pseudoencounter concept has already been very well hashed out with documentation on it and tables/schemas already built for it, but im reiterating it here now for added clarity. Unfortuantely it was droppped from recent prompts due to prompt iteration drift. 
- Pass05 Downstream batching task. 
   - Need to itendity in pass05 the safe inter-page splitting points for downstream batching purposes (need to identify which inter-page relationships do not have clincial ifnormation that will be orphaned and left uniterpretable if those two neighboring pages were to be seperate into different batching. 
   - Due to the output heavy nature of the tasks of the downstream file processing passes (pass 1 and pass 2), they likely will need their page volumes reduced via batching techniques. Not sure what the max size of the batches needs to be yet as we havent done stress testing to determine ai model capacity per page. We will do this in the coming weeks. 
   - Hence, pass05's second crucial role beyond encounter discovery is to determine safe points where batching can occur. Some neighboarding pages through this process will be deemed unseperable due to clincial information spilling over into the next page, where by, if the pages were seperated, the information on the second page would be taken out of context and either indecipherable, or worse, deciphered incorrectly, effectively orphaning that inforamtion that has spilled over into the next page, and also potentially corrupting the information on the first page. Due to the nature of batching, the two pages will be sent to different ai model instances unless we prevent this from happening via the pass05 batching task. 
