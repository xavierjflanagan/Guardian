# shell_files Bridge Schema (Source) - Pass 1 Version - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (shell_files table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Multi-pass document container, foreign key referenced by patient_vitals

## Multi-Pass Context:
- This is the Pass 1 CREATE version of shell_files
- Pass 1 version handles file upload, OCR processing, and entity detection metadata
- Pass 2 version will UPDATE with clinical enrichment completion status
- Foreign key referenced by patient_vitals.source_shell_file_id

## Potential Issues:
- Complex multi-pass status tracking structure
- Missing required fields (shell_file_id, patient_id, filename)
- OCR processing results and spatial mapping structure
- Data type mismatches for temporal and metric fields
- Missing database-specific fields for file management
- Entity detection summary and Pass 2 preparation structure
- Document analysis and quality assessment fields

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql and focusing on CREATE operations for Pass 1 file processing