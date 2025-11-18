# Pass 0.5 Strategy A - Table Migration Plan V3

**Date:** November 14, 2024 (Updated: November 18, 2024)
**Version:** 3.3
**Purpose:** Complete migration plan for Strategy A with two-touchpoint workflow preparation

**MAJOR UPDATES:**
- **Nov 15, 2024:** Position tracking system updated to match batching design (inter_page vs intra_page boundaries)
- **Nov 18, 2024:** Profile classification integration (Files 10-12) added identity markers, quality tiers, encounter sources, and 4 new audit/classification tables
- **Nov 18, 2024:** Added cross-field integrity constraints for encounter_source validation (File 12)

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
**Total Columns Analyzed:** 250+ columns
**Columns to DELETE:** 17 orphaned/redundant columns
**Columns to RENAME:** 8 columns for clarity
**Columns to ADD:** 96+ new columns across all tables
  - pass05_progressive_sessions: +4
  - pass05_pending_encounters: +39
  - pass05_chunk_results: +5
  - pass05_page_assignments: +6
  - pass05_encounter_metrics: +15
  - healthcare_encounters: +38
  - shell_files: +5 (includes critical uploaded_by for auth user tracking)
**New Tables:** 6 total
  - 2 reconciliation tables (cascade_chains, reconciliation_log)
  - 4 classification/audit tables (pending_identifiers, encounter_identifiers, orphan_identities, classification_audit)
**Design Patterns:**
  - Position tracking matches BATCHING-TASK-DESIGN-V2.md (inter_page vs intra_page boundaries)
  - Profile classification integration (Files 10, 11, 12)
  - Data quality tiers (File 11)
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
| pass05_pending_encounters | 2 | 5 | 39 | 11 | High |
| pass05_chunk_results | 3 | 2 | 5 | 1 | Medium |
| pass05_page_assignments | 1 | 0 | 6 | 6 | High |
| pass05_encounter_metrics | 3 | 0 | 15 | 0 | Medium |
| healthcare_encounters | 4 | 2 | 38 | 2 | Medium |
| shell_files | 3 | 0 | 5 | 3 | Low |
| **TOTALS** | **18** | **10** | **112** | **23** | - |

### New Tables to Create

| Table | Purpose | Rows per Document | Migration Complexity |
|-------|---------|-------------------|---------------------|
| pass05_cascade_chains | Track cascade relationships | ~0-5 | Low |
| pass05_reconciliation_log | Audit reconciliation decisions | ~1-10 | Low |
| pass05_pending_encounter_identifiers | Identity markers (MRN, insurance) during Pass 0.5 | ~0-5 per encounter | Low |
| healthcare_encounter_identifiers | Final identity markers after reconciliation | ~0-5 per encounter | Low |
| orphan_identities | Track unmatched identities for profile suggestions | ~0-10 per account | Low |
| profile_classification_audit | Audit trail for classification decisions | ~1 per encounter | Low |

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

#### Current State Analysis (from Supabase)

**Actual current columns (24 total):**
- `id` (uuid PRIMARY KEY) - **NOTE:** Currently named `id`, should be `session_id` for clarity
- `shell_file_id` (uuid NOT NULL)
- `patient_id` (uuid NOT NULL) - **NOTE:** Will be populated after Pass 0.5 processing
- `total_pages` (integer NOT NULL)
- `chunk_size` (integer NOT NULL)
- `total_chunks` (integer NOT NULL)
- `current_chunk` (integer, default 0)
- `processing_status` (text, default 'initialized')
- `current_handoff_package` (jsonb)
- `total_encounters_found` (integer, default 0) - **DELETE**
- `total_encounters_completed` (integer, default 0) - **DELETE**
- `total_encounters_pending` (integer, default 0) - **RENAME**
- `requires_manual_review` (boolean, default false) - **KEEP**
- `review_reasons` (text[]) - **KEEP**
- `average_confidence` (numeric) - **KEEP**
- `started_at` (timestamptz, default now())
- `completed_at` (timestamptz)
- `total_processing_time` (interval) - **KEEP**
- `total_ai_calls` (integer, default 0) - **KEEP**
- `total_input_tokens` (integer, default 0) - **KEEP**
- `total_output_tokens` (integer, default 0) - **KEEP**
- `total_cost_usd` (numeric, default 0) - **KEEP**
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

#### Changes Required

**DELETE (2 columns):**
- `total_encounters_found` - Always 0 until reconciliation (orphaned)
- `total_encounters_completed` - Always 0 until reconciliation (orphaned)

**RENAME (1 column):**
- `total_encounters_pending` → `total_pendings_created`
  - **Reason:** Clearer name reflecting what's actually counted

**ADD (4 columns):**
```sql
total_cascades integer DEFAULT 0           -- Number of cascade chains created
strategy_version varchar(10) DEFAULT 'A-v1' -- Track strategy version (future-proof)
reconciliation_completed_at timestamptz    -- When reconciliation finished (separate from chunk completion)
final_encounter_count integer              -- Count after reconciliation (vs pendings created)
```

**MODIFY (1 column behavior - no schema change):**
- `current_handoff_package` (jsonb) - Simplified to cascade context only:
  ```json
  {
    "cascade_id": "uuid",
    "context": {
      "encounter_type": "...",
      "last_page": 50,
      "continues_previous": true
    }
  }
  ```

#### Complete Table Schema (After Migration)

```sql
CREATE TABLE pass05_progressive_sessions (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- Keep as 'id' (don't rename to session_id)
  shell_file_id uuid NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES user_profiles(id),  -- Populated after processing

  -- Document info
  total_pages integer NOT NULL,
  chunk_size integer NOT NULL,
  total_chunks integer NOT NULL,

  -- Progress tracking
  current_chunk integer DEFAULT 0,
  processing_status text DEFAULT 'initialized',  -- Keep as text, not enum
  current_handoff_package jsonb,                 -- Cascade context for next chunk

  -- Encounter counts
  total_pendings_created integer DEFAULT 0,      -- RENAMED from total_encounters_pending
  final_encounter_count integer,                 -- NEW - count after reconciliation

  -- Cascade tracking
  total_cascades integer DEFAULT 0,              -- NEW

  -- Quality/Review
  requires_manual_review boolean DEFAULT false,
  review_reasons text[],
  average_confidence numeric,

  -- Strategy tracking
  strategy_version varchar(10) DEFAULT 'A-v1',   -- NEW - version tracking

  -- Metrics (keep all existing)
  total_processing_time interval,
  total_ai_calls integer DEFAULT 0,
  total_input_tokens integer DEFAULT 0,
  total_output_tokens integer DEFAULT 0,
  total_cost_usd numeric DEFAULT 0,

  -- Timestamps
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,                      -- When all chunks processed
  reconciliation_completed_at timestamptz,       -- NEW - when reconciliation finished
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pass05_sessions_shell_file ON pass05_progressive_sessions(shell_file_id);
CREATE INDEX idx_pass05_sessions_status ON pass05_progressive_sessions(processing_status);
CREATE INDEX idx_pass05_sessions_patient ON pass05_progressive_sessions(patient_id);
```

#### Migration SQL

```sql
-- Step 1: Remove orphaned columns
ALTER TABLE pass05_progressive_sessions
  DROP COLUMN IF EXISTS total_encounters_found,
  DROP COLUMN IF EXISTS total_encounters_completed;

-- Step 2: Rename for clarity
ALTER TABLE pass05_progressive_sessions
  RENAME COLUMN total_encounters_pending TO total_pendings_created;

-- Step 3: Add new Strategy A columns
ALTER TABLE pass05_progressive_sessions
  ADD COLUMN total_cascades integer DEFAULT 0,
  ADD COLUMN strategy_version varchar(10) DEFAULT 'A-v1',
  ADD COLUMN reconciliation_completed_at timestamptz,
  ADD COLUMN final_encounter_count integer;

-- Step 4: Update existing sessions to have strategy version
UPDATE pass05_progressive_sessions
SET strategy_version = 'A-v1'
WHERE strategy_version IS NULL;
```

#### Impact Summary

- **Breaking Changes:** None (deleted columns were never populated)
- **Code Updates Required:**
  - Update queries referencing `total_encounters_pending` → `total_pendings_created`
  - Remove references to deleted columns (if any exist)
  - Update session completion logic to set `reconciliation_completed_at`
- **Data Migration:** Backfill `strategy_version = 'A-v1'` for existing sessions
- **Testing:**
  - Verify `total_pendings_created` increments during chunk processing
  - Verify `final_encounter_count` set during reconciliation
  - Verify `reconciliation_completed_at` timestamp set correctly

#### Column Count Summary

- **Before:** 24 columns (verified from Supabase)
- **After:** 26 columns
- **Net Change:** +2 columns (deleted 2, renamed 1, added 4)

**Breakdown:**
- DELETE: 2 (total_encounters_found, total_encounters_completed)
- RENAME: 1 (total_encounters_pending → total_pendings_created)
- ADD: 4 (total_cascades, strategy_version, reconciliation_completed_at, final_encounter_count)
- KEEP: 19 (all other existing columns)

---

### 2. pass05_pending_encounters

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Temporary storage for encounters during processing
**Strategy A Change:** Hub table - ALL encounters pass through here before reconciliation

#### Current State Analysis (from Supabase)

**Actual current columns (16 total):**
- `id` (uuid PRIMARY KEY)
- `session_id` (uuid NOT NULL)
- `temp_encounter_id` (text NOT NULL) - **RENAME to pending_id**
- `chunk_started` (integer NOT NULL) - **RENAME to chunk_number**
- `chunk_last_seen` (integer) - **DELETE**
- `partial_data` (jsonb NOT NULL) - **RENAME to encounter_data**
- `page_ranges` (integer[][]) - **KEEP**
- `last_seen_context` (text) - **DELETE**
- `expected_continuation` (text) - **KEEP** (useful for validation)
- `status` (text, default 'pending')
- `completed_encounter_id` (uuid) - **RENAME to reconciled_to**
- `completed_at` (timestamptz) - **RENAME to reconciled_at**
- `confidence` (numeric)
- `requires_review` (boolean, default false)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

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

**ADD (38 columns):**
```sql
-- Core cascade support (3 columns)
cascade_id varchar(100)                    -- Links cascading encounters
is_cascading boolean DEFAULT false         -- Does this cascade to next chunk?
continues_previous boolean DEFAULT false   -- Continues from previous chunk?

-- START boundary position - matches batching design pattern (6 columns)
start_page integer NOT NULL                -- First page of encounter
start_boundary_type varchar(20)            -- 'inter_page' or 'intra_page'
start_marker text                          -- Descriptive text (e.g., "after header 'ADMISSION'")
start_text_y_top integer                   -- NULL if inter_page; Y-coord of marker text top
start_text_height integer                  -- NULL if inter_page; height of marker text
start_y integer                            -- NULL if inter_page; calculated split line (y_top - height)

-- END boundary position - matches batching design pattern (6 columns)
end_page integer NOT NULL                  -- Last page of encounter
end_boundary_type varchar(20)              -- 'inter_page' or 'intra_page'
end_marker text                            -- Descriptive text (e.g., "before header 'DISCHARGE'")
end_text_y_top integer                     -- NULL if inter_page; Y-coord of marker text top
end_text_height integer                    -- NULL if inter_page; height of marker text
end_y integer                              -- NULL if inter_page; calculated split line (y_top - height)

-- Overall position confidence (1 column)
position_confidence numeric                -- Confidence in boundary positions (0.0-1.0)

-- Reconciliation support (3 columns)
reconciliation_key varchar(255)            -- For descriptor matching
reconciliation_method varchar(20)          -- 'cascade', 'descriptor', 'orphan'
reconciliation_confidence numeric          -- Confidence in reconciliation

-- Identity markers (raw from AI) - for profile classification + Criteria A (4 columns)
patient_full_name text                     -- Patient name as extracted
patient_date_of_birth text                 -- Raw format DOB as extracted
patient_address text                       -- Patient address if present
patient_phone varchar(50)                  -- Patient phone if present

-- Provider/facility markers - for Criteria B + quality tiers (3 columns)
provider_name text                         -- Healthcare provider name
facility_name text                         -- Hospital/clinic name
encounter_start_date text                  -- Visit date or document preparation date (raw format)

-- Classification results - File 10 integration (4 columns)
matched_profile_id uuid                    -- REFERENCES user_profiles(id) - populated by profile-classifier
match_confidence numeric                   -- 0.0 to 1.0
match_status varchar(20)                   -- 'matched', 'unmatched', 'orphan', 'review'
is_orphan_identity boolean DEFAULT false   -- Unknown identity pattern detected

-- Data quality tier - File 11 integration (3 columns)
data_quality_tier varchar(20)              -- 'low', 'medium', 'high', 'verified'
  CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified')),
quality_criteria_met jsonb                 -- {"criteria_a": true, "criteria_b": false, "criteria_c": false}
quality_calculation_date timestamptz       -- When quality tier was calculated

-- Encounter source metadata - File 12 integration (5 columns)
encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
  CHECK (encounter_source IN ('shell_file', 'manual', 'api')),  -- Always 'shell_file' in Strategy A
manual_created_by varchar(20)              -- 'provider', 'user', 'other_user' (NULL for uploaded docs)
  CHECK (manual_created_by IN ('provider', 'user', 'other_user')),
created_by_user_id uuid REFERENCES auth.users(id),  -- Who created the shell_file
api_source_name varchar(100),              -- NULL for uploaded docs (File 13 future)
api_import_date date                       -- NULL for uploaded docs (File 13 future)
```

**New Indexes (11 total):**
```sql
-- Cascade and reconciliation indexes
CREATE INDEX idx_pending_cascade ON pass05_pending_encounters(session_id, cascade_id);
CREATE INDEX idx_pending_spatial ON pass05_pending_encounters(session_id, start_page, end_page);
CREATE INDEX idx_pending_lookup ON pass05_pending_encounters(session_id, pending_id);
CREATE INDEX idx_pending_descriptor ON pass05_pending_encounters(session_id, reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;

-- Metadata indexes (from consolidated review)
CREATE INDEX idx_pending_encounters_source ON pass05_pending_encounters(encounter_source);
CREATE INDEX idx_pending_encounters_quality ON pass05_pending_encounters(data_quality_tier);
CREATE INDEX idx_pending_encounters_manual_creator ON pass05_pending_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;
CREATE INDEX idx_pending_encounters_creator ON pass05_pending_encounters(created_by_user_id);

-- Classification indexes (File 10)
CREATE INDEX idx_pending_encounters_profile ON pass05_pending_encounters(matched_profile_id)
  WHERE matched_profile_id IS NOT NULL;
CREATE INDEX idx_pending_encounters_match_status ON pass05_pending_encounters(match_status);
CREATE INDEX idx_pending_encounters_orphan ON pass05_pending_encounters(is_orphan_identity)
  WHERE is_orphan_identity = true;
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

-- Add page ranges (preserves AI output, enables validation)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN page_ranges integer[][];

-- Add reconciliation support
ALTER TABLE pass05_pending_encounters
  ADD COLUMN reconciliation_key varchar(255),
  ADD COLUMN reconciliation_method varchar(20),
  ADD COLUMN reconciliation_confidence numeric;

-- Add identity markers (for profile classification)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN patient_full_name text,
  ADD COLUMN patient_date_of_birth text,
  ADD COLUMN patient_address text,
  ADD COLUMN patient_phone varchar(50);

-- Add provider/facility markers (for profile classification and quality tiers)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN provider_name text,
  ADD COLUMN facility_name text,
  ADD COLUMN encounter_start_date text,
  ADD COLUMN encounter_end_date text;  -- For multi-day encounters (nullable - cascades get end date during reconciliation)

-- Add classification results (populated post-processing)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN matched_profile_id uuid,
  ADD COLUMN match_confidence numeric,
  ADD COLUMN match_status varchar(20),
  ADD COLUMN is_orphan_identity boolean DEFAULT false;

-- Add data quality tier (calculated post-processing)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN data_quality_tier varchar(20) CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified')),
  ADD COLUMN quality_criteria_met jsonb,
  ADD COLUMN quality_calculation_date timestamptz;

-- Add encounter source metadata (File 12 integration)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
    CHECK (encounter_source IN ('shell_file', 'manual', 'api')),
  ADD COLUMN manual_created_by varchar(20) CHECK (manual_created_by IN ('provider', 'user', 'other_user')),
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN api_source_name varchar(100),
  ADD COLUMN api_import_date date;

-- Add cross-field constraint for data integrity (File 12)
-- Note: pending_encounters link to shell_file through session, verified via session_id FK
ALTER TABLE pass05_pending_encounters
  ADD CONSTRAINT check_pending_shell_file_source_valid
    CHECK (encounter_source != 'shell_file' OR session_id IS NOT NULL);

-- Create indexes (11 total)
-- Cascade and reconciliation indexes
CREATE INDEX idx_pending_cascade ON pass05_pending_encounters(session_id, cascade_id);
CREATE INDEX idx_pending_spatial ON pass05_pending_encounters(session_id, start_page, end_page);
CREATE INDEX idx_pending_lookup ON pass05_pending_encounters(session_id, pending_id);
CREATE INDEX idx_pending_descriptor ON pass05_pending_encounters(session_id, reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;

-- Metadata indexes (from consolidated review)
CREATE INDEX idx_pending_encounters_source ON pass05_pending_encounters(encounter_source);
CREATE INDEX idx_pending_encounters_quality ON pass05_pending_encounters(data_quality_tier);
CREATE INDEX idx_pending_encounters_manual_creator ON pass05_pending_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;
CREATE INDEX idx_pending_encounters_creator ON pass05_pending_encounters(created_by_user_id);

-- Classification indexes (File 10)
CREATE INDEX idx_pending_encounters_profile ON pass05_pending_encounters(matched_profile_id)
  WHERE matched_profile_id IS NOT NULL;
CREATE INDEX idx_pending_encounters_match_status ON pass05_pending_encounters(match_status);
CREATE INDEX idx_pending_encounters_orphan ON pass05_pending_encounters(is_orphan_identity)
  WHERE is_orphan_identity = true;

-- Add unique constraint
ALTER TABLE pass05_pending_encounters
  ADD CONSTRAINT uq_pending_per_session UNIQUE (session_id, pending_id);

-- LATER: After code deployment and backfill, set NOT NULL constraints
-- ALTER TABLE pass05_pending_encounters
--   ALTER COLUMN start_page SET NOT NULL,
--   ALTER COLUMN end_page SET NOT NULL;
```

#### Column Count Summary

- **Before:** 16 columns (verified from Supabase)
- **After:** 55 columns
- **Net Change:** +39 columns (deleted 2, renamed 5, added 39, kept 11)

**Breakdown:**
- DELETE: 2 (chunk_last_seen, last_seen_context)
- RENAME: 5 (temp_encounter_id, chunk_started, partial_data, completed_encounter_id, completed_at)
- ADD: 39 (cascade: 3, positions: 13, reconciliation: 3, identity: 4, provider: 4, classification: 4, quality: 3, metadata: 5)
- KEEP: 11 (id, session_id, page_ranges, expected_continuation, status, confidence, requires_review, created_at, updated_at, etc.)

#### Impact Summary

- **Breaking Changes:** None (deleted columns were unused in Strategy A)
- **Code Updates:** MAJOR - Complete rewrite of pending encounter processing
  - Chunk processor must populate all new fields
  - Profile classifier integration (File 10)
  - Quality tier calculation (File 11)
  - Metadata handling (File 12)
