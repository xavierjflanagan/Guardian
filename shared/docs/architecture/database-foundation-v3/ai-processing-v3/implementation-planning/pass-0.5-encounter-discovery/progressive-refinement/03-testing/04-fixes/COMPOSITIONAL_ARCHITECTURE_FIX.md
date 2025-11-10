# Compositional Prompt Architecture Fix
Date: 2025-11-10
Status: IMPLEMENTED - Ready for Testing
Priority: P0 (Unblocks 100+ page documents)

---

## Problem Summary

v2.10 progressive prompt suffered from catastrophic JSON schema mismatch:
- Used snake_case field names (encounter_type, provider_name, etc.)
- Used flat date structure (encounter_start_date, encounter_end_date)
- Parser expected camelCase (encounterType, provider, dateRange)
- Result: 100% data loss - zero encounters extracted from 142-page and 219-page documents

**Root Cause:** v2.10 was a complete rewrite with incompatible schema, not an extension of v2.9.

---

## Solution: Compositional Prompt Architecture

Instead of rewriting prompts, we now COMPOSE prompts:

```
Final Prompt = Base Prompt (v2.9) + Progressive Addons
```

### Architecture Benefits

1. **Single Source of Truth**: v2.9 prompt exists in ONE file
2. **Schema Stability**: Addons never modify JSON schema
3. **Easy Updates**: When v3.0 is created, update ONE file
4. **No Drift**: Progressive mode always uses latest base prompt
5. **Testability**: Test base prompt separately from progressive logic

### File Structure

```
apps/render-worker/src/pass05/
├── aiPrompts.v2.9.ts                    # Base prompt (source of truth)
├── progressive/
│   ├── addons.ts                        # NEW: Progressive-specific instructions
│   ├── chunk-processor.ts               # UPDATED: Uses base + addons
│   └── prompts.ts                       # DEPRECATED: Old v2.10 prompt
```

---

## Implementation Changes

### File 1: `progressive/addons.ts` (NEW)

**Purpose:** Schema-agnostic instructions appended to any base prompt

**Key Features:**
- Chunk position context (chunk 1 of 5, pages 1-50 of 250)
- Handoff context from previous chunks (pending encounters)
- Instructions for handling incomplete encounters
- CRITICAL: Does NOT modify JSON schema

**Example Output:**
```typescript
buildProgressiveAddons({
  chunkNumber: 2,
  totalChunks: 5,
  pageRange: [50, 100],
  totalPages: 250,
  handoffReceived: {...}
})
// Returns:
// "# PROGRESSIVE MODE INSTRUCTIONS
//  You are analyzing chunk 2 of 5 (pages 51-100 of 250 total)
//  ... (context about pending encounters) ...
//  ... (instructions for handling continuations) ...
//  CRITICAL: Use the EXACT SAME JSON format defined above."
```

### File 2: `progressive/chunk-processor.ts` (UPDATED)

**Before (BROKEN):**
```typescript
const prompt = buildProgressivePrompt({ /* v2.10 schema */ });
```

**After (FIXED):**
```typescript
// Build base v2.9 prompt
const fullText = extractTextFromPages(params.pages);
const basePrompt = buildEncounterDiscoveryPromptV29({
  fullText,
  pageCount: params.totalPages,
  ocrPages: params.pages
});

// Append progressive instructions
const progressiveAddons = buildProgressiveAddons({
  chunkNumber: params.chunkNumber,
  totalChunks: params.totalChunks,
  pageRange: params.pageRange,
  totalPages: params.totalPages,
  handoffReceived: params.handoffReceived
});

// Compositional prompt: base + addons
const prompt = basePrompt + '\n\n' + progressiveAddons;
```

### File 3: `progressive/chunk-processor.ts` Parser (UPDATED)

**Before (BROKEN):**
```typescript
// Tried to normalize v2.10 snake_case to camelCase
encounterType: enc.encounter_type,  // Mismatch!
```

**After (FIXED):**
```typescript
// v2.9 outputs camelCase natively, use directly
encounterType: enc.encounterType,  // Direct match
encounterStartDate: enc.dateRange?.start,  // Nested object
```

---

## Schema Compatibility Verification

| Field | v2.9 Base Prompt | Progressive Addons | Parser Expects | Compatible? |
|-------|------------------|-------------------|----------------|-------------|
| encounter_id | `encounter_id` | UNCHANGED | `encounter_id` | ✅ YES |
| encounterType | `encounterType` | UNCHANGED | `encounterType` | ✅ YES |
| dateRange | `{start, end}` | UNCHANGED | `{start, end}` | ✅ YES |
| provider | `provider` | UNCHANGED | `provider` | ✅ YES |
| pageRanges | `pageRanges` | UNCHANGED | `pageRanges` | ✅ YES |
| page_assignments | `page_assignments` | UNCHANGED | `page_assignments` | ✅ YES |

**Compatibility Score:** 100% (was 20% with v2.10)

---

## Progressive Continuation Detection

Since v2.9 doesn't have explicit "status" field, we detect continuations via summary field:

```typescript
const isContinuing = enc.summary && (
  enc.summary.includes('continues beyond') ||
  enc.summary.includes('continuing to next chunk')
);
```

**Progressive Addons Instruct AI:**
```
If an encounter continues beyond the last page:
- Mark it in the summary: Add "(continues beyond page 100)" to the summary field
```

This is cleaner than v2.10's separate "status" field and doesn't break the schema.

---

## Testing Verification

### Build Status
```bash
cd apps/render-worker
pnpm run build
# Result: SUCCESS - No TypeScript errors
```

### Compilation Verified
- `addons.ts` compiles cleanly
- `chunk-processor.ts` compiles with new imports
- All type definitions match

