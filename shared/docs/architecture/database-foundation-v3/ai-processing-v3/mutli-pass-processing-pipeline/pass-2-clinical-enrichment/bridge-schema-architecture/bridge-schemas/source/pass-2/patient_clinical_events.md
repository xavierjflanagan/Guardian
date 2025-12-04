# patient_clinical_events Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP (Hub Table)
**Step A Rationale:** Central hub for all clinical entities - required for hub-and-spoke architecture
**Step B Sync:** REDESIGNED - Lean hub schema (16 columns, down from ~40)
**Step C Columns:** Complete - see Lean Hub Schema below
**Step D Temporal:** N/A - Hub does not own temporal data; spokes own their dates
**Last Triage Update:** 2025-12-04
**Original Created:** 30 September 2025

---

## Lean Hub Schema (Triaged 2025-12-04)

The hub table is a **directory/index**, not a data warehouse. It answers: "What type of thing is this, and where are the details?"

### Target Schema (16 columns)

```sql
CREATE TABLE patient_clinical_events (
    -- IDENTITY
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES healthcare_encounters(id),
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,

    -- ROUTING
    activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention')),

    -- ANALYTICS
    clinical_purposes TEXT[] NOT NULL,

    -- LINKING
    narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL,
    spoke_table TEXT NOT NULL,
    spoke_record_id UUID NOT NULL,

    -- SPATIAL
    source_page_number INTEGER,

    -- AUDIT
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- LIFECYCLE
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,

    -- REVIEW
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,

    -- Composite FK support
    CONSTRAINT patient_clinical_events_id_patient_id_key UNIQUE (id, patient_id)
);
```

---

## AI Extraction Requirements for Pass 2

The hub record is created by the Pass 2 worker, not extracted by AI. The AI extracts clinical data to spoke tables.

### Worker-Populated Fields (Not AI-Extracted)

| Field | Source |
|-------|--------|
| `id` | Generated UUID |
| `patient_id` | From processing context |
| `encounter_id` | From Pass 0.5 encounter |
| `shell_file_id` | From processing context |
| `spoke_table` | Determined by entity type routing |
| `spoke_record_id` | Generated after spoke INSERT |
| `created_at`, `updated_at` | System timestamps |
| `archived`, `archived_reason`, `archived_at` | Default false, user-triggered later |
| `reviewed_by`, `reviewed_at` | NULL, set during manual review |
| `narrative_id` | NULL, set by Pass 3 |

### AI-Determined Fields

| Field | AI Responsibility |
|-------|-------------------|
| `activity_type` | Classify as 'observation' or 'intervention' |
| `clinical_purposes` | Assign O3 purposes array |
| `source_page_number` | Extract from document position |

---

## O3 Two-Axis Classification Guide

### Axis 1: Activity Type (Routing)

| Value | Definition | Routes To |
|-------|------------|-----------|
| `observation` | Information gathering | vitals, lab_results, conditions, symptoms, physical_findings, imaging_results, etc. |
| `intervention` | Actions taken | medications, immunizations, procedures, treatments, devices, etc. |

### Axis 2: Clinical Purposes (Analytics)

Array of healthcare intents:
- `screening` - Asymptomatic disease detection
- `diagnostic` - Determining cause of symptoms
- `therapeutic` - Treatment delivery
- `monitoring` - Tracking conditions over time
- `preventive` - Disease prevention

---

## Columns Removed (Triage 2025-12-04)

| Removed Column | Reason |
|----------------|--------|
| `event_name` | Spoke tables have entity-specific names |
| `method` | Clinical detail belongs on spokes |
| `body_site` | Clinical detail belongs on spokes |
| `performed_by` | On procedure spoke |
| `facility_name` | On procedure spoke |
| `service_date` | Spokes own dates |
| `event_date` | Spokes own dates with tailored fields |
| `snomed_code`, `loinc_code`, `cpt_code`, `icd10_code` | On spokes or medical_code_assignments |
| `ai_extracted` | Always true, pointless |
| `ai_confidence` | Confidence meaningless in iterative model |
| `requires_review` | Derived from confidence, meaningless |
| `ai_model_version` | Tracked in ai_processing_sessions |
| `ai_processing_version` | Duplicate |
| `entity_id` | Strategy-A removes Pass 1 entity handoff |
| `confidence_score` | Duplicate of ai_confidence |
| `requires_manual_review` | Duplicate |
| `ai_confidence_scores` | In ai_confidence_scoring table |
| `entity_extraction_completed` | Tracked in job queue |
| `clinical_data_extracted` | Tracked in job queue |
| `ai_document_summary` | File-level, belongs on shell_files |
| `ai_file_purpose` | File-level, belongs on shell_files |
| `ai_key_findings` | File-level, belongs on shell_files |
| `ai_file_confidence` | File-level, belongs on shell_files |
| `coding_confidence` | In medical_code_assignments |
| `coding_method` | In medical_code_assignments |
| `contains_phi` | Assume all clinical is PHI |
| `encryption_key_id` | Infrastructure, not clinical |
| `retention_period` | Policy-level, not per-record |
| `deleted_at` | Redundant with archived pattern |
| `is_synthetic` | Pre-launch, not needed |

---

## Example: Creating Hub + Spoke Records

```typescript
// Pass 2 worker creates hub and spoke together
const hubId = generateUUID();
const spokeId = generateUUID();

// Step 1: Insert spoke record (owns all clinical detail)
await supabase.from('patient_vitals').insert({
  id: spokeId,
  event_id: hubId,
  patient_id: context.patientId,
  vital_type: 'blood_pressure',
  systolic_value: 128,
  diastolic_value: 82,
  measurement_unit: 'mmHg',
  measurement_datetime: '2025-11-15T10:30:00Z'  // Spoke owns the date
});

// Step 2: Insert hub record (lean directory entry)
await supabase.from('patient_clinical_events').insert({
  id: hubId,
  patient_id: context.patientId,
  encounter_id: context.encounterId,
  shell_file_id: context.shellFileId,
  activity_type: 'observation',
  clinical_purposes: ['monitoring'],
  spoke_table: 'patient_vitals',
  spoke_record_id: spokeId,
  source_page_number: 2
});
```

---

## Schema Validation Checklist

- [ ] `activity_type` is 'observation' or 'intervention'
- [ ] `clinical_purposes` is a non-empty array
- [ ] `spoke_table` matches a valid spoke table name
- [ ] `spoke_record_id` references an existing spoke record
- [ ] `patient_id` matches across hub and spoke (composite FK)

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Designs:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
