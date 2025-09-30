# entity_processing_audit Bridge Schema (Source) - Pass 1 Version - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (entity_processing_audit table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Complete audit trail foundation for entity detection

## Multi-Pass Context:
- This is the Pass 1 CREATE version of entity_processing_audit
- Pass 1 version handles entity detection and audit record creation
- Pass 2 version will UPDATE with clinical enrichment results
- Critical for maintaining complete audit trail and compliance

## Potential Issues:
- Complex entity detection and classification structure
- Missing required fields (entity_id, processing_session_id, shell_file_id, patient_id)
- Spatial mapping and coordinate tracking structure
- Data type mismatches for confidence and validation fields
- Missing database-specific fields for Pass 1 audit tracking
- Cross-validation (AI-OCR) metadata structure
- Schema requirements and priority assignment for Pass 2

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql and focusing on CREATE operations for Pass 1 entity detection audit