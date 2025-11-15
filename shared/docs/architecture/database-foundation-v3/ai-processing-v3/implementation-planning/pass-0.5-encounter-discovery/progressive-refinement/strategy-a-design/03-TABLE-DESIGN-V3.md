# Pass 0.5 Strategy A - Table Migration Plan V3

**Date:** November 14, 2024 (Updated: November 15, 2024)
**Version:** 3.1
**Purpose:** Complete migration plan for Strategy A with two-touchpoint workflow preparation

**MAJOR UPDATE (Nov 15, 2024):** Position tracking system updated to match batching design pattern (inter_page vs intra_page boundaries). Column count increased from 47 to 58.

---

## Executive Summary

### What is Strategy A?

**Universal Progressive Processing** - ALL documents (1-page to 1000-page) use the same progressive chunk-based processing pipeline.

**Key Changes:**
- Cascade-based encounter continuity (replaces complex state tracking)
- Sub-page position granularity for encounters
- Simplified reconciliation (group by cascade_id)
- Two critical features:
  1. **Pseudo-encounter support** (already in schema, needs V11 prompt emphasis)
  2. **Downstream batching analysis** (schema exists, needs implementation)

### Migration Scope

**Tables Analyzed:** 8 tables + 1 view
**Total Columns Analyzed:** 200+ columns
**Columns to DELETE:** 17 orphaned/redundant columns
**Columns to RENAME:** 8 columns for clarity
**Columns to ADD:** 58 new columns (includes 11 additional for inter_page/intra_page position tracking)
**New Tables:** 2 (cascade_chains, reconciliation_log)
**Design Pattern:** Position tracking matches BATCHING-TASK-DESIGN-V2.md (inter_page vs intra_page boundaries)
**Views to DROP:** 1 (pass05_progressive_performance)
**Breaking Changes:** NONE (all deletions are orphaned columns)

### Key Features Status

#### 1. Pseudo-Encounters: READY ✓
- **Schema:** `is_real_world_visit` column exists in healthcare_encounters
- **Logic:** Date + Location (provider OR facility) = real encounter
- **Missing Date OR Location** = pseudo-encounter
- **Status:** Working in code, needs V11 prompt emphasis
- **Criteria:**
  ```
  is_real_world_visit = TRUE  → has encounter_start_date AND (provider_name OR facility_name)
  is_real_world_visit = FALSE → missing date OR missing location
  ```

#### 2. Downstream Batching: NEEDS IMPLEMENTATION
- **Schema:** `page_separation_analysis` exists in BOTH `pass05_chunk_results` (during processing) and `shell_files` (after reconciliation)
- **Purpose:** Identify ADDITIONAL safe split points beyond encounter boundaries for Pass 1/2 batching
- **Key Design:** Pass 0.5 identifies splits WITHIN encounters, NOT encounter boundaries themselves
- **Storage:** Hybrid approach - per-chunk during processing, document-wide after reconciliation
- **Status:** Schema exists but needs columns added, V11 prompt needed
- **Critical:** Prevents orphaning clinical information when batching for Pass 1/2
- **Details:** See `06-BATCHING-TASK-DESIGN-V2.md` for complete specification

---

## Part 1: Tables Requiring Migration

### Summary Table

| Table | DELETE | RENAME | ADD | New Indexes | Migration Complexity |
|-------|--------|--------|-----|-------------|---------------------|
| pass05_progressive_sessions | 2 | 1 | 4 | 0 | Low |
| pass05_pending_encounters | 2 | 5 | 18 | 5 | High |
| pass05_chunk_results | 3 | 2 | 5 | 1 | Medium |
| pass05_page_assignments | 0 | 0 | 6 | 5 | Medium |
| pass05_encounter_metrics | 3 | 0 | 9 | 0 | Medium |
| healthcare_encounters | 4 | 0 | 14 | 2 | Low |
| shell_files | 3 | 0 | 2 | 2 | Low |
| **TOTALS** | **17** | **8** | **58** | **15** | - |

### New Tables to Create

| Table | Purpose | Rows per Document | Migration Complexity |
|-------|---------|-------------------|---------------------|
| pass05_cascade_chains | Track cascade relationships | ~0-5 | Low |
| pass05_reconciliation_log | Audit reconciliation decisions | ~1-10 | Low |

### Views to Drop

| View | Reason | Dependencies | Risk |
|------|--------|--------------|------|
| pass05_progressive_performance | Redundant with pass05_encounter_metrics | None | None |

---

## Part 2: Table-by-Table Migration Plans

### 1. pass05_progressive_sessions

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Tracks progressive processing sessions for documents
**Strategy A Change:** Used for ALL documents (not just >100 pages)

#### Changes Required

**DELETE (2 columns):**
- `total_encounters_found` - Always 0 until reconciliation
- `total_encounters_completed` - Always 0 until reconciliation

**RENAME (1 column):**
- `total_encounters_pending` → `total_pendings_created`

**ADD (4 columns):**
```sql
total_cascades integer DEFAULT 0           -- Number of cascade chains created
strategy_version varchar(10) DEFAULT 'A-v1' -- Track strategy version
reconciliation_completed_at timestamp       -- When reconciliation finished
final_encounter_count integer              -- Count after reconciliation
```

**MODIFY (1 column behavior):**
- `current_handoff_package` - Simplify from complex state to cascade context only

#### Migration SQL Preview

```sql
-- Remove orphaned columns
ALTER TABLE pass05_progressive_sessions
  DROP COLUMN total_encounters_found,
  DROP COLUMN total_encounters_completed;

-- Rename for clarity
ALTER TABLE pass05_progressive_sessions
  RENAME COLUMN total_encounters_pending TO total_pendings_created;

-- Add Strategy A columns
ALTER TABLE pass05_progressive_sessions
  ADD COLUMN total_cascades integer DEFAULT 0,
  ADD COLUMN strategy_version varchar(10) DEFAULT 'A-v1',
  ADD COLUMN reconciliation_completed_at timestamp,
  ADD COLUMN final_encounter_count integer;
```

#### Impact Summary

- **Breaking Changes:** None (deleted columns never populated)
- **Code Updates:** Update queries that reference renamed/deleted columns
- **Data Migration:** None required
- **Testing:** Verify new columns populate correctly during processing

---

### 2. pass05_pending_encounters

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Temporary storage for encounters during processing
**Strategy A Change:** Hub table - ALL encounters pass through here before reconciliation

#### Changes Required

**DELETE (2 columns):**
- `chunk_last_seen` - Not needed with cascade system
- `last_seen_context` - Replaced by cascade_id

**RENAME (5 columns):**
- `temp_encounter_id` → `pending_id`
- `chunk_started` → `chunk_number`
- `partial_data` → `encounter_data`
- `completed_encounter_id` → `reconciled_to`
- `completed_at` → `reconciled_at`

**ADD (18 columns):**
```sql
-- Core cascade support
cascade_id varchar(100)                    -- Links cascading encounters
is_cascading boolean DEFAULT false         -- Does this cascade to next chunk?
continues_previous boolean DEFAULT false   -- Continues from previous chunk?

-- START boundary position (matches batching design pattern)
start_page integer NOT NULL                -- First page of encounter
start_boundary_type varchar(20)            -- 'inter_page' or 'intra_page'
start_marker text                          -- Descriptive text (e.g., "after header 'ADMISSION'")
start_text_y_top integer                   -- NULL if inter_page; Y-coord of marker text top
start_text_height integer                  -- NULL if inter_page; height of marker text
start_y integer                            -- NULL if inter_page; calculated split line (y_top - height)

-- END boundary position (matches batching design pattern)
end_page integer NOT NULL                  -- Last page of encounter
end_boundary_type varchar(20)              -- 'inter_page' or 'intra_page'
end_marker text                            -- Descriptive text (e.g., "before header 'DISCHARGE'")
end_text_y_top integer                     -- NULL if inter_page; Y-coord of marker text top
end_text_height integer                    -- NULL if inter_page; height of marker text
end_y integer                              -- NULL if inter_page; calculated split line (y_top - height)

-- Overall position confidence
position_confidence numeric                -- Confidence in boundary positions (0.0-1.0)

-- Reconciliation support
reconciliation_key varchar(255)            -- For descriptor matching
reconciliation_method varchar(20)          -- 'cascade', 'descriptor', 'orphan'
reconciliation_confidence numeric          -- Confidence in reconciliation
```

**New Indexes (5 total):**
```sql
CREATE INDEX idx_pending_cascade ON pass05_pending_encounters(session_id, cascade_id);
CREATE INDEX idx_pending_spatial ON pass05_pending_encounters(session_id, start_page, end_page);
CREATE INDEX idx_pending_lookup ON pass05_pending_encounters(session_id, pending_id);
CREATE INDEX idx_pending_descriptor ON pass05_pending_encounters(session_id, reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;
```

**New Constraint:**
```sql
ALTER TABLE pass05_pending_encounters
  ADD CONSTRAINT uq_pending_per_session UNIQUE (session_id, pending_id);
```

#### Migration SQL Preview

```sql
-- Remove columns no longer needed
ALTER TABLE pass05_pending_encounters
  DROP COLUMN chunk_last_seen,
  DROP COLUMN last_seen_context;

-- Rename columns for clarity
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN temp_encounter_id TO pending_id,
  RENAME COLUMN chunk_started TO chunk_number,
  RENAME COLUMN partial_data TO encounter_data,
  RENAME COLUMN completed_encounter_id TO reconciled_to,
  RENAME COLUMN completed_at TO reconciled_at;

-- Add cascade support
ALTER TABLE pass05_pending_encounters
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN is_cascading boolean DEFAULT false,
  ADD COLUMN continues_previous boolean DEFAULT false;

-- Add position data (nullable initially, set NOT NULL after backfill)
-- Matches batching design: inter_page vs intra_page boundaries
ALTER TABLE pass05_pending_encounters
  ADD COLUMN start_page integer,
  ADD COLUMN start_boundary_type varchar(20),
  ADD COLUMN start_marker text,
  ADD COLUMN start_text_y_top integer,
  ADD COLUMN start_text_height integer,
  ADD COLUMN start_y integer,
  ADD COLUMN end_page integer,
  ADD COLUMN end_boundary_type varchar(20),
  ADD COLUMN end_marker text,
  ADD COLUMN end_text_y_top integer,
  ADD COLUMN end_text_height integer,
  ADD COLUMN end_y integer,
  ADD COLUMN position_confidence numeric;

-- Add reconciliation support
ALTER TABLE pass05_pending_encounters
  ADD COLUMN reconciliation_key varchar(255),
  ADD COLUMN reconciliation_method varchar(20),
  ADD COLUMN reconciliation_confidence numeric;

-- Create indexes
CREATE INDEX idx_pending_cascade ON pass05_pending_encounters(session_id, cascade_id);
CREATE INDEX idx_pending_spatial ON pass05_pending_encounters(session_id, start_page, end_page);
CREATE INDEX idx_pending_lookup ON pass05_pending_encounters(session_id, pending_id);
CREATE INDEX idx_pending_descriptor ON pass05_pending_encounters(session_id, reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;

-- Add unique constraint
ALTER TABLE pass05_pending_encounters
  ADD CONSTRAINT uq_pending_per_session UNIQUE (session_id, pending_id);

-- LATER: After code deployment and backfill, set NOT NULL constraints
-- ALTER TABLE pass05_pending_encounters
--   ALTER COLUMN start_page SET NOT NULL,
--   ALTER COLUMN end_page SET NOT NULL;
```

#### Impact Summary

- **Breaking Changes:** None (deleted columns unused)
- **Code Updates:** Major - all pending encounter code needs updates
- **Data Migration:** Existing pending encounters should be cleaned up first
- **Testing:** Critical - test cascade ID generation and reconciliation

---

### 3. pass05_chunk_results

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Per-chunk processing metrics and results
**Strategy A Change:** Simplify to chunk-level metrics only

#### Changes Required

**DELETE (3 columns):**
- `encounters_started` - Meaningless in Strategy A
- `encounters_completed` - Nothing completes at chunk level
- `encounters_continued` - Replaced by cascade tracking

**RENAME (2 columns):**
- `handoff_received` → `cascade_context_received`
- `handoff_generated` → `cascade_package_sent`

**ADD (5 columns):**
```sql
pendings_created integer DEFAULT 0         -- Total encounters sent to pending
cascading_count integer DEFAULT 0          -- How many marked as cascading
cascade_ids text[]                         -- Array of cascade IDs created
continues_count integer DEFAULT 0          -- How many continued from previous
page_separation_analysis jsonb             -- Batching split points for this chunk
```

**New Index:**
```sql
CREATE INDEX idx_chunk_results_separation_analysis
  ON pass05_chunk_results USING GIN (page_separation_analysis);
```

#### Migration SQL Preview

```sql
-- Remove obsolete tracking columns
ALTER TABLE pass05_chunk_results
  DROP COLUMN encounters_started,
  DROP COLUMN encounters_completed,
  DROP COLUMN encounters_continued;

-- Rename handoff columns
ALTER TABLE pass05_chunk_results
  RENAME COLUMN handoff_received TO cascade_context_received,
  RENAME COLUMN handoff_generated TO cascade_package_sent;

-- Add cascade metrics
ALTER TABLE pass05_chunk_results
  ADD COLUMN pendings_created integer DEFAULT 0,
  ADD COLUMN cascading_count integer DEFAULT 0,
  ADD COLUMN cascade_ids text[],
  ADD COLUMN continues_count integer DEFAULT 0,
  ADD COLUMN page_separation_analysis jsonb;

-- Create index for batching analysis
CREATE INDEX idx_chunk_results_separation_analysis
  ON pass05_chunk_results USING GIN (page_separation_analysis);
```

#### Impact Summary

- **Breaking Changes:** None
- **Code Updates:** Update chunk processor to populate new metrics
- **Data Migration:** None required
- **Testing:** Verify cascade metrics populate correctly

---

### 4. pass05_page_assignments

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Maps pages to encounters with AI's justification
**Strategy A Change:** Add position support for multi-encounter-per-page scenarios

#### Current Design Analysis

**Multi-Encounter Pages:** Already supported (no UNIQUE constraint on page_num)
**Data Model:** One row per (page, encounter) pair
**All 6 existing columns:** KEEP (no orphaned columns)

#### Changes Required

**DELETE:** None
**RENAME:** None

**ADD (6 columns):**
```sql
position_on_page varchar(20)           -- 'top','quarter','middle','three-quarters','bottom'
position_confidence numeric            -- 0.0-1.0 confidence in position
is_partial boolean DEFAULT false       -- TRUE if encounter uses only part of page
pending_id text                        -- Links to pending encounter before reconciliation
chunk_number integer                   -- Which chunk created this assignment
cascade_id varchar(100)                -- Links to cascade if applicable
```

**New Indexes (5 total):**
```sql
CREATE INDEX idx_page_assign_doc_page ON pass05_page_assignments(shell_file_id, page_num);
CREATE INDEX idx_page_assign_encounter ON pass05_page_assignments(encounter_id);
CREATE INDEX idx_page_assign_pending ON pass05_page_assignments(shell_file_id, pending_id)
  WHERE pending_id IS NOT NULL;
CREATE INDEX idx_page_assign_chunk ON pass05_page_assignments(shell_file_id, chunk_number);
CREATE INDEX idx_page_assign_reconcile ON pass05_page_assignments(shell_file_id, pending_id, encounter_id)
  WHERE encounter_id IS NULL;
```

#### Migration SQL Preview

```sql
-- Add position tracking (supports multiple encounters per page)
ALTER TABLE pass05_page_assignments
  ADD COLUMN position_on_page varchar(20),
  ADD COLUMN position_confidence numeric,
  ADD COLUMN is_partial boolean DEFAULT false;

-- Add reconciliation tracking
ALTER TABLE pass05_page_assignments
  ADD COLUMN pending_id text,
  ADD COLUMN chunk_number integer;

-- Add cascade tracking
ALTER TABLE pass05_page_assignments
  ADD COLUMN cascade_id varchar(100);

-- Create indexes
CREATE INDEX idx_page_assign_doc_page ON pass05_page_assignments(shell_file_id, page_num);
CREATE INDEX idx_page_assign_encounter ON pass05_page_assignments(encounter_id);
CREATE INDEX idx_page_assign_pending ON pass05_page_assignments(shell_file_id, pending_id)
  WHERE pending_id IS NOT NULL;
CREATE INDEX idx_page_assign_chunk ON pass05_page_assignments(shell_file_id, chunk_number);
CREATE INDEX idx_page_assign_reconcile ON pass05_page_assignments(shell_file_id, pending_id, encounter_id)
  WHERE encounter_id IS NULL;
```

#### Impact Summary

- **Breaking Changes:** None
- **Code Updates:** Update to populate new position fields
- **Data Migration:** None required
- **Testing:** Test multi-encounter page scenarios

---

### 5. pass05_encounter_metrics

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Final summary statistics for completed Pass 0.5 session
**Strategy A Change:** Populated AFTER reconciliation completes

#### Changes Required

**DELETE (3 columns):**
- `user_agent` - Never populated, not relevant for backend worker
- `ip_address` - Never populated, not relevant for backend worker
- `batching_required` - Always TRUE in Strategy A (replaced by chunk_count)

**RENAME:** None

**ADD (9 columns):**
```sql
-- Reconciliation metrics
pendings_total integer                 -- Total pendings before reconciliation
cascades_total integer                 -- Number of cascade chains created
orphans_total integer                  -- Pendings that couldn't reconcile
reconciliation_time_ms integer         -- Time spent in reconciliation
reconciliation_method varchar(20)      -- Primary method: 'cascade','descriptor','mixed'

-- Chunk metrics
chunk_count integer                    -- Number of chunks processed
avg_chunk_time_ms integer              -- Average time per chunk
max_chunk_time_ms integer              -- Slowest chunk time

-- Quality metrics
pages_with_multi_encounters integer    -- Pages with >1 encounter
position_confidence_avg numeric        -- Average position confidence
```

#### Migration SQL Preview

```sql
-- Remove orphaned columns
ALTER TABLE pass05_encounter_metrics
  DROP COLUMN user_agent,
  DROP COLUMN ip_address,
  DROP COLUMN batching_required;

-- Add reconciliation metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN pendings_total integer,
  ADD COLUMN cascades_total integer,
  ADD COLUMN orphans_total integer,
  ADD COLUMN reconciliation_time_ms integer,
  ADD COLUMN reconciliation_method varchar(20);

-- Add chunk metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN chunk_count integer,
  ADD COLUMN avg_chunk_time_ms integer,
  ADD COLUMN max_chunk_time_ms integer;

-- Add quality metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN pages_with_multi_encounters integer,
  ADD COLUMN position_confidence_avg numeric;
```

#### Impact Summary

- **Breaking Changes:** None (deleted columns never used)
- **Code Updates:** Update metrics aggregation logic
- **Data Migration:** None required
- **Testing:** Verify all new metrics populate correctly

---

### 6. healthcare_encounters

**Current Schema Location:** `current_schema/03_clinical_core.sql` (Lines ~TBD)

**Purpose:** Final encounter storage (ALL passes write here)
**Strategy A Change:** Add position columns for sub-page granularity, cascade tracking

#### Pseudo-Encounter Support: READY ✓

**Existing Column:** `is_real_world_visit` (boolean, nullable, default=true)

**Logic:**
```
is_real_world_visit = TRUE  → Real healthcare visit
  Criteria: has encounter_start_date AND (provider_name OR facility_name)

is_real_world_visit = FALSE → Pseudo-encounter
  Criteria: missing date OR missing location
```

**Examples of Pseudo-Encounters:**
- Medication list (no date or provider)
- Surgery list with dates but no facility
- Administration summary (document, not an event)

**Status:** Working in current code, needs V11 prompt emphasis

#### Changes Required

**DELETE (4 columns):**
- `date_resolution_reason` - Never populated (0/161 rows)
- `clinical_effective_date` - Never populated (0/161 rows)
- `date_confidence` - Never populated (0/161 rows), redundant with pass_0_5_confidence
- `plan` - Never populated (0/161 rows)

**RENAME:** None

**ADD (14 columns):**
```sql
-- START boundary position (matches batching design pattern)
start_page integer                     -- First page of encounter
start_boundary_type varchar(20)        -- 'inter_page' or 'intra_page'
start_marker text                      -- Descriptive text (e.g., "after header 'ADMISSION'")
start_text_y_top integer               -- NULL if inter_page; Y-coord of marker text top
start_text_height integer              -- NULL if inter_page; height of marker text
start_y integer                        -- NULL if inter_page; calculated split line (y_top - height)

-- END boundary position (matches batching design pattern)
end_page integer                       -- Last page of encounter
end_boundary_type varchar(20)          -- 'inter_page' or 'intra_page'
end_marker text                        -- Descriptive text (e.g., "before header 'DISCHARGE'")
end_text_y_top integer                 -- NULL if inter_page; Y-coord of marker text top
end_text_height integer                -- NULL if inter_page; height of marker text
end_y integer                          -- NULL if inter_page; calculated split line (y_top - height)

-- Overall position confidence
position_confidence numeric            -- Confidence in boundary positions (0.0-1.0)

-- Cascade tracking
cascade_id varchar(100)                -- Which cascade created this (if any)
chunk_count integer DEFAULT 1          -- How many chunks this encounter spanned
```

**New Indexes (2 total):**
```sql
CREATE INDEX idx_encounters_spatial ON healthcare_encounters
  USING gin (spatial_bounds)
  WHERE spatial_bounds IS NOT NULL;

CREATE INDEX idx_encounters_cascade ON healthcare_encounters(cascade_id)
  WHERE cascade_id IS NOT NULL;
```

#### Low-Usage Clinical Fields (KEEP but needs V11 prompt tuning)

These fields have <10% population but should be kept:
- `chief_complaint` - 5.6% populated
- `specialty` - 5.0% populated
- `provider_type` - 5.6% populated
- `clinical_impression` - 5.6% populated

**Action:** V11 prompt should emphasize extraction of these fields

#### High-Value Fields (Already working well)

- `facility_name` - 90% populated (critical for pseudo-encounters)
- `summary` - 67% populated (high UX value)
- `provider_name` - 47% populated (critical for pseudo-encounters)
- `spatial_bounds` - 46% populated (aligns with Strategy A position goals)

#### Migration SQL Preview

```sql
-- Remove orphaned columns
ALTER TABLE healthcare_encounters
  DROP COLUMN date_resolution_reason,
  DROP COLUMN clinical_effective_date,
  DROP COLUMN date_confidence,
  DROP COLUMN plan;

-- Add position columns (matches batching design: inter_page vs intra_page)
ALTER TABLE healthcare_encounters
  ADD COLUMN start_page integer,
  ADD COLUMN start_boundary_type varchar(20),
  ADD COLUMN start_marker text,
  ADD COLUMN start_text_y_top integer,
  ADD COLUMN start_text_height integer,
  ADD COLUMN start_y integer,
  ADD COLUMN end_page integer,
  ADD COLUMN end_boundary_type varchar(20),
  ADD COLUMN end_marker text,
  ADD COLUMN end_text_y_top integer,
  ADD COLUMN end_text_height integer,
  ADD COLUMN end_y integer,
  ADD COLUMN position_confidence numeric;

-- Add cascade tracking
ALTER TABLE healthcare_encounters
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN chunk_count integer DEFAULT 1;

-- Create indexes
CREATE INDEX idx_encounters_spatial ON healthcare_encounters
  USING gin (spatial_bounds)
  WHERE spatial_bounds IS NOT NULL;

CREATE INDEX idx_encounters_cascade ON healthcare_encounters(cascade_id)
  WHERE cascade_id IS NOT NULL;
```

#### Impact Summary

- **Breaking Changes:** None (deleted columns never populated)
- **Code Updates:** Update reconciler to populate position fields from pending encounters
- **Data Migration:** None required
- **Testing:** Verify pseudo-encounter logic, position data accuracy

#### Position Tracking Design Rationale

**Why Match Batching Design?**

The position tracking system for encounter boundaries now matches the batching safe-split design (BATCHING-TASK-DESIGN-V2.md) for these reasons:

**1. Conceptual Consistency**
- Encounter boundaries ARE split points (primary ones)
- Batching safe-splits are ADDITIONAL split points
- Same concept → same data model

**2. Inter-Page vs Intra-Page Distinction**

**Inter-Page Boundaries (Most Common):**
```json
{
  "start_boundary_type": "inter_page",
  "start_marker": "page begins with 'ADMISSION NOTE'",
  "start_text_y_top": null,  // No coordinates needed
  "start_text_height": null,
  "start_y": null
}
```
- Encounter starts at top of page or ends at bottom of page
- No coordinates needed - just use page boundary
- Highest confidence (natural page breaks are always clean)
- Simplest downstream processing

**Intra-Page Boundaries (Less Common but Critical):**
```json
{
  "end_boundary_type": "intra_page",
  "end_marker": "before header 'NEW CONSULTATION'",
  "end_text_y_top": 2400,    // Exact pixel coordinate
  "end_text_height": 24,     // Height of marker text
  "end_y": 2376              // Split line with buffer (2400 - 24)
}
```
- Encounter ends mid-page (another encounter starts below)
- Precise coordinates required for future use cases:
  - Visual highlighting in UI
  - Precise page cropping for encounter-specific PDFs
  - Validation of AI-identified boundaries
- Marker text aids debugging and human review

**3. Data Flow Integrity**

Both `pass05_pending_encounters` and `healthcare_encounters` have identical position schemas:
- AI outputs position data → stored in pending encounters
- Reconciliation merges → transfers to final encounters
- No data loss, no schema mismatch

**4. Future Use Cases**
- **Visual highlighting:** Draw boxes around encounters in PDF viewer
- **Precise cropping:** Generate encounter-specific PDF pages
- **Validation:** Verify AI correctly identified boundaries
- **Analytics:** Distribution of encounter positions on pages

---

### 7. shell_files

**Current Schema Location:** `current_schema/03_clinical_core.sql` (Lines ~TBD)

**Purpose:** Document metadata and processing status (for ALL passes)
**Strategy A Change:** Universal progressive tracking

#### Downstream Batching: NEEDS IMPLEMENTATION

**Existing Column:** `page_separation_analysis` (jsonb, nullable, NEVER populated - 0/197 rows)

**Purpose:** Store FINAL DOCUMENT-WIDE batching analysis after reconciliation

**Critical Design Points:**
1. **Separation of Concerns:** This identifies ADDITIONAL safe splits beyond encounter boundaries
2. **Encounter boundaries are PRIMARY splits** - NOT included in this analysis
3. **Hybrid Storage:** Per-chunk in `pass05_chunk_results` during processing, then aggregated here
4. **Pass 0.5 identifies splits WITHIN encounters** for optimal Pass 1/2 batching

**Storage Flow:**
```
Chunk Processing → pass05_chunk_results.page_separation_analysis (per chunk)
       ↓
Reconciliation → Aggregate all chunks
       ↓
Final Storage → shell_files.page_separation_analysis (document-wide)
```

**Format (After Reconciliation):**
```json
{
  "version": "2.0",
  "total_pages": 142,
  "analysis_date": "2024-11-15T10:30:00Z",
  "safe_split_points": [
    {
      "split_location": "inter_page",
      "between_pages": [11, 12],
      "split_type": "natural_boundary",
      "confidence": 1.0
    },
    {
      "split_location": "intra_page",
      "page": 23,
      "marker": "just before header 'PATHOLOGY REPORT'",
      "text_y_top": 450,
      "split_y": 426,
      "text_height": 24,
      "split_type": "new_document",
      "confidence": 0.92
    }
  ],
  "summary": {
    "total_splits": 28,
    "inter_page_splits": 12,
    "intra_page_splits": 16,
    "avg_confidence": 0.91
  }
}
```

**Downstream Usage:**
```typescript
// Pass 1/2 combines encounter boundaries + batching splits
const encounterBoundaries = getEncounterBoundaries(encounters);
const batchingSplits = shellFile.page_separation_analysis.safe_split_points;
const allSplits = [...encounterBoundaries, ...batchingSplits].sort();
```

**Complete Specification:** See `06-BATCHING-TASK-DESIGN-V2.md`

#### Changes Required

**DELETE (3 columns):**
- `processing_error` - Replaced by pass-specific error fields (never populated)
- `ocr_confidence` - Redundant with ocr_average_confidence
- `pass_0_5_progressive` - Always TRUE in Strategy A, redundant with progressive_session_id

**RENAME:** None

**ADD (2 columns):**
```sql
progressive_session_id uuid REFERENCES pass05_progressive_sessions(id)  -- Direct link to session
reconciliation_method varchar(20)                                       -- 'cascade','descriptor','mixed'
```

**IMPLEMENT (1 existing column):**
- `page_separation_analysis` - Already exists in schema, needs V11 prompt to populate

**New Indexes (2):**
```sql
CREATE INDEX idx_shell_files_job ON shell_files(processing_job_id)
  WHERE processing_job_id IS NOT NULL;
CREATE INDEX idx_shell_files_session ON shell_files(progressive_session_id)
  WHERE progressive_session_id IS NOT NULL;
```

#### Migration SQL Preview

```sql
-- Remove orphaned/redundant columns
ALTER TABLE shell_files
  DROP COLUMN processing_error,
  DROP COLUMN ocr_confidence,
  DROP COLUMN pass_0_5_progressive;

-- Add Strategy A columns
ALTER TABLE shell_files
  ADD COLUMN progressive_session_id uuid REFERENCES pass05_progressive_sessions(id),
  ADD COLUMN reconciliation_method varchar(20);

-- Create indexes
CREATE INDEX idx_shell_files_job ON shell_files(processing_job_id)
  WHERE processing_job_id IS NOT NULL;
CREATE INDEX idx_shell_files_session ON shell_files(progressive_session_id)
  WHERE progressive_session_id IS NOT NULL;
```

#### Code Changes Required

**Remove references to pass_0_5_progressive:**
```typescript
// BEFORE: index.ts:42
.select('pass_0_5_completed, pass_0_5_version, pass_0_5_progressive')

// AFTER:
.select('pass_0_5_completed, pass_0_5_version, progressive_session_id')

// BEFORE: encounterDiscovery.ts:79
pass_0_5_progressive: data.progressive

// AFTER: Delete this line

// BEFORE: session-manager.ts:201
pass_0_5_progressive: true

// AFTER: Delete this line
```

**Replacement logic:**
```typescript
// OLD: Checking if progressive was used
if (shellFile.pass_0_5_progressive) {
  // Use progressive path
}

// NEW: Use progressive_session_id instead
if (shellFile.progressive_session_id) {
  // Progressive was used (session exists)
}

// Strategy A: Don't even need this check - ALWAYS use progressive
```

#### Impact Summary

- **Breaking Changes:** None (deleted columns never/rarely populated)
- **Code Updates:** Remove pass_0_5_progressive references
- **Data Migration:** None required
- **Testing:** Verify page_separation_analysis populates from V11 prompt

---

### 8. pass05_progressive_performance (VIEW)

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Type:** DATABASE VIEW (not a table)
**Purpose:** Aggregated view joining session, chunk, and pending data for reporting

#### Drop This View

**Reason:** Redundant with pass05_encounter_metrics

**Dependencies:**
- **Upstream:** Uses 3 tables (sessions, chunks, pendings)
- **Downstream:** NONE (verified - no code references)
- **Code Usage:** NONE

**Migration SQL:**
```sql
DROP VIEW IF EXISTS pass05_progressive_performance;
```

**Impact:** None - safe to drop

---

## Part 3: New Tables

### 1. pass05_cascade_chains

**Purpose:** Track cascade relationships between chunks

**Schema:**
```sql
CREATE TABLE pass05_cascade_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,
  cascade_id varchar(100) UNIQUE NOT NULL,
  origin_chunk integer NOT NULL,              -- Where cascade started
  last_chunk integer,                         -- Where cascade ended
  final_encounter_id uuid REFERENCES healthcare_encounters(id) ON DELETE SET NULL,
  pendings_count integer DEFAULT 1,           -- How many pendings in chain
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp
);

CREATE INDEX idx_cascade_session ON pass05_cascade_chains(session_id);
CREATE INDEX idx_cascade_final ON pass05_cascade_chains(final_encounter_id);
CREATE INDEX idx_cascade_incomplete ON pass05_cascade_chains(session_id)
  WHERE final_encounter_id IS NULL;
```

**Source of Truth Location:** `current_schema/04_ai_processing.sql`

**Expected Usage:** 0-5 rows per document (only multi-chunk encounters create cascades)

---

### 2. pass05_reconciliation_log

**Purpose:** Audit trail for reconciliation decisions

**Schema:**
```sql
CREATE TABLE pass05_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,
  cascade_id varchar(100),
  pending_ids uuid[],                         -- Array of pending IDs reconciled
  final_encounter_id uuid REFERENCES healthcare_encounters(id) ON DELETE SET NULL,
  match_type varchar(20),                     -- 'cascade','descriptor','orphan'
  confidence decimal(3,2),
  reasons text,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recon_session ON pass05_reconciliation_log(session_id);
CREATE INDEX idx_recon_cascade ON pass05_reconciliation_log(cascade_id);
```

**Source of Truth Location:** `current_schema/04_ai_processing.sql`

**Expected Usage:** 1-10 rows per document (one per reconciliation decision)

---

## Part 4: Migration Execution Planning

### Phase 1: Pre-Migration Verification

**CRITICAL: Verify current system behavior before migrating**

- [ ] Query existing tables to confirm column usage patterns
- [ ] Check for any unexpected data in "orphaned" columns
- [ ] Verify RPC/API signatures match documentation
- [ ] Review code for undocumented column usage
- [ ] Test queries with representative data

### Phase 2: Migration Sequence

Migrations should be executed in this order:

#### Stage 1: Drop View (Low Risk)
1. `pass05_progressive_performance` (VIEW) - Drop first, no dependencies

#### Stage 2: Modify Core Progressive Tables (Medium Risk)
2. `pass05_progressive_sessions` - Session tracking
3. `pass05_chunk_results` - Chunk metrics
4. `pass05_pending_encounters` - Pending storage (high complexity)

#### Stage 3: Add Supporting Tables (Low Risk)
5. `pass05_cascade_chains` - New table
6. `pass05_reconciliation_log` - New table

#### Stage 4: Modify Display Tables (Low Risk)
7. `pass05_page_assignments` - Page mapping
8. `pass05_encounter_metrics` - Final metrics

#### Stage 5: Modify Core Tables (Low Risk)
9. `healthcare_encounters` - Final encounter storage
10. `shell_files` - Document metadata

### Phase 3: Post-Migration Tasks

**For Each Migration:**

- [ ] Execute migration via `mcp__supabase__apply_migration()`
- [ ] Run verification query
- [ ] Update `current_schema/*.sql` files
- [ ] Update bridge schemas (if applicable)
- [ ] Update TypeScript types (if applicable)
- [ ] Mark migration header complete

### Phase 4: Code Updates

**Files Requiring Updates (After All Migrations):**

1. **session-manager.ts** - Remove pass_0_5_progressive references
2. **chunk-processor.ts** - Add cascade ID generation, position extraction
3. **pending-reconciler.ts** - Complete rewrite for cascade-based reconciliation
4. **post-processor.ts** - Add position field extraction
5. **handoff-builder.ts** - Simplify to cascade context only
6. **manifestBuilder.ts** - Update for renamed columns
7. **index.ts** - Update SELECT queries

### Phase 5: Testing Checklist

**Unit Tests:**
- [ ] Cascade ID generation logic
- [ ] Position extraction from AI responses
- [ ] Reconciliation by cascade_id
- [ ] Pseudo-encounter detection logic
- [ ] Page separation analysis parsing

**Integration Tests:**
- [ ] 10-page document (single chunk, no cascades)
- [ ] 142-page document (3 chunks, single encounter cascade)
- [ ] Multi-encounter document with cascades
- [ ] Pseudo-encounter document (missing date or location)
- [ ] Document with multi-encounter pages

**Regression Tests:**
- [ ] Existing encounters not affected
- [ ] Metrics still calculate correctly
- [ ] Page assignments still work
- [ ] No data loss from deleted columns

---

## Part 5: V11 Prompt Requirements

