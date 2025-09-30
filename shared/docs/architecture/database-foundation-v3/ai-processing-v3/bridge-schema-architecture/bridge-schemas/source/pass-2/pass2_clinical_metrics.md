# pass2_clinical_metrics Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (pass2_clinical_metrics table)
**Last Updated:** 30 September 2025
**Priority:** MEDIUM - Pass 2 AI processing quality metrics

## Potential Issues:
- Metrics tracking for AI extraction quality
- Missing required fields (shell_file_id)
- Confidence scoring and validation tracking
- Data type mismatches for metric fields
- Missing database-specific fields for AI processing metrics
- Entity extraction counts and success rates

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql