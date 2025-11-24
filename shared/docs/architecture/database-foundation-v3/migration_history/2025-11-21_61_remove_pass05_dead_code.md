# Code Cleanup: Remove Pass 0.5 Dead Code (Standard Mode Path)
**Date:** 2025-11-21
**Type:** Code cleanup (no database changes)
**Related Migration:** Migration 60 (prerequisite)

## PROBLEM

The file `apps/render-worker/src/pass05/index.ts` contains **zombie code** (lines 113-178) that:

1. **Never executes** - Strategy A (universal progressive) is the ONLY path for ALL documents
2. **Creates duplicate/invalid data** if somehow triggered:
   - Creates an `ai_processing_sessions` record AFTER Strategy A already completed
   - Inserts a `pass05_encounter_metrics` record with incorrect data (0 encounters detected)
   - The metrics record would conflict with the real one created by `update_strategy_a_metrics` RPC
3. **Was dangerous before Migration 60** - Would have crashed due to FK constraint violation
4. **Is now safe but misleading** - After Migration 60, it won't crash but creates confusing duplicate records

## ROOT CAUSE

**Historical context:**
- Original design had "Standard Mode" (direct processing) vs "Progressive Mode" (chunked processing)
- Standard Mode created `ai_processing_sessions` and `pass05_encounter_metrics` records
- Strategy A (V11) made progressive mode UNIVERSAL - Standard Mode path was abandoned
- The Standard Mode code in `index.ts` was left behind as dead code

**Evidence it never executes:**
```typescript
// encounterDiscovery.ts line 46
console.log(`[Pass 0.5] STRATEGY A (v11): Universal progressive mode for ${input.pageCount} pages`);

// ALL documents go through processDocumentProgressively()
const progressiveResult = await processDocumentProgressively(...);
```

**Code flow:**
```
runPass05()
  → discoverEncounters() (encounterDiscovery.ts)
    → processDocumentProgressively() (session-manager.ts)
      → [chunks processed, pendings created, reconciliation runs]
      → Returns to discoverEncounters()
    → Returns empty encounters array to runPass05()
  → [DEAD CODE at line 113 is NEVER reached because encounterResult.encounters is always []]
```

## SOLUTION

**Remove lines 113-178** from `apps/render-worker/src/pass05/index.ts`:
- HOTFIX 2A: `ai_processing_sessions` insert (lines 113-137)
- HOTFIX 2A: `pass05_encounter_metrics` insert (lines 139-178)

**Why safe to remove:**
- Strategy A never returns encounters in `encounterResult.encounters` (always `[]`)
- The code block checking `encounterResult.encounters` length would skip this anyway
- Migration 60 already fixed the architectural coupling issue
- No other code references this pattern (verified via grep)

## AFFECTED FILES

- `apps/render-worker/src/pass05/index.ts` (lines 113-178 removal)

## VERIFICATION STEPS

1. **Before removal:** Verify encounterResult.encounters is always `[]`
2. **After removal:** Run full test document upload
3. **Confirm:** Metrics still populate correctly via `update_strategy_a_metrics` RPC
4. **Confirm:** No duplicate `ai_processing_sessions` or `pass05_encounter_metrics` records

## IMPACT ANALYSIS

**What this code was trying to do:**
- Create `ai_processing_sessions` record for multi-pass tracking
- Create `pass05_encounter_metrics` record for cost/performance tracking

**Why it's no longer needed:**
- `ai_processing_sessions`: Worker creates this BEFORE Pass 0.5 in `worker.ts:1162` (still needed for multi-pass pipeline)
- `pass05_encounter_metrics`: Created by `update_strategy_a_metrics` RPC during reconciliation (Migration 60 made it self-healing)

**Side effects of removal:**
- None - code never executes
- Cleaner codebase, less confusion for future developers

## ROLLBACK

If somehow this code was needed (extremely unlikely):
```typescript
// Restore lines 113-178 from commit 173e202
git show 173e202:apps/render-worker/src/pass05/index.ts
```

But rollback should never be needed because:
1. Code never executes (Strategy A is universal)
2. Migration 60 already fixed the architectural issue
3. Metrics creation is handled by RPC during reconciliation

## RELATED DOCUMENTATION

- Migration 60: Decoupled Pass 0.5 metrics from `ai_processing_sessions`
- Strategy A Architecture: `encounterDiscovery.ts` (lines 1-9)
- POST-MIGRATION-57-ISSUES.md: Analysis of zombie code problem

## EXECUTION STATUS

- [X] Code removed from `index.ts` (lines 113-178 deleted)
- [X] TypeScript build successful (no errors)
- [X] No other references to HOTFIX 2A pattern (verified via grep)
- [ ] Test document uploaded successfully (pending Render.com maintenance)
- [ ] Metrics populate correctly (pending test)
- [ ] No duplicate records created (pending test)
- [X] Changes committed and pushed

**Executed:** 2025-11-21 (code removal only, test pending)
