# entity_processing_audit Bridge Schema (Source) - Pass 2 UPDATE Version

**Triage Status:** DONE
**Step A Decision:** REMOVE (OBSOLETE under Strategy-A)
**Step A Rationale:** This table was designed for the OLD "Pass 1 detects entities, Pass 2 enriches them" model. Under Strategy-A, Pass 2 discovers AND extracts entities directly to hub-and-spoke tables. There is no entity handoff from Pass 1 to Pass 2 - entity_processing_audit is an obsolete intermediate table.
**Step B Sync:** N/A - Obsolete table
**Step C Columns:** N/A - Obsolete table
**Step D Temporal:** N/A - Obsolete table
**Last Triage Update:** 2025-12-04
**Original Created:** 1 October 2025

---

## Strategy-A Architecture Change

**OLD Model (this schema was designed for):**
```
Pass 1 → Detect entities → Write to entity_processing_audit
Pass 2 → Read from entity_processing_audit → Enrich → Write to clinical tables
```

**NEW Model (Strategy-A):**
```
Pass 1 → Identify which bridge schemas are needed (schema routing ONLY)
Pass 2 → Discover AND extract entities → Write directly to hub-and-spoke tables
```

**Key Change:** Pass 2 does NOT read from or write to entity_processing_audit. It writes directly to:
- `patient_clinical_events` (hub)
- `patient_conditions`, `patient_medications`, `patient_allergies`, etc. (spokes)

**See:** `PASS2-STRATEGY-A-MASTER.md` section "Obsolete Tables (Strategy-A Changes)"

---

## Historical Documentation (Pre-Strategy-A)

The following documentation is preserved for historical reference only. This architecture is no longer used.

---

**Database Source:** /current_schema/04_ai_processing.sql (lines 153-263)
**Priority:** N/A - Obsolete under Strategy-A

## Multi-Pass Context (OBSOLETE)

- **This is the Pass 2 UPDATE version of entity_processing_audit**
- Pass 1 CREATED audit record with entity detection results
- Pass 2 UPDATES same record with clinical enrichment results and final table links
- Most detailed audit table - tracks complete journey from detection to clinical storage
- Cross-pass join key: processing_session_id (and entity_id for specific entity updates)

## Database Table Structure (Pass 2 UPDATE Fields)

```sql
-- Pass 2 UPDATE operation modifies these fields:
UPDATE entity_processing_audit SET
    pass2_status = 'completed',  -- Update to 'in_progress' → 'completed' or 'failed'
    pass2_confidence = 0.920,  -- Clinical enrichment confidence
    pass2_started_at = NOW(),  -- When Pass 2 started (set once)
    pass2_completed_at = NOW(),  -- When Pass 2 finished
    enrichment_errors = error_msg,  -- If Pass 2 fails
    pass2_model_used = 'gpt-4o-mini',  -- AI model for enrichment
    pass2_token_usage = 2400,  -- Pass 2 token consumption
    pass2_cost_estimate = 0.0062,  -- Pass 2 processing cost

    -- Link to final clinical data (ONE of these depending on entity_subtype)
    final_event_id = uuid,
    final_encounter_id = uuid,
    final_observation_id = uuid,
    final_intervention_id = uuid,
    final_condition_id = uuid,
    final_allergy_id = uuid,
    final_vital_id = uuid,

    updated_at = NOW()
WHERE id = entity_audit_id
  AND pass2_status = 'pending';  -- Safety check: only update pending entities
```

## AI Extraction Requirements for Pass 2 UPDATE

Pass 2 UPDATES existing audit record to reflect clinical enrichment results.

### Fields Updated by Pass 2

```typescript
interface EntityProcessingAuditPass2UpdateExtraction {
  // PASS 2 UPDATES THESE FIELDS
  pass2_status: 'in_progress' | 'completed' | 'failed';  // Update status
  pass2_confidence?: number;  // 0.000-1.000 clinical enrichment confidence
  pass2_started_at?: string;  // ISO 8601 timestamp when Pass 2 started
  pass2_completed_at?: string;  // ISO 8601 timestamp when Pass 2 finished
  enrichment_errors?: string;  // Error message if Pass 2 fails
  pass2_model_used?: string;  // AI model for enrichment
  pass2_token_usage?: number;  // Token consumption
  pass2_cost_estimate?: number;  // Processing cost

  // FINAL CLINICAL DATA LINKS (populate ONE based on entity_subtype)
  final_event_id?: string;  // UUID link to patient_clinical_events
  final_encounter_id?: string;  // UUID link to healthcare_encounters
  final_observation_id?: string;  // UUID link to patient_observations
  final_intervention_id?: string;  // UUID link to patient_interventions
  final_condition_id?: string;  // UUID link to patient_conditions
  final_allergy_id?: string;  // UUID link to patient_allergies
  final_vital_id?: string;  // UUID link to patient_vitals
}
```

