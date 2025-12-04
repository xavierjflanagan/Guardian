# Pass 0.5 Encounter Discovery - Architectural Overview

**Status:** ✅ OPERATIONAL (October 2025)
**Location:** `apps/render-worker/src/pass05/` (5 files TypeScript)
**Last Updated:** October 30, 2025

---

## What is Pass 0.5?

Pass 0.5 is the **encounter discovery and manifest creation** stage that runs before entity detection in Exora's five-pass AI processing pipeline. It identifies healthcare encounters within uploaded documents and pre-creates database records for use by downstream passes.

**The Five-Pass Pipeline:**
1. **Pass 0.5 (Encounter Discovery)** - Discover encounters, create manifest (operational)
2. **Pass 1 (Entity Detection)** - Detect/classify entities with encounter context (operational)
3. **Pass 1.5 (Medical Code Resolution)** - Vector embedding code candidates (in design)
4. **Pass 2 (Clinical Extraction)** - Extract structured clinical data (schema complete)
5. **Pass 3 (Narrative Generation)** - Generate patient summaries (planned)

**Pass 0.5 Responsibility:** Discover ALL healthcare encounters in a document, pre-create `healthcare_encounters` records in database, store manifest for Pass 1/2 consumption.

---

## Key Concepts

### Encounter Types (3 Categories)

**Real-World Visits (Past):**
- inpatient, outpatient, emergency_department, specialist_consultation, gp_appointment, telehealth

**Planned Encounters (Future):**
- planned_specialist_consultation, planned_procedure, planned_gp_appointment

**Pseudo-Encounters (Documents):**
- pseudo_medication_list, pseudo_insurance, pseudo_admin_summary, pseudo_lab_report, pseudo_imaging_report, pseudo_referral_letter, pseudo_unverified_visit

### Shell File Manifest

**JSONB structure stored in `shell_file_manifests` table:**
```json
{
  "shellFileId": "uuid",
  "patientId": "uuid",
  "totalPages": 12,
  "ocrAverageConfidence": 0.95,
  "encounters": [
    {
      "encounterId": "uuid",  // Pre-created in healthcare_encounters table
      "encounterType": "gp_appointment",
      "isRealWorldVisit": true,
      "dateRange": { "start": "2024-05-15" },
      "provider": "Dr. Smith",
      "facility": "City Medical Centre",
      "pageRanges": [[1, 3], [5, 5]],  // Normalized and sorted
      "spatialBounds": [...],
      "confidence": 0.92
    }
  ]
}
```

---

## Processing Flow

### 1. Input Preparation
- **OCR output:** Google Cloud Vision (text + spatial data)
- **Metadata:** shell_file_id, patient_id, processing_session_id

### 2. AI Encounter Discovery
- **Model:** OpenAI GPT-4o Vision
- **Prompt:** Timeline Test methodology (identifies encounters by dates/providers)
- **Output:** JSON with encounters, confidence scores, page ranges

### 3. Manifest Building
- **Validation:** Non-overlapping page ranges (Phase 1 requirement)
- **Type safety:** encounterType validated against EncounterType union
- **Normalization:** pageRanges sorted, inverted ranges fixed
- **Spatial enrichment:** Extract bounding boxes from OCR for each encounter

### 4. Database Writes (Atomic Transaction)
**RPC function:** `write_pass05_manifest_atomic()`

Writes to 3 tables atomically:
1. **healthcare_encounters** - UPSERT pre-creates encounter records with UUIDs
2. **shell_file_manifests** - INSERT manifest JSONB
3. **pass05_encounter_metrics** - UPSERT metrics (encounters detected, tokens, cost)
4. **shell_files** - UPDATE pass_0_5_completed flag

**Idempotency:** Safe retries via unique constraints and atomic RPC

---

## Key Implementation Files

**Worker Code:**
- `index.ts` - Main entry point, idempotency check, manifest loading
- `encounterDiscovery.ts` - AI call to GPT-4o Vision
- `aiPrompts.ts` - Timeline Test prompt (sent to AI)
- `manifestBuilder.ts` - Parse AI response, enrich with OCR spatial data, validate
- `databaseWriter.ts` - Atomic RPC call for manifest/metrics/completion writes
- `types.ts` - TypeScript interfaces

**Total:** ~600 lines TypeScript

---

## Production Metrics (Target)

- **Cost:** ~$0.01-0.03 per document (GPT-4o Vision pricing)
- **Processing time:** 2-4 seconds for AI call, 1-2 seconds for database writes
- **Phase 1 limitation:** Files ≥18 pages fail gracefully (batching not implemented)
- **Quality:** 90-95% confidence on encounter detection

---

## Integration Points

### Downstream (Pass 1 & Pass 2)
**What Pass 0.5 Provides:**
- Pre-created healthcare_encounters records with UUIDs
- Encounter metadata (type, dates, provider, facility)
- Page ranges and spatial bounds
- **Eliminates need for Pass 1/2 to extract encounters**

**How to consume:**
```typescript
// Pass 1 or Pass 2 worker
const { data: manifest } = await supabase
  .from('shell_file_manifests')
  .select('manifest_data')
  .eq('shell_file_id', shellFileId)
  .single();

const encounters = manifest.manifest_data.encounters;
const encounterId = encounters[0].encounterId; // Use in patient_clinical_events
```

---

## Critical Fixes Applied (October 30, 2025)

**Migration #35:** Atomic transaction wrapper
- Fixed: Partial database writes (manifest exists, metrics missing)
- Solution: `write_pass05_manifest_atomic()` RPC function
- Security: SECURITY DEFINER + search_path protection + service_role only

**Worker improvements:**
- PageRanges normalization (sort + fix inverted ranges)
- encounterType validation (runtime type guard)
- Separate planned vs pseudo encounter counts
- JSDoc comments for API contract

---

## Database Schema

**Tables:**
- `healthcare_encounters` (pre-created records)
- `shell_file_manifests` (JSONB manifest storage)
- `pass05_encounter_metrics` (analytics)
- `shell_files` (completion flag)

**Source of truth:** `current_schema/08_job_coordination.sql`

**Migration history:** `migration_history/2025-10-30_35_pass05_atomic_writes.sql`

---

## Related Documentation

**Implementation:**
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Complete implementation plan
- [Worker Fixes Archive](./archive/) - Historical fixes and reviews

**Testing:**
- [pass05-hypothesis-tests-results/](./pass05-hypothesis-tests-results/) - Test results and validation

**Audits:**
- [pass05-audits/](./pass05-audits/) - Database audits (post-implementation)

**V3 Architecture:**
- [V3 Architecture Master Guide](../../../V3_ARCHITECTURE_MASTER_GUIDE.md)

---

**Last Updated:** October 30, 2025
**Status:** Operational, integrated with V3 job queue
