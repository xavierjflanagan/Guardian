# patient_conditions Bridge Schema (Source) - Pass 2

**Status:** ✅ Created from Migration 08
**Database Source:** /current_schema/03_clinical_core.sql (lines 544-597)
**Last Updated:** 1 October 2025 (Migration 08 alignment)
**Priority:** HIGH - Medical conditions/diagnoses with temporal tracking and severity management

## Database Table Structure

```sql
CREATE TABLE IF NOT EXISTS patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Renamed from clinical_event_id, now required

    -- NARRATIVE LINKING SYSTEM - Core UX Feature
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE, -- Source file reference
    primary_narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL, -- Primary storyline for this condition
    -- Note: Full narrative linking handled by narrative_event_links table (generic many-to-many)

    -- Condition details
    condition_name TEXT NOT NULL,
    condition_code TEXT,
    condition_system TEXT CHECK (condition_system IN ('icd10', 'snomed', 'custom')),

    -- Note: medical_condition_code_id FK column removed in migration 06 (vestigial cleanup)
    -- Medical codes now assigned via medical_code_assignments table

    -- Clinical context
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'resolved', 'inactive', 'remission', 'relapse'
    )),

    -- Temporal information
    onset_date DATE,
    diagnosed_date DATE,
    resolved_date DATE,

    -- Source information
    diagnosed_by TEXT, -- Provider name
    confidence_score NUMERIC(3,2) DEFAULT 1.0,

    -- V3 AI Processing enhancements
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Clinical notes
    notes TEXT,
    clinical_context JSONB DEFAULT '{}',

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Migration 08: Composite FK ensures patient_id consistency with parent event
    CONSTRAINT patient_conditions_event_patient_fk FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_conditions_event_id ON patient_conditions(event_id);
```

## AI Extraction Requirements for Pass 2

Extract medical conditions and diagnoses from medical documents including severity, status, and temporal information.

### Required Fields

```typescript
interface PatientConditionsExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  event_id: string;                        // UUID - references parent patient_clinical_events record (Migration 08)
  shell_file_id: string;                   // UUID - source document reference (NOT NULL)
  condition_name: string;                  // Name of condition/diagnosis

  // CONDITION CODING (OPTIONAL)
  condition_code?: string;                 // ICD-10, SNOMED, or custom code
  condition_system?: 'icd10' | 'snomed' | 'custom';  // Coding system used

  // NARRATIVE LINKING (OPTIONAL - Pass 3)
  primary_narrative_id?: string;           // UUID - primary clinical narrative (Pass 3)

  // CLINICAL SEVERITY AND STATUS (OPTIONAL)
  severity?: 'mild' | 'moderate' | 'severe' | 'critical';
  status?: 'active' | 'resolved' | 'inactive' | 'remission' | 'relapse';  // Default: 'active'

  // TEMPORAL INFORMATION (OPTIONAL)
  onset_date?: string;                     // ISO 8601 DATE format - when condition started
  diagnosed_date?: string;                 // ISO 8601 DATE format - when diagnosed
  resolved_date?: string;                  // ISO 8601 DATE format - when resolved (if applicable)

  // SOURCE INFORMATION (OPTIONAL)
  diagnosed_by?: string;                   // Provider name
  confidence_score?: number;               // 0.00-1.00 (2 decimal places)

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted conditions
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold

  // CLINICAL NOTES (OPTIONAL)
  notes?: string;                          // Additional clinical notes
  clinical_context?: object;               // JSONB - additional structured context
}
```

## Condition System Values

- **icd10**: ICD-10 diagnostic codes (most common)
- **snomed**: SNOMED-CT codes
- **custom**: Custom or free-text coding

## Severity Values

- **mild**: Minor condition, minimal impact on daily activities
- **moderate**: Noticeable symptoms, some impact on daily activities
- **severe**: Significant symptoms, substantial impact on daily activities
- **critical**: Life-threatening or requiring immediate intervention

## Status Values

- **active**: Currently ongoing condition
- **resolved**: Condition fully resolved
- **inactive**: Not currently symptomatic but not fully resolved
- **remission**: Temporary improvement of chronic condition
- **relapse**: Return of previously resolved/remission condition

## Example Extractions

### Example 1: Active Chronic Condition
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "shell_file_id": "uuid-from-context",
  "condition_name": "Type 2 Diabetes Mellitus",
  "condition_code": "E11.9",
  "condition_system": "icd10",
  "severity": "moderate",
  "status": "active",
  "onset_date": "2020-03-15",
  "diagnosed_date": "2020-03-20",
  "diagnosed_by": "Dr. Sarah Johnson",
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false
}
```

### Example 2: Resolved Acute Condition
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "shell_file_id": "uuid-from-context",
  "condition_name": "Acute Bronchitis",
  "condition_code": "J20.9",
  "condition_system": "icd10",
  "severity": "mild",
  "status": "resolved",
  "onset_date": "2025-09-10",
  "diagnosed_date": "2025-09-12",
  "resolved_date": "2025-09-25",
  "diagnosed_by": "Dr. Michael Chen",
  "notes": "Viral infection, resolved with symptomatic treatment",
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false
}
```

