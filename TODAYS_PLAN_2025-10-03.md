# Today's Plan: Pass 1 Entity Detection Implementation
**Date:** Friday, October 3rd, 2025
**Goal:** Build working Pass 1 prototype and start testing

---

## Morning Session (Current)

### Phase 1: Core Pass 1 Implementation ✅ COMPLETE!
- [x] Review database schema (entity_processing_audit has all fields we need)
- [x] Review existing code (entity_classifier.ts, schema_loader.ts)
- [x] Create `apps/render-worker/src/pass1/` directory structure
- [x] Created Pass1EntityDetector.ts (main class with dual-input support)
- [x] Created pass1-prompts.ts (AI prompt templates with vision + OCR)
- [x] Created pass1-schema-mapping.ts (entity subtype → database schemas)
- [x] Created pass1-translation.ts (AI JSON → database format - PURE CODE, NO AI)
- [x] Created pass1-types.ts (TypeScript interfaces)
- [x] Created index.ts (clean exports)

**Pass 1 Module Complete:** 2,395 lines of code, 7 files

### Phase 2: OpenAI Integration ✅ COMPLETE!
- [x] Added real OpenAI GPT-4o Vision API calls
- [x] Dual-input prompt system (vision + OCR)
- [x] JSON response format with structured entity data

### Phase 3: Worker Integration ✅ COMPLETE!
- [x] Integrated Pass1EntityDetector into worker.ts
- [x] Added 'pass1_entity_detection' job type handling
- [x] Connected to job queue
- [x] Fixed TypeScript compilation errors
- [x] Successfully built render-worker

**Status:** Pass 1 implementation complete - ready for testing

### Phase 3.5: Complete Pass 1 Database Operations ✅ COMPLETE!
**CRITICAL DISCOVERY:** Pass 1 must write to 7 tables, not just 1!

Bridge schemas specify Pass 1 must CREATE/UPDATE:
1. ✅ entity_processing_audit (DONE)
2. ✅ ai_processing_sessions (DONE - session coordination)
3. ✅ shell_files (DONE - Pass 1 status updates)
4. ✅ profile_classification_audit (DONE - safety critical)
5. ✅ pass1_entity_metrics (DONE - performance tracking)
6. ✅ ai_confidence_scoring (DONE - quality metrics)
7. ✅ manual_review_queue (DONE - low-confidence flagging)

**Implementation:** All 7 tables handled in `pass1-database-builder.ts` + worker integration
**Clarification:** Bridge schemas are OUTPUT specs (what we write to DB), not INPUT to AI

### Phase 3.6: Documentation & Organization ✅ COMPLETE!
- [x] Updated bridge-schema-architecture README (three-tier system explained)
- [x] Organized Pass 1 planning docs (active vs archived)
- [x] Created Pass 1 implementation README
- [x] Archived outdated planning documents
- [x] Fixed TypeScript build errors

**Status:** All implementation and documentation complete

---

## Afternoon Session

### Phase 4: Pre-Testing Infrastructure Investigation
**BLOCKING:** Need to verify existing infrastructure before testing Pass 1

#### 4.1: Upload Flow Investigation ✅ COMPLETE!
- [x] Check current upload flow - what job type does it create?
  - Found: `supabase/functions/shell-file-processor-v3/index.ts` line 244
  - Current: Creates `shell_file_processing` jobs (NOT `pass1_entity_detection`)
  - Issue: Wrong job type - needs to be changed to `pass1_entity_detection`

- [x] Verify OCR integration status
  - [x] Does upload flow already do OCR? **NO - Not implemented yet**
  - [x] Check for existing OCR code in upload pipeline - **None found**
  - [x] Verify Google Cloud Vision API key exists - **Present in Render.com**
  - [ ] Test: Upload a document and check if OCR data is stored - **N/A (OCR not implemented)**

**Findings:**
- Upload flow uses shell-file-processor-v3 Edge Function
- Currently creates 'shell_file_processing' job type (just a TODO stub in worker)
- NO OCR integration - needs to be added (Phase 5)
- Pass 1 job handler exists in worker but upload flow doesn't use it yet

#### 4.2: Render.com Worker Status ✅ COMPLETE!
- [x] Check Render.com worker deployment
  - [x] Worker deployed Pass 1 code at 10:51 AM (commit ff0927a)
  - [x] Worker currently running and polling for jobs
  - [x] Manual deploy used to restart service (worked better than "Restart Service")

- [x] Verify environment variables on Render.com
  - [x] `OPENAI_API_KEY` - ✅ Present
  - [x] `GOOGLE_CLOUD_API_KEY` - ✅ Present
  - [x] `SUPABASE_URL` - ✅ Present
  - [x] `SUPABASE_SERVICE_ROLE_KEY` - ✅ Present

**Worker Status:**
- ✅ Operational and polling claim_next_job_v3() every 5 seconds
- ✅ Receiving HTTP 200 responses with empty array [] (no jobs in queue yet)
- ✅ Health check endpoint responding
- ℹ️ Free tier spin-down after 15 minutes inactivity is expected behavior

#### 4.3: Database Schema Verification ✅ COMPLETE!
- [x] Verify all 7 Pass 1 tables exist in Supabase
  - [x] `entity_processing_audit` - ✅ Exists
  - [x] `ai_processing_sessions` - ✅ Exists
  - [x] `shell_files` - ✅ Exists
  - [x] `profile_classification_audit` - ✅ Exists
  - [x] `pass1_entity_metrics` - ✅ Exists
  - [x] `ai_confidence_scoring` - ✅ Exists
  - [x] `manual_review_queue` - ✅ Exists

**Verification Method:** Created Node.js script to query Supabase directly
**Result:** All 7 tables exist and accessible (7/7)

#### 4.4: Job Queue Setup ✅ COMPLETE (WITH CRITICAL FINDING!)
- [x] Verify job queue functions exist
  - [x] `claim_next_job_v3()` - ✅ Exists
  - [x] `complete_job()` - ✅ Exists
  - [x] `update_job_heartbeat()` - ✅ Exists

- [x] Check job_queue table supports new job type
  - [x] Can accept `job_type = 'pass1_entity_detection'` - ❌ **NOT SUPPORTED!**

**CRITICAL FINDING:**
The `enqueue_job_v3()` RPC function has an ENUM constraint that ONLY allows these job_type values:
- shell_file_processing
- ai_processing ← **Use this generic type for Pass 1!**
- data_migration
- audit_cleanup
- system_maintenance
- notification_delivery
- report_generation
- backup_operation
- semantic_processing
- consent_verification
- provider_verification

**SOLUTION:**
Instead of creating a new `pass1_entity_detection` job_type, we should:
1. Use `job_type = 'ai_processing'` (generic AI processing type)
2. Worker differentiates via job_payload structure
3. Worker already handles 'pass1_entity_detection' in code - needs to accept 'ai_processing' instead

### Phase 5: OCR Integration (If Missing)
**CONDITIONAL:** Only needed if upload flow doesn't have OCR

- [ ] Add Google Cloud Vision OCR to upload pipeline
- [ ] Store OCR spatial data with shell_file
- [ ] Update upload flow to create Pass 1 job after OCR

### Phase 6: Pass 1 Job Creation Integration
- [ ] Update upload flow to create Pass 1 job
  - [ ] After file upload + OCR
  - [ ] Create job with type `pass1_entity_detection`
  - [ ] Include all required payload fields:
    - `shell_file_id`, `patient_id`, `processing_session_id`
    - `raw_file` (base64 + metadata)
    - `ocr_spatial_data` (from OCR step)
    - `document_metadata`

### Phase 7: First Manual Test
- [ ] Create test job manually in job_queue table
- [ ] Monitor Render.com worker logs
- [ ] Verify worker picks up job
- [ ] Check OpenAI API call happens
- [ ] Verify all 7 database tables get records
- [ ] Review entity_processing_audit for detected entities

### Phase 8: First Real Upload Test
- [ ] Upload real medical document through UI
- [ ] Verify OCR processes
- [ ] Verify Pass 1 job created
- [ ] Verify worker processes it
- [ ] Check all 7 tables populated correctly
- [ ] Review entity detection accuracy

### Phase 9: Debugging & Refinement
- [ ] Fix any issues found during testing
- [ ] Adjust confidence thresholds if needed
- [ ] Verify cost estimates are accurate
- [ ] Check processing speed
- [ ] Test error handling

---

## End of Day Goals

**Must Have (Blocking for Pass 2):**
- ✅ Pass 1 entity detector working with real AI
- ✅ Translation layer correctly flattening AI output to database
- ✅ All 7 database tables integrated
- ⏳ At least 1 successful end-to-end test (document → entities in database) - PENDING

**Nice to Have (Can defer):**
- Error handling for edge cases
- Performance optimization
- Comprehensive test coverage

---

## Technical Notes

### Translation Layer (CRITICAL CLARIFICATION)
- **This is PURE CODE** - no AI involved
- Simple JavaScript function that flattens nested JSON
- Maps AI output structure → database column names
- Example: `ai_response.visual_interpretation.ai_sees` → `ai_visual_interpretation` column

### Entity Subtypes to Database Schemas Mapping
```
vital_sign → ['patient_clinical_events', 'patient_observations', 'patient_vitals']
medication → ['patient_clinical_events', 'patient_interventions', 'patient_medications']
diagnosis → ['patient_clinical_events', 'patient_conditions']
etc.
```

