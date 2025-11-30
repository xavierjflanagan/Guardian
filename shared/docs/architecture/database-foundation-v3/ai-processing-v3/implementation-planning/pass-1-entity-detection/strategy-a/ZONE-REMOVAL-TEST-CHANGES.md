# Pass 1 Entity Extraction Testing

**Date:** 2025-11-30
**Purpose:** Test different configurations to improve entity extraction completeness

## Test Results Summary

### A. Zones ON vs OFF

| Test | File | Zones | Entities | Immunisation | Medication | Condition | Procedure |
|------|------|-------|----------|--------------|------------|-----------|-----------|
| 1-page zones OFF | Page 2 only | OFF | 38 | 32 | 1 | 4 | 0 |
| 1-page zones ON (run 1) | Page 2 only | ON | 31 | 25 | 1 | 4 | 0 |
| 1-page zones ON (run 2) | Page 2 only | ON | 32 | 25 | 1 | 4 | 0 |

**Conclusion:** Zones hurt extraction quality. With zones OFF, extracted 7 more immunisations (second doses of same vaccines). Zone-building task distracts AI from complete line-by-line extraction.

**Variance:** Between identical runs with zones ON, variance was +/- 1 entity (~3%) - reasonably stable.

### B. 1-Page vs 3-Page File

| Test | Pages | Zones | Entities | Immunisation | Medication | Condition | Procedure |
|------|-------|-------|----------|--------------|------------|-----------|-----------|
| 3-page zones OFF | 3 | OFF | 44 | 16 | 20 | 6 | 2 |
| 3-page zones ON | 3 | ON | 52 | 25 | 19 | 6 | 2 |
| 1-page zones OFF | 1 | OFF | 38 | 32 | 1 | 4 | 0 |

**Conclusion:** Single-page processing extracts far more entities from the same content. Page 2 alone with zones OFF got 32 immunisations, while the full 3-page file only got 16-25 immunisations for the same page.

**Root Cause:** AI struggles with multi-page context. When given just 1 page, it reads every line properly. With 3 pages, it skips/deduplicates across pages.

## Key Findings

1. **Zones hurt extraction:** -7 entities when zones enabled on 1-page file
2. **Multi-page hurts extraction:** -16 immunisations when same content in 3-page vs 1-page
3. **Variance is low:** ~3% between identical runs
4. **Best configuration:** 1 page per API call, zones OFF

## Recommended Next Steps

1. Implement 1-page-per-API-call batching (Option 3)
2. Keep zones OFF for entity extraction
3. Derive zones post-hoc from extracted entities if needed for Pass 2

## Files Modified for Zone Toggle

### 1. pass1-v2-types.ts

**Location:** `apps/render-worker/src/pass1-v2/pass1-v2-types.ts`

**Changes:**
- Added `include_zones_in_prompt: boolean` to `Pass1Config` interface (line ~336)
- Currently set to `true` in `DEFAULT_PASS1_CONFIG` (line ~351)

**To Toggle:**
```typescript
// Zones enabled (current):
include_zones_in_prompt: true

// Zones disabled:
include_zones_in_prompt: false
```

### 2. pass1-v2-prompt.ts

**Location:** `apps/render-worker/src/pass1-v2/pass1-v2-prompt.ts`

**Changes:**
- Added `PromptOptions` interface with `includeZones?: boolean` field
- Refactored `buildUserPrompt()` to accept `PromptOptions` object
- Conditionally includes zone instructions based on `includeZones` flag
- Two JSON schema examples: with-zones and entity-only

### 3. Pass1Detector.ts

**Location:** `apps/render-worker/src/pass1-v2/Pass1Detector.ts`

**Changes:**
- Updated `processBatch()` to pass `this.config.include_zones_in_prompt` to `buildBatchPrompt()`

## Commits

1. `53d7d0b` - test(pass1): Add includeZones feature flag for entity extraction testing
2. `3348497` - fix(pass1): Wire includeZones config to prompt builder
3. `ca01a86` - revert(pass1): Re-enable zones after testing
