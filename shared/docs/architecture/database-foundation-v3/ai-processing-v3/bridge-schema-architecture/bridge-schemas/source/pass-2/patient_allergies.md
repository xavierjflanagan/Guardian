# patient_allergies Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (patient_allergies table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Safety-critical allergy and adverse reaction records

## Potential Issues:
- Critical safety data requiring precise allergy classification
- Allergy severity and reaction type tracking
- Missing required fields (patient_id, source_shell_file_id)
- Allergen coding and standardization requirements
- Data type mismatches for reaction severity and onset timing
- Missing database-specific fields for allergy management

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql