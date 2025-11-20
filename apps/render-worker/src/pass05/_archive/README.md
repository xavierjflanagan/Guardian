# Pass05 Legacy Code Archive

**Date Archived:** 2025-11-20
**Reason:** Strategy A (v11) universal progressive mode is now the only supported path

## What's Archived Here

This directory contains legacy code that was replaced by **Strategy A (v11)** - a universal progressive processing pipeline that works for all document sizes (1-1000+ pages).

### Legacy Prompts (`legacy-prompts/`)

**Why archived:**
Strategy A uses only `aiPrompts.v11.ts`. These older prompts are no longer called by any active code path.

**Files:**
- `aiPrompts.ts` (v2.4) - Original baseline prompt
- `aiPrompts.v2.7.ts` - Phase 1 optimizations (token reduction)
- `aiPrompts.v2.8.ts` - Further optimizations
- `aiPrompts.v2.9.ts` - Latest v2.x optimizations
- `aiPrompts.v10.ts` - Used by legacy standard mode only (NOT Strategy A)

**Note:** The version string `v10` in encounterDiscovery.ts was just a routing flag, not a prompt file. Strategy A always used `aiPrompts.v11.ts`.

### Legacy Standard Mode (`legacy-standard-mode/`)

**Why archived:**
Strategy A processes ALL documents progressively. The old "standard mode" (single-shot processing for ≤100 pages) is no longer used.

**Files:**
- `manifestBuilder.ts` - Single-shot encounter processing and database writes

### Legacy Documentation (`prompt-versions-and-improvements/`)

**Why archived:**
Historical documentation about v2.4 → v2.9 prompt evolution. Useful for reference but no longer maintained.

**Contents:**
- `CURRENT_VERSION` - Showed 'v2.9' (now outdated)
- `README.md` - Prompt evolution history
- `production/` - Archived prompt versions
- `historical/` - v2.4 to v2.7 migration notes

## Current Active Code (as of 2025-11-20)

**Single Code Path:**
```
encounterDiscovery.ts (simplified entry point)
  ↓
progressive/session-manager.ts
  ↓
progressive/chunk-processor.ts (uses aiPrompts.v11.ts)
  ├→ progressive/cascade-manager.ts
  ├→ progressive/coordinate-extractor.ts
  ├→ progressive/identifier-extractor.ts
  └→ progressive/handoff-builder.ts
  ↓
progressive/database.ts (batch inserts to pass05_pending_encounters)
  ↓
progressive/pending-reconciler.ts (reconcile after all chunks)
  ↓
healthcare_encounters (final table)
```

**Active Prompt:** `aiPrompts.v11.ts` only

**Infrastructure (unchanged):**
- `providers/` - AI provider abstraction (OpenAI, Google)
- `models/` - Model selection logic

## Can This Be Deleted?

**Recommended:** Keep archive for 2-3 months of stable v11 production

**Delete if:**
- No production issues found with v11 after extended testing
- No need to roll back to legacy behavior
- Historical reference no longer needed

**Before deleting, verify:**
- All import statements referencing archived files have been removed
- TypeScript compilation passes
- Production deployments stable for 60+ days
