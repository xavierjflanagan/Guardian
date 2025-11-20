# Cross-Check Report: v2.7 vs Original aiPrompts.ts

**Date:** 2025-11-05
**Purpose:** Identify any important concepts, instructions, or guidance missing from v2.7 optimization
**Original:** `/apps/render-worker/src/pass05/aiPrompts.ts` (v2.4 - 697 lines)
**Optimized:** `PROMPT_v2.7_OPTIMIZED.ts` (374 lines)
**Risk:** Missing critical instructions could cause test failures

---

## Executive Summary

The v2.7 optimization successfully condensed the prompt from ~4,500 tokens to ~4,000 tokens, BUT **5 CRITICAL items were removed** that could affect performance on complex documents (especially Frankenstein files). Additionally, **8 important items** were simplified or removed.

**Recommendation:** Add back the 5 critical items before testing.

---

## CRITICAL MISSING ITEMS (High Risk)

### 1. Boundary Detection Priority List - **VERY HIGH RISK**

**Original Location:** Lines 143-152

**What's Missing:**
```
**Boundary Detection Priority (Strongest → Weakest):**
1. New "Encounter Summary" / "Clinical Summary" / "Visit Summary" document header = VERY STRONG SIGNAL (98% confidence boundary)
2. Provider name change (Dr. Smith → Dr. Jones) = VERY STRONG SIGNAL (95% confidence boundary)
3. New document header with date/time = VERY STRONG SIGNAL
4. Facility name change = STRONG SIGNAL
5. Patient name change = STRONG SIGNAL
6. Author system change = MODERATE SIGNAL
7. Date discontinuity = MODERATE SIGNAL
8. Content type change (Clinical → Metadata) = WEAK SIGNAL
9. Formatting change alone = VERY WEAK SIGNAL
```

**Why Critical:**
- This is the **weighted priority system** for boundary detection
- Critical for Frankenstein file success (boundary at page 13)
- AI needs to know that "Encounter Summary" headers override temporal proximity
- Without this, AI might give equal weight to all signals

**Impact if Missing:** Frankenstein file boundary detection may fail

**v2.7 Status:** COMPLETELY MISSING

**Recommendation:** **ADD BACK** - This is essential for complex multi-document files

---

### 2. Document Header vs Metadata Critical Distinction - **HIGH RISK**

**Original Location:** Lines 109-121

**What's Missing:**
```
### CRITICAL: Document Header Pages vs Administrative Metadata Pages

**Document Header/Title Pages (Strong Encounter Boundary Signal):**
- Headers containing: "Encounter Summary", "Clinical Summary", "Visit Summary", "Patient Visit"
- Often include document generation metadata: "Generated for Printing on [Date]", "Created on [Date]"
- These mark the START of a NEW encounter, NOT metadata for a previous one

**Critical Distinction:**
- **Generation/Created Date** (in header): When the report was printed/generated (metadata)
- **Encounter Date** (in body text): When the clinical visit actually occurred (clinical data)
- Example: "Encounter Summary (Created Oct 30)" with "Visit Date: June 22" → encounter date is June 22, not Oct 30

**RULE:** Document title pages with "Encounter/Clinical/Visit Summary" are encounter STARTERS, not metadata pages for previous encounters. Don't be misled by generation dates that are close to previous encounter dates.
```

**Why Critical:**
- This was **added in v2.2** specifically to fix Test 06 failure
- Prevents confusing new encounter headers with metadata pages
- Critical for Frankenstein file where page 14 has "Encounter Summary" header

**Impact if Missing:** AI might misclassify new encounter headers as metadata pages for previous encounter

**v2.7 Status:** PARTIALLY MISSING - v2.7 mentions "Encounter Summary" headers as boundaries but doesn't explain the generation date vs encounter date distinction

**Recommendation:** **ADD BACK** - This was a specific bug fix that should be preserved

---

### 3. Pattern D: Document Header Page Confusion Example - **HIGH RISK**

**Original Location:** Lines 179-186

**What's Missing:**
```
**Pattern D: Document Header Page Confusion**

Page 13: Clinical content ending (Dr. Smith, signed October 27)
Page 14: "Encounter Summary (Generated October 30)" + "Encounter Date: June 22" (Dr. Jones)
RESULT: Page 14 is START of NEW encounter (Dr. Jones, June 22), NOT metadata for page 13
BOUNDARY: Page 13/14 (new document header + provider change)
KEY: Don't be misled by generation date (Oct 30) being close to previous encounter (Oct 27). The actual encounter date (June 22) and provider change confirm this is a separate encounter.
```

**Why Critical:**
- This is the **exact pattern from Test 06** that failed in v2.2
- Concrete example showing how temporal proximity can mislead
- Directly relevant to Frankenstein file test

**Impact if Missing:** AI might assign page 14 to encounter 1 instead of recognizing it as encounter 2 start

**v2.7 Status:** COMPLETELY MISSING

**Recommendation:** **ADD BACK** - This is test-specific guidance that prevents regression

---

### 4. Metadata Handling Patterns A/B/C - **MEDIUM-HIGH RISK**

**Original Location:** Lines 154-177

**What's Missing:**
```
**Pattern A: Metadata at End (Most Common)**
Pages 1-10: Clinical content (Dr. Smith, Hospital A)
Pages 11-12: Metadata (Dr. Smith signature, document IDs)
Page 13: New clinical header (Dr. Jones, Hospital B)
RESULT: Group pages 11-12 with pages 1-10 (same provider)
BOUNDARY: Page 12/13 (provider change)

**Pattern B: Metadata at Start**
Pages 1-2: Cover page with document metadata (Hospital A)
Pages 3-10: Clinical content (Dr. Smith, Hospital A)
RESULT: Group pages 1-2 with pages 3-10 (same facility)

**Pattern C: Multiple Documents with Metadata**
Pages 1-5: Clinical (Dr. Smith)
Pages 6-7: Metadata (Dr. Smith signature)
Pages 8-9: Metadata/cover (Dr. Jones, Hospital B)
Pages 10-15: Clinical (Dr. Jones, Hospital B)
RESULT: Boundary at page 7/8 (provider change in metadata signals new document)
```

**Why Critical:**
- Concrete examples of how to handle metadata in different positions
- Shows **provider continuity** principle in action
- Important for documents with metadata pages

**Impact if Missing:** AI might incorrectly group metadata pages

**v2.7 Status:** COMPLETELY MISSING - v2.7 only says "Assign to adjacent encounter based on context" without examples

**Recommendation:** **CONSIDER ADDING BACK** - At minimum Pattern A (most common) for clarity

---

### 5. Confidence <0.50 Reconsider Guardrail - **MEDIUM RISK**

**Original Location:** Line 450

**What's Missing:**
```
**CRITICAL: Below 0.50 indicates you should reconsider the encounter classification**
```

**Why Important:**
- Acts as a **quality gate** for AI
- Forces reconsideration when confidence is very low
- Simple but effective guardrail

**Impact if Missing:** AI might output very low confidence encounters without reconsidering

**v2.7 Status:** MISSING

**Recommendation:** **ADD BACK** - Simple one-line addition with high value

---

## IMPORTANT MISSING ITEMS (Medium Risk)

### 6. How to Determine Which Document Metadata Belongs To - **MEDIUM RISK**

**Original Location:** Lines 126-142

**What's Missing:**
```
**How to Determine Which Document Metadata Belongs To:**

1. **Check Provider/Facility References in Metadata:**
   - If metadata mentions "Dr. Smith" → belongs with Dr. Smith's clinical content
   - If metadata shows "Hospital A" → belongs with Hospital A's clinical content

2. **Metadata Position Analysis:**
   - At document start (pages 1-2): Usually a cover page/header for FOLLOWING content
   - At document end (last 1-3 pages): Usually signature block/closeout for PRECEDING content
   - Between clinical sections: Check provider names to determine grouping

3. **When Uncertain:**
   - Group metadata with the clinical content that shares the SAME provider/facility
   - Lower confidence score (0.75-0.85) when grouping is ambiguous
```

**Why Important:** Systematic approach to metadata assignment

**v2.7 Status:** Simplified to "Assign to adjacent encounter based on context"

**Recommendation:** OPTIONAL - v2.7 wording may be sufficient

---

### 7. Common Misclassifications Prevention - **MEDIUM RISK**

**Original Location:** Lines 361-380

**What's Missing:**
```
### Immunization Records
**These are NOT lab reports** - they are procedures/interventions, not diagnostic tests
- If part of a health summary → keep in the summary encounter
- Look for: "Immunisation", "Vaccination", "Vaccine administered"

### Medication Lists
- If standalone sheet → pseudo_medication_list
- If section in a larger summary → part of the pseudo_admin_summary encounter

### Administrative Summaries
- Headers: "Patient Health Summary", "GP Summary", "My Health Record"
- Even if contains multiple sections → ONE encounter
```

**Why Important:** Prevents common classification errors

**v2.7 Status:** Scattered throughout, not consolidated

**Recommendation:** OPTIONAL - information exists in v2.7, just less organized

---

### 8. Decision Tree for Administrative Summaries - **LOW-MEDIUM RISK**

**Original Location:** Lines 382-400

**What's Missing:**
```
When you see "Patient Health Summary" or "GP Summary":

1. Is this a single cohesive document?
   → YES: Create 1 pseudo_admin_summary encounter, STOP

2. Does it contain multiple sections (medications, immunizations, history)?
   → YES: These are COMPONENTS of the summary, NOT separate encounters

3. Are immunizations listed?
   → Do NOT create pseudo_lab_report for immunizations

4. Are medications listed?
   → If standalone: pseudo_medication_list
   → If part of larger summary: Include in pseudo_admin_summary
```

**Why Important:** Step-by-step decision process

**v2.7 Status:** Guidance exists but not in decision tree format

**Recommendation:** OPTIONAL - v2.7 has the logic, just different structure

---

### 9. Encounter Segmentation Decision Hierarchy - **MEDIUM RISK**

**Original Location:** Lines 402-412

**What's Missing:**
```
When uncertain about splitting vs. keeping unified:

1. **Default to document boundaries** - Respect clear document breaks
2. **Preserve multi-document capability** - System MUST handle jumbled uploads
3. **But avoid over-segmentation** - Don't split sections of unified document
4. **Use confidence scores** - Lower confidence (0.70-0.85) when uncertain

**Key Principle:** This system is designed to handle complex multi-document uploads (out-of-order pages, mixed records).
Don't artificially force everything into one encounter, but also don't split unified documents.
```

**Why Important:** Philosophy for handling ambiguous cases

**v2.7 Status:** MISSING

**Recommendation:** **CONSIDER ADDING** - Useful guidance for edge cases

---

### 10. Summary Quality Requirements - **LOW-MEDIUM RISK**

**Original Location:** Lines 476-481

**What's Missing:**
```
**Summary Quality Requirements:**
- **Content-aware**: Reflect actual encounter content, not generic descriptions
- **Concise**: 1-2 sentences maximum (15-30 words ideal)
- **Patient-friendly**: Use plain English, avoid excessive medical jargon
- **Informative**: User should understand the visit purpose/outcome
- **NO speculation**: Only include information explicitly stated
```

**Why Important:** Quality standards for summaries

**v2.7 Status:** Has guidelines but missing these specific quality requirements

**Recommendation:** OPTIONAL - v2.7 has basic summary guidance

---

### 11. Page Assignment Critical Decision Points - **LOW RISK**

**Original Location:** Lines 518-537

**What's Missing:**
```
**When you encounter a page that could belong to either of two encounters:**
- Ask yourself: "What are the boundary signals on this page?"
- Check for: Encounter Summary headers, provider changes, facility changes, date changes
- **Document headers ALWAYS signal new encounters** (even if dates are close)
- Write your reasoning in the justification

**Example critical page (like Test 06 page 14):**
- If you see "Encounter Summary" header: "NEW Encounter Summary header, different provider and facility"
- NOT: "Signature page for previous encounter" (wrong if Encounter Summary header present)

**Why This Matters:**
This prevents errors like:
- Assigning page 14 to encounter 1 when it has "Encounter Summary" header for encounter 2
- Ignoring provider/facility changes at page boundaries
- Being misled by temporal proximity of dates

**Your justifications will be reviewed to understand your reasoning.**
```

**Why Important:** Meta-guidance on the justification process

**v2.7 Status:** Basic justification guidance exists

**Recommendation:** OPTIONAL - v2.7 guidance may be sufficient

---

### 12. pageRanges Format Requirement - **LOW RISK**

**Original Location:** Lines 673-678

**What's Missing:**
```
**CRITICAL - Page Range Format:**
- pageRanges must ALWAYS include BOTH start AND end page as numbers
- Single page: [[1, 1]] NOT [[1]] or [[1, null]]
- Multiple pages: [[1, 5]] NOT [[1, 5, null]]
- Non-contiguous: [[1, 3], [7, 8]]
```

**Why Important:** Prevents format errors

**v2.7 Status:** Shows correct format in examples but doesn't state the rule explicitly

**Recommendation:** OPTIONAL - examples may be sufficient

---

### 13. Critical Notes Emphasis - **LOW RISK**

**Original Location:** Lines 679-690

**What's Missing:**
```
- **page_assignments is MANDATORY**: You must assign ALL pages explicitly
- **Justifications are MANDATORY**: Every page assignment needs justification
- **encounter_id consistency**: Same IDs must appear in both arrays
- For pseudo-encounters **without specific dates**, leave dateRange as null
- For encounters with specific dates, ALWAYS populate dateRange and date_source
```

**Why Important:** Emphatic restatement of requirements

**v2.7 Status:** Has this guidance but less emphatic

**Recommendation:** OPTIONAL - v2.7 has the rules

---

## ITEMS CORRECTLY PRESERVED

### Items v2.7 Got Right:

1. **Timeline Test** - Core principle preserved and moved upfront
2. **Lab Report Date Fix (v2.4)** - Preserved correctly
3. **Page-by-Page Assignment Requirement** - Preserved
4. **Confidence Scoring Tiers** - Preserved (though less detailed)
5. **Summary Generation** - Preserved (though less detailed quality requirements)
6. **Encounter Types** - All valid types from union
7. **Schema Alignment** - All field names correct
8. **Planned Encounters Logic** - Fixed in v2.7
9. **Examples** - Moved earlier, good examples included
10. **Basic Pseudo-Encounter Rules** - Core logic preserved

---

## Token Impact of Missing Items

If we added back the 5 CRITICAL items:

**Estimated Token Cost:**
1. Boundary Detection Priority List: ~100 tokens
2. Document Header vs Metadata Distinction: ~120 tokens
3. Pattern D Example: ~80 tokens
4. Metadata Patterns A/B/C: ~150 tokens
5. Confidence <0.50 note: ~10 tokens

**Total:** ~460 tokens

**This would bring v2.7 from ~4,060 tokens to ~4,520 tokens**

That's still within reason, and actually matches the original v2.4 baseline (~4,500 tokens).

---

## Risk Assessment

### If Testing v2.7 As-Is (Without Adding Back Critical Items):

**HIGH RISK Scenarios:**
1. **Frankenstein file boundary detection** - Missing boundary priority list and Pattern D example
2. **Documents with metadata pages between encounters** - Missing Pattern A/B/C guidance
3. **Documents with "Encounter Summary" headers** - Missing generation date vs encounter date distinction

**MEDIUM RISK Scenarios:**
1. **Very low confidence encounters** - Missing <0.50 reconsider note
2. **Complex metadata positioning** - Simplified guidance

**LOW RISK Scenarios:**
1. Single-document files - v2.7 should handle fine
2. Simple pseudo-encounters - v2.7 has basic logic
3. Lab reports with dates - v2.4 fix preserved

---

## Recommendations

### Option A: Add Back 5 Critical Items (RECOMMENDED)

**Additions:**
1. Boundary Detection Priority List
2. Document Header vs Metadata Distinction
3. Pattern D Example
4. Metadata Pattern A (most common)
5. Confidence <0.50 note

**Token Cost:** ~400 tokens
**Final Token Count:** ~4,460 tokens (still ~40 below v2.4)
**Risk:** LOW - preserves critical anti-patterns
**Deployment Confidence:** VERY HIGH

### Option B: Add Back Only Top 2 Critical Items (BALANCED)

**Additions:**
1. Boundary Detection Priority List
2. Document Header vs Metadata Distinction

**Token Cost:** ~220 tokens
**Final Token Count:** ~4,280 tokens (5% reduction from v2.4)
**Risk:** MEDIUM - Frankenstein file might work, but less guidance
**Deployment Confidence:** MEDIUM-HIGH

### Option C: Test v2.7 As-Is (HIGH RISK - NOT RECOMMENDED)

**Token Count:** ~4,060 tokens (10% reduction)
**Risk:** HIGH for Frankenstein file and complex documents
**Deployment Confidence:** MEDIUM
**Rationale:** May work, but missing critical Test 06-specific fixes

---

## Final Recommendation

**Proceed with Option A: Add back the 5 critical items**

**Reasoning:**
1. Frankenstein file (Test 06) specifically drove v2.2 changes - shouldn't lose those fixes
2. Pattern D example is literally the Test 06 scenario
3. Boundary priority list is essential for weighted decision-making
4. Token cost is acceptable (~460 tokens) for preserving critical logic
5. Still achieves overall optimization goal (linear flow, consolidated sections)

**Benefits:**
- Preserves all critical bug fixes from v2.2-v2.4
- Maintains structural improvements from v2.5-v2.7
- Token count close to v2.4 but with better organization
- High confidence for Frankenstein file test
- Production-ready with low regression risk

**Next Step:** Shall I create v2.7.1 with the 5 critical items added back?