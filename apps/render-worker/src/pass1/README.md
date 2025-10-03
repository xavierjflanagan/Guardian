# Pass 1 Entity Detection Module

**Created:** October 3rd, 2025
**Status:** ✅ Implementation Complete - Ready for Testing
**Lines of Code:** ~1,820 lines

## Overview

Pass 1 is the first stage of the V3 AI processing pipeline. It uses GPT-4o Vision to detect and classify ALL entities in a medical document using a dual-input approach (vision + OCR cross-validation).

## Architecture

### Dual-Input Processing

**PRIMARY INPUT:** Raw document image (GPT-4o Vision analyzes visually)
**SECONDARY INPUT:** OCR spatial data (for cross-validation and spatial mapping)

This approach provides:
- Visual interpretation of formatting and context
- OCR spatial coordinates for click-to-zoom functionality
- Cross-validation between AI vision and OCR text
- Discrepancy detection and quality scoring

## Module Structure

```
pass1/
├── pass1-types.ts              # TypeScript interfaces (336 lines)
├── pass1-prompts.ts            # AI prompt templates (334 lines)
├── pass1-schema-mapping.ts     # Entity → Schema mappings (335 lines)
├── pass1-translation.ts        # AI → Database translation (362 lines)
├── Pass1EntityDetector.ts      # Main detector class (392 lines)
└── index.ts                    # Clean exports (61 lines)
```

## Three-Category Classification

### 1. Clinical Events
Full medical enrichment required (Pass 2 processing):
- vital_sign, lab_result, physical_finding, symptom
- medication, procedure, immunization
- diagnosis, allergy, healthcare_encounter

### 2. Healthcare Context
Limited enrichment (context and compliance):
- patient_identifier, provider_identifier, facility_identifier
- appointment, referral, care_coordination
- insurance_information, billing_code, authorization

### 3. Document Structure
Logging only (no medical enrichment):
- header, footer, logo, page_marker
- signature_line, watermark, form_structure

## Data Flow

```
1. Job Queue → Pass1Input
   ├─ Raw File (base64 image/PDF)
   └─ OCR Spatial Data

2. Pass1EntityDetector.processDocument()
   ├─ Validate input
   ├─ Call GPT-4o Vision (dual-input prompt)
   ├─ Parse AI response
   └─ Translate to database format

3. Database Insertion
   ├─ entity_processing_audit (all entities)
   └─ shell_files (update status to 'pass1_complete')

4. Pass 2 Queue
   └─ Entities with pass2_status = 'pending'
```

## Key Features

### Schema Mapping
Each entity subtype maps to required database schemas:
```typescript
vital_sign → ['patient_clinical_events', 'patient_observations', 'patient_vitals']
medication → ['patient_clinical_events', 'patient_interventions', 'patient_medications']
diagnosis → ['patient_clinical_events', 'patient_conditions']
```

### Processing Priority
- **highest**: Safety-critical (allergies, medications, diagnoses)
- **high**: Important clinical (vitals, labs, procedures)
- **medium**: Supporting clinical (symptoms, findings)
- **low**: Contextual (appointments, providers)
- **logging_only**: Document structure

### Translation Layer
Pure code function (no AI) that flattens nested AI JSON to database columns:
```typescript
AI: { visual_interpretation: { ai_sees: "BP 140/90" } }
DB: { ai_visual_interpretation: "BP 140/90" }
```

## Database Schema

All entities are written to `entity_processing_audit` with:
- Entity identity and classification
- Dual-input processing metadata
- OCR cross-reference data
- Discrepancy tracking
- Quality indicators
- Pass 2 coordination fields

## Cost Estimation

GPT-4o Vision Pricing (2025):
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens
- Image: ~$7.65 per 1M tokens (varies by size)

Estimated cost per document: $0.015 - $0.05 (depending on size/complexity)

## Usage Example

```typescript
import { Pass1EntityDetector, Pass1Input, Pass1Config } from './pass1';

const config: Pass1Config = {
  openai_api_key: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o',
  temperature: 0.1,
  max_tokens: 4000,
  confidence_threshold: 0.7,
};

const detector = new Pass1EntityDetector(config);

const input: Pass1Input = {
  shell_file_id: 'uuid',
  patient_id: 'uuid',
  processing_session_id: 'uuid',
  raw_file: {
    file_data: 'base64...',
    file_type: 'image/jpeg',
    filename: 'medical-record.jpg',
    file_size: 1024000,
  },
  ocr_spatial_data: {
    extracted_text: 'Blood Pressure: 140/90...',
    spatial_mapping: [...],
    ocr_confidence: 0.95,
    processing_time_ms: 1500,
    ocr_provider: 'google_vision',
  },
  document_metadata: {...},
};

const result = await detector.processDocument(input);

if (result.success) {
  console.log(`Detected ${result.total_entities_detected} entities`);
  console.log(`Pass 2 queue: ${result.pass2_entities_queued} entities`);
}
```

## Integration with Worker

Pass 1 is integrated into the render-worker job queue:

```typescript
// worker.ts handles 'pass1_entity_detection' jobs
case 'pass1_entity_detection':
  result = await this.processPass1EntityDetection(job);
  break;
```

Job payload must conform to `Pass1Input` interface.

## Testing Requirements

### Unit Tests Needed
- [ ] pass1-schema-mapping.ts (entity → schema mappings)
- [ ] pass1-translation.ts (AI → database translation)
- [ ] pass1-prompts.ts (prompt generation)

### Integration Tests Needed
- [ ] Pass1EntityDetector with mock OpenAI responses
- [ ] Database insertion with Supabase mock
- [ ] Worker job processing flow

### End-to-End Tests Needed
- [ ] Real medical document (sample PDF/image)
- [ ] Complete Pass 1 → database insertion
- [ ] Verify entity_processing_audit records
- [ ] Validate Pass 2 queue preparation

## Next Steps

1. **Testing** (Afternoon Session)
   - Create test suite with sample medical documents
   - Test Pass 1 end-to-end with real OpenAI API
   - Verify database record creation

2. **Validation**
   - Check entity classification accuracy
   - Validate dual-input cross-validation
   - Verify schema mappings are correct

3. **Pass 2 Preparation**
   - Ensure Pass 2 entities are properly queued
   - Verify requires_schemas field is accurate
   - Validate processing priority assignments

## Dependencies

```json
{
  "openai": "^4.x",
  "@supabase/supabase-js": "^2.x",
  "typescript": "^5.x"
}
```

## Environment Variables

```bash
OPENAI_API_KEY=sk-...           # Required for GPT-4o Vision
SUPABASE_URL=https://...        # Required for database
SUPABASE_SERVICE_ROLE_KEY=...  # Required for server-side operations
```

## Known Limitations

1. **File Size:** 10MB limit per document
2. **Token Usage:** Max 4000 completion tokens (configurable)
3. **Supported Formats:** image/* and application/pdf only
4. **Rate Limiting:** Subject to OpenAI API rate limits
5. **OCR Dependency:** Requires pre-processed OCR data

## Future Enhancements

- [ ] Batch processing for multiple documents
- [ ] Streaming responses for large documents
- [ ] Model fallback (GPT-4o → GPT-4o-mini)
- [ ] Custom confidence thresholds per entity type
- [ ] Multi-page document handling optimization
- [ ] Cost optimization strategies

## Support

For questions or issues:
1. Check PASS-1-ARCHITECTURE.md
2. Review PASS-1-WORKER-IMPLEMENTATION.md
3. See bridge schema documentation in `/bridge-schemas/`

---

**Built:** October 3rd, 2025
**Team:** Exora Health Pty Ltd
**Version:** 1.0.0
