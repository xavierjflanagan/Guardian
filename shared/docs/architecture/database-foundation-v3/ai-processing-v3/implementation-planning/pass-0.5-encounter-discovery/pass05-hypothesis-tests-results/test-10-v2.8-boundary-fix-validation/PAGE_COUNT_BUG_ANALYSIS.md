# Page Count Bug - Root Cause Analysis and Fix Plan

**Date:** 2025-11-05
**Severity:** MEDIUM (Data integrity issue, not blocking processing)
**Impact:** All recent uploads have incorrect page_count in shell_files table
**Status:** IMPLEMENTED (Phase 1 Complete)
**Deployment:** Commit 92454ac, pushed to main 2025-11-05, auto-deploying to Render.com

---

## Problem Summary

The `shell_files.page_count` field contains incorrect values:
- Frankenstein PDF: Shows 8 pages (actual: 20 pages)
- TIFF file: Shows 1 page (actual: 2 pages)
- Office Visit PDF: Shows 5 pages (actual: 15 pages)

The actual page counts are correctly stored in `ocr_raw_jsonb` and used by Pass 0.5 processing, but the `page_count` field itself is never corrected after OCR processing.

---

## Root Cause Analysis

### Timeline of Events

1. **Upload (Edge Function):** User uploads file via frontend
2. **Edge Function Estimate:** `shell-file-processor-v3` estimates page count using `estimatePages()` function
3. **Database Insert:** shell_files record created with **estimated** page_count
4. **Worker OCR:** Worker downloads file, runs Google Cloud Vision OCR, gets **actual** page count
5. **Worker Storage:** Worker stores OCR data in `ocr_raw_jsonb` field
6. **BUG:** Worker never updates the `page_count` field with actual value

### Code Location: Edge Function

**File:** `supabase/functions/shell-file-processor-v3/index.ts`
**Lines:** 350, 475-486

**Line 350 (Database Insert):**
```typescript
page_count: data.estimated_pages || estimatePages(data.file_size_bytes, data.mime_type),
```

**Lines 475-486 (Estimation Function):**
```typescript
function estimatePages(fileSizeBytes: number, mimeType: string): number {
  const sizeMB = fileSizeBytes / (1024 * 1024);

  if (mimeType === 'application/pdf') {
    return Math.ceil(sizeMB * 10); // ~10 pages per MB for PDFs
  } else if (mimeType.startsWith('image/')) {
    return 1; // Images are typically 1 page
  } else {
    return Math.ceil(sizeMB * 5); // Conservative estimate for other types
  }
}
```

### Verification of Root Cause

**Frankenstein PDF:**
- File Size: 776,324 bytes = 0.74 MB
- Calculation: Math.ceil(0.74 × 10) = Math.ceil(7.4) = **8 pages**
- Database Value: **8 pages** ✓ (matches estimate)
- Actual OCR Result: **20 pages**
- Error: 8 vs 20 (60% wrong)

**TIFF File:**
- File Size: 21,062,994 bytes = 20.08 MB
- MIME Type: `image/tiff`
- Calculation: Returns **1 page** (images assumed to be 1 page)
- Database Value: **1 page** ✓ (matches estimate)
- Actual OCR Result: **2 pages**
- Error: 1 vs 2 (50% wrong)

**Office Visit PDF:**
- File Size: Unknown (need to check)
- Estimate: **5 pages**
- Actual: **15 pages**
- Error: 5 vs 15 (67% wrong)

### Worker Investigation

**Searched for:** Any code updating `page_count` field after OCR processing
**Files Checked:**
- `apps/render-worker/src/worker.ts`
- `apps/render-worker/src/utils/ocr-persistence.ts`
- `apps/render-worker/src/pass1/pass1-database-builder.ts`

**Result:** NO CODE FOUND that updates `shell_files.page_count` after OCR

The worker stores the actual page count in:
- `ocr_raw_jsonb->pages` (array of page objects)
- `pass05_encounter_metrics.total_pages` (for metrics)
- `shell_file_manifests.total_pages` (for manifest)

But never updates `shell_files.page_count`.

---

## Impact Assessment

### What Breaks

1. **Frontend Displays** - Any UI showing page count will be wrong
2. **Analytics Dashboards** - Usage tracking shows incorrect page counts
3. **Cost Estimates** - Pre-processing cost estimates based on page count are wrong
4. **Usage Metrics** - Billing/quota calculations may be inaccurate

### What Still Works

1. **Pass 0.5 Processing** - Uses actual OCR data, not page_count field
2. **Page Assignments** - Manifest uses actual page count from OCR
3. **Encounter Detection** - v2.8 boundary detection uses actual pages
4. **Job Processing** - Worker gets actual pages from OCR

### Severity Assessment

**MEDIUM** - Not critical because:
- Processing still works correctly
- Actual page count is available in `ocr_raw_jsonb`
- Pass 0.5 and manifests use correct values

But should be fixed because:
- Data integrity issue
- User-facing displays may be confusing
- Analytics/billing may be inaccurate

---

## Fix Plan

### Option 1: Update page_count in Worker (RECOMMENDED)

**Approach:** After OCR processing, update `shell_files.page_count` with actual value

**Implementation:**
1. In worker after OCR completes
2. Count actual pages from OCR result
3. Execute SQL UPDATE to set correct page_count

**Code Location:** `apps/render-worker/src/worker.ts` (after OCR processing completes)

**Pseudocode:**
```typescript
// After OCR completes
const actualPageCount = ocrResult.pages.length;

await supabase
  .from('shell_files')
  .update({ page_count: actualPageCount })
  .eq('id', shellFileId);
```

**Pros:**
- Simple implementation
- Fixes all future uploads
- Actual page count from OCR (most accurate)

**Cons:**
- Doesn't fix existing records (need migration)
- Adds one extra database write per upload

---

### Option 2: Remove page_count Estimation (Alternative)

**Approach:** Set page_count to NULL initially, only populate after OCR

**Implementation:**
1. Edge Function: Set `page_count: null` on insert
2. Worker: Update with actual value after OCR
3. Frontend: Handle NULL values (show "Processing..." or use manifest value)

**Pros:**
- More accurate (no misleading estimates)
- Clear distinction between estimated and known values

**Cons:**
- Frontend changes needed to handle NULL
- More complex implementation
- Analytics queries need to handle NULL

---

### Option 3: Add actual_page_count Column (Most Robust)

**Approach:** Keep estimate, add new column for actual value

**Implementation:**
1. Add `actual_page_count` column to shell_files
2. Edge Function: Sets `page_count` (estimate)
3. Worker: Sets `actual_page_count` (from OCR)
4. Frontend: Prefers `actual_page_count`, falls back to `page_count`

**Pros:**
- Preserves estimate for analytics
- Clear distinction between estimate and actual
- Backward compatible
- Can track estimation accuracy

**Cons:**
- Schema migration required
- More complex queries
- Two fields to maintain

---

## Recommended Fix Plan

### Phase 1: Worker Update (Immediate Fix)

**Target:** Fix all future uploads

**Steps:**
1. Update `apps/render-worker/src/worker.ts`
2. After OCR completes, add SQL UPDATE:
   ```typescript
   const actualPageCount = ocrResult.pages.length;

   await supabase
     .from('shell_files')
     .update({ page_count: actualPageCount })
     .eq('id', shellFileId);
   ```
3. Deploy worker with fix
4. Test with new upload
5. Verify page_count is correct

**Estimated Effort:** 15 minutes
**Risk:** LOW (only adds one UPDATE statement)

---

### Phase 2: Backfill Existing Records (Data Cleanup)

Not needed as all data is test-data. 

---

### Phase 3: Monitoring (Optional)

**Add logging to track estimation accuracy:**
```typescript
const estimatedPages = estimatePages(fileSizeBytes, mimeType);
const actualPages = ocrResult.pages.length;
const accuracy = Math.abs(estimatedPages - actualPages) / actualPages;

console.log(`Page count estimate: ${estimatedPages}, actual: ${actualPages}, error: ${(accuracy * 100).toFixed(1)}%`);
```

**Use for:**
- Improving estimation algorithm
- Tracking per-file-type accuracy
- Identifying patterns in estimation errors

---

## Testing Plan

### Test 1: New Upload with Worker Fix
1. Deploy worker with page_count UPDATE
2. Upload Frankenstein file
3. Verify `shell_files.page_count` = 20 (not 8)
4. Upload TIFF file
5. Verify `shell_files.page_count` = 2 (not 1)

### Test 2: Backfill Validation
1. Run validation query before backfill
2. Note affected record count
3. Run backfill UPDATE
4. Verify update count matches validation
5. Spot-check 5 random records

### Test 3: Frontend Display
1. Check file upload UI shows correct page count
2. Check analytics dashboard shows correct totals
3. Verify no NULL/undefined errors

---

## Rollback Plan

**If Worker Fix Causes Issues:**
1. Revert worker deployment
2. page_count will remain at estimate (current behavior)
3. No data loss (OCR data still in ocr_raw_jsonb)

**If Backfill Causes Issues:**
1. Re-run original estimatePages() for affected records
2. SQL to revert:
   ```sql
   -- Only if absolutely necessary
   UPDATE shell_files
   SET page_count = CASE
     WHEN mime_type = 'application/pdf'
       THEN CEIL((file_size_bytes / (1024.0 * 1024.0)) * 10)
     WHEN mime_type LIKE 'image/%'
       THEN 1
     ELSE CEIL((file_size_bytes / (1024.0 * 1024.0)) * 5)
   END
   WHERE [conditions];
   ```

---

## Recommendation

**Proceed with Phase 1 (Worker Fix) immediately:**
- Simple change (~5 lines of code)
- Fixes all future uploads
- Low risk
- High value

**Phase 2 (skipped)**

**Defer Phase 3 (Monitoring) to future iteration:**
- Nice to have, not critical
- Can add later if needed

---

## Open Questions

1. **Should we update page_count before or after Pass 0.5 processing?**
   - Recommendation: Immediately after OCR (before Pass 0.5)
   - Rationale: Makes accurate page count available sooner

2. **Should we validate OCR page count before updating?**
   - Recommendation: No validation needed
   - Rationale: OCR page count is ground truth

3. **Should we log estimation accuracy?**
   - Recommendation: Yes (Phase 3)
   - Rationale: Helps improve estimation algorithm

---

## Conclusion

**Root Cause:** Edge Function sets page_count using estimation formula, worker never updates with actual OCR page count.

**Fix:** Add SQL UPDATE in worker after OCR completes to set correct page_count.

**Timeline:**
- Phase 1 (Worker Fix): 15 minutes
- Phase 2 (Backfill): 10 minutes
- Testing: 15 minutes
- **Total:** ~40 minutes

**Risk:** LOW
**Priority:** MEDIUM
**Recommendation:** PROCEED with fix immediately

---

## Next Steps

**Awaiting your approval to:**
1. Implement Phase 1 (worker fix)
2. Test with new uploads
3. Implement Phase 2 (backfill)
4. Verify all page counts are correct

**Please review and confirm:**
- Do you approve Phase 1 (worker fix)?
- Do you approve Phase 2 (backfill)?
- Any concerns or questions?

---

## Implementation (Phase 1 Complete)

**Date Implemented:** 2025-11-05
**User Approval:** "we dont need to worry about historical data - its all test data. we are pre users and pre launch. Proceed"

### Code Changes

**File:** `apps/render-worker/src/worker.ts`
**Lines:** 930-953 (25 new lines)

**Implementation:**
```typescript
// FIX: Update shell_files.page_count with actual OCR page count
// Date: 2025-11-05
// Context: Edge Function estimates page_count using formulas (PDFs: ~10 pages/MB, Images: 1 page)
// Issue: Worker gets actual page count from OCR but never updated shell_files.page_count
// Result: All uploads had wrong page_count (e.g., 8 vs 20, 1 vs 2)
// Solution: Update with actual OCR page count after OCR completes
const actualPageCount = ocrPages.length;
const { error: pageCountError } = await this.supabase
  .from('shell_files')
  .update({ page_count: actualPageCount })
  .eq('id', payload.shell_file_id);

if (pageCountError) {
  this.logger.error('Failed to update page_count', pageCountError as Error, {
    shell_file_id: payload.shell_file_id,
    actual_page_count: actualPageCount,
  });
  // Log error but don't fail - this is for data integrity only
} else {
  this.logger.info('Updated page_count with actual OCR count', {
    shell_file_id: payload.shell_file_id,
    page_count: actualPageCount,
  });
}
```

**Location in Code Flow:**
1. OCR processing completes (line 920-923: `ocrResult` is built)
2. **NEW: Update page_count** (line 930-953: SQL UPDATE with actual count)
3. Persist OCR artifacts (line 956: `persistOCRArtifacts()`)

**Error Handling:**
- Logs error if UPDATE fails but doesn't fail the job
- Non-blocking: OCR processing and Pass 0.5 continue normally
- Data integrity fix, not critical to job success

### Deployment

**Commit:** 92454ac
**Branch:** main
**Pushed:** 2025-11-05
**Deploy Target:** Render.com (auto-deploy enabled)

**Commit Message:**
```
fix(worker): Update page_count with actual OCR result after processing

Root Cause:
- Edge Function estimates page_count using formulas (PDFs: ~10 pages/MB, Images: 1 page)
- Worker gets actual page count from OCR but never updated shell_files.page_count
- All uploads had wrong page_count in database (e.g., 8 vs 20, 1 vs 2)

Fix:
- Add SQL UPDATE after OCR completes to set correct page_count
- Location: worker.ts line 936-953 (after ocrResult is built)
- Logs error but doesn't fail job (data integrity fix, not critical)

Impact:
- All future uploads will have correct page_count
- Historical test data remains unchanged (pre-launch, no user data)
```

### Testing Plan

**Next Upload Test:**
1. Upload a new file (PDF or TIFF)
2. Wait for worker to process
3. Query shell_files table: `SELECT page_count FROM shell_files WHERE id = ?`
4. Verify page_count matches actual page count (not estimate)

**Expected Results:**
- PDF (1 MB): page_count should match actual pages (not ~10 pages)
- TIFF (multi-page): page_count should match actual pages (not 1 page)
- Worker logs: "Updated page_count with actual OCR count"

### Scope

**Phase 1 (IMPLEMENTED):**
- Worker fix: Update page_count after OCR completes
- Deployment: Auto-deploy to Render.com on push
- Testing: Next upload validation

**Phase 2 (SKIPPED):**
- Backfill historical data: NOT NEEDED
- Reason: "all test data. we are pre users and pre launch"
- Decision: User approved skipping Phase 2

**Phase 3 (DEFERRED):**
- Estimation accuracy logging
- Future improvement, not implemented

### Validation

**Deployment Status:** Auto-deploying to Render.com
**Testing Required:** Upload new file and verify page_count is correct
**Historical Data:** No action needed (all test data)

**SUCCESS CRITERIA:**
- Next upload shows correct page_count in shell_files table
- Worker logs confirm UPDATE statement executed
- No job failures related to page_count UPDATE
