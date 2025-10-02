# pass1_entity_metrics Bridge Schema (Source) - Pass 1

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/08_job_coordination.sql (lines 219-245)
**Last Updated:** 1 October 2025
**Priority:** MEDIUM - Pass 1 entity detection quality and performance metrics

## Database Table Structure

```sql
-- Pass 1 entity detection metrics and quality tracking
CREATE TABLE IF NOT EXISTS pass1_entity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 1 Specific Metrics
    entities_detected INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    vision_model_used TEXT NOT NULL,
    ocr_model_used TEXT,

    -- Quality Metrics
    ocr_agreement_average NUMERIC(4,3),
    confidence_distribution JSONB, -- { "high": 15, "medium": 8, "low": 2 }
    entity_types_found TEXT[], -- ['medication', 'condition', 'vital_sign']

    -- Cost and Performance
    vision_tokens_used INTEGER,
    ocr_pages_processed INTEGER,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## AI Extraction Requirements for Pass 1

This table tracks metrics and performance data for Pass 1 entity detection. It is populated by the AI processing system itself, NOT extracted from medical documents.

### Required Fields

```typescript
interface Pass1EntityMetricsExtraction {
  // REQUIRED FIELDS
  profile_id: string;                      // UUID - from processing context
  shell_file_id: string;                   // UUID - source document being processed
  processing_session_id: string;           // UUID - references ai_processing_sessions (cross-pass join key)
  entities_detected: number;               // Count of entities detected in Pass 1
  processing_time_ms: number;              // Processing duration in milliseconds
  vision_model_used: string;               // Vision AI model name/version used

  // PASS 1 SPECIFIC (OPTIONAL)
  ocr_model_used?: string;                 // OCR model name/version used (if applicable)

  // QUALITY METRICS (OPTIONAL)
  ocr_agreement_average?: number;          // NUMERIC(4,3) - average agreement between vision and OCR
  confidence_distribution?: object;        // JSONB - distribution of confidence levels
  entity_types_found?: string[];           // Array of entity type categories detected (TEXT[])

  // COST AND PERFORMANCE (OPTIONAL)
  vision_tokens_used?: number;             // Tokens consumed by vision model
  ocr_pages_processed?: number;            // Number of pages processed by OCR
  cost_usd?: number;                       // NUMERIC(8,4) - processing cost in USD

