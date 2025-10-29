# Pass 0.5 Worker Fixes - Implementation Plan

**Date Created:** 2025-10-30
**Status:** COMPLETED - All Fixes Implemented
**Implementation Date:** 2025-10-30
**Review:** 2nd AI Bot Review Completed - 4 Additional Refinements Accepted

## Implementation Summary

All 5 core fixes + 4 additional refinements have been successfully implemented:

**Database Changes:**
- ✅ Migration #35 executed (`2025-10-30_35_pass05_atomic_writes.sql`)
- ✅ Source of truth updated (`current_schema/08_job_coordination.sql`)

**Worker Code Changes:**
- ✅ `databaseWriter.ts`: RPC call + planned/pseudo separation
- ✅ `manifestBuilder.ts`: PageRanges normalization + type validation
- ✅ `index.ts`: Idempotency comment added
- ✅ `types.ts`: JSDoc comments for API contract

**Security Hardening:**
- ✅ RPC function with SECURITY DEFINER + search_path protection
- ✅ Service role permissions (REVOKE/GRANT)

---

## Overview

This document details the implementation plan for 5 fixes identified in the AI bot review of Pass 0.5 worker scripts.

**Must-Fix (Critical):**
1. Transaction Wrapper (index.ts + databaseWriter.ts + new RPC function)
2. Metrics Counting Fix (databaseWriter.ts + new migration)
3. PageRanges Normalization (manifestBuilder.ts)

**Should-Fix (Quality):**
4. Type Safety for encounterType (manifestBuilder.ts)
5. JSDoc Comments (types.ts)

**Additional Refinements (Accepted from 2nd Review):**
6. Explanatory comment for idempotency early return (index.ts)
7. Commented-out patient validation in RPC (defense in depth)
8. Inverted page range normalization (manifestBuilder.ts)
9. Improved validation error message (manifestBuilder.ts)

---

## Fix #1: Transaction Wrapper for Atomic Writes

### Problem
Current implementation has 3 separate database writes:
1. INSERT into `shell_file_manifests`
2. UPSERT into `pass05_encounter_metrics`
3. UPDATE `shell_files.pass_0_5_completed`

If write #2 or #3 fails after #1 succeeds, the idempotency check in `runPass05()` returns early on retry, leaving metrics/completion flags permanently missing.

**Severity:** CRITICAL - blocks Pass 1/2 from knowing file is ready

### Solution Approach
Supabase JS client doesn't support multi-table transactions. Use PostgreSQL function + RPC pattern (recommended by Supabase docs).

**Implementation:**
1. Create new database function `write_pass05_manifest_atomic()` in new migration
2. Move all 3 writes into single PostgreSQL function (automatic transaction)
3. Update `databaseWriter.ts` to call RPC instead of 3 separate inserts
4. Keep encounter creation (UPSERT) outside transaction (already idempotent)

### Files to Change

#### 1. New Migration: `2025-10-30_35_pass05_atomic_writes.sql`

```sql
-- ============================================================================
-- Migration: Pass 0.5 Atomic Manifest Write Function
-- Date: 2025-10-30
-- Issue: Add atomic transaction wrapper for manifest/metrics/shell_files writes
--
-- PROBLEM:
--   Current implementation has 3 separate writes that can partially fail:
--   - Manifest insert succeeds → metrics fails → retry blocked by idempotency
--   - Missing metrics breaks analytics
--   - Missing pass_0_5_completed flag blocks Pass 1/2
--
-- SOLUTION:
--   PostgreSQL function wraps all 3 writes in atomic transaction
--   Called via supabase.rpc() from worker
--
-- AFFECTED TABLES:
--   - shell_file_manifests (via function)
--   - pass05_encounter_metrics (via function)
--   - shell_files (via function)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [ ] current_schema/08_job_coordination.sql (add RPC function)
-- ============================================================================

BEGIN;

-- ============================================================================
-- Function: write_pass05_manifest_atomic
-- ============================================================================

CREATE OR REPLACE FUNCTION write_pass05_manifest_atomic(
  -- Manifest data
  p_shell_file_id UUID,
  p_patient_id UUID,
  p_total_pages INTEGER,
  p_total_encounters_found INTEGER,
  p_ocr_average_confidence NUMERIC(3,2),
  p_batching_required BOOLEAN,
  p_batch_count INTEGER,
  p_manifest_data JSONB,
  p_ai_model_used TEXT,
  p_ai_cost_usd NUMERIC(10,6),
  p_processing_time_ms INTEGER,

  -- Metrics data
  p_processing_session_id UUID,
  p_encounters_detected INTEGER,
  p_real_world_encounters INTEGER,
  p_planned_encounters INTEGER,  -- NEW: separate planned from pseudo
  p_pseudo_encounters INTEGER,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_encounter_confidence_average NUMERIC(3,2),
  p_encounter_types_found TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_manifest_id UUID;
  v_metrics_id UUID;
BEGIN
  -- Optional: Validate shell_file belongs to patient (defense in depth)
  -- Uncomment if cross-patient writes are detected in production
  /*
  IF NOT EXISTS (
    SELECT 1 FROM shell_files
    WHERE id = p_shell_file_id AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'shell_file_id % does not belong to patient_id %',
      p_shell_file_id, p_patient_id;
  END IF;
  */

  -- 1. Insert manifest (will fail if already exists due to unique constraint)
  INSERT INTO shell_file_manifests (
    shell_file_id,
    patient_id,
    total_pages,
    total_encounters_found,
    ocr_average_confidence,
    batching_required,
    batch_count,
    manifest_data,
    ai_model_used,
    ai_cost_usd,
    processing_time_ms
  ) VALUES (
    p_shell_file_id,
    p_patient_id,
    p_total_pages,
    p_total_encounters_found,
    p_ocr_average_confidence,
    p_batching_required,
    p_batch_count,
    p_manifest_data,
    p_ai_model_used,
    p_ai_cost_usd,
    p_processing_time_ms
  )
  RETURNING manifest_id INTO v_manifest_id;

  -- 2. UPSERT metrics (idempotent on processing_session_id)
  INSERT INTO pass05_encounter_metrics (
    patient_id,
    shell_file_id,
    processing_session_id,
    encounters_detected,
    real_world_encounters,
    planned_encounters,
    pseudo_encounters,
    processing_time_ms,
    ai_model_used,
    input_tokens,
    output_tokens,
    total_tokens,
    ocr_average_confidence,
    encounter_confidence_average,
    encounter_types_found,
    total_pages,
    pages_per_encounter,
    batching_required,
    batch_count
  ) VALUES (
    p_patient_id,
    p_shell_file_id,
    p_processing_session_id,
    p_encounters_detected,
    p_real_world_encounters,
    p_planned_encounters,
    p_pseudo_encounters,
    p_processing_time_ms,
    p_ai_model_used,
    p_input_tokens,
    p_output_tokens,
    p_input_tokens + p_output_tokens,
    p_ocr_average_confidence,
    p_encounter_confidence_average,
    p_encounter_types_found,
    p_total_pages,
    CASE
      WHEN p_encounters_detected > 0 THEN ROUND((p_total_pages::numeric / p_encounters_detected::numeric), 2)
      ELSE 0
    END,
    p_batching_required,
    p_batch_count
  )
  ON CONFLICT (processing_session_id) DO UPDATE SET
    encounters_detected = EXCLUDED.encounters_detected,
    real_world_encounters = EXCLUDED.real_world_encounters,
    planned_encounters = EXCLUDED.planned_encounters,
    pseudo_encounters = EXCLUDED.pseudo_encounters,
    processing_time_ms = EXCLUDED.processing_time_ms,
    encounter_confidence_average = EXCLUDED.encounter_confidence_average,
    encounter_types_found = EXCLUDED.encounter_types_found
  RETURNING id INTO v_metrics_id;

  -- 3. Update shell_files completion flag
  UPDATE shell_files
  SET
    pass_0_5_completed = TRUE,
    pass_0_5_completed_at = NOW()
  WHERE id = p_shell_file_id;

  -- Return success with IDs
  RETURN jsonb_build_object(
    'success', true,
    'manifest_id', v_manifest_id,
    'metrics_id', v_metrics_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Manifest already exists (idempotency check passed)
    RAISE EXCEPTION 'Manifest already exists for shell_file_id %', p_shell_file_id;
  WHEN OTHERS THEN
    -- Any other error rolls back transaction
    RAISE;
END;
$$;

COMMENT ON FUNCTION write_pass05_manifest_atomic IS 'Atomic transaction wrapper for Pass 0.5 manifest/metrics/shell_files writes. Called via RPC from worker.';

COMMIT;
```

#### 2. Update: `apps/render-worker/src/pass05/databaseWriter.ts`

```typescript
/**
 * Database Writer for Pass 0.5
 * Write manifest and metrics to database atomically via RPC
 */

import { createClient } from '@supabase/supabase-js';
import { ShellFileManifest } from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface WriteManifestInput {
  manifest: ShellFileManifest;
  aiModel: string;
  aiCostUsd: number;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  processingSessionId: string;
}

/**
 * Write manifest and metrics to database atomically
 * Note: Encounters already created in parseEncounterResponse()
 */
export async function writeManifestToDatabase(input: WriteManifestInput): Promise<void> {

  // Compute metrics from encounters
  const realWorldCount = input.manifest.encounters.filter(e => e.isRealWorldVisit).length;

  // FIX #2: Separate planned vs pseudo encounters
  const plannedCount = input.manifest.encounters.filter(
    e => !e.isRealWorldVisit && e.encounterType.startsWith('planned_')
  ).length;

  const pseudoCount = input.manifest.encounters.filter(
    e => !e.isRealWorldVisit && e.encounterType.startsWith('pseudo_')
  ).length;

  const avgConfidence = input.manifest.encounters.length > 0
    ? input.manifest.encounters.reduce((sum, e) => sum + e.confidence, 0) / input.manifest.encounters.length
    : 0;
  const encounterTypes = [...new Set(input.manifest.encounters.map(e => e.encounterType))];

  // Call atomic RPC function (all 3 writes in single transaction)
  const { data, error } = await supabase.rpc('write_pass05_manifest_atomic', {
    // Manifest parameters
    p_shell_file_id: input.manifest.shellFileId,
    p_patient_id: input.manifest.patientId,
    p_total_pages: input.manifest.totalPages,
    p_total_encounters_found: input.manifest.encounters.length,
    p_ocr_average_confidence: input.manifest.ocrAverageConfidence,
    p_batching_required: false,  // Phase 1: always false
    p_batch_count: 1,
    p_manifest_data: input.manifest,
    p_ai_model_used: input.aiModel,
    p_ai_cost_usd: input.aiCostUsd,
    p_processing_time_ms: input.processingTimeMs,

    // Metrics parameters
    p_processing_session_id: input.processingSessionId,
    p_encounters_detected: input.manifest.encounters.length,
    p_real_world_encounters: realWorldCount,
    p_planned_encounters: plannedCount,  // NEW: separate count
    p_pseudo_encounters: pseudoCount,    // FIX: now excludes planned
    p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens,
    p_encounter_confidence_average: avgConfidence,
    p_encounter_types_found: encounterTypes
  });

  if (error) {
    throw new Error(`Failed to write manifest atomically: ${error.message}`);
  }

  console.log(`[Pass 0.5] Manifest written for shell_file ${input.manifest.shellFileId}`);
  console.log(`[Pass 0.5] Found ${input.manifest.encounters.length} encounters (${realWorldCount} real, ${plannedCount} planned, ${pseudoCount} pseudo)`);
  console.log(`[Pass 0.5] Tokens: ${input.inputTokens} input, ${input.outputTokens} output`);
  console.log(`[Pass 0.5] Cost: $${input.aiCostUsd.toFixed(4)}`);
  console.log(`[Pass 0.5] Processing time: ${input.processingTimeMs}ms`);
}
```

#### 3. Update: `current_schema/08_job_coordination.sql`

Add the `write_pass05_manifest_atomic()` function to source of truth schema after the `pass05_encounter_metrics` table definition.

#### 4. Update: `apps/render-worker/src/pass05/index.ts`

Add explanatory comment to idempotency early return (refinement from 2nd review):

```typescript
if (existingManifest) {
  console.log(`[Pass 0.5] Shell file ${input.shellFileId} already processed, returning existing result`);

  // Safe to return early: Transaction wrapper ensures if manifest exists,
  // metrics and shell_files completion flags MUST also exist (atomic writes)
  return {
    success: true,
    manifest: existingManifest.manifest_data,
    processingTimeMs: existingManifest.processing_time_ms || 0,
    aiCostUsd: existingManifest.ai_cost_usd || 0,
    aiModel: existingManifest.ai_model_used
  };
}
```

---

## Fix #2: Metrics Counting - Separate Planned vs Pseudo

### Problem
Current code counts all non-real-world encounters as "pseudo":
```typescript
const pseudoCount = encounters.filter(e => !e.isRealWorldVisit).length;
```

But we have THREE categories:
1. Real-world: `isRealWorldVisit=true` (past completed)
2. Planned: `isRealWorldVisit=false`, `encounterType='planned_*'` (future scheduled)
3. Pseudo: `isRealWorldVisit=false`, `encounterType='pseudo_*'` (documents)

**Severity:** CRITICAL - Analytics/metrics are misleading

### Solution
Add `planned_encounters` column to metrics table, update counting logic.

### Files to Change

#### 1. Migration: Same as Fix #1 (`2025-10-30_35_pass05_atomic_writes.sql`)

Add column before creating RPC function:

```sql
-- Add planned_encounters column to pass05_encounter_metrics
ALTER TABLE pass05_encounter_metrics
ADD COLUMN IF NOT EXISTS planned_encounters INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN pass05_encounter_metrics.planned_encounters IS 'Count of future scheduled encounters (isRealWorldVisit=false, encounterType=planned_*)';
```

#### 2. Update: `current_schema/08_job_coordination.sql`

Add column to `pass05_encounter_metrics` table definition (line ~173):

```sql
encounters_detected INTEGER NOT NULL,
real_world_encounters INTEGER NOT NULL,
planned_encounters INTEGER NOT NULL,  -- NEW
pseudo_encounters INTEGER NOT NULL,
```

#### 3. Update: `databaseWriter.ts`

Already included in Fix #1 code above.

---

## Fix #3: PageRanges Normalization

### Problem
Unique constraint on `healthcare_encounters` includes `page_ranges` column:
```sql
UNIQUE (patient_id, primary_shell_file_id, encounter_type, encounter_date, page_ranges)
```

PostgreSQL array equality is ORDER-SENSITIVE:
- `[[1,3],[7,8]]` ≠ `[[7,8],[1,3]]`

If AI returns different ordering on retry, UPSERT fails → duplicate encounters created.

**Severity:** CRITICAL - Breaks idempotency

### Solution
Sort `pageRanges` arrays before UPSERT to ensure deterministic ordering.

### Files to Change

#### 1. Update: `apps/render-worker/src/pass05/manifestBuilder.ts`

Add sorting before UPSERT (line ~91):

```typescript
export async function parseEncounterResponse(
  aiResponse: string,
  ocrOutput: GoogleCloudVisionOCR,
  patientId: string,
  shellFileId: string
): Promise<{ encounters: EncounterMetadata[] }> {

  const parsed: AIEncounterResponse = JSON.parse(aiResponse);

  // CRITICAL: Validate non-overlapping page ranges (Phase 1 requirement)
  validateNonOverlappingPageRanges(parsed.encounters);

  const encounters: EncounterMetadata[] = [];

  for (const aiEnc of parsed.encounters) {
    // FIX #3: Normalize page ranges for idempotency
    // Step 1: Fix inverted ranges (e.g., [5,1] → [1,5])
    // Step 2: Sort by start page for deterministic ordering
    const normalizedPageRanges = aiEnc.pageRanges.map(([start, end]) => {
      if (start > end) {
        console.warn(
          `[Pass 0.5] Inverted page range detected: [${start}, ${end}] - ` +
          `normalizing to [${end}, ${start}] for encounter "${aiEnc.encounterType}"`
        );
        return [end, start];
      }
      return [start, end];
    }).sort((a, b) => a[0] - b[0]);

    // Pre-create encounter in database to get UUID
    // UPSERT for idempotency: safe to retry if manifest write fails
    const { data: dbEncounter, error } = await supabase
      .from('healthcare_encounters')
      .upsert(
        {
          patient_id: patientId,
          encounter_type: aiEnc.encounterType,
          is_real_world_visit: aiEnc.isRealWorldVisit,
          encounter_date: aiEnc.dateRange?.start || null,
          encounter_date_end: aiEnc.dateRange?.end || null,
          provider_name: aiEnc.provider || null,
          facility_name: aiEnc.facility || null,
          primary_shell_file_id: shellFileId,
          page_ranges: normalizedPageRanges,  // Use normalized (sorted) ranges
          identified_in_pass: 'pass_0_5',
          pass_0_5_confidence: aiEnc.confidence
        },
        {
          onConflict: 'patient_id,primary_shell_file_id,encounter_type,encounter_date,page_ranges',
          ignoreDuplicates: false
        }
      )
      .select('id')
      .single();

    if (error || !dbEncounter) {
      throw new Error(`Failed to create encounter in database: ${error?.message}`);
    }

    // Extract spatial bounds from OCR for this encounter's pages
    const spatialBounds = extractSpatialBounds(normalizedPageRanges, ocrOutput);

    encounters.push({
      encounterId: dbEncounter.id,
      encounterType: aiEnc.encounterType as any,  // FIX #4 will address this
      isRealWorldVisit: aiEnc.isRealWorldVisit,
      dateRange: aiEnc.dateRange,
      provider: aiEnc.provider,
      facility: aiEnc.facility,
      pageRanges: normalizedPageRanges,  // Return normalized ranges
      spatialBounds,
      confidence: aiEnc.confidence,
      extractedText: aiEnc.extractedText
    });
  }

  return { encounters };
}
```

