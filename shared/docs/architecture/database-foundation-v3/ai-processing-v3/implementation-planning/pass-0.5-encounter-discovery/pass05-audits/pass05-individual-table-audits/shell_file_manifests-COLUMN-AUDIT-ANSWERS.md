# Pass 0.5 Column Audit: shell_file_manifests

**Date:** 2025-11-06 (6th November 2025 audit)
**Status:** ✅ IMPLEMENTED (Migration 41 complete)
**Context:** Full column-by-column analysis of `shell_file_manifests` table
**Table Purpose:** Lightweight Pass 0.5 encounter discovery output - metadata for Pass 1/2 consumption

**Location:** shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql (CREATE TABLE shell_file_manifests)

---

## IMPLEMENTATION STATUS

**Migration 41 Executed:** 2025-11-06

**Changes Applied:**
- ✅ Removed `batching_required` column (logic moved to shell_files.page_separation_analysis per Migration 39)

**Worker Updates Deployed:**
- ✅ Worker now populates `pass_0_5_version` from environment variable (databaseWriter.ts:58)
- ✅ Worker includes `summary` field in manifest_data.encounters[] array (manifestBuilder.ts:262)
- ✅ RPC function updated to accept pass_0_5_version parameter (08_job_coordination.sql:1301)

**Environment Configuration:**
- ✅ PASS_05_VERSION environment variable should be set to track actual version (e.g., "v2.8")
  - Note: Currently defaults to "v2.8" if env var not set

**Source of Truth Updated:**
- ✅ current_schema/03_clinical_core.sql (lines 281-327: batching_required removed, pass_0_5_version default updated)
- ✅ current_schema/08_job_coordination.sql (RPC function signature updated)

**Verification:**
- ✅ Schema changes applied successfully
- ✅ Worker code deployed and operational
- ✅ Test uploads completing successfully with new schema

**See:** `migration_history/2025-11-06_41_shell_file_manifests_cleanup.sql`

---

## ORIGINAL AUDIT FINDINGS (Pre-Implementation)

**Key Findings:**
- All columns populated correctly
- pass_0_5_version not tracking actual version (shows "1.0.0", should be "v2.8") → RESOLVED (now populated from env var)
- batching_required always FALSE (Migration 39 removed batching logic) → RESOLVED (column removed)
- manifest_data structure matches v2.8 specification ✅
- Processing metrics accurately tracked ✅

**Critical Issues:** NONE

**Design Issues:**
1. **pass_0_5_version Column** - Hardcoded to "1.0.0" instead of tracking actual Pass 0.5 version (v2.8) → RESOLVED
2. **batching_required Column** - Always FALSE (batching analysis moved to shell_files.page_separation_analysis per Migration 39) → RESOLVED

---

## Executive Summary (Historical)

**Status at Audit:** MOSTLY WORKING CORRECTLY (now fully resolved)

---

## Complete Column-by-Column Audit

### GROUP 1: Primary Keys and Foreign Keys

| Column | Type | Purpose | Populated? | Sample Data | Verdict |
|--------|------|---------|------------|-------------|---------|
| `manifest_id` | UUID PRIMARY KEY | Unique identifier | YES | 2a7b80d5-8f93-4144-b701-201e8e43fe9f | ✓ KEEP |
| `shell_file_id` | UUID REFERENCES shell_files | Parent file | YES | 1b3c8e48-7a15-4686-902e-7c4ea47036c5 | ✓ KEEP |
| `patient_id` | UUID REFERENCES user_profiles | Patient ownership | YES | d1dbe18c-afc2-421f-bd58-145ddb48cbca | ✓ KEEP |

**Constraints:**
- `UNIQUE(shell_file_id)` - Ensures one manifest per file
- `ON DELETE CASCADE` - Manifest deleted when shell_file deleted

**Analysis:** Standard keys, properly populated, constraints working correctly.

**Verdict:** ✓ ALL WORKING CORRECTLY

