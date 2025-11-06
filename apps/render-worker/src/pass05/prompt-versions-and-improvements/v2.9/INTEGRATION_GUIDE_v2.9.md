# Integration Guide: Pass 0.5 v2.9

**Version:** v2.9
**Date:** 2025-11-06
**Prerequisites:** Migration 42 must be executed first

---

## Overview

This guide walks through integrating Pass 0.5 v2.9 into the Exora render worker. Version 2.9 adds multi-day encounter support and date quality tracking.

---

## Step 1: Execute Migration 42

**CRITICAL: This must be done BEFORE deploying v2.9 worker code**

```bash
# Via Supabase MCP (recommended)
mcp__supabase__apply_migration(
  name: "healthcare_encounters_timeframe_redesign",
  query: <SQL from migration_history/2025-11-06_42_healthcare_encounters_timeframe_redesign.sql>
)
```

**Verify migration success:**
```sql
-- Check column rename
SELECT column_name FROM information_schema.columns
WHERE table_name = 'healthcare_encounters' AND column_name = 'encounter_start_date';
-- Expected: 1 row

-- Check new columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'healthcare_encounters'
  AND column_name IN ('encounter_timeframe_status', 'date_source');
-- Expected: 2 rows

-- Check old columns removed
SELECT column_name FROM information_schema.columns
WHERE table_name = 'healthcare_encounters'
  AND column_name IN ('encounter_date', 'visit_duration_minutes', 'confidence_score', 'ai_confidence');
-- Expected: 0 rows
```

---

## Step 2: Update TypeScript Types

**File:** `apps/render-worker/src/pass05/types.ts`

**Find and update the EncounterMetadata interface:**

```typescript
export interface EncounterMetadata {
  encounterId: string;
  encounterType: string;

  // RENAMED FIELD (v2.9)
  encounterStartDate: string | null;  // Was: encounterDate

  // UPDATED FIELD (now actively populated)
  encounterDateEnd: string | null;

  // NEW FIELDS (v2.9)
  encounterTimeframeStatus: 'completed' | 'ongoing' | 'unknown_end_date';
  dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

  // Existing fields
  isRealWorldVisit: boolean;
  providerName: string | null;
  facilityName: string | null;
  summary: string;
  spatialBounds: SpatialBound[];
  pageRanges: number[][];
  confidence: number;
  extractedText?: string;
}
```

**Update ShellFileManifest interface (if encounters field exists):**

```typescript
export interface ShellFileManifest {
  shellFileId: string;
  patientId: string;
  totalPages: number;
  ocrAverageConfidence: number;
  encounters: EncounterMetadata[];  // Uses updated interface
  page_assignments?: PageAssignment[];
  batching: BatchingAnalysis | null;
}
```

---

## Step 3: Update Worker Logic (manifestBuilder.ts)

**File:** `apps/render-worker/src/pass05/manifestBuilder.ts`

### 3a. Add File Metadata Retrieval

**Add near the top of the file where shell_files is queried:**

```typescript
// Query shell_files to get file creation metadata for date fallback
const { data: shellFileData } = await supabase
  .from('shell_files')
  .select('created_at, upload_timestamp')
  .eq('id', shellFileId)
  .single();

const uploadTimestamp = shellFileData?.upload_timestamp
  ? new Date(shellFileData.upload_timestamp)
  : new Date();

const fileCreationDate = shellFileData?.created_at
  ? new Date(shellFileData.created_at)
  : null;
```

### 3b. Add Encounter Mapping Function

**Add this function to manifestBuilder.ts:**

```typescript
/**
 * Maps AI encounter response to EncounterMetadata with date fallback logic
 * v2.9: Implements two-branch logic for real-world vs pseudo encounters
 */
function mapAIEncounterToMetadata(
  aiEncounter: any,
  fileCreationDate: Date | null,
  uploadTimestamp: Date
): Partial<EncounterMetadata> {

  // Branch A: Real-World Encounters (AI provides all dates)
  if (aiEncounter.isRealWorldVisit) {
    return {
      encounterStartDate: aiEncounter.dateRange?.start || null,
      encounterDateEnd: aiEncounter.dateRange?.end || null,
      encounterTimeframeStatus: aiEncounter.encounterTimeframeStatus || 'completed',
      dateSource: aiEncounter.dateSource || 'ai_extracted',
    };
  }

  // Branch B: Pseudo Encounters (may need date fallback)
  let encounterStartDate: string | null;
  let dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

  // Date Waterfall Logic
  if (aiEncounter.dateRange?.start) {
    // AI extracted date from document
    encounterStartDate = aiEncounter.dateRange.start;
    dateSource = 'ai_extracted';
  } else if (fileCreationDate) {
    // Fallback to file creation date
    encounterStartDate = fileCreationDate.toISOString().split('T')[0]; // YYYY-MM-DD
    dateSource = 'file_metadata';
  } else {
    // Last resort: upload timestamp
    encounterStartDate = uploadTimestamp.toISOString().split('T')[0];
    dateSource = 'upload_date';
  }

  return {
    encounterStartDate,
    encounterDateEnd: encounterStartDate, // Pseudo: start = end (completed observation)
    encounterTimeframeStatus: 'completed', // Always completed for pseudo
    dateSource,
  };
}
```

