# Test 03: OCR vs. Vision Strategy Analysis

**Date:** October 30, 2025
**Status:** PLANNING - No execution yet
**Context:** Evaluating prompt optimization strategies after Test 02 false positive issues

---

## Background

**Test 02 Results:**
- False positive: AI detected 2 encounters instead of 1
- Immunizations misclassified as lab report
- Root cause: Prompt relied on visual cues ("formatting", "letterhead") but only received OCR text

**Current Implementation:**
- Pass 0.5 uses OCR text only (GPT-4o-mini)
- Processing time: ~7 seconds
- Cost: ~$0.0004 per file
- Accuracy: ~70-80% (based on Test 02 failure)

---

## Strategic Options Evaluated

### Option A: Optimize Current OCR Approach

**Approach:** Create `aiPromptsOCR.ts` with text-pattern focused instructions

**Changes:**
- Remove visual cues ("letterhead", "formatting changes", "page breaks")
- Add text pattern detection ("Patient Health Summary" header = admin summary)
- Section marker detection ("Current Medications:", "Immunisations:", "Past History:")
- Date clustering analysis (dates within 5 days = same encounter)
- Word proximity analysis for document boundaries

**Prompt Length:** ~150 lines (down from 370)

**Pros:**
- Fast: 7 seconds
- Cheap: $0.0004
- No architecture changes needed
- Can deploy immediately

**Cons:**
- Limited accuracy ceiling (~85%)
- Can't truly detect document boundaries without visual cues
- Still guessing about formatting/letterhead
- Won't fully solve false positive problem

**Verdict:** Quick improvement but not long-term solution.

---

### Option B: Switch to Raw Images (Sequential)

**Approach:** Use GPT-4o with raw images instead of OCR text

**Processing Flow:**
```
Sequential Processing (Total: ~7.5-8 minutes):
OCR (10s) → Pass 0.5 Vision (30-60s) → Pass 1 Vision (7 min) → Pass 2
```

**Prompt:** Create `aiPromptsVision.ts` leveraging visual understanding

**Changes:**
- Add visual boundary detection (letterheads, formatting, page breaks)
- Detect document structure visually
- Identify tables, headers, sections by appearance
- See page transitions and formatting changes

**Pros:**
- High accuracy: 95%+ (can see what it's analyzing)
- True document boundary detection
- Better long-term scalability
- Cleaner prompt (200 lines, focused on visual cues)

**Cons:**
- Adds 30-60 seconds to pipeline
- More expensive: $0.02-0.04 per file (vs $0.0004)
- Requires image encoding infrastructure

**Verdict:** Better accuracy but adds processing time.

---

### Option C: Raw Images Parallel to Pass 1 (REJECTED)

**Approach:** Run Pass 0.5 Vision in parallel with Pass 1 Vision

**Why It Was Considered:**
- Pass 1 already takes 7 minutes with images
- Could run Pass 0.5 during that time (no added latency)
- Both passes need same image encoding

**Processing Flow (Proposed):**
```
Parallel Processing (Total: 7 minutes - NO INCREASE):
         ┌→ Pass 0.5 Vision (30-60s) ─┐
OCR ─────┤                              ├→ Apply assignments → Pass 2
         └→ Pass 1 Vision (7 min) ──────┘
```

**Why It DOESN'T WORK:**

**Critical Architectural Constraint:**
Pass 0.5 has TWO tasks, not one:

1. **Task 1: Encounter Discovery** (always runs)
   - Identifies healthcare encounters
   - Creates manifest for Pass 1/2

2. **Task 2: Batch Boundary Planning** (conditional - only for ≥18 pages)
   - Determines WHERE to split large files into batches
   - Creates intelligent split points (section boundaries, formatting changes)
   - Defines overlap zones for context preservation

**The Blocking Dependency:**
- **Pass 1 needs batch boundaries BEFORE it can start**
- If Pass 0.5 says "split file at page 10", Pass 1 must know this before processing
- Pass 1 Batch 1 processes pages 1-10
- Pass 1 Batch 2 processes pages 10-18 (with overlap)
- **Cannot start Pass 1 until Pass 0.5 Task 2 completes**

**Sequential Dependency Chain:**
```
Pass 0.5 Task 1: Encounter Discovery (30s)
    ↓
Pass 0.5 Task 2: Batch Planning (30s) ← MUST complete first
    ↓
Pass 1 Batch 1: Entity Detection (3.5 min)
    ↓
Pass 1 Batch 2: Entity Detection (3.5 min)
    ↓
Pass 2: Clinical Enrichment
```

**Verdict:** Parallel execution is architecturally impossible due to batching dependency.

---

## Revised Strategic Recommendation

### Recommended: Option B (Sequential Vision) with Staged Rollout

**Phase 1: Create Triple Implementation**
```
pass05/
├── aiPrompts.ts           (current - baseline)
├── aiPromptsOCR.ts        (NEW - OCR-optimized, 150 lines)
├── aiPromptsVision.ts     (NEW - Vision-optimized, 200 lines)
└── encounterDiscovery.ts  (modify to switch via env var)
```

**Phase 2: A/B Testing (This Week)**

Test all three approaches on same files:

| Strategy | Model | Input | Time | Cost | Expected Accuracy |
|----------|-------|-------|------|------|-------------------|
| Current (Baseline) | gpt-4o-mini | OCR text | 7s | $0.0004 | 70-80% |
| OCR-Optimized | gpt-4o-mini | OCR text | 7s | $0.0004 | 85-90% |
| Vision | gpt-4o | Raw images | 30-60s | $0.02-0.04 | 95%+ |

**Test Files:**
1. BP2025060246784 V5 (Patient Health Summary - 1 page)
2. Multi-page discharge summary (5 pages)
3. Mixed upload (discharge + lab report - 8 pages)
4. Out-of-order pages (test structural detection)

**Success Criteria:**
- Must detect correct number of encounters
- Must classify encounter types accurately
- Must NOT create false positives (immunizations → lab report)
- Must handle multi-document uploads correctly

**Phase 3: Production Rollout**

Based on testing results:

**Scenario 1: OCR-Optimized is Good Enough (85-90% accuracy)**
- Deploy OCR-optimized prompt
- Keep current fast/cheap architecture
- Monitor accuracy in production
- Upgrade to Vision later if needed

**Scenario 2: Vision is Required (need 95%+ accuracy)**
- Deploy Vision prompt
- Accept 30-60s time increase
- Gain high accuracy and better long-term scalability
- Total pipeline time: 7.5-8 minutes (vs current 7 minutes)

**Scenario 3: Hybrid Approach**
- Small files (<5 pages): Use OCR-optimized (fast, cheap, usually accurate)
- Complex files (≥5 pages or mixed content): Use Vision (slower but accurate)
- Best of both worlds

---

## Implementation Details

### OCR-Optimized Prompt Strategy

**Key Principles:**
1. **Text patterns only** - No visual cues
2. **Header detection** - Look for "Patient Health Summary", "Discharge Summary", "Pathology Report"
3. **Section markers** - Detect "Current Medications:", "Immunisations:", "Past History:"
4. **Date clustering** - Dates within 5 days = same encounter
5. **Provider detection** - Provider name changes = different encounters
6. **Facility detection** - Facility changes = different source files

**Example OCR Pattern:**
```
Input OCR Text:
"Patient Health Summary
 Xavier Flanagan
 DOB: 25/04/1994
 Current Medications:
 Metformin 500mg
 Immunisations:
 11/04/2010 Fluvax"

Detection Logic:
1. Line 1 contains "Patient Health Summary" → unified admin document
2. Lines contain section markers → multi-section summary
3. No date for document itself → pseudo encounter
4. Action: Create ONE pseudo_admin_summary encounter
```

**Prompt Structure (150 lines):**
```markdown
# Task: Encounter Discovery from OCR Text

## What You're Analyzing
OCR-extracted text only. You CANNOT see formatting, letterheads, or visual layout.

## Document Boundary Detection (Text Patterns Only)

### Single Document Indicators:
- Header contains: "Summary", "Overview", "Profile", "Record"
- Sections follow "Label: items" pattern
- No document-level date (only item dates)

### Multiple Document Indicators:
- Different document headers mid-text
- Facility name changes
- Provider name changes
- Document dates present (not just item dates)

## Encounter Classification Rules

[Keep Timeline Test - it's solid]
[Keep strict lab report criteria]
[Keep immunization != lab report rule]

## Examples
[Same 3 examples - they're doing 80% of the work]

## Important
- Focus on TEXT patterns only
- Don't reference visual cues you can't see
- When uncertain, prefer fewer encounters
```

---

### Vision-Optimized Prompt Strategy

**Key Principles:**
1. **Visual document boundaries** - Letterhead changes, formatting differences
2. **Page structure** - Headers, footers, page numbers
3. **Table detection** - Structured vs. unstructured content
4. **Formatting continuity** - Same fonts/styles = same document
5. **White space analysis** - Page breaks, section dividers

**Example Vision Analysis:**
```
Input: Raw image of medical document

Visual Observations:
1. Top of page: "South Coast Medical" letterhead with logo
2. Center: Large header "Patient Health Summary"
3. Left column: Patient details block
4. Multiple sections with consistent formatting
5. Sections: Medications, Allergies, Immunizations (in boxes)
6. No page break or formatting change
7. Footer: Same facility information

Classification:
- Single unified document (consistent letterhead/formatting)
- Administrative summary (header text)
- Multi-section content (boxes for each section)
- Action: ONE pseudo_admin_summary encounter
```

**Prompt Structure (200 lines):**
```markdown
# Task: Encounter Discovery from Medical Images

## What You're Analyzing
Raw medical document images. You CAN see formatting, letterheads, and visual structure.

## Visual Document Boundary Detection

### Single Document Visual Indicators:
- Consistent letterhead/header across pages
- Same fonts and formatting throughout
- Continuous page numbers
- No clear visual breaks

### Multiple Document Visual Indicators:
- Letterhead changes between pages
- Different formatting styles (fonts, layouts)
- Visual page breaks (new document start)
- Different paper colors/backgrounds

## Encounter Classification Using Visual Cues

### Administrative Summaries:
- Large header: "Patient Health Summary" or "GP Summary"
- Sectioned layout (boxes or dividers)
- Patient details block at top
- Multiple sections with labels

### Lab Reports:
- "Pathology" or "Laboratory" letterhead
- Structured table with results
- Reference ranges in columns
- Test values with units

### Discharge Summaries:
- Hospital letterhead
- Date range for admission
- Narrative format (paragraphs)
- Signature block at end

## Examples
[Same 3 examples - JSON output format doesn't change]

## Important
- Use visual cues to identify boundaries
- Look for formatting consistency
- Detect tables and structured layouts
- Page breaks indicate potential boundaries
```

---

## Environment Variable Configuration

**Implementation in `encounterDiscovery.ts`:**
```typescript
const PASS_05_STRATEGY = process.env.PASS_05_STRATEGY || 'ocr';
// Options: 'ocr' | 'ocr_optimized' | 'vision'

if (PASS_05_STRATEGY === 'vision') {
  // Use GPT-4o with images
  const prompt = buildVisionPrompt(input);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...input.images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img}` }
        }))
      ]
    }],
    temperature: 0.1
  });
} else {
  // Use GPT-4o-mini with OCR text
  const promptBuilder = PASS_05_STRATEGY === 'ocr_optimized'
    ? buildOCROptimizedPrompt
    : buildEncounterDiscoveryPrompt;

  const prompt = promptBuilder(input.ocrText);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a medical document analyzer.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });
}
```

---

## Cost-Benefit Analysis

### Current (OCR Baseline)
- **Time:** 7 seconds
- **Cost:** $0.0004 per file
- **Accuracy:** 70-80% (based on Test 02 failure)
- **Annual cost (10,000 files):** $4

### OCR-Optimized
- **Time:** 7 seconds (no change)
- **Cost:** $0.0004 per file (no change)
- **Accuracy:** 85-90% (estimated improvement)
- **Annual cost (10,000 files):** $4

### Vision
- **Time:** 30-60 seconds (+23-53s)
- **Cost:** $0.02-0.04 per file (50-100x increase)
- **Accuracy:** 95%+ (can see document structure)
- **Annual cost (10,000 files):** $200-400

### Hybrid (Smart Switching)
- **Small files (<5 pages):** OCR-optimized
- **Complex files (≥5 pages):** Vision
- **Expected split:** 80% OCR / 20% Vision
- **Blended cost:** $0.008 per file average
- **Blended time:** 15 seconds average
- **Annual cost (10,000 files):** $80

---

## Testing Protocol

### Test Execution Plan

**Week 1: Create Implementations**
1. Create `aiPromptsOCR.ts`
2. Create `aiPromptsVision.ts`
3. Modify `encounterDiscovery.ts` for strategy switching
4. Add environment variable configuration

**Week 2: Run A/B Tests**

Test each strategy on:
1. **BP2025060246784 V5** (1 page admin summary)
   - Expected: 1 encounter (pseudo_admin_summary)
   - Current result: 2 encounters (FAIL)

2. **5-page discharge summary**
   - Expected: 1 encounter (discharge_summary)
   - Test continuity detection

3. **Mixed upload** (3 pages discharge + 2 pages lab report)
   - Expected: 2 encounters
   - Test multi-document detection

4. **Out-of-order pages** (pages uploaded: 1, 3, 2, 4)
   - Expected: 1 encounter with correct page ranges
   - Test structural understanding

**Validation Queries:**
```sql
-- For each test run, validate:
SELECT
  encounters_detected,
  encounter_types_found,
  encounter_confidence_average,
  processing_time_ms,
  ai_cost_usd
FROM pass05_encounter_metrics
WHERE shell_file_id = '<test_file_id>';

-- Check encounter details
SELECT
  encounter_type,
  is_real_world_visit,
  page_ranges,
  pass_0_5_confidence
FROM healthcare_encounters
WHERE primary_shell_file_id = '<test_file_id>';
```

**Week 3: Analyze Results & Deploy Winner**

Compare:
- Accuracy (% correct encounter detection)
- False positive rate
- False negative rate
- Processing time
- Cost per file

Deploy best strategy to production.

---

## Decision Matrix

| Metric | OCR Baseline | OCR-Optimized | Vision | Hybrid |
|--------|--------------|---------------|--------|--------|
| Accuracy | 70-80% | 85-90% | 95%+ | 90-95% |
| Speed | 7s | 7s | 30-60s | 15s avg |
| Cost | $0.0004 | $0.0004 | $0.02-0.04 | $0.008 |
| Complexity | Low | Low | Medium | High |
| Long-term | Bad | OK | Good | Best |

**Recommendation Priority:**
1. **Try OCR-Optimized first** (easiest, might be good enough)
2. **If accuracy <90%, switch to Vision** (accept time/cost increase for accuracy)
3. **Consider Hybrid later** (optimize for production scale)

---

## Open Questions

1. **What's the actual accuracy ceiling for OCR-only?**
   - Can text patterns alone achieve 95%?
   - Or is visual understanding fundamentally required?

2. **Is 30-60s acceptable for Pass 0.5?**
   - Total pipeline: 7.5-8 minutes (vs current 7 minutes)
   - User perception: "Processing your document..."

3. **Should we optimize for current reality or future scale?**
   - Current: Maybe 100 uploads/month → cost not a factor
   - Future: 10,000 uploads/month → $4 vs $400 matters

4. **Can we do adaptive strategy selection?**
   - Simple uploads → OCR-optimized
   - Complex uploads → Vision
   - Who decides? (AI self-assessment? Page count threshold?)

---

## Success Criteria for Test 03

**Test 03 Success = All of these true:**
1. BP2025060246784 V5 detects exactly 1 encounter (not 2)
2. Encounter type is `pseudo_admin_summary` (not pseudo_medication_list + pseudo_lab_report)
3. No false positive immunization → lab report classification
4. Multi-document test correctly detects 2 separate encounters
5. Out-of-order page test correctly reconstructs encounter

**If OCR-optimized achieves 90%+ accuracy:**
→ Deploy OCR-optimized, defer Vision to later

**If OCR-optimized <90% accuracy:**
→ Deploy Vision, accept time/cost increase for accuracy

---

## Implementation Status

**Date:** October 30, 2025
**Status:** IMPLEMENTED - Ready for A/B testing

### Files Created:
1. `apps/render-worker/src/pass05/aiPromptsOCR.ts` (186 lines)
   - OCR-optimized prompt targeting 85-90% accuracy
   - Text pattern detection (no visual cues)
   - Stricter lab report criteria
   - Enhanced document unity detection

2. `apps/render-worker/src/pass05/aiPromptsVision.ts` (261 lines)
   - Vision-optimized prompt targeting 95%+ accuracy
   - Visual boundary detection (letterheads, formatting)
   - Table and structure detection
   - NOTE: Not yet wired up (requires image loading infrastructure)

3. `apps/render-worker/src/pass05/encounterDiscovery.ts` (MODIFIED)
   - Added strategy switching via `PASS_05_STRATEGY` environment variable
   - Options: 'ocr' (default baseline), 'ocr_optimized', 'vision'
   - Vision mode throws informative error (not implemented yet)
   - Logs strategy selection for debugging

### Environment Variable Configuration:
```bash
# Set in Render.com worker environment variables:
PASS_05_STRATEGY=ocr           # Current baseline (default)
PASS_05_STRATEGY=ocr_optimized # OCR-optimized (for A/B testing)
PASS_05_STRATEGY=vision        # Will error - not implemented yet
```

### Next Steps:
1. **Test current baseline** - Re-upload V5 file with Phase 2 improvements
2. **A/B test OCR-optimized** - Deploy with `PASS_05_STRATEGY=ocr_optimized`
3. **Compare results** - Measure accuracy, false positives, processing time
4. **Deploy winner** - Production rollout based on test results

---

**Last Updated:** October 30, 2025
**Status:** Implementation complete - Ready for A/B testing
**Next Step:** Test Phase 2 baseline improvements with V5 file upload
