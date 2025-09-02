-- Update documents table to support quality flag tracking
-- Date: 2025-07-31

-- Add quality flag tracking columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_flags_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS has_critical_flags BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_flag_ids UUID[] DEFAULT NULL;

-- Update status enum to include quality flag states
-- Note: This would need to be adjusted based on existing status values
-- For now, document status will support: uploaded, processing, completed, flagged_critical, flagged_review, failed

-- Add indexes for quality flag queries
CREATE INDEX IF NOT EXISTS idx_documents_quality_flags_count ON documents(quality_flags_count);
CREATE INDEX IF NOT EXISTS idx_documents_has_critical_flags ON documents(has_critical_flags);
CREATE INDEX IF NOT EXISTS idx_documents_status_quality ON documents(status, has_critical_flags);

-- Add comments for documentation
COMMENT ON COLUMN documents.quality_flags_count IS 'Number of data quality flags associated with this document';
COMMENT ON COLUMN documents.has_critical_flags IS 'Whether this document has any critical quality flags that block processing';
COMMENT ON COLUMN documents.quality_flag_ids IS 'Array of quality flag IDs associated with this document';