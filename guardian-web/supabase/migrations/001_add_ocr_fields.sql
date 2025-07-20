-- Add OCR processing fields to documents table
-- This migration adds support for storing OCR extraction results and error handling

-- Add OCR result fields
ALTER TABLE documents 
ADD COLUMN extracted_text TEXT,
ADD COLUMN ocr_confidence DECIMAL(5,2),
ADD COLUMN processed_at TIMESTAMPTZ,
ADD COLUMN error_log TEXT;

-- Update status column to include 'failed' state
-- First check if status column has constraints
ALTER TABLE documents 
DROP CONSTRAINT IF EXISTS documents_status_check;

-- Add new check constraint with 'failed' status
ALTER TABLE documents 
ADD CONSTRAINT documents_status_check 
CHECK (status IN ('uploaded', 'processing', 'completed', 'failed'));

-- Add indexes for efficient querying (if not exists)
CREATE INDEX IF NOT EXISTS documents_processed_at_idx ON documents(processed_at);
CREATE INDEX IF NOT EXISTS documents_ocr_confidence_idx ON documents(ocr_confidence);
CREATE INDEX IF NOT EXISTS documents_error_log_idx ON documents(error_log) WHERE error_log IS NOT NULL;

-- Update RLS policies to include new fields (if needed)
-- The existing policy "user can read own docs" will automatically cover new fields

-- Add comment for documentation
COMMENT ON COLUMN documents.extracted_text IS 'OCR extracted text from document processing';
COMMENT ON COLUMN documents.ocr_confidence IS 'Average confidence score from OCR processing (0-100)';
COMMENT ON COLUMN documents.processed_at IS 'Timestamp when document processing completed';
COMMENT ON COLUMN documents.error_log IS 'Error details when processing fails';