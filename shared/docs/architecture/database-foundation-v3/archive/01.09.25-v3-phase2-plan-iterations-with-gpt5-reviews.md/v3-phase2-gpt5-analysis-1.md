gpt5 report 31/08/2025

### Week 3: Core Edge Functions Analysis & Schema Discovery

Status: Analysis only. No schema or code edits performed.

---

### Scope and inputs reviewed

- Edge functions:
  - `supabase/functions/document-processor/index.ts`
  - `supabase/functions/document-processor-simple/index.ts`
  - `supabase/functions/document-processor-complex/index.ts`
- V3 implementation SQL (source of truth):
  - `shared/docs/architecture/database-foundation-v3/implementation/database/01_foundations.sql`
  - `shared/docs/architecture/database-foundation-v3/implementation/database/02_profiles.sql`
  - `shared/docs/architecture/database-foundation-v3/implementation/database/03_clinical_core.sql`
  - `shared/docs/architecture/database-foundation-v3/implementation/database/04_ai_processing.sql`
  - `shared/docs/architecture/database-foundation-v3/implementation/database/05_healthcare_journey.sql`
  - `shared/docs/architecture/database-foundation-v3/implementation/database/06_security.sql`
  - `shared/docs/architecture/database-foundation-v3/implementation/database/07_optimization.sql`
- AI schema and mapping docs:
  - `shared/docs/architecture/ai-processing-v3/ai-to-database-schema-architecture/schemas/schema_loader.ts`
  - `shared/docs/architecture/ai-processing-v3/ai-to-database-schema-architecture/schemas/entity_classifier.ts`
  - `shared/docs/architecture/ai-processing-v3/ai-to-database-schema-architecture/schemas/detailed/*`
- Reference blueprint: `shared/docs/architecture/database-foundation-v3/V3_FRESH_START_BLUEPRINT.md` (Week 3 section)

---

### Summary of findings

- Edge functions currently read and update `documents` with `patient_id` referencing `auth.users(id)`; V3 already defines `shell_files` with `patient_id REFERENCES user_profiles(id)` in `03_clinical_core.sql`. Edge functions need to be updated to target `shell_files`.
- Fields used by processors exist or have equivalents on `shell_files` (status, timestamps, processing_error, extracted_text, metadata like document_type/provider/facility/service_date, confidence and processing fields, storage_path).
- AI Pass 1/2 outputs map to V3 tables: `patient_clinical_events`, `patient_observations`, `patient_interventions`. Audit is captured in `entity_processing_audit_v2` (defined in `04_ai_processing.sql`) and already links to `shell_files(id)` via `shell_file_id`.
- RLS/audit semantics in V3 use profile-aware policies (`has_profile_access(...)`) and `log_audit_event(..., p_patient_id)` with `user_profiles(id)`. The prior `get_allowed_patient_ids` workaround is eliminated.
- Job queue in V3 is defined in `07_optimization.sql` (`job_queue` table). There is no V3 `enqueue_job` RPC by default; edge functions should insert directly into `job_queue` or we can add a thin RPC wrapper in Week 4. Include `patient_id`/`profile_id` and `shell_file_id` in `job_payload` for traceability.

---

### Detailed analysis

#### Document processor behavior and V3 mapping

- Observed operations (all three variants):
  - Look up a record by `storage_path`, set `status='processing'`, store `processing_started_at`.
  - Download file from Storage, validate, run AI/OCR pipeline (complex version), set `status` to `completed/failed/flagged_*` and update processing metadata.
  - Enqueue background jobs via `rpc('enqueue_job', ...)` (simple version).
  - Persist extraction artifacts to the record: `extracted_text`, `medical_data` (JSON), confidence/processing fields, provider/facility/service_date.

- V3 target table: `shell_files` (renamed from `documents`) in `03_clinical_core.sql`, with corrected `patient_id REFERENCES user_profiles(id)`.

- Direct field mappings to preserve (rename `documents` → `shell_files` only):
  - Identity: `id`, `patient_id` (now profile), `storage_path`.
  - Processing: `status`, `processing_started_at`, `processing_completed_at`, `processing_error` (prefer JSONB), `processing_method`.
  - Extraction: `extracted_text`, `medical_data` (JSONB), `vision_confidence`, `confidence_score`.
  - Metadata: `document_type`, `document_subtype`, `provider_name`, `facility_name`, `service_date`, `page_count`, `language_detected`.

- Existing V3 indexes (confirm in `03_clinical_core.sql`):
  - `idx_shell_files_patient`, `idx_shell_files_status`, `idx_shell_files_type`, `idx_shell_files_processing`.
  - Optional: consider adding service_date/created_at indexes if query patterns require them.

#### ID semantics and audit

- Current edge code reads `documents.patient_id` aligned to `auth.users(id)`. V3 uses `user_profiles(id)` across clinical tables and `shell_files`.
- Use `log_audit_event(..., p_patient_id := <profile_id>)` (updated in `02_profiles.sql`) and rely on `has_profile_access(...)` for RLS; the `get_allowed_patient_ids` workaround is no longer part of V3.

