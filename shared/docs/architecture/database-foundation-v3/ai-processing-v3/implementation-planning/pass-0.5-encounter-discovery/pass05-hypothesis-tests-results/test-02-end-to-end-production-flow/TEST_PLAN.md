# Test 02: End-to-End Production Flow Validation

**Date:** October 30, 2025
**Test Type:** Complete production flow test (UI upload → Pass 0.5 → Pass 1)
**Status:** PLANNED
**Previous Test:** Test 01 (Integration & Constraint Fixes) - PARTIAL SUCCESS

---

## Test 01 Lessons Learned

### Issues Found in Test 01
1. **False Positive Detection** - AI detected `pseudo_lab_report` when document contains no lab results
2. **Spatial Data Not Validated** - Did not check bbox coordinates, page ranges, or spatial mapping
3. **Idempotency Cache** - Second test used cached Pass 0.5 results, didn't fully re-test logic
4. **Incomplete Validation** - Only validated 6 database queries, missed critical spatial data
5. **No Pass 1 Integration Check** - Did not verify Pass 1 actually USED the encounter manifest

### What Test 01 Did Validate ✅
- Worker integration (Pass 0.5 runs between OCR and Pass 1)
- Database constraint compliance (session_status, session_type, workflow_step)
- Atomic transactions (manifest/metrics/shell_files written together)
- Idempotency (safe to retry without duplicates)
- UPSERT fix (Pass 1 doesn't fail on duplicate session)

---

## Test 02 Objectives

### Primary Goal
**Validate EVERY component of Pass 0.5 in a real production flow**

### Test File
- **Upload Method:** Manual upload via production UI (exorahealth.com.au)
- **File:** `BP2025060246784 - first 2 page version V5.jpeg`
- **Ground Truth:** Patient Health Summary (1 page)
  - Contains: Warnings, Allergies, Family History, Medications, Past Medical History, Surgeries, Immunizations
  - Does NOT contain: Lab results, imaging reports, specific visit details
  - **Expected Detection:** 1 encounter (`pseudo_admin_summary` or `pseudo_health_summary`)

---

## Comprehensive Testing Checklist

### Phase 1: Pre-Upload Validation

- [ ] **1.1** Verify file exists locally at specified path
- [ ] **1.2** Confirm file size matches expected (should be similar to V4: ~69 KB)
- [ ] **1.3** Visual inspection confirms it's the health summary document
- [ ] **1.4** Record exact filename for tracking

### Phase 2: Manual Upload (Production Flow)

- [ ] **2.1** Log in to exorahealth.com.au production UI
- [ ] **2.2** Navigate to document upload interface
- [ ] **2.3** Upload file via UI
- [ ] **2.4** Record timestamp of upload
- [ ] **2.5** Capture shell_file_id from UI (if visible) or database query

**Expected Flow:**
1. Web UI → `shell-file-processor-v3` Edge Function
2. Edge Function → Supabase Storage write
3. Edge Function → `enqueue_job_v3()` RPC
4. Worker claims job from `job_queue`
5. Worker runs: OCR → Pass 0.5 → Pass 1

### Phase 3: Monitor Job Processing

- [ ] **3.1** Query job_queue for job_id using shell_file_id
- [ ] **3.2** Monitor job status (pending → processing → completed)
- [ ] **3.3** Record job start time
- [ ] **3.4** Monitor heartbeat_at updates (should refresh every 30s)
- [ ] **3.5** Record job completion time
- [ ] **3.6** Calculate total processing duration

**Expected Duration:** 8-10 minutes (OCR + Pass 0.5 + Pass 1)

### Phase 4: Pass 0.5 Encounter Detection Validation

#### 4.1 Encounter Accuracy (Manual Review)

**Query:**
```sql
SELECT
  id,
  encounter_type,
  is_real_world_visit,
  encounter_date,
  provider_name,
  facility_name,
  pass_0_5_confidence,
  page_range_start,
  page_range_end,
  created_at
FROM healthcare_encounters
WHERE primary_shell_file_id = '<shell_file_id>'
ORDER BY created_at;
```

**Manual Validation Checklist:**
- [ ] **4.1.1** Count total encounters detected (expected: 1)
- [ ] **4.1.2** Verify encounter_type is appropriate (`pseudo_admin_summary` or `pseudo_health_summary`)
- [ ] **4.1.3** Confirm is_real_world_visit = false (this is not a specific visit)
- [ ] **4.1.4** Check for false positives (NO `pseudo_lab_report` should exist)
- [ ] **4.1.5** Verify confidence score (expected: ≥ 0.85)
- [ ] **4.1.6** Confirm encounter_date is NULL (no specific visit date in document)
- [ ] **4.1.7** Confirm provider_name is NULL (no specific provider mentioned)
- [ ] **4.1.8** Confirm facility_name is "South Coast Medical" (facility shown in header)

**Ground Truth Comparison:**
- Document contains: Medication list, immunizations, past history, surgeries
- Document does NOT contain: Lab results, imaging reports, specific consultation notes
- Expected: 1 pseudo encounter representing the entire administrative summary

#### 4.2 Spatial Data Validation (CRITICAL - Not Tested in Test 01)

**Query:**
```sql
SELECT
  manifest_id,
  manifest_data
FROM shell_file_manifests
WHERE shell_file_id = '<shell_file_id>';
```

**Spatial Data Checklist:**
- [ ] **4.2.1** Verify `manifest_data` JSONB exists and is not null
- [ ] **4.2.2** Extract `manifest_data.encounters` array
- [ ] **4.2.3** For each encounter, verify structure includes:
  - `encounterType` (string)
  - `isRealWorldVisit` (boolean)
  - `pageRanges` (array of [start, end] pairs)
  - `confidence` (float 0-1)
  - `dateRange` (object or null)
  - `provider` (string or null)
  - `facility` (string or null)
- [ ] **4.2.4** Validate `pageRanges` format: `[[1,1]]` for 1-page document
- [ ] **4.2.5** Confirm page ranges are non-overlapping (Phase 1 requirement)
- [ ] **4.2.6** Verify page ranges cover all pages (1 encounter should span page 1)

**Example Expected Structure:**
```json
{
  "encounters": [
    {
      "encounterType": "pseudo_admin_summary",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "South Coast Medical",
      "pageRanges": [[1, 1]],
      "confidence": 0.90,
      "extractedText": "Patient Health Summary..."
    }
  ]
}
```

#### 4.3 Page Range Database Fields

**Query:**
```sql
SELECT
  id,
  encounter_type,
  page_range_start,
  page_range_end
FROM healthcare_encounters
WHERE primary_shell_file_id = '<shell_file_id>';
```

**Page Range Validation:**
- [ ] **4.3.1** Verify `page_range_start` = 1
- [ ] **4.3.2** Verify `page_range_end` = 1
- [ ] **4.3.3** Confirm non-null values (not NULL)
- [ ] **4.3.4** Validate ranges make sense (start ≤ end)

### Phase 5: Pass 0.5 Metrics Validation

**Query:**
```sql
SELECT
  shell_file_id,
  processing_session_id,
  encounters_detected,
  real_world_encounters,
  planned_encounters,
  pseudo_encounters,
  input_tokens,
  output_tokens,
  total_tokens,
  encounter_confidence_average,
  encounter_types_found,
  created_at
FROM pass05_encounter_metrics
WHERE shell_file_id = '<shell_file_id>';
```

**Metrics Validation Checklist:**
- [ ] **5.1** encounters_detected = 1 (only 1 encounter)
- [ ] **5.2** real_world_encounters = 0 (admin summary, not a visit)
- [ ] **5.3** planned_encounters = 0 (no future appointments)
- [ ] **5.4** pseudo_encounters = 1 (the admin summary)
- [ ] **5.5** input_tokens > 0 (AI was called)
- [ ] **5.6** output_tokens > 0 (AI returned response)
- [ ] **5.7** total_tokens = input + output
- [ ] **5.8** encounter_confidence_average ≥ 0.85
- [ ] **5.9** encounter_types_found = ['pseudo_admin_summary'] (or similar)
- [ ] **5.10** processing_session_id matches ai_processing_sessions table

### Phase 6: Shell File Completion Flags

**Query:**
```sql
SELECT
  id,
  pass_0_5_completed,
  pass_0_5_completed_at,
  pass_0_5_error,
  status
FROM shell_files
WHERE id = '<shell_file_id>';
```

**Completion Flag Validation:**
- [ ] **6.1** pass_0_5_completed = true
- [ ] **6.2** pass_0_5_completed_at is NOT NULL (timestamp recorded)
- [ ] **6.3** pass_0_5_error is NULL (no errors)
- [ ] **6.4** status = 'pass1_complete' or later (both passes completed)

### Phase 7: Manifest Atomic Transaction Validation

**Query:**
```sql
SELECT
  'manifest' as record_type,
  CASE WHEN COUNT(*) > 0 THEN 'EXISTS' ELSE 'MISSING' END as status
FROM shell_file_manifests
WHERE shell_file_id = '<shell_file_id>'

UNION ALL

SELECT
  'metrics' as record_type,
  CASE WHEN COUNT(*) > 0 THEN 'EXISTS' ELSE 'MISSING' END as status
FROM pass05_encounter_metrics
WHERE shell_file_id = '<shell_file_id>'

UNION ALL

SELECT
  'shell_file_flag' as record_type,
  CASE WHEN COUNT(*) > 0 THEN 'EXISTS' ELSE 'MISSING' END as status
FROM shell_files
WHERE id = '<shell_file_id>'
  AND pass_0_5_completed = true;
```

**Atomic Transaction Validation:**
- [ ] **7.1** manifest status = EXISTS
- [ ] **7.2** metrics status = EXISTS
- [ ] **7.3** shell_file_flag status = EXISTS
- [ ] **7.4** All 3 records exist (proves atomic RPC worked)

### Phase 8: Pass 1 Integration Validation (NEW - Not Tested in Test 01)

#### 8.1 Verify Pass 1 Loaded Manifest

**Check Worker Logs (Render.com):**
- [ ] **8.1.1** Search logs for "Starting Pass 1 entity detection"
- [ ] **8.1.2** Verify processing_session_id matches Pass 0.5 session
- [ ] **8.1.3** Check for any manifest-loading log messages

#### 8.2 Verify Entity-to-Encounter Assignment

**Query:**
```sql
SELECT
  entity_id,
  entity_type,
  entity_value,
  assigned_encounter_id,
  confidence_score,
  page_number
FROM entity_processing_audit
WHERE shell_file_id = '<shell_file_id>'
  AND assigned_encounter_id IS NOT NULL
LIMIT 10;
```

**Entity Assignment Validation:**
- [ ] **8.2.1** Check if entities have `assigned_encounter_id` populated
- [ ] **8.2.2** Verify assigned encounter IDs match encounters from Pass 0.5
- [ ] **8.2.3** Confirm entities on page 1 are assigned to the page-1 encounter
- [ ] **8.2.4** Validate spatial matching worked (page_number matches encounter page_range)

**CRITICAL:** If `assigned_encounter_id` is NULL for all entities, Pass 1 did NOT use the manifest!

#### 8.3 Pass 1 Metrics Check

**Query:**
```sql
SELECT
  total_entities_detected,
  entities_assigned_to_encounters,
  entities_unassigned
FROM pass1_entity_metrics
WHERE shell_file_id = '<shell_file_id>';
```

**Pass 1 Metrics Validation:**
- [ ] **8.3.1** total_entities_detected > 0 (Pass 1 ran)
- [ ] **8.3.2** entities_assigned_to_encounters > 0 (manifest was used)
- [ ] **8.3.3** Ratio makes sense (most entities should be assigned)

### Phase 9: Performance & Cost Validation

**Query:**
```sql
SELECT
  ai_model_used,
  ai_cost_usd,
  processing_time_ms,
  input_tokens,
  output_tokens,
  total_tokens
FROM shell_file_manifests
WHERE shell_file_id = '<shell_file_id>';
```

**Performance Targets:**
- [ ] **9.1** ai_cost_usd < $0.05 (target: under 5 cents)
- [ ] **9.2** processing_time_ms < 10000 (target: under 10 seconds)
- [ ] **9.3** ai_model_used = 'gpt-4o-mini' (correct model)
- [ ] **9.4** input_tokens reasonable for 1-page document (~1000-2000)
- [ ] **9.5** output_tokens reasonable (~100-300 for JSON response)

### Phase 10: Idempotency Validation

**Re-run the same job (manual upload same file again):**
- [ ] **10.1** Upload same file again (V5) through UI
- [ ] **10.2** Get new job_id from job_queue
- [ ] **10.3** Monitor job processing
- [ ] **10.4** Check worker logs for "already processed, returning existing result"
- [ ] **10.5** Verify manifest_count = 1 (still only 1 manifest, not 2)
- [ ] **10.6** Confirm processing_time_ms < 1000 (should be instant cache hit)
- [ ] **10.7** Verify ai_cost_usd = 0 (no AI call made)

---

## Success Criteria

### Pass 0.5 Core Functionality
- ✅ Detects exactly 1 encounter (pseudo_admin_summary)
- ✅ NO false positive lab_report encounter
- ✅ Spatial data (page ranges) populated correctly
- ✅ Manifest JSONB structure is valid
- ✅ Metrics accurate (1 pseudo, 0 real, 0 planned)
- ✅ Cost < $0.05, Time < 10s, Confidence ≥ 0.85

### Pass 1 Integration
- ✅ Pass 1 loaded manifest from Pass 0.5
- ✅ Entities assigned to correct encounter using spatial data
- ✅ Entity-to-encounter mapping works via page_number matching

### Data Integrity
- ✅ Atomic transactions work (all 3 writes succeed or fail together)
- ✅ Idempotency works (safe to retry without duplicates)
- ✅ No duplicate key errors (UPSERT fix operational)

### Production Flow
- ✅ UI upload → Edge Function → Storage → Job Queue → Worker
- ✅ Full pipeline completes without errors
- ✅ Shell file status progression: uploaded → processing → pass1_complete

---

## Test Execution Instructions

### Manual Upload Steps

1. **Navigate to:** https://exorahealth.com.au
2. **Log in** with test credentials
3. **Go to:** Document upload page
4. **Select file:** `/Users/xflanagan/Documents/EXORA HEALTH PTY LTD/Sample health data/BP2025060246784 - first 2 page version V5.jpeg`
5. **Click upload** and note timestamp
6. **Wait for processing** (8-10 minutes)
7. **Execute all validation queries** from this test plan
8. **Document results** in RESULTS.md

### Query Execution Order

Execute queries in this order:
1. Phase 3: Monitor job (while processing)
2. Phase 4: Encounter detection validation (after completion)
3. Phase 5: Metrics validation
4. Phase 6: Completion flags
5. Phase 7: Atomic transaction check
6. Phase 8: Pass 1 integration (CRITICAL)
7. Phase 9: Performance/cost
8. Phase 10: Idempotency (second upload)

---

## Expected Ground Truth

**Document Type:** Patient Health Summary (Administrative)

**Contains:**
- Personal details (Name: Xavier Flanagan, DOB: 25/04/1994)
- Facility: South Coast Medical
- Warnings: None
- Allergies: Nil known
- Family History: Not recorded
- **Current Medications:** Metformin 500mg, Perindopril 4mg
- **Active Past History:** T2DM, Hypertension
- **Past Surgeries:** Cholecystectomy 2023
- **Immunizations:** Fluvax, Vivaxim, Dukoral, etc.

**Does NOT Contain:**
- Lab results (pathology, blood tests)
- Imaging reports (X-rays, MRI)
- Specific consultation notes
- Discharge summaries

**Expected Detection:**
- 1 encounter: `pseudo_admin_summary` or `pseudo_health_summary`
- isRealWorldVisit: false
- Confidence: ≥ 0.85
- Page range: [1,1]
- Facility: "South Coast Medical"
- Provider: NULL (no specific doctor mentioned for a visit)
- Date: NULL (document is a summary, not dated consultation)

---

**Last Updated:** October 30, 2025
**Status:** Ready for execution - awaiting manual upload
