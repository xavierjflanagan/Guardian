# Shell File Batching & Encounter Discovery - Issue Analysis

**Date:** October 28, 2025
**Status:** Planning Phase
**Proposed Solution:** Pass 0.5 Intelligence Layer

---

## Issue Discovery History

**Origin:** Realised we had an issue with ensuring accurate source encounter tracking whilst buidling out Pass 2 clinical enrichment (October 28, 2025)
**Trigger Question:**
> "What happens if an uploaded shell file is quite large (30-page discharge summary) and has to be batched? How does the AI know that pages 14-17 are part of the same encounter that started on pages 1-13?"
**Core Realization:**
- Clincial entities analysed by Pass 2 needs to be connected and rooted to a source origin, both in terms of the uploaded file (shell_file) as well as the real-world location (healthcare_encounter).
- The shell_file attachment is easy, but the healthcare encounter attachment we soon realized was not. Originally, we designed pass 2 to identify healthcare encounters whilst it is enriching all clincial entities that have been identified and labelled by pass 1, and this design worked for a single page upload. But during the build out of pass2 we realized that the system does not account for multi-page uplaods that require AI API call batching. Batching has the potential to cut off and isolate related data, resulting in loss of context and failure to reliably assign a correct and repeatbale unique healthcare encounter ID (the 2nd batch will be none the wiser and just create a new healthcare encounter ID). Hence, we realized that we need to slightly re-design the multi-pass ai processing system to ensure that pass 2 can accurately adn reliably assign every analysed clincial entity to a correct healthcare encounter that is shared between all other clinical entities within the same healthcare encounter umbrella. The only way to do do this appears to be an initial seperate AI call that is not confined to batching constraints and instead 'sees' the entire uploaded file with all its pages / sub-files in order to correctly identify and categorise the overarching healthcare encounters of the entire uplaoded shell_file so that pass 1 and pass 2 can focus on the minutia within. Moreover, we also realised the ineherent issues with batching do not just sit with the healthcare_encounter issue, but also with the analysis of clinical entities themselves that span across a batch divide, as the divide would potentially cut off crucial context for that clinical entity, resulting in failure. Hence, a solution needed to be designed to enable smart-batching where the batch seperation location is more granular depending on where the ai beleieves there to be a natural divide in clincial entity context. 
- The goal: extract all clincial entities from an uploaded file no matter how long or jumbled up it is, or if its a unified or combination of 
independent medical documents, whilst maintaining clincial entity source control from both a physical uploaded file POV (shell file) and a real world encounter POV (healthcare encounters).

---

## Core Problems Identified

### 1. Shell File Complexity

**Reality of uploaded content:**
- Multiple independent medical records in one upload (3 discharge summaries + 2 lab reports)
- Pages uploaded out of chronological order (DC summary pages: 1, 5, 3, 2, 4)
- Mixed encounter types (inpatient stay + outpatient follow-up + standalone medication list)
- Formatting changes indicating separate source files (page 1-5 hospital letterhead, page 6 handwritten notes)

**Implication:** Cannot assume one shell file = one medical record = one encounter

### 2. Model Context Window Limits

**GPT-5-mini Specifications:**
- Total context window: 400,000 tokens
- Maximum input tokens: 272,000 tokens
- Maximum output tokens: 128,000 tokens

**Pass 1 Token Usage (Actual Data):**
- Per 1-page JPEG: ~11,344 input tokens
- Per 1-page output: ~14,077 tokens
- Per 1-page cost: ~$0.032 USD

**Batching Threshold Calculation:**
- Pages before input limit: 272,000 ÷ 11,344 ≈ 24 pages
- Recommended threshold: 18 pages (75% safety margin to ensure context bloat doesnt reduce quality)
- Files <18 pages: Single AI call (no batching)
- Files ≥18 pages: Intelligent batch processing with Pass 0.5

**Problem:** Batching without context causes:
- Healthcare Encounter fragmentation (creating duplicate encounters for same hospital stay)
- Clinical context loss (medication list split across batches)
- Entity misattribution (assigning page 15 entities to wrong encounter)

### 3. Encounter Attribution Ambiguity

**Current design flaw:**
- Need to batch to allow AI to do its job and extract. 
- But need to see beyond a batch boundary to see which encounter a clinical entity is attached to. 
- But need to be aware of encounters boundaries to safely create batches.

That my freinds is what we call in the industry a Tripple catch 22. 

### 4. Page Relationship Uncertainty

**No mechanism to determine:**
- Which pages belong to same medical record vs different ones?
- Are pages chronologically ordered or patient-uploaded randomly?

### 5. Parallel Processing Blocked

**Current sequential design:**
- Pass 1 must complete entirely before Pass 2 starts
- Cannot parallelize batches without upfront context

**Cost:** Slow processing (5-10 min for large files vs 1-2 min parallelized)

---

## Analysis: Why Encounter-First in Pass 2 Fails

**Original Pass 2 design assumption:**
> "Pass 2 Step 0: Extract healthcare_encounters FIRST, then enrich entities"

**Failures:**

1. **Batching breaks it:** If Pass 2 Batch 1 creates encounter, Pass 2 Batch 2 doesn't know it exists
2. **Pass 1 needs it:** Entity classification quality improves with encounter context
3. **Redundant work:** Both Pass 1 and Pass 2 analyzing same shell file for structure
4. **Can't parallelize:** Batches depend on sequential encounter creation

---

## Proposed Solutions Evaluated

### Option 1: Pass 0.5 Intelligence Layer **RECOMMENDED**

**Concept:** Pre-processing pass that analyzes entire shell file BEFORE Pass 1/2

**What Pass 0.5 does:**
1. Encounter Discovery (real-world + pseudo)
2. Shell File Structure Analysis (sections, formatting changes, page relationships)
3. Intelligent Batch Boundary Planning (context-aware split points)
4. Page Relationship Mapping (which pages belong together)

**Advantages:**
- Pass 1 and Pass 2 receive high-level context upfront
- Encounters created ONCE (no duplication)
- Enables parallel batch processing
- Handles out-of-order pages
- Handles mixed medical records in one shell file

**Disadvantages:**
- Additional upfront AI call (~$0.10-0.20)
- Increased complexity

**Verdict:** Essential architecture - benefits far outweigh costs

### Option 2: Sliding Window with Overlap

**Concept:** Fixed-size batches (10 pages) with 20% overlap

**Rejection reason:**
- Inefficient (processes overlap twice)
- Doesn't solve encounter attribution
- Blind to shell file structure

### Option 3: No Batching - Long-Context Models Only

**Concept:** Use Claude 3.5 Sonnet (200K) for entire shell file

**Rejection reason:**
- Still hits limits on 100+ page files
- Higher cost per file
- Can't parallelize
- Doesn't solve multi-record shell files

### Option 4: Section-Based Splitting

**Concept:** Pass 0.5 identifies sections, split at section boundaries

**Status:** Incorporated into Option 1 as enhancement

---

## Selected Solution: Pass 0.5 Architecture

### Pass 0.5 Execution Strategy: Fork Logic

Pass 0.5 has **TWO separate tasks** with different execution conditions:

**Task 1: Healthcare Encounter Discovery (ALWAYS RUNS)**
- Executes for ALL uploads (even 1-page files)
- Identifies and records healthcare encounters
- Extracts encounter metadata (dates, providers, facilities, types)
- Maps encounters to spatial bounding boxes from OCR
- Creates pre-identified encounters for Pass 1/2 to assign entities to

**Why run for small files?**
- Lightens Pass 1/2 processing load (they just assign entities, not extract encounters)
- Prevents encounter duplication across batches (even future batches)
- Provides valuable context even for single-page uploads
- Minimal cost: ~$0.02 for text analysis (OCR already extracted)

**Task 2: Batch Boundary Planning (CONDITIONAL - Edge Case Only)**
- Only executes if pages ≥ 18 (user-configurable threshold)
- Identifies safe batching division locations
- Creates intelligent split points with overlap zones
- Enables parallel processing for large files

**Why skip for small files?**
- Most uploads <18 pages (single encounter, no batching needed)
- Waste of AI tokens to analyze batching when not needed
- Built for future edge cases, not current majority use case

**Fork Logic:**
```typescript
if (pageCount < 18) {
  // Task 1 ONLY: Encounter discovery
  runEncounterDiscovery(ocrOutput);
  // Skip batching analysis entirely
} else {
  // Task 1 + Task 2: Encounters + Batching
  runEncounterDiscovery(ocrOutput);
  runBatchingAnalysis(ocrOutput);
}
```

---

### Input: OCR-Only Architecture

**Pass 0.5 uses OCR output only (NOT raw images):**

**Why OCR-only?**
1. **Structural consistency** - All passes reference same coordinate system
2. **Common language** - Character offsets + bounding boxes that Pass 1/2 understand
3. **Cost savings** - GPT-5-mini text (~$0??) vs Vision (~$1.70 for 30-page file)
4. **Speed** - 3-5 seconds vs 15-20 seconds for vision analysis
5. **Sufficient for task** - Encounter discovery is text-based (dates, providers, facilities)

**What OCR provides:**
```typescript
{
  fullTextAnnotation: {
    text: string,  // Full extracted text
    pages: [{
      width: number,
      height: number,
      blocks: [{
        boundingBox: { vertices: [...] },  // Spatial coordinates
        paragraphs: [{
          words: [{
            text: string,
            boundingBox: { vertices: [...] },
            confidence: number
          }]
        }]
      }]
    }]
  }
}
```

**Common reference format for Pass 1/2:**
- **Page numbers** - Which pages contain which encounters
- **Character offsets** - Position in fullTextAnnotation.text
- **Bounding boxes** - Spatial coordinates from OCR blocks
- **Encounter IDs** - Pre-created UUIDs in database

Pass 1 and Pass 2 receive:
- Same OCR output Pass 0.5 analyzed
- Manifest with encounter IDs + spatial bbox data
- Raw images (still available for visual entity detection)

---

### Core Responsibilities

**Task 1: Encounter Discovery (ALWAYS - All File Sizes)**

**Primary actions:**
- Identify all real-world healthcare visits (dates, providers, facilities, encounter types)
- Identify pseudo-encounters (standalone medication lists, insurance cards, administrative summaries)
- Extract encounter temporal data (date ranges, chronological ordering)
- Map encounters to page ranges (including non-contiguous: [[1,5], [10,12]])
- Extract spatial bounding box data for each encounter from OCR
- Pre-insert healthcare_encounters records into database (get real UUIDs)
- Create shell file manifest with encounter metadata for Pass 1/2

**Output:**
```typescript
{
  shellFileId: "uuid",
  encounters: [
    {
      encounterId: "uuid",  // Pre-created in database
      encounterType: "inpatient" | "outpatient" | "emergency" | "pseudo_medication_list",
      isRealWorldVisit: boolean,
      dateRange: { start: "2024-03-10", end: "2024-03-15" },
      provider: "Dr Smith",
      facility: "St Vincent's Hospital",
      pageRanges: [[1, 10], [15, 18]],  // Non-contiguous pages
      spatialBounds: [
        { page: 1, boundingBox: { vertices: [...] } },
        { page: 2, boundingBox: { vertices: [...] } }
      ]
    }
  ]
}
```

**Benefit to Pass 1/2:**
- No need to extract encounters themselves (already done)
- Just assign detected entities to pre-identified encounter IDs
- Lighter processing load, faster execution
- No encounter duplication risk

---

**Task 2: Batch Boundary Planning (CONDITIONAL - Only if ≥18 Pages)**

**Primary actions:**
- Classify content type per page/section
- Detect formatting changes (indicating separate source files)
- Identify section boundaries (admission details, vitals, medications, discharge plan)
- Create batch boundaries at natural break points (section boundaries, formatting changes)
- Define overlap zones (1 page before/after critical splits)
- Sub-page granularity when needed (character offsets for mid-page splits)
- Map page relationships (which pages form coherent units)

**Output:**
```typescript
{
  batchingRequired: true,
  batches: [
    {
      batchId: "batch_001",
      pageRange: [1, 10],
      characterOffsetStart: 0,
      characterOffsetEnd: 45000,
      primaryEncounterId: "uuid",
      boundaryRationale: "Section break after discharge medications",
      overlapWithNext: { pages: [10], reason: "Medication list continues" }
    },
    {
      batchId: "batch_002",
      pageRange: [10, 18],
      characterOffsetStart: 43000,  // 2-page overlap
      characterOffsetEnd: 90000,
      primaryEncounterId: "uuid",
      boundaryRationale: "End of discharge summary"
    }
  ]
}
```

**Benefit to Pass 1/2:**
- Can parallelize batch processing safely
- No risk of splitting clinical context mid-entity
- Overlap zones preserve continuity

### Key Design Decisions

**1. Shell File Manifest (not "document manifest")**
- Term acknowledges uploaded content may be multiple mixed medical records
- Avoids assumption of single unified medical record

**2. Real-World vs Pseudo-Encounters**
```typescript
interface HealthcareEncounter {
  encounter_type: 'outpatient' | 'inpatient' | 'emergency' | 'specialist' |
                  'pseudo_medication_list' | 'pseudo_insurance' | 'pseudo_admin';
  is_real_world_visit: boolean;
  // Real-world: has date, provider, facility
  // Pseudo: missing contextual metadata, represents uploaded content only
}
```

**3. Hard Rules + AI Analysis**

**Hard rules for batch separation:**
- Formatting change between pages → likely different source files
- Letterhead change → different facility/provider
- Date jumps > 30 days → likely different encounters
- Blank pages → natural separators

**AI analysis for:**
- Clinical context continuity (is page 6 continuing page 5's procedure description?)
- Encounter attribution (which pages belong to March 10 hospital admission?)
- Section classification (is this vitals, medications, or discharge plan?)

**4. Out-of-Order Page Handling**

**Challenge:** Patient uploads DC summary pages: 1, 5, 3, 2, 4

**Pass 0.5 solution:**
- Analyze page content relationships (not just sequence)
- Detect page numbering in content (if present)
- Identify narrative flow breaks
- Reconstruct logical page order in manifest

**5. Sub-Page Granularity**

**Use case:** Medication list starts mid-page 5, ends mid-page 7

**Batch boundary:**
```typescript
{
  start_page: 5,
  start_offset: 2450,  // Character position where medication section starts
  end_page: 7,
  end_offset: 1800,    // Character position where medication section ends
  boundary_rationale: "Medication list section (partial pages)"
}
```

### Parallel Processing Strategy

**After Pass 0.5 completes:**

```
Pass 0.5: Shell File Manifest Created
  ├─→ Encounters inserted into database (UUIDs available)
  ├─→ Batch plan defined with boundaries
  └─→ Manifest stored

Pass 1: PARALLEL entity detection batches
  ├─→ Batch 1 (pages 1-10)   → executor 1
  ├─→ Batch 2 (pages 11-20)  → executor 2
  └─→ Batch 3 (pages 21-30)  → executor 3
  (All receive manifest + encounter IDs)

Pass 2: PARALLEL clinical enrichment batches
  ├─→ Batch 1 (pages 1-10)   → executor 1
  ├─→ Batch 2 (pages 11-20)  → executor 2
  └─→ Batch 3 (pages 21-30)  → executor 3
  (All receive manifest + encounter IDs + Pass 1 results)
```

---

## Database Schema Requirements

**New tables needed:**

1. **shell_file_manifests** - Pass 0.5 output
2. **batch_boundaries** - Granular batch definitions
3. **page_relationships** - Which pages belong together

**Table updates needed:**

1. **healthcare_encounters**
   - Add `page_span INT[]` - Pages where encounter appears
   - Add `page_ranges INT[][]` - Non-contiguous ranges [[1,5], [10,12]]
   - Add `is_real_world_visit BOOLEAN` - Real vs pseudo
   - Add `identified_in_pass TEXT DEFAULT 'pass_0_5'`

2. **entity_processing_audit**
   - Add `batch_id UUID` - Which batch processed this entity
   - Add `batch_overlap_zone BOOLEAN` - Is entity in overlap buffer

---

## Implementation Phases

### Phase 1: MVP - Encounter Discovery Only (Current Focus)
**Scope:** Task 1 only - Skip batching entirely

**What we're building:**
- Pass 0.5 worker function with page count check
- Fork logic: if pages < 18, run encounter discovery only
- Encounter discovery using OCR text (GPT-5-mini)
- Database schema for shell_file_manifests and encounter spatial data
- Pass 1/2 integration to consume encounter manifest

**What we're NOT building yet:**
- Batch boundary analysis (Task 2) - Future edge case
- Multi-batch processing - Files ≥18 pages will fail gracefully for now
- Parallel execution infrastructure - Not needed for <18 page files

**Why this approach:**
- 95%+ of uploads will be <18 pages (single encounter)
- Don't waste time building batching infrastructure we won't use yet
- Get value immediately: Pass 1/2 get pre-identified encounters
- Can add batching later when needed (clean architecture allows it)

**Target:** ALL uploads <18 pages (covers vast majority of use cases)

**Success Criteria:**
- Pass 0.5 extracts encounters accurately (>95% accuracy)
- Pass 1 receives encounter IDs + spatial data
- Pass 2 assigns entities to pre-created encounters
- Files ≥18 pages: Graceful failure message ("File too large, batching not yet implemented")

---

### Phase 2: Add Conditional Batching (Future - When Needed)
**Scope:** Task 2 - Intelligent batching for large files

**Trigger:** When we start seeing 18+ page uploads in production

**What we'll add:**
- Batch boundary planning (section-based)
- Overlap zone definition
- Sub-page granularity (character offsets)
- Parallel execution for Pass 1 and Pass 2
- Out-of-order page reconstruction

**Target:** Documents 18-100 pages

**Why defer:**
- Edge case infrastructure (most uploads <18 pages)
- Adds complexity we don't need yet
- Clean fork logic allows easy addition later

---

### Phase 3: Advanced Edge Cases (Future - Low Priority)
**Scope:** Rare edge case handling

**What we might add:**
- Multi-record separation (detecting mixed uploads)
- Page order reconstruction algorithms (uploaded out of order)
- Adaptive batching (content-density-based)
- Batch result aggregation and deduplication
- Support for 100+ page files

**Why defer:**
- Very rare use cases
- Current design handles 99% of uploads
- Build when user demand justifies effort

---

## Success Metrics

**Pass 0.5 Performance:**
- Encounter detection accuracy: >95% (real-world visits correctly identified)
- Pseudo-encounter classification: >90% (medication lists, insurance cards detected)
- Batch boundary quality: <5% clinical context fragmentation errors
- Processing time: <10 seconds for 30-page shell file
- Cost: <$0.20 per shell file

**System Impact:**
- Pass 1/2 accuracy improvement: +10-15% (with encounter context)
- Processing time reduction: 40-60% (parallel batching)
- Encounter duplication rate: <1% (vs 15-20% without Pass 0.5)

---

## Open Questions

**Resolved:**
- ~~Model choice~~ → **Answered:** GPT-5-mini with OCR text (not vision)
- ~~MVP batching threshold~~ → **Answered:** 18 pages, conditional execution
- ~~MVP batching~~ → **Answered:** Skip batching in Phase 1, defer to Phase 2

**Still Open:**

1. **Encounter spatial bbox structure:** How to store bounding boxes in manifest?
   - Option A: Array of page + bbox pairs
   - Option B: Single bbox per encounter (first occurrence)
   - Option C: Full spatial map with all occurrences

2. **OCR confidence validation:** Should Pass 0.5 validate OCR confidence scores?
   - Flag low-confidence pages for manual review?
   - Reject entire file if average confidence <80%?

3. **Pseudo-encounter granularity:** How many pseudo types needed?
   - Current: medication_list, insurance, admin_summary
   - Add: lab_report, imaging_report, referral_letter?

4. **Pass 1.5 integration:** Should Pass 0.5 also identify medical code candidates?
   - Keep Pass 1.5 separate (current design)
   - Or: Pass 0.5 pre-identifies code locations for Pass 1.5?

5. **Encounter duplication handling:** What if Pass 0.5 finds same encounter in multiple shell files?
   - Create new encounter each time (safe, allows deduplication later)
   - Or: Attempt to match existing encounters in database?

---

## Next Steps - Phase 1 MVP Implementation

**Immediate (This Week):**

1. **Create IMPLEMENTATION_PLAN.md**
   - Database schema design (shell_file_manifests, encounter spatial data)
   - Pass 0.5 worker function architecture with fork logic
   - TypeScript interfaces for manifest
   - AI prompt design for encounter discovery

2. **Database Migration**
   - Create shell_file_manifests table
   - Update healthcare_encounters table (add spatial fields)
   - Add pass_0_5_metadata JSONB field to shell_files

3. **Pass 0.5 Worker Function Skeleton**
   - Implement page count check
   - Fork logic: if pages < 18, Task 1 only; else fail gracefully
   - OCR input handling
   - Manifest output structure

**Short-Term (Next 2 Weeks):**

4. **Encounter Discovery Implementation (Task 1)**
   - GPT-5-mini prompt for encounter extraction
   - Parse AI response to structured manifest
   - Insert healthcare_encounters into database
   - Store manifest in shell_file_manifests table

5. **Pass 1 Integration**
   - Read manifest before entity detection
   - Receive pre-identified encounter IDs
   - Assign entities to encounters (don't extract them)
   - Test with 1-page, 5-page, 10-page files

6. **Pass 2 Integration**
   - Read manifest before clinical enrichment
   - Use pre-created encounters (skip Step 0)
   - Link clinical events to encounter IDs from manifest
   - Test encounter assignment accuracy

**Future (Deferred to Phase 2):**

7. **Implement Task 2: Batch Boundary Planning** (when 18+ page uploads appear)
8. **Parallel batch execution infrastructure** (Phase 2)
9. **Advanced edge cases** (Phase 3 - low priority)

---

**Document Status:** PLANNING COMPLETE - Ready for implementation
**Decision:** Proceed with Pass 0.5 Intelligence Layer (Fork Logic + OCR-Only)
**Next Document:** IMPLEMENTATION_PLAN.md (database schema, TypeScript types, AI prompts)
**Focus:** Phase 1 MVP - Encounter discovery only (skip batching)