### Next Test: 142-Page Document

**Expected Results:**
- Chunk 1 (pages 1-50): Extract 2-3 encounters
- Chunk 2 (pages 51-100): Extract 2-3 encounters
- Chunk 3 (pages 101-142): Extract 1-2 encounters
- Total encounters: 5-8 (was 0 with v2.10)
- Output tokens per chunk: >500 (was 77 with v2.10)

---

## Deployment Plan

### Step 1: Commit and Push
```bash
git add apps/render-worker/src/pass05/progressive/addons.ts
git add apps/render-worker/src/pass05/progressive/chunk-processor.ts
git add apps/render-worker/dist/pass05/progressive/
git commit -m "fix(pass05): Implement compositional prompt architecture for progressive mode

PROBLEM: v2.10 progressive prompt had catastrophic schema mismatch causing 100% data loss
ROOT CAUSE: v2.10 used snake_case, parser expected camelCase from v2.9
SOLUTION: Compositional architecture - base prompt (v2.9) + schema-agnostic addons

CHANGES:
- NEW: progressive/addons.ts - Schema-agnostic progressive instructions
- UPDATED: progressive/chunk-processor.ts - Uses base + addons composition
- DEPRECATED: v2.10 prompts.ts (broken schema, no longer used)

BENEFITS:
- Single source of truth for prompt schema (v2.9)
- Progressive addons work with any base prompt (v2.9, v3.0, etc.)
- No schema drift between standard and progressive modes
- Easy to update when creating new prompt versions

TESTING: TypeScript build passes, ready for 142-page document test"

git push
```

### Step 2: Render.com Auto-Deploy
- Main branch push triggers auto-deploy
- Worker rebuilds with new code
- Estimated deploy time: 2-5 minutes

### Step 3: Re-Enable Progressive Mode

**BEFORE deployment:**
```typescript
// In encounterDiscovery.ts
if (shouldUseProgressiveMode(input.pageCount)) {
  throw new Error('PROGRESSIVE MODE DISABLED - v2.10 broken');
}
```

**AFTER successful test:**
```typescript
// Remove the error throw, let progressive mode run
if (shouldUseProgressiveMode(input.pageCount)) {
  return await processDocumentProgressively(input);
}
```

---

## Validation Queries

After deploying and re-testing 142-page document:

```sql
-- Check encounters extracted
SELECT COUNT(*) FROM healthcare_encounters
WHERE primary_shell_file_id = '[142_PAGE_DOC_ID]';
-- Expected: 5-8 encounters (was 0)

-- Check progressive chunk metrics
SELECT chunk_number, encounters_completed, encounters_pending,
       output_tokens, ai_cost_usd
FROM pass05_progressive_chunks
WHERE session_id = (
  SELECT id FROM pass05_progressive_sessions
  WHERE shell_file_id = '[142_PAGE_DOC_ID]'
)
ORDER BY chunk_number;
-- Expected: Each chunk has >500 output tokens (was 77)

-- Check shell file completion
SELECT status, pass_0_5_completed, pass_0_5_progressive
FROM shell_files
WHERE id = '[142_PAGE_DOC_ID]';
-- Expected: status='completed', pass_0_5_completed=TRUE, pass_0_5_progressive=TRUE
```

---

## Success Criteria

Progressive mode fix is successful when:
- [ ] TypeScript compiles without errors ✅ DONE
- [ ] 142-page document produces 5+ encounters (was 0)
- [ ] Each chunk outputs >500 tokens (was 77)
- [ ] Page assignments written correctly
- [ ] Metrics table populated
- [ ] Shell file marked as completed
- [ ] No schema validation errors in logs

---

## Rollback Plan

If compositional architecture causes issues:

```bash
# Revert to disabled state
git revert [COMMIT_HASH]
git push

# Worker will redeploy with progressive mode disabled
# Users can manually split large documents until fixed
```

---

## Future Enhancements

### When Creating v3.0 Prompt

1. Create `aiPrompts.v3.0.ts` (new base prompt)
2. Progressive addons work unchanged (schema-agnostic)
3. Update `chunk-processor.ts` to use v3.0:
   ```typescript
   import { buildEncounterDiscoveryPromptV30 } from '../aiPrompts.v3.0';
   const basePrompt = buildEncounterDiscoveryPromptV30({...});
   ```
4. Done! Progressive mode works with v3.0

### Multi-Version Support

If we want to support multiple prompt versions simultaneously:

```typescript
const version = process.env.PASS_05_VERSION || 'v2.9';
const promptBuilder = version === 'v3.0'
  ? buildEncounterDiscoveryPromptV30
  : buildEncounterDiscoveryPromptV29;
const basePrompt = promptBuilder({...});
```

---

## Files Changed

**Source Files (New):**
- `apps/render-worker/src/pass05/progressive/addons.ts`

**Source Files (Modified):**
- `apps/render-worker/src/pass05/progressive/chunk-processor.ts`

**Documentation (New):**
- `shared/docs/.../V2.10_ROOT_CAUSE_ANALYSIS.md`
- `shared/docs/.../COMPOSITIONAL_ARCHITECTURE_FIX.md` (this file)

**Compiled Files (Auto-generated):**
- `apps/render-worker/dist/pass05/progressive/addons.js`
- `apps/render-worker/dist/pass05/progressive/addons.d.ts`
- `apps/render-worker/dist/pass05/progressive/chunk-processor.js`

---

## Contact

For questions about this fix:
- Root cause analysis: `V2.10_ROOT_CAUSE_ANALYSIS.md`
- Original issue: `TEST_04_142_pages_progressive_CRITICAL_FAILURE.md`
- Implementation: This document
