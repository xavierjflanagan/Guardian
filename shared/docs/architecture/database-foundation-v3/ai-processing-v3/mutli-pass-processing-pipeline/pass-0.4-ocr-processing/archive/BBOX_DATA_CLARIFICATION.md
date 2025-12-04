# Bounding Box Data Clarification

**Date:** November 3, 2025
**Topic:** Encounter bbox/spatial data requirements for Pass 0.5
**Status:** Proposal for discussion

---

## The Confusion

**Your requirement:** "Every encounter has to have the start and bbox spatial data and page data attached to it so that the downstream AI passes can attach the encounter to whichever clinical data they're working on."

**My proposal in PASS05_PROMPT_IMPROVEMENTS_V2.2.md:** Optional `spatialNotes: string | null` field.

**Your feedback:** "I don't know what a spatial notes string null field is. I'm a bit confused by all this and don't want to lock into anything yet."

Let me clarify what bbox data actually means and propose concrete options.

---

## What is Bounding Box (Bbox) Data?

**Bounding box = coordinates defining a rectangular region on a page**

### Format (from Google Cloud Vision):
```typescript
interface BoundingBox {
  vertices: Array<{
    x: number;  // Horizontal position (pixels from left edge)
    y: number;  // Vertical position (pixels from top edge)
  }>;
}
```

### Visual Example:

```
Page coordinates (1700px wide × 2200px tall):
┌────────────────────────────────────────────┐ (0, 0)
│                                            │
│   ┌──────────────────────────┐ (50, 100)  │
│   │ Encounter content here   │            │
│   │ with multiple lines      │            │
│   │ spanning this region     │            │
│   └──────────────────────────┘ (800, 1100)│
│                                            │
└────────────────────────────────────────────┘ (1700, 2200)
```

**Bbox for this encounter:**
```json
{
  "vertices": [
    {"x": 50,  "y": 100},   // Top-left corner
    {"x": 800, "y": 100},   // Top-right corner
    {"x": 800, "y": 1100},  // Bottom-right corner
    {"x": 50,  "y": 1100}   // Bottom-left corner
  ]
}
```

**What this tells us:**
- Encounter starts at x=50, y=100 (top-left)
- Encounter ends at x=800, y=1100 (bottom-right)
- Width: 750px (800 - 50)
- Height: 1000px (1100 - 100)
- Excludes right column (x > 800) and margins (x < 50)

---

## Current Pass 0.5 Response Schema (No Bbox)

**What Pass 0.5 returns TODAY:**

```json
{
  "encounters": [
    {
      "encounterType": "discharge_summary",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-10", "end": "2024-03-15"},
      "provider": "Dr Jane Smith",
      "facility": "St Vincent's Hospital",
      "pageRanges": [[1, 5]],     // Just page numbers
      "confidence": 0.95,
      "extractedText": "Discharge Summary - Admission for..."
    }
  ]
}
```

**What's missing:** NO spatial information within pages

**Why this causes problems:**
- Can't distinguish left column from right column (Test 06 issue)
- Can't exclude sidebars or margin notes
- Pass 2 (clinical extraction) doesn't know which part of page 3 belongs to which encounter

---

## Option 1: Page-Level Bbox Data (Simple)

**Add bbox for entire encounter across all pages:**

```json
{
  "encounters": [
    {
      "encounterType": "progress_note",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-10-27"},
      "provider": "Mara Ehret",
      "facility": "Spine & Pain PC",
      "pageRanges": [[1, 13]],
      "confidence": 0.92,
      "extractedText": "Progress Note...",

      "boundingBoxes": [
        {
          "page": 1,
          "vertices": [
            {"x": 50, "y": 100},    // Top-left of encounter on page 1
            {"x": 800, "y": 100},   // Top-right
            {"x": 800, "y": 2100},  // Bottom-right
            {"x": 50, "y": 2100}    // Bottom-left
          ]
        },
        {
          "page": 2,
          "vertices": [
            {"x": 50, "y": 100},    // Continues on page 2
            {"x": 800, "y": 2100}   // ... (abbreviated for readability)
          ]
        }
        // ... pages 3-13
      ]
    }
  ]
}
```

**Pros:**
- Precise spatial data for Pass 2 clinical extraction
- Can distinguish left column from right column
- Can validate encounter boundaries match visual layout

**Cons:**
- Large response payload (bbox for every page in encounter)
- AI must analyze OCR page structure to generate
- **CRITICAL:** Won't be accurate until OCR spatial sorting is fixed

---

## Option 2: Simplified Spatial Metadata (My Initial Proposal)

**Add optional text notes instead of precise coordinates:**

```json
{
  "encounters": [
    {
      "encounterType": "progress_note",
      "pageRanges": [[1, 13]],
      "spatialNotes": "Main content spans left column (x: 50-800). Excludes right column sidebar with future appointment (x: 850-1600)."
    }
  ]
}
```

**Pros:**
- Lightweight (just text description)
- Doesn't require precise bbox coordinates
- Captures spatial awareness without complex data structure

**Cons:**
- Not machine-readable (Pass 2 can't parse "left column")
- Vague ("x: 50-800" on which pages?)
- Doesn't solve your requirement for concrete bbox data

**This is what you rejected** - I understand why now. You need actual coordinates, not text descriptions.

---

## Option 3: Hybrid Approach (Recommended)

**Phase 1 (Immediate):** Accurate page ranges only
```json
{
  "pageRanges": [[1, 13]]  // Which pages contain this encounter
}
```

**Phase 2 (After OCR spatial sorting fixed):** Add bbox data
```json
{
  "pageRanges": [[1, 13]],
  "boundingBoxes": [
    {
      "page": 1,
      "vertices": [{"x": 50, "y": 100}, {"x": 800, "y": 2100}]
    }
    // ... per-page bboxes
  ]
}
```

**Phase 3 (Future - if needed):** Add excluded regions
```json
{
  "pageRanges": [[1, 13]],
  "boundingBoxes": [...],
  "excludedRegions": [
    {
      "page": 3,
      "reason": "future_appointment_sidebar",
      "vertices": [{"x": 850, "y": 100}, {"x": 1600, "y": 500}]
    }
  ]
}
```

---

## The Catch-22 Problem

**Here's why I'm hesitant to add bbox NOW:**

### Problem: OCR Text Order is Wrong (Test 06)
```
Current OCR order:
1. Page 3 left column (Mara Ehret progress note)
2. Page 14 (Emergency - Matthew Tinkham)
3. Page 3 right column (Neckman future appointment)

GPT-5 sees: "Progress... Emergency Tinkham... Neckman"
GPT-5 thinks: "Neckman must be on page 14 after Tinkham!"
```

### If we ask AI for bbox NOW (before fixing OCR sorting):
```json
{
  "encounterType": "planned_procedure",
  "provider": "David W Neckman",
  "pageRanges": [[14, 14]],     // WRONG!
  "boundingBoxes": [{
    "page": 14,                  // WRONG!
    "vertices": [...]            // WRONG!
  }]
}
```

**The bbox will be WRONG because GPT-5 is reading scrambled text.**

### After fixing OCR sorting:
```
Fixed OCR order:
1. Page 3 left column (Mara Ehret)
2. Page 3 right column (Neckman sidebar)
3. Pages 4-13 (continued progress note)
4. Page 14 (Emergency - Tinkham)

GPT-5 sees: "Progress Ehret + Neckman sidebar... [pages 4-13]... Emergency Tinkham"
GPT-5 correctly identifies: 2 encounters, Neckman is part of page 3 sidebar
```

Now AI can generate accurate bbox:
```json
{
  "encounterType": "progress_note",
  "provider": "Mara Ehret",
  "pageRanges": [[1, 13]],
  "boundingBoxes": [{
    "page": 3,
    "vertices": [
      {"x": 50, "y": 100},      // Left column only
      {"x": 800, "y": 2100}     // Excludes right sidebar
    ]
  }]
}
```

---

## Recommended Implementation Path

### Step 1: Fix OCR Spatial Sorting (Priority 1)
- Implement `sortTextBlocksSpatially()` algorithm
- Test on Test 06 Frankenstein PDF
- Verify text order is correct

### Step 2: Update Prompt for Future Appointment Refs (Priority 1)
- Add guidance from PASS05_PROMPT_IMPROVEMENTS_V2.2.md
- Clarify sidebar mentions vs. separate encounters
- Test with fixed OCR ordering

### Step 3: Add Bbox Data to Response Schema (Priority 2)
**After Steps 1-2 are verified working:**

Update prompt to include:
```typescript
interface EncounterResponse {
  encounterType: string;
  isRealWorldVisit: boolean;
  dateRange: {...};
  provider: string | null;
  facility: string | null;
  pageRanges: number[][];
  confidence: number;
  extractedText: string;

  // NEW: Spatial data
  boundingBoxes: Array<{
    page: number;
    vertices: Array<{x: number; y: number}>;
  }>;
}
```

**Prompt addition:**
```
For each encounter, provide bounding box coordinates:
- Analyze OCR page structure to identify which regions contain this encounter
- For each page in pageRanges, provide bbox vertices (top-left, bottom-right)
- Exclude sidebars, margins, and nested references from bbox
- Example: If encounter is in left column only, bbox should be x: 50-800 (not full page width)
```

### Step 4: Validate Bbox Accuracy (Priority 2)
- Compare AI-generated bbox against visual PDF
- Verify sidebars are excluded
- Check that bbox matches text content

---

## What Bbox Data Enables for Pass 2

**Your goal:** "Downstream AI passes can attach the encounter to whichever clinical data they're working on."

**How bbox helps Pass 2:**

### Without bbox (current):
```
Pass 2 prompt: "Extract medications from pages 1-13"
- Pass 2 sees ALL text on pages 1-13, including:
  - Main encounter content (Mara Ehret progress note)
  - Sidebar with future appointment (Neckman)
  - Headers, footers, page numbers
- Can't distinguish which text belongs to which encounter
```

### With bbox (proposed):
```
Pass 2 prompt: "Extract medications from encounter {uuid}"
- Fetches encounter bbox: page 3, x: 50-800, y: 100-2100
- Pass 2 ONLY analyzes text within bbox region
- Excludes sidebar (x: 850-1600)
- Excludes headers/footers outside bbox
- Result: Clean medication extraction from Mara Ehret's note only
```

**Concrete example:**

```typescript
// Pass 2 clinical extraction
const encounter = await getEncounter(encounterId);

// encounter.boundingBoxes = [
//   { page: 3, vertices: [{x:50, y:100}, {x:800, y:2100}] }
// ]

// Pass 2 fetches ONLY text within bbox
const relevantText = await extractTextFromBbox(
  shellFileId,
  encounter.boundingBoxes
);

// GPT-4 extracts medications from clean, bbox-filtered text
const medications = await extractMedications(relevantText);
```

**Without bbox, Pass 2 would see:**
```
"Progress Note: Mara Ehret... Next Appt: Dr. Neckman Nov 11... Medications: ..."
```

**With bbox, Pass 2 sees:**
```
"Progress Note: Mara Ehret... Medications: ..."
```
(Neckman sidebar excluded because it's outside bbox)

---

## Summary

**Your requirement:** Every encounter needs bbox spatial data for Pass 2 extraction.

**Why I proposed "spatialNotes" initially:** Trying to add spatial awareness WITHOUT committing to full bbox structure (which I knew would be inaccurate due to OCR bug).

**What you actually need:** Concrete bounding box coordinates (x, y vertices) for each encounter.

**The catch:** Bbox data will be WRONG until OCR spatial sorting is fixed.

**Recommended path:**
1. ✅ Fix OCR spatial sorting (Priority 1)
2. ✅ Update prompt for future appointment refs (Priority 1)
3. ⏳ Add bbox to response schema (Priority 2, AFTER steps 1-2 verified)
4. ⏳ Validate bbox accuracy (Priority 2)

**My suggestion:** Let's NOT add bbox field to Pass 0.5 response schema YET. Wait until:
- OCR sorting is implemented
- Test 06 re-tested with fixed OCR
- Confirmed GPT-5-mini correctly identifies 2 encounters (not 3)

Then add bbox field with confidence that coordinates will be accurate.

---

## Questions for You

1. **Do you agree with phased approach?** (Fix OCR → Update prompt → Add bbox → Validate)

2. **Bbox granularity:** Do you want bbox for EVERY page in encounter, or just:
   - Option A: One bbox per encounter (entire extent across all pages)
   - Option B: Per-page bbox (more precise, larger response)
   - Option C: Only bbox for pages with multi-column layout

3. **Excluded regions:** Should we track bbox for nested references (like Neckman sidebar)?
   ```json
   {
     "mainBbox": [...],           // Main encounter content
     "nestedReferences": [        // Sidebars, future appointments
       {
         "type": "future_appointment",
         "provider": "Dr. Neckman",
         "bbox": [...]
       }
     ]
   }
   ```

4. **OCR sorting priority:** Should we implement OCR spatial sorting NOW (before bbox work)?
   - My recommendation: YES - it's the root cause of Test 06 hallucination

---

**Next Steps (Awaiting Your Decision):**
- [ ] Approve phased approach vs. add bbox immediately
- [ ] Choose bbox granularity level (A, B, or C)
- [ ] Decide on nested reference tracking
- [ ] Confirm OCR sorting is Priority 1
