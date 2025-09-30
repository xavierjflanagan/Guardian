# manual_review_queue Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (manual_review_queue table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Human-in-the-loop validation for safety-critical decisions

## Potential Issues:
- Complex review priority and urgency classification
- Missing required fields (profile_id, shell_file_id, entity references)
- Review status and assignment tracking structure
- Data type mismatches for priority and confidence fields
- Missing database-specific fields for queue management
- Escalation tracking and resolution recording
- Clinical impact assessment structure

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql