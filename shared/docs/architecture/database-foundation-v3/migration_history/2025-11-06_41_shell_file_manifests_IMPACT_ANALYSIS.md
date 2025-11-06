# Migration 41 - Impact Analysis
## shell_file_manifests Cleanup

**Migration File:** `2025-11-06_41_shell_file_manifests_cleanup.sql`
**Date:** 2025-11-06
**Status:** Touchpoint 1 - Awaiting Review
**Execution:** NOT YET EXECUTED

---

## Summary

Migration 41 implements vestigial column cleanup for the shell_file_manifests table based on Pass 0.5 audit findings. This migration:
- Removes 1 vestigial column (batching_required)
- Updates worker to populate pass_0_5_version from environment
- Updates worker to include summary field in manifest encounters

**Risk Level:** LOW (test data only, single column removal, no data dependencies)

**Production Safety Enhancements:**
- Schema-qualified all database objects (public.*)
- Transaction-wrapped DDL operations (BEGIN/COMMIT)
- Verification queries confirm column removal
- Rollback script provided with default value restoration

---

## Schema Changes

### Columns to REMOVE (1)

| Column Name | Type | Reason for Removal |
|------------|------|-------------------|
| `batching_required` | BOOLEAN NOT NULL DEFAULT FALSE | Vestigial - logic moved to shell_files.page_separation_analysis (Migration 39), always FALSE |

### No Columns to ADD

This migration is purely a cleanup migration (removal only).

---

## Worker Code Changes (Non-Schema)

These changes update worker behavior without requiring schema changes:

### 1. pass_0_5_version Population

**Current Behavior:**
```typescript
pass_0_5_version: '1.0.0'  // Hardcoded
```

**New Behavior:**
```typescript
pass_0_5_version: process.env.PASS_05_VERSION || 'v2.8'  // From environment
```

**Impact:** Enables version tracking for regression analysis and debugging

### 2. Manifest Encounters Summary Field

**Current Behavior:**
```typescript
encounters.push({
  encounterId: dbEncounter.id,
  encounterType: aiEnc.encounterType,
  // ... other fields ...
  extractedText: aiEnc.extractedText
  // MISSING: summary field
});
```

**New Behavior:**
```typescript
encounters.push({
  encounterId: dbEncounter.id,
  encounterType: aiEnc.encounterType,
  // ... other fields ...
  summary: aiEnc.summary,  // ← ADD THIS
  extractedText: aiEnc.extractedText
});
```

**Impact:** Pass 1/2 will have encounter summary context from manifest (improves AI processing quality)

---

## Impact Analysis

### Database Impact

**Positive Impacts:**
- Cleaner schema (removes unused column)
- Reduces table size (minimal - 1 boolean column)
- Removes confusion about batching logic location

**Potential Risks:**
- None identified (column always FALSE, no application code uses it)

### Application Impact

**Frontend:**
- No impact (manifest_data is backend-only)

**Worker Code:**
- REQUIRES UPDATE: manifestBuilder.ts needs two changes:
  1. Populate pass_0_5_version from environment
  2. Include summary in manifest encounters
- Location: `apps/render-worker/src/pass05/manifestBuilder.ts`

**Pass 1/2 AI Processing:**
- IMPROVEMENT: Encounter summaries now available in manifest for context

---

## Affected Files

### Source of Truth (MUST UPDATE in Touchpoint 2)

**File:** `current_schema/03_clinical_core.sql`
**Lines:** 281-327 (shell_file_manifests table definition)

**Required Changes:**
- Line 299-300: REMOVE batching_required column and comment

### Worker Code (UPDATE after Touchpoint 2)

**File 1:** `apps/render-worker/src/pass05/manifestBuilder.ts`
**Location 1:** Manifest creation (around line 350-400)
**Update 1:** Populate pass_0_5_version from environment

```typescript
// Current (around line 390):
const manifestRecord = {
  shell_file_id: input.shellFileId,
  patient_id: input.patientId,
  pass_0_5_version: '1.0.0',  // CHANGE THIS
  // ...
};

// Updated:
const manifestRecord = {
  shell_file_id: input.shellFileId,
  patient_id: input.patientId,
  pass_0_5_version: process.env.PASS_05_VERSION || 'v2.8',  // From environment
  // ...
};
```

**File 2:** `apps/render-worker/src/pass05/manifestBuilder.ts`
**Location 2:** Encounter object creation (around line 252-263)
**Update 2:** Include summary field in encounters array

```typescript
// Current (around line 252-263):
encounters.push({
  encounterId: dbEncounter.id,
  encounterType: aiEnc.encounterType as EncounterType,
  isRealWorldVisit: aiEnc.isRealWorldVisit,
  dateRange: aiEnc.dateRange,
  provider: aiEnc.provider,
  facility: aiEnc.facility,
  pageRanges: normalizedPageRanges,
  spatialBounds,
  confidence: aiEnc.confidence,
  extractedText: aiEnc.extractedText  // ADD summary BEFORE this line
});

// Updated:
encounters.push({
  encounterId: dbEncounter.id,
  encounterType: aiEnc.encounterType as EncounterType,
  isRealWorldVisit: aiEnc.isRealWorldVisit,
  dateRange: aiEnc.dateRange,
  provider: aiEnc.provider,
  facility: aiEnc.facility,
  pageRanges: normalizedPageRanges,
  spatialBounds,
  confidence: aiEnc.confidence,
  summary: aiEnc.summary,  // ← ADD THIS LINE
  extractedText: aiEnc.extractedText
});
```

