# Pass 0.5 Column Audit: pass05_encounter_metrics

**Date:** 2025-11-03
**Status:** AUDIT IN PROGRESS
**Context:** Comprehensive analysis of `pass05_encounter_metrics` table columns
**Table Purpose:** Pass 0.5 session-level performance, cost tracking, and encounter detection metrics

**Location:** shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql:219

---

## User-Reported Issues

### Issue 1: Incorrect pages_per_encounter for Frankenstein File
**Manifest ID:** ab2b90d5-da79-4f21-9610-971e667731a9 (20-page frankenstein file)

**Problem:**
- `pages_per_encounter` assigned **10 pages for BOTH encounters** (incorrect)
- Should have been **13 and 7 pages** respectively
- `total_pages` correctly stated **20 pages**

**Analysis:**
- Column: `pages_per_encounter NUMERIC(5,2)`
- Column is calculated as an **average** (total_pages / encounters_detected)
- Calculation: 20 pages ÷ 2 encounters = **10.00 pages per encounter**
- This is mathematically correct as an average but **semantically misleading**

**Root Cause:**
The column name `pages_per_encounter` (singular) implies individual encounter page counts, but it's actually storing the **average pages per encounter** across all encounters in the document.

**Impact:**
- Users expect individual encounter page counts
- Current metric provides no insight into page count distribution
- Cannot identify page count accuracy without querying `healthcare_encounters.page_ranges`

**Proposed Fix:**
1. Rename column to `avg_pages_per_encounter` for clarity
2. Add new column: `page_count_distribution` JSONB storing per-encounter page counts
3. Example: `{"encounter_1": 13, "encounter_2": 7, "avg": 10.0}`

**Action Plan:**
- [ ] Create migration to rename `pages_per_encounter` → `avg_pages_per_encounter`
- [ ] Add `page_count_distribution` JSONB column
- [ ] Update Pass 0.5 worker to populate distribution data
- [ ] Update frontend displays to show individual page counts

---

### Issue 2: Batching Columns - Purpose and Implementation Unclear
**Manifest ID:** b70f6cf2-73e1-4014-88cd-5265965c63af (142-page PDF)

**Problem:**
- `batching_required` = `TRUE` for 142-page PDF
- `batch_count` = `1` (what does this mean?)
- User question: "Where is the actual batching happening?"

**Analysis:**
- Columns:
  - `batching_required BOOLEAN NOT NULL DEFAULT FALSE`
  - `batch_count INTEGER DEFAULT 1`
- **Purpose:** Pass 0.5 should identify ideal batching points (encounter boundaries)
- **Current Implementation:** Unknown - no evidence of batching logic in Pass 0.5 worker

**Investigation Questions:**
1. What triggers `batching_required = TRUE`? Page count threshold?
2. What does `batch_count = 1` mean? (1 batch = no batching?)
3. Where is batching logic implemented? Pass 1? Pass 2?
4. How are ideal batch boundaries determined?

**Expected Behavior:**
- `batching_required = TRUE` when `page_count > [threshold]`
- `batch_count` = number of batches suggested (e.g., 3 for 142-page file)
- Batching should happen **at encounter boundaries** (not mid-encounter)
- Batch boundaries should be stored in a separate table or column

**Current State:**
- Columns exist but logic is unclear
- 142-page file marked as needing batching but only 1 batch?
- No evidence of batch boundary recommendations

**Action Plan:**
- [ ] Search Pass 0.5 worker code for batching logic
- [ ] Clarify what `batch_count = 1` means (is it a placeholder?)
- [ ] Define batching threshold (e.g., page_count > 50)
- [ ] Add `batch_boundaries` JSONB column to store suggested boundaries
- [ ] Implement batching recommendation logic in Pass 0.5 worker

---

## Column-by-Column Audit

### 1. Primary Keys and Foreign Keys

