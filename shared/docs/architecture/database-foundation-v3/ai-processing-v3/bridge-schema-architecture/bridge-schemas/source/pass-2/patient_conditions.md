# patient_conditions Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (patient_conditions table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Medical diagnoses and condition status tracking

## Potential Issues:
- Complex condition classification and status tracking
- Medical coding systems (ICD-10, SNOMED) integration
- Missing required fields (patient_id, source_shell_file_id)
- Condition severity, status, and progression tracking fields
- Data type mismatches for date fields (onset, diagnosis, resolution)
- Missing database-specific fields for condition management

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql