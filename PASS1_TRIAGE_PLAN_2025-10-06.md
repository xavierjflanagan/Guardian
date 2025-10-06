## Pass 1 Triage: Analysis, Assessment, and Plan (2025-10-06)

### What's going wrong (root causes)
- **Oversized/complex inputs:** base64 image + verbose prompt + OCR context → slow/length issues, under-extraction.
- **Instruction dilution:** list extraction rules buried in 348-line prompt; model still summarizes lists to single item.
- **Single-pass "do everything" prompt:** increases cognitive load and lowers recall.
- ✅ **FIXED: Minor integration bugs:** JPEG-encoded image sent with original MIME; token/cost estimate based on original size.

### Immediate fixes (COMPLETED ✅)
- ✅ Fixed MIME and estimates in `Pass1EntityDetector`:
  - ✅ Send optimized data URL as `image/jpeg`.
  - ✅ Use optimized image size for `image_tokens` and `cost_estimate`.
  - ✅ Added PDF guard (skip downscaling for non-images)
- ✅ **VERIFIED in Render.com logs (2025-10-06 01:36:54):**
  - ✅ `[Pass1] Downscaling image before AI processing...` - CONFIRMED
  - ✅ `[Pass1] Image optimized: 69190 → 44399 bytes (35.8% reduction)` - CONFIRMED
  - ✅ `[Pass1] AI returned 3 entities` - Slight improvement from 2, but still failing
  - **Conclusion:** Downscaling works, but entity count still catastrophically low (3 vs 12-15 expected)

### Prompt-level adjustments (COMPLETED ✅ - BUT INEFFECTIVE)
- ✅ **Already implemented in pass1-prompts.ts:**
  - ✅ LIST HANDLING RULES section added (lines 110-119)
  - ✅ "Always emit uncertain items; if confidence < 0.7 set requires_manual_review=true" (line 107)
  - ✅ Removed duplicate OCR text block (Batch 1 High-Priority Fix #2)
  - ✅ OUTPUT SIZE SAFEGUARDS added (120-char truncation, line 122-125)
- **RESULT:** Still only 3 entities extracted (should be 15+)
- **CONCLUSION:** Prompt tweaking is NOT solving the problem

### Pivot the extraction strategy (RECOMMENDED NEXT STEPS)

**Option A: Compact List-First Prompt (QUICK TEST - 30 min)**
- Create minimal test prompt: "Extract EVERY list item as separate entities. No summarization."
- Strip all taxonomy, examples, complex instructions
- Test on same immunization page
- **Success criteria:** 9+ immunization entities extracted
- **If successful:** Confirms instruction dilution is root cause
- **If still fails:** Move to Option B or C

**Option B: Two-Pass Extraction (2-3 hours)**
- **Pass A:** List itemization only (vision+OCR)
  - Single task: "Identify all list items with bounding boxes"
  - Returns: `[{text, bbox, page}]` - minimal JSON
- **Pass B:** Per-item classification
  - For each item: run small prompt to classify subtype
  - Parallel API calls for speed
- **Advantages:** Lower cognitive load, higher recall, parallel processing
- **Trade-off:** More API calls (but cheaper overall if each call is simpler)

**Option C: Region/Page Chunking (3-4 hours)**
- Use OCR spatial data to detect list blocks (coordinate clustering)
- Call vision API per region/block
- Reduces summarization risk (AI sees isolated list, not full page)
- **Advantages:** Highest accuracy for complex documents
- **Trade-off:** Most complex implementation

### Structural improvements (MEDIUM-TERM - 2-3 hours)
- **Base64 payload removal:**
  - Enqueue only `storage_path`, `mime_type`, `size`, checksum
  - Worker downloads from Supabase Storage on demand
  - Downscales before OpenAI (already implemented locally)
  - **Benefit:** Reduces job_queue bloat, faster enqueue
- **Edge Function simplification:**
  - Keep "enqueue-only" (no OCR/AI in Edge Function)
  - Move ALL processing to Render worker
  - **Benefit:** Better timeout control, easier debugging
- **Retry/backoff improvements:**
  - Add compact-output fallback on `finish_reason = "length"`
  - Per-call timeout (120-180s) separate from worker timeout
  - **Already implemented:** Worker timeout = 1800s (30min)

### Acceptance checks (UPDATED)
- ✅ **DONE:** Logs show optimized image usage and correct MIME (verified 2025-10-06 01:36:54)
- ✅ **DONE:** Per page runtime ~60s on gpt-4o (was 16+ min on GPT-5)
- ✅ **DONE:** Image downscaling working (35.8% reduction confirmed in production logs)
- ❌ **FAILING:** On the sample "Patient Health Summary" page, extract all clearly visible items:
  - **Patient demographics (healthcare_context):**
    - Name: "Xavier Flanagan"
    - DOB: "25/04/1994"
    - Address: "505 Grasslands Rd, Boneo 3939"
    - Record number/identifier: "MD" (from "Record No.: MD")
    - Phones: Home "5988 6686", Mobile "0488180888" (Work phone may be blank)
  - **Facility/clinic (healthcare_context):**
    - Facility name: "South Coast Medical"
    - Facility address: "2841 Pt Nepean Rd, Blairgowrie 3942"
    - Facility phone: "59888604" (if present in page header)
  - **Immunisations (clinical_event): 9 separate entities with dates and names:**
    - 11/04/2010 Fluvax (Influenza)
    - 02/04/2011 Fluvax (Influenza)
    - 03/10/2011 Vivaxim (Hepatitis A, Typhoid)
    - 03/10/2011 Dukoral (Cholera)
    - 14/11/2014 Stamaril (Yellow Fever)
    - 14/11/2014 Havrix 1440 (Hepatitis A)
    - 14/11/2014 Typhim Vi (Typhoid)
    - 06/01/2017 Boostrix (Pertussis, Diphtheria, Tetanus)
    - 11/01/2017 Engerix-B Adult (Hepatitis B)
    - 19/03/2020 Fluad (Influenza)
    - Note: If model deduplicates the two Fluvax entries incorrectly, this should be flagged.
  - Optional metadata:
    - Printed on: "2nd June 2025" (document metadata)
  - Allergies/adverse reactions: "Nil known" may be logged as a negative finding (optional depending on schema policy).
  - Family/Social/Occupational/Histories marked "Not recorded" should not prevent extraction of other items.
  - **Current:** Only 3 entities (1 name, 1 DOB, 1 immunization)
  - **Expected minimum:** Demographics (name + DOB + address + phones + record no.) + facility (name + address + phone) + 9 immunisations = at least 12–15 entities on this page
- **BLOCKING:** Under-extraction persists despite all prompt improvements

### Why this plan will work
- **Root cause identified:** Instruction dilution in 348-line prompt
- **Quick validation:** Option A tests minimal prompt (30 min) to confirm hypothesis
- **Long-term solution:** Option B (two-pass) or Option C (chunking) fundamentally changes extraction architecture
- **Already optimized:** Downscaling implemented, MIME fixed, costs accurate
- **Next blocker to remove:** List extraction failure

---

## RECOMMENDED IMMEDIATE ACTION

**Step 1: Check Render.com Logs (COMPLETED ✅)**
- ✅ Verified downscaling running in production (2025-10-06 01:36:54)
- ✅ Image optimization confirmed: 69,190 → 44,399 bytes (35.8% reduction)
- ✅ Entity count: 3 (improved from 2, but still failing - need 12-15 minimum)
- **Timeline of attempts:**
  - `21:16:09` - 2 entities (before downscaling)
  - `00:50:14` to `01:11:12` - 2 entities (GPT-4o without downscaling)
  - `01:36:54` - **3 entities (with downscaling)** ← Latest upload
- **Conclusion:** Image optimization working, but prompt complexity is the blocker

**Step 2: Test Option A - Minimal List-First Prompt (IN PROGRESS - 30 min)**
- Create ultra-simple prompt focused ONLY on list extraction
- Test on same immunization document
- Compare entity count (current: 3, expected: 11+)

**Step 3: Decision Point**
- **If Option A succeeds (9+ immunizations):** Instruction dilution confirmed, refactor main prompt
- **If Option A fails (still <5 entities):** Pivot to Option B (two-pass) or investigate vision API limitations

**Step 4: Long-term Architecture (if Option A fails)**
- Implement two-pass extraction (Option B)
- Consider region chunking (Option C) for complex multi-page documents