### Changes Required in aiPrompts.v11.ts

#### 1. Pseudo-Encounter Detection (EMPHASIS)

**Add to prompt:**
```
PSEUDO-ENCOUNTER DETECTION:

An encounter is a "real world visit" if it has BOTH:
1. A date (encounter_start_date)
2. A location (provider_name OR facility_name)

If either is missing, mark as pseudo-encounter:
- is_real_world_visit: false

Examples of pseudo-encounters:
- Medication list (no date or provider)
- Surgery history (dates but no facility)
- Administration summary (document, not an event)
```

#### 2. Downstream Batching Analysis (NEW FEATURE)

**CRITICAL:** Pass 0.5 identifies ADDITIONAL safe split points WITHIN encounters, NOT encounter boundaries.

**Add to prompt:**
```
BATCHING ANALYSIS

Identify safe points where this document could be split for parallel processing.

IMPORTANT: DO NOT mark encounter boundaries as split points. Encounter boundaries
are handled separately. Only identify ADDITIONAL safe splits WITHIN encounters.

### Two Types of Split Points

1. **Inter-Page Splits** (Between Pages)
   - Natural boundaries where one page ends and another begins WITHIN same encounter
   - Example: Page 11 ends with day 2 notes, Page 12 starts radiology report

2. **Intra-Page Splits** (Within a Page)
   - Safe split points within a single page
   - Example: Consultation ends mid-page, pathology report begins

### Safe Split Criteria

Mark as SAFE when content after split can be understood with just encounter context:
- Clear section headers WITHIN encounter (e.g., "PATHOLOGY REPORT", "DAY 2 NOTES")
- New document type starts within same encounter
- Complete clinical narrative ends and new one begins
- Successive progress notes within same admission

DO NOT MARK encounter boundaries as split points.

### Output Requirements

For INTER-PAGE splits:
{
  "split_location": "inter_page",
  "between_pages": [page_before, page_after],
  "split_type": "natural_boundary|new_section",
  "confidence": 0.0-1.0,
  "justification": "Why this page boundary is safe to split"
}

For INTRA-PAGE splits:
{
  "split_location": "intra_page",
  "page": page_number,
  "marker": "just before [specific text]",
  "text_y_top": y_coordinate_of_text,
  "split_y": y_coordinate_minus_text_height,
  "text_height": height_of_text,
  "split_type": "new_document|new_section|new_evidence",
  "confidence": 0.0-1.0,
  "justification": "Why this location is safe to split"
}

### Analysis Frequency
- Examine every page boundary for inter-page splits
- Look for intra-page splits at major headers and transitions
- Aim for ~1 split per 3 pages minimum
- Must identify at least 1 split per 5 pages maximum
```

**Complete Specification:** See `06-BATCHING-TASK-DESIGN-V2.md` for full details and examples.

#### 3. Cascade Detection (ALREADY DESIGNED)

**Confirm prompt includes:**
- Instructions for marking `is_cascading: true` when encounter touches chunk boundary
- Logic for `cascade_context` in handoff package
- Position granularity (`start_position`, `end_position`)

#### 4. Position Tracking (UPDATED FOR BATCHING ALIGNMENT)

**CRITICAL UPDATE:** Position tracking now matches batching design (inter_page vs intra_page)

**Confirm V11 prompt includes:**
- **Boundary type classification:** Distinguish between inter_page and intra_page boundaries
- **Inter-page boundaries:** Natural page breaks (no coordinates needed)
  - `start_boundary_type: "inter_page"` when encounter starts at page top
  - `end_boundary_type: "inter_page"` when encounter ends at page bottom
  - Descriptive marker text only (no Y-coordinates)
- **Intra-page boundaries:** Mid-page boundaries (requires coordinates)
  - `boundary_type: "intra_page"` when encounter starts/ends mid-page
  - Descriptive marker: e.g., "after header 'ADMISSION NOTE'"
  - OCR bbox lookup for precise Y-coordinates:
    - `text_y_top`: Y-coordinate where marker text starts
    - `text_height`: Height of marker text in pixels
    - `y`: Calculated split line (text_y_top - text_height for buffer)
- **Position confidence:** 0.0-1.0 based on boundary clarity
- **See:** BATCHING-TASK-DESIGN-V2.md for detailed examples and coordinate extraction logic

---

## Part 6: Source of Truth Schema Updates

### Files Requiring Updates

After migrations are executed, update these source of truth files:

#### 1. current_schema/04_ai_processing.sql

**Tables to update:**
- pass05_progressive_sessions (lines TBD)
- pass05_pending_encounters (lines TBD)
- pass05_chunk_results (lines TBD)
- pass05_page_assignments (lines TBD)
- pass05_encounter_metrics (lines TBD)
- pass05_progressive_performance (DELETE view definition)

**Tables to add:**
- pass05_cascade_chains
- pass05_reconciliation_log

#### 2. current_schema/03_clinical_core.sql

**Tables to update:**
- healthcare_encounters (lines TBD)
- shell_files (lines TBD)

### Downstream Files Requiring Updates

After schema updates:

- [ ] Bridge schemas in `bridge-schemas/source/pass-0-5/`
- [ ] Detailed schemas in `bridge-schemas/detailed/`
- [ ] Minimal schemas in `bridge-schemas/minimal/`
- [ ] TypeScript types (if generated from schema)
- [ ] Worker TypeScript files for new column references

---

## Part 7: Risk Assessment

### Low Risk Changes

- Adding new columns with DEFAULT values
- Adding new indexes
- Adding new tables
- Dropping view with no dependencies
- Deleting truly orphaned columns (0% populated)

### Medium Risk Changes

- Renaming columns (requires code updates)
- Modifying column data types
- Changing existing column behavior

### High Risk Changes

- **NONE** - This migration has no high-risk changes

### Rollback Complexity

**Low** - All changes are additive or delete unused columns

**Rollback Steps (if needed):**
1. Keep old columns during transition period
2. Run Strategy A and V10 in parallel
3. Only drop old columns after validation
4. Maintain backward compatibility for 30 days

---

## Part 8: Success Criteria

### Migration Success Metrics