  // METADATA (OPTIONAL)
  user_agent?: string;                     // User agent string
  ip_address?: string;                     // IP address (INET type)
}
```

## Example Extractions

### Example 1: Vision-Only Pass 1 Processing
```json
{
  "profile_id": "uuid-from-context",
  "shell_file_id": "uuid-of-processed-document",
  "processing_session_id": "uuid-of-ai-session",
  "entities_detected": 25,
  "processing_time_ms": 1800,
  "vision_model_used": "gpt-4o",
  "ocr_agreement_average": 0.920,
  "confidence_distribution": {
    "high": 18,
    "medium": 5,
    "low": 2
  },
  "entity_types_found": ["medication", "condition", "vital_sign", "observation"],
  "vision_tokens_used": 2500,
  "cost_usd": 0.0075
}
```

### Example 2: Vision + OCR Pass 1 Processing
```json
{
  "profile_id": "uuid-from-context",
  "shell_file_id": "uuid-of-processed-document",
  "processing_session_id": "uuid-of-ai-session",
  "entities_detected": 32,
  "processing_time_ms": 2400,
  "vision_model_used": "gpt-4o",
  "ocr_model_used": "google-cloud-vision",
  "ocr_agreement_average": 0.885,
  "confidence_distribution": {
    "high": 22,
    "medium": 8,
    "low": 2
  },
  "entity_types_found": ["medication", "condition", "vital_sign", "observation", "allergy"],
  "vision_tokens_used": 3200,
  "ocr_pages_processed": 4,
  "cost_usd": 0.0096
}
```

### Example 3: Low Entity Detection
```json
{
  "profile_id": "uuid-from-context",
  "shell_file_id": "uuid-of-processed-document",
  "processing_session_id": "uuid-of-ai-session",
  "entities_detected": 8,
  "processing_time_ms": 1200,
  "vision_model_used": "gpt-4o-mini",
  "ocr_model_used": "google-cloud-vision",
  "ocr_agreement_average": 0.750,
  "confidence_distribution": {
    "high": 3,
    "medium": 3,
    "low": 2
  },
  "entity_types_found": ["medication", "condition"],
  "vision_tokens_used": 1800,
  "ocr_pages_processed": 2,
  "cost_usd": 0.0036
}
```

## Critical Notes

1. **System-Generated Metrics**: This table is populated by the AI processing system, NOT extracted from medical documents. It tracks the performance and quality of the Pass 1 entity detection process itself.

2. **Cross-Pass Consistency**: Mirrors Pass 2 structure with consistent field names and precisions. Use `processing_session_id` as PRIMARY cross-pass join key for rollup analytics.

3. **Required Fields**: 6 NOT NULL fields without defaults: profile_id, shell_file_id, processing_session_id, entities_detected, processing_time_ms, vision_model_used.

4. **Pass-Specific Naming**: `entities_detected` (Pass 1) vs `clinical_entities_enriched` (Pass 2) - both represent entity counts but at different pipeline stages.

5. **Numeric Precision**:
   - `ocr_agreement_average`: NUMERIC(4,3) - 0.000-1.000 range with 3 decimal places (matches Pass 2 average_clinical_confidence)
   - `cost_usd`: NUMERIC(8,4) - up to $9,999.9999 with 4 decimal places (matches Pass 2)

6. **JSONB Field**: `confidence_distribution` is JSONB object with flexible structure (e.g., `{"high": 15, "medium": 8, "low": 2}`).

7. **TEXT[] Array**: `entity_types_found` is PostgreSQL TEXT[] array containing entity type categories detected in Pass 1.

8. **OCR Optional**: `ocr_model_used` is optional - vision-only processing may not use OCR.

9. **Foreign Key Cascade**: All FK references use ON DELETE CASCADE - if parent record is deleted, metrics are automatically deleted.

10. **Processing Session Reference**: `processing_session_id` references `ai_processing_sessions` table, creating traceability across all processing passes.

11. **INET Type**: `ip_address` uses PostgreSQL INET type for IP address storage (supports both IPv4 and IPv6).

12. **Interoperability with Pass 2/3**: Use same keys (profile_id, shell_file_id, processing_session_id) and datatypes (processing_time_ms INTEGER, cost_usd NUMERIC(8,4)) for cross-pass aggregation.

## Schema Validation Checklist

- [ ] `profile_id` is a valid UUID (from context, NOT NULL)
- [ ] `shell_file_id` is a valid UUID (from context, NOT NULL)
- [ ] `processing_session_id` is a valid UUID (from context, NOT NULL)
- [ ] `entities_detected` is a non-negative integer (NOT NULL)
- [ ] `processing_time_ms` is a non-negative integer (NOT NULL)
- [ ] `vision_model_used` is provided (NOT NULL)
- [ ] `ocr_agreement_average` (if provided) is between 0.000 and 1.000
- [ ] `confidence_distribution` (if provided) is valid JSONB object
- [ ] `entity_types_found` (if provided) is a valid TEXT[] array
- [ ] `vision_tokens_used` (if provided) is a non-negative integer
- [ ] `ocr_pages_processed` (if provided) is a non-negative integer
- [ ] `cost_usd` (if provided) is a non-negative number with max 4 decimal places
- [ ] `ip_address` (if provided) is valid IPv4 or IPv6 format

## Database Constraint Notes

- **NO patient_id or event_id**: Uses profile_id to reference user_profiles(id)
- **NOT NULL constraints**: profile_id, shell_file_id, processing_session_id, entities_detected, processing_time_ms, vision_model_used
- **Optional fields**: ocr_model_used, ocr_agreement_average, confidence_distribution, entity_types_found, vision_tokens_used, ocr_pages_processed, cost_usd, user_agent, ip_address
- **TEXT[] array**: entity_types_found (optional)
- **JSONB object**: confidence_distribution (optional)
- **NUMERIC precision**: ocr_agreement_average uses (4,3), cost_usd uses (8,4)
- **FK references with CASCADE**: All FKs use ON DELETE CASCADE
- **INET type**: ip_address supports both IPv4 and IPv6 addresses
- **TIMESTAMPTZ default**: created_at defaults to NOW()
- **NO CHECK constraints**: No enum-style CHECK constraints on this table

## Cross-Pass Interoperability Notes

**GPT-5 Recommendations Applied:**

1. **Consistent Keys**: Uses same keys as Pass 2 (profile_id, shell_file_id, processing_session_id) with identical datatypes.

2. **Consistent Field Naming**:
   - Pass 1: `entities_detected` INTEGER NOT NULL
   - Pass 2: `clinical_entities_enriched` INTEGER NOT NULL
   - Pass 3: (planned) `narratives_generated` INTEGER NOT NULL

3. **Consistent Cost/Performance Fields**:
   - `processing_time_ms` INTEGER (same across all passes)
   - `cost_usd` NUMERIC(8,4) (same across all passes)
   - Token fields: `vision_tokens_used` (Pass 1) vs `clinical_tokens_used` (Pass 2)

4. **Primary Join Key**: `processing_session_id` is the PRIMARY cross-pass join key for aggregation and rollup analytics.

5. **Summary Layer Integration**: Designed for aggregation into materialized view per processing_session_id and per profile_id.

6. **Analytics Indexes**: Database creates indexes on profile_id, shell_file_id, and processing_session_id for efficient joins. Consider adding GIN index on entity_types_found array for filtering: `CREATE INDEX idx_entity_types_found ON pass1_entity_metrics USING GIN(entity_types_found);`
