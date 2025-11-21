# Edge Case Non-Encounter Pages - Architectural Design

**Status:** Proposed Design (Future Enhancement)
**Date:** November 21, 2025
**Related:** V11 Prompt Boundary Detection Fix (Deployed)
**Priority:** Future Enhancement (Post-Launch)

---

## EXECUTIVE SUMMARY

This document explores architectural solutions for handling non-encounter pages (blank pages, metadata pages, separator pages, etc.) in the Pass 0.5 progressive processing pipeline.

**Current V11 Prompt Fix (Deployed):**
- Fixed boundary detection to include administrative metadata pages in encounter boundaries
- Example: Epic signature footer (page 142) now INCLUDED in encounter document structure
- Prompt now distinguishes "document structure" from "clinical content"

**This Document (Future Enhancement):**
- Explores how to track and classify non-encounter pages that exist OUTSIDE encounter boundaries
- Proposes Option B3 schema enhancements for page classification
- Analyzes 10 edge case scenarios and architectural solutions

---

## PROBLEM STATEMENT

### Current Binary Model

**Current Architecture:**
```
Page → Assigned to Encounter (in pass05_page_assignments)
     OR
     → Not tracked at all (no database record)
```

**Gaps:**

1. **Invisible Pages:** Pages without encounters don't appear in any table
2. **Future Pass Blindness:** Pass 2/3 don't know non-encounter pages exist
3. **Cost Inefficiency:** Can't filter out blank/non-clinical pages for downstream processing
4. **Audit Trail Gaps:** No record of blank pages, separator pages, scan artifacts
5. **Document Completeness:** Can't verify all pages were processed (142 pages uploaded, but only 141 tracked?)

---

## V11 PROMPT FIX - WHAT WE JUST SOLVED

**Before V11 Fix:**
- AI excluded administrative metadata pages from encounter boundaries
- Example: 141-page encounter + 1-page Epic footer = encounter stops at page 141
- Page 142 (footer) had no tracking

**After V11 Fix:**
- AI includes administrative pages as part of encounter document structure
- Example: 141 pages clinical + 1 page Epic footer = 142-page encounter
- Page 142 now tracked with `encounter_id` and justification

**What V11 Doesn't Solve:**
- Pages that are truly NOT part of any encounter (standalone blank pages, file separators)
- Classification of page types (clinical vs administrative vs blank)
- Filtering non-clinical pages for Pass 2/3 cost optimization

---

## EDGE CASE CATALOG

### Use Case 1: Single Blank Page Upload

**Scenario:**
User uploads a 1-page PDF that is completely blank (scan artifact, accidental upload).

**Current Behavior:**
- No encounters detected
- Zero records in `pass05_page_assignments`
- `pass05_encounter_metrics`: `encounters_detected = 0`
- User sees: "No encounters found" (appears to fail)

**Proposed B3 Behavior:**
```sql
-- Create non-encounter record
pass05_page_assignments:
  page_num: 1
  encounter_id: NULL
  justification: "Blank page - no healthcare content detected"
  page_classification: "blank"
  is_clinically_relevant: false
```

**Why This Matters:**
- User knows their upload was processed (1 page tracked)
- System can display: "1 page processed, 0 encounters found, 1 blank page"
- Future audit: "Why no encounters?" → "Because it was blank"

---

### Use Case 2: 1 Health Summary + 9 Blank Pages

**Scenario:**
User uploads 10-page PDF. Page 1 has GP summary, pages 2-10 are blank (printer paper feed issue).

**Current V11 Behavior:**
```sql
-- Only page 1 tracked
pass05_page_assignments:
  page_num: 1, encounter_id: "abc123", justification: "GP summary"
-- Pages 2-10: No records
```

**Problem:**
- Future passes don't know pages 2-10 exist
- Can't verify document completeness (10 pages uploaded, only 1 tracked)
- Cost savings missed (Pass 2 would try to process blanks if they saw them)

**Proposed B3 Behavior:**
```sql
-- Page 1: Encounter
pass05_page_assignments:
  page_num: 1
  encounter_id: "abc123"
  justification: "GP consultation"
  page_classification: "clinical"
  is_clinically_relevant: true

-- Pages 2-10: Non-encounters
pass05_page_assignments:
  page_num: 2-10
  encounter_id: NULL
  justification: "Blank page following encounter"
  page_classification: "blank"
  is_clinically_relevant: false
  related_encounter_id: "abc123"  -- Links blanks to previous encounter context
```

**ID Flow Question (Addressed):**
- Non-encounter pages get `encounter_id: NULL` in `pass05_page_assignments`
- They still get `page_num` (page number is the ID for page tracking)
- No need for separate non-encounter IDs in `healthcare_encounters` table
- They flow through database as page assignments only, not as pending encounters

---

### Use Case 3: Epic Metadata Footer Pages (SOLVED BY V11)

**Scenario:**
Hospital discharge summary with Epic signature/metadata footer on last page.

**V11 Solution:**
- Prompt now includes these pages in encounter boundary
- Page 142 (Epic footer) is part of the 142-page encounter
- No separate non-encounter tracking needed

**Future B3 Enhancement:**
```sql
-- Page 142 tracked as part of encounter BUT classified
pass05_page_assignments:
  page_num: 142
  encounter_id: "abc123"
  justification: "Hospital admission (Epic metadata footer)"
  page_classification: "administrative"  -- NEW: Classifies as non-clinical
  is_clinically_relevant: false          -- NEW: Skip in Pass 2 clinical extraction
```

**Why Classify?**
- Pass 2 can skip `is_clinically_relevant: false` pages (save cost)
- Pass 3 might still want demographics from footer (use `page_classification` filter)
- Audit trail shows "142 pages, 141 clinical, 1 administrative"

---

### Use Case 4: Mid-Document Blank Separator Pages

**Scenario:**
Hospital admission with blank page between Day 1 notes and Day 2 notes (page break in Epic printout).

**V11 Solution:**
- Prompt instructs AI to include structural pages in encounter boundary
- Blank page 15 becomes part of pages 1-30 encounter

**Current Tracking:**
```sql
pass05_page_assignments:
  page_num: 15
  encounter_id: "abc123"
  justification: "Hospital admission (2022-11-29)"
  -- Same justification as all other pages in encounter
```

**Future B3 Enhancement:**
```sql
pass05_page_assignments:
  page_num: 15
  encounter_id: "abc123"
  justification: "Hospital admission - blank separator page"
  page_classification: "blank"           -- NEW
  is_clinically_relevant: false          -- NEW: Pass 2 skips
  related_encounter_id: "abc123"
```

**Why This Matters:**
- Pass 2 can filter out blank pages (cost optimization)
- System knows blank is intentional (not missing data)
- Maintains document structure integrity

---

### Use Case 5: Cover Pages

**Scenario:**
Document starts with cover page: "Discharge Summary for Emma Thompson, Melbourne Health Network"

**V11 Solution:**
- Cover page included in encounter boundary (document structure)

**Future B3 Enhancement:**
```sql
pass05_page_assignments:
  page_num: 1
  encounter_id: "abc123"
  justification: "Hospital admission - cover page"
  page_classification: "cover_page"      -- NEW
  is_clinically_relevant: false          -- NEW: No clinical entities on cover
```

**Pass 2 Behavior:**
- Skip clinical extraction (no entities)
- Extract patient demographics if present (name, DOB from cover)
- Cost optimization: 1 demographic query vs full clinical extraction

---

### Use Case 6: Table of Contents Pages

**Scenario:**
Multi-encounter document (5 encounters) with TOC on page 1 listing all encounters.

**Current V11 Behavior:**
- TOC page might be assigned to first encounter (if it starts on page 1)
- OR TOC has no assignment (if encounters start on page 2)

**Proposed B3 Behavior:**
```sql
pass05_page_assignments:
  page_num: 1
  encounter_id: NULL                      -- Not part of any single encounter
  justification: "Table of contents for multi-encounter document"
  page_classification: "table_of_contents"
  is_clinically_relevant: false
  metadata: {
    "precedes_encounter_ids": ["enc1", "enc2", "enc3", "enc4", "enc5"],
    "document_type": "multi_encounter_collection"
  }
```

**Why This Matters:**
- TOC not artificially assigned to encounter 1
- Future passes know this page references multiple encounters
- Document structure preserved

