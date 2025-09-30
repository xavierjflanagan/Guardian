# patient_medications Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (patient_medications table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Prescription management and medication tracking

## Potential Issues:
- Complex medication data structure (dosage, frequency, duration)
- Likely JSONB fields for flexible medication information
- Missing required fields (patient_id, source_shell_file_id)
- Medication coding and classification system needs proper mapping
- Data type mismatches for dosage/frequency fields
- Missing database-specific fields for prescription management

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql