# Pass 0.5 Test Execution Plan

**Date:** October 30, 2025
**Status:** PRE-INTEGRATION - Pass 0.5 code ready, worker integration pending
**Objective:** Execute Test 01 end-to-end validation

---

## Current Status

**Pass 0.5 Worker Code:** ✅ Complete
- Location: `apps/render-worker/src/pass05/`
- Files: index.ts, encounterDiscovery.ts, manifestBuilder.ts, databaseWriter.ts, aiPrompts.ts, types.ts
- Status: All fixes applied (Migration #35, type safety, normalization)

**Worker Integration:** ❌ Not Yet Integrated
- Main worker: `apps/render-worker/src/worker.ts`
- Current flow: processAIJob() → OCR → Pass 1
- Needed flow: processAIJob() → OCR → **Pass 0.5** → Pass 1

---

## Pre-Test Integration Required

### Step 1: Integrate Pass 0.5 into Worker (REQUIRED)

**File:** `apps/render-worker/src/worker.ts`

**Changes needed:**

1. **Import Pass 0.5:**
```typescript
// Line 11 - Add to imports
import { runPass05, Pass05Input, Pass05Output } from './pass05';
```

2. **Call Pass 0.5 after OCR, before Pass 1:**
```typescript
// In processAIJob(), after OCR artifacts are retrieved/created
// Around line 700-750 (after OCR processing)

// NEW: Run Pass 0.5 (Encounter Discovery)
this.logger.info('Starting Pass 0.5 encounter discovery', {
  shell_file_id: payload.shell_file_id,
  page_count: ocrResult.pages.length,
});

const pass05Input: Pass05Input = {
  shellFileId: payload.shell_file_id,
  patientId: payload.patient_id,
  ocrOutput: ocrSpatialData,  // Google Cloud Vision OCR output
  pageCount: ocrResult.pages.length,
  processingSessionId: /* generate UUID */
};

const pass05Result = await runPass05(pass05Input);

if (!pass05Result.success) {
  throw new Error(`Pass 0.5 failed: ${pass05Result.error}`);
}

this.logger.info('Pass 0.5 completed', {
  shell_file_id: payload.shell_file_id,
  encounters_found: pass05Result.manifest?.encounters.length || 0,
  processing_time_ms: pass05Result.processingTimeMs,
  ai_cost_usd: pass05Result.aiCostUsd,
});

// Continue to Pass 1 (existing code)
```

3. **Update Pass 1 to load manifest:**
```typescript
// In processPass1EntityDetection(), load manifest before processing
const { data: manifest } = await this.supabase
  .from('shell_file_manifests')
  .select('manifest_data')
  .eq('shell_file_id', payload.shell_file_id)
  .single();

// Pass encounter context to Pass 1
// (Pass 1 integration will be done separately)
```

### Step 2: Deploy to Render.com

**Requirements:**
- All environment variables configured (see below)
- Database migration #35 applied
- Worker code built and deployed

**Deployment command:**
```bash
# From project root
cd apps/render-worker
npm run build
# Render.com auto-deploys from main branch
```

---

## Environment Variables Required

**On Render.com service "Exora Health":**

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# AI Models
OPENAI_API_KEY=sk-proj-...           # For GPT-4o Vision (Pass 0.5)
GOOGLE_CLOUD_API_KEY=AIzaSy...       # For OCR

# Worker Config
WORKER_ID=render-exora-worker-v3
WORKER_CONCURRENCY=50
HEALTH_CHECK_PORT=10000
NODE_ENV=production
LOG_LEVEL=info
```

---

## Test Execution Steps

### Phase 1: Pre-Test Validation

**1. Verify Migration #35 Applied:**
```sql
-- Check pass05_encounter_metrics has planned_encounters column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pass05_encounter_metrics'
  AND column_name = 'planned_encounters';

-- Check RPC function exists
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'write_pass05_manifest_atomic';
```

**Expected:** Both queries return results

**2. Verify Worker Deployed:**
```bash
# Check Render.com deployment
curl https://your-worker-url.onrender.com/health

# Check worker logs
# Go to Render.com dashboard → Exora Health → Logs
```

**Expected:** Health check returns 200, logs show "V3 Worker initialized"

---

### Phase 2: Execute Test 01

**1. Upload Sample File:**

**Sample:** Single-page GP visit letter (PDF)
- Provider: Dr. John Smith
- Facility: City Medical Centre
- Date: 2024-05-15
- Type: GP appointment

**Upload via Supabase Storage:**
```bash
# Upload to bucket: medical-docs
# Path: patient-{uuid}/test-sample-gp-letter.pdf
```

**2. Create shell_files Record:**
```sql
INSERT INTO shell_files (
  id,
  patient_id,
  storage_path,
  uploaded_filename,
  file_size_bytes,
  mime_type,
  status
) VALUES (
  'test-01-shell-file-uuid',
  'test-patient-uuid',
  'patient-{uuid}/test-sample-gp-letter.pdf',
  'gp-letter.pdf',
  50000,
  'application/pdf',
  'uploaded'
) RETURNING *;
```

**3. Enqueue Pass 0.5 Job:**
```sql
SELECT enqueue_job_v3(
  p_patient_id := 'test-patient-uuid',
  p_shell_file_id := 'test-01-shell-file-uuid',
  p_job_type := 'ai_processing',
  p_job_lane := 'ai_queue_simple',
  p_job_payload := jsonb_build_object(
    'shell_file_id', 'test-01-shell-file-uuid',
    'patient_id', 'test-patient-uuid',
    'storage_path', 'patient-{uuid}/test-sample-gp-letter.pdf',
    'mime_type', 'application/pdf',
    'file_size_bytes', 50000,
    'uploaded_filename', 'gp-letter.pdf'
  )
);
```

**4. Monitor Job Queue:**
```sql
-- Watch job status
SELECT id, status, retry_count, error_message, heartbeat_at
FROM job_queue
WHERE id = (SELECT id FROM job_queue WHERE job_payload->>'shell_file_id' = 'test-01-shell-file-uuid')
ORDER BY created_at DESC
LIMIT 1;

-- Expected progression:
-- pending → claimed → completed
```

**5. Run Validation Queries:**

See: [test-01-end-to-end-validation.md](./pass05-hypothesis-tests-results/test-01-end-to-end-validation.md) Section: Validation Queries

Run all 6 validation queries:
1. Verify manifest exists
2. Verify encounter pre-created
3. Verify metrics populated
4. Verify completion flag
5. Verify atomic transaction
6. Test idempotency (retry)

**6. Document Results:**

Update [test-01-end-to-end-validation.md](./pass05-hypothesis-tests-results/test-01-end-to-end-validation.md) with:
- Actual manifest JSON
- Actual encounter record
- Actual metrics
- Performance data (time, cost, tokens)
- PASSED or FAILED status

---

### Phase 3: Post-Test Analysis

**1. Cost Analysis:**
```sql
SELECT
  ai_model_used,
  ai_cost_usd,
  processing_time_ms,
  input_tokens,
  output_tokens,
  total_tokens
FROM pass05_encounter_metrics
WHERE shell_file_id = 'test-01-shell-file-uuid';
```

**Compare to targets:**
- Cost: < $0.05 per document
- Time: < 10 seconds
- Quality: confidence ≥ 0.85

**2. Quality Analysis:**
```sql
SELECT
  encounter_type,
  is_real_world_visit,
  encounter_date,
  provider_name,
  facility_name,
  pass_0_5_confidence
FROM healthcare_encounters
WHERE primary_shell_file_id = 'test-01-shell-file-uuid';
```

**Verify:**
- encounter_type = 'gp_appointment'
- Provider/facility extracted correctly
- Date parsed correctly

---

## Rollback Plan

If test fails catastrophically:

**1. Check Logs:**
```bash
# Render.com → Exora Health → Logs
# Look for errors in Pass 0.5 execution
```

**2. Manual Cleanup:**
```sql
-- Delete test data
DELETE FROM shell_file_manifests WHERE shell_file_id = 'test-01-shell-file-uuid';
DELETE FROM healthcare_encounters WHERE primary_shell_file_id = 'test-01-shell-file-uuid';
DELETE FROM pass05_encounter_metrics WHERE shell_file_id = 'test-01-shell-file-uuid';
DELETE FROM shell_files WHERE id = 'test-01-shell-file-uuid';
```

**3. Fix Issues:**
- Review worker logs
- Fix code issues
- Redeploy
- Retry test

---

## Success Criteria

**Test 01 passes if:**
- ✅ All 6 validation queries return expected results
- ✅ Manifest JSON structure correct
- ✅ Encounter pre-created with UUID
- ✅ Metrics populated (real/planned/pseudo counts)
- ✅ Atomic transaction verified
- ✅ Idempotency works (retry returns same manifest)
- ✅ Cost < $0.05, Time < 10s, Confidence ≥ 0.85

---

## Next Steps After Test 01

**If PASSED:**
1. Execute Test 02 (multi-encounter document)
2. Execute Test 03 (edge cases)
3. Execute Test 04 (cost/performance at scale)
4. Conduct database audits
5. Integrate manifest loading into Pass 1

**If FAILED:**
1. Analyze failure mode
2. Fix issues in worker code
3. Redeploy
4. Retry Test 01

---

**Last Updated:** October 30, 2025
**Status:** Awaiting worker integration
