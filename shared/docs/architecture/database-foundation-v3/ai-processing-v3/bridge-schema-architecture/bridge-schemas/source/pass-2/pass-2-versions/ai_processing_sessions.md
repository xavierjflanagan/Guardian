# ai_processing_sessions Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (ai_processing_sessions table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Session management for three-pass AI processing pipeline

## Potential Issues:
- Complex session status tracking across three passes
- Missing required fields (profile_id, shell_file_id relationships)
- Session timing and duration tracking structure
- Data type mismatches for temporal and metric fields
- Missing database-specific fields for session management
- Cost and token usage tracking structure
- Error handling and recovery tracking

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql