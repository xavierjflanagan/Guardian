# ai_confidence_scoring Bridge Schema (Source) - Pass 1 Version - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/04_ai_processing.sql (ai_confidence_scoring table)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Pass 1 entity detection confidence metrics

## Multi-Pass Context:
- This is the Pass 1 CREATE version of ai_confidence_scoring
- Pass 1 version handles entity detection confidence scoring
- Pass 2 version may update or add clinical enrichment confidence metrics
- Critical for automated decision-making and manual review triggering

## Potential Issues:
- Complex confidence calculation methodology structure
- Missing required fields (entity_id, processing_session_id)
- Threshold comparison and decision support structure
- Data type mismatches for confidence score fields
- Missing database-specific fields for Pass 1 scoring
- Cross-validation metrics structure (AI-OCR agreement)
- Calibration and model performance tracking

TODO: Recreate this schema by reading the actual database table structure from 04_ai_processing.sql and focusing on CREATE operations for Pass 1 entity detection