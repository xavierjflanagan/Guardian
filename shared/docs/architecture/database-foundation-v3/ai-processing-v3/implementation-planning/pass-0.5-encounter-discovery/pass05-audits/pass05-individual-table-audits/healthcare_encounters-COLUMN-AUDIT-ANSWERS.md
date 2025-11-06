# Pass 0.5 Column Audit: healthcare_encounters

**Date:** 2025-11-03 (original), 2025-11-04 (user review + updates)
**Status:** AUDIT COMPLETE - USER REVIEWED AND APPROVED
**Context:** Comprehensive analysis of `healthcare_encounters` table columns
**Table Purpose:** Store clinical encounter records with Pass 0.5 encounter detection metadata

**Location:** shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql:519

**Key Decisions:**
- Add plain English AI-generated summary (also add to manifest for Pass 1/2)
- Remove 3 redundant columns (visit_duration_minutes, confidence_score, ai_confidence)
- Rename ai_extracted → source_method with 'ai_pass_0_5' enum value
- Populate encounter_date_end for completed encounters (NULL only for ongoing)
- Add date_source column to track date origin (ai_extracted | file_metadata | upload_date)
- Fix spatial_bounds population (generated but not written to DB)
- Consolidate to single pass_0_5_confidence column
- Update requires_review logic (summary NULL OR confidence < 0.80 only)

---

## User-Reported Issues

### Critical Issue: Many Empty Columns in healthcare_encounters Table
**Encounter ID:** 30bb946b-7f42-4db0-89ec-0bd186a65635 (pseudo_lab_report)

**Problem:**
Pass 0.5 AI model is NOT producing output to populate many columns that it could or should be filling. This is a data quality and completeness issue.

**Missing Data Examples:**
| Column | Expected | Actual | Impact |
|--------|----------|--------|--------|
| `encounter_date` | Date of lab test | NULL | Cannot display on timeline |
| `facility_name` | Lab facility | NULL | No context for where test was done |
| `summary` | Lab test description | NULL | Users don't know what this is |
| `clinical_effective_date` | Test result date | NULL | Duplicate of encounter_date? |
| `spatial_bounds` | Bounding box | `[]` (empty array) | Cannot highlight document region |
| `encounter_date_end` | End date | NULL | Should be same as start for single-day events? |

**Additional Concerns:**
- `ai_extracted` = `FALSE` - What does this mean? (Should be TRUE for Pass 0.5?)
- `requires_review` = `FALSE` - Why not flagged for review given missing data?
- `ai_confidence` = `NULL` - No confidence score despite AI extraction
- `pass_0_5_confidence` = `NULL` - Pass 0.5 didn't record confidence?

---

## Column-by-Column Audit

### 1. Primary Keys and Foreign Keys

| Column | Type | Purpose | Populated? | Verdict |
|--------|------|---------|------------|---------|
| `id` | UUID PRIMARY KEY | Unique identifier | YES | KEEP |
| `patient_id` | UUID REFERENCES user_profiles | Patient ownership | YES | KEEP |

**Analysis:** Standard keys, properly populated.

**Verdict:** KEEP ALL

---

### 2. Encounter Classification

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `encounter_type` | TEXT NOT NULL | Visit type | YES | Ambiguity between 'outpatient' and 'specialist_consultation' | KEEP |
| `encounter_date` | TIMESTAMPTZ | Encounter start date | **NO (NULL)** | CRITICAL | FIX |
| `encounter_date_end` | TIMESTAMPTZ | Multi-day encounter end | **NO (NULL)** | Should auto-fill for single-day? | REVIEW |

**Analysis:**

**`encounter_type`:**
- Values: 'outpatient', 'inpatient', 'emergency', 'specialist', 'telehealth', 'diagnostic', 'pseudo_lab_report'
- **Issue:** User noted AI uses 'outpatient' and 'specialist_consultation' interchangeably for same document
- **Question:** Should these be merged or kept separate?
- Current decision: Keep separate (user agreed)

**`encounter_date`:**
- **CRITICAL ISSUE:** NULL for lab report (30bb946b-7f42-4db0-89ec-0bd186a65635)
- Lab reports MUST have a date (when test was performed)
- Pass 0.5 should extract dates from document
- **Action Required:** Investigate why Pass 0.5 isn't extracting dates

**`encounter_date_end`:**
- **ISSUE:** NULL is ambiguous - doesn't distinguish completed vs ongoing encounters
- **User Insight:** "Documentation generally is not produced unless it is finalized and the encounter completed"
- **Master Encounter Context:** master_encounter_id column exists for deduplication (Phase 2)
- **Revised Logic:**
  - **COMPLETED single-day encounters:** Set encounter_date_end = encounter_date (explicit completion)
  - **ONGOING encounters:** Keep encounter_date_end = NULL (truly unknown end, rare exceptions)
  - **PSEUDO encounters:** Both dates can be NULL (no date requirement)
- **Exceptions to "completed" rule:**
  - Discharge summaries produced before patient leaves (ongoing inpatient)
  - Progress notes during multi-day admission (still in progress)
- **Implementation:** AI determines if encounter is "completed" and populates end date accordingly

**Verdict:**
- `encounter_type`: KEEP
- `encounter_date`: KEEP but FIX extraction logic
- `encounter_date_end`: KEEP but POPULATE for completed encounters (NULL only for rare ongoing cases)

---

### 3. Provider and Facility Information

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `provider_name` | TEXT | Healthcare provider | PARTIAL | Missing for lab reports | KEEP |
| `provider_type` | TEXT | Provider category | PARTIAL | Not populated by Pass 0.5 | REVIEW |
| `facility_name` | TEXT | Medical facility | **NO (NULL)** | Should have lab facility name | FIX |
| `specialty` | TEXT | Medical specialty | PARTIAL | Not populated by Pass 0.5 | REVIEW |

**Analysis:**

**`provider_name`:**
- Example: "Mara Ehret, PA-C (supervising: David W. Neckman, MD)"
- Pass 0.5 DOES extract provider names when present
- Lab reports may not have provider (just facility)
- **Verdict:** KEEP, extraction logic working when data exists

**`provider_type`:**
- Values: 'primary_care', 'specialist', 'hospital', 'urgent_care'
- **Issue:** Pass 0.5 NOT populating this field
- **Question:** Should Pass 0.5 infer provider type from encounter_type?
  - specialist_consultation → 'specialist'
  - outpatient → 'primary_care'
  - emergency → 'urgent_care'
- **Recommendation:** Add provider_type inference logic to Pass 0.5

**`facility_name`:**
- **CRITICAL ISSUE:** NULL for lab report
- Lab reports MUST have facility name (where test was performed)
- Pass 0.5 should extract facility names from document headers/footers
- **Action Required:** Investigate why Pass 0.5 isn't extracting facility names

**`specialty`:**
- Values: 'cardiology', 'dermatology', 'family_medicine', etc.
- **Issue:** Pass 0.5 NOT populating this field
- **Question:** Should Pass 0.5 extract specialty from document?
- **Challenge:** Specialty often not explicitly stated
- **Recommendation:** Leave for Pass 2 (clinical enrichment)

**Pass 0.5 vs Pass 2 Responsibility Split:**
- **User Context:** "Many of these columns were designed before Pass 0.5 existed, back when encounters were to be created by Pass 2"
- **User Concern:** "Worried about bloating out the prompt context, diluting the important stuff"
- **Solution:** Minimize Pass 0.5 workload (encounter discovery only), let Pass 2 enrich

**Pass 0.5 Populates (minimal extraction):**
- `provider_name`: Extract from document when present (already working)
- `facility_name`: Extract from document when present (FIX: currently NULL for lab reports)
- AI can output NULL when unsure (acceptable for Pass 0.5)

**Pass 2 Enriches (later):**
- `provider_type`: Infer from encounter_type + provider_name analysis
- `specialty`: Extract from clinical content analysis (often not explicitly stated)

**Timeline Test Requirement:**
- Real encounters MUST have provider_name OR facility_name (otherwise not real encounter)
- Pseudo encounters can have NULL for both (expected behavior)

**Verdict:**
- `provider_name`: KEEP (Pass 0.5 extracts when present)
- `provider_type`: KEEP but DEFER to Pass 2 (not Pass 0.5 scope)
- `facility_name`: KEEP but FIX extraction logic (Pass 0.5)
- `specialty`: KEEP but DEFER to Pass 2 (requires clinical interpretation)

---

### 4. Clinical Context

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `chief_complaint` | TEXT | Patient's main concern | PARTIAL | Not in lab reports | KEEP |
| `summary` | TEXT | Visit summary | **NO (NULL)** | CRITICAL for UI display | FIX |
| `clinical_impression` | TEXT | Provider's assessment | PARTIAL | Not in Pass 0.5 scope | KEEP |
| `plan` | TEXT | Treatment plan | PARTIAL | Not in Pass 0.5 scope | KEEP |

**Analysis:**

**`chief_complaint`:**
- Typically in clinical visit notes, not lab reports
- **Verdict:** KEEP (Pass 2 responsibility)

**`summary`:**
- **CRITICAL ISSUE:** NULL for all Pass 0.5 encounters
- **User Feedback:** "summary is one of the most important columns for an encounter"
- **User Need:** "Plain English description so users can see what the encounter was about"
- **Pass 1/Pass 2 Need:** "Manifest could use this summary - Pass 1 and 2 will find it very helpful"
- **Current Manifest:** Does NOT include summary field (only has extractedText for debugging)

**AI-Generated Plain English Summary Examples:**
- "Routine check up"
- "Hospital admission for management of UTI"
- "Photo upload of medication list"
- "Admin summary of health history from [provider]"
- "Generic blood test results"
- "X-ray report for fractured arm"

**Implementation:**
1. AI generates plain English description (NOT templates, actual content-aware summary)
2. Add `summary` field to EncounterMetadata interface in manifest
3. Write summary to BOTH:
   - `healthcare_encounters.summary` (for dashboard display)
   - `manifest.encounters[].summary` (for Pass 1/Pass 2 context)
4. This is NOT duplication - adding new field that doesn't exist yet

**`clinical_impression`:**
- Provider's medical assessment (e.g., "Type 2 diabetes, well-controlled")
- **Not in Pass 0.5 scope** - requires clinical reasoning
- **Verdict:** KEEP (Pass 2 responsibility)

**`plan`:**
- Treatment/management plan
- **Not in Pass 0.5 scope** - requires clinical interpretation
- **Verdict:** KEEP (Pass 2 responsibility)

**Verdict:**
- `chief_complaint`: KEEP but DEFER to Pass 2 (NULL for pseudo encounters is expected)
- `summary`: KEEP and ADD AI-generated plain English description in Pass 0.5 (CRITICAL for users and downstream passes)
- `clinical_impression`: KEEP but DEFER to Pass 2 (requires clinical reasoning)
- `plan`: KEEP but DEFER to Pass 2 (requires clinical interpretation)

---

### 5. Administrative Data

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `visit_duration_minutes` | INTEGER | Visit length | PARTIAL | Low value, rarely available | REMOVE |
| `billing_codes` | TEXT[] | CPT codes | PARTIAL | Not in Pass 0.5 scope | KEEP |

**Analysis:**

**`visit_duration_minutes`:**
- **User Question:** "Is this useful? Should we delete?"
- **Analysis:**
  - Rarely recorded in documents (only in structured visit summaries)
  - When present: "45-minute consultation" (requires AI extraction from text)
  - NOT determinable from dates alone (encounter_date doesn't include timestamps)
  - Not useful for timeline display (dates matter, minutes don't)
  - Bloats schema for minimal value
- **Verdict:** REMOVE (low value, rarely available, can extract in Pass 2 for specific use cases if needed)

**`billing_codes`:**
- Requires administrative interpretation
- Not in Pass 0.5 scope
- **Verdict:** KEEP (Pass 2 responsibility)

---

### 6. File Links

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `primary_shell_file_id` | UUID REFERENCES shell_files | Source document | YES | None | KEEP |
| `related_shell_file_ids` | UUID[] | Related documents | PARTIAL | Future use | KEEP |

**Analysis:**
- `primary_shell_file_id` properly populated by Pass 0.5
- `related_shell_file_ids` for linking duplicate encounter documents
- **Verdict:** KEEP ALL

---

### 7. V3 AI Processing Integration (Legacy)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `ai_extracted` | BOOLEAN DEFAULT FALSE | Extracted by AI? | **FALSE** | Too simplistic, should track pass | RENAME |
| `ai_confidence` | NUMERIC(4,3) | AI confidence | **NULL** | Redundant with pass_0_5_confidence | REMOVE |
| `requires_review` | BOOLEAN DEFAULT FALSE | Needs manual review | **FALSE** | Logic needs update | FIX |

**Analysis:**

**`ai_extracted`:**
- **User Question:** "What role or purpose is it playing?"
- **Current Issue:** Boolean is too simplistic
- **Original Design:** Distinguish AI-extracted vs human-entered encounters
- **Current Reality:** ALL encounters come from Pass 0.5 (AI)
- **Future Need:** Support manual entry UI + track which pass created encounter
- **Proposed Solution:** RENAME to `source_method` (TEXT enum)
  - Values: `'ai_pass_0_5'` | `'ai_pass_2'` | `'manual_entry'` | `'import'`
  - More granular than boolean
  - Tracks which pass created the encounter (useful for debugging)
  - Supports future manual entry
  - Better audit trail

**`ai_confidence`:**
- **User Feedback:** "consolidate confidence_score and ai_confidence and pass_0_5_confidence"
- **Analysis:** Three confidence columns is confusing and redundant
- **Current State:** NULL for all Pass 0.5 encounters (not being populated)
- **Solution:** REMOVE (redundant with pass_0_5_confidence)

**`requires_review`:**
- **User Feedback:** Set to TRUE only when summary NULL OR confidence < 0.80
- **Current Issue:** FALSE despite missing critical data
- **Revised Logic:** Set to TRUE when:
  - `summary` IS NULL (CRITICAL - user can't understand encounter)
  - `pass_0_5_confidence` < 0.80 (low confidence)
- **DO NOT trigger on:** (pseudo encounters legitimately have these NULL)
  - `provider_name` IS NULL
  - `facility_name` IS NULL
  - `encounter_date` IS NULL

**Verdict:**
- `ai_extracted`: RENAME to `source_method` TEXT enum ('ai_pass_0_5', 'ai_pass_2', 'manual_entry', 'import')
- `ai_confidence`: REMOVE (redundant with pass_0_5_confidence)
- `requires_review`: KEEP but UPDATE logic (summary NULL OR confidence < 0.80 only)

---

### 8. Pass 0.5: Encounter Discovery (Migration 34)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `page_ranges` | INT[][] | Page ranges | YES | None | KEEP |
| `spatial_bounds` | JSONB | Bounding boxes | **NO (`[]`)** | Missing for all encounters | FIX |
| `identified_in_pass` | TEXT DEFAULT 'pass_2' | Which pass detected | YES ('pass_0_5') | None | KEEP |
| `is_real_world_visit` | BOOLEAN DEFAULT TRUE | Timeline Test | YES | None | KEEP |
| `pass_0_5_confidence` | NUMERIC(3,2) | AI confidence | **NULL** | Should have value | FIX |
| `ocr_average_confidence` | NUMERIC(3,2) | OCR quality | PARTIAL | None | KEEP |
| `encounter_date_end` | TIMESTAMPTZ | End date | **NULL** | See section 2 | REVIEW |
| `is_planned_future` | BOOLEAN DEFAULT FALSE | Future appointment | YES | None | KEEP |

**Analysis:**

**`page_ranges`:**
- Format: `[[1,5], [10,12]]` - page ranges for this encounter
- **Status:** Properly populated by Pass 0.5 v2.3
- **Verdict:** KEEP

**`spatial_bounds`:**
- **CRITICAL ISSUE:** Empty array `[]` for all encounters (despite being generated!)
- **Investigation Result:** spatial_bounds IS being generated in manifestBuilder.ts (lines 277-325)
  - Creates comprehensive page regions with bounding boxes
  - Added to manifest JSONB successfully
  - BUT: NOT written to healthcare_encounters.spatial_bounds column
- **Current Code:** Database INSERT (line 218-238) does NOT include spatial_bounds field
- **Purpose:** Highlight encounter location in PDF viewer
- **Fix:** Update Pass 0.5 worker UPSERT to include spatialBounds from manifest
- **Action Required:** Add `spatial_bounds: spatialBounds` to database UPSERT statement

**`identified_in_pass`:**
- Values: 'pass_0_5', 'pass_1', 'pass_2'
- Properly set to 'pass_0_5' by current implementation
- **Verdict:** KEEP

**`is_real_world_visit`:**
- TRUE for actual clinical visits (Timeline Test passed)
- FALSE for pseudo encounters (lab reports with no provider/facility)
- **Verdict:** KEEP (critical for timeline filtering)

**`pass_0_5_confidence`:**
- **CRITICAL ISSUE:** NULL for all encounters
- Pass 0.5 v2.3 DOES generate confidence scores in JSON
- **Bug:** Worker not writing confidence to database
- **Action Required:** Fix worker to populate pass_0_5_confidence

**`ocr_average_confidence`:**
- Average OCR confidence across encounter pages
- Sometimes populated, sometimes NULL
- **Verdict:** KEEP (useful quality metric)

**`encounter_date_end`:**
- See section 2 analysis
- **Verdict:** KEEP but POPULATE for completed encounters

**`is_planned_future`:**
- TRUE for scheduled future appointments
- FALSE for past/current encounters
- **Verdict:** KEEP

**`date_source`:** (NEW COLUMN - NOT YET IN SCHEMA)
- **User Question:** "What happens with pseudo encounters that don't have dates?"
- **User Suggestion:** "Auto-populate with file creation date or upload date"
- **Proposed Solution:** Add fallback date logic with transparency tracking
- **Priority Order for Date Population:**
  1. AI extracts date from document → use that → `date_source = 'ai_extracted'`
  2. File metadata creation date exists → use that → `date_source = 'file_metadata'`
  3. Upload date (shell_files.created_at) → use as last resort → `date_source = 'upload_date'`
- **Column Definition:** `date_source TEXT` (values: 'ai_extracted' | 'file_metadata' | 'upload_date')
- **Purpose:**
  - Timeline needs SOME date to display encounter
  - File creation date often meaningful (screenshot of medication list taken on specific date)
  - Upload date better than NULL (user knows "I uploaded this around [date]")
  - Tracks confidence in date accuracy for transparency
- **For Real Encounters:** Will be 'ai_extracted' (dates from document)
- **For Pseudo Encounters:** May be 'file_metadata' or 'upload_date' (fallback dates)
- **NULL Should Never Occur:** Every encounter will have one of these three sources

**Verdict:**
- `page_ranges`: KEEP (working correctly)
- `spatial_bounds`: KEEP but FIX population (generated but not written to DB)
- `identified_in_pass`: KEEP (working correctly)
- `is_real_world_visit`: KEEP (working correctly)
- `pass_0_5_confidence`: KEEP but FIX population
- `ocr_average_confidence`: KEEP
- `encounter_date_end`: KEEP but POPULATE for completed encounters
- `is_planned_future`: KEEP (working correctly)
- `date_source`: ADD NEW COLUMN (tracks date origin for transparency)

---

### 9. Phase 2: Master Encounter Grouping (Migration 34)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `master_encounter_id` | UUID | Groups duplicate encounters | NO | Future use | KEEP |
| `master_encounter_confidence` | NUMERIC(3,2) | Grouping confidence | NO | Future use | KEEP |
| `all_shell_file_ids` | UUID[] | All documents referencing | NO | Future use | KEEP |

**Analysis:**
- Future Phase 2 functionality for deduplication
- Not in Pass 0.5 scope
- **Verdict:** KEEP ALL (future use)

---

### 10. Quality and Audit

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `confidence_score` | NUMERIC(4,3) | Overall confidence | PARTIAL | Redundant, legacy | REMOVE |
| `archived` | BOOLEAN NOT NULL DEFAULT FALSE | Soft delete | YES | None | KEEP |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Creation time | YES | None | KEEP |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Last update | YES | None | KEEP |

**Analysis:**

**Confidence Column Consolidation:**
- **User Feedback:** "consolidate confidence_score and ai_confidence and pass_0_5_confidence"
- **Current State:** Three confidence columns causing confusion
  1. `confidence_score` - NOT populated, legacy column
  2. `ai_confidence` - NOT populated, legacy column (Section 7)
  3. `pass_0_5_confidence` - IS populated by Pass 0.5 (Section 8)
- **Solution:** REMOVE 2 legacy columns, KEEP 1 specific column
  - REMOVE: `confidence_score` (redundant, not populated)
  - REMOVE: `ai_confidence` (redundant, not populated - see Section 7)
  - KEEP: `pass_0_5_confidence` (populated, specific to pass)
  - FUTURE: Add `pass_2_confidence` when Pass 2 implemented

**Confidence Score Reliability:**
- **User Question:** "Not even sure how AI is coming up with confidence... Can't depend on AI confidence values"
- **Response:** Partially correct, but useful for:
  - Flagging manual review (< 0.80 threshold)
  - Trending confidence over time (model improvements)
  - Identifying problematic document types (consistently low confidence)
  - Don't use for critical decisions, DO use for prioritization
- **Proposed Prompt Enhancement:** Add confidence scoring criteria
  ```
  Confidence Scoring Guidelines (0.0-1.0):
  - 0.95-1.00: Clear encounter headers, dates, providers visible
  - 0.85-0.94: Most key fields present, minor ambiguity
  - 0.70-0.84: Some key fields missing or ambiguous
  - 0.50-0.69: Significant uncertainty, partial information
  - Below 0.50: High uncertainty, flag for manual review
  ```

**`archived`, `created_at`, `updated_at`:**
- Standard audit columns, properly populated
- **Verdict:** KEEP ALL

---

## Summary

**Total Columns (Current):** 37
**Columns After Changes:** 36
- **Remove:** 3 columns (visit_duration_minutes, confidence_score, ai_confidence)
- **Add:** 1 column (date_source)
- **Rename:** 1 column (ai_extracted → source_method)

**Column Status:**
- **Properly Populated:** 15 (41%)
- **Missing Data (needs fixing):** 16 (43%)
- **Future Use (Phase 2):** 6 (16%)

**Critical Issues Identified:** 8
1. `encounter_date` NULL for lab reports → FIX extraction
2. `facility_name` NULL for lab reports → FIX extraction
3. `summary` NULL for all encounters → ADD AI-generated plain English descriptions
4. `ai_extracted` FALSE → RENAME to source_method TEXT enum
5. `ai_confidence` NULL → REMOVE (redundant)
6. `pass_0_5_confidence` NULL → FIX population
7. `spatial_bounds` empty → FIX (generated but not written to DB)
8. `requires_review` FALSE → UPDATE logic (summary NULL OR confidence < 0.80 only)

---

## Action Plan

### HIGH PRIORITY - Database Schema Changes

**Columns to REMOVE (3 total):**
1. **DROP COLUMN:** `visit_duration_minutes` (low value, rarely available)
2. **DROP COLUMN:** `confidence_score` (redundant with pass_0_5_confidence)
3. **DROP COLUMN:** `ai_confidence` (redundant with pass_0_5_confidence)

**Columns to RENAME (1 total):**
4. **RENAME COLUMN:** `ai_extracted` → `source_method` TEXT
   - Values: 'ai_pass_0_5' | 'ai_pass_2' | 'manual_entry' | 'import'
   - More granular audit trail than boolean

**Columns to ADD (1 total):**
5. **ADD COLUMN:** `date_source` TEXT
   - Values: 'ai_extracted' | 'file_metadata' | 'upload_date'
   - Tracks date origin for transparency

### HIGH PRIORITY - Pass 0.5 Worker Updates

**Database Population Fixes:**
6. **FIX:** Populate `pass_0_5_confidence` from Pass 0.5 JSON output
7. **FIX:** Extract `encounter_date` from lab reports and documents
8. **FIX:** Extract `facility_name` from document headers/footers
9. **FIX:** Write `spatial_bounds` to healthcare_encounters.spatial_bounds column (currently only in manifest)

**New Feature - Summary Generation:**
10. **ADD:** AI-generated plain English summary for ALL encounters
    - Examples: "Routine check up", "Hospital admission for management of UTI"
    - Add `summary` field to EncounterMetadata interface in manifest
    - Write to BOTH healthcare_encounters.summary AND manifest.encounters[].summary
    - Critical for dashboard display and Pass 1/Pass 2 context

**New Feature - Date Fallback Logic:**
11. **ADD:** Fallback date population for pseudo encounters without dates
    - Priority: AI extracted → file metadata → upload date
    - Populate `date_source` field accordingly
    - Never leave encounter_date NULL (use shell_files.created_at as last resort)

**encounter_date_end Logic:**
12. **UPDATE:** Populate encounter_date_end for completed encounters
    - AI determines if encounter is "completed"
    - Completed single-day: end_date = start_date (explicit)
    - Ongoing: end_date = NULL (rare exceptions only)
    - Pseudo: both dates can be NULL if no date found (before fallback)

**requires_review Logic:**
13. **UPDATE:** Set requires_review = TRUE when:
    - `summary` IS NULL (CRITICAL - user can't understand encounter)
    - `pass_0_5_confidence` < 0.80 (low confidence)
    - DO NOT trigger on provider/facility/date NULL (pseudo encounters OK)

**source_method Population:**
14. **UPDATE:** Set source_method = 'ai_pass_0_5' for all Pass 0.5 encounters

### HIGH PRIORITY - Pass 0.5 Prompt Updates

15. **ADD TO PROMPT:** Plain English summary generation instruction
    - AI generates content-aware description (not templates)
    - Examples provided in prompt

16. **ADD TO PROMPT:** Confidence scoring guidelines
    ```
    - 0.95-1.00: Clear encounter headers, dates, providers visible
    - 0.85-0.94: Most key fields present, minor ambiguity
    - 0.70-0.84: Some key fields missing or ambiguous
    - 0.50-0.69: Significant uncertainty, partial information
    - Below 0.50: High uncertainty, flag for manual review
    ```

17. **ADD TO PROMPT:** Encounter completion determination
    - Instruct AI to determine if encounter is "completed" for end_date population

### MEDIUM PRIORITY - Code Updates

18. **UPDATE:** EncounterMetadata TypeScript interface
    - Add `summary: string` field
    - Add `date_source: string` field

19. **DOCUMENT:** Pass 0.5 vs Pass 2 responsibility split
    - Pass 0.5: provider_name, facility_name, summary, dates
    - Pass 2: provider_type, specialty, chief_complaint, clinical_impression, plan

### LOW PRIORITY - Future Enhancements

20. **FUTURE:** Master encounter grouping implementation (Phase 2)
21. **FUTURE:** Related documents linking
22. **FUTURE:** Pass 2 enrichment of deferred columns

---

## Questions for User

**ANSWERED - Based on Xavier's review (2025-11-04):**

1. ✅ **encounter_date_end:** YES, populate for completed encounters (end_date = start_date for single-day completed encounters, NULL only for ongoing)
2. ✅ **Confidence columns:** YES, consolidate - keep only pass_0_5_confidence, remove confidence_score and ai_confidence
3. ✅ **Pass 0.5 vs Pass 2 responsibility:**
   - Pass 0.5: provider_name, facility_name, summary, dates (minimal extraction)
   - Pass 2: provider_type, specialty, chief_complaint, clinical_impression, plan (enrichment)
4. ✅ **Summary content:** Plain English AI-generated descriptions (not templates)
   - Examples: "Routine check up", "Generic blood test results", "X-ray report for fractured arm"
   - Add to manifest too (Pass 1/Pass 2 will find it helpful)
5. ✅ **provider_type inference:** NO, defer to Pass 2 (not Pass 0.5 scope, avoid prompt bloat)
6. ✅ **requires_review logic:** Trigger when summary NULL OR confidence < 0.80 only
   - Do NOT trigger on provider/facility/date NULL (pseudo encounters legitimately have these)

**OPEN QUESTIONS:**

None - all questions resolved through user review process.

---

## 6th November 2025 Addendum - Post-Fix Validation

**Date:** 2025-11-06
**Context:** Validation of fixes implemented between Nov 4-5
**Status:** MAJOR IMPROVEMENTS CONFIRMED

### Critical Issues RESOLVED

Based on database query of recent encounters (created >= 2025-11-05):

**1. ✅ `summary` Column - NOW POPULATED**

**Original Issue (Nov 3-4):** NULL for all Pass 0.5 encounters

**Current Status (Nov 6):** FULLY POPULATED with AI-generated plain English descriptions

**Sample Data:**
```
Emergency Department visit on 2025-06-22 with Matthew T Tinkham, MD at Piedmont Eastside Medical Emergency Department after motor vehicle collision; treated symptomatically and discharged home.

Specialist pain management consultation on 2025-10-27 with Mara Ehret, PA-C at Interventional Spine & Pain PC for post-procedure follow-up, neck and low back pain.

Pathology test collected on 2025-07-03 for Mycoplasma genitalium resistance (urine) at NSW Health Pathology.

Pharmacy dispensing label for Moxifloxacin 400mg with Date: 9.7.25 from Sydney Hospital and Sydney Eye Hospital Pharmacy Department.
```

**Quality Assessment:**
- Content-aware (not templates)
- Includes key details (date, provider, facility, chief complaint)
- Appropriate length (1-2 sentences)
- Works for both real encounters and pseudo-encounters

**Verdict:** ✅ ISSUE RESOLVED

---

**2. ✅ `pass_0_5_confidence` Column - NOW POPULATED**

**Original Issue (Nov 3-4):** NULL for all encounters

**Current Status (Nov 6):** FULLY POPULATED with confidence scores

**Sample Data:**
```
encounter_id: 34ee2d9d-8348-42e4-8199-73ede4322c1d
pass_0_5_confidence: 0.97 (specialist consultation)

encounter_id: 20a9c431-c164-4947-acf2-e8eb2e4b9ca2
pass_0_5_confidence: 0.98 (emergency department)

encounter_id: 8c89d8f3-4a1b-4ffe-8890-352ae84700d8
pass_0_5_confidence: 0.96 (outpatient pathology)

encounter_id: 70b167ab-651e-4ae6-a403-2ce057c164ba
pass_0_5_confidence: 0.90 (pseudo medication list)
```

**Observations:**
- High confidence for real encounters (0.96-0.98)
- Lower confidence for pseudo-encounters (0.90) - appropriate
- All above 0.80 threshold (no manual review flags)

**Verdict:** ✅ ISSUE RESOLVED

---

**3. ✅ `spatial_bounds` Column - NOW POPULATED**

**Original Issue (Nov 3-4):** Empty array `[]` for all encounters (generated but not written to DB)

**Current Status (Nov 6):** FULLY POPULATED with bounding box data

**Sample Data:**
```json
{
  "spatial_bounds": [
    {
      "page": 14,
      "region": "entire_page",
      "boundingBox": {
        "vertices": [
          {"x": 0, "y": 0},
          {"x": 1600, "y": 0},
          {"x": 1600, "y": 2260},
          {"x": 0, "y": 2260}
        ]
      },
      "pageDimensions": {"width": 1600, "height": 2260},
      "boundingBoxNorm": {"x": 0, "y": 0, "width": 1, "height": 1}
    },
    ...
  ]
}
```

**Observations:**
- Multiple pages for multi-page encounters (pages 1-13, 14-20)
- Single page for single-page encounters (page 1, page 2)
- Normalized coordinates enable click-to-source feature

**Verdict:** ✅ ISSUE RESOLVED

---

**4. ✅ `source_method` Column - NOW POPULATED**

**Original Issue (Nov 3-4):** `ai_extracted` boolean was FALSE, proposed rename to `source_method` TEXT enum

**Current Status (Nov 6):** Column RENAMED to `source_method` and populated with 'ai_pass_0_5'

**Sample Data:**
```
source_method: "ai_pass_0_5" (all recent encounters)
```

**Observations:**
- Schema migration completed (ai_extracted → source_method)
- Consistent population across all encounters
- Ready for future values ('ai_pass_2', 'manual_entry', 'import')

**Verdict:** ✅ ISSUE RESOLVED (schema migration completed)

---

**5. ✅ `facility_name` Column - NOW POPULATED**

**Original Issue (Nov 3-4):** NULL for lab reports and other encounters

**Current Status (Nov 6):** POPULATED for all encounters (including pseudo)

**Sample Data:**
```
facility_name: "NSW Health Pathology" (pathology test)
facility_name: "SYDNEY HOSPITAL AND SYDNEY EYE HOSPITAL PHARMACY DEPARTMENT" (medication label)
facility_name: "Piedmont Eastside Medical Emergency Department South Campus" (emergency)
facility_name: "Interventional Spine & Pain PC" (specialist)
```

**Verdict:** ✅ ISSUE RESOLVED

---

**6. ✅ `provider_name` Column - NOW POPULATED WHERE APPLICABLE**

**Original Issue (Nov 3-4):** NULL for lab reports

**Current Status (Nov 6):** POPULATED for real encounters with providers, NULL for pseudo (expected)

**Sample Data:**
```
provider_name: "Matthew T Tinkham, MD" (emergency department)
provider_name: "Mara B Ehret, PA-C" (specialist consultation)
provider_name: NULL (pathology test - no provider, expected)
provider_name: NULL (medication label - no provider, expected)
```

**Verdict:** ✅ ISSUE RESOLVED (NULL is expected for some encounter types)

---

### Remaining Open Issues

**1. ⚠️ `encounter_date_end` Column - Still NULL for All Encounters**

**Original Recommendation:** Populate for completed single-day encounters (set to encounter_date)

**Current Status (Nov 6):** Still NULL for all encounters

**Sample Data:**
```
encounter_id: 34ee2d9d-8348-42e4-8199-73ede4322c1d
encounter_date: 2025-10-27 00:00:00+00
encounter_date_end: NULL (SHOULD BE 2025-10-27 for completed encounter)

encounter_id: 20a9c431-c164-4947-acf2-e8eb2e4b9ca2
encounter_date: 2025-06-22 00:00:00+00
encounter_date_end: NULL (SHOULD BE 2025-06-22 for completed encounter)

encounter_id: 8c89d8f3-4a1b-4ffe-8890-352ae84700d8
encounter_date: 2025-07-03 00:00:00+00
encounter_date_end: NULL (SHOULD BE 2025-07-03 for completed pathology test)
```

**Impact:**
- Timeline cannot distinguish completed vs ongoing encounters
- Ambiguous NULL (could mean single-day OR ongoing OR unknown)

**Recommendation:** UPDATE Pass 0.5 logic to populate encounter_date_end

**Priority:** MEDIUM (semantic clarity issue, not blocking functionality)

---

**2. ⚠️ `date_source` Column - NOT YET ADDED**

**Original Recommendation:** Add new column to track date origin (ai_extracted | file_metadata | upload_date)

**Current Status (Nov 6):** Column does NOT exist yet

**Observed Behavior:**
- Real encounters have dates (ai_extracted)
- Pseudo-encounters may have NULL dates (medication label example)

**Sample Data:**
```
encounter_id: 70b167ab-651e-4ae6-a403-2ce057c164ba (pseudo medication list)
encounter_date: NULL
encounter_date_end: NULL
```

**Recommendation:**
1. Add `date_source` column to schema
2. Implement fallback logic: AI extracted → file metadata → upload date
3. Populate for all encounters (never NULL)

**Priority:** LOW (pseudo-encounters without dates still functional)

---

**3. ⚠️ `requires_review` Column - Logic Not Updated**

**Original Recommendation:** Set to TRUE when summary NULL OR confidence < 0.80

**Current Status (Nov 6):** All encounters show `requires_review: FALSE`

**Sample Data:**
```
encounter_id: 34ee2d9d-8348-42e4-8199-73ede4322c1d
summary: "Specialist pain management consultation..."
pass_0_5_confidence: 0.97
requires_review: FALSE (CORRECT - summary populated, confidence high)

encounter_id: 70b167ab-651e-4ae6-a403-2ce057c164ba
summary: "Pharmacy dispensing label..."
pass_0_5_confidence: 0.90
requires_review: FALSE (CORRECT - summary populated, confidence above 0.80)
```

**Analysis:**
- Current behavior appears CORRECT (no manual review needed)
- All summaries populated (no NULL summaries)
- All confidences above 0.80 threshold
- Logic may have been updated correctly

**Recommendation:**
- Monitor future uploads for low-confidence encounters
- Verify requires_review logic triggers when confidence < 0.80

**Priority:** LOW (appears to be working correctly)

---

### Schema Migration Status

**Confirmed Completed:**
1. ✅ `ai_extracted` → `source_method` (RENAMED and populated)

**Still Pending (from original audit):**
1. ⚠️ DROP COLUMN `visit_duration_minutes` (low value, rarely available)
2. ⚠️ DROP COLUMN `confidence_score` (redundant with pass_0_5_confidence)
3. ⚠️ DROP COLUMN `ai_confidence` (redundant with pass_0_5_confidence)
4. ⚠️ ADD COLUMN `date_source` TEXT (track date origin)

**Note:** Columns may have been removed but not yet confirmed via schema inspection.

---

### Summary of 6th November Findings

**Major Success:** 6 out of 8 critical issues RESOLVED in ~2 days

**Issues Fixed:**
1. ✅ summary column now populated with AI-generated descriptions
2. ✅ pass_0_5_confidence now populated with confidence scores
3. ✅ spatial_bounds now populated with bounding box data
4. ✅ source_method renamed and populated (was ai_extracted)
5. ✅ facility_name now populated for all encounters
6. ✅ provider_name now populated where applicable

**Remaining Work:**
1. ⚠️ encounter_date_end population logic (not yet implemented)
2. ⚠️ date_source column addition (not yet implemented)
3. ⚠️ Schema cleanup (remove redundant columns)

**Overall Assessment:** MAJOR IMPROVEMENT - Pass 0.5 data quality significantly enhanced

**Next Steps:**
1. Implement encounter_date_end population for completed encounters
2. Add date_source column with fallback logic
3. Complete schema cleanup (remove redundant columns)
4. Monitor requires_review logic on future low-confidence encounters

---

**Audit Status (6th November 2025):** DATA QUALITY SIGNIFICANTLY IMPROVED
**Recommendation:** PROCEED WITH REMAINING SCHEMA CLEANUP AND MINOR LOGIC UPDATES





Xavier's review 4th nov 2025:

okay reviewing healthcare_encounters audit file now:  
"### 2. Encounter Classification"; my only concern about thsi secion is the
  ;encounter_date_end`: KEEP (NULL = single-day)' - i dont know why but for some
  reason i suspect this decision to keep null sits poorly with me and i sense
  that it may cause issues in future. Such as, what happens with encounters that
  are ongoing and have encounter end date as null for a very good reason... how
  do we then distinguish an encounter that is finished vs ongoing? Are you
  aware that we have the 'master encounter' encounter deduplication and grouping
  concept and logic in place? research our db to gain context for this, but the
  column already exists in this table. But anyway, think this through more and
  respond back to me with possible plans/suggestions/solutions etc. tbh i feel
  like that lab report should definitly have the end date inserted, maybe we
  could instruct ai to determin if its a completed once off encounter (also i
  sense that the overwhelming majoruty of ecounters will have end dates, as
  documentation generally is not produced unless it is finalized and the
  encounter completed - can you think of any exceptions or scenarios where this
  isnt the case. Also, of course pseudo encounters dont need end dates let alone
  start dates or dates at all.          
"## 3. Provider and Facility
  Information"; A lot of these columns, and columns for the
  healthcare_encounters table in general, were designed and implemented before
  pass05 came into existence, back when encounters were to be created by pass2
  ai model. You probably already are aware, but many of these columns wont have
  values for pseudo encounters; such as facility or date info, but real
  encounters should definitly have this information otherwise it should never
  have qualified for real encounter. But in summary, i think i aggree to keep
  all these columns for now and maybe tweak the pass05 ai prompt so its output
  fills them, but maybe it would be a good idea to allow the AI to be unsure or
  apply N/A or NULL values etc - thoughts? Im again worried about bloating out
  the prompt context, diltuing the important stuff.   Another idea is that we
  leave many of these 'Provider and Facility Information' columns to be filled
  out by pass 2 whilst its reading all the entities and enriching them, but that
  sounds complex and scary.
'### 4. Clinical Context': Will 'chief_complaint` just be NULL if its a admin
  summary or medication list, for example?    'summary' is one of the most
  important columns for an encounter and should definitly be filled out with a
  summary of the encounter - a summary of the encounter is essential so that
  downstream passes (pass 2 predominately) can understand the broader context of
  a page and also of a clincial entity on that page. I beleive we have designed
  the system so that pass 1 and pass 2 receive a manifest for each file, which
  will contain ALL context about that file such as the encounters, the encounter
  page ranges etc, relevant spatial bbox data of those encounters, as well as
  the encounter context information such as the summary, the date ranges etc. So
  does the manifest include many of these columns, or is it that pass 2 is
  expected to fill out these columns? i do think tho that pass05 should
  definitly be the one to do summary and probably do the other columns too such
  as impression plan and complaint etc. 
'### 5. Administrative Data': why isnt 'visit_duration_minutes' within Pass 0.5 scope? who else is best placed to get this information, as it would be quite useful wouldnt it if we knew (if the data existed on teh file) how long the encounter went for. But how often is duration of an ecounter mentioned and is it necessary adn what use does it provide? Whats more useful is the date and teh start and end date, ie you really just want to know when an encounter was (date of the year) and secondly if it was a once off day date or a multi day encounter and when it ended. Hence, maybe we delete this column? Or can you think of any use case scenarios where the minutes duration of an encounter is A) actually recorded and B) useful to us to know and for the user to track and know via the app dashboard? 
'### 7. V3 AI Processing Integration (Legacy)': Why do we even need 'ai_extracted'? what role or prupose is it playing? and should 'ai_confidence' be in this table or in the metrics table or another table all together? I see that you said "Populate from `pass_0_5_confidence` for consistency" so why do we need it listed twice, is it better to have it in this table as well (located twice in db)?  For 'requires_review', Set to TRUE when:
  - `summary` IS NULL
    OR
  - `pass_0_5_confidence` < 0.80 
  We dont need to worry about the other 3 as pseudoencounters might not have any of them which is fine, such as an upload which is just a random picture of a medication list. (This does just now make me wonder whetehr we should have a column toa ccount for pseudo encoutners that do not have a date, such as that medication list example, where we just insert automatically the date that the file was created if present in the file's metadata, or if not the date of upload - that data might be useful, and hopefully we can get that data without ai to avoid ai workload).
'## 8. Pass 0.5: Encounter Discovery (Migration 34)': I think that pass0.5 is generating 'spatial_bounds' data as i think its all present in the manifest, so maybe we just need to tweak the output of pass0.5, or pull it from the manifest, whatever kindest to pass05 and avoids/reduces pass05 workload - but yes investigate.   
'### 10. Quality and Audit': yes consolidate `confidence_score` and `ai_confidence` and `pass_0_5_confidence` . ALso, not even sure how the AI is coming up with a confidence score and how reliable it is and how we are supposed to work with and interpret it? My understanding and stance is that you cant depend on ai confidence values anyway, but happy to persuaded to think otherwise. Do we prompt instruct what goes in to a confidence value? 