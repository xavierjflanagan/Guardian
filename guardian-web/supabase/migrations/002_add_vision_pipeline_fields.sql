-- Add Vision + OCR Safety Net pipeline fields to documents table
-- This migration adds support for the new dual processing pipeline with medical data extraction

-- Add new pipeline fields
ALTER TABLE documents 
ADD COLUMN medical_data JSONB,
ADD COLUMN vision_confidence DECIMAL(5,2),
ADD COLUMN overall_confidence DECIMAL(5,2),
ADD COLUMN processing_method VARCHAR(50) DEFAULT 'textract';

-- Update processing_method for existing records (if any)
UPDATE documents 
SET processing_method = 'textract' 
WHERE processing_method IS NULL;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS documents_medical_data_idx ON documents USING GIN(medical_data);
CREATE INDEX IF NOT EXISTS documents_vision_confidence_idx ON documents(vision_confidence);
CREATE INDEX IF NOT EXISTS documents_overall_confidence_idx ON documents(overall_confidence);
CREATE INDEX IF NOT EXISTS documents_processing_method_idx ON documents(processing_method);

-- Add check constraint for valid processing methods
ALTER TABLE documents 
ADD CONSTRAINT documents_processing_method_check 
CHECK (processing_method IN ('textract', 'vision_plus_ocr', 'mock'));

-- Add comments for documentation
COMMENT ON COLUMN documents.medical_data IS 'Structured medical data extracted by AI vision analysis (JSON format)';
COMMENT ON COLUMN documents.vision_confidence IS 'Confidence score from AI vision analysis (0-100)';
COMMENT ON COLUMN documents.overall_confidence IS 'Combined confidence score from OCR and vision analysis (0-100)';
COMMENT ON COLUMN documents.processing_method IS 'Method used for document processing (textract, vision_plus_ocr, mock)';

-- Create function to extract specific medical data fields for easier querying
CREATE OR REPLACE FUNCTION extract_patient_name(medical_data JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN medical_data->'patientInfo'->>'name';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION extract_document_type(medical_data JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN medical_data->>'documentType';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add indexes on extracted fields for better query performance
CREATE INDEX IF NOT EXISTS documents_patient_name_idx ON documents(extract_patient_name(medical_data));
CREATE INDEX IF NOT EXISTS documents_document_type_idx ON documents(extract_document_type(medical_data));