---

### GROUP 2: Manifest Metadata

| Column | Type | Purpose | Populated? | Sample Data | Issues | Verdict |
|--------|------|---------|------------|-------------|--------|---------|
| `created_at` | TIMESTAMPTZ NOT NULL | When manifest created | YES | 2025-11-05 22:05:03.208081+00 | None | ✓ KEEP |
| `pass_0_5_version` | TEXT NOT NULL | Pass 0.5 version tracking | YES | "1.0.0" (all records) | **WRONG VERSION** | ⚠️ FIX |
| `processing_time_ms` | INTEGER | Processing duration | YES | 34296 ms (34 seconds) | None | ✓ KEEP |

**Sample Data:**
```
manifest_id: 2a7b80d5-8f93-4144-b701-201e8e43fe9f
created_at: "2025-11-05 22:05:03.208081+00"
pass_0_5_version: "1.0.0" (WRONG - should be "v2.8")
processing_time_ms: 34296 (TIFF file, 2 pages)
```

**Issue: pass_0_5_version Not Tracking Actual Version**

**Current State:**
All recent manifests show `pass_0_5_version = "1.0.0"` despite actual version being v2.8.

**Root Cause:**
Worker code likely has hardcoded default:
```typescript
await supabase.from('shell_file_manifests').insert({
  pass_0_5_version: '1.0.0', // HARDCODED!
  // ... other fields
});
```

**Expected Behavior:**
```typescript
await supabase.from('shell_file_manifests').insert({
  pass_0_5_version: process.env.PASS_05_VERSION || 'v2.8', // From environment
  // ... other fields
});
```

**Impact:**
- Cannot track which version processed which file
- Impossible to identify files processed with buggy versions (v2.7, v2.6, etc.)
- Makes regression analysis difficult

**Recommendation:**
1. Add `PASS_05_VERSION` environment variable to Render.com worker
2. Update worker to populate from environment
3. Backfill historical records if needed (though all test data) - dont do this. 

**Verdict:** ⚠️ FIX HARDCODED VERSION

---

### GROUP 3: File Analysis Metrics

| Column | Type | Purpose | Populated? | Sample Data | Issues | Verdict |
|--------|------|---------|------------|-------------|--------|---------|
| `total_pages` | INTEGER NOT NULL | Page count | YES | 2, 20 | None | ✓ KEEP |
| `total_encounters_found` | INTEGER NOT NULL | Encounter count | YES | 2 | None | ✓ KEEP |
| `ocr_average_confidence` | NUMERIC(3,2) | Average OCR quality | YES | 0.96, 0.97 | None | ✓ KEEP |

**Sample Data:**

**Frankenstein File (20 pages):**
```
total_pages: 20
total_encounters_found: 2
ocr_average_confidence: 0.97
```

**TIFF File (2 pages):**
```
total_pages: 2
total_encounters_found: 2 (1 pseudo, 1 real)
ocr_average_confidence: 0.96
```

**Analysis:**
- total_pages matches actual page count (verified against shell_files.page_count after fix)
- total_encounters_found includes pseudo-encounters (medication labels, etc.)
- ocr_average_confidence calculated from `ocrAverageConfidence` field in manifest_data JSONB

**Data Source:**
All three fields are derived from manifest_data JSONB:
```json
{
  "totalPages": 2,
  "encounters": [/* 2 encounters */],
  "ocrAverageConfidence": 0.9644956909115818
}
```

**Verdict:** ✓ ALL WORKING CORRECTLY

---

### GROUP 4: Batching Metadata (Migration 39 Changes)

| Column | Type | Purpose | Populated? | Sample Data | Issues | Verdict |
|--------|------|---------|------------|-------------|--------|---------|
| `batching_required` | BOOLEAN NOT NULL | Smart batching flag | YES | FALSE (all records) | Always FALSE | ⚠️ VESTIGIAL? |

**Migration 39 Context (2025-11-04):**

**What Changed:**
- `batch_count` column REMOVED from shell_file_manifests
- Batching analysis MOVED to `shell_files.page_separation_analysis` (JSONB)
- `batching_required` column KEPT but logic removed

**Current Behavior:**
All manifests have `batching_required = FALSE` regardless of file size or complexity.

**Original Intent:**
Flag files needing page-by-page processing (20+ page Frankenstein files).

**Schema Comment:**
```sql
-- Batching metadata (Migration 39 - 2025-11-04: batch_count removed, analysis moved to shell_files.page_separation_analysis)
batching_required BOOLEAN NOT NULL DEFAULT FALSE,
```

**Analysis:**

**Option A: Remove Column (RECOMMENDED)**
Batching logic now lives in shell_files.page_separation_analysis.

**Pros:**
- Cleaner schema
- No redundant data
- Migration 39 already moved batching to shell_files

**Cons:**
- Schema migration required
- Need to update worker code

**Option B: Populate from page_separation_analysis**
Derive value from shell_files.page_separation_analysis JSONB.

**Pros:**
- Keep column for quick filtering
- Denormalized data for performance

**Cons:**
- Data redundancy
- Maintenance burden
- Not currently populated

**Recommendation:** REMOVE in next migration - batching analysis belongs in shell_files table (already done).

**Verdict:** ⚠️ VESTIGIAL COLUMN - Consider removal

---

### GROUP 5: Manifest Content (JSONB Structure)

| Column | Type | Purpose | Populated? | Sample Size | Issues | Verdict |
|--------|------|---------|------------|-------------|--------|---------|
| `manifest_data` | JSONB NOT NULL | Complete encounter manifest | YES | 10KB - 50KB | None | ✓ KEEP |

**Sample Structure (TIFF File):**
```json
{
  "batching": null,
  "patientId": "d1dbe18c-afc2-421f-bd58-145ddb48cbca",
  "encounters": [
    {
      "facility": "SYDNEY HOSPITAL AND SYDNEY EYE HOSPITAL PHARMACY DEPARTMENT",
      "provider": null,
      "dateRange": null,
      "confidence": 0.9,
      "pageRanges": [[1, 1]],
      "encounterId": "70b167ab-651e-4ae6-a403-2ce057c164ba",
      "encounterType": "pseudo_medication_list",
      "extractedText": "Moxifloxacin 400mg...",
      "spatialBounds": [/* bounding boxes */],
      "isRealWorldVisit": false
    },
    {
      "facility": "NSW Health Pathology",
      "provider": null,
      "dateRange": {"start": "2025-07-03", "end": null},
      "confidence": 0.96,
      "pageRanges": [[2, 2]],
      "encounterId": "8c89d8f3-4a1b-4ffe-8890-352ae84700d8",
      "encounterType": "outpatient",
      "extractedText": "NSW HEALTH PATHOLOGY... Collection Date : 03 - Jul - 2025...",
      "spatialBounds": [/* bounding boxes */],
      "isRealWorldVisit": true
    }
  ],
  "totalPages": 2,
  "shellFileId": "1b3c8e48-7a15-4686-902e-7c4ea47036c5",
  "page_assignments": [
    {
      "page": 1,
      "encounter_id": "enc-1",
      "justification": "Contains 'SYDNEY HOSPITAL AND SYDNEY EYE HOSPITAL PHARMACY DEPARTMENT'..."
    },
    {
      "page": 2,
      "encounter_id": "enc-2",
      "justification": "Header 'NSW HEALTH PATHOLOGY' with 'Collection Date : 03 - Jul - 2025'..."
    }
  ],
  "ocrAverageConfidence": 0.9644956909115818
}
```

**Key Fields in manifest_data:**

**Top Level:**
- `patientId` - UUID of patient
- `shellFileId` - UUID of shell_file
- `totalPages` - Page count
- `ocrAverageConfidence` - OCR quality metric
- `batching` - null (batching logic removed)
- `encounters[]` - Array of encounter objects
- `page_assignments[]` - Array of page-to-encounter mappings

**Encounter Object:**
- `encounterId` - UUID for this encounter
- `encounterType` - Type of encounter (e.g., "outpatient", "emergency_department", "pseudo_medication_list")
- `provider` - Provider name (e.g., "Matthew T Tinkham, MD") or null
- `facility` - Facility name (e.g., "Piedmont Eastside Medical Emergency Department South Campus")
- `dateRange` - {start: "YYYY-MM-DD", end: "YYYY-MM-DD" | null} or null
- `confidence` - AI confidence score (0.0 - 1.0)
- `pageRanges` - Array of [start, end] page ranges (e.g., [[1, 13], [14, 20]])
- `extractedText` - Sample text from encounter (first 200 chars)
- `spatialBounds` - Array of bounding boxes for each page
- `isRealWorldVisit` - Boolean (true for real encounters, false for pseudo-encounters)

**Page Assignment Object:**
- `page` - Page number (1-indexed)
- `encounter_id` - "enc-N" identifier
- `justification` - Text explaining why this page belongs to this encounter

**Spatial Bounds Object:**
- `page` - Page number
- `region` - "entire_page" or specific region
- `boundingBox` - Pixel coordinates
- `pageDimensions` - {width, height} in pixels
- `boundingBoxNorm` - Normalized coordinates (0.0 - 1.0)

**Analysis:**

**Data Quality:**
- All required fields populated
- Nested structure matches v2.8 specification
- Spatial bounds enable click-to-source feature
- Page assignments enable Pass 1 batching

**Storage Size:**
- TIFF (2 pages): ~10KB JSONB
- Frankenstein (20 pages): ~50KB JSONB
- Acceptable for lightweight manifest

**Consistency:**
- totalPages matches top-level total_pages column ✓
- encounters.length matches top-level total_encounters_found column ✓
- ocrAverageConfidence matches top-level ocr_average_confidence column ✓

**Verdict:** ✓ WORKING CORRECTLY

---

### GROUP 6: AI Audit

| Column | Type | Purpose | Populated? | Sample Data | Issues | Verdict |
|--------|------|---------|------------|-------------|--------|---------|
| `ai_model_used` | TEXT NOT NULL | AI model identifier | YES | "gpt-5-2025-08-07" | None | ✓ KEEP |

**Sample Data:**
```
ai_model_used: "gpt-5-2025-08-07" (all recent records)
```

**Migration 39 Note:**
```sql
-- AI audit (Migration 39 - 2025-11-04: ai_cost_usd moved to pass05_encounter_metrics)
ai_model_used TEXT NOT NULL,
```

**Analysis:**

**ai_cost_usd Column REMOVED:**
Cost tracking moved to `pass05_encounter_metrics` table for better granularity.

**ai_model_used Column KEPT:**
Tracks which AI model performed encounter discovery.

**Current Behavior:**
All manifests use "gpt-5-2025-08-07" (correct - matches PASS_05_AI_MODEL environment variable).

**Historical Tracking:**
Useful for:
- Identifying files processed by specific model versions
- A/B testing different models
- Debugging model-specific issues

**Verdict:** ✓ WORKING CORRECTLY

---

## Sample Data Analysis

### File 1: TIFF Lab Report (2 pages)

**Manifest Record:**
```
manifest_id: 2a7b80d5-8f93-4144-b701-201e8e43fe9f
shell_file_id: 1b3c8e48-7a15-4686-902e-7c4ea47036c5
created_at: 2025-11-05 22:05:03.208081+00
pass_0_5_version: "1.0.0" (SHOULD BE "v2.8")
processing_time_ms: 34296 (34.3 seconds)
total_pages: 2
total_encounters_found: 2
ocr_average_confidence: 0.96
batching_required: FALSE
ai_model_used: "gpt-5-2025-08-07"
```

**Encounters Detected:**
1. **Pseudo-Encounter:** Pharmacy medication label (page 1)
2. **Real Encounter:** Pathology lab report (page 2)

**Processing Metrics:**
- 34.3 seconds for 2 pages = 17.2 seconds/page
- OCR confidence: 96% (excellent)

---

### File 2: Frankenstein File (20 pages)

**Manifest Record:**
```
manifest_id: 8779d393-c6bc-467b-b94e-4fa47db15dca
shell_file_id: 1c1c18b9-3a15-4dac-ac56-cfebd6228566
created_at: 2025-11-05 22:04:52.299516+00
pass_0_5_version: "1.0.0" (SHOULD BE "v2.8")
processing_time_ms: 109014 (109 seconds)
total_pages: 20
total_encounters_found: 2
ocr_average_confidence: 0.97
batching_required: FALSE
ai_model_used: "gpt-5-2025-08-07"
```

**Encounters Detected:**
1. **Specialist Consultation:** Interventional Spine & Pain PC, Oct 27, 2025 (pages 1-13)
2. **Emergency Department:** Piedmont Healthcare, June 22, 2025 (pages 14-20)

**Processing Metrics:**
- 109 seconds for 20 pages = 5.45 seconds/page
- OCR confidence: 97% (excellent)
- Correctly identified boundary at pages 13/14 (v2.8 fix working!)

---

## Data Consistency Validation

### Consistency Check 1: Columns vs JSONB

**Query:**
```sql
SELECT
  manifest_id,
  total_pages = (manifest_data->>'totalPages')::int AS pages_match,
  total_encounters_found = jsonb_array_length(manifest_data->'encounters') AS encounters_match,
  ABS(ocr_average_confidence - (manifest_data->>'ocrAverageConfidence')::numeric) < 0.01 AS confidence_match
FROM shell_file_manifests
WHERE created_at > '2025-11-01';
```

**Expected Result:** All TRUE (columns match JSONB data)

**Actual Result (from sample data):**
- pages_match: TRUE ✓
- encounters_match: TRUE ✓
- confidence_match: TRUE ✓

**Verdict:** ✓ COLUMNS AND JSONB CONSISTENT

---

### Consistency Check 2: Manifest vs Shell Files

**Query:**
```sql
SELECT
  sfm.manifest_id,
  sfm.shell_file_id,
  sfm.total_pages AS manifest_pages,
  sf.page_count AS shell_file_pages,
  sfm.total_pages = sf.page_count AS pages_consistent
FROM shell_file_manifests sfm
JOIN shell_files sf ON sfm.shell_file_id = sf.id
WHERE sfm.created_at > '2025-11-01';
```

**Expected Result:** All pages_consistent = TRUE

**Actual Result (after page_count fix):**
- Frankenstein: 20 = 20 ✓
- TIFF: 2 = 2 ✓

**Verdict:** ✓ MANIFEST AND SHELL_FILES CONSISTENT

---

### Consistency Check 3: Manifest vs Healthcare Encounters

**Query:**
```sql
SELECT
  sfm.manifest_id,
  sfm.total_encounters_found AS manifest_count,
  COUNT(he.id) AS db_encounter_count,
  sfm.total_encounters_found = COUNT(he.id) AS counts_match
FROM shell_file_manifests sfm
LEFT JOIN healthcare_encounters he ON he.primary_shell_file_id = sfm.shell_file_id
WHERE sfm.created_at > '2025-11-01'
GROUP BY sfm.manifest_id, sfm.total_encounters_found;
```

**Expected Result:** All counts_match = TRUE

**Actual Result:**
- Frankenstein: 2 = 2 ✓
- TIFF: 2 = 2 ✓

**Verdict:** ✓ MANIFEST AND HEALTHCARE_ENCOUNTERS CONSISTENT

---

## Issues Summary

### Issue 1: pass_0_5_version Hardcoded to "1.0.0"