- **Data Migration:** Clear existing pending encounters before migration (they're temporary anyway)
- **Testing:** CRITICAL
  - Cascade ID generation and handoff
  - Position tracking (inter_page vs intra_page)
  - Profile classification matching
  - Quality tier calculation (A/B/C criteria)
  - Metadata copying to final encounters

---

### 3. pass05_chunk_results

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Per-chunk processing metrics and results
**Strategy A Change:** Simplify to chunk-level metrics only

#### Current State Analysis (from Supabase)

**Actual columns found: 25**

```sql
-- Core identification (3 columns)
id uuid DEFAULT gen_random_uuid()
session_id uuid NOT NULL
chunk_number integer NOT NULL

-- Page range (2 columns)
page_start integer NOT NULL
page_end integer NOT NULL

-- Processing status and timing (4 columns)
processing_status text NOT NULL
started_at timestamptz
completed_at timestamptz
processing_time_ms integer

-- AI metrics (4 columns)
ai_model_used text
input_tokens integer
output_tokens integer
ai_cost_usd numeric

-- Handoff/cascade data (2 columns)
handoff_received jsonb
handoff_generated jsonb

-- OLD encounter tracking (3 columns - TO BE REMOVED)
encounters_started integer DEFAULT 0
encounters_completed integer DEFAULT 0
encounters_continued integer DEFAULT 0

-- Confidence metrics (2 columns)
confidence_score numeric
ocr_average_confidence numeric

-- Error handling (3 columns)
error_message text
error_context jsonb
retry_count integer DEFAULT 0

-- AI response (1 column)
ai_response_raw jsonb

-- Timestamp (1 column)
created_at timestamptz DEFAULT now()
```

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

#### Column Count Summary

- **Before:** 25 columns (verified from Supabase)
- **After:** 27 columns
- **Net Change:** +2 columns (deleted 3, renamed 2, added 5, kept 20)

**Breakdown:**
- DELETE: 3 (encounters_started, encounters_completed, encounters_continued)
- RENAME: 2 (handoff_received → cascade_context_received, handoff_generated → cascade_package_sent)
- ADD: 5 (pendings_created, cascading_count, cascade_ids, continues_count, page_separation_analysis)
- KEEP: 20 (id, session_id, chunk_number, page_start/end, processing_status, timing, AI metrics, confidence, errors, ai_response_raw, created_at)

#### Impact Summary

- **Breaking Changes:** None (deleted columns were unused)
- **Code Updates:** Update chunk processor to populate new cascade metrics
- **Data Migration:** None required (old columns can be dropped safely)
- **Testing:** Verify cascade metrics populate correctly

---

### 4. pass05_page_assignments

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Maps pages to encounters with AI's justification
**Strategy A Change:** Add position support for multi-encounter-per-page scenarios

#### Current State Analysis (from Supabase)

**Actual columns found: 6**

```sql
-- Core identification (1 column)
id uuid DEFAULT gen_random_uuid()

-- Page-encounter mapping (3 columns)
shell_file_id uuid NOT NULL
page_num integer NOT NULL
encounter_id text NOT NULL              -- NOTE: Currently text NOT NULL, needs to become uuid and nullable

-- AI justification (1 column)
justification text NOT NULL

-- Timestamp (1 column)
created_at timestamptz DEFAULT now()
```

**CRITICAL FINDING:** The current `encounter_id` column is:
- Type: `text` (needs to be `uuid`)
- Constraint: `NOT NULL` (needs to be nullable until reconciliation)

This suggests the table was designed for a different workflow. Strategy A requires:
- `encounter_id` to be `uuid` type (references healthcare_encounters.id)
- `encounter_id` to be `NULL` during chunking, populated after reconciliation

#### Current Design Analysis

**Multi-Encounter Pages:** Already supported (no UNIQUE constraint on page_num)
**Data Model:** One row per (page, encounter) pair
**All 6 existing columns:** KEEP (no orphaned columns)

#### Changes Required

**DELETE:** None
**RENAME:** None

**MODIFY EXISTING (1 column):**
```sql
-- encounter_id: Change from text NOT NULL to uuid nullable
-- Step 1: Drop NOT NULL constraint
-- Step 2: Change type from text to uuid
-- Step 3: Leave nullable (populated after reconciliation)
```

**ADD (6 columns):**
```sql
session_id uuid NOT NULL               -- Links to progressive session (enables FK to pendings)
is_partial boolean DEFAULT false       -- TRUE if encounter uses only part of page
pending_id text NOT NULL               -- PERMANENT: Links to pending encounter (never overwritten)
chunk_number integer NOT NULL          -- Which chunk created this assignment
cascade_id varchar(100)                -- Links to cascade if applicable
reconciled_at timestamp                -- When encounter_id was populated after reconciliation
```

**DEPRECATED (DO NOT ADD):**
```sql
-- REMOVED: position_on_page varchar(20)     -- Old 5-position system, replaced by encounter-level boundaries
-- REMOVED: position_confidence numeric       -- Redundant with is_partial
```

**New Indexes (6 total):**
```sql
CREATE INDEX idx_page_assign_doc_page ON pass05_page_assignments(shell_file_id, page_num);
CREATE INDEX idx_page_assign_encounter ON pass05_page_assignments(encounter_id)
  WHERE encounter_id IS NOT NULL;
CREATE INDEX idx_page_assign_pending ON pass05_page_assignments(session_id, pending_id);
CREATE INDEX idx_page_assign_chunk ON pass05_page_assignments(session_id, chunk_number);
CREATE INDEX idx_page_assign_cascade ON pass05_page_assignments(cascade_id)
  WHERE cascade_id IS NOT NULL;
CREATE INDEX idx_page_assign_unreconciled ON pass05_page_assignments(shell_file_id, pending_id)
  WHERE encounter_id IS NULL;
```

**New Constraints:**
```sql
-- Prevent duplicate page assignments for same pending
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT uq_page_per_pending
  UNIQUE (shell_file_id, page_num, pending_id);

-- Foreign key to pending encounters
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT fk_pending_encounter
  FOREIGN KEY (session_id, pending_id)
  REFERENCES pass05_pending_encounters(session_id, pending_id)
  ON DELETE CASCADE;

-- Foreign key to final encounters (optional, can be NULL)
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT fk_final_encounter
  FOREIGN KEY (encounter_id)
  REFERENCES healthcare_encounters(id)
  ON DELETE CASCADE;
```

#### Migration SQL Preview

```sql
-- CRITICAL: Fix encounter_id column type and nullability
-- Step 1: Drop NOT NULL constraint
ALTER TABLE pass05_page_assignments
  ALTER COLUMN encounter_id DROP NOT NULL;

-- Step 2: Change type from text to uuid (requires casting or data cleanup)
-- If table has data, clear it first since this is a breaking change
TRUNCATE TABLE pass05_page_assignments;

-- Step 3: Change column type
ALTER TABLE pass05_page_assignments
  ALTER COLUMN encounter_id TYPE uuid USING encounter_id::uuid;

-- Add session reference (required for FK to pendings)
ALTER TABLE pass05_page_assignments
  ADD COLUMN session_id uuid NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE;

-- Add dual-ID tracking (pending during chunking, encounter after reconciliation)
ALTER TABLE pass05_page_assignments
  ADD COLUMN pending_id text NOT NULL,
  ADD COLUMN reconciled_at timestamp;

-- Add provenance tracking
ALTER TABLE pass05_page_assignments
  ADD COLUMN chunk_number integer NOT NULL,
  ADD COLUMN cascade_id varchar(100);

-- Add page metadata
ALTER TABLE pass05_page_assignments
  ADD COLUMN is_partial boolean DEFAULT false;

-- Add unique constraint (prevent duplicate pending assignments)
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT uq_page_per_pending
  UNIQUE (shell_file_id, page_num, pending_id);

-- Add foreign key constraints
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT fk_pending_encounter
  FOREIGN KEY (session_id, pending_id)
  REFERENCES pass05_pending_encounters(session_id, pending_id)
  ON DELETE CASCADE;

ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT fk_final_encounter
  FOREIGN KEY (encounter_id)
  REFERENCES healthcare_encounters(id)
  ON DELETE CASCADE;

-- Create indexes
CREATE INDEX idx_page_assign_doc_page ON pass05_page_assignments(shell_file_id, page_num);
CREATE INDEX idx_page_assign_encounter ON pass05_page_assignments(encounter_id)
  WHERE encounter_id IS NOT NULL;
CREATE INDEX idx_page_assign_pending ON pass05_page_assignments(session_id, pending_id);
CREATE INDEX idx_page_assign_chunk ON pass05_page_assignments(session_id, chunk_number);
CREATE INDEX idx_page_assign_cascade ON pass05_page_assignments(cascade_id)
  WHERE cascade_id IS NOT NULL;
CREATE INDEX idx_page_assign_unreconciled ON pass05_page_assignments(shell_file_id, pending_id)
  WHERE encounter_id IS NULL;
```

#### Column Count Summary

- **Before:** 6 columns (verified from Supabase)
- **After:** 12 columns
- **Net Change:** +6 columns (modified 1, added 6, kept 5)

**Breakdown:**
- MODIFY: 1 (encounter_id: text NOT NULL → uuid nullable)
- ADD: 6 (session_id, pending_id, chunk_number, cascade_id, is_partial, reconciled_at)
- KEEP: 5 (id, shell_file_id, page_num, justification, created_at)

#### Impact Summary

- **Breaking Changes:** YES - encounter_id type change from text to uuid (requires TRUNCATE)
- **Code Updates:**
  - Update chunk-processor to populate session_id, pending_id, chunk_number, cascade_id
  - Update reconciler to set encounter_id and reconciled_at after grouping
  - Remove references to deprecated position_on_page field
- **Data Migration:** None required (all new columns)
- **Testing:**
  - Test multi-encounter page scenarios (2+ encounters on same page)
  - Test page assignment lifecycle (pending_id → encounter_id transition)
  - Test cascade deletion (verify FK cascades work correctly)
  - Test duplicate prevention (unique constraint on pending_id)

---

### 5. pass05_encounter_metrics

**Current Schema Location:** `current_schema/04_ai_processing.sql` (Lines ~TBD)

**Purpose:** Final summary statistics for completed Pass 0.5 session
**Strategy A Change:** Populated AFTER reconciliation completes

#### Current State Analysis (from Supabase)

**Actual columns found: 23**

```sql
-- Core identification (3 columns)
id uuid DEFAULT gen_random_uuid()
patient_id uuid NOT NULL
shell_file_id uuid NOT NULL
processing_session_id uuid NOT NULL

-- Encounter counts (4 columns)
encounters_detected integer NOT NULL
real_world_encounters integer NOT NULL
pseudo_encounters integer NOT NULL
planned_encounters integer NOT NULL DEFAULT 0

-- Processing metrics (3 columns)
processing_time_ms integer NOT NULL
processing_time_seconds numeric
total_pages integer NOT NULL

-- AI metrics (5 columns)
ai_model_used text NOT NULL
input_tokens integer NOT NULL
output_tokens integer NOT NULL
total_tokens integer NOT NULL
ai_cost_usd numeric

-- Confidence metrics (3 columns)
ocr_average_confidence numeric
encounter_confidence_average numeric
encounter_types_found text[]           -- Array type

-- Batching (1 column - TO BE REMOVED)
batching_required boolean NOT NULL DEFAULT false

-- Network metadata (2 columns - TO BE REMOVED)
user_agent text
ip_address inet

-- Timestamp (1 column)
created_at timestamptz DEFAULT now()
```

#### Changes Required

**DELETE (3 columns):**
- `user_agent` - Never populated, not relevant for backend worker
- `ip_address` - Never populated, not relevant for backend worker
- `batching_required` - Always TRUE in Strategy A (replaced by chunk_count)

**RENAME:** None

**ADD (15 columns):**
```sql
-- Reconciliation metrics (5 columns)
pendings_total integer                 -- Total pendings before reconciliation
cascades_total integer                 -- Number of cascade chains created
orphans_total integer                  -- Pendings that couldn't reconcile
reconciliation_time_ms integer         -- Time spent in reconciliation
reconciliation_method varchar(20)      -- Primary method: 'cascade','descriptor','mixed'

-- Chunk metrics (3 columns)
chunk_count integer                    -- Number of chunks processed
avg_chunk_time_ms integer              -- Average time per chunk
max_chunk_time_ms integer              -- Slowest chunk time

-- Quality metrics (2 columns)
pages_with_multi_encounters integer    -- Pages with >1 encounter
position_confidence_avg numeric        -- Average position confidence

-- Identity completeness metrics (4 columns - File 10)
encounters_with_patient_name integer DEFAULT 0   -- Encounters with patient full name
encounters_with_dob integer DEFAULT 0            -- Encounters with date of birth
encounters_with_provider integer DEFAULT 0       -- Encounters with provider name
encounters_with_facility integer DEFAULT 0       -- Encounters with facility name

-- Quality tier summary (2 columns - File 11)
encounters_high_quality integer DEFAULT 0        -- HIGH or VERIFIED tier
encounters_low_quality integer DEFAULT 0         -- LOW or MEDIUM tier
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

-- Add identity completeness metrics (File 10 integration)
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN encounters_with_patient_name integer DEFAULT 0,
  ADD COLUMN encounters_with_dob integer DEFAULT 0,
  ADD COLUMN encounters_with_provider integer DEFAULT 0,
  ADD COLUMN encounters_with_facility integer DEFAULT 0;

-- Add quality tier summary (File 11 integration)
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN encounters_high_quality integer DEFAULT 0,
  ADD COLUMN encounters_low_quality integer DEFAULT 0;
```

#### Column Count Summary

- **Before:** 23 columns (verified from Supabase)
- **After:** 35 columns
- **Net Change:** +12 columns (deleted 3, added 15, kept 20)

**Breakdown:**
- DELETE: 3 (user_agent, ip_address, batching_required)
- ADD: 15 (5 reconciliation + 3 chunk + 2 quality position + 4 identity completeness + 2 quality tier summary - see breakdown above)
- KEEP: 20 (id, patient_id, shell_file_id, processing_session_id, encounters_detected, real_world_encounters, pseudo_encounters, planned_encounters, processing_time_ms, processing_time_seconds, total_pages, ai_model_used, input_tokens, output_tokens, total_tokens, ai_cost_usd, ocr_average_confidence, encounter_confidence_average, encounter_types_found, created_at)

#### Impact Summary

- **Breaking Changes:** None (deleted columns never used)
- **Code Updates:** Update metrics aggregation logic after reconciliation completes
- **Data Migration:** None required
- **Testing:** Verify all new reconciliation and chunk metrics populate correctly

---

### 6. healthcare_encounters

**Current Schema Location:** `current_schema/03_clinical_core.sql` (Lines ~TBD)

**Purpose:** Final encounter storage (ALL passes write here)
**Strategy A Change:** Add position columns for sub-page granularity, cascade tracking, metadata/classification/quality fields

#### Current State Analysis (from Supabase)

**Actual columns found: 46**

```sql
-- Core identification (3 columns)
id uuid DEFAULT gen_random_uuid()
patient_id uuid NOT NULL
encounter_type text NOT NULL

-- Clinical data (9 columns)
encounter_start_date timestamptz
encounter_end_date timestamptz  -- NOTE: Currently "encounter_date_end" in Supabase, will be renamed
provider_name text
provider_type text
facility_name text
specialty text
chief_complaint text
summary text
clinical_impression text

-- Billing/admin (1 column)
billing_codes text[]

-- Shell file references (3 columns)
primary_shell_file_id uuid
related_shell_file_ids uuid[] DEFAULT '{}'
all_shell_file_ids uuid[] DEFAULT ARRAY[]

-- Review/status (2 columns)
requires_review boolean DEFAULT false
archived boolean NOT NULL DEFAULT false

-- Timestamps (4 columns)
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
valid_from timestamptz NOT NULL DEFAULT now()
valid_to timestamptz

-- Future features (2 columns)
clinical_event_id uuid
primary_narrative_id uuid

-- Versioning (4 columns)
superseded_by_record_id uuid
supersession_reason text
is_current boolean
clinical_identity_key text

-- Date extraction/resolution (6 columns - SOME TO BE REMOVED)
clinical_effective_date date              -- REMOVE (never populated)
date_confidence text                      -- REMOVE (never populated)
extracted_dates jsonb DEFAULT '[]'
date_source text NOT NULL DEFAULT 'upload_date'
date_conflicts jsonb DEFAULT '[]'
date_resolution_reason text               -- REMOVE (never populated)

-- Position/spatial (2 columns)
page_ranges integer[] DEFAULT '{}'
spatial_bounds jsonb

-- Pass tracking (4 columns)
identified_in_pass text DEFAULT 'pass_2'
is_real_world_visit boolean DEFAULT true
pass_0_5_confidence numeric
ocr_average_confidence numeric

-- Future features (4 columns)
is_planned_future boolean DEFAULT false
master_encounter_id uuid
master_encounter_confidence numeric
source_method text NOT NULL
encounter_timeframe_status text NOT NULL DEFAULT 'completed'

-- Plan field (1 column - REMOVE)
plan text                                 -- REMOVE (never populated)
```

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

**ADD (38 columns total):**

**Column Parity Principle:** These match `pass05_pending_encounters` to ensure data flows cleanly through reconciliation.

```sql
-- CASCADE SUPPORT (3 columns)
cascade_id varchar(100)                -- Which cascade created this (if any)
chunk_count integer DEFAULT 1          -- How many chunks this encounter spanned
reconciliation_key text                -- Unique descriptor for duplicate detection

-- POSITION TRACKING (13 columns - matches batching design pattern)
-- START boundary position
start_page integer                     -- First page of encounter
start_boundary_type varchar(20)        -- 'inter_page' or 'intra_page'
start_marker text                      -- Descriptive text (e.g., "after header 'ADMISSION'")
start_text_y_top integer               -- NULL if inter_page; Y-coord of marker text top
start_text_height integer              -- NULL if inter_page; height of marker text
start_y integer                        -- NULL if inter_page; calculated split line (y_top - height)

-- END boundary position
end_page integer                       -- Last page of encounter
end_boundary_type varchar(20)          -- 'inter_page' or 'intra_page'
end_marker text                        -- Descriptive text (e.g., "before header 'DISCHARGE'")
end_text_y_top integer                 -- NULL if inter_page; Y-coord of marker text top
end_text_height integer                -- NULL if inter_page; height of marker text
end_y integer                          -- NULL if inter_page; calculated split line (y_top - height)

-- Overall position confidence
position_confidence numeric            -- Confidence in boundary positions (0.0-1.0)

-- RECONCILIATION (3 columns)
source_shell_file_id uuid NOT NULL     -- Links to shell_file (matches pending_encounters column name)
completed_at timestamptz               -- When reconciliation created this final encounter
reconciled_from_pendings integer       -- Count of pending encounters merged into this

-- NOTE: Multi-Profile Account Flow
-- patient_id vs matched_profile_id relationship:
-- - Before classification: patient_id may be temporary/orphan, matched_profile_id = NULL
-- - After classification: both converge to the same profile ID
-- - No constraint enforcing equality because temporary misalignment is valid
-- See detailed flow documentation below

-- IDENTITY MARKERS (File 10 - 4 columns)
patient_full_name text                 -- Full name extracted from document
patient_date_of_birth date             -- DOB extracted from document
patient_mrn text                       -- Medical record number if present
patient_address text                   -- Address if present

-- PROVIDER/FACILITY (3 columns - partially exists, complete the set)
-- provider_name (already exists)
-- facility_name (already exists)
facility_address text                  -- Facility address if present

-- CLASSIFICATION RESULTS (File 10 - 4 columns)
matched_profile_id uuid                -- REFERENCES user_profiles(id)
match_confidence numeric               -- 0.0 to 1.0
match_status varchar(20)               -- 'matched', 'unmatched', 'orphan', 'review'
is_orphan_identity boolean DEFAULT false

-- DATA QUALITY (File 11 - 3 columns)
data_quality_tier varchar(20)          -- 'low', 'medium', 'high', 'verified'
  CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified'))
quality_criteria_met jsonb             -- {"criteria_a": true, "criteria_b": false}
quality_calculation_date timestamptz   -- When quality tier was calculated

-- ENCOUNTER SOURCE METADATA (File 12 - 5 columns)
encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
  CHECK (encounter_source IN ('shell_file', 'manual', 'api'))
manual_created_by varchar(20)          -- 'provider', 'user', 'other_user'
  CHECK (manual_created_by IN ('provider', 'user', 'other_user'))
created_by_user_id uuid REFERENCES auth.users(id)
api_source_name varchar(100)
api_import_date date
```

**New Indexes (11 total):**
```sql
-- Cascade and spatial indexes
CREATE INDEX idx_encounters_cascade ON healthcare_encounters(cascade_id)
  WHERE cascade_id IS NOT NULL;

CREATE INDEX idx_encounters_spatial ON healthcare_encounters
  USING gin (spatial_bounds)
  WHERE spatial_bounds IS NOT NULL;

-- Metadata indexes (File 12)
CREATE INDEX idx_encounters_source ON healthcare_encounters(encounter_source);
CREATE INDEX idx_encounters_quality ON healthcare_encounters(data_quality_tier);
CREATE INDEX idx_encounters_manual_creator ON healthcare_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;
CREATE INDEX idx_encounters_creator ON healthcare_encounters(created_by_user_id);

-- Classification indexes (File 10)
CREATE INDEX idx_encounters_profile ON healthcare_encounters(matched_profile_id)
  WHERE matched_profile_id IS NOT NULL;
CREATE INDEX idx_encounters_match_status ON healthcare_encounters(match_status);
CREATE INDEX idx_encounters_orphan ON healthcare_encounters(is_orphan_identity)
  WHERE is_orphan_identity = true;

-- Reconciliation index
CREATE INDEX idx_encounters_source_file ON healthcare_encounters(source_shell_file_id);
CREATE INDEX idx_encounters_reconciliation_key ON healthcare_encounters(reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;
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

-- Rename for consistency
ALTER TABLE healthcare_encounters
  RENAME COLUMN primary_shell_file_id TO source_shell_file_id,
  RENAME COLUMN encounter_date_end TO encounter_end_date;  -- Consistency with encounter_start_date

-- CRITICAL FIX: Change page_ranges to match pending_encounters structure
-- From: integer[] (flat array) → To: integer[][] (array of [start,end] pairs)
ALTER TABLE healthcare_encounters
  ALTER COLUMN page_ranges TYPE integer[][]
  USING CASE
    WHEN page_ranges IS NULL THEN NULL
    WHEN array_length(page_ranges, 1) = 0 THEN ARRAY[]::integer[][]
    ELSE ARRAY[page_ranges]::integer[][]  -- Wrap existing flat array as single range
  END;

-- Add cascade support (3 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN chunk_count integer DEFAULT 1,
  ADD COLUMN reconciliation_key text;

-- Add position tracking (13 columns)
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

-- Add reconciliation tracking (2 columns - completed_at calculated, reconciled_from_pendings added)
ALTER TABLE healthcare_encounters
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN reconciled_from_pendings integer;

-- Add identity markers (File 10 - 4 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN patient_full_name text,
  ADD COLUMN patient_date_of_birth date,
  ADD COLUMN patient_mrn text,
  ADD COLUMN patient_address text;

-- Add facility address (File 10 - 1 column)
ALTER TABLE healthcare_encounters
  ADD COLUMN facility_address text;

-- Add classification results (File 10 - 4 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN matched_profile_id uuid,
  ADD COLUMN match_confidence numeric,
  ADD COLUMN match_status varchar(20),
  ADD COLUMN is_orphan_identity boolean DEFAULT false;

-- Add data quality (File 11 - 3 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN data_quality_tier varchar(20)
    CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified')),
  ADD COLUMN quality_criteria_met jsonb,
  ADD COLUMN quality_calculation_date timestamptz;

-- Add encounter source metadata (File 12 - 5 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
    CHECK (encounter_source IN ('shell_file', 'manual', 'api')),
  ADD COLUMN manual_created_by varchar(20)
    CHECK (manual_created_by IN ('provider', 'user', 'other_user')),
  ADD COLUMN created_by_user_id uuid NOT NULL REFERENCES auth.users(id),  -- NOT NULL: always from shell_files.uploaded_by
  ADD COLUMN api_source_name varchar(100),
  ADD COLUMN api_import_date date;

-- Add cross-field constraint for data integrity (File 12)
ALTER TABLE healthcare_encounters
  ADD CONSTRAINT check_shell_file_source_valid
    CHECK (encounter_source != 'shell_file' OR source_shell_file_id IS NOT NULL);

-- Create all 11 indexes (see index list above)
CREATE INDEX idx_encounters_cascade ON healthcare_encounters(cascade_id)
  WHERE cascade_id IS NOT NULL;
CREATE INDEX idx_encounters_spatial ON healthcare_encounters
  USING gin (spatial_bounds)
  WHERE spatial_bounds IS NOT NULL;
CREATE INDEX idx_encounters_source ON healthcare_encounters(encounter_source);
CREATE INDEX idx_encounters_quality ON healthcare_encounters(data_quality_tier);
CREATE INDEX idx_encounters_manual_creator ON healthcare_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;
CREATE INDEX idx_encounters_creator ON healthcare_encounters(created_by_user_id);
CREATE INDEX idx_encounters_profile ON healthcare_encounters(matched_profile_id)
  WHERE matched_profile_id IS NOT NULL;
CREATE INDEX idx_encounters_match_status ON healthcare_encounters(match_status);
CREATE INDEX idx_encounters_orphan ON healthcare_encounters(is_orphan_identity)
  WHERE is_orphan_identity = true;
CREATE INDEX idx_encounters_source_file ON healthcare_encounters(source_shell_file_id);
CREATE INDEX idx_encounters_reconciliation_key ON healthcare_encounters(reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;
```

#### Column Count Summary

- **Before:** 46 columns (verified from Supabase)
- **After:** 80 columns
- **Net change:** +34 columns (deleted 4, renamed 1, added 38, kept 42)

**Breakdown:**
- DELETE: 4 (plan, date_resolution_reason, clinical_effective_date, date_confidence)
- RENAME: 1 (primary_shell_file_id → source_shell_file_id)
- ADD: 38 (3 cascade + 13 position + 2 reconciliation + 4 identity + 1 facility + 4 classification + 3 quality + 5 metadata + 3 provider/facility)
- KEEP: 42 (all other existing columns)

**Column Parity with pass05_pending_encounters:**
Both tables now share the same 38 core columns for cascade, position, identity, classification, quality, and metadata tracking. This ensures clean data flow through reconciliation.

**Column Parity Principle Clarification:**
"Column Parity" means fields representing the SAME SEMANTIC DATA should have the SAME NAMES and COMPATIBLE TYPES (e.g., `cascade_id`, `data_quality_tier`). It does NOT mean the tables are structurally identical. Intentional differences exist:
- Pending has `is_cascading` (chunk-level flag), final has `chunk_count` (aggregate summary)
- Pending has `text` DOB (raw from AI), final has `date` DOB (parsed/normalized)
- Both perspectives are valid for their respective stages in the pipeline

#### Multi-Profile Account Flow

**Vision:** An account can have multiple profiles (account holder + children/dependents). When a file is uploaded, the extracted patient identity gets matched against ALL profiles in the account.

**Workflow:**

1. **Upload Stage:**
   - Account owner (auth.users.id) uploads medical document
   - File initially assigned to uploader's account (not yet to specific profile)

2. **Processing Stage (Before Classification):**
   ```sql
   -- Pending encounters created during chunking
   pass05_pending_encounters:
     patient_id = orphan_temp_profile_id  -- Temporary placeholder
     matched_profile_id = NULL            -- Classification hasn't run yet
     match_status = 'pending'
     patient_full_name = 'Sarah Smith'    -- Extracted from document
     patient_date_of_birth = '1985-03-15' -- Extracted from document
   ```

3. **Classification Stage (File 10):**
   - Profile matcher compares extracted identity against all account profiles:
     - Profile 1: John (account owner)
     - Profile 2: Jane (spouse)
     - Profile 3: Emma (daughter)
     - Profile 4: Liam (son)

   **Scenario A - Match Found:**
   ```sql
   healthcare_encounters:
     patient_id = profile_3_id (Emma)           -- Matched profile
     matched_profile_id = profile_3_id (Emma)   -- Same as patient_id
     match_status = 'matched'
     match_confidence = 0.95
     is_orphan_identity = false
   ```

   **Scenario B - No Match Found:**
   ```sql
   healthcare_encounters:
     patient_id = orphan_temp_profile_id        -- Still temporary
     matched_profile_id = NULL                  -- No match
     match_status = 'unmatched'
     match_confidence = NULL
     is_orphan_identity = true                  -- Flagged for review
   ```

4. **User Intervention (If No Match):**
   - Account owner prompted: "No matching profile found for 'Sarah Smith'"
   - Options presented:
     - Assign to existing profile (manual selection)
     - Create new profile for this identity

   **If User Creates New Profile:**
   ```sql
   -- New profile created
   user_profiles:
     id = new_profile_5_id
     full_name = 'Sarah Smith'
     date_of_birth = '1985-03-15'

   -- Encounter updated
   healthcare_encounters:
     patient_id = new_profile_5_id              -- New profile
     matched_profile_id = new_profile_5_id      -- User-confirmed
     match_status = 'matched'
     match_confidence = 1.0                     -- 100% (user verified)
     is_orphan_identity = false                 -- Resolved
   ```

**Why patient_id and matched_profile_id Can Differ:**
- **Before classification:** patient_id is temporary/orphan, matched_profile_id is NULL
- **After classification:** both converge to the same profile ID
- **No database constraint enforcing equality** because temporary misalignment is a valid intermediate state
- Application logic validates: `IF match_status = 'matched' THEN patient_id MUST EQUAL matched_profile_id`

#### Impact Summary

- **Breaking Changes:** Column rename (primary_shell_file_id → source_shell_file_id) requires worker code updates
- **Code Updates Required:**
  1. **Reconciler:** Copy all new fields from pending_encounters to healthcare_encounters
  2. **Worker Scripts:** Update 3 references to `primary_shell_file_id` → `source_shell_file_id`:
     - `apps/render-worker/src/pass05/progressive/pending-reconciler.ts` (2 occurrences)
     - `apps/render-worker/src/pass05/progressive/chunk-processor.ts` (1 occurrence)
- **Data Migration:** Rename existing column via `ALTER TABLE ... RENAME COLUMN`
- **Testing:**
  - Verify all metadata flows from pending to final encounters correctly
  - Test worker encounters creation after column rename
  - Verify unique constraint still works with new column name

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

#### Current State Analysis (from Supabase)

**Total Columns:** 38

**Core Identification (8 columns):**
- `id` (uuid, PK)
- `patient_id` (uuid, FK → user_profiles.id) - Which profile owns this document
- `uploaded_by` (uuid, FK → auth.users.id) - **MISSING - needs to be added**
- `filename` (text)
- `original_filename` (text)
- `file_size_bytes` (integer)
- `mime_type` (text)
- `storage_path` (text)

**Status Tracking (4 columns):**
- `status` (text)
- `processing_started_at` (timestamptz)
- `processing_completed_at` (timestamptz)
- `processing_error` (text) - **NEVER POPULATED, DELETE**

**OCR Data (4 columns):**
- `extracted_text` (text)
- `ocr_confidence` (numeric) - **REDUNDANT with ocr_average_confidence, DELETE**
- `ocr_raw_jsonb` (jsonb)
- `ocr_average_confidence` (numeric)

**Processing Metadata (4 columns):**
- `page_count` (integer)
- `processing_job_id` (uuid)
- `processing_worker_id` (text)
- `processing_priority` (integer)

**Processed Images (4 columns):**
- `processed_image_path` (text)
- `processed_image_checksum` (text)
- `processed_image_mime` (text)
- `processed_image_size_bytes` (integer)

**Pass 0.5 Tracking (5 columns):**
- `pass_0_5_completed` (boolean)
- `pass_0_5_completed_at` (timestamptz)
- `pass_0_5_error` (text)
- `pass_0_5_version` (text)
- `pass_0_5_progressive` (boolean) - **ALWAYS TRUE in Strategy A, REDUNDANT with progressive_session_id, DELETE**

**Synthesis Data (3 columns):**
- `ai_synthesized_summary` (text)
- `narrative_count` (integer)
- `synthesis_completed_at` (timestamptz)

**Metrics & Operations (4 columns):**
- `idempotency_key` (uuid)
- `processing_cost_estimate` (numeric)
- `processing_duration_seconds` (integer)
- `language_detected` (text)

**Batching Analysis (1 column):**
- `page_separation_analysis` (jsonb) - **EXISTS but NEVER POPULATED (0/197 rows), NEEDS IMPLEMENTATION**

**Timestamps (2 columns):**
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

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

#### File 12 Integration: Document Source Classification

**NEW COLUMNS from `12-ENCOUNTER-SOURCES-V2.md`:**

Pass 0.5 needs to support multiple document sources beyond scanned uploads. File 12 defines the **encounter_source** strategy for Strategy A.

**`shell_file_subtype` (varchar(50)):**
- Classifies the TYPE of shell_file being processed
- Values: `'scanned_document'`, `'progress_note'`, `'voice_transcript'`, `'api_import'`
- Used by reconciler to determine quality tier logic
- Default: `'scanned_document'` for existing uploaded files

**`api_source_name` (text, nullable):**
- Identifies the API source for imported documents
- Examples: `'medicare_australia'`, `'my_health_record'`, `'fitbit_api'`
- NULL for non-API sources (scanned docs, manual entries, voice)
- Used for quality tier calculation (trusted APIs → higher quality)

**Quality Tier Relationship:**
```typescript
// Reconciler uses these fields to determine quality
if (shellFile.shell_file_subtype === 'api_import') {
  const apiReputation = {
    'medicare_australia': 'HIGH',
    'my_health_record': 'HIGH',
    'fitbit_api': 'MEDIUM'
  };
  qualityTier = apiReputation[shellFile.api_source_name] || 'MEDIUM';
} else if (shellFile.shell_file_subtype === 'progress_note') {
  // Manual entry - check creator role
  qualityTier = determineFromCreatorRole(shellFile.uploaded_by);
} else {
  // Scanned document - use A/B/C criteria from AI extraction
  qualityTier = calculateFromABCCriteria(encounter);
}
```

**File 13 vs File 12:**
- **File 13** (Manual Encounters Future) proposes `shell_file_metadata` table - OUT OF SCOPE for Strategy A
- **File 12** (Encounter Sources V2) defines minimal source classification - IN SCOPE for Strategy A
- We implement File 12's design (2 columns on shell_files), not File 13's separate metadata table

#### Changes Required

**DELETE (3 columns):**
- `processing_error` - Replaced by pass-specific error fields (never populated)
- `ocr_confidence` - Redundant with ocr_average_confidence
- `pass_0_5_progressive` - Always TRUE in Strategy A, redundant with progressive_session_id

**RENAME:** None

**ADD (5 columns):**
```sql
-- CRITICAL: Auth user tracking (for created_by_user_id on encounters)
uploaded_by uuid NOT NULL REFERENCES auth.users(id)                    -- Which auth user uploaded this file

-- Strategy A tracking
progressive_session_id uuid REFERENCES pass05_progressive_sessions(id)  -- Direct link to session
reconciliation_method varchar(20)                                       -- 'cascade','descriptor','mixed'

-- File 12: Encounter source classification (Strategy A)
shell_file_subtype varchar(50)                                          -- 'scanned_document','progress_note','voice_transcript','api_import'
api_source_name text                                                    -- For API imports: 'medicare_australia', 'my_health_record', etc.
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

**Column Count:** 38 → 40 (Delete 3, Add 5)
**Index Count:** +3 new indexes

```sql
-- CRITICAL: Add uploaded_by FIRST (needed for created_by_user_id on encounters)
ALTER TABLE shell_files
  ADD COLUMN uploaded_by uuid NOT NULL REFERENCES auth.users(id);

-- Backfill uploaded_by from patient_id for existing files (temporary - assumes single-user accounts)
-- TODO: Update this logic for multi-user accounts when that feature launches
UPDATE shell_files sf
SET uploaded_by = (
  SELECT up.id FROM user_profiles up WHERE up.id = sf.patient_id LIMIT 1
);

-- Remove orphaned/redundant columns
ALTER TABLE shell_files
  DROP COLUMN processing_error,        -- Never populated
  DROP COLUMN ocr_confidence,          -- Redundant with ocr_average_confidence
  DROP COLUMN pass_0_5_progressive;    -- Always TRUE in Strategy A, use progressive_session_id

-- Add Strategy A columns
ALTER TABLE shell_files
  ADD COLUMN progressive_session_id uuid REFERENCES pass05_progressive_sessions(id),
  ADD COLUMN reconciliation_method varchar(20),  -- 'cascade', 'descriptor', 'mixed'
  ADD COLUMN shell_file_subtype varchar(50),     -- 'scanned_document', 'progress_note', 'voice_transcript', 'api_import'
  ADD COLUMN api_source_name text;               -- For API imports: 'medicare_australia', 'my_health_record', NULL for non-API

-- Create indexes
CREATE INDEX idx_shell_files_job ON shell_files(processing_job_id)
  WHERE processing_job_id IS NOT NULL;
CREATE INDEX idx_shell_files_session ON shell_files(progressive_session_id)
  WHERE progressive_session_id IS NOT NULL;
CREATE INDEX idx_shell_files_subtype ON shell_files(shell_file_subtype)
  WHERE shell_file_subtype IS NOT NULL;
```

**IMPLEMENT Existing Column:**
- `page_separation_analysis` (jsonb) - Already exists, needs V11 prompt to populate during reconciliation
- See `06-BATCHING-TASK-DESIGN-V2.md` for complete specification

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

#### Current State Analysis (from Supabase)

**View exists:** ✅ YES (verified in Supabase)

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

**Current State:** ❌ Does NOT exist in Supabase (verified)

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

**Current State:** ❌ Does NOT exist in Supabase (verified)

**Purpose:** Audit trail for reconciliation decisions

**Schema:**
```sql
CREATE TABLE pass05_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,
  cascade_id varchar(100),
  pending_ids text[],                         -- Array of pending IDs reconciled (text to match pending_id type)
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

### 3. pass05_pending_encounter_identifiers

**Current State:** ❌ Does NOT exist in Supabase (needs creation)

**Purpose:** Store identity markers (MRN, insurance numbers, etc.) extracted during Pass 0.5

**Schema:**
```sql
CREATE TABLE pass05_pending_encounter_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  pending_id text NOT NULL,

  identifier_type varchar(50),        -- 'MRN', 'INSURANCE', 'MEDICARE', etc.
  identifier_value varchar(100),
  issuing_organization text,
  detected_context text,               -- Raw text where found

  created_at timestamp DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id, pending_id)
    REFERENCES pass05_pending_encounters(session_id, pending_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_pending_identifiers_value ON pass05_pending_encounter_identifiers(identifier_value);
CREATE INDEX idx_pending_identifiers_type ON pass05_pending_encounter_identifiers(identifier_type);
CREATE INDEX idx_pending_identifiers_pending ON pass05_pending_encounter_identifiers(session_id, pending_id);
```

**Source of Truth Location:** `10-PROFILE-CLASSIFICATION-INTEGRATION.md` (Section 4.2)

**Expected Usage:** 0-5 rows per encounter (most encounters have 0-2 identifiers)

---

### 4. healthcare_encounter_identifiers

**Current State:** ❌ Does NOT exist in Supabase (needs creation)

**Purpose:** Final identity markers table after reconciliation (migrated from pending identifiers)

**Schema:**
```sql
CREATE TABLE healthcare_encounter_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,

  identifier_type varchar(50),
  identifier_value varchar(100),
  issuing_organization text,

  -- Audit trail
  source_pending_id text,              -- Which pending created this
  migrated_at timestamp DEFAULT CURRENT_TIMESTAMP,

  -- Simplified unique constraint
  CONSTRAINT uq_encounter_identifier UNIQUE (encounter_id, identifier_type, identifier_value)
);

CREATE INDEX idx_encounter_identifiers_value ON healthcare_encounter_identifiers(identifier_value);
CREATE INDEX idx_encounter_identifiers_encounter ON healthcare_encounter_identifiers(encounter_id);
```

**Source of Truth Location:** `10-PROFILE-CLASSIFICATION-INTEGRATION.md` (Section 4.4)

**Expected Usage:** 0-5 rows per encounter (migrated from pending identifiers)

---

### 5. orphan_identities

**Current State:** ❌ Does NOT exist in Supabase (needs creation)

**Purpose:** Track unmatched identities that might become new profiles (enables smart profile creation suggestions)

**CRITICAL:** Required for orphan detection in classification algorithm (File 10, line 371: `countOrphanOccurrences()`)

**Schema:**
```sql
CREATE TABLE orphan_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid REFERENCES auth.users(id),

  detected_name text,
  detected_dob text,
  encounter_count integer DEFAULT 1,
  first_seen timestamp DEFAULT CURRENT_TIMESTAMP,
  last_seen timestamp DEFAULT CURRENT_TIMESTAMP,

  suggested_for_profile boolean DEFAULT false,
  user_decision varchar(20),          -- 'accepted', 'rejected', 'pending'
  created_profile_id uuid REFERENCES user_profiles(id)
);

CREATE INDEX idx_orphan_identities_account ON orphan_identities(account_owner_id);
CREATE INDEX idx_orphan_identities_name ON orphan_identities(detected_name);
CREATE INDEX idx_orphan_identities_suggested ON orphan_identities(suggested_for_profile)
  WHERE suggested_for_profile = true;
```

**Source of Truth Location:** `10-PROFILE-CLASSIFICATION-INTEGRATION.md` (Section 4.5)

**Expected Usage:** 0-10 rows per account (only for unmatched identities appearing 3+ times)

**Note:** Marked "(Future)" in File 10 but REQUIRED by classification logic

---

### 6. profile_classification_audit

**Current State:** ❌ Does NOT exist in Supabase (needs creation)

**Purpose:** Audit trail for profile classification decisions (privacy/security requirement)

**Schema:**
```sql
CREATE TABLE profile_classification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_encounter_id text,
  attempted_match jsonb,        -- Sanitized matching attempt
  result varchar(50),           -- 'matched', 'unmatched', 'orphan', 'review'
  confidence numeric,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_classification_audit_pending ON profile_classification_audit(pending_encounter_id);
CREATE INDEX idx_classification_audit_result ON profile_classification_audit(result);
CREATE INDEX idx_classification_audit_created ON profile_classification_audit(created_at);
```

**Source of Truth Location:** `10-PROFILE-CLASSIFICATION-INTEGRATION.md` (Section 11.2)

**Expected Usage:** 1 row per pending encounter (classification audit trail)

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
5. `pass05_cascade_chains` - New table (cascade tracking)
6. `pass05_reconciliation_log` - New table (reconciliation audit)
7. `pass05_pending_encounter_identifiers` - New table (identity markers)
8. `healthcare_encounter_identifiers` - New table (final identity markers)
9. `orphan_identities` - New table (orphan detection)
10. `profile_classification_audit` - New table (classification audit)

#### Stage 4: Modify Display Tables (Low Risk)
11. `pass05_page_assignments` - Page mapping
12. `pass05_encounter_metrics` - Final metrics

#### Stage 5: Modify Core Tables (Low Risk)
13. `healthcare_encounters` - Final encounter storage
14. `shell_files` - Document metadata

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