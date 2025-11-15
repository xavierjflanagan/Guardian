# Pass 0.5 Strategy A - Table Design

**Date:** November 14, 2024
**Version:** 1.0
**Purpose:** Database schema design for Strategy A implementation

## Table Categories

### 1. Core Tables (Existing - Modify)

#### healthcare_encounters
**Purpose:** Final encounter storage
**Current State:** Contains completed encounters
**Strategy A Changes:**
```sql
-- Add position columns
ALTER TABLE healthcare_encounters
  ADD COLUMN start_page integer,
  ADD COLUMN end_page integer,
  ADD COLUMN start_position varchar(20),  -- 'top','quarter','middle','three-quarters','bottom'
  ADD COLUMN end_position varchar(20),
  ADD COLUMN start_bbox jsonb,  -- Future: {"x":100,"y":200,"w":400,"h":50}
  ADD COLUMN end_bbox jsonb;    -- Future: {"x":100,"y":800,"w":400,"h":100}
```
**Notes:** All encounters come here ONLY after reconciliation

#### shell_files
**Purpose:** Document metadata
**Current State:** Tracks processing status
**Strategy A Changes:**
```sql
-- Add Strategy A tracking
ALTER TABLE shell_files
  ADD COLUMN strategy_a_version varchar(10) DEFAULT 'v1.0',
  ADD COLUMN progressive_session_id uuid;
```
**Notes:** Links to progressive session for ALL files now

### 2. Progressive Tables (Existing - Modify)

#### pass05_progressive_sessions
**Purpose:** Track all document processing sessions
**Current State:** Only for >100 page documents
**Strategy A Changes:**
```sql
-- Already has most needed fields
-- Remove/ignore threshold-related columns
-- Add cascade tracking
ALTER TABLE pass05_progressive_sessions
  ADD COLUMN total_cascades integer DEFAULT 0,
  ADD COLUMN strategy_version varchar(10) DEFAULT 'A-v1';
```
**Usage:** Every document gets a session (even 10-page files)

#### pass05_pending_encounters
**Purpose:** Temporary storage for ALL encounters
**Current State:** Complex with handoff data
**Strategy A Changes:**
```sql
ALTER TABLE pass05_pending_encounters
  -- Core cascade support
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN is_cascading boolean DEFAULT false,
  ADD COLUMN continues_previous boolean DEFAULT false,

  -- Position data
  ADD COLUMN start_page integer NOT NULL,
  ADD COLUMN end_page integer NOT NULL,
  ADD COLUMN start_position varchar(20),
  ADD COLUMN end_position varchar(20),
  ADD COLUMN start_bbox jsonb,
  ADD COLUMN end_bbox jsonb,

  -- Reconciliation support
  ADD COLUMN reconciliation_key varchar(255),  -- For descriptor matching
  ADD COLUMN reconciled_to uuid,  -- Final encounter ID
  ADD COLUMN reconciliation_status varchar(20); -- 'pending','reconciled','orphaned'

-- Indexes for efficient queries
CREATE INDEX idx_pending_cascade ON pass05_pending_encounters(session_id, cascade_id);
CREATE INDEX idx_pending_spatial ON pass05_pending_encounters(session_id, start_page, end_page);
```
**Critical:** This is the hub table - ALL encounters pass through here

#### pass05_chunk_results
**Purpose:** Per-chunk processing metrics
**Current State:** Tracks complex handoff state
**Strategy A Changes:**
```sql
ALTER TABLE pass05_chunk_results
  -- Simplify for Strategy A
  ADD COLUMN pendings_created integer,  -- Total encounters sent to pending
  ADD COLUMN cascading_created integer, -- Subset marked as cascading
  ADD COLUMN cascade_ids_generated text[]; -- Track all cascade IDs created

-- Remove/ignore these complex columns:
-- encounters_started (not relevant)
-- encounters_completed (none complete at chunk level)
-- encounters_continued (replaced by cascading)
```

#### pass05_page_assignments
**Purpose:** Map pages to encounters
**Current State:** Uses temp encounter IDs
**Strategy A Changes:**
```sql
-- Add position support
ALTER TABLE pass05_page_assignments
  ADD COLUMN position_on_page varchar(20),  -- Where on page encounter appears
  ADD COLUMN is_partial boolean DEFAULT false; -- Page partially in encounter

-- Better indexing
CREATE INDEX idx_page_assign_lookup
  ON pass05_page_assignments(shell_file_id, page_num, encounter_id);
```
**Note:** Updated in bulk after reconciliation

