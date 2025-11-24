# Test 08: Post-Migration 38 + 39 Validation

**Test Date:** 2025-11-04
**Purpose:** Validate schema changes from Migration 38 (healthcare_encounters) and Migration 39 (pass05_encounter_metrics + shell_files) with real document processing
**Status:** Migrations Successful | 1 Critical Issue Discovered

---

## Executive Summary

Two database migrations were executed and validated with real document uploads:

**Migration 38:** healthcare_encounters schema cleanup
- Dropped: `visit_duration_minutes`, `confidence_score`, `ai_confidence`
- Renamed: `ai_extracted` → `source_method` (better semantic clarity)
- Added: `date_source` (track encounter date provenance)
- Added: `summary` (plain English encounter description)
- Enhanced: `spatial_bounds` now populated from Pass 0.5

**Migration 39:** pass05_encounter_metrics + shell_files cleanup
- Dropped: `pages_per_encounter`, `batch_count` (redundant/premature)
- Moved: `ai_cost_usd` from manifests to metrics (architectural fix)
- Added: `page_separation_analysis` JSONB to shell_files (future batching)
- Fixed: 5 critical bugs in RPC function

**Validation Result:** All new columns working correctly, but discovered a critical design flaw in lab report date extraction.

---

## Test Files

### File 1: Xavier_combined_2page_medication_and_lab.tiff
- **Pages:** 2 (TIFF format)
- **Content:** Medication dispensing label + pathology lab report
- **Encounters Detected:** 2
  - Encounter 1: Medication list (Sydney Hospital Pharmacy)
  - Encounter 2: Lab report (NSW Health Pathology, collected 03-Jul-2025)
- **Processing:** 63 seconds, $0.0077 cost
- **Purpose:** Test pseudo-encounter handling and multi-document detection

### File 2: 006_Emma_Thompson_Frankenstein_Progress_note_Emergency_summary.pdf
- **Pages:** 20 (Frankenstein file - two PDFs stacked)
- **Content:** Specialist consultation (pages 1-12) + ED visit (pages 13-20)
- **Encounters Detected:** 2
  - Encounter 1: Specialist consultation (Oct 27, 2025, Interventional Spine & Pain)
  - Encounter 2: Emergency Department (June 22, 2025, Piedmont Healthcare)
- **Processing:** 84 seconds, $0.0108 cost
- **Purpose:** Test boundary detection between stacked documents

---

## Table-by-Table Validation

### 1. shell_files

| Column | File 1 | File 2 | Status |
|--------|--------|--------|--------|
| `pass_0_5_completed` | true | true | OK |
| `pass_0_5_error` | null | null | OK |
| `page_separation_analysis` | null | null | Expected (not implemented) |
| `page_count` | 1 | 8 | MISMATCH (see issues) |

### 2. shell_file_manifests (Migration 39)

**Removed Columns:**
- `batch_count` - Not present (FIXED)
- `ai_cost_usd` - Not present (moved to metrics - FIXED)

**Existing Columns:**
- `batching_required`: false (both files)
- `manifest_data`: Present with page_assignments
- `ocr_average_confidence`: 0.96 (file 1), 0.97 (file 2)
- `total_encounters_found`: 2 (both files)

### 3. healthcare_encounters (Migration 38)

#### Encounter: Medication List (File 1)
```json
{
  "encounter_type": "pseudo_medication_list",
  "encounter_date": null,
  "encounter_date_end": null,
  "provider_name": null,
  "facility_name": "Sydney Hospital and Sydney Eye Hospital Pharmacy Department",
  "is_real_world_visit": false,
  "source_method": "ai_pass_0_5",          // NEW (Migration 38)
  "date_source": null,                      // NEW (Migration 38)
  "summary": "Pharmacy dispensing label for moxifloxacin 400 mg, 7 tablets, with dosing instructions from Sydney Hospital and Sydney Eye Hospital Pharmacy.",  // NEW (Migration 38)
  "spatial_bounds": [...],                  // POPULATED (Migration 38)
  "page_ranges": [[1,1]],
  "pass_0_5_confidence": 0.90
}
```

#### Encounter: Lab Report (File 1) - CRITICAL ISSUE
```json
{
  "encounter_type": "pseudo_lab_report",
  "encounter_date": null,                   // SHOULD BE "2025-07-03"
  "encounter_date_end": null,
  "provider_name": null,
  "facility_name": "NSW Health Pathology",
  "is_real_world_visit": false,             // SHOULD BE true
  "source_method": "ai_pass_0_5",
  "date_source": null,                      // SHOULD BE "ai_extracted"
  "summary": "Urine Mycoplasma genitalium resistance test by NSW Health Pathology collected 03-Jul-2025; azithromycin resistance mutation detected.",  // Date in summary but not in encounter_date
  "spatial_bounds": [...],
  "page_ranges": [[2,2]],
  "pass_0_5_confidence": 0.94
}
```

**Issue:** Lab report has specific date (03-Jul-2025) in summary but `encounter_date` is null. See CRITICAL_ISSUE_LAB_REPORT_DATES.md.

#### Encounter: Specialist Consultation (File 2)
```json
{
  "encounter_type": "specialist_consultation",
  "encounter_date": "2025-10-27",           // CORRECT
  "encounter_date_end": null,               // CORRECT (single-day)
  "provider_name": "Mara Ehret, PA-C",
  "facility_name": "Interventional Spine & Pain PC",
  "is_real_world_visit": true,
  "source_method": "ai_pass_0_5",           // NEW
  "date_source": "ai_extracted",            // NEW
  "summary": "Pain management specialist visit on October 27, 2025 for post-procedure follow-up of sacroiliitis and lumbar radiculopathy; SI joint injection ordered and medication regimen adjusted.",  // EXCELLENT
  "spatial_bounds": [...],                  // 12 pages of bboxes
  "page_ranges": [[1,12]],
  "pass_0_5_confidence": 0.96               // VERY HIGH range
}
```

#### Encounter: Emergency Department (File 2)
```json
{
  "encounter_type": "emergency_department",
  "encounter_date": "2025-06-22",           // CORRECT
  "encounter_date_end": null,               // CORRECT (single-day)
  "provider_name": "Matthew T Tinkham, MD",
  "facility_name": "Piedmont Eastside Medical Emergency Department South Campus",
  "is_real_world_visit": true,
  "source_method": "ai_pass_0_5",
  "date_source": "ai_extracted",
  "summary": "Emergency Department visit at Piedmont Eastside Medical on June 22, 2025 after a motor vehicle collision; evaluated, treated symptomatically, and discharged with acetaminophen, lidocaine patches, and methocarbamol.",  // EXCELLENT
  "spatial_bounds": [...],                  // 8 pages of bboxes
  "page_ranges": [[13,20]],
  "pass_0_5_confidence": 0.97               // VERY HIGH range
}
```

### 4. pass05_encounter_metrics (Migration 39)

#### File 1 Metrics
```json
{
  "encounters_detected": 2,
  "real_world_encounters": 0,               // Should be 1 (lab report)
  "planned_encounters": 0,
  "pseudo_encounters": 2,                   // Should be 1
  "processing_time_ms": 63035,
  "ai_model_used": "gpt-5-2025-08-07",
  "input_tokens": 7276,
  "output_tokens": 2940,
  "total_tokens": 10216,                    // CORRECT (7276+2940)
  "ai_cost_usd": 0.007699,                  // MOVED from manifests (Migration 39)
  "ocr_average_confidence": 0.96,
  "encounter_confidence_average": 0.92,     // CORRECT (avg 0.90+0.94)
  "encounter_types_found": ["pseudo_medication_list", "pseudo_lab_report"],
  "total_pages": 2,
  "batching_required": false
}
```

**Note:** `pages_per_encounter` and `batch_count` columns correctly removed (Migration 39).

#### File 2 Metrics
```json
{
  "encounters_detected": 2,
  "real_world_encounters": 2,               // CORRECT
  "planned_encounters": 0,
  "pseudo_encounters": 0,
  "processing_time_ms": 83756,
  "ai_model_used": "gpt-5-2025-08-07",
  "input_tokens": 17809,
  "output_tokens": 3152,
  "total_tokens": 20961,                    // CORRECT
  "ai_cost_usd": 0.010756,                  // MOVED from manifests
  "ocr_average_confidence": 0.97,
  "encounter_confidence_average": 0.97,     // CORRECT (avg 0.96+0.97)
  "encounter_types_found": ["specialist_consultation", "emergency_department"],
  "total_pages": 20,
  "batching_required": false
}
```

---

## Successes

### Migration 38: All New Columns Working

1. **`source_method` Column**
   - All encounters correctly set to 'ai_pass_0_5'
   - Replaces boolean `ai_extracted` with granular tracking
   - CHECK constraint working (accepts ai_pass_0_5, ai_pass_2, manual_entry, import)

2. **`date_source` Column**
   - Real-world encounters: 'ai_extracted'
   - Pseudo-encounters without dates: null
   - Fallback logic ready for file_metadata/upload_date

3. **`summary` Field - EXCELLENT QUALITY**
   - Content-aware, specific descriptions
   - Examples:
     - "Pharmacy dispensing label for moxifloxacin 400 mg, 7 tablets..."
     - "Pain management specialist visit on October 27, 2025 for post-procedure follow-up of sacroiliitis and lumbar radiculopathy; SI joint injection ordered..."
     - "Emergency Department visit... after a motor vehicle collision; evaluated, treated symptomatically..."
   - Plain English, patient-friendly, informative
   - Matches audit goal perfectly

4. **`spatial_bounds` Populated**
   - All encounters have bounding box coordinates
   - Multi-page encounters show all page bboxes
   - Ready for functional assignment (Pass 1)

### Migration 39: Architectural Improvements

1. **`ai_cost_usd` Correctly Moved**
   - Now in pass05_encounter_metrics (analytics data)
   - Removed from shell_file_manifests (content data)
   - Clean semantic separation

