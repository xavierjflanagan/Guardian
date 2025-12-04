# pass2_clinical_metrics Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** REMOVE
**Step A Rationale:** Infrastructure/metrics table for tracking Pass 2 processing performance. NOT a clinical entity table - does not store data extracted from medical documents. Server populates this table with processing metrics (tokens, time, confidence), not AI extraction output.
**Step B Sync:** N/A - No bridge schema needed
**Step C Columns:** N/A - No bridge schema needed
**Step D Temporal:** N/A - Infrastructure table
**Last Triage Update:** 2025-12-04
**Original Created:** 1 October 2025

---

## Triage Summary

### What This Table IS For
- **Processing metrics** - Token counts, processing time, cost tracking
- **Quality metrics** - Average confidence, validation failures, manual review counts
- **Bridge schema performance** - Which schemas were used, loading times
- **Audit trail** - IP address, user agent for compliance

### What This Table is NOT For
- **NOT a Pass 2 output target** - This table is populated by the worker infrastructure
- **NOT clinical data** - Does not store any patient health information
- **NOT extracted from documents** - Metrics are computed by the system

### Why REMOVE from Bridge Schema Triage

This table does NOT need a bridge schema because:

1. **Not AI-generated content**: The Pass 2 worker writes metrics AFTER processing, not as part of AI extraction
2. **Infrastructure concern**: Similar to `pass1_entity_metrics` - server-side instrumentation
3. **No token optimization needed**: No AI output is involved

### How This Table Gets Populated

```typescript
// After Pass 2 AI extraction completes, worker writes metrics:
await supabase.from('pass2_clinical_metrics').insert({
  profile_id: context.profileId,
  shell_file_id: context.shellFileId,
  processing_session_id: context.sessionId,
  clinical_entities_enriched: results.length,
  schemas_populated: ['patient_conditions', 'patient_medications'],
  clinical_model_used: 'gpt-4o-mini',
  average_clinical_confidence: calculateAverageConfidence(results),
  processing_time_ms: endTime - startTime,
  input_tokens: response.usage.prompt_tokens,
  output_tokens: response.usage.completion_tokens,
  total_tokens: response.usage.total_tokens
});
```

---

**Database Source:** /current_schema/08_job_coordination.sql (lines 1139-1172)
**Priority:** N/A - Infrastructure table, not a Pass 2 extraction target

## Database Table Structure

```sql
-- Pass 2 clinical entity extraction metrics and quality tracking
CREATE TABLE IF NOT EXISTS pass2_clinical_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 2 Specific Metrics
    clinical_entities_enriched INTEGER NOT NULL,
    schemas_populated TEXT[] NOT NULL, -- ['patient_conditions', 'patient_medications']
    clinical_model_used TEXT NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    processing_time_minutes NUMERIC(10,2) NOT NULL GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED,

    -- Quality Metrics
    average_clinical_confidence NUMERIC(4,3),
    manual_review_triggered_count INTEGER DEFAULT 0,
    validation_failures INTEGER DEFAULT 0,

    -- Bridge Schema Performance
    bridge_schemas_used TEXT[],
    schema_loading_time_ms INTEGER,

    -- Token Breakdown (for accurate cost calculation)
    input_tokens INTEGER,       -- prompt_tokens from OpenAI API
    output_tokens INTEGER,      -- completion_tokens from OpenAI API
    total_tokens INTEGER,       -- sum of input + output

    -- Metadata
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## AI Extraction Requirements for Pass 2

This table tracks metrics and performance data for Pass 2 clinical entity extraction. It is populated by the AI processing system itself, NOT extracted from medical documents.

### Required Fields

```typescript
interface Pass2ClinicalMetricsExtraction {
  // REQUIRED FIELDS
  profile_id: string;                      // UUID - from processing context
  shell_file_id: string;                   // UUID - source document being processed
  processing_session_id: string;           // UUID - references ai_processing_sessions
  clinical_entities_enriched: number;      // Count of clinical entities extracted
  schemas_populated: string[];             // Array of table names populated (TEXT[])
  clinical_model_used: string;             // AI model name/version used
  processing_time_ms: number;              // Processing duration in milliseconds
  processing_time_minutes: number;         // Processing duration in minutes (auto-calculated from processing_time_ms)

  // QUALITY METRICS (OPTIONAL)
  average_clinical_confidence?: number;    // NUMERIC(4,3) - average confidence across all extractions
  manual_review_triggered_count?: number;  // Count of entities flagged for review, default: 0
  validation_failures?: number;            // Count of validation failures, default: 0

  // BRIDGE SCHEMA PERFORMANCE (OPTIONAL)
  bridge_schemas_used?: string[];          // Array of bridge schema names used (TEXT[])
  schema_loading_time_ms?: number;         // Time to load bridge schemas

  // TOKEN BREAKDOWN (OPTIONAL) - For accurate cost calculation
  input_tokens?: number;                   // Input tokens from OpenAI prompt_tokens
  output_tokens?: number;                  // Output tokens from OpenAI completion_tokens
  total_tokens?: number;                   // Sum of input + output from OpenAI total_tokens

  // METADATA (OPTIONAL)
  user_agent?: string;                     // User agent string
  ip_address?: string;                     // IP address (INET type)
}
```

## Example Extractions

### Example 1: Successful Pass 2 Processing
```json
{
  "profile_id": "uuid-from-context",
  "shell_file_id": "uuid-of-processed-document",
  "processing_session_id": "uuid-of-ai-session",
  "clinical_entities_enriched": 15,
  "schemas_populated": ["patient_conditions", "patient_medications", "patient_observations"],
  "clinical_model_used": "gpt-4o-mini",
  "average_clinical_confidence": 0.920,
  "manual_review_triggered_count": 2,
  "validation_failures": 0,
  "bridge_schemas_used": ["patient_conditions_detailed", "patient_medications_detailed", "patient_observations_minimal"],
  "schema_loading_time_ms": 45,
  "clinical_tokens_used": 3500,
  "processing_time_ms": 2100,
  "cost_usd": 0.0042
}
```

### Example 2: Processing with Validation Issues
```json
{
  "profile_id": "uuid-from-context",
  "shell_file_id": "uuid-of-processed-document",
  "processing_session_id": "uuid-of-ai-session",
  "clinical_entities_enriched": 8,
  "schemas_populated": ["patient_allergies", "patient_immunizations"],
  "clinical_model_used": "gpt-4o-mini",
  "average_clinical_confidence": 0.785,
  "manual_review_triggered_count": 3,
  "validation_failures": 2,
  "bridge_schemas_used": ["patient_allergies_detailed", "patient_immunizations_detailed"],
  "schema_loading_time_ms": 38,
  "clinical_tokens_used": 2800,
  "processing_time_ms": 1800,
  "cost_usd": 0.0034
}
```

### Example 3: High-Quality Extraction
```json
{
  "profile_id": "uuid-from-context",
  "shell_file_id": "uuid-of-processed-document",
  "processing_session_id": "uuid-of-ai-session",
  "clinical_entities_enriched": 22,
  "schemas_populated": ["patient_conditions", "patient_medications", "patient_observations", "patient_interventions", "patient_vitals"],
  "clinical_model_used": "gpt-4o",
  "average_clinical_confidence": 0.955,
  "manual_review_triggered_count": 0,
  "validation_failures": 0,
  "bridge_schemas_used": ["patient_conditions_detailed", "patient_medications_detailed", "patient_observations_detailed", "patient_interventions_detailed", "patient_vitals_minimal"],
  "schema_loading_time_ms": 52,
  "clinical_tokens_used": 5200,
  "processing_time_ms": 3400,
  "cost_usd": 0.0156
}
```

## Critical Notes

1. **System-Generated Metrics**: This table is populated by the AI processing system, NOT extracted from medical documents. It tracks the performance and quality of the Pass 2 extraction process itself.

2. **Required Fields**: 8 NOT NULL fields (7 user-provided + 1 auto-calculated): profile_id, shell_file_id, processing_session_id, clinical_entities_enriched, schemas_populated, clinical_model_used, processing_time_ms, processing_time_minutes (auto-calculated).

3. **TEXT[] Arrays**:
   - `schemas_populated`: Array of table names that were populated (e.g., ['patient_conditions', 'patient_medications'])
   - `bridge_schemas_used`: Array of bridge schema names used (e.g., ['patient_conditions_detailed', 'patient_medications_minimal'])

4. **Numeric Precision**:
   - `average_clinical_confidence`: NUMERIC(4,3) - 0.000-1.000 range with 3 decimal places
   - `cost_usd`: NUMERIC(8,4) - up to $9,999.9999 with 4 decimal places

5. **Integer Defaults**:
   - `manual_review_triggered_count`: Defaults to 0
   - `validation_failures`: Defaults to 0

6. **INET Type**: `ip_address` uses PostgreSQL INET type for IP address storage (supports both IPv4 and IPv6).

7. **Foreign Key Cascade**: All FK references use ON DELETE CASCADE - if parent record is deleted, metrics are automatically deleted.

8. **Processing Session Reference**: `processing_session_id` references `ai_processing_sessions` table, creating traceability for AI processing runs.

9. **Bridge Schema Performance**: `bridge_schemas_used` and `schema_loading_time_ms` track which bridge schemas were used and how long they took to load.

10. **Quality vs Performance Trade-off**: Higher `average_clinical_confidence` with lower `validation_failures` indicates better quality extraction, but may come at cost of higher `processing_time_ms` and `cost_usd`.

## Schema Validation Checklist

- [ ] `profile_id` is a valid UUID (from context, NOT NULL)
- [ ] `shell_file_id` is a valid UUID (from context, NOT NULL)
- [ ] `processing_session_id` is a valid UUID (from context, NOT NULL)
- [ ] `clinical_entities_enriched` is a non-negative integer (NOT NULL)
- [ ] `schemas_populated` is a valid TEXT[] array with at least one table name (NOT NULL)
- [ ] `clinical_model_used` is provided (NOT NULL)
- [ ] `processing_time_ms` is a non-negative integer (NOT NULL)
- [ ] `processing_time_minutes` is auto-calculated from processing_time_ms (NOT NULL, GENERATED)
- [ ] `average_clinical_confidence` (if provided) is between 0.000 and 1.000
- [ ] `cost_usd` (if provided) is a non-negative number with max 4 decimal places
- [ ] `bridge_schemas_used` (if provided) is a valid TEXT[] array
- [ ] `ip_address` (if provided) is valid IPv4 or IPv6 format

## Database Constraint Notes

- **NO patient_id or event_id**: Uses profile_id to reference user_profiles(id)
- **NOT NULL constraints**: profile_id, shell_file_id, processing_session_id, clinical_entities_enriched, schemas_populated, clinical_model_used, processing_time_ms, processing_time_minutes (generated)
- **Integer defaults**: manual_review_triggered_count defaults to 0, validation_failures defaults to 0
- **TEXT[] arrays**: schemas_populated (NOT NULL), bridge_schemas_used (optional)
- **NUMERIC precision**: average_clinical_confidence uses (4,3), cost_usd uses (8,4)
- **FK references with CASCADE**: All FKs use ON DELETE CASCADE
- **INET type**: ip_address supports both IPv4 and IPv6 addresses
- **TIMESTAMPTZ default**: created_at defaults to NOW()
- **NO CHECK constraints**: No enum-style CHECK constraints on this table
