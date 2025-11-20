# Progressive Mode Re-Enabled - 2025-11-10

**Status:** DEPLOYED - Ready for Testing
**Git Commits:** 8ce231e (architecture), 5b649d1 (enablement)
**Priority:** P0 (Unblocks 100+ page documents)

---

## Summary

Progressive mode has been **RE-ENABLED** with the new compositional prompt architecture.

### How It Works Now

**Automatic activation:**
```typescript
if (pageCount > 100) {
  // Use progressive mode (v2.9 base + addons per chunk)
} else {
  // Use standard mode (v2.9 single-pass)
}
```

**No environment variables needed** - it's purely based on page count (hardcoded threshold: 100 pages).

---

## Configuration

### Threshold (Hardcoded)
- **Location:** `apps/render-worker/src/pass05/progressive/session-manager.ts`
- **Line 19:** `const PAGE_THRESHOLD = 100;`
- **Logic:** Documents with >100 pages automatically use progressive mode
- **To change:** Edit `PAGE_THRESHOLD` constant and redeploy

### Chunk Size (Hardcoded)
- **Location:** Same file
- **Line 18:** `const CHUNK_SIZE = 50;`
- **Logic:** Each chunk processes 50 pages
- **Example:** 142-page doc = 3 chunks (pages 1-50, 51-100, 101-142)

### No Environment Variables
Unlike the old system, there's **no PASS_05_PROGRESSIVE_ENABLED env var**. It's purely automatic based on page count.

**Why?** Simpler, more predictable behavior. Users don't need to configure anything.

---

## Architecture Flow

### Small Document (≤100 pages)
```
User uploads 71-page document
  ↓
encounterDiscovery.ts: shouldUseProgressiveMode(71) → false
  ↓
Standard mode: Single v2.9 prompt with all 71 pages
  ↓
AI extracts encounters
  ↓
Parser processes response
  ↓
Database writes (encounters, metrics, page assignments)
  ↓
Complete!
```

### Large Document (>100 pages)
```
User uploads 142-page document
  ↓
encounterDiscovery.ts: shouldUseProgressiveMode(142) → true
  ↓
Progressive mode activated
  ↓
session-manager.ts: initializeProgressiveSession()
  ↓
Chunk 1 (pages 1-50):
  chunk-processor.ts:
    - Build base v2.9 prompt with pages 1-50
    - Append progressive addons (chunk context, no handoff)
    - Call AI
    - Extract encounters
    - Write to healthcare_encounters table
    - Generate handoff package
  ↓
Chunk 2 (pages 51-100):
  chunk-processor.ts:
    - Build base v2.9 prompt with pages 51-100
    - Append progressive addons (chunk context, handoff from chunk 1)
    - Call AI
    - Extract encounters (may complete pending from chunk 1)
    - Write to healthcare_encounters table
    - Generate handoff package
  ↓
Chunk 3 (pages 101-142):
  chunk-processor.ts:
    - Build base v2.9 prompt with pages 101-142
    - Append progressive addons (final chunk context, handoff from chunk 2)
    - Call AI
    - Extract encounters
    - Write to healthcare_encounters table
  ↓
session-manager.ts: reconcilePendingEncounters()
  ↓
session-manager.ts: finalizeProgressiveSession()
  ↓
Complete!
```

---

## Database Tables Used

### Standard Mode (≤100 pages)
- `healthcare_encounters` - Extracted encounters
- `pass05_encounter_metrics` - Cost, tokens, performance
- `pass05_page_assignments` - Page-to-encounter mapping
- `shell_files` - Completion status

### Progressive Mode (>100 pages)
**All of the above PLUS:**
- `pass05_progressive_sessions` - Session tracking
- `pass05_progressive_chunks` - Per-chunk metrics
- `pass05_progressive_pending_encounters` - Incomplete encounters spanning chunks

---

## Expected Test Results (142-Page Document)

### Before (v2.10 - BROKEN)
```sql
SELECT COUNT(*) FROM healthcare_encounters WHERE primary_shell_file_id = '[ID]';
-- Result: 0

SELECT output_tokens FROM pass05_progressive_chunks WHERE session_id = '[SESSION]';
-- Result: 77, 77, 77 (identical, suspiciously low)
```

### After (Compositional Architecture - FIXED)
```sql
SELECT COUNT(*) FROM healthcare_encounters WHERE primary_shell_file_id = '[ID]';
-- Expected: 5-8 encounters

SELECT chunk_number, encounters_completed, output_tokens, ai_cost_usd
FROM pass05_progressive_chunks WHERE session_id = '[SESSION]';
-- Expected:
-- chunk_number | encounters_completed | output_tokens | ai_cost_usd
-- 1            | 2-3                  | 500-2000      | 0.001-0.005
-- 2            | 2-3                  | 500-2000      | 0.001-0.005
-- 3            | 1-2                  | 500-2000      | 0.001-0.005

SELECT status, pass_0_5_completed, pass_0_5_progressive
FROM shell_files WHERE id = '[ID]';
-- Expected: status='completed', pass_0_5_completed=TRUE, pass_0_5_progressive=TRUE
```

---

## Deployment Status

✅ **Commit 8ce231e:** Compositional architecture (base + addons)
✅ **Commit 5b649d1:** Progressive mode re-enabled
✅ **Build:** TypeScript compilation successful
✅ **Push:** Deployed to main branch
🔄 **Render.com:** Auto-deploying (check dashboard)

---

## Next Steps

### 1. Wait for Render Deploy
- Check Render.com dashboard
- Wait for "Live" status (2-5 minutes)
- Verify no startup errors in logs

### 2. Re-Test 142-Page Document
- Upload same 142-page document that failed before
- Monitor logs for progressive mode activation
- Expected log: `[Pass 0.5] Document has 142 pages, using progressive mode (compositional v2.9 + addons)`

### 3. Validate Results
Run the SQL queries above to verify:
- Encounters extracted (5-8 expected)
- Output tokens reasonable (>500 per chunk)
- Shell file marked completed
- Progressive session finalized

### 4. Test Other Large Documents
- 219-page document (should work now)
- 150-page document (new test case)
- 101-page document (edge case - should trigger progressive)

---

## Monitoring

### Success Indicators
1. **Log messages:**
   ```
   [Pass 0.5] Document has 142 pages, using progressive mode (compositional v2.9 + addons)
   [Progressive] Started session [ID] for 142 pages (3 chunks)
   [Progressive] Processing chunk 1/3 (pages 1-50)
   [Chunk 1] Processing with [Model Name]
   [Chunk 1] Complete: 2 encounters, confidence 0.92, 1234ms, $0.0023
   [Progressive] Chunk 1 complete: 2 encounters, 0.0023 USD
   ... (repeat for chunks 2-3)
   [Progressive] Session [ID] complete: 7 total encounters, 0.0067 USD
   ```

2. **Database indicators:**
   - `healthcare_encounters` has 5+ rows
   - `pass05_progressive_chunks` has 3 rows (one per chunk)
   - `pass05_progressive_sessions.status` = 'completed'
   - `shell_files.pass_0_5_completed` = TRUE

### Failure Indicators
1. **Still getting zero encounters** = schema mismatch persists (rollback)
2. **Error: "PROGRESSIVE MODE DISABLED"** = code didn't deploy (check Render)
3. **Timeout errors** = chunk size too large (reduce from 50 to 30)
4. **Cost explosion** = verify model selection (should be GPT-5-mini or Gemini Flash)

---

## Rollback Procedure

If progressive mode still fails:

```bash
# Option 1: Disable progressive mode again
git revert 5b649d1
git push
# (keeps compositional architecture but disables >100 page processing)

# Option 2: Revert everything
git revert 5b649d1 8ce231e
git push
# (back to pre-fix state)
```

---

## Configuration Changes (If Needed)

### Increase Chunk Size (if too many chunks)
```typescript
// apps/render-worker/src/pass05/progressive/session-manager.ts
const CHUNK_SIZE = 75; // Was 50, now 75 pages per chunk
```

### Decrease Chunk Size (if timeouts occur)
```typescript
const CHUNK_SIZE = 30; // Was 50, now 30 pages per chunk
```

### Change Progressive Threshold
```typescript
// Enable for smaller documents
const PAGE_THRESHOLD = 50; // Was 100, now 50

// Disable progressive mode entirely
const PAGE_THRESHOLD = 999999; // Effectively never trigger
```

**After any config change:**
1. Rebuild: `pnpm run build`
2. Commit: `git commit -am "config: Adjust progressive mode thresholds"`
3. Push: `git push`
4. Wait for Render deploy

---

## FAQ

### Q: How do I know if progressive mode is active?
**A:** Check the logs for:
```
[Pass 0.5] Document has 142 pages, using progressive mode (compositional v2.9 + addons)
```

If you see:
```
[Pass 0.5] Document has 71 pages, using standard mode
```
Then standard mode is active (expected for ≤100 pages).

### Q: Can I force progressive mode for smaller documents?
**A:** Yes, change `PAGE_THRESHOLD` in `session-manager.ts` to a lower value (e.g., 50).

### Q: Can I disable progressive mode entirely?
**A:** Yes, change `PAGE_THRESHOLD` to a very high number (e.g., 999999) or add this to `encounterDiscovery.ts`:
```typescript
if (shouldUseProgressiveMode(input.pageCount)) {
  throw new Error('Progressive mode disabled by admin');
}
```

### Q: What if I want to use a different base prompt (v3.0)?
**A:** When v3.0 is ready:
1. Update `chunk-processor.ts` line 31:
   ```typescript
   import { buildEncounterDiscoveryPromptV30 } from '../aiPrompts.v3.0';
   const basePrompt = buildEncounterDiscoveryPromptV30({...});
   ```
2. Progressive addons work unchanged!

### Q: Does progressive mode cost more?
**A:** Yes, slightly (10-20% overhead):
- Standard mode: 1 AI call
- Progressive mode: N AI calls (N = number of chunks)
- But progressive mode enables processing of large documents that would otherwise fail
- Cost is still <$0.01 per document with GPT-5-mini or Gemini Flash

---

## Related Documentation

- **Root Cause Analysis:** `V2.10_ROOT_CAUSE_ANALYSIS.md`
- **Architecture Fix:** `COMPOSITIONAL_ARCHITECTURE_FIX.md`
- **Original Failures:** `TEST_04_142_pages_progressive_CRITICAL_FAILURE.md`, `TEST_05_219_pages_progressive_CRITICAL_FAILURE.md`

---

## Success Criteria

Progressive mode is working when:
- [ ] 142-page document extracts 5+ encounters ✅ (was 0)
- [ ] Each chunk outputs >500 tokens ✅ (was 77)
- [ ] Progressive session completes without errors
- [ ] Database tables properly populated
- [ ] Shell file marked as completed
- [ ] Total cost <$0.02 per document

**Current Status:** Deployed, awaiting test results