**Severity:** MEDIUM
**Impact:** Cannot track which version processed which file
**Status:** NOT FIXED

**Current State:**
All manifests show `pass_0_5_version = "1.0.0"` despite actual version being v2.8.

**Recommendation:**
```typescript
// Worker code change:
await supabase.from('shell_file_manifests').insert({
  pass_0_5_version: process.env.PASS_05_VERSION || 'v2.8',
  // ... other fields
});
```

**Migration:**
```sql
-- Backfill existing records (if needed)
UPDATE shell_file_manifests
SET pass_0_5_version = 'v2.8'
WHERE created_at > '2025-11-01' AND pass_0_5_version = '1.0.0';
```

---

### Issue 2: batching_required Column Vestigial

**Severity:** LOW
**Impact:** Unused column adding schema complexity
**Status:** NOT FIXED

**Current State:**
All manifests have `batching_required = FALSE` (logic removed in Migration 39).

**Recommendation:**
Remove column in next migration:
```sql
ALTER TABLE shell_file_manifests
DROP COLUMN batching_required;
```

**Alternative:**
Keep column but populate from shell_files.page_separation_analysis:
```sql
UPDATE shell_file_manifests sfm
SET batching_required = CASE
  WHEN sf.page_separation_analysis IS NOT NULL
    AND (sf.page_separation_analysis->>'batching_recommended')::boolean = TRUE
  THEN TRUE
  ELSE FALSE
END
FROM shell_files sf
WHERE sfm.shell_file_id = sf.id;
```

---

## Performance Analysis

### Table Size

**Current Data:**
```sql
SELECT
  COUNT(*) AS total_records,
  pg_size_pretty(pg_total_relation_size('shell_file_manifests')) AS table_size,
  pg_size_pretty(pg_relation_size('shell_file_manifests')) AS data_size,
  pg_size_pretty(pg_total_relation_size('shell_file_manifests') - pg_relation_size('shell_file_manifests')) AS index_size
FROM shell_file_manifests;
```

**Expected:**
- Total records: ~5 (test data)
- Table size: <1 MB
- JSONB storage: 10-50 KB per record

---

### Index Usage

**Indexes:**
```sql
CREATE INDEX idx_manifests_shell_file ON shell_file_manifests(shell_file_id);
CREATE INDEX idx_manifests_patient ON shell_file_manifests(patient_id);
CREATE INDEX idx_manifests_created ON shell_file_manifests(created_at);
```

**Usage Patterns:**
1. **idx_manifests_shell_file** - Used for shell_file → manifest lookup (1:1 relationship)
2. **idx_manifests_patient** - Used for patient's manifest list queries
3. **idx_manifests_created** - Used for chronological sorting

**Additional Indexes (Consider):**
```sql
-- For filtering by Pass 0.5 version
CREATE INDEX idx_manifests_version ON shell_file_manifests(pass_0_5_version);

-- For filtering by AI model
CREATE INDEX idx_manifests_ai_model ON shell_file_manifests(ai_model_used);
```

**JSONB Indexes (Consider):**
```sql
-- For querying encounter types within manifest_data
CREATE INDEX idx_manifests_encounter_types ON shell_file_manifests
USING GIN ((manifest_data->'encounters'));
```

---

## Recommendations

### Immediate Actions

1. **Fix pass_0_5_version Hardcoded Value**
   - Add `PASS_05_VERSION` environment variable to Render.com
   - Update worker to populate from environment
   - Backfill existing records to "v2.8"

2. **Monitor JSONB Size**
   - Track manifest_data size for large files (50+ pages)
   - Consider compression if sizes exceed 100KB

### Schema Cleanup

3. **Remove batching_required Column** (Optional)
   - Logic moved to shell_files.page_separation_analysis
   - Column no longer used
   - Remove in next migration

4. **Add Version Tracking Index**
   ```sql
   CREATE INDEX idx_manifests_version ON shell_file_manifests(pass_0_5_version);
   ```