**File 3:** `apps/render-worker/src/pass05/types.ts` (or wherever EncounterMetadata is defined)
**Update 3:** Ensure summary field is in TypeScript type (may already exist as optional)

---

## Data Migration

**Current Data:** All test data (no user data exists pre-launch)

**Removed Column Data:**
- `batching_required`: All records have FALSE value
- No data loss (column unused)

**Data Loss Assessment:**
- ACCEPTABLE: Column always FALSE, no useful data to preserve

**Existing Records:**
- No backfill needed for removed column
- Existing manifest_data JSONB unaffected (summary will be added to new records only)

---

## Testing Plan

### Pre-Migration Testing

- [ ] Verify current shell_file_manifests schema matches expectations
- [ ] Query for any application code using batching_required column (expect: none)
- [ ] Test migration SQL for syntax errors (dry-run)
- [ ] Verify idempotency (can run migration multiple times safely)
- [ ] DB-level dependency scan:
  ```sql
  -- Check for views referencing shell_file_manifests.batching_required
  SELECT viewname, definition
  FROM pg_views
  WHERE schemaname = 'public'
    AND definition ILIKE '%batching_required%';

  -- Check for functions/stored procedures
  SELECT proname, prosrc
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND prosrc ILIKE '%batching_required%';
  ```

### Post-Migration Testing

- [ ] Run verification queries from migration script
- [ ] Confirm column removed successfully
- [ ] Verify existing records preserved
- [ ] Check manifest_data structure intact

### Worker Integration Testing

- [ ] Update worker code (two changes in manifestBuilder.ts)
- [ ] Add PASS_05_VERSION environment variable to Render.com (value: "v2.8")
- [ ] Deploy worker to Render.com
- [ ] Upload new file via frontend
- [ ] Verify Pass 0.5 processing completes
- [ ] Check manifest record:
  ```sql
  SELECT
    manifest_id,
    pass_0_5_version,  -- Should be "v2.8" (not "1.0.0")
    manifest_data->'encounters'->0->>'summary' as first_encounter_summary  -- Should NOT be NULL
  FROM shell_file_manifests
  ORDER BY created_at DESC
  LIMIT 1;
  ```

### End-to-End Testing

- [ ] Verify pass_0_5_version = "v2.8" for new uploads
- [ ] Verify manifest_data.encounters[].summary populated
- [ ] Verify no errors in worker logs
- [ ] Test file listing/viewing in dashboard

---

## Rollback Procedure

**Rollback Script:** Included in migration file (lines 88-106)

**WARNING:** Rollback will restore column structure but NOT original data. batching_required will be FALSE for all records. This is acceptable as all current data is test data.

**Rollback Steps:**
1. Execute rollback SQL from migration file
2. Verify column restored via verification query
3. Update current_schema/03_clinical_core.sql back to original state

**Rollback Risk:** LOW (test data environment, single boolean column with known default)

---

## Dependencies and Blockers

**Dependencies:**
- None (Migration 41 is independent)

**Blockers:**
- None (user approved changes)

**Ready to Execute:** YES (pending Touchpoint 1 review)

---

## Success Criteria

**Migration Execution:**
- [ ] Migration script executes without errors
- [ ] batching_required column removed successfully
- [ ] No data loss on existing records (records preserved)

**Source of Truth Updates:**
- [ ] current_schema/03_clinical_core.sql updated

**Worker Integration:**
- [ ] pass_0_5_version populated from environment variable
- [ ] summary field included in manifest encounters
- [ ] New uploads show correct version (v2.8)
- [ ] New uploads show encounter summaries

**End-to-End Testing:**
- [ ] File upload works via frontend
- [ ] Pass 0.5 processing completes
- [ ] Manifest data correct
- [ ] No worker errors

---

## Timeline Estimate

**Touchpoint 1 (Current):** Script created, awaiting review
**Touchpoint 2 (After Approval):** 15-20 minutes
- 2 min: Execute migration via Supabase MCP
- 5 min: Update current_schema/03_clinical_core.sql
- 2 min: Run verification queries
- 5 min: Mark migration complete

**Worker Updates:** 10-15 minutes (two simple code changes)
**Environment Variable:** 2 minutes (add PASS_05_VERSION to Render.com)
**Testing:** 20 minutes (end-to-end validation)

**Total Time:** ~50 minutes from approval to complete

---

## Questions for Review

1. Confirm batching_required column removal approved?
2. Confirm pass_0_5_version should use environment variable (PASS_05_VERSION)?
3. Confirm summary field should be added to manifest encounters?
4. Any concerns about worker code changes?

---

## Next Steps (After Approval)

1. Address any feedback from review
2. Execute Migration 41 via `mcp__supabase__apply_migration()`
3. Run verification queries
4. Update current_schema/03_clinical_core.sql (lines 281-327)
5. Update worker code (manifestBuilder.ts - 2 changes)
6. Add PASS_05_VERSION environment variable to Render.com
7. Mark migration header checkboxes complete
8. Deploy worker and test end-to-end

---

## Environment Variable Configuration

**Render.com Environment Variable:**
```
PASS_05_VERSION=v2.8
```

**Purpose:** Track which Pass 0.5 version processed each file

**Usage in Worker:**
```typescript
pass_0_5_version: process.env.PASS_05_VERSION || 'v2.8'
```

**Benefits:**
- Version tracking for regression analysis
- Easy to update when new versions deployed
- Enables filtering by version in database queries

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