#### pass05_encounter_metrics
**Purpose:** Session-level statistics
**Current State:** Calculated during processing
**Strategy A Changes:**
```sql
-- These only make sense AFTER reconciliation
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN pendings_total integer,  -- Before reconciliation
  ADD COLUMN cascades_total integer,  -- Number of cascade chains
  ADD COLUMN orphans_total integer,   -- Couldn't reconcile
  ADD COLUMN reconciliation_time_ms integer;
```
**Timing:** Only populated after reconciliation completes

### 3. Tables to Delete/Deprecate

#### shell_file_manifests
**Status:** Unused
**Action:** DROP TABLE after verification

#### shell_file_manifests_v2
**Status:** Unused duplicate
**Action:** DROP TABLE

#### ai_processing_sessions
**Status:** Legacy, replaced by pass05_progressive_sessions
**Action:** Keep for historical data, don't use

#### pass05_progressive_performance
**Status:** Redundant with chunk_results
**Action:** Consider merging into chunk_results

### 4. New Tables for Strategy A

#### pass05_cascade_chains
**Purpose:** Track cascade relationships
```sql
CREATE TABLE pass05_cascade_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id),
  cascade_id varchar(100) UNIQUE NOT NULL,
  origin_chunk integer NOT NULL,
  last_chunk integer,
  final_encounter_id uuid REFERENCES healthcare_encounters(id),
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp
);

CREATE INDEX idx_cascade_session ON pass05_cascade_chains(session_id);
CREATE INDEX idx_cascade_final ON pass05_cascade_chains(final_encounter_id);
```

#### pass05_reconciliation_log
**Purpose:** Audit trail for reconciliation decisions
```sql
CREATE TABLE pass05_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id),
  cascade_id varchar(100),
  pending_ids uuid[],  -- Array of pending encounter IDs
  final_encounter_id uuid,
  match_type varchar(20),  -- 'cascade','descriptor','orphan'
  confidence decimal(3,2),
  reasons text,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);
```

## Data Flow Through Tables

### 1. Document Arrives
```sql
INSERT INTO shell_files (...)
INSERT INTO pass05_progressive_sessions (...)
```

### 2. Each Chunk Processes
```sql
INSERT INTO pass05_chunk_results (...)
INSERT INTO pass05_pending_encounters (...) -- ALL encounters
INSERT INTO pass05_page_assignments (...) -- With temp IDs
INSERT INTO pass05_cascade_chains (...) -- If cascading
```

### 3. Reconciliation
```sql
SELECT * FROM pass05_pending_encounters WHERE session_id = ?
GROUP BY cascade_id
INSERT INTO healthcare_encounters (...)
INSERT INTO pass05_reconciliation_log (...)
UPDATE pass05_pending_encounters SET reconciled_to = ?
```

### 4. Finalization
```sql
UPDATE pass05_page_assignments SET encounter_id = ? -- Final IDs
INSERT INTO pass05_encounter_metrics (...)
UPDATE pass05_progressive_sessions SET status = 'completed'
```

## Index Strategy

### Primary Indexes (Critical Performance)
- `pass05_pending_encounters`: (session_id, cascade_id)
- `pass05_page_assignments`: (shell_file_id, page_num)
- `healthcare_encounters`: (patient_id, encounter_start_date)

### Secondary Indexes (Query Optimization)
- `pass05_pending_encounters`: (session_id, start_page, end_page)
- `pass05_cascade_chains`: (session_id, cascade_id)
- `pass05_chunk_results`: (session_id, chunk_number)

## Migration Scripts Required

### 1. Schema Updates
```sql
-- Run all ALTER TABLE statements
-- Create new tables
-- Create indexes
```

### 2. Data Migration
```sql
-- Migrate existing progressive sessions
-- Update encounter metrics
-- Backfill cascade_ids where possible
```

### 3. Cleanup
```sql
-- Drop deprecated tables
-- Remove unused columns
-- Vacuum and analyze
```

## Capacity Planning

### Expected Row Counts (per 1000 documents)
- pass05_progressive_sessions: 1,000 rows
- pass05_pending_encounters: ~3,000 rows (3 per doc average)
- pass05_page_assignments: ~50,000 rows (50 pages average)
- healthcare_encounters: ~2,000 rows (2 per doc average)
- pass05_cascade_chains: ~500 rows (multi-chunk docs only)

### Storage Estimates
- Pending encounters: ~10KB per row with JSON fields
- Page assignments: ~100 bytes per row
- Total per document: ~50KB progressive overhead

## Backup Considerations

Before Strategy A deployment:
1. Full database backup
2. Export existing progressive sessions
3. Document current encounter counts
4. Snapshot page assignments