### 3c. Update Encounter Building Code

**Find where encounters are built from AI response and update:**

```typescript
// Old code (v2.8):
const encounter: EncounterMetadata = {
  encounterId: aiEncounter.encounter_id,
  encounterType: aiEncounter.encounterType,
  encounterDate: aiEncounter.dateRange?.start || null,  // OLD
  encounterDateEnd: aiEncounter.dateRange?.end || null,
  // ...
};

// New code (v2.9):
const encounterDates = mapAIEncounterToMetadata(
  aiEncounter,
  fileCreationDate,
  uploadTimestamp
);

const encounter: EncounterMetadata = {
  encounterId: aiEncounter.encounter_id,
  encounterType: aiEncounter.encounterType,
  ...encounterDates,  // Spreads: encounterStartDate, encounterDateEnd, encounterTimeframeStatus, dateSource
  isRealWorldVisit: aiEncounter.isRealWorldVisit,
  providerName: aiEncounter.provider || null,
  facilityName: aiEncounter.facility || null,
  summary: aiEncounter.summary,
  spatialBounds: [], // Populated separately
  pageRanges: aiEncounter.pageRanges,
  confidence: aiEncounter.confidence,
  extractedText: aiEncounter.extractedText
};
```

---

## Step 4: Update Database UPSERT

**File:** `apps/render-worker/src/pass05/databaseWriter.ts` (or manifestBuilder.ts if UPSERT is there)

**Find the healthcare_encounters UPSERT statement and update:**

```typescript
// Old code (v2.8):
const { data: encounterData, error: encounterError } = await supabase
  .from('healthcare_encounters')
  .upsert({
    id: encounter.encounterId,
    patient_id: patientId,
    encounter_type: encounter.encounterType,
    encounter_date: encounter.encounterDate,  // OLD COLUMN NAME
    encounter_date_end: encounter.encounterDateEnd,
    // ...
  });

// New code (v2.9):
const { data: encounterData, error: encounterError } = await supabase
  .from('healthcare_encounters')
  .upsert({
    id: encounter.encounterId,
    patient_id: patientId,
    encounter_type: encounter.encounterType,

    // UPDATED COLUMNS (Migration 42)
    encounter_start_date: encounter.encounterStartDate,  // RENAMED
    encounter_date_end: encounter.encounterDateEnd,
    encounter_timeframe_status: encounter.encounterTimeframeStatus,  // NEW
    date_source: encounter.dateSource,  // NEW

    // Existing columns
    is_real_world_visit: encounter.isRealWorldVisit,
    provider_name: encounter.providerName,
    facility_name: encounter.facilityName,
    summary: encounter.summary,
    spatial_bounds: encounter.spatialBounds,
    page_ranges: encounter.pageRanges,
    pass_0_5_confidence: encounter.confidence,
    source_method: 'ai_pass_0_5',
    requires_review: encounter.summary === null || encounter.confidence < 0.80,
    identified_in_pass: 'pass_0_5',
    primary_shell_file_id: shellFileId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single();
```

---

## Step 5: Deploy v2.9 Prompt

**Option A: Use aiPrompts.v2.9.ts directly**

```typescript
// File: apps/render-worker/src/pass05/encounterDiscovery.ts

import { buildEncounterDiscoveryPromptV29 } from './aiPrompts.v2.9';

// Update prompt selection logic:
const promptVersion = process.env.PASS_05_VERSION || 'v2.9';
let promptBuilder;

if (strategy === 'ocr') {
  promptBuilder = promptVersion === 'v2.9'
    ? buildEncounterDiscoveryPromptV29
    : promptVersion === 'v2.8'
      ? buildEncounterDiscoveryPromptV28
      : buildEncounterDiscoveryPromptV27;
}
```

**Option B: Copy to main aiPrompts.ts (if v2.9 becomes default)**

```bash
cp apps/render-worker/src/pass05/aiPrompts.v2.9.ts apps/render-worker/src/pass05/aiPrompts.ts
```

---

## Step 6: Environment Configuration

**Set environment variable in Render.com:**

```bash
PASS_05_VERSION=v2.9
```

