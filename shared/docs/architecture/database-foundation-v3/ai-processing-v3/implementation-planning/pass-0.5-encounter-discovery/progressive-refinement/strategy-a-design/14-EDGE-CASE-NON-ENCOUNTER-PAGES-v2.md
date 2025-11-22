# Edge Case Non-Encounter Pages - Architectural Design (v2)

**Status:** Proposed Design (Future Enhancement)
**Date:** November 21, 2025 (v2: November 22, 2025)
**Related:** V11 Prompt Boundary Detection Fix (Deployed)
**Priority:** Future Enhancement (Post-Launch)
**Version:** 2.0 - Updated with external review responses and clarifications

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

## RESPONSE TO EXTERNAL REVIEW (November 22, 2025)

An external AI assistant (Gemini 3) reviewed this document and provided feedback. Here are the key points and our responses:

### Review Point A: "Unassigned Clinical" Handling (Orphan Clinical Pages)

**Reviewer's Suggestion:**
Add an `orphan_clinical` classification for pages with clinical content that don't fit into encounters. Example: loose lab result page with no encounter context.

**System Owner Response:**
✅ **Already Handled by Current System** - This concern is addressed by the existing pseudo-encounter mechanism.

**How the Current V11 Prompt Handles This:**
```
V11 Prompt (line 86): "If healthcare-related content exists, create an encounter for it."
```

**Actual Behavior:**
- Loose lab result page detected → System creates a pseudo-encounter
- Sets `is_real_world_visit: false` (fails the "Actuality" three-part test)
- Sets `encounter_type: "lab_result"` (or other appropriate type)
- Data is captured, processed, and stored safely
- Won't clutter main dashboard timeline (pseudo-encounters filtered out by default)
- Remains searchable and accessible when user needs it

**Architectural Decision:**
The pseudo-encounter mechanism is the **correct architectural pattern** for this use case. It's already implemented and working. Adding a separate `orphan_clinical` classification would be redundant and over-engineering.

**Verdict:** No changes needed. Pseudo-encounters solve this problem elegantly.

---

### Review Point B: Document Heatmap Visualization

**Reviewer's Idea:**
Create a visual "heatmap" showing page classifications: `[Clinical][Clinical][Admin][Blank][Clinical]`

**System Owner Response:**
✅ **Excellent Feature - Planned for Future Implementation**

**Enhanced Vision (Expanded from Review):**
1. **"Audit Processing" Feature:**
   - View processed document with rich metadata UX labeling
   - Visual heatmap-style presentation
   - Encounter blocks highlighted and color-coded
   - Clinical vs non-clinical page differentiation
   - Processing status for each page

2. **Trust & Transparency Benefits:**
   - Proves to users that Exora "read every page"
   - Instills confidence in processing accuracy
   - Provides "wow factor" for users viewing their processed documents
   - Useful for users, support teams, AND engineers during refinement

3. **Integration with Click-to-Source:**
   - Any clinical entity on dashboard → click to view source document
   - Opens original PDF at relevant page
   - Shows heatmap-annotated version with processing metadata
   - Implements future design spec feature for provenance tracking

**Implementation Plan:**
- Depends on B3 schema implementation (Phase 1-3)
- Planned as Phase 4 enhancement
- See separate feature specification: `15-DOCUMENT-AUDIT-VIEWER-HEATMAP-UI.md`

**Verdict:** Endorsed as future feature. Transforms backend architecture into frontend superpowers.

---

### Review Point C: "Ghost Encounters" from Separator Pages

**Reviewer's Concern:**
Separator pages (e.g., "Document 2 of 3") might trigger false positive encounters. Suggested explicit AI training to recognize separator sheets.

**System Owner Response:**
✅ **Low-Priority Concern - Current System Handles Well Enough**

**Blast Radius Analysis:**
1. **What happens if separator creates encounter:**
   - Encounter created with `is_real_world_visit: false` (pseudo-encounter)
   - No clinical entities extracted (empty encounter)
   - No patient identity attached (profile classification filters it)
   - Won't show on main dashboard timeline

2. **Only visible if:**
   - User explicitly sets filter to "Show All" (including pseudo-encounters)
   - Minimal user impact

3. **Future Enhancement (Low Priority):**
   - B3 schema adds `page_classification: "separator"`
   - Could add `encounter_type: "non_medical_document"` sub-classification
   - Hard-code frontend to filter out certain encounter types
   - Not blocking for launch

**Architectural Assessment:**
The pseudo-encounter mechanism already mitigates this gracefully. "Ghost encounters" are invisible to users unless they opt in to view all pseudo-encounters. This is **good enough for launch**.

**Verdict:** Low-priority optimization. B3 implementation will make this even cleaner, but it's not critical.

---

### Review Point D: Safety Valve Principle (Classification Confidence)

**Reviewer's Suggestion:**
Add `classification_confidence` (0.0-1.0) field. If AI classifies page as "blank" with confidence < 0.9, force `is_clinically_relevant: true` (process it anyway).

**System Owner Response:**
⚠️ **Smart Idea - But Too Complex for Phase 1**

**Assessment:**
- Thoughtful safety mechanism to prevent data loss
- However, adds significant complexity for marginal benefit
- Better approach for Phase 1: Default to "process it" if AI is uncertain
- Can add confidence scoring in later phase if testing shows accuracy issues

**Phase 1 Approach (Simpler):**
```typescript
// Default logic: When in doubt, process it
if (aiClassification === 'blank' && uncertaintyDetected) {
  page_classification = 'clinical';  // Safe default
  is_clinically_relevant = true;     // Process it
}
```

**Phase 4+ Enhancement (If Needed):**
- Add `classification_confidence` field after testing Phase 1-3
- Implement confidence-based fallback logic
- Only if testing shows unacceptable false-negative rate

**Verdict:** Defer confidence scoring to Phase 4+. Start simple in Phase 1.

---

### Summary of Review Responses

| Review Point | Response | Action |
|--------------|----------|--------|
| A. Orphan Clinical Pages | ✅ Already handled by pseudo-encounters | No changes needed |
| B. Document Heatmap UI | ✅ Excellent idea - planned for Phase 4 | Create separate feature spec |
| C. Ghost Encounters | ✅ Low-priority - current system handles well | B3 will optimize further |
| D. Classification Confidence | ⚠️ Good idea - defer to Phase 4+ | Start simple in Phase 1 |

**Key Takeaway:**
The B3 design remains sound. The review validated our approach and suggested enhancements that align with our phased roadmap. No blocking issues identified.

---

## DECISION LOG

**November 21, 2025:**
- V11 prompt fix deployed (boundary detection)
- B3 design documented for future enhancement
- Agreed to let duplicate pages pass through (Pass 2 handles deduplication)
- Agreed profile classification handles wrong-patient scenarios (no changes needed)
- Identified cost optimization as primary driver for B3 implementation

**November 22, 2025 (v2 Update):**
- External AI assistant (Gemini 3) reviewed design
- Confirmed pseudo-encounter mechanism handles "orphan clinical" pages (no new classification needed)
- Endorsed Document Heatmap visualization as killer feature for Phase 4
- Assessed "ghost encounters" as low-priority concern (current system handles well)
- Decided to defer classification confidence scoring to Phase 4+ (start simple in Phase 1)
- Created separate UI feature specification: `15-DOCUMENT-AUDIT-VIEWER-HEATMAP-UI.md`

**Next Review:** Post-launch, when processing volume justifies cost optimization investment









discussion between claude sonnet4.5 and Xavier - 22nd Novemeber 2025:
Xavier: 
1. I think I agree with you on a hybrid approach for option C. For option C, we should also update the prompt and scripts so that the output integrates with the updated table schema, making everything ready for when we decide to build the UI feature. We won’t need any special testing beyond our regular system tests. Once we update the script and the table, we can just verify at a basic level that it’s working—no extended two-week testing. When Pass 2 development comes up, we can decide if we want to start filtering what Pass 2 receives; that decision can wait. In the meantime, we’ll keep passing all pages to Pass 2, and only start filtering and saving costs by excluding non-health content once we’re certain the new logic works. The other point I wanted to discuss is that the page classification options you’ve provided feel like a lot. Why do we need so many? Couldn’t we just use two options: health content and non-health content? The main logic would be that if a page or its encounter contains any health content, it’s marked as health content; only pages completely devoid of health content would be marked as non-health content. Does that make sense? Please reply to confirm you understand what I’m requesting so I can review your plan and give feedback or approval.

Sonnet 4.5:
⏺ I understand your position perfectly. Let me confirm what you're proposing and then give you my
  revised recommendation.

  What You're Proposing (My Understanding)

  Part 1: Full Implementation Now (Not Just Schema)

  Your Plan:
  - ✅ Add schema columns (Migration 63)
  - ✅ Update V11 prompt to V12 with classification instructions
  - ✅ Update chunk-processor.ts to store classifications
  - ✅ Do basic smoke testing ("does it work?"), but NOT 2 weeks of accuracy tuning
  - ✅ Everything ready to use, just not actively filtering yet

  Pass 2 Decision Deferred:
  - When Pass 2 comes around, decide then whether to filter
  - Default: Pass everything to Pass 2 initially (safe)
  - Later: Start filtering non-health content when confident system works

  Timeline Impact:
  - Not 2-3 weeks (my pessimistic estimate)
  - More like 3-5 days (prompt update + script changes + basic testing)
  - Acceptable opportunity cost since it's quick

  ---
  Part 2: Simplified Classification Schema

  Your Question:
  Why have 8 different classification types (clinical, administrative, blank, cover_page,
  table_of_contents, separator, artifact, end_marker)?

  Your Proposed Alternative:
  Just 2 types:
  - health_content - Page/encounter contains ANY health content at all
  - non_health_content - Page/encounter contains ZERO health content

  Your Logic:
  - If encounter has health content → Mark entire encounter as health_content
  - Only mark non_health_content if page is completely devoid of health info
  - Binary classification = simpler AI task, clearer logic

  ---
  My Analysis of Your Simplified Schema

  ✅ I AGREE - This Is Better

  Why the simplified approach is superior:

  1. Simpler AI Task:
    - Binary question: "Does this page have health content? Yes/No"
    - Much easier than: "Is this clinical vs administrative vs blank vs cover_page vs..."
    - Higher accuracy, less prompt complexity
  2. Clearer Business Logic:
    - Your goal: Don't waste money processing non-health pages in Pass 2
    - You don't care WHY it's non-health (blank vs separator vs artifact)
    - You only care: "Should Pass 2 process this?"
  3. Future-Proof:
    - If you later need finer granularity (blank vs separator), you can add it
    - But you might never need it
    - YAGNI (You Ain't Gonna Need It) principle applies
  4. Aligns with Your Encounter Logic:
    - Encounters already use is_real_world_visit (binary flag)
    - This mirrors that pattern: is_health_content (binary flag)

  ---
  Revised Recommendation: Your Hybrid Approach ✅

  I fully support your plan with the simplified schema. Here's what I recommend:

  Migration 63 (Simplified Schema)

  -- Add simplified classification columns
  ALTER TABLE pass05_page_assignments
    ADD COLUMN is_health_content BOOLEAN DEFAULT true,
    ADD COLUMN classification_reason TEXT;

  -- Create index for Pass 2 filtering (when you decide to use it)
  CREATE INDEX idx_page_assignments_health_content
  ON pass05_page_assignments(shell_file_id, is_health_content)
  WHERE is_health_content = true;

  COMMENT ON COLUMN pass05_page_assignments.is_health_content IS
    'Migration 63: Binary flag indicating if page contains ANY health-related content.
     true: Page has health content (clinical notes, lab results, medications, diagnoses, etc.)
     false: Page is completely non-health (blank pages, file separators, receipts, etc.)
     Logic: If encounter contains ANY health content, entire encounter is health_content.
     Only mark false if page has ZERO health information.';

  COMMENT ON COLUMN pass05_page_assignments.classification_reason IS
    'Migration 63: AI explanation for why page was classified as health/non-health.
     Examples: "Clinical notes with diagnoses and medications" (health_content)
               "Blank page following encounter" (non_health_content)
               "File separator page - Document 2 of 3" (non_health_content)';

  Why this schema works:
  - ✅ Simple boolean flag (no complex enums)
  - ✅ classification_reason gives you the "why" for debugging/audit
  - ✅ Default true is safe (process everything unless AI explicitly says it's non-health)
  - ✅ Can add finer granularity later if needed (e.g., add page_type enum column)

  ---
  V12 Prompt Update (Simplified Classification)

  Add this section to V11 prompt:

  // After the page_assignments output schema section:

  ## PAGE HEALTH CONTENT CLASSIFICATION

  For EVERY page in page_assignments, determine if it contains health-related content:

  **Is Health Content (true/false):**
  - **true**: Page contains ANY health-related information:
    - Clinical notes, diagnoses, procedures, medications
    - Lab results, vital signs, imaging reports
    - Patient demographics, medical history
    - Provider names, facility names, encounter dates
    - Treatment plans, discharge summaries
    - Insurance information related to healthcare

  - **false**: Page contains ZERO health-related information:
    - Completely blank pages
    - File merge separators ("Document 2 of 3")
    - Scan artifacts (noise, paper feed errors)
    - Non-medical receipts or forms
    - Generic cover pages with no patient/provider info

  **CRITICAL RULE - Encounter-Level Logic:**
  If an encounter contains ANY health content on ANY page, mark ALL pages in that encounter as
  `is_health_content: true`.
  Only mark pages as `is_health_content: false` if they are:
  1. NOT part of any encounter (encounter_index: null), AND
  2. Contain zero health information

  **Classification Reason:**
  Provide a brief explanation (1 sentence) for the classification decision.

  **Example Output:**
  ```json
  "page_assignments": [
    {
      "page": 1,
      "encounter_index": 0,
      "is_health_content": true,
      "classification_reason": "Clinical consultation notes with diagnoses and treatment plan"
    },
    {
      "page": 142,
      "encounter_index": 0,
      "is_health_content": true,
      "classification_reason": "Epic signature footer (part of encounter document structure)"
    },
    {
      "page": 143,
      "encounter_index": null,
      "is_health_content": false,
      "classification_reason": "Blank page following encounter - no health content"
    }
  ]

  When in Doubt:
  Default to is_health_content: true. It is better to process a blank page than to skip a page with
  faint but important health information.

  ---

  ### TypeScript Updates

  **Update PendingEncounter interface:**
  ```typescript
  export interface PendingEncounter extends PositionFields {
    // ... existing fields
    is_health_content?: boolean;          // NEW: Binary health content flag
    classification_reason?: string;       // NEW: AI explanation
  }

  Update chunk-processor.ts (parse V12 response):
  // In parseV12Response() function
  pending.is_health_content = aiPage.is_health_content ?? true;  // Default true (safe)
  pending.classification_reason = aiPage.classification_reason || null;

  Update database.ts (store classifications):
  // In insertPendingEncounterV3() and batchInsertPageAssignments()
  // Add to INSERT statement:
  is_health_content: pending.is_health_content ?? true,
  classification_reason: pending.classification_reason

  ---
  Pass 2 Integration (Future Decision Point)

  When you build Pass 2, you have two options:

  Option A: Process Everything (Initial Safe Approach)
  // Pass 2: Get all pages, ignore classification
  const pages = await supabase
    .from('pass05_page_assignments')
    .select('*')
    .eq('shell_file_id', fileId)
    .order('page_num');
  // Process all pages through clinical extraction

  Option B: Filter Non-Health Pages (Cost Optimization)
  // Pass 2: Only process health content
  const pages = await supabase
    .from('pass05_page_assignments')
    .select('*')
    .eq('shell_file_id', fileId)
    .eq('is_health_content', true)  // Skip non-health pages
    .order('page_num');
  // Only process health-content pages (save cost)

  Your Decision Timeline:
  - Initially: Use Option A (safe, verify classification works)
  - After 100+ documents: Review classification accuracy
  - If accurate (>95% correct): Switch to Option B (save costs)
  - If inaccurate: Tune V12 prompt, re-test, then switch

  ---
  Implementation Timeline (Your Approach)

  Week 1: Schema + Prompt + Basic Integration

  Day 1-2: Database Migration
  - Create Migration 63 with simplified schema
  - Execute migration
  - Update source of truth schema files

  Day 3-4: Prompt + TypeScript
  - Update V11 → V12 with health content classification section
  - Update TypeScript interfaces (types.ts)
  - Update chunk-processor.ts to parse is_health_content
  - Update database.ts to store classifications

  Day 5: Basic Testing
  - Upload 3-5 test documents (mix of clinical, blank, separator pages)
  - Verify classifications stored in database
  - Spot-check: Are blank pages marked false? Are clinical pages marked true?
  - If grossly wrong, tweak prompt wording
  - If reasonable, ship it

  Total Time: 5 days (not 2-3 weeks)

  ---
  Future: Pass 2 Decision Point

  When you start building Pass 2 (Week 10+):
  - Decide: Option A (process everything) or Option B (filter non-health)
  - Default: Option A initially (safe)
  - Monitor: Track how many pages are marked is_health_content: false
  - If significant (>5% of pages), consider Option B for cost savings

  ---
  Why This Plan Works Better Than Mine 🎯

  Your approach captures:
  1. ✅ Clean architecture (schema ready)
  2. ✅ Simple classification (binary, not 8-way enum)
  3. ✅ Minimal time investment (5 days, not weeks)
  4. ✅ Flexibility deferred to Pass 2 (decide filtering later)
  5. ✅ No over-engineering (YAGNI principle)

  My original objection (2-3 weeks of testing) was based on:
  - Complex 8-way classification (harder to tune)
  - Mandatory accuracy testing before launch

  Your counterpoint is valid:
  - Binary classification is simpler (easier to get right)
  - You'll test naturally during regular Pass 0.5 testing
  - Filtering decision deferred to Pass 2 (when you have real data)

  ---
  Final Recommendation ✅

  I FULLY SUPPORT your hybrid approach with simplified schema.

  Do This:
  1. ✅ Migration 63 with is_health_content (boolean) + classification_reason (text)
  2. ✅ Update V11 → V12 with binary health content classification
  3. ✅ Update TypeScript to store classifications
  4. ✅ Basic smoke testing (5 docs, visual verification)
  5. ✅ Ship it and move on to Pass 2

  Don't Do This:
  - ❌ Complex 8-way enum (clinical/admin/blank/cover/toc/separator/artifact/end)
  - ❌ 2 weeks of accuracy tuning
  - ❌ Immediate filtering in Pass 2 (defer that decision)

  Timeline:
  - 5 days to implement
  - Then full focus on Pass 2 for next 8 weeks

  ---
  Confirmation Questions for You

  Before I create the migration and prompt updates, please confirm:

  1. Schema Confirmation:
    - Column 1: is_health_content BOOLEAN DEFAULT true
    - Column 2: classification_reason TEXT
    - No enum, just binary flag + freetext reason
    - Confirm? ✅ or ❌
  2. Encounter-Level Rule:
    - If encounter has ANY health content → ALL pages in encounter marked true
    - Only standalone pages (not in encounters) can be marked false
    - Confirm? ✅ or ❌
  3. Pass 2 Decision Deferred:
    - Build Pass 2 to process all pages initially (ignore is_health_content)
    - Decide filtering later after you verify classification accuracy
    - Confirm? ✅ or ❌
  4. Timeline:
    - 5 days implementation (schema + prompt + scripts + basic testing)
    - Then move to Pass 2 design
    - Confirm? ✅ or ❌

  If you confirm all 4, I'll create the migration script and V12 prompt updates for you.


I'm a bit confused—are we actually creating an encounter for a non-health content page or not? Is our model fundamentally page-focused for non-health content, or encounter-focused? I’m concerned this could create ambiguity in the AI prompt, so we need to clearly decide which orientation we have. Also, if we plan to create encounters for non-health content, how will these non-health content encounters interact with the pending-to-complete process during encounter reconciliation? Every step—across all tables and scripts—may need updates to accommodate the possibility of a non-health content 'encounter.' So the fundamental architectural question is: should we treat this as a page-centric or encounter-centric issue? Do non-health content pages actually need an encounter record? How should our system handle a single page, multiple pages, or even an entire file that contains no health content at all? Please consider and clarify all these aspects.


⏺ Excellent questions. You've identified a critical architectural ambiguity that needs resolving. Let
   me think through this systematically.

  The Core Question: Page-Centric vs Encounter-Centric?

  You're right to be confused - there's a fundamental tension here. Let me explore both approaches:

  ---
  Approach A: PAGE-CENTRIC (Non-Health Pages WITHOUT Encounters)

  How It Works

  Core Principle:
  - Health content pages → Create encounters → Flow through reconciliation
  - Non-health content pages → NO encounter → Just tracked in page_assignments

  Database Flow:

  -- Health content page (normal flow):
  pass05_page_assignments:
    page_num: 1
    encounter_id: "abc123"          -- ✅ Has encounter
    is_health_content: true

  pass05_pending_encounters:
    id: "abc123"
    encounter_type: "hospital_admission"
    -- ... full encounter data

  -- Non-health content page (new flow):
  pass05_page_assignments:
    page_num: 143
    encounter_id: NULL              -- ❌ NO encounter
    is_health_content: false
    classification_reason: "Blank page after encounter"

  pass05_pending_encounters:
    -- No record created (page has no encounter)

  AI Prompt Behavior:
  {
    "encounters": [
      {
        "encounter_index": 0,
        "pages": [1, 2, 3, ..., 142]  // Only health content pages
      }
    ],
    "page_assignments": [
      {"page": 1, "encounter_index": 0, "is_health_content": true},
      {"page": 2, "encounter_index": 0, "is_health_content": true},
      // ...
      {"page": 142, "encounter_index": 0, "is_health_content": true},
      {"page": 143, "encounter_index": null, "is_health_content": false}  // No encounter
    ]
  }

  Reconciliation Impact

  NO IMPACT - Non-health pages never enter reconciliation:
  - Reconciler queries: SELECT * FROM pass05_pending_encounters WHERE session_id = ?
  - Non-health pages have no pending encounters to reconcile
  - They just sit in pass05_page_assignments with encounter_id: NULL

  Pros

  ✅ Clean separation: Health = encounters, Non-health = just page tracking
  ✅ No reconciliation complexity
  ✅ No "ghost pseudo-encounters" for blank pages
  ✅ Simpler AI task: "Find health encounters, ignore non-health pages"

  Cons

  ❌ Non-health pages are "second-class citizens" (no encounter context)
  ❌ Can't answer: "This blank page was between which two encounters?"
  ❌ Breaks the "track everything" principle slightly

  ---
  Approach B: ENCOUNTER-CENTRIC (Non-Health Pages GET Pseudo-Encounters)

  How It Works

  Core Principle:
  - ALL pages get encounters (health OR non-health)
  - Non-health pages get pseudo-encounters with is_real_world_visit: false
  - Reconciliation processes both types

  Database Flow:

  -- Health content encounter (normal):
  pass05_pending_encounters:
    id: "abc123"
    encounter_type: "hospital_admission"
    is_real_world_visit: true       -- ✅ Real healthcare event
    is_health_content: true

  -- Non-health content encounter (new):
  pass05_pending_encounters:
    id: "xyz789"
    encounter_type: "non_health_content"
    is_real_world_visit: false      -- ❌ Not a healthcare event
    is_health_content: false
    page_ranges: [[143, 143]]       -- Just page 143

  AI Prompt Behavior:
  {
    "encounters": [
      {
        "encounter_index": 0,
        "encounter_type": "hospital_admission",
        "is_real_world_visit": true,
        "is_health_content": true,
        "pages": [1, 2, ..., 142]
      },
      {
        "encounter_index": 1,
        "encounter_type": "non_health_content",
        "is_real_world_visit": false,
        "is_health_content": false,
        "pages": [143]
      }
    ]
  }

  Reconciliation Impact

  MODERATE IMPACT - Need to handle non-health encounters:

  Reconciliation Logic:
  // Group pendings by type
  const healthPendings = pendings.filter(p => p.is_health_content);
  const nonHealthPendings = pendings.filter(p => !p.is_health_content);

  // Reconcile health encounters normally
  for (const group of healthPendings) {
    await reconcilePendingsToFinal(group);  // Creates healthcare_encounters record
  }

  // Skip non-health encounters (or store separately)
  for (const nonHealth of nonHealthPendings) {
    // Option 1: Don't reconcile at all (just leave as pending)
    // Option 2: Mark as completed but don't create healthcare_encounters record
    // Option 3: Create healthcare_encounters record with is_health_content: false
  }

  Pros

  ✅ Consistent model: Everything is an encounter
  ✅ Can track context: "Blank page between encounters 1 and 2"
  ✅ Follows existing pseudo-encounter pattern

  Cons

  ❌ More complex reconciliation logic
  ❌ Non-health "encounters" pollute encounter tables
  ❌ More AI prompt complexity: "Create encounter for non-health content"

  ---
  My Analysis: Which Approach Is Better?

  Let me think through the use cases:

  Use Case 1: 1-page blank PDF upload

  Approach A (Page-Centric):
  shell_files: 1 record
  pass05_page_assignments: 1 record (encounter_id: NULL, is_health_content: false)
  pass05_pending_encounters: 0 records
  healthcare_encounters: 0 records
  User sees: "1 page processed, 0 encounters found, 1 non-health page"

  Approach B (Encounter-Centric):
  shell_files: 1 record
  pass05_pending_encounters: 1 record (encounter_type: "non_health_content")
  healthcare_encounters: ??? (depends on reconciliation logic)
  User sees: "1 page processed, 1 encounter found (non-health content)"

  Winner: Approach A - Cleaner UX ("no encounters" makes sense for blank page)

  ---
  Use Case 2: 142-page encounter + 1 blank trailing page

  Approach A:
  pass05_pending_encounters: 1 record (pages 1-142, health content)
  pass05_page_assignments: 143 records
    - 142 records with encounter_id (health content)
    - 1 record with encounter_id: NULL (page 143, non-health)
  healthcare_encounters: 1 record (the real encounter)

  Approach B:
  pass05_pending_encounters: 2 records
    - Encounter 1: pages 1-142 (health)
    - Encounter 2: page 143 (non-health)
  healthcare_encounters: ??? (1 or 2 records?)

  Winner: Approach A - Non-health page doesn't need encounter representation

  ---
  Use Case 3: File with 3 separators between encounters

  Approach A:
  pass05_pending_encounters: 3 records (the actual health encounters)
  pass05_page_assignments: 150 records
    - 147 with encounter_id (health content)
    - 3 with encounter_id: NULL (separator pages)

  Approach B:
  pass05_pending_encounters: 6 records (3 health + 3 non-health)
  healthcare_encounters: 3 records (or 6?)

  Winner: Approach A - Separators don't need encounter semantics

  ---
  The Deciding Factor: What Is An "Encounter"?

  Definition from your V11 prompt:
  "An encounter is a discrete healthcare interaction between a patient and the healthcare system"

  Key word: HEALTHCARE interaction

  A blank page is NOT a healthcare interaction. Neither is a separator page. Therefore, they should 
  not be encounters.

  ---
  My Recommendation: APPROACH A (Page-Centric) ✅

  Implementation Details

  1. AI Prompt Logic:

  STAGE 1: IDENTIFY HEALTHCARE ENCOUNTERS
  Look for discrete healthcare interactions. Create encounters ONLY for health-related content.

  STAGE 2: CLASSIFY ALL PAGES
  For every page in the document:
  - If page belongs to a healthcare encounter → is_health_content: true
  - If page has NO healthcare content → is_health_content: false, encounter_index: null

  OUTPUT SCHEMA:
  {
    "encounters": [
      // Only healthcare encounters here
    ],
    "page_assignments": [
      // ALL pages here (both health and non-health)
      {
        "page": 143,
        "encounter_index": null,  // <-- Non-health pages have null
        "is_health_content": false,
        "classification_reason": "Blank page after encounter"
      }
    ]
  }

  2. Chunk Processor Logic:

  // Process AI response
  for (const aiPage of aiResponse.page_assignments) {
    if (aiPage.encounter_index !== null) {
      // Health content page - assign to encounter
      const encounter = aiResponse.encounters[aiPage.encounter_index];
      await insertPageAssignment({
        page_num: aiPage.page,
        encounter_id: encounter.pending_id,
        is_health_content: true,
        classification_reason: aiPage.classification_reason
      });
    } else {
      // Non-health content page - no encounter
      await insertPageAssignment({
        page_num: aiPage.page,
        encounter_id: NULL,  // <-- Key difference
        is_health_content: false,
        classification_reason: aiPage.classification_reason
      });
    }
  }

  3. Reconciliation Logic:

  NO CHANGES NEEDED - Non-health pages never enter reconciliation:

  // Existing reconciliation code works as-is
  const pendings = await getPendingsByStatus(sessionId, 'pending');
  // Only gets health-content pendings (non-health pages have no pendings)

  for (const group of groupByCascadeId(pendings)) {
    await reconcilePendingsToFinal(group);
  }
  // Non-health pages never touched - they just stay in page_assignments

  ---
  Schema Changes Required

  -- Migration 63 (Simplified)
  ALTER TABLE pass05_page_assignments
    ADD COLUMN is_health_content BOOLEAN DEFAULT true,
    ADD COLUMN classification_reason TEXT;

  -- encounter_id can be NULL for non-health pages
  -- (Already nullable, no change needed)

  COMMENT ON COLUMN pass05_page_assignments.is_health_content IS
    'Binary flag indicating if page contains health-related content.
     true: Page is part of a healthcare encounter
     false: Page has no health content (blank, separator, non-medical)
     Non-health pages have encounter_id: NULL (no encounter created)';

  NO changes needed to:
  - ❌ pass05_pending_encounters (non-health pages never create pendings)
  - ❌ healthcare_encounters (non-health pages never reconcile)
  - ❌ Reconciliation RPCs (only process health-content pendings)

  ---
  Answers to Your Specific Questions

  Q1: Are we creating an encounter for non-health content pages?

  A: NO ✅

  Non-health pages get records in pass05_page_assignments with:
  - encounter_id: NULL
  - is_health_content: false

  They do NOT get:
  - pass05_pending_encounters records
  - healthcare_encounters records

  ---
  Q2: Page-first or encounter-first focus?

  A: PAGE-FIRST for classification, ENCOUNTER-FIRST for health content

  AI logic:
  1. First: Identify healthcare encounters (encounter-first)
  2. Second: Classify ALL pages (page-first)
  3. Link health pages to encounters, non-health pages to nothing

  ---
  Q3: How does reconciliation handle this?

  A: It doesn't - non-health pages invisible to reconciliation

  Reconciliation only sees:
  SELECT * FROM pass05_pending_encounters WHERE session_id = ?

  Non-health pages have no pending encounters, so reconciliation never touches them.

  ---
  Q4: How does system deal with non-health content files?

  Scenario A: Entire 10-page file is blank

  shell_files: 1 record
  pass05_page_assignments: 10 records (all with encounter_id: NULL, is_health_content: false)
  pass05_pending_encounters: 0 records
  healthcare_encounters: 0 records
  pass05_encounter_metrics: encounters_detected: 0

  User sees: "10 pages processed, 0 encounters found, 10 non-health pages"

  Scenario B: 1 health page + 9 blank pages

  shell_files: 1 record
  pass05_page_assignments: 10 records
    - 1 record: encounter_id: "abc123", is_health_content: true
    - 9 records: encounter_id: NULL, is_health_content: false
  pass05_pending_encounters: 1 record (the health encounter)
  healthcare_encounters: 1 record (after reconciliation)

  User sees: "10 pages processed, 1 encounter found, 9 non-health pages"

  Scenario C: 142-page health encounter + 1 trailing blank

  pass05_page_assignments: 143 records
    - 142 records: encounter_id: "abc123", is_health_content: true
    - 1 record: encounter_id: NULL, is_health_content: false
  healthcare_encounters: 1 record (pages 1-142 only)

  ---
  Final Recommendation Summary

  ✅ Use Approach A: Page-Centric (Non-Health Pages WITHOUT Encounters)

  Why:
  1. Cleaner semantics: Encounters = healthcare interactions only
  2. Zero reconciliation complexity (no changes needed)
  3. No "ghost pseudo-encounters" polluting encounter tables
  4. Simpler AI prompt: "Find health encounters, classify all pages"
  5. Matches user mental model: "Blank file = no encounters"

  Implementation:
  - Non-health pages: encounter_id: NULL in pass05_page_assignments
  - Health pages: encounter_id: <uuid> in pass05_page_assignments
  - Reconciliation: Unchanged (only sees health-content pending encounters)

  Do you agree with Approach A? If yes, I'll proceed with creating:
  1. Migration 63 script
  2. V12 prompt update
  3. TypeScript interface updates
  4. Chunk processor changes