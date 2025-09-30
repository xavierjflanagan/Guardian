# manual_review_queue Bridge Schema (Source) - Pass 1 Version - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (manual_review_queue table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Human review queue for Pass 1 low-confidence entity detection

## Multi-Pass Context:
- This is the Pass 1 CREATE version of manual_review_queue
- Pass 1 version handles entity detection uncertainty and AI-OCR discrepancies
- Pass 2 version may add clinical enrichment review requirements
- Critical for patient safety and contamination prevention

## Potential Issues:
- Complex review type and priority classification structure
- Missing required fields (entity_id, shell_file_id, processing_session_id, patient_id)
- AI-OCR discrepancy tracking structure
- Data type mismatches for confidence and severity fields
- Missing database-specific fields for queue management
- Review assignment and resolution tracking
- Pass 1 blocking and completion gate structure

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql and focusing on CREATE operations for Pass 1 manual review queue