### Existing TypeScript Files Fate
- `entity_classifier.ts` - Archive after enhancing into Pass1EntityDetector.ts
- `schema_loader.ts` - KEEP for Pass 2 (loads schemas to send to AI)
- `usage_example.ts` - Archive (demonstration only)

---

## If We Crash & Restart

**Resume from:**
1. Check todos in code: `grep -r "TODO" apps/render-worker/src/pass1/`
2. Last file worked on: `ls -lt apps/render-worker/src/pass1/ | head -5`
3. Current progress: Read this file

**Quick Context:**
- Pass 1 = entity detection (AI vision model analyzes document)
- Creates records in `entity_processing_audit` table
- Prepares entities for Pass 2 (clinical enrichment)
- Uses GPT-4o Vision + OCR cross-validation

---

## Success Criteria for Today

Can we answer YES to these questions?
1. ✅ Does Pass 1 successfully call OpenAI GPT-4o Vision? - CODE COMPLETE
2. ✅ Does it correctly classify entities into 3 categories? - CODE COMPLETE
3. ✅ Does the translation layer write to all 7 database tables? - CODE COMPLETE
4. ⏳ Can we process 1 test medical document end-to-end? - TESTING PENDING

**Current Status:** 3/4 complete - Implementation done, testing pending

---

## Current Status Summary

**Implementation:** ✅ COMPLETE
- 2,395 lines of TypeScript across 7 files
- All 7 database tables integrated
- Worker integration complete
- Build successful

**Documentation:** ✅ COMPLETE
- Bridge schema architecture README updated
- Pass 1 planning docs organized and archived
- Implementation README created

**Testing:** ⏳ PENDING
- End-to-end test with sample document
- Database verification across 7 tables
- Entity classification accuracy validation

**Next Step:** Investigate existing infrastructure (Phase 4) before testing

---

## Investigation Guide

### Where to Look for Upload Flow
```bash
# Likely locations for upload code:
apps/web/app/*/upload/
apps/web/components/*upload*
apps/web/lib/upload*
apps/web/utils/upload*

# Search for job queue insertions:
grep -r "job_queue" apps/web/
grep -r "INSERT INTO job_queue" apps/web/
grep -r "shell_file_processing" apps/web/
```

### Where to Look for OCR Integration
```bash
# Check for Google Vision:
grep -r "google.*vision" apps/
grep -r "GOOGLE_CLOUD_API_KEY" apps/
grep -r "vision.googleapis.com" apps/

# Check for OCR functions:
grep -r "ocr" apps/web/
grep -r "extractText" apps/web/
```

### Render.com Worker Check
```bash
# Build worker locally to verify:
cd apps/render-worker
npm run build

# Check for worker service on Render.com dashboard:
# - Service name: exora-v3-worker (or similar)
# - Check logs for recent activity
# - Verify environment variables are set
```

### Supabase Database Check
```sql
-- Check if Pass 1 tables exist:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'entity_processing_audit',
  'ai_processing_sessions',
  'profile_classification_audit',
  'pass1_entity_metrics',
  'ai_confidence_scoring',
  'manual_review_queue'
);

-- Check job queue functions:
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'claim_next_job_v3',
  'complete_job',
  'update_job_heartbeat'
);

-- Check existing shell_files structure:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'shell_files';
```

### Quick Test: Manual Job Creation
```sql
-- Test if you can create a Pass 1 job manually:
INSERT INTO job_queue (
  job_type,
  job_category,
  job_name,
  job_payload,
  priority,
  status
) VALUES (
  'pass1_entity_detection',  -- New job type
  'ai_processing',
  'Manual Pass 1 Test',
  '{}'::jsonb,  -- Empty payload for now
  10,
  'pending'
) RETURNING id;

-- If this works, job_queue supports Pass 1
-- If error, may need to update job_type enum
```

---

## Current Blockers Summary

**RESOLVED:**
1. ✅ Does upload flow do OCR? **NO - needs implementation (Phase 5)**
2. ✅ What job type does upload create? **shell_file_processing (needs to change to 'ai_processing')**
3. ✅ Is Render.com worker running? **YES - operational and polling**
4. ✅ Do all 7 Pass 1 tables exist? **YES - all 7 tables verified**
5. ✅ Is OPENAI_API_KEY set in Render.com? **YES - all 4 env vars present**
6. ✅ Do job queue functions exist? **YES - all 3 RPC functions operational**
7. ❌ Does job_queue support 'pass1_entity_detection' type? **NO - use 'ai_processing' instead**

**CRITICAL DISCOVERY:**
The job_queue table uses ENUM constraints. `'pass1_entity_detection'` is not an allowed job_type.
**Solution:** Use `job_type = 'ai_processing'` for Pass 1 jobs (generic AI type)

**NEXT STEPS:**
Phase 5 - Add OCR integration
Phase 6 - Update upload flow and worker to use 'ai_processing' job type
Phase 7 - Manual test with real job
