# Minimal Prompt A/B Test Instructions

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

## Cleanup After Test

Once test is complete:
1. Remove `USE_MINIMAL_PROMPT` environment variable from Render.com
2. Redeploy to return to standard prompt
3. Document findings in PASS1_TRIAGE_PLAN_2025-10-06.md

## Related Files

- Test prompt: `apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts`
- Integration: `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (lines 226-238)
- Plan: `PASS1_TRIAGE_PLAN_2025-10-06.md`