**Or in local .env:**

```env
PASS_05_VERSION=v2.9
```

---

## Step 7: Build and Deploy

```bash
# From render-worker directory
cd apps/render-worker

# Install dependencies (if needed)
pnpm install

# Build
pnpm run build

# Deploy to Render.com
git add .
git commit -m "feat(pass05): Implement v2.9 with multi-day encounter support"
git push origin main
# Render auto-deploys from main branch
```

---

## Step 8: Testing

### Test Document 1: Multi-Day Hospital Admission

Upload a discharge summary with visible admission + discharge dates.

**Expected Database Record:**
```sql
SELECT
  encounter_start_date,
  encounter_date_end,
  encounter_timeframe_status,
  date_source,
  summary
FROM healthcare_encounters
WHERE id = '<encounter_id>';

-- Expected:
-- encounter_start_date: 2025-06-15
-- encounter_date_end: 2025-06-18 (different from start)
-- encounter_timeframe_status: completed
-- date_source: ai_extracted
```

### Test Document 2: Single-Day GP Visit

Upload a clinic note with one date.

**Expected:**
```sql
-- encounter_start_date: 2025-10-27
-- encounter_date_end: 2025-10-27 (SAME as start)
-- encounter_timeframe_status: completed
-- date_source: ai_extracted
```

### Test Document 3: Medication List Photo (No Date)

Upload a photo of medication list without visible date.

**Expected:**
```sql
-- encounter_start_date: 2025-11-06 (file creation or upload date)
-- encounter_date_end: 2025-11-06 (same as start)
-- encounter_timeframe_status: completed
-- date_source: file_metadata OR upload_date
```

### Validation Queries

```sql
-- Check all encounters have timeframe status
SELECT COUNT(*) FROM healthcare_encounters WHERE encounter_timeframe_status IS NULL;
-- Expected: 0

-- Check all encounters have date source
SELECT COUNT(*) FROM healthcare_encounters WHERE date_source IS NULL;
-- Expected: 0

-- Check real-world encounters all have ai_extracted dates
SELECT COUNT(*) FROM healthcare_encounters
WHERE is_real_world_visit = true AND date_source != 'ai_extracted';
-- Expected: 0

-- Check single-day encounters (most common)
SELECT COUNT(*) FROM healthcare_encounters
WHERE encounter_start_date = encounter_date_end AND encounter_date_end IS NOT NULL;
-- Expected: Most encounters (95%+)

-- Check multi-day encounters
SELECT
  encounter_start_date,
  encounter_date_end,
  facility_name,
  summary
FROM healthcare_encounters
WHERE encounter_start_date != encounter_date_end AND encounter_date_end IS NOT NULL;
-- Expected: Hospital discharge summaries
```

---

## Troubleshooting

### Issue: Database constraint violation on encounter_timeframe_status

**Symptom:**
```
violates check constraint "healthcare_encounters_encounter_timeframe_status_check"
```

**Solution:**
Check AI response has valid value: `"completed"`, `"ongoing"`, or `"unknown_end_date"`

### Issue: Database constraint violation on date_source

**Symptom:**
```
violates check constraint "healthcare_encounters_date_source_check"
```

**Solution:**
Check worker fallback logic is working. Valid values: `'ai_extracted'`, `'file_metadata'`, `'upload_date'`

### Issue: encounter_start_date is null

**Symptom:**
Real-world encounter with null start date

**Solution:**
Check AI response has `dateRange.start` populated. Real-world encounters MUST have dates (by definition).

### Issue: Pseudo encounter has date_source = 'ai_extracted' but no date

**Symptom:**
```
date_source: 'ai_extracted'
encounter_start_date: null
```

**Solution:**
This is a logic error. If `dateSource = 'ai_extracted'`, start_date must be populated. Check AI response format.

---

## Rollback Procedure

If critical issues arise:

```bash
# 1. Set environment back to v2.8
PASS_05_VERSION=v2.8

# 2. Revert worker code changes
git revert <commit-hash>
git push origin main

# 3. Database schema remains (Migration 42 is safe to keep)
# New columns will be NULL but won't break existing functionality
```

---

## Success Criteria

- [ ] Migration 42 executed successfully
- [ ] All tests pass (multi-day, single-day, pseudo without date)
- [ ] No database constraint violations
- [ ] All real-world encounters have `date_source = 'ai_extracted'`
- [ ] Single-day encounters have explicit end dates (not null)
- [ ] Multi-day encounters have different start/end dates
- [ ] Pseudo encounters without AI dates have fallback date_source
- [ ] No errors in Render.com logs

---

**Created:** 2025-11-06
**Last Updated:** 2025-11-06
**Status:** Ready for integration
