# Minimal Prompt A/B Test Instructions

## TEST COMPLETED 2025-10-06

**Result:** SUCCESS - Instruction dilution confirmed as root cause
**Outcome:** 41 entities extracted (vs 3 with complex prompt) - **13x improvement**
**Processing Time:** 70 seconds (acceptable for background jobs)
**Decision:** Use minimal prompt approach in production

---

## Purpose
Test if the complex 348-line prompt is causing under-extraction (currently 3/15+ entities).

## Setup Steps

### 1. Add Environment Variable in Render.com

1. Go to https://dashboard.render.com/web/srv-d2qkja56ubrc73dh13q0
2. Click **Environment** tab
3. Add new environment variable:
   - **Key:** `USE_MINIMAL_PROMPT`
   - **Value:** `true`
4. Click **Save Changes**
5. Render will auto-deploy the worker with this setting

### 2. Wait for Deployment

- Deployment takes ~2-3 minutes
- Check deployment status at the top of the Render dashboard
- Wait for "Live" status before testing

### 3. Test with Same Document

1. Upload the same immunization document (Patient Health Summary)
2. Wait for processing to complete (~60 seconds)
3. Check entity count in Supabase

### 4. Check Logs

```bash
render logs -r srv-d2qkja56ubrc73dh13q0 --limit 100 -o text --text "MINIMAL PROMPT"
```

Look for:
- `🧪 EXPERIMENTAL: Using MINIMAL list-first prompt`
- `🧪 MINIMAL PROMPT: AI returned X entities`
- `🧪 MINIMAL PROMPT: Extracted entities: ...`

## Success Criteria

### If Minimal Prompt Succeeds (9+ entities extracted):
- **Conclusion:** Instruction dilution confirmed as root cause
- **Next Step:** Refactor main prompt to be simpler and more focused
- **Action:** Remove complex taxonomy, simplify structure, elevate list rules

### If Minimal Prompt Fails (still <5 entities):
- **Conclusion:** Prompt complexity is NOT the issue
- **Next Step:** Pivot to two-pass extraction architecture (Option B)
- **Action:** Implement separate list itemization pass + classification pass

## Expected Results

**Minimal Prompt Test:**
- **Expected:** 12-15 entities minimum
  - Demographics: name, DOB, address, phones, record no. (5 entities)
  - Facility: name, address, phone (3 entities)
  - Immunizations: 9 separate entities with dates

**Current Complex Prompt:**
- **Actual:** 3 entities (1 name, 1 DOB, 1 immunization)
- **Missing:** 8 immunizations, addresses, phones, facility info

## ACTUAL TEST RESULTS (2025-10-06)

**Test 1:** 41 entities extracted in 75 seconds
**Test 2:** 41 entities extracted in 69.5 seconds
**Consistency:** 100% - both tests produced identical entity counts
**Cost:** $0.055 per document (GPT-4o with minimal prompt)

**Conclusion:** Minimal prompt approach is production-ready and should replace complex prompt.

## Cleanup After Test

PRODUCTION DECISION:
1. **KEEP** `USE_MINIMAL_PROMPT=true` in Render.com (proven superior)
2. Mark complex prompt as deprecated
3. Plan migration: Convert minimal prompt to primary implementation
4. Archive this test file once migration complete

COMPLETED ACTIONS:
- ✅ Test results documented in PASS1_TRIAGE_PLAN_2025-10-06.md
- ✅ Cost comparison analysis completed
- ✅ Performance validation: 70s processing time acceptable

## Related Files

- Test prompt: `apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts`
- Integration: `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (lines 226-238)
- Plan: `PASS1_TRIAGE_PLAN_2025-10-06.md`
