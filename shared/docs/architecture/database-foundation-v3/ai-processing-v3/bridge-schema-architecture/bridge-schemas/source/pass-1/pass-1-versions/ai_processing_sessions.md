# ai_processing_sessions Bridge Schema (Source) - Pass 1 Version - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (ai_processing_sessions table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Pass 1 session initialization and coordination

## Multi-Pass Context:
- This is the Pass 1 CREATE version of ai_processing_sessions
- Pass 1 version handles session initialization and entity detection tracking
- Pass 2 version will UPDATE with clinical enrichment status
- Critical for coordinating multi-pass processing workflow

## Potential Issues:
- Session initialization and status tracking structure
- Missing required fields (shell_file_id, patient_id)
- Pass 1 progress and entity detection tracking
- Data type mismatches for temporal and metric fields
- Missing database-specific fields for session management
- Resource allocation and token budget tracking
- Pass 2 readiness assessment structure

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql and focusing on CREATE operations for Pass 1 session initialization