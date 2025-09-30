# profile_appointments Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (profile_appointments table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Appointment scheduling and visit management

## Potential Issues:
- Appointment temporal data (date, time, duration)
- Appointment type and status classification
- Provider and facility information structure
- Missing required fields (profile_id, source_shell_file_id)
- Reminder and notification tracking
- Data type mismatches for temporal fields
- Missing database-specific fields for appointment management

TODO: Recreate this schema by reading the actual database table structure from 03_clinical_core.sql