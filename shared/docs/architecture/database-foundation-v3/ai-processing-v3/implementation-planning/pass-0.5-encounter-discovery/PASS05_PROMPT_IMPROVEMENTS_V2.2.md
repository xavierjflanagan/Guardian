# Pass 0.5 Prompt Improvements - Future Enhancements (Post-v2.2)

**IMPORTANT VERSION CLARIFICATION:**
- **Prompt v2.2** (Document Header vs Metadata) was IMPLEMENTED on Nov 2, 2025 11:00 PM
- **This document** proposes ADDITIONAL enhancements beyond v2.2 (future appointment references, bbox awareness)
- This document should be considered "v2.3 PROPOSED" or "Future Enhancements DRAFT"

**Date:** November 3, 2025
**Purpose:** Address nested encounter references and bbox accuracy requirements
**Review Type:** End-to-end fresh analysis
**Status:** PROPOSED - Not yet implemented. aiPrompts.ts is currently at v2.2 (metadata distinction).

---

## UPDATE: Test 06 Frankenstein - Current Boundary Detection Failure (Nov 3, 2025)

**Test Run:** Job Queue ID `2bb36794-1d5a-4a75-9092-be5a6905f8c3`
**Prompt Version Used:** v2.2 (Document Header vs Metadata distinction)
**Model:** GPT-5-2025-08-07
**OCR Quality:** 97.1% confidence, pages correctly ordered 1-20

### Expected vs Actual Results

**Expected Boundaries:**
- Encounter 1: Pages 1-13 (Progress Note, Oct 27, 2025, PA-C Ehret, Interventional Spine & Pain PC)
- Encounter 2: Pages 14-20 (Emergency, June 22, 2025, Dr. Tinkham, Piedmont Healthcare)

**Actual Results:**
- Encounter 1: Pages 1-14 (WRONG - included Emergency page 14)
- Encounter 2: Pages 15-20 (WRONG - started one page late)

### Root Cause Analysis

**OCR Data Quality:** EXCELLENT - No issues found
- Page ordering: Perfect (1-20 sequence maintained)
- Page 13 end text: Clear signature block for PA-C Ehret, Oct 27
- Page 14 start text: Clear "Encounter Summary (October 30, 2025, 1:53:08PM -0400)" header
- Boundary markers captured correctly: Provider change, facility change, date change, patient ID system change

**Prompt Instructions:** PRESENT BUT IGNORED
- v2.2 includes explicit Pattern D example (lines 165-172) matching this exact scenario
- Warns: "Don't be misled by generation date (Oct 30) being close to previous encounter (Oct 27)"
- Model received correct OCR text with all boundary markers
- Model still assigned page 14 to first encounter despite explicit instructions

### Why The Model Failed Despite v2.2 Instructions

**Hypothesis:** The model was confused by temporal proximity (Oct 27 → Oct 30 generation date) and ignored:
1. "Encounter Summary" header (should be VERY STRONG SIGNAL per prompt line 130)
2. Provider change (Ehret → Tinkham)
3. Facility change (Interventional Spine → Piedmont Healthcare)
4. Encounter date change (Oct 27 → June 22)
5. Patient ID system change (523307 → PDHZTKZ8QTL9KKT)

**Conclusion:** v2.2 prompt instructions are comprehensive but the GPT-5 model is not following them. This suggests:
- Prompt length (490 lines) may cause instruction compliance issues
- Critical rules need stronger emphasis/positioning
- Or model-level instruction following problem with GPT-5

### Proposed Solutions

See main recommendations below. Key insight: Adding new features (bbox, spatial awareness) won't fix this if the model ignores existing explicit instructions.

---

## Executive Summary

**NOTE:** This document was originally written analyzing v2.1. Since then, v2.2 (Document Header vs Metadata distinction) has been implemented. The analysis below refers to gaps that existed in v2.1.

**Original Prompt Analysis (v2.1 → v2.2 transition):**
The v2.1 prompt handled document boundaries well, but had THREE critical gaps (now partially addressed by v2.2):

1. **Missing Future Appointment Reference Guidance** - No clear rules for when "Next appointment with Dr. X" is a scheduling note vs. separate encounter
2. **No Bbox/Spatial Data Requirements** - Prompt never mentions bounding boxes or spatial coordinates
3. **Response Schema Has No Bbox Field** - JSON examples don't include bbox data at all

**Impact on Test 06 Frankenstein Case:**
- "Next Appt: Dr. Neckman 11/11/2025" on Page 3 right column confused GPT-5
- Without bbox awareness, AI couldn't understand this was a sidebar, not main content
- Combined with OCR multi-column bug, resulted in hallucinated third encounter

---

## Issue 1: Missing Future Appointment Reference Guidance

### Current State

**What the prompt says about planned encounters (Lines 197-203):**
```
### Planned Encounter (Future Scheduled)
Future appointment or referral with specific date and provider/facility:
- "Referral to cardiologist Dr. Williams, appointment 2024-05-20"
- "Scheduled surgery at City Hospital, 2024-04-15"

**Encounter Types:** `planned_specialist_consultation`, `planned_procedure`, `planned_gp_appointment`
**Set:** `isRealWorldVisit: false` (hasn't happened yet)
```

**What the prompt says about historical mentions (Lines 273-280):**
```
**DO NOT create separate encounters for historical mentions:**
- Brief mentions: "Patient previously seen by GP for chest pain"
- Embedded references: "Discharge summary notes initial GP visit on 2024-01-10..."

**ONLY create separate encounter if:**
- Full distinct document with clear boundaries
- Different formatting/letterhead
- OR: Real-world visit with date + provider/facility + distinct page range
```

### The Gap

**Asymmetry:** Clear guidance for historical mentions, NO parallel guidance for future mentions.

**Real-world impact (Test 06):**
- Page 3 has sidebar: "Next Appt: Provider Name: David W Neckman, MD. Date: 11/11/2025, 10:15 AM. Procedure: Bilateral sacroiliac joint injection"
- This is a **scheduling reference** within the Progress Note document
- It should NOT create a separate `planned_procedure` encounter
- But prompt doesn't clarify this distinction

### Proposed Addition

**Insert after Line 203 (after planned encounter section):**

```markdown
### CRITICAL: Future Appointment References vs. Separate Planned Encounters

**Common Pattern:** Medical documents often mention future appointments within the document body or sidebars. These are scheduling references, NOT separate encounters.

**Scheduling Reference (DO NOT create separate encounter):**
- Brief mention in sidebar or "Plan" section
- Format: "Next appointment: Dr. Smith on [date]" or "Follow-up scheduled with [provider]"
- No distinct page range or separate document
- Part of the parent encounter's care plan

**Examples:**
- "Plan: Follow-up with cardiology in 2 weeks, Dr. Jones" (within Progress Note)
- Sidebar: "Next Appt: Dr. Neckman 11/11/2025 10:15 AM for SIJ injection" (on same page as clinical note)
- "Patient scheduled for CT scan on 2024-05-15 at Radiology Dept" (mentioned in discharge plan)

**Separate Planned Encounter (DO create separate encounter):**
- Referral letter on separate page(s) with distinct formatting
- Full appointment details as primary content (not sidebar mention)
- Different letterhead or clear document boundary
- Contains procedural details, pre-op instructions, or comprehensive referral notes

**Examples:**
- Pages 5-7: "REFERRAL LETTER - Procedure: Bilateral SIJ Injection, Provider: David W Neckman MD, Date: 11/11/2025, Pre-procedure Instructions: [details]"
- Separate appointment confirmation letter with full clinical context

**Decision Rule:**
If the future appointment mention is:
- In a sidebar/margin of another document → Scheduling reference (part of parent encounter)
- Brief mention in "Plan" or "Follow-up" section → Scheduling reference
- Full separate document with distinct pages → Separate `planned_*` encounter

**Apply the same "distinct document" test:**
- Would you physically separate this into a different pile of papers?
  - NO → Scheduling reference (part of parent)
  - YES → Separate planned encounter
```

---

## Issue 2: No Bbox/Spatial Data Requirements

### Current State

**Prompt Input Interface:**
```typescript
export interface PromptInput {
  fullText: string;        // Concatenated OCR text (flat string)
  pageCount: number;       // Total pages
  ocrPages: OCRPage[];     // Page-level OCR data WITH bbox info
}
```

**What's passed to AI:**
- `fullText`: Concatenated string (loses spatial information)
- `ocrPages`: Contains bbox data but prompt doesn't tell AI what to do with it

**Current response schema (Line 383-402):**
```json
{
  "encounterType": "discharge_summary",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2024-03-10", "end": "2024-03-15"},
  "provider": "Dr Jane Smith",
  "facility": "St Vincent's Hospital",
  "pageRanges": [[1, 5]],           // Only page numbers, no bbox!
  "confidence": 0.95,
  "extractedText": "Discharge Summary..."
}
```

### The Gap

**No bbox field in response schema** - AI is not asked to provide spatial coordinates for encounters.

**Why this matters:**
1. **Future phases need spatial awareness** - Pass 2 (clinical extraction) will need to know which parts of pages contain which encounter
2. **Multi-column layouts** - Without bbox, can't distinguish sidebar content from main content
3. **Quality validation** - Can't verify encounter boundaries match visual layout
4. **Nested reference tracking** - Can't identify and exclude sidebar scheduling mentions from main encounter bbox

### Design Decision Required

**Question for user:** What bbox data should the AI provide?

**Option A: Page-level only (current)**
- `pageRanges: [[1, 5]]` - Just page numbers
- Pros: Simple, AI already understands this
- Cons: No spatial awareness within pages

**Option B: Add document-level bbox per encounter**
- Keep `pageRanges: [[1, 5]]`
- Add `boundingBoxes: [{"page": 3, "x": 50, "y": 100, "width": 750, "height": 1100}]`
- Pros: Spatial awareness, can exclude sidebars
- Cons: AI would need to analyze `ocrPages` structure, more complex

**Option C: Hybrid - bbox only when needed**
- Most encounters: just `pageRanges`
- Complex cases (multi-column, nested refs): add `spatialNotes: "Main content excludes right column sidebar with future appointment"`
- Pros: Flexible, documents uncertainty
- Cons: Inconsistent data structure

**Recommendation:** Defer detailed bbox extraction to future pass, but add spatial awareness guidance NOW:

### Proposed Addition

**Insert after Line 360 (in "For each encounter, extract" section):**

```markdown
6. **Spatial awareness (when applicable):**
   - If document has multi-column layout, note which columns contain the encounter
   - If encounter has nested references (sidebar appointments, margin notes), document their location
   - Include in `extractedText` field: mention if content excludes sidebars/margins
   - Example: "extractedText": "Progress Note (main column only, excludes right sidebar with future appointment)"
```

**Update Example 2 (Line 383-402):**
```json
{
  "encounterType": "discharge_summary",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2024-03-10", "end": "2024-03-15"},
  "provider": "Dr Jane Smith",
  "facility": "St Vincent's Hospital",
  "pageRanges": [[1, 5]],
  "confidence": 0.95,
  "extractedText": "Discharge Summary - Admission for cholecystectomy...",
  "spatialNotes": null  // Optional: "Main content spans full page width" or "Excludes right column sidebar"
}
```

---

## Issue 3: Prompt Doesn't Guide AI on Using OCR Page Data

### Current State

**The prompt passes `ocrPages` but never explains what it contains or how to use it.**

Prompt says (Line 456): "## Document Text (OCR Output)" then just dumps `${input.fullText}`.

**No mention of:**
- That `ocrPages` array contains page-by-page structured data
- That pages have blocks, paragraphs, words with bounding boxes
- How to identify multi-column layouts
- How to detect sidebar vs. main content

### Proposed Addition

**Insert before Line 456 (before "## Document Text" section):**

```markdown
## OCR Data Structure (For Spatial Analysis)

You have access to both flat text and structured OCR data:

1. **fullText**: Concatenated string (reading order may be incorrect for multi-column pages)
2. **ocrPages**: Array of page objects with spatial structure (bounding boxes, blocks, paragraphs)

**When to use OCR page structure:**
- Multi-column layouts (text in sidebars, margins, or columns)
- Identifying nested references (future appointment boxes, margin notes)
- Validating encounter boundaries match visual layout
- Distinguishing header/footer content from main body

**Multi-column detection hints:**
- If text mentions "right column", "sidebar", "margin notes" - document has spatial layout
- If you see appointment info that seems out of context - might be sidebar content
- Provider names appearing out of chronological order - possible multi-column reading issue

**Current limitation:** OCR reading order may not match visual reading order for multi-column pages. If you detect this issue, note it in your response.
```

---

## Additional Improvements (General)

### Improvement 1: Clarify "Core Tenets" for Real Encounters

**Issue:** The term "core tenets" is used in user feedback but not explicitly defined in prompt.

**Current (Line 185-194):**
```
### Real-World Encounter (Timeline-Worthy)
A completed past visit that meets BOTH criteria:
1. **Specific Date**: YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility**: Named provider OR specific facility OR clinical setting
```

**Proposed addition (after Line 194):**
```markdown
**These are the "core tenets" of a real encounter:**
- Specific date (not "recently" or "last month")
- Named provider OR specific facility
- Distinct clinical event (not just a mention)
- Sufficient detail to place on patient timeline

**Mentions lacking core tenets → Not separate encounters:**
- "Recently saw GP" - No specific date
- "Follow-up scheduled" - No distinct document
- "Previous admission to hospital" - Brief historical reference
```

### Improvement 2: Strengthen Document Unity Decision Tree

**Issue:** The decision tree (Lines 303-321) is good but could be clearer about the Neckman scenario.

**Current (Lines 303-321):**
Decision tree for administrative summaries - focuses on "Patient Health Summary" documents.

**Proposed expansion:**
Add decision tree for **clinical documents with nested references**.

**Insert after Line 321:**

```markdown
## Decision Tree for Clinical Documents with Future References

When you see a clinical document (Progress Note, Consultation) that mentions future appointments:

1. Is the future appointment on separate page(s) with distinct formatting?
   → YES: Consider as separate `planned_*` encounter
   → NO: Continue to step 2

2. Is the future appointment in a sidebar, margin, or "Plan" section of the main document?
   → YES: Scheduling reference (part of parent encounter)
   → NO: Continue to step 3

3. Does the future appointment have full procedural details and pre-op instructions?
   → YES: Might be embedded referral (rare) - evaluate if it occupies distinct page range
   → NO: Scheduling reference

4. Default rule: When uncertain, treat future appointment mentions as scheduling references (part of parent encounter), not separate encounters.

**Example (Test 06 scenario):**
- Page 3: Progress Note (main content) + Right sidebar ("Next Appt: Dr. Neckman 11/11/2025")
- Decision: Sidebar is scheduling reference → ONE encounter (Progress Note pages 1-13)
- Do NOT create separate "planned_procedure" encounter for Neckman appointment
```

### Improvement 3: Add Confidence Scoring Guidance for Multi-Column Cases

**Current (Lines 343-347):**
```
### 2. Confidence Scoring
Your `confidence` should reflect:
- HIGH (0.85-1.0): Clear dates, provider, facility, distinct page boundaries
- MEDIUM (0.65-0.85): Some missing info but clearly separate document
- LOW (0.40-0.65): Ambiguous boundaries or missing key info
```

**Proposed addition:**
```markdown
- **Multi-column layout detected:** Reduce confidence by 0.05-0.10 (OCR reading order may be incorrect)
- **Nested references present:** Note in extractedText, maintain confidence if boundary is clear
- **Sidebar content unclear:** Reduce confidence to MEDIUM (0.70-0.80) range
```

---

## Summary of Proposed Changes

### Critical Changes (Must Have)

1. **Add Future Appointment Reference Guidance** (after Line 203)
   - Clear distinction between scheduling references vs. separate planned encounters
   - Examples: sidebar mentions vs. full referral letters
   - Decision rule based on "distinct document" test

2. **Add Spatial Awareness Field** (Line 360 update + example updates)
   - Optional `spatialNotes` field in response schema
   - Guidance to note multi-column layouts and nested references
   - Update examples to show usage

3. **Add OCR Data Structure Section** (before Line 456)
   - Explain what `ocrPages` contains
   - When to consider spatial layout
   - Multi-column detection hints

### Important Changes (Should Have)

4. **Clarify "Core Tenets"** (after Line 194)
   - Explicit definition of what makes a real encounter
   - Examples of mentions lacking core tenets

5. **Add Clinical Document Decision Tree** (after Line 321)
   - Specific guidance for Progress Notes with future appointments
   - Step-by-step evaluation process

6. **Update Confidence Scoring** (Line 343-347 expansion)
   - Guidance for multi-column cases
   - How to handle spatial uncertainty

---

## Test 06 Validation

**How these changes would fix Test 06:**

**Before (Current v2.1):**
- GPT-5 sees "Next Appt: Dr. Neckman 11/11/2025" appearing after Emergency header (due to OCR bug)
- Prompt doesn't clarify if this is a scheduling reference or separate encounter
- No spatial awareness guidance
- Result: GPT-5 creates hallucinated third encounter

**After (Proposed v2.2 + OCR sorting fix):**
- OCR spatial sorting fixes text order (Neckman appears with Page 3 content)
- Prompt explicitly says sidebar appointments = scheduling references (not separate encounters)
- AI notes "Page 3 has right sidebar with future appointment mention" in spatialNotes
- Result: 2 encounters detected (correct)

---

## Implementation Priority

**Phase 1 (Immediate):**
1. Add future appointment reference guidance (Issue 1)
2. Add spatial awareness notes to response schema (Issue 2 - simple version)

**Phase 2 (After OCR sorting implemented):**
3. Add OCR data structure section (Issue 3)
4. Test with fixed OCR ordering on Test 06
5. Validate confidence scoring adjustments

**Phase 3 (Future enhancement):**
6. Consider full bbox extraction in response schema
7. Integrate bbox validation in Pass 2 clinical extraction

---

## Open Questions for User

1. **Bbox data scope:** Should Pass 0.5 return detailed bounding boxes, or just spatial notes for now?
2. **Response schema change:** Is adding `spatialNotes` field acceptable, or prefer different approach?
3. **Confidence scoring:** Should multi-column detection always reduce confidence, or only when uncertain?
4. **Testing priority:** Fix OCR sorting first, then re-test with v2.2 prompt?

---

**Document Status:** DRAFT - Awaiting user review
**Next Steps:** Apply changes to `aiPrompts.ts` after user approval
**Testing Plan:** Re-run Test 06 with v2.2 + OCR sorting fix