2. **Redundant Columns Removed**
   - `pages_per_encounter`: derivable from page_ranges
   - `batch_count`: premature without batch size policy
   - No data loss, cleaner schema

3. **RPC Function Bugs Fixed**
   - All 5 critical bugs resolved
   - Idempotency restored (ON CONFLICT)
   - total_tokens calculation working

### Frankenstein File Boundary Detection

**Perfect boundary detection at page 13:**
- Pages 1-12: Interventional Spine & Pain (Oct 27)
- Pages 13-20: Piedmont ED (June 22)

**Boundary signals correctly identified:**
- "Encounter Summary" header on page 13
- Provider change (Mara Ehret → Matthew Tinkham)
- Facility change
- Date discontinuity (Oct 27 → June 22)

**AI v2.3 page assignments:**
- Page 12: "Signatures and document metadata for Interventional Spine & Pain PC; closeout of encounter"
- Page 13: "NEW Encounter Summary header for ED; Piedmont Healthcare; date 06/22/2025"

### Confidence Scoring Alignment

Scores follow new Migration 38 guidelines:

- **0.97**: ED visit (VERY HIGH - date, provider, facility, clear boundaries)
- **0.96**: Specialist visit (VERY HIGH - complete information)
- **0.94**: Lab report (HIGH - facility and content, missing provider)
- **0.90**: Medication list (HIGH - clear content, no date/provider)

Guidelines working as designed:
- 0.95-1.00: Crystal clear identification
- 0.85-0.94: Mostly clear with minor gaps
- 0.70-0.84: Some uncertainty
- 0.50-0.69: Significant uncertainty

---

## Issues Discovered

### CRITICAL: Lab Report Date Extraction Failure

**Problem:** Lab report with specific collection date (03-Jul-2025) has:
- `encounter_date`: null
- `date_source`: null
- `is_real_world_visit`: false
- Summary: "...collected 03-Jul-2025..." (date visible only in text)

**Impact:**
- Lab tests invisible on patient timelines
- Analytics can't track when labs were performed
- Violates Timeline Test criteria (date + facility = timeline-worthy)

**Root Cause:** Design flaw in AI prompt - conflicting instructions

See: **CRITICAL_ISSUE_LAB_REPORT_DATES.md** for detailed analysis and fix options.

### Minor: Page Count Mismatch in shell_files

**Problem:**
- TIFF file: shell_files.page_count = 1, but manifest total_pages = 2
- Frankenstein PDF: shell_files.page_count = 8, but manifest total_pages = 20

**Root Cause:** Page count set during upload (edge function), before OCR discovers actual page count.

**Impact:** Reporting/analytics using shell_files.page_count will be incorrect.

**Fix:** Edge function or worker should update shell_files.page_count after OCR completes.

**Severity:** Low (metrics table has correct total_pages)

### Minor: ocr_average_confidence Not Copied to Encounters

**Observation:** Manifest has `ocr_average_confidence: 0.96`, but individual encounters show `null`.

**Possible Reasons:**
- Intentional (encounter-level OCR confidence not calculated)
- Or missing logic to copy from manifest

**Impact:** Minimal (manifest-level confidence available for analytics)

**Recommendation:** Document whether this is intentional or copy confidence per encounter.

---

## Recommendations

### 1. Fix Lab Report Date Extraction (CRITICAL)

**Decision Required:** How should lab reports with specific dates be classified?

**Option A (Recommended):** Reclassify dated lab reports as timeline-worthy
- Lab report with date + facility → real-world encounter
- Lab report without date → pseudo-encounter
- Update AI prompt Timeline Test

**Option B:** Allow pseudo-encounters to have dates
- Remove "pseudo-encounters leave dateRange null" rule
- Let them populate dates if found
- Requires frontend timeline logic changes

See CRITICAL_ISSUE_LAB_REPORT_DATES.md for detailed analysis.

### 2. Fix Page Count Sync

Update worker or edge function to sync shell_files.page_count after OCR completes.

### 3. Document ocr_average_confidence Behavior

Clarify whether null in encounters is intentional or should be populated.

---

## Test Execution Timeline

1. **Pre-test:** Migration 38 + 39 executed and verified in database
2. **Test uploads:** 2025-11-04 10:19-10:24
   - File 1 (TIFF): 10:23:14 uploaded, 10:24:28 completed
   - File 2 (Frankenstein): 10:19:28 uploaded, 10:21:43 completed
3. **Validation:** Database queries executed 10:30-11:00
4. **Analysis:** Issues identified and documented

---

## Conclusion

**Migrations 38 + 39: Overall Success**

All new schema columns working correctly:
- source_method, date_source, summary, spatial_bounds
- ai_cost_usd architectural fix
- Redundant columns removed

**Critical Issue Discovered: Lab report date extraction logic needs redesign.**

**Next Steps:**
1. Review CRITICAL_ISSUE_LAB_REPORT_DATES.md
2. Decide on fix approach (Option A or B)
3. Update AI prompt if needed
4. Re-test with same TIFF file to validate fix
5. Consider fixing page_count sync issue
