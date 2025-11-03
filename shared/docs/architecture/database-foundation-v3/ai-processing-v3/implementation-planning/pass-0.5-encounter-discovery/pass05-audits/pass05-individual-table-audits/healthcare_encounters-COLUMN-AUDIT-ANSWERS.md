# Pass 0.5 Column Audit: healthcare_encounters

**Date:** 2025-11-03
**Status:** AUDIT IN PROGRESS
**Context:** Comprehensive analysis of `healthcare_encounters` table columns
**Table Purpose:** Store clinical encounter records with Pass 0.5 encounter detection metadata

**Location:** shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql:519

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
- NULL for lab report (appropriate for single-day event?)
- **Question:** Should single-day encounters auto-populate encounter_date_end = encounter_date?
- **Use Cases:**
  - Multi-day hospital stays: start ≠ end
  - Single visit: start = end (or end = NULL?)
- **Recommendation:** Keep NULL for single-day events (NULL means "same day")

**Verdict:**
- `encounter_type`: KEEP
- `encounter_date`: KEEP but FIX extraction logic
- `encounter_date_end`: KEEP (NULL = single-day)

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

**Verdict:**
- `provider_name`: KEEP (works when data exists)
- `provider_type`: KEEP but ADD inference logic
- `facility_name`: KEEP but FIX extraction logic
- `specialty`: KEEP (Pass 2 responsibility)

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
- Users need summary to understand what encounter is
- **Examples:**
  - "Blood test results for routine physical exam"
  - "Comprehensive metabolic panel and lipid screening"
  - "Follow-up visit for hypertension management"
- **Recommendation:** Pass 0.5 should generate basic summary:
  - Pseudo lab report: "Lab test: [test names from OCR]"
  - Outpatient: "Visit with [provider] at [facility]"
  - Emergency: "Emergency department visit on [date]"

**`clinical_impression`:**
- Provider's medical assessment (e.g., "Type 2 diabetes, well-controlled")
- **Not in Pass 0.5 scope** - requires clinical reasoning
- **Verdict:** KEEP (Pass 2 responsibility)

**`plan`:**
- Treatment/management plan
- **Not in Pass 0.5 scope** - requires clinical interpretation
- **Verdict:** KEEP (Pass 2 responsibility)

**Verdict:**
- `chief_complaint`: KEEP (Pass 2)
- `summary`: KEEP but ADD basic generation in Pass 0.5
- `clinical_impression`: KEEP (Pass 2)
- `plan`: KEEP (Pass 2)

---

### 5. Administrative Data

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `visit_duration_minutes` | INTEGER | Visit length | PARTIAL | Not in Pass 0.5 scope | KEEP |
| `billing_codes` | TEXT[] | CPT codes | PARTIAL | Not in Pass 0.5 scope | KEEP |

**Analysis:**
- Both fields require clinical/administrative interpretation
- Not extractable from visual document analysis alone
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
| `ai_extracted` | BOOLEAN DEFAULT FALSE | Extracted by AI? | **FALSE** | Should be TRUE for Pass 0.5! | FIX |
| `ai_confidence` | NUMERIC(4,3) | AI confidence | **NULL** | Should have value | FIX |
| `requires_review` | BOOLEAN DEFAULT FALSE | Needs manual review | **FALSE** | Should be TRUE given missing data | FIX |

**Analysis:**

**`ai_extracted`:**
- **CRITICAL BUG:** Set to FALSE for Pass 0.5 encounters
- Pass 0.5 encounters ARE AI-extracted
- **Fix:** Set to TRUE when encounter created by Pass 0.5

**`ai_confidence`:**
- **CRITICAL BUG:** NULL for Pass 0.5 encounters
- Pass 0.5 generates confidence scores
- **Question:** Should this duplicate `pass_0_5_confidence`?
- **Recommendation:** Populate from `pass_0_5_confidence` for consistency

**`requires_review`:**
- **ISSUE:** FALSE despite missing critical data (date, facility, summary)
- **Recommendation:** Set to TRUE when:
  - `encounter_date` IS NULL
  - `facility_name` IS NULL AND `provider_name` IS NULL
  - `summary` IS NULL
  - `pass_0_5_confidence` < 0.80

**Verdict:**
- `ai_extracted`: KEEP but FIX to TRUE
- `ai_confidence`: KEEP but POPULATE from pass_0_5_confidence
- `requires_review`: KEEP but ADD logic to flag incomplete encounters

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
- **CRITICAL ISSUE:** Empty array `[]` for all encounters
- Should contain bounding box coordinates for encounter region
- **Purpose:** Highlight encounter location in PDF viewer
- **Format:** `[{"page": 1, "x": 100, "y": 200, "width": 400, "height": 600}, ...]`
- **Action Required:** Investigate why Pass 0.5 isn't generating spatial bounds

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
- **Verdict:** KEEP (NULL = single-day)

**`is_planned_future`:**
- TRUE for scheduled future appointments
- FALSE for past/current encounters
- **Verdict:** KEEP

**Verdict:**
- `page_ranges`: KEEP (working correctly)
- `spatial_bounds`: KEEP but FIX generation
- `identified_in_pass`: KEEP (working correctly)
- `is_real_world_visit`: KEEP (working correctly)
- `pass_0_5_confidence`: KEEP but FIX population
- `ocr_average_confidence`: KEEP
- `encounter_date_end`: KEEP
- `is_planned_future`: KEEP (working correctly)

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
| `confidence_score` | NUMERIC(4,3) | Overall confidence | PARTIAL | Redundant with ai_confidence? | REVIEW |
| `archived` | BOOLEAN NOT NULL DEFAULT FALSE | Soft delete | YES | None | KEEP |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Creation time | YES | None | KEEP |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Last update | YES | None | KEEP |

**Analysis:**

**`confidence_score`:**
- **Question:** How does this differ from `ai_confidence` and `pass_0_5_confidence`?
- Three confidence columns: confusing!
- **Recommendation:** Clarify purpose or consolidate

**`archived`, `created_at`, `updated_at`:**
- Standard audit columns, properly populated
- **Verdict:** KEEP ALL

---

## Summary

**Total Columns:** 37
**Columns Properly Populated:** 15 (41%)
**Columns Missing Data:** 16 (43%)
**Columns Future Use:** 6 (16%)

**Critical Data Quality Issues:** 8
1. `encounter_date` NULL for lab reports
2. `facility_name` NULL for lab reports
3. `summary` NULL for all encounters
4. `ai_extracted` FALSE (should be TRUE)
5. `ai_confidence` NULL (should be populated)
6. `pass_0_5_confidence` NULL (should be populated)
7. `spatial_bounds` empty for all encounters
8. `requires_review` FALSE despite missing data

---

## Action Plan

### CRITICAL (Fix Immediately)
1. **FIX:** `ai_extracted` should be TRUE for Pass 0.5 encounters
2. **FIX:** Populate `pass_0_5_confidence` from Pass 0.5 JSON output
3. **FIX:** Populate `ai_confidence` from `pass_0_5_confidence`
4. **FIX:** Extract `encounter_date` from lab reports and documents
5. **FIX:** Extract `facility_name` from document headers/footers
6. **FIX:** Generate basic `summary` for all encounter types
7. **FIX:** Generate `spatial_bounds` bounding boxes
8. **FIX:** Set `requires_review = TRUE` when critical fields are NULL

### HIGH PRIORITY
9. **ADD:** Provider type inference logic (encounter_type → provider_type)
10. **ADD:** Automatic summary generation based on encounter type
11. **REVIEW:** Confidence score column redundancy (3 columns!)
12. **TEST:** Verify encounter_date_end logic for single-day vs multi-day

### MEDIUM PRIORITY
13. **DOCUMENT:** Which fields are Pass 0.5 responsibility vs Pass 2
14. **CLARIFY:** encounter_type ambiguity ('outpatient' vs 'specialist_consultation')
15. **ANALYZE:** OCR confidence threshold for quality gates

### LOW PRIORITY
16. **FUTURE:** Master encounter grouping implementation (Phase 2)
17. **FUTURE:** Related documents linking

---

## Questions for User

1. Should single-day encounters auto-populate `encounter_date_end = encounter_date` or keep NULL?
2. Should we consolidate the three confidence columns or keep them separate?
3. Which fields should Pass 0.5 populate vs leaving for Pass 2?
4. What should `summary` contain for pseudo lab reports? (e.g., "Lab test: CBC, CMP")
5. Should `provider_type` be inferred from `encounter_type` automatically?
6. What's the minimum data requirement for an encounter to NOT require manual review?
