# Ready-to-Execute Implementation Plan
## Manifest-Free Architecture v2.10 - All Fixes Applied

**Status:** ✅ Ready for execution
**AI Bot Review:** All 9 issues fixed
**Migration Protocol:** Follows `migration_history/README.md` two-touchpoint workflow

---

## Pre-Execution Summary

### What We're Doing
- Eliminating redundant `shell_file_manifests` table
- Adding version/progressive tracking to `shell_files`
- Implementing v2.10 compositional prompt architecture
- Making progressive mode automatic (>100 pages, no env var)

### Why It's Safe
- No production users (confirmed by user)
- All code reviewed and corrected
- Database migration follows established protocol
- Rollback script included

---

## Day 1: Database Migration (Touchpoint 1)

### Step 1: Execute Migration 45
**Migration Location:** `shared/docs/architecture/database-foundation-v3/migration_history/2025-11-11_45_manifest_free_architecture.sql`

Execute via Supabase MCP (not psql):
```typescript
mcp__supabase__apply_migration(
  name: "2025-11-11_45_manifest_free_architecture",
  query: /* SQL from migration file */
)
```

**Migration includes:**
- 3 new columns on shell_files (version, progressive, ocr_confidence)
- pass05_page_assignments table
- shell_file_manifests_v2 view (backward-compatible)
- Security grants (service_role only for view)

### Step 2: Verify Migration
```sql
-- Verify columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'shell_files'
AND column_name IN ('pass_0_5_version', 'pass_0_5_progressive', 'ocr_average_confidence');

-- Verify table created
SELECT table_name FROM information_schema.tables WHERE table_name = 'pass05_page_assignments';

-- Verify view created
SELECT table_name FROM information_schema.views WHERE table_name = 'shell_file_manifests_v2';
```

### Step 3: Update Source of Truth
- [ ] Update `current_schema/03_clinical_core.sql` (shell_files columns)
- [ ] Update `current_schema/04_ai_processing.sql` (view + page_assignments)

---

## Day 2: Code Implementation

### Files to Modify

#### 1. `apps/render-worker/src/pass05/progressive/session-manager.ts`
**Change:** Remove PASS_05_PROGRESSIVE_ENABLED check
```typescript
// BEFORE
const enabled = process.env.PASS_05_PROGRESSIVE_ENABLED === 'true';
return enabled && totalPages > PAGE_THRESHOLD;

// AFTER
const PAGE_THRESHOLD = 100;
return totalPages > PAGE_THRESHOLD;
```

**Change:** Add aiModel to return value
```typescript
// Add to interface
aiModel: string;

// Add to return
aiModel: model.displayName
```

#### 2. `apps/render-worker/src/pass05/progressive/prompts.ts`
**Change:** Pass totalPages to progressive context
```typescript
const progressiveContext = {
  chunkNumber: input.chunkNumber,
  totalChunks: input.totalChunks,
  pageRange: input.pageRange,
  totalPages: input.totalPages,  // ADD THIS
  handoffReceived: input.handoffReceived
};
```

#### 3. `apps/render-worker/src/pass05/encounterDiscovery.ts`
**Add:** Supabase client and helper functions
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function calculateOCRConfidence(ocrOutput: GoogleCloudVisionOCR): number {
  const confidences = ocrOutput.fullTextAnnotation.pages.map(p => p.confidence || 0);
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

async function finalizeShellFile(shellFileId: string, data: {
  version: string;
  progressive: boolean;
  ocrConfidence: number;
  completed: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('shell_files')
    .update({
      pass_0_5_completed: data.completed,
      pass_0_5_version: data.version,
      pass_0_5_progressive: data.progressive,
      ocr_average_confidence: data.ocrConfidence
    })
    .eq('id', shellFileId);

  if (error) throw new Error(`Failed to update shell_files: ${error.message}`);
}
```

**Change:** Call finalizeShellFile in both modes
```typescript
// After progressive processing
await finalizeShellFile(input.shellFileId, {
  version: 'v2.10',
  progressive: true,
  ocrConfidence: calculateOCRConfidence(input.ocrOutput),
  completed: true
});

// After standard processing
await finalizeShellFile(input.shellFileId, {
  version: 'v2.10',
  progressive: false,
  ocrConfidence: calculateOCRConfidence(input.ocrOutput),
  completed: true
});
```

#### 4. `apps/render-worker/src/pass05/index.ts`
**Change:** Remove manifest writes, query distributed data for idempotency check
```typescript
// Check if already processed (no manifest table)
const { data: shellFile } = await supabase
  .from('shell_files')
  .select('pass_0_5_completed, pass_0_5_version')
  .eq('id', input.shellFileId)
  .single();

if (shellFile?.pass_0_5_completed) {
  // Build output from distributed data
  const { data: encounters } = await supabase
    .from('healthcare_encounters')
    .select('*')
    .eq('primary_shell_file_id', input.shellFileId);

  const { data: metrics } = await supabase
    .from('pass05_encounter_metrics')
    .select('processing_time_ms, ai_cost_usd, ai_model_used')
    .eq('shell_file_id', input.shellFileId)
    .single();

  return {
    success: true,
    encounters: encounters || [],
    processingTimeMs: metrics?.processing_time_ms || 0,
    aiCostUsd: metrics?.ai_cost_usd || 0,
    aiModel: metrics?.ai_model_used || shellFile.pass_0_5_version
  };
}
```

#### 5. DELETE FILE: `apps/render-worker/src/pass05/databaseWriter.ts`
This file is now obsolete - manifest writes removed entirely.

---

## Day 3: Testing

### Test Documents
- 50 pages (standard mode)
- 101 pages (progressive mode trigger)
- 200 pages (full progressive test)

### Validation Queries
```sql
-- Check shell_files updated correctly
SELECT id, page_count, pass_0_5_completed, pass_0_5_version,
       pass_0_5_progressive, ocr_average_confidence
FROM shell_files
WHERE id = 'test-file-id';

-- Check encounters written
SELECT COUNT(*), MIN(encounter_start_date), MAX(encounter_start_date)
FROM healthcare_encounters
WHERE primary_shell_file_id = 'test-file-id';

-- Check metrics recorded
SELECT processing_time_ms, ai_model_used, ai_cost_usd
FROM pass05_encounter_metrics
WHERE shell_file_id = 'test-file-id';

-- Test backward-compatible view
SELECT shell_file_id, pass_0_5_version, pass_0_5_progressive,
       total_encounters_found
FROM shell_file_manifests_v2
WHERE shell_file_id = 'test-file-id';
```

---

## Day 4: Cleanup

### Archive Old Files
```bash
cd apps/render-worker/src/pass05/
mkdir -p archive
mv aiPrompts.ts archive/aiPrompts.v2.4.ts
mv aiPrompts.v2.7.ts archive/
mv aiPrompts.v2.8.ts archive/
# Keep aiPrompts.v2.9.ts as fallback
```

### Update Documentation
- Mark migration 45 complete with checkboxes
- Update current_schema files
- Document v2.10 as current version

---

## Rollback Plan

If issues arise:
```sql
-- Rollback migration
DROP VIEW IF EXISTS shell_file_manifests_v2;
DROP TABLE IF EXISTS pass05_page_assignments CASCADE;
ALTER TABLE shell_files DROP COLUMN IF EXISTS pass_0_5_version;
ALTER TABLE shell_files DROP COLUMN IF EXISTS pass_0_5_progressive;
ALTER TABLE shell_files DROP COLUMN IF EXISTS ocr_average_confidence;
```

Revert code changes via git:
```bash
git checkout HEAD -- apps/render-worker/src/pass05/
```

---

## Success Criteria

- [ ] Migration 45 executes without errors
- [ ] View returns correct data structure
- [ ] 50-page test: standard mode, progressive=false
- [ ] 101-page test: progressive mode, progressive=true
- [ ] All tables populated correctly
- [ ] No manifest table references remain in code
- [ ] Performance acceptable (<30s for 100 pages, <3min for 200 pages)

---

## All 9 Fixes Applied

1. ✅ Removed PASS_05_PROGRESSIVE_ENABLED (automatic now)
2. ✅ Fixed total pages calculation in v2.10 prompt
3. ✅ Added aiModel to progressive result
4. ✅ Added supabase initialization to code examples
5. ✅ Fixed view security (service_role only)
6. ✅ Documented pass_0_5_completed already exists
7. ✅ Added calculateOCRConfidence implementation
8. ✅ Added idempotency note for page assignments
9. ✅ Added Postgres version requirement note

---

## Ready to Start?

**First task on the list:** Execute Migration 45 (Touchpoint 1)

Following the two-touchpoint workflow from `migration_history/README.md`:
1. Review migration script: `02-implementation/database/migration-45-manifest-free-CORRECTED.sql`
2. Execute via `mcp__supabase__apply_migration()`
3. Verify with validation queries
4. Update source of truth schemas

All code changes documented in: `02-implementation/code-changes/IMPLEMENTATION_FIXES_SUMMARY.md`