- [ ] All 17 orphaned columns deleted successfully
- [ ] All 8 renamed columns updated in code
- [ ] All 58 new columns added with correct types (18 in pending_encounters, 14 in healthcare_encounters)
- [ ] All 15 new indexes created on modified tables
- [ ] All 5 new indexes created on new tables (total: 20 new indexes)
- [ ] 1 new unique constraint added (uq_pending_per_session)
- [ ] 2 new tables created successfully
- [ ] 1 view dropped without errors
- [ ] All source of truth schemas updated
- [ ] Zero breaking changes to existing data
- [ ] NOT NULL constraints added in correct order (nullable first, then backfill, then NOT NULL)
- [ ] RLS policies updated for dropped/renamed columns
- [ ] Position tracking columns match batching design (inter_page vs intra_page) in both pending and final tables

### Strategy A Validation Metrics

**Pseudo-Encounter Detection:**
- [ ] Encounters with date+location → is_real_world_visit = TRUE
- [ ] Encounters missing date OR location → is_real_world_visit = FALSE
- [ ] Pseudo-encounters counted separately in metrics

**Downstream Batching:**
- [ ] page_separation_analysis populates for all documents
- [ ] Safe splits identified correctly
- [ ] Unsafe splits prevent orphaning clinical data

**Cascade System:**
- [ ] 142-page document creates 1 final encounter (not 3)
- [ ] Cascade IDs link pending encounters correctly
- [ ] Reconciliation groups by cascade_id
- [ ] No duplicate encounters from same cascade

**Position Tracking:**
- [ ] start_position and end_position populate
- [ ] Position confidence scores reasonable
- [ ] Multi-encounter pages have correct positions

**Performance:**
- [ ] Processing time comparable to V10
- [ ] Database queries performant with new indexes
- [ ] No significant storage overhead

---

## Appendix A: Complete Column Change Manifest

### Columns Deleted (11 total)

| Table | Column | Reason | Rows Populated |
|-------|--------|--------|----------------|
| pass05_progressive_sessions | total_encounters_found | Not meaningful until reconciliation | 0/94 (0%) |
| pass05_progressive_sessions | total_encounters_completed | Not meaningful until reconciliation | 0/94 (0%) |
| pass05_pending_encounters | chunk_last_seen | Not needed with cascade system | - |
| pass05_pending_encounters | last_seen_context | Replaced by cascade_id | - |
| pass05_chunk_results | encounters_started | Meaningless in Strategy A | - |
| pass05_chunk_results | encounters_completed | Nothing completes at chunk level | - |
| pass05_chunk_results | encounters_continued | Replaced by cascade tracking | - |
| pass05_encounter_metrics | user_agent | Never populated, not relevant | 0/94 (0%) |
| pass05_encounter_metrics | ip_address | Never populated, not relevant | 0/94 (0%) |
| pass05_encounter_metrics | batching_required | Always TRUE in Strategy A | 94/94 (100%) |
| healthcare_encounters | date_resolution_reason | Never populated | 0/161 (0%) |
| healthcare_encounters | clinical_effective_date | Never populated | 0/161 (0%) |
| healthcare_encounters | date_confidence | Never populated, redundant | 0/161 (0%) |
| healthcare_encounters | plan | Never populated | 0/161 (0%) |
| shell_files | processing_error | Never populated, pass-specific errors used | 0/197 (0%) |
| shell_files | ocr_confidence | Redundant with ocr_average_confidence | 32/197 (16%) |
| shell_files | pass_0_5_progressive | Always TRUE in Strategy A | Varies |

### Columns Renamed (8 total)

| Table | Old Name | New Name | Reason |
|-------|----------|----------|--------|
| pass05_progressive_sessions | total_encounters_pending | total_pendings_created | Clarity |
| pass05_pending_encounters | temp_encounter_id | pending_id | Clarity |
| pass05_pending_encounters | chunk_started | chunk_number | Clarity |
| pass05_pending_encounters | partial_data | encounter_data | Not "partial" anymore |
| pass05_pending_encounters | completed_encounter_id | reconciled_to | Accurate verb |
| pass05_pending_encounters | completed_at | reconciled_at | Accurate verb |
| pass05_chunk_results | handoff_received | cascade_context_received | Descriptive |
| pass05_chunk_results | handoff_generated | cascade_package_sent | Descriptive |

### Columns Added (42 total)

See individual table sections for complete details on new columns.

---

## Appendix B: Migration Naming Convention

**Next Migration Number:** 39 (as of November 14, 2024)

**Suggested Migration Names:**

1. `2024-11-XX_39_strategy_a_drop_view.sql` - Drop pass05_progressive_performance view
2. `2024-11-XX_40_strategy_a_sessions_table.sql` - Modify pass05_progressive_sessions
3. `2024-11-XX_41_strategy_a_chunk_results.sql` - Modify pass05_chunk_results
4. `2024-11-XX_42_strategy_a_pending_encounters.sql` - Modify pass05_pending_encounters (complex)
5. `2024-11-XX_43_strategy_a_cascade_chains.sql` - Create pass05_cascade_chains table
6. `2024-11-XX_44_strategy_a_reconciliation_log.sql` - Create pass05_reconciliation_log table
7. `2024-11-XX_45_strategy_a_page_assignments.sql` - Modify pass05_page_assignments
8. `2024-11-XX_46_strategy_a_encounter_metrics.sql` - Modify pass05_encounter_metrics
9. `2024-11-XX_47_strategy_a_healthcare_encounters.sql` - Modify healthcare_encounters
10. `2024-11-XX_48_strategy_a_shell_files.sql` - Modify shell_files

**Note:** These can be combined or split as needed based on complexity and risk assessment.

---

## End of V3 Migration Plan

**Ready for Two-Touchpoint Workflow:** Yes
**All Major Concepts Addressed:** Yes (pseudo-encounters, downstream batching)
**Breaking Changes:** None
**Next Steps:** Create migration scripts following this plan

---

## Related Documentation

**Downstream Batching Complete Specification:**
- See `06-BATCHING-TASK-DESIGN-V2.md` for full batching analysis design
- Includes inter-page vs intra-page split distinction
- Text marker approach with Y-coordinates
- Hybrid storage strategy
- Downstream integration patterns
- Real-world examples


