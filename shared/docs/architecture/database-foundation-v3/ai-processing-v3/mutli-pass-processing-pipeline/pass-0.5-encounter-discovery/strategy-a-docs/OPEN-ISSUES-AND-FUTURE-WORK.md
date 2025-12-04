# Pass 0.5 Strategy A - Open Issues & Future Work

**Last Updated:** 2025-11-24
**Source:** Extracted from RABBIT-HUNT-2025-11-20.md and Pass05-strategyA-TECHNICAL-DEBT.md
**Status:** Active tracking document for remaining issues and future enhancements

---

## CRITICAL Priority (Do Not Use in Production)

### ISSUE-001: Page Separation Analysis Prompt/Logic
**Severity:** CRITICAL - Feature completely broken
**Rabbit:** #23 (discovered 2025-11-23)
**Status:** 🟢 FIXED (2025-11-23, Commit 0471026)

**Original Issue:**
Page separation analysis was returning invalid split points or missing actual boundaries due to ambiguous prompt language.

**Resolution:**
Added strict forbidden split rules to AI prompt V11:
- NEVER mark split if sentence/paragraph/list/table continues from previous page
- NEVER mark split if content depends on previous page's section header
- Must scan every page for intra-page transitions
- Prefer small number of high-confidence splits over many uncertain ones

**Files Modified:** `aiPrompts.v11.ts`
**Commit:** 0471026 - feat(pass05): Add strict 80-character limit for marker_context fields

**Note:** While prompt constraints were added, production testing should verify the quality of split point detection before relying on this feature for Pass 1/2 batching.

---

## HIGH Priority (Before Pass 2 Development)

### ISSUE-002: Medical Identifiers Pipeline Incomplete
**Severity:** HIGH - MRN and patient IDs completely lost
**Rabbit:** #25 (discovered 2025-11-23)
**Status:** 🔴 UNFIXED

**Problem:**
Medical identifiers (MRN, patient IDs, etc.) are NOT being transferred from pending encounters to final encounters. Both identifier tables are **completely empty** despite MRNs present in source documents.

**Evidence:**
- 3-page file: AI extracted `{"identifier_type": "MRN", "identifier_value": "MD"}` but 0 rows in database
- 142-page file: Document contains MRN but 0 rows in `healthcare_encounter_identifiers`

**Root Cause Analysis Needed:**
Two possible failure points:
1. **Chunk Processor → Pending Identifiers:** AI outputs `medical_identifiers` but never written to `pass05_pending_encounter_identifiers`
2. **Reconciliation RPC → Final Identifiers:** `reconcile_pending_to_final` doesn't copy identifiers to `healthcare_encounter_identifiers`

**Investigation Steps:**
1. Check AI response raw data for `medical_identifiers` field
2. Verify `chunk-processor.ts` extracts medical_identifiers
3. Check if `database.ts` has function to insert into `pass05_pending_encounter_identifiers`
4. Verify `reconcile_pending_to_final` RPC copies identifiers to final table

**Impact:** Critical patient data loss - medical record numbers are essential for healthcare identity matching

---

### ISSUE-003: International Date Format Edge Cases
**Severity:** HIGH - Potential patient data loss for edge case formats
**Rabbit:** #24 (discovered 2025-11-23)
**Status:** 🟢 FIXED for DD/MM/YYYY, monitoring for other formats

**Completed Work (2025-11-23):**
- ✅ Smart DD/MM/YYYY parser implemented (`pending-reconciler.ts` lines 106-340)
- ✅ All 3 date fields normalized (DOB, encounter start, encounter end)
- ✅ Production tested: Vincent Cheers (DD/MM/YYYY) and Emma Thompson (text format) both working
- ✅ Metadata tracking functional (parseMethod, confidence, ambiguity flags)
- ✅ Complete documentation: `16-DATE-FORMAT-ARCHITECTURE-v2.md` and `17-ENCOUNTER-DATE-SYSTEM.md`

**Remaining Edge Cases to Monitor:**
- Abbreviated month names with ambiguous order (e.g., "03/Nov/1959" vs "Nov/03/1959")
- Two-digit years with uncertain century (e.g., "15/02/59" - 1959 or 2059?)
- Mixed format documents (some dates DD/MM/YYYY, others MM/DD/YYYY)
- Non-English date formats (other languages, different separators)

**Future Enhancement:**
- Add user-configurable locale preference (Australian vs US date parsing)
- Implement confidence-based manual review for ambiguous dates (like DOB sanity check system)

**Documentation:** See `16-DATE-FORMAT-ARCHITECTURE-v2.md` for complete implementation details

---

## MEDIUM Priority (Review/Optimize)

### ISSUE-004: Multi-Provider Reconciliation Strategy
**Severity:** MEDIUM - Working but may not be optimal
**Rabbit:** #26 (discovered 2025-11-23)
**Status:** ⚠️ REVIEW

**Current Behavior:**
When reconciling multiple pending encounters with different providers, the RPC uses **first pending's provider**.

**Example (142-page file):**
- Chunk 1: `provider_name: "Patrick Callaghan, DO"`
- Chunk 2: `provider_name: "Douglas S Prechtel, DO"`
- Chunk 3: `provider_name: "Mark John HOSAK MD"`
- Final encounter: `provider_name: "Patrick Callaghan, DO"` (first pending)

