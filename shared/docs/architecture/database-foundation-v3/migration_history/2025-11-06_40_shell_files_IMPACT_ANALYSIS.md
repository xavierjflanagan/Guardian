# Migration 40 - Impact Analysis
## shell_files Schema Cleanup

**Migration File:** `2025-11-06_40_shell_files_schema_cleanup.sql`
**Date:** 2025-11-06
**Status:** Touchpoint 1 - Awaiting Review
**Execution:** NOT YET EXECUTED

---

## Summary

Migration 40 implements approved schema cleanup for the shell_files table based on Pass 0.5 audit findings. This migration:
- Adds 1 new column for storage metrics tracking
- Removes 6 vestigial/misplaced columns
- Drops 1 CHECK constraint and 1 composite index
- Defers file-level summaries to Pass 3 ai_synthesized_summary

**Risk Level:** LOW (test data only, no user data exists)

**Production Safety Enhancements:**
- Schema-qualified all database objects (public.table_name, public.index_name)
- Transaction-wrapped DDL operations (BEGIN/COMMIT for atomicity)
- Added verification query to confirm removed columns are gone
- Exact type matching in rollback script (verified against current_schema/03_clinical_core.sql)
- DB-level dependency scan added to pre-migration testing
- Worker timing critical path documented (update only after all pages persisted)

---

## Schema Changes

### Columns to ADD (1)

| Column Name | Type | Purpose |
|------------|------|---------|
| `processed_image_size_bytes` | BIGINT | Combined total size of all processed JPEG pages for storage metrics |

### Columns to REMOVE (6)

| Column Name | Reason for Removal |
|------------|-------------------|
| `file_type` | Ambiguous for Frankenstein files, defer to Pass 3 ai_synthesized_summary |
| `file_subtype` | Ambiguous for Frankenstein files, no longer needed |
| `confidence_score` | Redundant - better mechanisms exist at encounter level |
| `provider_name` | Wrong table - belongs in healthcare_encounters (Frankenstein files make single value ambiguous) |
| `facility_name` | Wrong table - belongs in healthcare_encounters (Frankenstein files make single value ambiguous) |
| `upload_context` | Vestigial column, never populated, no business logic |

### Constraints to DROP

| Constraint Name | Type | Reason |
|----------------|------|--------|
| `shell_files_file_type_check` | CHECK | Dependent on file_type column being removed |

### Indexes to DROP

| Index Name | Columns | Reason |
|-----------|---------|--------|
| `idx_shell_files_type` | (file_type, file_subtype) | Both columns being removed |

---

## Impact Analysis

### Database Impact

**Positive Impacts:**
- Reduced table size (6 fewer columns)
- Clearer schema semantics (no ambiguous columns)
- Storage metrics now tracked (processed_image_size_bytes)
- Removes redundant constraint and index

**Potential Risks:**
- None identified (all current data is test data, no user data)
- Rollback script provided for safety

### Application Impact

**Frontend:**
- No impact expected (removed columns not used in UI)
- Verify no hardcoded references to removed columns exist

**Worker Code:**
- REQUIRES UPDATE: Must populate processed_image_size_bytes after page processing
- Location: `apps/render-worker/src/worker.ts` (around line 800-900)
- Logic: Calculate sum of all JPEG page sizes, update shell_files record
- TIMING CRITICAL: Update processed_image_size_bytes ONLY after ALL page images are persisted to storage to avoid undercounts on worker retries/failures

**Edge Functions:**
- No impact expected (shell-file-processor-v3 doesn't reference removed columns)

---

## Affected Files

### Source of Truth (MUST UPDATE in Touchpoint 2)

**File:** `current_schema/03_clinical_core.sql`
**Lines:** 96-167 (shell_files table definition)

**Required Changes:**
- Line ~105: REMOVE file_type column definition
- Line ~106: REMOVE file_subtype column definition
- Line ~107: REMOVE confidence_score column definition
- Line ~120: REMOVE provider_name column definition
- Line ~121: REMOVE facility_name column definition
- Line ~125: REMOVE upload_context column definition
- Line ~147: ADD processed_image_size_bytes BIGINT after processed_image_mime
- Line ~210: REMOVE shell_files_file_type_check constraint
- Line ~235: REMOVE idx_shell_files_type index

### Worker Code (UPDATE after Touchpoint 2)

**File:** `apps/render-worker/src/worker.ts`
**Location:** After processed image storage (around line 800-900)

**Required Logic:**
```typescript
// CRITICAL: Execute ONLY after ALL page images are persisted to storage
// This prevents undercounts if worker fails/retries mid-processing

// After storing all processed JPEG pages
const totalImageSize = processedPages.reduce((sum, page) => sum + page.sizeBytes, 0);

await supabase
  .from('shell_files')
  .update({ processed_image_size_bytes: totalImageSize })
  .eq('id', shellFileId);
```

### TypeScript Types (CHECK for existence)

**Potential Files:**
- Type definitions for shell_files table
- Frontend query result types
- Worker data transfer objects

**Action:** Search codebase for TypeScript types referencing removed columns

---

## Data Migration

**Current Data:** All test data (no user data exists pre-launch)

**Removed Column Data:**
- `file_type`: Contains values, but ambiguous for Frankenstein files
- `file_subtype`: Mostly NULL
- `confidence_score`: Mostly NULL
- `provider_name`: Some values exist, but belong in healthcare_encounters
- `facility_name`: Some values exist, but belong in healthcare_encounters
- `upload_context`: Always NULL (never populated)

**Data Loss Assessment:**
- ACCEPTABLE: All current data is test data
- Removed data is either NULL, ambiguous, or reconstructable from healthcare_encounters

**New Column Data:**
- `processed_image_size_bytes`: Will be NULL for existing records
- Worker will populate for new uploads
- Can backfill existing records if needed (calculate from stored JPEG files)

---

## Testing Plan

### Pre-Migration Testing

- [ ] Verify current shell_files schema matches expectations
- [ ] Query for any application code using columns to be dropped
- [ ] Test migration SQL for syntax errors (dry-run)
- [ ] Verify idempotency (can run migration multiple times safely)
- [ ] **DB-level dependency scan** (check for views/functions referencing columns):
  ```sql
  -- Check for views referencing shell_files columns
  SELECT viewname, definition
  FROM pg_views
  WHERE schemaname = 'public'
    AND definition ILIKE '%shell_files.%';

  -- Check for functions/stored procedures referencing shell_files columns
  SELECT proname, prosrc
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND prosrc ILIKE '%shell_files.%';
  ```

### Post-Migration Testing

- [ ] Run verification queries from migration script
- [ ] Confirm columns added/removed successfully
- [ ] Verify constraints and indexes dropped
- [ ] Check existing shell_files records preserved
- [ ] Confirm no foreign key violations

### Integration Testing

- [ ] Upload 2-page TIFF file via frontend
- [ ] Verify Pass 0.5 processing completes
- [ ] Check processed_image_size_bytes populated correctly
- [ ] Verify no UI errors from removed columns
- [ ] Test file listing/viewing in dashboard

---

## Rollback Procedure

**Rollback Script:** Included in migration file (lines 127-179)

**WARNING:** Rollback will restore column structure but NOT original data. All removed columns will have NULL values after rollback. This is acceptable as all current data is test data.

**Rollback Steps:**
1. Execute rollback SQL from migration file
2. Verify columns restored via verification query
3. Recreate CHECK constraint and index
4. Update current_schema/03_clinical_core.sql back to original state

**Rollback Risk:** LOW (test data environment, no user data)

---

## Dependencies and Blockers

**Dependencies:**
- None (Migration 40 is independent)

**Blockers:**
- None (user approved all changes)

**Ready to Execute:** YES (pending Touchpoint 1 review)

---

## Success Criteria

**Migration Execution:**
- [ ] Migration script executes without errors
- [ ] All 7 column changes applied successfully
- [ ] Constraints and indexes dropped successfully
- [ ] No data loss on existing records (records preserved)

**Source of Truth Updates:**
- [ ] current_schema/03_clinical_core.sql updated
- [ ] Bridge schemas updated (if applicable)
- [ ] TypeScript types updated (if applicable)

**Worker Integration:**
- [ ] Worker code updated to populate processed_image_size_bytes
- [ ] New uploads correctly calculate total image size
- [ ] No worker errors in logs

**End-to-End Testing:**
- [ ] File upload works via frontend
- [ ] Pass 0.5 processing completes
- [ ] processed_image_size_bytes populated correctly
- [ ] No UI errors from removed columns

---

## Timeline Estimate

**Touchpoint 1 (Current):** Script created, awaiting review
**Touchpoint 2 (After Approval):** 15-30 minutes
- 5 min: Execute migration via Supabase MCP
- 10 min: Update current_schema/03_clinical_core.sql
- 5 min: Run verification queries
- 5 min: Mark migration complete

**Worker Updates:** 30-60 minutes (separate task after schema changes)
**Testing:** 30 minutes (end-to-end validation)

**Total Time:** ~90 minutes from approval to complete

---

## Questions for Review

1. Confirm all 6 column removals are approved (file_type, file_subtype, confidence_score, provider_name, facility_name, upload_context)
2. Confirm processed_image_size_bytes should store ONE combined total (not per-page breakdown)
3. Confirm acceptable to have NULL values for processed_image_size_bytes on existing records (can backfill later if needed)
4. Any concerns about dropping shell_files_file_type_check constraint?
5. Any concerns about dropping idx_shell_files_type index?

---

## Next Steps (After Approval)

1. Address any feedback from review
2. Execute Migration 40 via `mcp__supabase__apply_migration()`
3. Run verification queries
4. Update current_schema/03_clinical_core.sql (lines 96-167)
5. Update IMPLEMENTATION_PLAN.md with execution date
6. Mark migration header checkboxes complete
7. Update worker code (separate task)
8. Test end-to-end with new file upload

---

## Approval Status

**Touchpoint 1 Review:**
- [ ] User approval received
- [ ] Second AI bot review received (optional)
- [ ] Feedback addressed

**Ready for Touchpoint 2:** NO (awaiting review)

---

**Created:** 2025-11-06
**Last Updated:** 2025-11-06
**Status:** Awaiting Touchpoint 1 Review
