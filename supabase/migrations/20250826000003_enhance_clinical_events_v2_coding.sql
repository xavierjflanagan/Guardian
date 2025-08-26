-- Enhance patient_clinical_events table with V2 medical coding fields
-- Adds missing ICD-10 and coding confidence fields for healthcare standards integration
-- Created: 2025-08-26

BEGIN;

-- Add V2 medical coding fields to existing patient_clinical_events table
ALTER TABLE patient_clinical_events 
ADD COLUMN IF NOT EXISTS icd10_code TEXT,
ADD COLUMN IF NOT EXISTS coding_confidence NUMERIC(4,3) CHECK (coding_confidence BETWEEN 0 AND 1),
ADD COLUMN IF NOT EXISTS coding_method TEXT CHECK (coding_method IN ('automated_ai', 'manual_verification', 'hybrid_validation')),
ADD COLUMN IF NOT EXISTS medical_coding_notes TEXT;

-- Update column comments to reflect V2 enhancements
COMMENT ON COLUMN patient_clinical_events.snomed_code IS 'SNOMED-CT clinical concept code - V2 healthcare standards integration';
COMMENT ON COLUMN patient_clinical_events.loinc_code IS 'LOINC observation/lab test code - V2 healthcare standards integration';  
COMMENT ON COLUMN patient_clinical_events.cpt_code IS 'CPT procedure/service code - V2 healthcare standards integration';
COMMENT ON COLUMN patient_clinical_events.icd10_code IS 'ICD-10 diagnosis code - V2 healthcare standards integration';
COMMENT ON COLUMN patient_clinical_events.coding_confidence IS 'AI confidence in assigned medical codes (0.0-1.0) - V2 enhancement';
COMMENT ON COLUMN patient_clinical_events.coding_method IS 'Method used to assign medical codes - V2 enhancement';
COMMENT ON COLUMN patient_clinical_events.medical_coding_notes IS 'Additional notes for medical coding review - V2 enhancement';

-- Create index for medical coding queries
CREATE INDEX IF NOT EXISTS patient_clinical_events_coding_confidence_idx ON patient_clinical_events(coding_confidence) WHERE coding_confidence IS NOT NULL;
CREATE INDEX IF NOT EXISTS patient_clinical_events_needs_coding_review_idx ON patient_clinical_events(coding_confidence, requires_review) WHERE coding_confidence < 0.8 OR requires_review = TRUE;

-- Create GIN index for efficient medical code searches
CREATE INDEX IF NOT EXISTS patient_clinical_events_medical_codes_gin_idx ON patient_clinical_events USING gin(
    (snomed_code || ' ' || loinc_code || ' ' || cpt_code || ' ' || icd10_code)
) WHERE (snomed_code IS NOT NULL OR loinc_code IS NOT NULL OR cpt_code IS NOT NULL OR icd10_code IS NOT NULL);

-- Update table comment to reflect V2 enhancements
COMMENT ON TABLE patient_clinical_events IS 'Central clinical events with O3 two-axis classification + V2 healthcare standards coding integration';

COMMIT;