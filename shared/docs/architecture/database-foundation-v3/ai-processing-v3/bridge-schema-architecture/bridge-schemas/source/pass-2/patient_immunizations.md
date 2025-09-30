# patient_immunizations Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (patient_immunizations table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Vaccination records with healthcare standards integration

## Potential Issues:
- Complex vaccination scheduling and tracking
- Healthcare standards compliance (CDC, WHO vaccination codes)
- Missing required fields (patient_id, source_shell_file_id)
- Vaccination series tracking and booster requirements
- Data type mismatches for vaccination dates and intervals
- Missing database-specific fields for immunization management

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql