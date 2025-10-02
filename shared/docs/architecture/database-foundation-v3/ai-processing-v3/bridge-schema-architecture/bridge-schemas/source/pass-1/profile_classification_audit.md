# profile_classification_audit Bridge Schema (Source) - Pass 1

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 271-322)
**Last Updated:** 1 October 2025
**Priority:** HIGH - Critical for profile/patient assignment safety and contamination prevention

## Database Table Structure

```sql
-- Profile classification audit and contamination prevention tracking
CREATE TABLE IF NOT EXISTS profile_classification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,

    -- Profile Classification Results
    recommended_profile_type TEXT NOT NULL CHECK (recommended_profile_type IN (
        'self', 'child', 'adult_dependent', 'pet'
    )),
    profile_confidence NUMERIC(4,3) CHECK (profile_confidence BETWEEN 0 AND 1),
    identity_extraction_results JSONB DEFAULT '{}',

    -- Contamination Prevention (Core Safety)
    contamination_risk_score NUMERIC(4,3) CHECK (contamination_risk_score BETWEEN 0 AND 1),
    contamination_checks_performed JSONB DEFAULT '{}',
    contamination_warnings TEXT[],
    cross_profile_risk_detected BOOLEAN DEFAULT FALSE,

    -- Identity Verification
    identity_consistency_score NUMERIC(4,3) CHECK (identity_consistency_score BETWEEN 0 AND 1),
    identity_markers_found TEXT[],
    age_indicators TEXT[],
    relationship_indicators TEXT[],

    -- Australian Healthcare Context
    medicare_number_detected BOOLEAN DEFAULT FALSE,
    healthcare_identifier_type TEXT,
    healthcare_provider_context TEXT,

    -- Audit Trail
    classification_reasoning TEXT,
    manual_review_required BOOLEAN DEFAULT FALSE,
    reviewed_by_user BOOLEAN DEFAULT FALSE,
    final_profile_assignment TEXT CHECK (final_profile_assignment IN (
        'self', 'child', 'adult_dependent', 'pet'
    )),

    -- Safety Validation Details
    medical_appropriateness_score NUMERIC(4,3) CHECK (medical_appropriateness_score BETWEEN 0 AND 1),
    age_appropriateness_validated BOOLEAN DEFAULT FALSE,
    safety_flags TEXT[],

    -- Processing Context
    ai_model_used TEXT DEFAULT 'gpt-4o-mini',
    validation_method TEXT DEFAULT 'automated' CHECK (validation_method IN (
        'automated', 'human_guided', 'manual_review'
    )),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## AI Extraction Requirements for Pass 1

This table tracks profile classification and contamination prevention analysis during Pass 1 document processing. It is populated by the AI processing system to ensure safe profile/patient assignment and prevent data contamination.

### Required Fields

```typescript
interface ProfileClassificationAuditExtraction {
  // REQUIRED FIELDS
  processing_session_id: string;           // UUID - references ai_processing_sessions (cross-pass join key)
  shell_file_id: string;                   // UUID - source document being analyzed
  recommended_profile_type: 'self' | 'child' | 'adult_dependent' | 'pet';  // AI classification result

  // PROFILE CLASSIFICATION (OPTIONAL)
  profile_confidence?: number;             // NUMERIC(4,3) - 0.000-1.000 AI confidence in classification
  identity_extraction_results?: object;    // JSONB - identity markers extracted from document

  // CONTAMINATION PREVENTION (OPTIONAL)
  contamination_risk_score?: number;       // NUMERIC(4,3) - 0.000-1.000 risk of profile contamination
  contamination_checks_performed?: object; // JSONB - details of contamination safety checks
  contamination_warnings?: string[];       // TEXT[] - warnings about potential contamination
  cross_profile_risk_detected?: boolean;   // Flag indicating cross-profile data mixing risk

  // IDENTITY VERIFICATION (OPTIONAL)
  identity_consistency_score?: number;     // NUMERIC(4,3) - 0.000-1.000 identity consistency
  identity_markers_found?: string[];       // TEXT[] - identity markers detected in document
  age_indicators?: string[];               // TEXT[] - age-related indicators found
  relationship_indicators?: string[];      // TEXT[] - relationship markers (e.g., "parent", "child")

  // AUSTRALIAN HEALTHCARE CONTEXT (OPTIONAL)
  medicare_number_detected?: boolean;      // Flag for Medicare number detection
  healthcare_identifier_type?: string;     // Type of healthcare identifier found
  healthcare_provider_context?: string;    // Provider context extracted

  // AUDIT TRAIL (OPTIONAL)
  classification_reasoning?: string;       // TEXT - AI reasoning for classification
  manual_review_required?: boolean;        // Flag indicating need for human review
  reviewed_by_user?: boolean;              // Flag indicating user has reviewed
  final_profile_assignment?: 'self' | 'child' | 'adult_dependent' | 'pet';  // Final assignment after review

  // SAFETY VALIDATION (OPTIONAL)
  medical_appropriateness_score?: number;  // NUMERIC(4,3) - 0.000-1.000 medical content appropriateness
  age_appropriateness_validated?: boolean; // Flag indicating age-appropriate content validation
  safety_flags?: string[];                 // TEXT[] - safety concerns detected

  // PROCESSING CONTEXT (OPTIONAL)
  ai_model_used?: string;                  // Model used for classification (default: gpt-4o-mini)
  validation_method?: 'automated' | 'human_guided' | 'manual_review';  // Validation approach
}
```

## Example Extractions

### Example 1: High-Confidence Self Classification
```json
{
  "processing_session_id": "uuid-of-ai-session",
  "shell_file_id": "uuid-of-processed-document",
  "recommended_profile_type": "self",
  "profile_confidence": 0.950,
  "identity_extraction_results": {
    "name_found": "John Smith",
    "dob_found": "1985-03-15",
    "medicare_number": "2123 45678 9"
  },
  "contamination_risk_score": 0.050,
  "contamination_checks_performed": {
    "name_consistency": "passed",
    "date_consistency": "passed",
    "age_consistency": "passed"
  },
  "contamination_warnings": [],
  "cross_profile_risk_detected": false,
  "identity_consistency_score": 0.950,
  "identity_markers_found": ["full_name", "dob", "medicare_number", "address"],
  "age_indicators": ["adult_age_range", "medicare_card_holder"],
  "relationship_indicators": [],
  "medicare_number_detected": true,
  "healthcare_identifier_type": "medicare",
  "healthcare_provider_context": "General Practitioner",
  "classification_reasoning": "Document contains consistent adult identity markers with Medicare number matching patient age. No contamination indicators detected.",
  "manual_review_required": false,
  "medical_appropriateness_score": 0.980,
  "age_appropriateness_validated": true,
  "safety_flags": [],
  "ai_model_used": "gpt-4o-mini",
  "validation_method": "automated"
}
```

### Example 2: Child Profile with Contamination Warning
```json
{
  "processing_session_id": "uuid-of-ai-session",
  "shell_file_id": "uuid-of-processed-document",
  "recommended_profile_type": "child",
  "profile_confidence": 0.820,
  "identity_extraction_results": {
    "name_found": "Emma Johnson",
    "dob_found": "2015-06-20",
    "parent_guardian": "Sarah Johnson"
  },
  "contamination_risk_score": 0.450,
  "contamination_checks_performed": {
    "name_consistency": "passed",
    "multiple_names_detected": "warning",
    "age_consistency": "passed"
  },
  "contamination_warnings": [
    "Multiple names detected in document (child + parent)",
    "Parent medical information present in same document"
  ],
  "cross_profile_risk_detected": true,
  "identity_consistency_score": 0.820,
  "identity_markers_found": ["child_name", "dob", "parent_name", "immunization_record"],
  "age_indicators": ["child_age_range", "pediatric_consultation"],
  "relationship_indicators": ["parent", "guardian"],
  "medicare_number_detected": false,
  "healthcare_identifier_type": "immunization_record",
  "healthcare_provider_context": "Pediatric Clinic",
  "classification_reasoning": "Document contains child identity markers but also references parent information. Contamination risk moderate due to mixed profile data.",
  "manual_review_required": true,
  "medical_appropriateness_score": 0.900,
  "age_appropriateness_validated": true,
  "safety_flags": ["cross_profile_data_detected", "parent_child_mixing"],
  "ai_model_used": "gpt-4o-mini",
  "validation_method": "automated"
}
```

### Example 3: Pet Profile Classification
```json
{
  "processing_session_id": "uuid-of-ai-session",
  "shell_file_id": "uuid-of-processed-document",
  "recommended_profile_type": "pet",
  "profile_confidence": 0.985,
  "identity_extraction_results": {
    "pet_name": "Max",
    "species": "dog",
    "breed": "Golden Retriever",
    "owner": "Michael Brown"
  },
  "contamination_risk_score": 0.030,
  "contamination_checks_performed": {
    "veterinary_context": "confirmed",
    "species_consistency": "passed",
    "human_medical_data": "not_detected"
  },
  "contamination_warnings": [],
  "cross_profile_risk_detected": false,
  "identity_consistency_score": 0.990,
  "identity_markers_found": ["pet_name", "species", "breed", "microchip_number"],
  "age_indicators": ["pet_age_7_years"],
  "relationship_indicators": ["owner"],
  "medicare_number_detected": false,
  "healthcare_identifier_type": "veterinary_microchip",
  "healthcare_provider_context": "Veterinary Clinic",
  "classification_reasoning": "Clear veterinary medical record with species-specific treatment. No human medical data contamination detected.",
  "manual_review_required": false,
  "medical_appropriateness_score": 0.995,
  "age_appropriateness_validated": true,
  "safety_flags": [],
  "ai_model_used": "gpt-4o-mini",
  "validation_method": "automated"
}
```

## Critical Notes

1. **Safety-Critical Table**: This table is essential for preventing medical data contamination across profiles/patients. Contamination prevention is a core safety requirement.

2. **Three Required Fields**: Only 3 NOT NULL fields without defaults: processing_session_id, shell_file_id, recommended_profile_type.

3. **Profile Type Values**: Four valid profile types: 'self', 'child', 'adult_dependent', 'pet'. Matches user_profiles.profile_type enum.

4. **Numeric Precision**: All confidence/score fields use NUMERIC(4,3) with 0.000-1.000 range (matches Pass 1/Pass 2 metrics precision).

5. **JSONB Fields**: identity_extraction_results and contamination_checks_performed are flexible JSONB objects for structured data.

6. **TEXT[] Arrays**: contamination_warnings, identity_markers_found, age_indicators, relationship_indicators, safety_flags all use PostgreSQL TEXT[] arrays.

7. **Contamination Prevention Core Fields**:
   - contamination_risk_score: 0-1 score indicating contamination risk
   - contamination_checks_performed: JSONB detailing safety checks
   - contamination_warnings: Array of specific warnings
   - cross_profile_risk_detected: Boolean flag for profile mixing

8. **Identity Verification Core Fields**:
   - identity_consistency_score: 0-1 score for identity consistency
   - identity_markers_found: Array of identity markers detected
   - age_indicators: Array of age-related markers
   - relationship_indicators: Array of relationship markers

9. **Australian Healthcare Context**: Medicare number detection and healthcare identifier fields specific to Australian medical system.

10. **Audit Trail**: classification_reasoning provides AI explainability, manual_review_required flags need for human oversight.

11. **Safety Validation**: medical_appropriateness_score and age_appropriateness_validated ensure content is appropriate for profile type.

12. **Validation Method Enum**: Three validation approaches: 'automated', 'human_guided', 'manual_review'.

13. **Foreign Key Cascade**: Both FK references use ON DELETE CASCADE - if session or file is deleted, audit record is deleted.

14. **Processing Session Reference**: processing_session_id references ai_processing_sessions table (same as Pass 1/Pass 2 metrics).

15. **Default Values**: ai_model_used defaults to 'gpt-4o-mini', validation_method defaults to 'automated', boolean flags default to FALSE.

16. **CHECK Constraints**: Enum-style CHECK constraints on recommended_profile_type, final_profile_assignment, and validation_method ensure data integrity.

17. **TIMESTAMPTZ Fields**: created_at and updated_at both default to NOW().

18. **NO profile_id Field**: This table classifies which profile documents should belong to - it doesn't reference an existing profile.

## Schema Validation Checklist

- [ ] `processing_session_id` is a valid UUID (from context, NOT NULL)
- [ ] `shell_file_id` is a valid UUID (from context, NOT NULL)
- [ ] `recommended_profile_type` is one of: 'self', 'child', 'adult_dependent', 'pet' (NOT NULL)
- [ ] `profile_confidence` (if provided) is between 0.000 and 1.000
- [ ] `identity_extraction_results` (if provided) is valid JSONB object
- [ ] `contamination_risk_score` (if provided) is between 0.000 and 1.000
- [ ] `contamination_checks_performed` (if provided) is valid JSONB object
- [ ] `contamination_warnings` (if provided) is a valid TEXT[] array
- [ ] `cross_profile_risk_detected` is boolean (defaults to FALSE)
- [ ] `identity_consistency_score` (if provided) is between 0.000 and 1.000
- [ ] `identity_markers_found` (if provided) is a valid TEXT[] array
- [ ] `age_indicators` (if provided) is a valid TEXT[] array
- [ ] `relationship_indicators` (if provided) is a valid TEXT[] array
- [ ] `medicare_number_detected` is boolean (defaults to FALSE)
- [ ] `final_profile_assignment` (if provided) is one of: 'self', 'child', 'adult_dependent', 'pet'
- [ ] `medical_appropriateness_score` (if provided) is between 0.000 and 1.000
- [ ] `age_appropriateness_validated` is boolean (defaults to FALSE)
- [ ] `safety_flags` (if provided) is a valid TEXT[] array
- [ ] `validation_method` (if provided) is one of: 'automated', 'human_guided', 'manual_review'

## Database Constraint Notes

- **NO profile_id**: Table classifies which profile to assign documents to (pre-assignment)
- **NOT NULL constraints**: processing_session_id, shell_file_id, recommended_profile_type
- **Optional fields**: All other fields are optional
- **TEXT[] arrays**: contamination_warnings, identity_markers_found, age_indicators, relationship_indicators, safety_flags
- **JSONB objects**: identity_extraction_results, contamination_checks_performed
- **NUMERIC precision**: All confidence/score fields use (4,3) - matches Pass 1/Pass 2 metrics
- **CHECK constraints**: recommended_profile_type, final_profile_assignment, validation_method (enum values), all scores 0-1
- **FK references with CASCADE**: Both FKs use ON DELETE CASCADE
- **TIMESTAMPTZ defaults**: created_at and updated_at both default to NOW()
- **Default values**: ai_model_used ('gpt-4o-mini'), validation_method ('automated'), boolean flags (FALSE)

## Cross-Pass Interoperability Notes

**Relationship to Pass 1/Pass 2 Metrics:**

1. **Shared Join Key**: Uses processing_session_id same as pass1_entity_metrics and pass2_clinical_metrics for cross-pass analytics.

2. **Consistent Precision**: All confidence/score fields use NUMERIC(4,3) matching ocr_agreement_average and average_clinical_confidence.

3. **Profile Classification Context**: This table determines WHICH profile clinical data should be assigned to during Pass 2 extraction.

4. **Safety Integration**: contamination_risk_score informs whether Pass 2 should proceed or require manual review.

5. **Pass 2 Gating Policy**: If `manual_review_required = true` OR `cross_profile_risk_detected = true`, the system must:
   - Pause Pass 2 clinical extraction
   - Enqueue record in `manual_review_queue` table
   - Require human verification before proceeding with clinical data assignment
   - This prevents contaminated or misclassified data from populating clinical tables

6. **Analytics Join Pattern**:
   ```sql
   SELECT
     p1.entities_detected,
     pca.recommended_profile_type,
     pca.contamination_risk_score,
     p2.clinical_entities_enriched
   FROM pass1_entity_metrics p1
   JOIN profile_classification_audit pca USING (processing_session_id)
   JOIN pass2_clinical_metrics p2 USING (processing_session_id)
   WHERE pca.manual_review_required = FALSE;
   ```

7. **Database Indexes**: Database creates indexes on processing_session_id and shell_file_id for efficient joins with metrics tables.