| Column | Type | Purpose | Verdict |
|--------|------|---------|---------|
| `id` | UUID PRIMARY KEY | Unique identifier | KEEP |
| `patient_id` | UUID REFERENCES user_profiles | Patient ownership | KEEP |
| `shell_file_id` | UUID REFERENCES shell_files | Source document | KEEP |
| `processing_session_id` | UUID REFERENCES ai_processing_sessions | Links to processing session | KEEP |

**Analysis:**
- Standard UUID primary key
- `patient_id` enables per-patient metrics queries
- `shell_file_id` enables per-document metrics queries
- `processing_session_id` provides uniqueness constraint and session linking
- All foreign keys necessary for data integrity

**Verdict:** KEEP ALL

---

### 2. Pass 0.5 Encounter Detection Metrics

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `encounters_detected` | INTEGER NOT NULL | Total encounters found | None | KEEP |
| `real_world_encounters` | INTEGER NOT NULL | Actual clinical visits | Timeline Test validation | KEEP |
| `planned_encounters` | INTEGER NOT NULL DEFAULT 0 | Future appointments | Migration 35 | KEEP |
| `pseudo_encounters` | INTEGER NOT NULL | Lab reports, non-visit documents | Classification critical | KEEP |

**Analysis:**
- `encounters_detected` = total encounters (real_world + planned + pseudo)
- `real_world_encounters` = past/current clinical visits (date + provider/facility)
- `planned_encounters` = future appointments (is_planned_future = TRUE)
- `pseudo_encounters` = lab reports, imaging results (no clinical visit)

**Timeline Test:**
- Real-world encounters MUST have: `encounter_date` + (`provider_name` OR `facility_name`)
- Pseudo encounters: Lab reports, imaging with NO provider/facility

**Verdict:** KEEP ALL (critical for encounter classification)

---

### 3. Performance Metrics

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `processing_time_ms` | INTEGER NOT NULL | Processing time in milliseconds | None | KEEP |
| `processing_time_seconds` | NUMERIC(10,2) GENERATED | Processing time in seconds (computed) | Redundant? | REVIEW |

**Analysis:**
- `processing_time_ms` is primary measurement
- `processing_time_seconds` is GENERATED column (computed from ms)
- **Question:** Do we need both? Frontend can compute seconds from ms

**Arguments for KEEPING:**
- GENERATED columns have zero storage cost (computed on read)
- Simplifies queries: `SELECT processing_time_seconds` vs `SELECT processing_time_ms / 1000.0`
- Database computes more efficiently than application layer

**Arguments for REMOVING:**
- Adds complexity to schema
- Redundant data (computed from ms)

**Verdict:** KEEP (zero storage cost, query convenience)

---

### 4. AI Model Tracking

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `ai_model_used` | TEXT NOT NULL | Model identifier | None | KEEP |

**Analysis:**
- Tracks which AI model performed encounter detection
- Critical for:
  - Cost calculations
  - Performance analysis
  - Model A/B testing
  - Auditing model changes

**Example Values:**
- `gpt-4-0125-preview`
- `gpt-4o-2024-05-13`
- `claude-3-opus-20240229`

**Verdict:** KEEP

---

### 5. Token Usage and Cost Metrics

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `input_tokens` | INTEGER NOT NULL | Tokens sent to AI | None | KEEP |
| `output_tokens` | INTEGER NOT NULL | Tokens generated by AI | None | KEEP |
| `total_tokens` | INTEGER NOT NULL | Sum of input + output | Redundant? | REVIEW |

**Analysis:**
- `input_tokens` = OCR text + prompt + instructions
- `output_tokens` = AI-generated encounter detection JSON
- `total_tokens` = input_tokens + output_tokens

**Question:** Is `total_tokens` redundant?

**Arguments for KEEPING:**
- Simplifies cost queries: `SELECT SUM(total_tokens)` vs `SELECT SUM(input_tokens + output_tokens)`
- Prevents calculation errors in application layer
- Cost calculations often use total tokens

**Arguments for REMOVING:**
- Trivial computation (input + output)
- Can be computed in query: `input_tokens + output_tokens AS total_tokens`

**Verdict:** KEEP (query simplification, cost calculation convenience)

---

### 6. Quality Metrics

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `ocr_average_confidence` | NUMERIC(3,2) | Average OCR quality (0.00-1.00) | None | KEEP |
| `encounter_confidence_average` | NUMERIC(3,2) | Average AI confidence in encounters | None | KEEP |
| `encounter_types_found` | TEXT[] | List of encounter types detected | None | KEEP |

**Analysis:**
- `ocr_average_confidence` = average Google Cloud Vision confidence across all pages
- `encounter_confidence_average` = average AI confidence in encounter detection
- `encounter_types_found` = unique encounter types: `['outpatient', 'specialist_consultation']`

**Purpose:**
- Quality monitoring
- Manual review prioritization
- Confidence threshold tuning

**Verdict:** KEEP ALL

---

### 7. Page Analysis Metrics

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `total_pages` | INTEGER NOT NULL | Total pages in document | None | KEEP |
| `pages_per_encounter` | NUMERIC(5,2) | Average pages per encounter | MISLEADING NAME | RENAME |

**Analysis:**
- See Issue 1 above for detailed analysis
- `pages_per_encounter` should be `avg_pages_per_encounter`
- Need additional column for per-encounter page count distribution

**Verdict:**
- `total_pages`: KEEP
- `pages_per_encounter`: RENAME to `avg_pages_per_encounter`

**Proposed Addition:**
- `page_count_distribution` JSONB: Per-encounter page counts

---

### 8. Batching Metrics

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `batching_required` | BOOLEAN NOT NULL DEFAULT FALSE | Document needs batching | UNCLEAR LOGIC | CLARIFY |
| `batch_count` | INTEGER DEFAULT 1 | Number of batches | UNCLEAR MEANING | CLARIFY |

**Analysis:**
- See Issue 2 above for detailed analysis
- Purpose unclear
- Implementation uncertain
- 142-page file has `batching_required = TRUE` but `batch_count = 1` (contradiction?)

**Verdict:** KEEP but CLARIFY logic and add documentation

**Proposed Addition:**
- `batch_boundaries` JSONB: Suggested batch boundaries (page ranges)

---

### 9. Audit Trail

| Column | Type | Purpose | Issues | Verdict |
|--------|------|---------|--------|---------|
| `user_agent` | TEXT | Browser/client info | None | KEEP |
| `ip_address` | INET | Client IP address | None | KEEP |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | Creation timestamp | None | KEEP |

**Analysis:**
- Standard audit trail columns
- `user_agent` helps identify client issues
- `ip_address` for security/debugging
- `created_at` for temporal analysis

**Verdict:** KEEP ALL

---

## Summary

**Total Columns:** 28
**Columns to Keep:** 26
**Columns to Rename:** 1 (`pages_per_encounter` → `avg_pages_per_encounter`)
**Columns to Add:** 2 (`page_count_distribution`, `batch_boundaries`)
**Columns Needing Clarification:** 2 (`batching_required`, `batch_count`)

---

## Action Plan

### High Priority
1. **Rename Column:** `pages_per_encounter` → `avg_pages_per_encounter`
2. **Add Column:** `page_count_distribution` JSONB (per-encounter page counts)
3. **Investigate:** Batching logic - what triggers `batching_required`?
4. **Clarify:** What does `batch_count = 1` mean?

### Medium Priority
5. **Add Column:** `batch_boundaries` JSONB (suggested batch page ranges)
6. **Document:** Batching threshold (when `batching_required = TRUE`)
7. **Update Worker:** Populate new `page_count_distribution` column

### Low Priority
8. **Review:** Token usage patterns for cost optimization
9. **Analyze:** OCR confidence thresholds for quality gates

---

## Questions for User

1. What is the intended page count threshold for `batching_required = TRUE`?
2. Should `batch_count = 1` mean "no batching needed" or "process as single batch"?
3. Where should batch boundaries be stored? (This table or separate table?)
4. Do we need per-page OCR confidence or is average sufficient?
