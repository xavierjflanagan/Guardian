# shell_files Bridge Schema (Source) - Pass 2 Version - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (shell_files table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Multi-pass table for file processing status, referenced by patient_vitals

## Multi-Pass Context:
- This is the Pass 2 UPDATE version of shell_files
- Pass 1 version handles initial file upload and OCR processing
- Pass 2 version updates clinical enrichment status and completion metadata
- Foreign key referenced by patient_vitals.source_shell_file_id

## Potential Issues:
- Missing UPDATE-specific fields for Pass 2 operations
- Clinical enrichment status fields may not match database structure
- Progress tracking fields may have data type mismatches
- Missing database-specific fields for Pass 2 processing

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql and focusing on UPDATE operations for Pass 2 clinical enrichment