#### AI Pass 1/2 mapping

- Pass 1: `EntityClassifier` returns categories and `document_intelligence`.
  - clinical_event → create `patient_clinical_events` rows (required fields: `activity_type`, `clinical_purposes`, `event_name`, `event_date`, `confidence_score`; optional `method`, `body_site`, medical codes, `performed_by`).
  - Subtype-based enrichment:
    - observation-like → `patient_observations` (numeric/text values, units, LOINC, interpretation, reference ranges, dates).
    - intervention-like → `patient_interventions` (dosage/frequency/route/duration/indication, outcomes, CPT/NDC; dates).
- Pass 2: `schema_loader.ts` maps categories to specific target tables and injects safety/coding prompts; validation thresholds are aligned (`confidence_threshold: 0.7`, `requires_review_below: 0.8`).
- Timeline: after creating events, generate timeline entries (`healthcare_timeline_events`) and set linking FKs (`discovery_event_id`, `encounter_id`) as already scaffolded in migrations.

#### Audit trail integration

- Use `entity_processing_audit_v2` from `04_ai_processing.sql`: it already includes `shell_file_id`, links to `patient_clinical_events`, and stores Pass 1/2 results and safety checks. No schema change required.
- RLS is session/profile-aware via joins to `ai_processing_sessions` (which stores `patient_id`).

#### Job queue integration

- V3 `job_queue` (in `07_optimization.sql`) replaces prior RPC-based queue. Insert directly into `job_queue` with fields:
  - `job_type`, `job_category`, `job_name`, `job_payload` (include `shell_file_id`, `patient_id/profile_id`, `file_path`, `filename`, `source_system`, `processing_method`), and priority/status fields as needed.
  - Optionally add a small RPC wrapper in Week 4 for consistency and RLS handling.

---

### Concrete deltas and gap list

#### Tables and foreign keys

- `shell_files` already exists in V3 with `patient_id REFERENCES user_profiles(id)`. Verify it contains all fields needed by processors; consider `processing_error` JSONB if we want structured error logging (currently TEXT in V3).

- `entity_processing_audit_v2` already references `shell_files` via `shell_file_id`.

#### Indexes (adapted)

- Existing: `idx_shell_files_patient`, `idx_shell_files_status`, `idx_shell_files_type`, `idx_shell_files_processing`.
- Optional additions (if query patterns show need): service_date/created_at indexes.

#### Constraints and types

- Ensure confidence fields support expected scales:
  - `vision_confidence` as percentage (0–100) or normalize to 0–1 consistently; current edge code stores both scales; keep `confidence_score` as 0–1 and retain `vision_confidence` as 0–100 if both are needed.
- `processing_error` should be JSONB to store structured stage/error details used by complex processor.

#### RLS and security

- Replace `patient_id = auth.uid()` style policies with profile-aware policies based on `user_profiles` and `has_profile_access(...)`.
- Ensure JWT contains `profile_id` claim for edge functions and RLS helpers like `get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid)` are used.

#### RPCs and audit functions

- Use `log_audit_event` (updated in `02_profiles.sql`) with `p_patient_id` to ensure correct audit linkage. `log_profile_audit_event` is not required in V3.
- For queuing, prefer direct insert into `job_queue`; if we add an RPC wrapper in Week 4, standardize payload and access control there.

---

### Edge function update checklist (for Week 4 execution)

- Update table references:
  - `.from('documents')` → `.from('shell_files')`
  - Select/update same column set; change `processing_error` to JSONB if not already.

- Fix ID semantics:
  - All uses of `patient_id` must refer to `user_profiles(id)`.
  - When logging/auditing, use `log_profile_audit_event` or resolve via `get_allowed_patient_ids` with JWT `profile_id`.

- Payloads and job queue:
  - Replace `rpc('enqueue_job', ...)` with a direct insert into `job_queue` (V3), setting `job_type='document_processing'`, a clear `job_name`, and `job_payload` including `{ shell_file_id, patient_id/profile_id, file_path, filename, source_system, processing_method }`.

- Post-processing routing:
  - Map Pass 1 entities to `patient_clinical_events` and enrich to `patient_observations` / `patient_interventions` per schemas.
  - Create timeline entries and set `discovery_event_id` where applicable.

---

### Schema refinement checklist (to apply in V3 SQL files)

- `03_clinical_core.sql`:
  - Verify `shell_files` fields match processor needs; consider `processing_error` JSONB if we want structured error logs.
  - Keep existing indexes; add service_date/created_at indexes only if needed by access patterns.

- `04_ai_processing.sql`:
  - `entity_processing_audit_v2` already uses `shell_file_id` and links to clinical tables; no schema changes required.
  - Ensure confidence/validation logic aligns with AI schema thresholds (documentation alignment only).

- `06_security.sql`:
  - RLS policies already use `has_semantic_data_access`/`has_profile_access`; no changes required.

---

### Notes

- This document reflects analysis for Week 3 only. No migrations or edge function files were edited in this step.