### Data Quality

5. **Validate Manifest Consistency**
   - Run consistency checks regularly
   - Verify columns match JSONB data
   - Verify manifest counts match healthcare_encounters

6. **Monitor Processing Times**
   ```sql
   SELECT
     total_pages,
     AVG(processing_time_ms) AS avg_ms,
     AVG(processing_time_ms / total_pages) AS avg_ms_per_page
   FROM shell_file_manifests
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY total_pages
   ORDER BY total_pages;
   ```

---

## Architectural Insights

### Manifest Data Structure Design

**Purpose:** Lightweight metadata for Pass 1/2 consumption

**Design Decisions:**

1. **Denormalized Data:**
   - totalPages duplicated in column + JSONB
   - total_encounters_found duplicated in column + JSONB
   - ocr_average_confidence duplicated in column + JSONB
   - **Rationale:** Fast queries without JSONB extraction

2. **Rich JSONB Structure:**
   - Complete encounter metadata
   - Spatial bounds for click-to-source
   - Page assignments for batching
   - **Rationale:** Flexible schema for future features

3. **One Manifest Per File:**
   - UNIQUE(shell_file_id) constraint
   - 1:1 relationship
   - **Rationale:** Pass 0.5 runs once per file

4. **Migration 39 Batching Cleanup:**
   - batch_count removed from manifests
   - Batching analysis moved to shell_files
   - **Rationale:** Batching is shell-file-level concern, not manifest-level

---

## Testing Checklist

### Unit Tests

- [ ] Manifest creation populates all required columns
- [ ] JSONB structure matches specification
- [ ] Columns match JSONB data
- [ ] UNIQUE constraint prevents duplicate manifests

### Integration Tests

- [ ] Manifest total_pages matches shell_files.page_count
- [ ] Manifest total_encounters_found matches healthcare_encounters count
- [ ] pass_0_5_version reflects actual version
- [ ] processing_time_ms is reasonable (5-20 seconds per page)

### Regression Tests

- [ ] v2.8 manifests detect correct boundaries (Frankenstein file test)
- [ ] Pseudo-encounters properly flagged (isRealWorldVisit = false)
- [ ] Page assignments have accurate justifications

---

## Conclusion

**Status:** MOSTLY WORKING CORRECTLY

**Critical Issues:** NONE

**Design Issues:**
1. pass_0_5_version hardcoded to "1.0.0" (should track actual version)
2. batching_required column vestigial (logic removed in Migration 39)

**Strengths:**
- All core columns populated correctly
- JSONB structure matches v2.8 specification
- Data consistency maintained across tables
- Processing metrics accurately tracked

**Next Steps:**
1. Fix pass_0_5_version population in worker
2. Consider removing batching_required column
3. Add version tracking index
4. Monitor JSONB size for large files

**Audit Status:** COMPREHENSIVE REVIEW COMPLETE
**Recommendation:** FIX VERSION TRACKING, OPTIONAL BATCHING CLEANUP







Xavier's review 6th November 2025

For shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-0.5-encounter-discovery/pass05-audits/pass05-individual-table-audits/shell_file_manifests-COLUMN-AUDIT-ANSWERS.md

1. Aggree with your main header recommendation that was:
- Update worker to populate pass_0_5_version with actual version (v2.8, v2.7, etc.) - and dont worry too much about updating past data as we are pre users and pre launcha nd its all test data. - but if its easy to do it might be handy but only if its easy to do. 
- Remove batching_required column (vestigial after Migration 39)"

2. For '### GROUP 5: Manifest Content (JSONB Structure)' 
   - Im reviewing the actual example output that you provided and i notice that there is no actual summary of the entire encounter, which would be useful for the AI during pass 1 and 2 to know. We already have a summary that is outputed and injected into heatlhcare_encoutner table so can we include that in the manifest data for each encounter?  whats the best way to do this?