-- Add medical data storage fields to documents table
-- This enables storing structured AI extraction results

BEGIN;

-- Add new columns for AI processing results
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS medical_data JSONB,
ADD COLUMN IF NOT EXISTS vision_confidence DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS processing_method VARCHAR(50) DEFAULT 'vision_plus_ocr';

-- Update processing_method for existing records
UPDATE documents 
SET processing_method = 'vision_plus_ocr' 
WHERE processing_method IS NULL;

-- Add index for efficient JSONB querying
CREATE INDEX IF NOT EXISTS documents_medical_data_gin_idx ON documents USING GIN(medical_data);

-- Add comments for documentation
COMMENT ON COLUMN documents.medical_data IS 'Structured medical data extracted by AI vision analysis (JSON format)';
COMMENT ON COLUMN documents.vision_confidence IS 'Confidence score from AI vision analysis (0-100)';
COMMENT ON COLUMN documents.processing_method IS 'Method used for document processing (vision_plus_ocr, textract, etc.)';

COMMIT;