# medical_code_assignments Bridge Schema (Source) - Pass 2

**Status:** ✅ Updated for two-tier identifier system (Migration 27 - 2025-10-17)
**Database Source:** /current_schema/03_clinical_core.sql (lines 1312-1370)
**Temporal Columns:** NOT on this table (medical_code_assignments not in temporal tables list)
**Last Updated:** 17 October 2025
**Priority:** CRITICAL - Generic entity-to-medical-code assignment table with two-tier support
**Processing Stage:** Step 1.5 (Between Pass 1 extraction and Pass 2 clinical enrichment)

## Database Table Structure

```sql
CREATE TABLE IF NOT EXISTS medical_code_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Entity reference (generic for all clinical tables)
    entity_table VARCHAR(50) NOT NULL CHECK (entity_table IN (
        'patient_medications', 'patient_conditions', 'patient_allergies',
        'patient_vitals', 'patient_immunizations', 'patient_interventions',
        'patient_observations', 'healthcare_encounters', 'healthcare_timeline_events'
    )),
    entity_id UUID NOT NULL,
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Universal code assignment (parallel strategy)
    universal_code_system VARCHAR(20),
    universal_code VARCHAR(50),
    universal_grouping_code VARCHAR(50),  -- Two-tier system: optional grouping identifier
    universal_display TEXT,
    universal_confidence DECIMAL(3,2) CHECK (universal_confidence >= 0.0 AND universal_confidence <= 1.0),

    -- Regional code assignment (parallel strategy)
    regional_code_system VARCHAR(20),
    regional_code VARCHAR(50),
    regional_grouping_code VARCHAR(50),   -- Two-tier system: optional grouping identifier
    regional_display TEXT,
    regional_confidence DECIMAL(3,2) CHECK (regional_confidence >= 0.0 AND regional_confidence <= 1.0),
    regional_country_code CHAR(3),

    -- Assignment metadata
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by_system TEXT DEFAULT 'vector_ai',
    requires_review BOOLEAN DEFAULT FALSE,

    -- Human review and validation
    reviewed_by_user BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMPTZ,
    validation_notes TEXT,

    -- Clinical context
    clinical_context TEXT,
    fallback_identifier TEXT,
    assignment_confidence DECIMAL(3,2) CHECK (assignment_confidence >= 0.0 AND assignment_confidence <= 1.0),

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Performance constraint
    CONSTRAINT unique_entity_assignment UNIQUE (entity_table, entity_id)
);
```

## Two-Tier Identifier System (NEW: Migration 27)

**Enhanced code storage strategy supporting hierarchical medical code organization:**

### Field Mapping Strategy
| Purpose | Universal Codes | Regional Codes |
|---------|----------------|----------------|
| **Granular ID** | `universal_code` | `regional_code` |
| **Grouping ID** | `universal_grouping_code` | `regional_grouping_code` |

### Usage Patterns by Entity Type

**Medications (PBS Example):**
- `regional_code`: `"10001J_14023_31078_31081_31083"` (brand-specific li_item_id)
- `regional_grouping_code`: `"10001J"` (PBS code for optional deduplication)
- **Benefit**: Brand preservation + cross-referencing capability

**Conditions (SNOMED Hierarchy):**
- `universal_code`: `"44054006"` (Type 2 diabetes mellitus)
- `universal_grouping_code`: `"73211009"` (Diabetes mellitus parent)
- **Benefit**: Condition grouping, family history tracking

**Lab Tests (LOINC Categories):**
- `universal_code`: `"33747-0"` (Hemoglobin A1c)
- `universal_grouping_code`: `"HBA1C"` (Glycated hemoglobin category)
- **Benefit**: Test grouping, trending analysis

**When to Use Grouping Codes:**
- **NULL**: When no hierarchical relationship exists or needed
- **Populated**: When brand preservation, categorization, or deduplication beneficial

## Medical Code Resolution Process (Step 1.5)

**CRITICAL ARCHITECTURE NOTE**: This table is populated by a **vector embedding-based code resolution system** that operates BETWEEN Pass 1 and Pass 2:

### Three-Stage Pipeline
1. **Pass 1**: AI extracts clinical entities (medications, conditions, etc.) WITHOUT generating medical codes
2. **Step 1.5 - Vector Code Resolution**:
   - Entity text is embedded using OpenAI embeddings (text-embedding-3-small)
   - pgvector similarity search retrieves 10-20 most similar verified medical codes from database
   - AI selects best code FROM CANDIDATES ONLY (prevents hallucination)
   - Both universal AND regional codes assigned in parallel when found
3. **Pass 2**: AI receives verified medical codes as context for enhanced clinical processing

### AI Role in Code Assignment

**AI DOES NOT generate codes directly**. Instead:
- AI receives 10-20 pre-verified candidate codes from vector search
- AI selects the most appropriate code from this limited candidate list
- If no suitable code found (confidence < 0.6), uses fallback_identifier instead
- This architecture eliminates hallucination risk while maintaining semantic matching power

### Confidence-Based Selection Strategy
- **≥0.80 confidence**: Auto-accept code assignment
- **0.60-0.79 confidence**: Accept with requires_review=true flag
- **<0.60 confidence**: Use fallback_identifier (no code assigned)
- **No candidates found**: Conservative fallback approach for safety

## AI Extraction Requirements for Pass 2

This table stores medical code assignments for ANY clinical entity using a parallel dual-code strategy (universal + regional codes).

### Required Fields

```typescript
interface MedicalCodeAssignmentsExtraction {
  // REQUIRED FIELDS
  entity_table: 'patient_medications' | 'patient_conditions' | 'patient_allergies' |
                'patient_vitals' | 'patient_immunizations' | 'patient_interventions' |
                'patient_observations' | 'healthcare_encounters' | 'healthcare_timeline_events';
  entity_id: string;                       // UUID of the entity being coded
  patient_id: string;                      // UUID - from shell file processing context

  // UNIVERSAL CODE (OPTIONAL - parallel strategy)
  universal_code_system?: string;          // 'SNOMED', 'ICD-10', 'LOINC', 'RxNorm', etc.
  universal_code?: string;                 // The actual code
  universal_display?: string;              // Human-readable description
  universal_confidence?: number;           // 0.00-1.00 (2 decimal places)

  // REGIONAL CODE (OPTIONAL - parallel strategy)
  regional_code_system?: string;           // 'ICD-10-CM', 'PBS', 'MBS', etc.
  regional_code?: string;                  // The actual regional code
  regional_display?: string;               // Human-readable description
  regional_confidence?: number;            // 0.00-1.00 (2 decimal places)
  regional_country_code?: string;          // ISO 3166-1 alpha-3 (e.g., 'AUS', 'USA')

  // ASSIGNMENT METADATA (OPTIONAL)
  assigned_at?: string;                    // ISO 8601 TIMESTAMPTZ (default NOW())
  assigned_by_system?: string;             // Default 'vector_ai'
  requires_review?: boolean;               // Default false

  // HUMAN REVIEW (OPTIONAL)
  reviewed_by_user?: boolean;              // Default false
  reviewed_at?: string;                    // ISO 8601 TIMESTAMPTZ
  validation_notes?: string;               // Notes from review

  // CLINICAL CONTEXT (OPTIONAL)
  clinical_context?: string;               // Additional context for code assignment
  fallback_identifier?: string;            // Fallback when no standard code found
  assignment_confidence?: number;          // Overall confidence 0.00-1.00

  // AUDIT (AUTO-GENERATED)
  created_at?: string;                     // ISO 8601 TIMESTAMPTZ (default NOW())
  updated_at?: string;                     // ISO 8601 TIMESTAMPTZ (default NOW())
}
```

## Parallel Code Strategy Guide

This table uses a **parallel dual-code strategy**:

### Universal Codes (International)
- **SNOMED-CT**: Clinical terms (conditions, procedures, findings)
- **ICD-10**: Diagnosis classification
- **LOINC**: Lab tests and observations
- **RxNorm**: Medications
- **CPT**: Procedures (US-based but internationally recognized)

### Regional Codes (Country-Specific)
- **Australia**: PBS (medications), MBS (medical services), ACIR (immunizations)
- **United States**: ICD-10-CM (diagnoses), NDC (medications), CPT (procedures)
- **Other countries**: Use regional_country_code to specify

### Code Assignment Strategy
1. **Both codes can exist**: Universal AND regional codes can be assigned in parallel
2. **Either code is valid**: Only universal OR only regional is acceptable
3. **Confidence scores**: Each code has its own confidence score
4. **Fallback identifier**: Used when no standard code can be assigned

## Entity Table Reference

The entity_table field uses CHECK constraint with 9 allowed values:

| Entity Table | Typical Code Systems |
|--------------|---------------------|
| patient_medications | RxNorm (universal), PBS/NDC (regional) |
| patient_conditions | SNOMED/ICD-10 (universal), ICD-10-CM (regional) |
| patient_allergies | SNOMED (universal), regional allergy codes |
| patient_vitals | LOINC (universal), regional vital codes |
| patient_immunizations | CVX (universal), ACIR/regional (regional) |
| patient_interventions | CPT/SNOMED (universal), MBS (regional) |
| patient_observations | LOINC/SNOMED (universal), regional lab codes |
| healthcare_encounters | CPT (universal), MBS (regional) |
| healthcare_timeline_events | Various depending on event type |

## Example Extractions

### Example 1: Medication with Dual Codes
```json
{
  "entity_table": "patient_medications",
  "entity_id": "uuid-of-medication-record",
  "patient_id": "uuid-from-context",
  "universal_code_system": "RxNorm",
  "universal_code": "314076",
  "universal_display": "Lisinopril 10 MG Oral Tablet",
  "universal_confidence": 0.95,
  "regional_code_system": "PBS",
  "regional_code": "8254K",
  "regional_display": "Lisinopril tablets 10 mg",
  "regional_confidence": 0.90,
  "regional_country_code": "AUS",
  "assigned_by_system": "vector_ai",
  "requires_review": false,
  "assignment_confidence": 0.93
}
```

### Example 2: Condition with Universal Code Only
```json
{
  "entity_table": "patient_conditions",
  "entity_id": "uuid-of-condition-record",
  "patient_id": "uuid-from-context",
  "universal_code_system": "ICD-10",
  "universal_code": "I10",
  "universal_display": "Essential (primary) hypertension",
  "universal_confidence": 0.92,
  "assigned_by_system": "vector_ai",
  "requires_review": false,
  "clinical_context": "Chronic condition documented in visit notes"
}
```

### Example 3: Observation with LOINC Code
```json
{
  "entity_table": "patient_observations",
  "entity_id": "uuid-of-observation-record",
  "patient_id": "uuid-from-context",
  "universal_code_system": "LOINC",
  "universal_code": "2339-0",
  "universal_display": "Glucose [Mass/volume] in Blood",
  "universal_confidence": 0.88,
  "assigned_by_system": "vector_ai",
  "requires_review": false
}
```

### Example 4: Immunization with CVX and Regional Code
```json
{
  "entity_table": "patient_immunizations",
  "entity_id": "uuid-of-immunization-record",
  "patient_id": "uuid-from-context",
  "universal_code_system": "CVX",
  "universal_code": "208",
  "universal_display": "COVID-19, mRNA, LNP-S, PF, 100 mcg/0.5mL dose",
  "universal_confidence": 0.96,
  "regional_code_system": "ACIR",
  "regional_code": "COVID-19-PFIZER",
  "regional_display": "Pfizer COVID-19 vaccine",
  "regional_confidence": 0.94,
  "regional_country_code": "AUS",
  "assigned_by_system": "vector_ai",
  "requires_review": false
}
```

### Example 5: Fallback Identifier (No Standard Code)
```json
{
  "entity_table": "patient_interventions",
  "entity_id": "uuid-of-intervention-record",
  "patient_id": "uuid-from-context",
  "fallback_identifier": "Minor wart removal procedure - left forearm",
  "clinical_context": "No specific CPT code documented in source",
  "assigned_by_system": "vector_ai",
  "requires_review": true,
  "assignment_confidence": 0.60
}
```

## Critical Notes

1. **Step 1.5 Processing**: This table is populated by vector embedding system BETWEEN Pass 1 and Pass 2
2. **No Direct Code Generation**: AI selects from 10-20 verified candidates, never generates codes freely
3. **Generic Entity Table**: This table can reference ANY of 9 clinical entity tables
4. **Unique Constraint**: One code assignment per entity (entity_table + entity_id UNIQUE)
5. **Parallel Strategy**: Universal AND regional codes can coexist (not hierarchical)
6. **Optional Codes**: Both universal_code and regional_code are optional
7. **Fallback Strategy**: Use fallback_identifier when no standard code available (confidence < 0.6)
8. **Confidence Scores**: DECIMAL(3,2) = 0.00-1.00 with 2 decimal places
9. **Country Codes**: regional_country_code uses ISO 3166-1 alpha-3 (3 chars)
10. **NO Temporal Columns**: This table does NOT have temporal management columns
11. **Auto-Timestamps**: assigned_at, created_at, updated_at auto-generated if not provided
12. **Entity ID Reference**: entity_id must be a valid UUID from the specified entity_table
13. **Vector Search Foundation**: Powered by pgvector similarity search over embedded medical code database
14. **Deduplication Enabler**: Medical codes flow into clinical_identity_key for safe entity deduplication

## Common Code Systems Reference

### Universal Code Systems
- **SNOMED-CT**: Systematized Nomenclature of Medicine - Clinical Terms
- **ICD-10**: International Classification of Diseases, 10th Revision
- **LOINC**: Logical Observation Identifiers Names and Codes
- **RxNorm**: Normalized naming system for medications (US NLM)
- **CVX**: CDC Vaccine Administered CVX codes
- **CPT**: Current Procedural Terminology

### Regional Code Systems (Australia)
- **PBS**: Pharmaceutical Benefits Scheme
- **MBS**: Medicare Benefits Schedule
- **ACIR**: Australian Childhood Immunisation Register

### Regional Code Systems (United States)
- **ICD-10-CM**: ICD-10 Clinical Modification
- **NDC**: National Drug Code
- **HCPCS**: Healthcare Common Procedure Coding System

## Schema Validation Checklist

- [ ] `entity_table` is one of 9 allowed values (DB CHECK constraint)
- [ ] `entity_id` is a valid UUID
- [ ] `patient_id` is a valid UUID
- [ ] `universal_confidence` (if provided) is between 0.00 and 1.00 with 2 decimals
- [ ] `regional_confidence` (if provided) is between 0.00 and 1.00 with 2 decimals
- [ ] `assignment_confidence` (if provided) is between 0.00 and 1.00 with 2 decimals
- [ ] `regional_country_code` (if provided) is exactly 3 characters
- [ ] At least ONE of: universal_code, regional_code, or fallback_identifier is provided
- [ ] `requires_review` is boolean (defaults to false)
- [ ] UNIQUE constraint: only one assignment per (entity_table, entity_id) pair

## Database Constraint Notes

- **CHECK constraint on entity_table**: Database enforces one of 9 specific entity table names
- **UNIQUE constraint**: (entity_table, entity_id) ensures one code assignment per entity
- **DECIMAL precision**: All confidence scores use DECIMAL(3,2) = 0.00-1.00 (2 decimal places)
- **FK constraint**: patient_id references user_profiles(id) ON DELETE CASCADE
- **NOT NULL fields**: entity_table, entity_id, patient_id, assigned_at, created_at, updated_at
- **DEFAULT values**: assigned_by_system='vector_ai', requires_review=false, reviewed_by_user=false
- **NO temporal columns**: This table is NOT part of the 9 temporal-managed tables