**No schema changes needed** - pure logic fix.

---

## Fix #4: Type Safety for encounterType

### Problem
AI response parsing uses unsafe type assertion:
```typescript
encounterType: aiEnc.encounterType as any
```

If AI returns invalid encounter type (e.g., `"unknown_type"`), it bypasses validation and corrupts data.

**Severity:** MEDIUM - Data integrity risk

### Solution
Validate `encounterType` against `EncounterType` union, throw descriptive error if invalid.

### Files to Change

#### 1. Update: `apps/render-worker/src/pass05/manifestBuilder.ts`

Add validation function and use it (replace line 112):

```typescript
import {
  EncounterMetadata,
  GoogleCloudVisionOCR,
  BoundingBox,
  BoundingBoxNorm,
  SpatialBound,
  EncounterType  // ADD import
} from './types';

// ... existing code ...

/**
 * Validate encounter type against EncounterType union
 * Throws error if invalid type returned by AI
 */
function validateEncounterType(type: string): type is EncounterType {
  const validTypes: EncounterType[] = [
    // Real-world visits
    'inpatient',
    'outpatient',
    'emergency_department',
    'specialist_consultation',
    'gp_appointment',
    'telehealth',
    // Planned encounters
    'planned_specialist_consultation',
    'planned_procedure',
    'planned_gp_appointment',
    // Pseudo-encounters
    'pseudo_medication_list',
    'pseudo_insurance',
    'pseudo_admin_summary',
    'pseudo_lab_report',
    'pseudo_imaging_report',
    'pseudo_referral_letter',
    'pseudo_unverified_visit'
  ];

  if (!validTypes.includes(type as EncounterType)) {
    throw new Error(
      `Invalid encounter type "${type}" returned by AI. ` +
      `Type must match EncounterType union defined in types.ts. ` +
      `Valid types: ${validTypes.join(', ')}`
    );
  }

  return true;
}

export async function parseEncounterResponse(
  // ... params ...
): Promise<{ encounters: EncounterMetadata[] }> {

  const parsed: AIEncounterResponse = JSON.parse(aiResponse);
  validateNonOverlappingPageRanges(parsed.encounters);

  const encounters: EncounterMetadata[] = [];

  for (const aiEnc of parsed.encounters) {
    // FIX #4: Validate encounter type (throws error if invalid)
    validateEncounterType(aiEnc.encounterType);

    // Now safe to use as EncounterType (validated above)
    const normalizedPageRanges = aiEnc.pageRanges.sort((a, b) => a[0] - b[0]);

    const { data: dbEncounter, error } = await supabase
      .from('healthcare_encounters')
      .upsert({ /* ... */ })
      .select('id')
      .single();

    // ... rest of code ...

    encounters.push({
      encounterId: dbEncounter.id,
      encounterType: aiEnc.encounterType as EncounterType,  // Safe now (validated)
      // ... rest of fields ...
    });
  }

  return { encounters };
}
```

**No schema changes needed** - pure validation logic.

---

## Fix #5: JSDoc Comments for API Contract

### Problem
Types lack documentation for:
- `ocrAverageConfidence` range (0..1)
- `pageRanges` normalization requirement
- `confidence` range (0..1)

**Severity:** LOW - Documentation quality

### Solution
Add JSDoc comments to key interfaces in `types.ts`.

### Files to Change

#### 1. Update: `apps/render-worker/src/pass05/types.ts`

```typescript
/**
 * Output of encounter discovery (Task 1)
 */
export interface ShellFileManifest {
  shellFileId: string;
  patientId: string;
  totalPages: number;

  /**
   * Average OCR confidence across all pages.
   * Range: 0.0 (no confidence) to 1.0 (perfect confidence)
   */
  ocrAverageConfidence: number;

  // Task 1: Encounter discovery (always present)
  encounters: EncounterMetadata[];

  // Task 2: Batching (null in Phase 1 MVP)
  batching: null | BatchingPlan;
}

export interface EncounterMetadata {
  encounterId: string;  // UUID pre-created in database
  encounterType: EncounterType;
  isRealWorldVisit: boolean;

  // Temporal data
  dateRange?: {
    start: string;  // ISO date
    end?: string;   // ISO date (optional for single-day encounters)
  };

  // Provider/facility (only for real-world visits)
  provider?: string;
  facility?: string;

  /**
   * Page ranges for this encounter in source document.
   * MUST be sorted by start page for UPSERT idempotency.
   * Format: [[startPage, endPage], ...] for non-contiguous ranges.
   * Example: [[1,5], [10,12]] means pages 1-5 and 10-12
   */
  pageRanges: number[][];

  // Spatial data from OCR
  spatialBounds: SpatialBound[];

  /**
   * AI confidence in encounter identification.
   * Range: 0.0 (no confidence) to 1.0 (perfect confidence)
   */
  confidence: number;

  extractedText?: string;  // Sample text from encounter (for debugging)
}
```

**No schema changes needed** - documentation only.

---

## Implementation Order

**Step 1: Create Migration**
- File: `migration_history/2025-10-30_35_pass05_atomic_writes.sql`
- Contains: `planned_encounters` column + `write_pass05_manifest_atomic()` RPC function

**Step 2: Execute Migration**
- Use Supabase MCP: `mcp__supabase__apply_migration()`
- Verify function created: `SELECT proname FROM pg_proc WHERE proname = 'write_pass05_manifest_atomic';`

**Step 3: Update Source of Truth Schemas**
- `current_schema/08_job_coordination.sql`: Add column + RPC function

**Step 4: Update Worker Code**
- `databaseWriter.ts`: Replace 3 separate writes with RPC call (Fixes #1, #2)
- `manifestBuilder.ts`: Add sorting + validation (Fixes #3, #4)
- `types.ts`: Add JSDoc comments (Fix #5)

**Step 5: Verify**
- Test idempotency: Run Pass 0.5 twice on same file
- Check metrics: Verify `planned_encounters` vs `pseudo_encounters` counts
- Test invalid encounter type: Force AI to return bad type (should throw error)

---

## Testing Strategy

### Unit Tests (Future)
- Test `validateEncounterType()` with all valid types
- Test `validateEncounterType()` with invalid types (should return false)
- Test pageRanges sorting: `[[7,8],[1,3]]` → `[[1,3],[7,8]]`

### Integration Tests
1. **Idempotency Test**
   - Upload 5-page file
   - Run Pass 0.5 → success
   - Simulate metrics write failure (manually delete metrics record)
   - Run Pass 0.5 again → should fail (manifest already exists)
   - Expected: Transaction wrapper prevents partial state

2. **Metrics Accuracy Test**
   - Upload file with mixed encounters (2 real, 1 planned, 1 pseudo)
   - Verify `pass05_encounter_metrics`:
     - `real_world_encounters = 2`
     - `planned_encounters = 1`
     - `pseudo_encounters = 1`

3. **PageRanges Idempotency Test**
   - Mock AI to return `[[7,8],[1,3]]`
   - Run Pass 0.5 → creates encounter
   - Mock AI to return `[[1,3],[7,8]]` (different order)
   - Run Pass 0.5 again → should match existing encounter (not create duplicate)

---

## Rollback Plan

If issues arise after deployment:

1. **RPC Function Issue:** Revert `databaseWriter.ts` to 3 separate writes
2. **Metrics Column Issue:** Drop `planned_encounters` column, update code to use `pseudo_encounters` for all non-real-world
3. **Type Validation Issue:** Remove validation, restore `as any` (temporary)

---

**Status:** Ready for review
**Next:** User approval → execute migration → update code → test
