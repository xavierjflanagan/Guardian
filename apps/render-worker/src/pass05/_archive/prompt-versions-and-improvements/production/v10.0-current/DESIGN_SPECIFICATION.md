# Pass 0.5 v10.0 Design Specification

## Universal Prompt Architecture

**Version:** 10.0
**Status:** Production
**Date:** 2025-11-12

## Executive Summary

v10.0 represents a fundamental redesign of the Pass 0.5 encounter discovery system, moving from a compositional approach (base + addons) to a universal prompt that natively handles both single-chunk and multi-chunk document processing.

## Problem Statement

The v2.9 + addons compositional approach failed because:
1. Addon instructions conflicted with base prompt instructions
2. AI models (particularly Gemini) ignored critical handoff fields
3. Result: Multi-chunk documents created duplicate encounters instead of continuous ones

## Solution: Universal Architecture

### Core Principle
One prompt for all document sizes with native progressive support:
- Small files (<100 pages): Process as single chunk, progressive fields ignored
- Large files (≥100 pages): Process in 50-page chunks with handoff via native fields

### Key Design Decisions

1. **Native Progressive Fields**
   - `status`: "complete" or "continuing"
   - `tempId`: Temporary ID for tracking across chunks
   - `expectedContinuation`: Hint about what comes next
   - These fields are ALWAYS in the schema, not conditionally added

2. **Post-Processor Safety Net**
   - Infers status from page boundaries if AI doesn't provide it
   - Validates handoff packages
   - Cleans up fields for single-chunk files

3. **Standardized Encounter Types**
   - All encounterType values use lowercase_underscore
   - Examples: emergency_department, hospital_admission, surgical_procedure
   - Ensures database compatibility

4. **Enhanced Citation Requirements**
   - Page assignments must include key phrases from actual page
   - Prevents hallucination of justifications
   - Improves debugging and accuracy

## Technical Architecture

### Prompt Structure
```
1. Chunk Context (if progressive mode)
2. Medical Encounter Discovery Task
3. Core Definitions
4. Timeline Test
5. Boundary Detection Rules
6. Encounter Types (standardized)
7. Metadata Extraction
8. Page Assignment Logic (with citations)
9. JSON Schema (with progressive fields)
10. Critical Field Specifications
11. Progressive Mode Handling
12. Special Instructions
```

### Data Flow
```
OCR Text → v10 Prompt → AI Model → JSON Response → Parser → Post-Processor → Database
```

### Key Components
- `aiPrompts.v10.ts`: Universal prompt builder
- `chunk-processor.ts`: Handles individual chunks
- `post-processor.ts`: Status inference and validation
- `session-manager.ts`: Orchestrates multi-chunk processing

## Improvements from v2.9

1. **Boundary Detection Rules**: Priority hierarchy for detecting encounter boundaries
2. **Confidence Calibration**: Four bands with specific criteria (0.9-1.0, 0.7-0.9, 0.5-0.7, <0.5)
3. **Date Clarification**: Clear rules for single-day vs multi-day vs ongoing encounters
4. **Status vs End Date**: Explicit distinction between real-world encounter end and documentation continuation

## Database Alignment

All fields map correctly to healthcare_encounters table:
- `encounter_type` (standardized values)
- `encounter_start_date`, `encounter_date_end`
- `encounter_timeframe_status`
- `pass_0_5_confidence`
- Additional extracted data (diagnoses, procedures) stored in summary/clinical_impression

## Performance Characteristics

- Token usage: ~3,500-4,000 for prompt (before OCR text)
- Max output: 32,768 tokens (progressive mode)
- Processing time: ~5-10 seconds per chunk
- Cost: ~$0.01-0.02 per chunk (Gemini 2.5 Flash)

## Success Metrics

1. **Handoff Success Rate**: >95% of multi-chunk encounters properly linked
2. **Duplicate Prevention**: <5% duplicate encounters across chunks
3. **Confidence Accuracy**: Average confidence >0.75
4. **Page Assignment Coverage**: 100% of pages assigned

## Known Limitations

1. Cannot detect encounters that start/end mid-page (requires bbox data)
2. Relies on AI following schema (post-processor mitigates)
3. Large documents still require multiple API calls