**Design Questions:**
1. Should we have a `primary_provider` column (first/most frequent) + `all_providers` array (complete list)?
2. How should we handle multi-provider hospital admissions (attending, consulting, etc.)?
3. Should provider selection be based on page count, confidence, or encounter section?

**User Feedback Needed:**
"An encounter may have zero, one or multiple providers within the same encounter such as a hospital admission. Should we do an array? How about for when cascading pendings are reconciled - how do we reconcile multiple provider names? I think we should just include all and make a string of them, throughout the entire pathway from ai prompt to final encounter."

**Recommendation:**
- Add `all_providers` TEXT[] column to `healthcare_encounters`
- Keep `provider_name` as primary/first provider
- Update AI prompt to extract multiple providers when present
- Reconciliation logic: Merge all unique provider names from cascade

---

## FUTURE Enhancements (Post-Launch)

### ISSUE-005: Retry Logic for Failed Jobs
**Severity:** MEDIUM - Reliability under load
**Source:** DEBT-004 from Technical Debt
**Status:** ⏭️ DEFERRED to Week 6+ / Post-Launch

**Problem:**
All database.ts functions throw errors immediately on failure. No retries for transient issues.

**Failure Scenarios:**
- Network timeouts (cloud → Supabase connection drops)
- Connection pool exhaustion (too many concurrent requests)
- Temporary database locks (concurrent updates to same row)
- Rate limiting (Supabase free tier limits)

**Current Behavior:**
```typescript
const { error } = await supabase.from('table').insert(data);
if (error) {
  throw new Error(`Failed: ${error.message}`);  // ❌ Immediate failure
}
```

**Impact:**
- Entire chunk processing fails on single transient error
- All work lost (AI cost, OCR processing, extracted data)
- User sees generic "processing failed" error

**Proposed Solution:**
Add exponential backoff retry wrapper:
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  // Exponential backoff: 1s, 2s, 4s
  // Retry on: network errors, timeouts, locks
  // Don't retry: validation errors, constraint violations
}
```

**Priority:** Medium (deferred until production volume justifies the complexity)

---

### ISSUE-006: Profile Classification System Unused
**Severity:** LOW - Feature exists but not populated
**Source:** Rabbit #27+ from Rabbit Hunt
**Status:** 🔴 INVESTIGATION NEEDED

**Observation:**
`profile_classification_audit` table is empty despite being part of Strategy A schema.

**Questions:**
1. Is profile classification supposed to run automatically after reconciliation?
2. Is there a separate post-processing step we haven't implemented?
3. Should this be integrated into Pass 0.5 or deferred to later pass?

**Next Steps:**
- Review profile classification design docs
- Determine if this is blocking for Pass 2 development
- If non-critical, defer to post-launch enhancement

---

### ISSUE-007: Reconciliation Log Table Always Empty
**Severity:** LOW - Audit trail gap
**Source:** Rabbit #27+ from Rabbit Hunt
**Status:** 🔴 INVESTIGATION NEEDED

**Observation:**
`pass05_reconciliation_log` table has never been populated.

**Questions:**
1. Is this table meant to be written to by reconciliation RPC?
2. Or is it for future manual reconciliation audit trail?
3. Do we need detailed reconciliation logs beyond what's in `pass05_pending_encounters.reconciled_at`?

**Trade-off:**
- **Pro:** Detailed audit trail of every reconciliation decision
- **Con:** Database write overhead, storage cost
- **Current:** Adequate audit trail via pending→final linkages and timestamps

**Recommendation:** Low priority - existing audit trail is sufficient for MVP

---

## Completed Issues (For Reference)

These issues were discovered during rabbit hunt but have since been fixed:

- ✅ **Rabbit #1-22:** All database schema mismatches, missing fields, and audit trail gaps fixed (Migrations 58-59)
- ✅ **Rabbit #23:** Page separation analysis prompt constraints added
- ✅ **Rabbit #24:** DD/MM/YYYY date parsing implemented and tested
- ✅ **Rabbit #25:** Date waterfall hierarchy for pseudo encounters (Migration 64-65)

See `archive-strategy-a/RABBIT-HUNT-2025-11-20-COMPLETED.md` for complete fix history.

---

## How to Use This Document

**When starting work on Pass 2:**
1. Review CRITICAL and HIGH priority issues - ensure none block Pass 2 development
2. Prioritize ISSUE-002 (medical identifiers) - essential for patient identity
3. Consider ISSUE-004 (multi-provider) - may affect Pass 2 clinical extraction design

**When planning post-launch improvements:**
1. Review FUTURE enhancements - prioritize by production usage patterns
2. Monitor for new edge cases in date parsing (ISSUE-003)
3. Evaluate retry logic (ISSUE-005) based on failure rate metrics

**When new issues discovered:**
1. Add to appropriate priority section
2. Include: Severity, Status emoji, Discovery date, Root cause, Impact
3. Update status as investigation/fixes progress
4. Move to "Completed Issues" section when resolved

---

**End of Open Issues Document**