### Fields NOT Modified by Pass 2 (Pass 1 Ownership)

```typescript
interface EntityProcessingAuditPass1Fields {
  // PASS 2 DOES NOT MODIFY THESE (Pass 1 ownership)
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;
  entity_id: string;
  original_text: string;
  entity_category: string;
  entity_subtype: string;
  unique_marker?: string;
  location_context?: string;
  spatial_bbox?: object;
  page_number?: number;
  pass1_confidence: number;
  requires_schemas: string[];
  processing_priority: string;
  pass1_model_used: string;
  pass1_vision_processing: boolean;
  pass1_token_usage?: number;
  pass1_image_tokens?: number;
  pass1_cost_estimate?: number;
  ai_visual_interpretation?: string;
  visual_formatting_context?: string;
  ai_visual_confidence?: number;
  ocr_reference_text?: string;
  ocr_confidence?: number;
  ocr_provider?: string;
  ai_ocr_agreement_score?: number;
  spatial_mapping_source?: string;
  discrepancy_type?: string;
  discrepancy_notes?: string;
  visual_quality_assessment?: string;
  validation_flags?: string[];
  cross_validation_score?: number;
  manual_review_required?: boolean;
  profile_verification_confidence?: number;
  pii_sensitivity_level?: string;
  compliance_flags?: string[];
}
```

## Example Extractions (Pass 2 UPDATE)

### Example 1: Successful Clinical Enrichment (Blood Pressure → Vitals)
```json
{
  "pass2_status": "completed",
  "pass2_confidence": 0.920,
  "pass2_started_at": "2025-01-01T12:35:10Z",
  "pass2_completed_at": "2025-01-01T12:35:18Z",
  "pass2_model_used": "gpt-4o-mini",
  "pass2_token_usage": 2400,
  "pass2_cost_estimate": 0.0062,
  "final_observation_id": "uuid-of-observation-record",
  "final_vital_id": "uuid-of-vital-record"
}
```
**Note:** Blood pressure entity linked to BOTH patient_observations (clinical event) AND patient_vitals (structured vital data).

### Example 2: Failed Enrichment (Incomplete Data)
```json
{
  "pass2_status": "failed",
  "pass2_started_at": "2025-01-15T09:32:10Z",
  "pass2_completed_at": "2025-01-15T09:32:15Z",
  "enrichment_errors": "Insufficient context for clinical classification - missing date information",
  "pass2_model_used": "gpt-4o-mini",
  "pass2_token_usage": 1200,
  "pass2_cost_estimate": 0.0031
}
```

### Example 3: Medication Enrichment → Intervention
```json
{
  "pass2_status": "completed",
  "pass2_confidence": 0.850,
  "pass2_started_at": "2025-01-20T14:10:05Z",
  "pass2_completed_at": "2025-01-20T14:10:12Z",
  "pass2_model_used": "gpt-4o-mini",
  "pass2_token_usage": 3200,
  "pass2_cost_estimate": 0.0082,
  "final_intervention_id": "uuid-of-intervention-record"
}
```

### Example 4: Diagnosis Enrichment → Condition
```json
{
  "pass2_status": "completed",
  "pass2_confidence": 0.880,
  "pass2_started_at": "2025-02-03T10:15:22Z",
  "pass2_completed_at": "2025-02-03T10:15:30Z",
  "pass2_model_used": "gpt-4o-mini",
  "pass2_token_usage": 2800,
  "pass2_cost_estimate": 0.0072,
  "final_condition_id": "uuid-of-condition-record",
  "final_event_id": "uuid-of-clinical-event-record"
}
```

### Example 5: Document Structure Entity (Skipped in Pass 1)
**No Pass 2 update** - Entities with pass2_status='skipped' are NOT processed by Pass 2.

### Example 6: Minimal Update (In Progress)
```json
{
  "pass2_status": "in_progress",
  "pass2_started_at": "2025-01-01T12:35:10Z",
  "pass2_model_used": "gpt-4o-mini"
}
```

## Critical Notes (Pass 2 UPDATE)

1. **UPDATE Operation**: Pass 2 updates existing record, does NOT create new entity audit.

2. **Status Progression**: 'pending' → 'in_progress' (optional) → 'completed' or 'failed'.

3. **Clinical Data Linkage**: Populate ONE OR MORE final_*_id fields based on entity_subtype:
   - Vital signs → final_observation_id + final_vital_id
   - Medications → final_intervention_id
   - Diagnoses → final_condition_id + final_event_id
   - Allergies → final_allergy_id
   - Lab results → final_observation_id

4. **Document Structure Skip**: Entities with pass2_status='skipped' (set by Pass 1) are NOT updated.

5. **Idempotency**: Safe to retry. Use WHERE pass2_status = 'pending' guard.

6. **Timestamp Management**:
   - pass2_started_at: Set ONCE when Pass 2 begins
   - pass2_completed_at: Set when Pass 2 finishes (success or failure)

7. **Cost Accumulation**: Pass 2 costs are SEPARATE from Pass 1 costs (both tracked independently).

8. **Error Handling**: If Pass 2 fails, populate enrichment_errors with diagnostic message.

9. **Confidence Scoring**: pass2_confidence reflects clinical enrichment quality (may differ from pass1_confidence).

10. **Pass 1 Fields Readonly**: Do NOT modify any Pass 1-populated fields (entity_id, original_text, spatial data, etc.).

11. **Multiple Final Links**: Some entities link to MULTIPLE clinical tables (e.g., vital sign → observations + vitals).

12. **Processing Priority Impact**: 'logging_only' priority entities should have pass2_status='skipped' and NOT be updated.

## Schema Validation Checklist (Pass 2 UPDATE)

- [ ] `pass2_status` (if updated) is 'in_progress', 'completed', or 'failed'
- [ ] `pass2_started_at` is valid TIMESTAMPTZ (set once)
- [ ] `pass2_completed_at` is valid TIMESTAMPTZ (≥ pass2_started_at)
- [ ] `pass2_confidence` (if updated) is 0.000-1.000
- [ ] `enrichment_errors` (if populated) explains failure reason
- [ ] At least ONE `final_*_id` is populated for successful enrichment
- [ ] `final_*_id` values are valid UUIDs
- [ ] Pass 1 fields are NOT modified
- [ ] WHERE clause includes pass2_status = 'pending' guard

## Database Constraint Notes

- **Pass2 status values**: Must be 'pending', 'skipped', 'in_progress', 'completed', or 'failed'
- **NUMERIC precision**: pass2_confidence (4,3), pass2_cost_estimate (8,4)
- **TIMESTAMPTZ**: pass2_started_at and pass2_completed_at are ISO 8601 with timezone
- **Foreign keys**: All final_*_id fields reference their respective clinical tables
- **Valid timing constraint**: pass2_completed_at must be ≥ pass2_started_at (if both set)
- **Valid final links constraint**: document_structure entities must have ALL final_*_id as NULL

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- All entity identity and spatial fields
- All Pass 1 processing metadata
- All AI-OCR cross-validation fields
- pass2_status initialization ('pending' or 'skipped')

**Pass 2 UPDATE modifies:**
- pass2_status ('in_progress' → 'completed'/'failed')
- pass2_confidence (clinical enrichment quality)
- pass2_started_at, pass2_completed_at (timing)
- pass2_model_used, pass2_token_usage, pass2_cost_estimate (Pass 2 metrics)
- enrichment_errors (if Pass 2 fails)
- All final_*_id links (clinical table references)

**Neither Pass modifies after creation:**
- created_at (set at Pass 1 CREATE)
- manual_review_completed, manual_review_notes, manual_reviewer_id (human review only)

## Update Operation Pattern

```sql
-- Pass 2 UPDATE example:
UPDATE entity_processing_audit
SET
    pass2_status = 'completed',
    pass2_confidence = 0.920,
    pass2_started_at = COALESCE(pass2_started_at, NOW()),  -- Set once
    pass2_completed_at = NOW(),
    pass2_model_used = 'gpt-4o-mini',
    pass2_token_usage = 2400,
    pass2_cost_estimate = 0.0062,
    final_observation_id = 'uuid-of-observation',
    final_vital_id = 'uuid-of-vital',
    updated_at = NOW()
WHERE id = $1
  AND pass2_status = 'pending';  -- Safety check: only update pending entities
```

## Final Clinical Data Link Mapping

| Entity Subtype | Final Links |
|----------------|-------------|
| vital_sign_* | final_observation_id + final_vital_id |
| medication | final_intervention_id |
| diagnosis | final_condition_id + final_event_id |
| allergy | final_allergy_id |
| lab_result | final_observation_id |
| procedure | final_intervention_id + final_event_id |
| appointment | final_encounter_id |
| clinical_note | final_event_id |
| immunization | final_intervention_id |

**Note:** Some entities link to multiple clinical tables for complete clinical context.