---

### Use Case 7: File Amalgamation Artifacts

**Scenario:**
User uploads 3 PDFs merged into 1 file. Scanner added separator pages: "Document 2 of 3", "Document 3 of 3"

**Current V11 Behavior:**
- Separator pages might create false encounters (if AI detects "Document 2" as encounter title)
- OR separators might split encounters incorrectly

**Proposed B3 Behavior:**

**AI Prompt Output:**
```json
{
  "encounters": [
    // Encounter 1: Pages 1-50
    // Encounter 2: Pages 52-100
    // Encounter 3: Pages 102-150
  ],
  "page_assignments": [
    {"page": 51, "encounter_index": null, "classification": "separator"},
    {"page": 101, "encounter_index": null, "classification": "separator"}
  ]
}
```

**Database Storage:**
```sql
-- Page 51: Separator
pass05_page_assignments:
  page_num: 51
  encounter_id: NULL
  justification: "File merge separator - 'Document 2 of 3'"
  page_classification: "separator"
  is_clinically_relevant: false
  metadata: {
    "separator_text": "Document 2 of 3",
    "separates_encounter_ids": ["enc1", "enc2"]
  }
```

**Why This Matters:**
- AI explicitly identifies and classifies separators (not false encounters)
- Future passes skip separator pages
- Audit trail shows file structure

---

### Use Case 8: Scan Artifacts (Blank/Noise Pages)

**Scenario:**
Scanner auto-fed blank page from paper tray, or page has only scanner noise (no text).

**Proposed B3 Behavior:**
```sql
pass05_page_assignments:
  page_num: 73
  encounter_id: NULL
  justification: "Scan artifact - blank page with no content"
  page_classification: "artifact"
  is_clinically_relevant: false
  metadata: {
    "artifact_type": "blank_scan",
    "ocr_confidence": 0.0
  }
```

**AI Detection:**
- AI receives OCR text = "" (empty)
- AI outputs: "No healthcare content detected, likely scan artifact"
- System creates non-encounter page assignment

---

### Use Case 9: Duplicate Pages (INTENTIONAL PASS-THROUGH)

**Scenario:**
Page 5 scanned twice. Pages 5 and 6 have identical content.

**RECOMMENDED APPROACH: Let It Pass Through**

**Rationale:**
- Pass 0.5 doesn't do de-duplication (not its job)
- Both pages assigned to same encounter (correct)
- Pass 2 (Clinical Extraction) will detect duplicate entities and de-duplicate
- Pass 3 (Narrative Generation) won't show duplicates in patient timeline

**Current Behavior (Keep As-Is):**
```sql
pass05_page_assignments:
  page_num: 5, encounter_id: "abc123", justification: "GP visit"
  page_num: 6, encounter_id: "abc123", justification: "GP visit"
```

**Why Not Detect Duplicates in Pass 0.5:**
- Requires content comparison (expensive)
- False positives possible (similar but not identical pages)
- Pass 2 is better equipped (has entity-level data for comparison)
- Pass 0.5 goal: Identify encounters, not clean data

**Optional Future Enhancement (Low Priority):**
- Add `duplicate_detection_score` in Pass 2
- Link duplicate pages: `page_5 is_duplicate_of page_6`

---

### Use Case 10: Wrong Patient Documents (PROFILE CLASSIFICATION HANDLES THIS)

**Scenario:**
100-page upload. Pages 1-50 are Patient A (Emma Thompson), pages 51-100 are Patient B (John Smith).

**Current V11 Behavior (CORRECT):**
- AI detects 2 encounters with different patient identities
- Encounter 1: `patient_full_name: "Emma Thompson"`
- Encounter 2: `patient_full_name: "John Smith"`
- Both encounters written to `healthcare_encounters`

**Profile Classification System (Existing):**
1. Reconciler extracts identities from both encounters
2. System matches Encounter 1 to Emma's profile (auth user's profile)
3. System sees Encounter 2 has different identity (John Smith)
4. **Manual Review Queue:** Encounter 2 flagged for user review
5. **User Action Options:**
   - Create new sub-profile for John (spouse/child)
   - Link to existing John sub-profile
   - Mark as error and delete

**No Changes Needed to B3 Design:**
- Profile classification already handles this
- Both encounters tracked correctly
- System raises to user for decision

**Optional Data Quality Warning (Low Priority):**
```sql
pass05_page_assignments:
  page_num: 51
  encounter_id: "enc_john"
  justification: "GP visit for John Smith"
  page_classification: "clinical"
  is_clinically_relevant: true
  data_quality_warnings: ["patient_identity_change"]  -- Optional flag
```

---

### Use Case 11: Non-Medical Pages in Medical Documents

**Scenario:**
50-page upload. Page 25 is an insurance claim form (non-clinical administrative document).

**Current V11 Behavior:**
- AI might create separate pseudo-encounter for insurance form
- `is_real_world_visit: false` (correct)
- `encounter_type: "insurance_form"` (correct)

**Proposed B3 Enhancement:**
```sql
pass05_page_assignments:
  page_num: 25
  encounter_id: "enc_insurance"
  justification: "Insurance pre-authorization form"
  page_classification: "administrative"
  is_clinically_relevant: false          -- Pass 2 skips clinical extraction
  related_encounter_id: "enc_hospital"   -- Links to related hospital admission
```

**Why Classify:**
- Pass 2 can skip `is_clinically_relevant: false` pages
- System knows this is administrative, not clinical
- Related encounter link shows context

---

### Use Case 12: End-of-Document Markers

**Scenario:**
Last page has only: "*** END OF RECORD ***"

**V11 Solution:**
- If this is last page of encounter, included in encounter boundary (document structure)

**Future B3 Enhancement:**
```sql
pass05_page_assignments:
  page_num: 142
  encounter_id: "abc123"
  justification: "Hospital admission - end of document marker"
  page_classification: "administrative"
  is_clinically_relevant: false
```

**Pass 2 Behavior:**
- Skip extraction (no clinical content)
- Marker page verifies document completeness

---

## ARCHITECTURAL SOLUTION: OPTION B3

### Core Design Principle

**Non-encounter pages flow through the SAME database pathway as encounter pages:**
- They get records in `pass05_page_assignments`
- They use `encounter_id: NULL` to indicate no encounter
- They DON'T create records in `healthcare_encounters` table
- They DON'T create pending encounters (no reconciliation needed)

### Database Schema Changes

**Migration 63: Add Page Classification to pass05_page_assignments**

```sql
-- Add classification columns to existing table
ALTER TABLE pass05_page_assignments
  ADD COLUMN page_classification TEXT CHECK (page_classification IN (
    'clinical',           -- Has clinical content (default for existing records)
    'administrative',     -- Signatures, demographics, Epic metadata, insurance forms
    'blank',             -- Blank pages (within or between encounters)
    'cover_page',        -- Document cover/title page
    'table_of_contents', -- TOC for multi-encounter documents
    'separator',         -- File merge separator pages
    'artifact',          -- Scan/print artifacts
    'end_marker'         -- End of document marker pages
  )) DEFAULT 'clinical',

  ADD COLUMN is_clinically_relevant BOOLEAN DEFAULT true;

-- Optional: Enhanced tracking
ALTER TABLE pass05_page_assignments
  ADD COLUMN related_encounter_id UUID REFERENCES healthcare_encounters(id),
  ADD COLUMN metadata JSONB;

-- Backfill existing records
UPDATE pass05_page_assignments
SET
  page_classification = 'clinical',
  is_clinically_relevant = true
WHERE page_classification IS NULL;

-- Create index for Pass 2 filtering
CREATE INDEX idx_page_assignments_clinically_relevant
ON pass05_page_assignments(shell_file_id, is_clinically_relevant)
WHERE is_clinically_relevant = true;

COMMENT ON COLUMN pass05_page_assignments.page_classification IS
  'Migration 63: Classifies page type for downstream pass filtering.
   clinical: Has clinical entities for Pass 2 extraction.
   administrative: Demographics/metadata only, skip clinical extraction.
   blank/separator/artifact: Skip all processing in Pass 2/3 (cost optimization).';

COMMENT ON COLUMN pass05_page_assignments.is_clinically_relevant IS
  'Migration 63: Boolean flag for quick filtering in Pass 2/3.
   true: Send to clinical extraction (Pass 2), include in narrative (Pass 3).
   false: Skip processing or extract demographics only (cost optimization).';
```

---

## AI PROMPT CHANGES

### What AI Needs to Output

**Current V11 Output (Post-Fix):**
```json
{
  "encounters": [...],
  "page_assignments": [
    {"page": 1, "encounter_index": 0},
    {"page": 2, "encounter_index": 0}
  ]
}
```

**Proposed B3 Output:**
```json
{
  "encounters": [...],
  "page_assignments": [
    {
      "page": 1,
      "encounter_index": 0,
      "page_classification": "clinical",
      "is_clinically_relevant": true
    },
    {
      "page": 2,
      "encounter_index": 0,
      "page_classification": "administrative",
      "is_clinically_relevant": false,
      "classification_reason": "Epic signature footer with patient demographics"
    },
    {
      "page": 3,
      "encounter_index": null,  -- No encounter
      "page_classification": "blank",
      "is_clinically_relevant": false,
      "classification_reason": "Blank page following encounter"
    }
  ]
}
```

### Prompt Additions for B3 (Future V12)

**Add new section after page_assignments output schema:**

```
## PAGE CLASSIFICATION

For EVERY page in page_assignments, classify the page type:

**Page Classifications:**
- `clinical`: Page has clinical content (diagnoses, procedures, clinical notes)
- `administrative`: Page has only administrative content (signatures, demographics, Epic metadata, insurance forms)
- `blank`: Blank page (within or between encounters)
- `cover_page`: Document cover/title page
- `table_of_contents`: TOC for multi-encounter document
- `separator`: File merge separator (e.g., "Document 2 of 3")
- `artifact`: Scan/print artifacts (noise, blank scans)
- `end_marker`: End of document marker (e.g., "*** END OF RECORD ***")

**Is Clinically Relevant:**
- `true`: Page has clinical content that Pass 2 should extract
- `false`: Page should be skipped or only have demographics extracted (cost optimization)

**Classification Reason:**
- Brief explanation of why this classification was chosen
- Example: "Epic signature footer with patient demographics only"
- Example: "Blank page following encounter - no content"

**Example Output:**
```json
"page_assignments": [
  {
    "page": 142,
    "encounter_index": 0,
    "page_classification": "administrative",
    "is_clinically_relevant": false,
    "classification_reason": "Epic metadata footer - signatures and patient ID"
  },
  {
    "page": 143,
    "encounter_index": null,
    "page_classification": "blank",
    "is_clinically_relevant": false,
    "classification_reason": "Blank page after encounter ends"
  }
]
```
```

---

## DATA FLOW: HOW NON-ENCOUNTERS FLOW THROUGH THE SYSTEM

### Current V11 Flow (Encounter Pages Only)

```
1. AI detects encounters in chunk
2. AI outputs page_assignments (encounter pages only)
3. Chunk processor writes to pass05_page_assignments
4. Reconciler processes pending encounters
5. Final encounters written to healthcare_encounters
```

### Proposed B3 Flow (All Pages)

```
1. AI detects encounters in chunk
2. AI outputs page_assignments for ALL pages:
   - Encounter pages: encounter_index = 0,1,2... + classification
   - Non-encounter pages: encounter_index = null + classification
3. Chunk processor writes to pass05_page_assignments:
   - Encounter pages: encounter_id populated
   - Non-encounter pages: encounter_id = NULL
4. Reconciler processes pending encounters (skips null encounter_id rows)
5. Final encounters written to healthcare_encounters
6. Pass 2 queries page_assignments with filter:
   WHERE is_clinically_relevant = true
   (Skips blank/administrative/artifact pages for cost optimization)
```

### ID Flow Question (Answered)

**Q: Do non-encounter pages need IDs?**

**A: No separate ID needed. Page tracking uses:**
- `shell_file_id` + `page_num` as composite key
- `encounter_id` can be NULL (indicates no encounter)
- `page_num` itself serves as the page identifier

**Database Records for Non-Encounter Pages:**
```sql
-- Non-encounter page record
INSERT INTO pass05_page_assignments (
  shell_file_id,
  page_num,
  encounter_id,  -- NULL for non-encounters
  justification,
  page_classification,
  is_clinically_relevant
) VALUES (
  'abc123',
  142,
  NULL,  -- No encounter
  'Blank page following encounter',
  'blank',
  false
);
```

**No Record Needed In:**
- `pass05_pending_encounters` (only for actual encounters)
- `healthcare_encounters` (only for final encounters)

---

## WHY PAGE CLASSIFICATION MATTERS: USE CASES

### Use Case A: Cost Optimization in Pass 2

**Without Classification:**
```typescript
// Pass 2: Process ALL pages
const pages = await supabase
  .from('pass05_page_assignments')
  .select('*')
  .eq('shell_file_id', fileId);

// Send all 142 pages to GPT-4 for clinical extraction
// Cost: 142 pages × $0.05 = $7.10
```

**With Classification:**
```typescript
// Pass 2: Process ONLY clinically relevant pages
const pages = await supabase
  .from('pass05_page_assignments')
  .select('*')
  .eq('shell_file_id', fileId)
  .eq('is_clinically_relevant', true);  // Filter out blank/admin pages

// Send only 140 pages to GPT-4 (skip 2 blank pages)
// Cost: 140 pages × $0.05 = $7.00
// Savings: $0.10 per document (1.4% reduction)
```

**At Scale:**
- 10,000 documents/month
- Average 5 blank/administrative pages per doc
- Savings: $0.25 per doc × 10,000 = $2,500/month

### Use Case B: Intelligent Processing in Pass 2

**With Classification, Pass 2 Can:**

```typescript
const pages = await supabase
  .from('pass05_page_assignments')
  .select('*')
  .eq('shell_file_id', fileId);

for (const page of pages) {
  if (page.page_classification === 'blank') {
    // Skip entirely (no API call)
    continue;
  }

  if (page.page_classification === 'administrative') {
    // Lightweight processing: Extract demographics only
    await extractDemographics(page);  // Cheaper, faster
    continue;
  }

  if (page.page_classification === 'clinical') {
    // Full processing: Extract all clinical entities
    await extractClinicalEntities(page);  // Expensive but necessary
  }
}
```

**Benefits:**
1. **Cost:** Skip blank pages, lightweight processing for admin pages
2. **Speed:** Faster overall processing (fewer API calls)
3. **Accuracy:** Tailored extraction per page type
4. **Audit:** Clear record of why pages were skipped

### Use Case C: Document Completeness Verification

**With Classification:**
```typescript
// Verify all pages processed
const stats = await supabase
  .from('pass05_page_assignments')
  .select('page_classification')
  .eq('shell_file_id', fileId);

// User uploaded 142 pages
// System tracked:
// - 139 clinical pages
// - 2 administrative pages
// - 1 blank page
// Total: 142 pages ✓ (Complete)
```

**Without Classification:**
```typescript
// Only 141 pages tracked
// Where is page 142?
// - Bug? Missing page?
// - Intentionally excluded?
// - Blank page?
// → No way to know
```

### Use Case D: User Interface Display

**With Classification, UI Can Show:**
```
Document: 006_Emma_Thompson_Hospital_Encounter_Summary.pdf
Pages: 142

Encounters Detected: 1
└─ Hospital Admission (Nov 29 - Dec 7, 2022)
   Pages: 1-142
   └─ Clinical Content: Pages 1-141
   └─ Administrative: Page 142 (Epic signature footer)

Processing Statistics:
- Clinical pages: 141
- Administrative pages: 1
- Blank pages: 0
- Total pages processed: 142 ✓
```

**Without Classification:**
```
Document: 006_Emma_Thompson_Hospital_Encounter_Summary.pdf
Pages: 142 (?)

Encounters Detected: 1
└─ Hospital Admission (Nov 29 - Dec 7, 2022)
   Pages: 1-141

(User wonders: What happened to page 142?)
```

---

## IMPLEMENTATION ROADMAP

### Phase 0: V11 Prompt Fix (COMPLETED - November 21, 2025)

**Changes Made:**
- Updated encounter boundary detection instructions
- Added "Document Structure vs Clinical Content" section
- Prompt now includes administrative/metadata pages in encounter boundaries
- Tested with 142-page file: Page 142 now included in encounter