### Example 3: Severe Condition Requiring Review
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "shell_file_id": "uuid-from-context",
  "condition_name": "Coronary Artery Disease",
  "condition_code": "I25.1",
  "condition_system": "icd10",
  "severity": "severe",
  "status": "active",
  "diagnosed_date": "2025-09-28",
  "diagnosed_by": "Dr. Robert Martinez, Cardiologist",
  "notes": "Triple vessel disease identified on cardiac catheterization",
  "ai_extracted": true,
  "ai_confidence": 0.850,
  "requires_review": true
}
```

## Critical Notes

1. **Migration 08 - HAS patient_id Column**: This table DOES have a `patient_id` column (denormalized for RLS performance). The composite FK ensures patient_id consistency with the parent event.

2. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record. This is a NOT NULL requirement enforced by Migration 08. The column was renamed from `clinical_event_id` in Migration 08.

3. **Composite FK Integrity**: The composite foreign key `(event_id, patient_id) → patient_clinical_events(id, patient_id)` ensures that the denormalized patient_id matches the patient_id of the parent event.

4. **Shell File Reference**: `shell_file_id` is NOT NULL - every condition must reference its source document.

5. **Narrative Linking**: `primary_narrative_id` is optional (Pass 3 feature). Full narrative linking is handled by the `narrative_event_links` table.

6. **Medical Codes**: The `medical_condition_code_id` FK column was removed in migration 06. Medical codes are now assigned via the `medical_code_assignments` table, though `condition_code` and `condition_system` can be stored directly on this table.

7. **Status CHECK Constraint**: Database enforces 5 status values: 'active', 'resolved', 'inactive', 'remission', 'relapse'. Default is 'active'.

8. **Severity CHECK Constraint**: Database enforces 4 severity values: 'mild', 'moderate', 'severe', 'critical'.

9. **Condition System CHECK Constraint**: Database enforces 3 system values: 'icd10', 'snomed', 'custom'.

10. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000), `confidence_score` uses 2 decimals (0.00-1.00).

11. **Required Fields**: 4 NOT NULL fields: patient_id, event_id, shell_file_id, condition_name. Status has a default of 'active'.

12. **JSONB Field**: `clinical_context` is JSONB with default empty object '{}'.

13. **Temporal Dates**: All date fields (onset_date, diagnosed_date, resolved_date) are PostgreSQL DATE type (not TIMESTAMPTZ).

14. **Index for Performance**: `idx_patient_conditions_event_id` index added in Migration 08 for efficient JOINs through the hub-and-spoke architecture.

## Schema Validation Checklist

- [ ] `patient_id` is a valid UUID (from context)
- [ ] `event_id` references a valid patient_clinical_events record (NOT NULL)
- [ ] `shell_file_id` references a valid shell_files record (NOT NULL)
- [ ] `condition_name` is provided (NOT NULL)
- [ ] `condition_system` (if provided) is one of: 'icd10', 'snomed', 'custom'
- [ ] `severity` (if provided) is one of: 'mild', 'moderate', 'severe', 'critical'
- [ ] `status` is one of: 'active', 'resolved', 'inactive', 'remission', 'relapse' (has default 'active')
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `confidence_score` (if provided) is between 0.00 and 1.00 with 2 decimal places
- [ ] All date fields (if provided) are valid ISO 8601 DATE format
- [ ] `clinical_context` (if provided) is valid JSONB

## Database Constraint Notes

- **HAS patient_id column**: This table has patient_id (denormalized for RLS performance)
- **Composite FK constraint**: `(event_id, patient_id) → patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event (Migration 08)
- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this condition is automatically deleted
- **FK to shell file**: `shell_file_id` has ON DELETE CASCADE and is NOT NULL - every condition must have a source file
- **FK to narrative**: `primary_narrative_id` has ON DELETE SET NULL (optional Pass 3 feature)
- **condition_system CHECK constraint**: Database enforces 3 specific values
- **severity CHECK constraint**: Database enforces 4 specific values
- **status CHECK constraint**: Database enforces 5 specific values with default 'active'
- **NOT NULL constraints**: patient_id, event_id, shell_file_id, condition_name, status (with default), created_at, updated_at are required
- **JSONB field**: clinical_context is schema-less JSONB for flexibility (default '{}')
- **Index optimization**: `idx_patient_conditions_event_id` ensures efficient JOINs to parent events
- **medical_condition_code_id removed**: This FK column was removed in migration 06
- **event_id renamed**: Renamed from `clinical_event_id` in Migration 08
