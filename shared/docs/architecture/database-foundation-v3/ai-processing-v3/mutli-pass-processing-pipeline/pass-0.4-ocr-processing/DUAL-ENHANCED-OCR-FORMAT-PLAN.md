# Dual Enhanced OCR Format Implementation Plan

**Status:** COMPLETE
**Created:** 2025-11-27
**Completed:** 2025-11-27
**Priority:** CRITICAL - 5.9x token cost reduction for Pass 0.5

## Problem Summary

**Current State:**
- Single `enhanced-ocr.txt` format with both X and Y coordinates: `[Y:240] text (x:20) | text (x:120)`
- Pass 0.5 only needs Y-coordinates (for encounter boundary positioning)
- Pass 1/2 need X+Y coordinates (for clinical entity bounding boxes and table structure)
- Result: 5.9x token inflation for Pass 0.5 (5,079 tokens/page vs ~850 tokens/page)

**Evidence (142-page document):**
| Date | Session | Tokens/Page | Total Input Tokens |
|------|---------|-------------|-------------------|
| Nov 27 (today) | 00adef52 | 5,079 | 721,247 |
| Nov 23 | 380fc90f | 868 | 123,286 |

## Solution

Create two enhanced OCR formats:

1. **Enhanced Y-Only** (`enhanced-ocr-y.txt`) - For Pass 0.5
   - Format: `[Y:240] text text text`
   - ~900 tokens/page

2. **Enhanced XY** (`enhanced-ocr-xy.txt`) - For Pass 1/2
   - Format: `[Y:240] text (x:20) | text (x:120)`
   - ~5000 tokens/page

## Affected Files

| File | Changes Required |
|------|------------------|
| `apps/render-worker/src/pass05/progressive/ocr-formatter.ts` | Add `generateEnhancedOcrFormatYOnly()` function |
| `apps/render-worker/src/utils/ocr-persistence.ts` | Add `storeEnhancedOCR_Y()` and `loadEnhancedOCR_Y()` functions |
| `apps/render-worker/src/worker.ts` | Store both formats during initial OCR processing |
| `apps/render-worker/src/pass05/progressive/session-manager.ts` | Load Y-only format for Pass 0.5 |

## Implementation Steps

### Step 1: Add Y-Only Format Generator
**File:** `apps/render-worker/src/pass05/progressive/ocr-formatter.ts`

Add new function `generateEnhancedOcrFormatYOnly()`:
- Same word extraction and line grouping as XY version
- Output format: `[Y:###] word word word` (no X-coordinates, no separators)
- Reuse existing `extractWordsWithCoordinates()` and `groupWordsByLine()` helpers

### Step 2: Add Storage Functions
**File:** `apps/render-worker/src/utils/ocr-persistence.ts`

Add functions:
```typescript
// Store Y-only enhanced OCR (for Pass 0.5)
export async function storeEnhancedOCR_Y(
  supabase: SupabaseClient,
  patientId: string,
  shellFileId: string,
  enhancedOCRText: string,
  correlationId?: string
): Promise<void>

// Load Y-only enhanced OCR (for Pass 0.5)
export async function loadEnhancedOCR_Y(
  supabase: SupabaseClient,
  patientId: string,
  shellFileId: string,
  correlationId?: string
): Promise<string | null>
```

Storage paths:
- Y-only: `{patient_id}/{shell_file_id}-ocr/enhanced-ocr-y.txt`
- XY: `{patient_id}/{shell_file_id}-ocr/enhanced-ocr-xy.txt`

### Step 3: Update Worker to Store Both Formats
**File:** `apps/render-worker/src/worker.ts`
**Method:** `storeEnhancedOCRFormat()` (lines 1037-1081)

Changes:
1. Generate Y-only format using `generateEnhancedOcrFormatYOnly()`
2. Generate XY format using existing `generateEnhancedOcrFormat()`
3. Store both formats to Supabase Storage
4. Log byte sizes for both formats

### Step 4: Update Pass 0.5 to Load Y-Only Format
**File:** `apps/render-worker/src/pass05/progressive/session-manager.ts`
**Line:** 83

Change:
```typescript
// BEFORE:
const enhancedOcrText = await loadEnhancedOCR(supabase, patientId, shellFileId);

// AFTER:
const enhancedOcrText = await loadEnhancedOCR_Y(supabase, patientId, shellFileId);
```

### Step 5: Backward Compatibility
- If `enhanced-ocr-y.txt` doesn't exist, fall back to `enhanced-ocr.txt`
- This handles documents processed before this change

### Step 6: Build and Test
- Run `pnpm --filter @guardian/render-worker run build`
- Verify no TypeScript errors
- Deploy and test with a document upload

## Cost Impact Analysis

**142-page document example:**

| Metric | Current (XY) | After (Y-only) | Savings |
|--------|--------------|----------------|---------|
| Tokens/page | 5,079 | ~900 | 82% |
| Total input tokens | 721,247 | ~128,000 | 82% |
| Cost per document | ~$0.26 | ~$0.05 | $0.21 |

## Future Optimization Note

For the XY format (Pass 1/2), consider "Selective Coordinate Inclusion":
- Only add X-coordinates for lines that look like tables (multiple widely-spaced elements)
- Could reduce XY format size by ~40% for text-heavy documents
- Deferred until Pass 1/2 stress testing determines threshold and ROI

## Progress Tracker

- [x] Create implementation plan file
- [x] Step 1: Add `generateEnhancedOcrFormatYOnly()` to ocr-formatter.ts
- [x] Step 2: Add storage functions to ocr-persistence.ts (storeEnhancedOCR_Y, loadEnhancedOCR_Y, storeEnhancedOCR_XY, loadEnhancedOCR_XY)
- [x] Step 3: Update worker.ts to generate and store both formats
- [x] Step 4: Update session-manager.ts to load Y-only format
- [x] Step 5: Add backward compatibility fallback (loadEnhancedOCR_Y falls back to legacy enhanced-ocr.txt)
- [x] Step 6: Build and test - Build successful with no TypeScript errors
- [ ] Step 7: Deploy and verify token reduction (pending deployment)