**Result:**
- Epic signature footers included in encounter document structure
- Blank separator pages within encounters now included
- Cover pages and TOC pages now handled correctly

### Phase 1: Schema Enhancement (Migration 63 - Future)

**Tasks:**
1. Design Migration 63 schema changes
2. Add `page_classification` and `is_clinically_relevant` columns
3. Backfill existing records with `clinical` classification
4. Create indexes for Pass 2 filtering

**Timeline:** Post-launch (when cost optimization becomes priority)

### Phase 2: AI Prompt V12 Enhancement (Future)

**Tasks:**
1. Add page classification instructions to prompt
2. Update AI response schema to include classifications
3. Add classification reasoning field
4. Test with edge case documents (blank pages, TOC, etc.)

**Timeline:** After Phase 1 schema deployed

### Phase 3: TypeScript Integration (Future)

**Tasks:**
1. Update AI response TypeScript interfaces
2. Update chunk processor to store classifications
3. Update Pass 2 to filter by `is_clinically_relevant`
4. Add UI display of page classification stats

**Timeline:** After Phase 2 prompt tested

### Phase 4: Edge Case Testing (Future)

**Test Documents:**
1. 1-page blank PDF
2. 10-page blank PDF
3. 1 clinical + 9 blank pages
4. Multi-encounter with TOC
5. File amalgamation (3 PDFs merged with separators)
6. Document with duplicate pages
7. Mixed-patient document
8. Insurance forms mixed with clinical notes

**Timeline:** After Phase 3 integrated

---

## BENEFITS SUMMARY

### Cost Optimization

**Annual Savings (Estimated):**
- 10,000 documents/year
- Average 142 pages/document
- Average 5 non-clinical pages/document (3.5% of pages)
- Pass 2 cost: $0.05/page
- **Savings: 10,000 × 5 pages × $0.05 = $2,500/year**

### Processing Speed

**Time Savings:**
- Skip 3.5% of pages in Pass 2/3
- Faster overall pipeline completion
- Better user experience (quicker results)

### Data Quality

**Completeness:**
- All 142 pages tracked (not just 141)
- Clear audit trail for every page
- Document structure preserved

**Accuracy:**
- Appropriate processing per page type
- No wasted AI calls on blank pages
- Tailored extraction (demographics from admin pages, entities from clinical pages)

### Observability

**System Visibility:**
- Know exactly what happened to every page
- Track blank/artifact rates (quality metrics)
- Identify problematic document sources

**User Transparency:**
- UI can show: "142 pages processed: 141 clinical, 1 administrative"
- Clear explanation for "No encounters found" (blank document)

---

## FUTURE CONSIDERATIONS

### Pass 2 Integration

**Clinical Extraction Query:**
```sql
-- Only process clinically relevant pages
SELECT * FROM pass05_page_assignments
WHERE shell_file_id = $1
  AND is_clinically_relevant = true
ORDER BY page_num;
```

### Pass 3 Integration

**Narrative Generation:**
- Include clinical pages in timeline
- Exclude blank/artifact pages
- Optionally show administrative pages in "Document Details" section

### Analytics

**Track Metrics:**
- Average blank pages per document
- Most common page classifications
- Cost savings from classification filtering
- Document quality scores (high blank ratio = poor quality scan)

---

## OPEN QUESTIONS

1. **Classification Accuracy:** How accurate is AI at classifying pages? Need testing.
2. **Reclassification:** Should users be able to override AI page classification?
3. **Hybrid Pages:** How to handle pages with both clinical and administrative content? (e.g., clinical note with Epic footer)
4. **Confidence Scoring:** Should page classification have confidence scores like encounters?
5. **Audit Requirements:** Do regulatory/legal requirements mandate tracking all pages (even blanks)?

---

## DECISION LOG

**November 21, 2025:**
- V11 prompt fix deployed (boundary detection)
- B3 design documented for future enhancement
- Agreed to let duplicate pages pass through (Pass 2 handles deduplication)
- Agreed profile classification handles wrong-patient scenarios (no changes needed)
- Identified cost optimization as primary driver for B3 implementation

**Next Review:** Post-launch, when processing volume justifies cost optimization investment
