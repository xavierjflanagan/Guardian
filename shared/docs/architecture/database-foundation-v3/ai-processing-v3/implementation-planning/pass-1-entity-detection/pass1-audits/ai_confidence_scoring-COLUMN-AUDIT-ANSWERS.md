# AI Confidence Scoring Table - Comprehensive Audit

**Audit Date:** 2025-10-09
**Table Status:** EMPTY (0 records) - Schema-Worker Mismatch Prevents Population
**Database Source:** `04_ai_processing.sql` (lines 385-424)
**Bridge Schema:** `bridge-schemas/source/pass-1/pass-1-versions/ai_confidence_scoring.md`

---

## Table Purpose

The `ai_confidence_scoring` table provides **granular quality metrics and model performance tracking** for AI entity detection and clinical enrichment processes. It enables:

1. **Automated Quality Assurance** - Confidence thresholds trigger manual review workflows
2. **Model Performance Monitoring** - Track processing time, calibration, and model drift over time
3. **Quality Dashboards** - Visualize confidence trends, outlier detection patterns
4. **Human-AI Agreement Analysis** - Compare model predictions against human validation
5. **Session vs Entity Granularity** - Track overall document quality or individual entity confidence

**Design Philosophy:** Rich confidence decomposition (vision, language, classification models) enables sophisticated quality analysis rather than simple pass/fail binary decisions.

---

## Multi-Pass Architecture Context

### Why This Table Exists Across Multiple Passes

The `ai_confidence_scoring` table tracks **Pass 1 entity detection quality** with optional Pass 2 clinical coding metrics. Understanding this requires understanding the Pass 1 → Pass 2 relationship:

**Pass 1: Entity Detection (Locator Layer)**
- Identifies WHERE medical entities appear in documents
- Provides location_context, ocr bounding boxes, bridge-schema recommendations
- Performs embedding matching for medical code assignment prep
- **Pass 1 entities = "Locators"** maintained for auditing, not clinical use

**Pass 2: Clinical Enrichment (Creates New Superior Entities)**
- Uses Pass 1's location data (location_context + bbox) to find entities
- Creates ENTIRELY NEW enriched entities with superior organization (user-facing data)
- Pass 1 entities remain unchanged ("trash pile" kept for posterity, not user-facing)
- No re-detection occurs - Pass 2 leverages Pass 1's spatial findings

**How This Table Fits:**

**Pass 1 Actions:**
- CREATES confidence record for each low-confidence entity (< 0.8)
- Populates entity detection metrics: vision_model_confidence, text_extraction_confidence, spatial_alignment_confidence
- Sets composite scores: overall_confidence, reliability_score, clinical_relevance_score
- **Primary purpose:** Track quality of Pass 1's entity detection/location work

**Pass 2 Actions:**
- OPTIONALLY UPDATES existing confidence records (does NOT create new records)
- ONLY adds clinical_coding_confidence field (single field update)
- **Why so minimal?** Pass 2's main work (creating enriched entities) happens in other tables. This table remains focused on Pass 1 detection quality.

**Pass 3 Actions:**
- Does NOT interact with this table
- Narrative quality tracked separately

### Current Implementation Status

**Pass 1:** Implemented (but schema-worker mismatch prevents insertion)
**Pass 2:** NOT YET IMPLEMENTED (worker code doesn't exist)
**Pass 3:** Not applicable

**Key Insight:** The table's multi-pass design is **forward-thinking architecture** - it anticipates Pass 2 updates even though Pass 2 isn't built yet. This explains why the schema has fields like `clinical_coding_confidence` that no current code populates.

---

## Column-by-Column Analysis

### Primary Keys and References

#### 1. `id` (UUID, PRIMARY KEY, NOT NULL)
- **Purpose:** Unique identifier for each confidence scoring record
- **Populated By:** System (PostgreSQL UUID generation)
- **AI Involvement:** None (database auto-generated)
- **NULL Status:** NEVER NULL (enforced)
- **Justification:** Standard primary key for referential integrity
- **Sample Value:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

#### 2. `processing_session_id` (UUID, REFERENCES ai_processing_sessions(id), NOT NULL)
- **Purpose:** Links confidence metrics to the AI processing session
- **Populated By:** Pass 1 Worker (from session context)
- **AI Involvement:** None (system-provided context)
- **NULL Status:** NEVER NULL (required link)
- **Cascade:** ON DELETE CASCADE (metrics deleted if session deleted)
- **Justification:** Essential for grouping all confidence metrics from a single processing run
- **Sample Value:** `session-uuid-123`

#### 3. `entity_processing_audit_id` (UUID, REFERENCES entity_processing_audit(id), NULLABLE)
- **Purpose:** Optional link to specific entity for entity-level confidence (vs session-level)
- **Populated By:** Pass 1 Worker (when tracking individual entity confidence)
- **AI Involvement:** None (system-provided reference)
- **NULL Status:** CAN BE NULL (session-level confidence doesn't link to specific entity)
- **Cascade:** ON DELETE CASCADE
- **Justification:** Enables both session-level (overall document quality) and entity-level (per-entity quality) confidence tracking
- **Two-Mode Design:**
  - NULL = session-level confidence (1 record per document)
  - UUID = entity-level confidence (N records, one per low-confidence entity)
- **Sample Value:** `entity-audit-uuid-456` or `null`

---

### Pass 1 Confidence Breakdown

#### 4. `entity_detection_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** AI's confidence in successfully detecting the entity
- **Populated By:** Pass 1 Worker (AI model output)
- **AI Involvement:** HIGH - Direct from vision/language model entity detection probability
- **NULL Status:** CAN BE NULL (optional granular metric)
- **Range:** 0.000 to 1.000
- **Justification:** Answers "How sure are we this entity exists in the document?"
- **Calculation:** Typically from AI model's softmax probability for entity presence
- **Sample Value:** `0.885` (88.5% confident entity was correctly detected)

#### 5. `text_extraction_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Confidence in OCR text extraction accuracy
- **Populated By:** Pass 1 Worker (OCR service confidence + AI validation)
- **AI Involvement:** MEDIUM - OCR service provides base score, AI validates against visual interpretation
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Handwriting, poor scan quality, or unusual fonts reduce OCR accuracy - critical to track
- **Calculation:** Weighted average of OCR service confidence and AI-OCR agreement score
- **Sample Value:** `0.920` (92% confident text was extracted correctly)

#### 6. `spatial_alignment_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Confidence in bounding box accuracy for click-to-zoom functionality
- **Populated By:** Pass 1 Worker (spatial validation algorithms)
- **AI Involvement:** MEDIUM - AI provides initial bbox, geometric validation algorithms assess accuracy
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Users need accurate click-to-zoom; low spatial confidence means "entity found but we're not sure exactly where"
- **Calculation:** Based on bbox consistency across OCR and Vision model outputs
- **Sample Value:** `0.850` (85% confident bounding box is accurate)

---

### Model-Specific Confidence Scores

#### 7. `vision_model_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Vision model's self-reported confidence (e.g., GPT-4o Vision probability)
- **Populated By:** Pass 1 Worker (AI model metadata)
- **AI Involvement:** HIGH - Direct from vision model output logits/probabilities
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Vision models may be confident even when wrong - tracking per-model confidence enables model comparison
- **Sample Value:** `0.910` (vision model 91% confident)

#### 8. `language_model_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Language model's confidence in text understanding and classification
- **Populated By:** Pass 1 Worker (language model output)
- **AI Involvement:** HIGH - Direct from language model token probabilities
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Separate from vision confidence - model may visually detect entity but be uncertain about classification
- **Sample Value:** `0.875` (language model 87.5% confident in classification)

#### 9. `classification_model_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Confidence in entity type/subtype classification
- **Populated By:** Pass 1 Worker (classification head output)
- **AI Involvement:** HIGH - Softmax probability from entity classification layer
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Entity might be detected with high confidence but classification uncertain (e.g., "is this a medication or a diagnosis?")
- **Sample Value:** `0.890` (89% confident in entity_subtype assignment)

---

### Composite Confidence Scores

#### 10. `overall_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Weighted average of all component confidence scores
- **Populated By:** Pass 1 Worker (calculated metric)
- **AI Involvement:** NONE - Algorithmic combination of AI outputs
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Single summary metric for quick quality assessment and threshold-based automation
- **Calculation Example:**
  ```
  overall_confidence =
    entity_detection_confidence * 0.30 +
    text_extraction_confidence * 0.25 +
    spatial_alignment_confidence * 0.15 +
    vision_model_confidence * 0.15 +
    language_model_confidence * 0.15
  ```
- **Sample Value:** `0.885` (88.5% overall confidence)

#### 11. `reliability_score` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Consistency metric - how much do different confidence components agree?
- **Populated By:** Pass 1 Worker (variance-based calculation)
- **AI Involvement:** NONE - Statistical calculation from AI outputs
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Low variance = high reliability (models agree), high variance = low reliability (models disagree, suspicious)
- **Calculation Example:**
  ```
  mean = average(all_confidence_scores)
  variance = sum((score - mean)^2) / count
  reliability_score = 1.0 - sqrt(variance)
  ```
- **Sample Value:** `0.900` (90% reliability - models are consistent)

#### 12. `clinical_relevance_score` (NUMERIC(4,3), NULLABLE)
- **Purpose:** How medically important is this entity? (prioritization for review)
- **Populated By:** Pass 1 Worker (priority-based scoring)
- **AI Involvement:** MEDIUM - May use AI to assess clinical importance, or rule-based from entity_category
- **NULL Status:** CAN BE NULL
- **Range:** 0.000 to 1.000
- **Justification:** Medication allergy error is more critical than a typo in address - enables risk-based review prioritization
- **Calculation:** Based on entity_category (clinical_event = high, document_structure = low) and processing_priority
- **Sample Value:** `0.870` (87% clinically relevant)

---

### Quality Indicators

#### 13. `confidence_trend` (TEXT, NULLABLE)
- **Purpose:** Is confidence improving, stable, or declining compared to historical baselines?
- **Populated By:** Pass 1 Worker (trend analysis)
- **AI Involvement:** NONE - Statistical trend calculation
- **NULL Status:** CAN BE NULL
- **Allowed Values:** `'improving'`, `'stable'`, `'declining'`
- **Justification:** Model drift detection - declining trends flag potential model degradation
- **Calculation:** Requires historical data comparison (may default to 'stable' for first runs)
- **Sample Value:** `'stable'`

#### 14. `outlier_detection` (BOOLEAN, DEFAULT FALSE)
- **Purpose:** Is this confidence score statistically anomalous?
- **Populated By:** Pass 1 Worker (outlier detection algorithms)
- **AI Involvement:** NONE - Statistical outlier detection (Z-score, IQR methods)
- **NULL Status:** NEVER NULL (has default)
- **Justification:** Flags unusual confidence patterns that may indicate edge cases or model errors
- **Calculation:** Z-score > 3 or IQR-based outlier detection
- **Sample Value:** `false`

#### 15. `confidence_flags` (TEXT[], DEFAULT '{}')
- **Purpose:** Array of quality warnings/concerns
- **Populated By:** Pass 1 Worker (rule-based flagging)
- **AI Involvement:** LOW - Rule-based thresholds (e.g., if ocr_confidence < 0.7, add flag)
- **NULL Status:** NEVER NULL (has default empty array)
- **Justification:** Human-readable quality issues for reviewer context
- **Example Values:** `["low_ocr_confidence", "handwriting_present", "spatial_uncertainty", "ai_ocr_disagreement"]`
- **Sample Value:** `[]` (no flags - high quality)

---

### Human Validation Tracking

#### 16. `human_validation_available` (BOOLEAN, DEFAULT FALSE)
- **Purpose:** Has this entity been manually reviewed by a human?
- **Populated By:** System (when manual review completed)
- **AI Involvement:** NONE - System flag
- **NULL Status:** NEVER NULL (has default)
- **Justification:** Enables human-AI agreement analysis and model calibration studies
- **Sample Value:** `false` (no human review yet)

#### 17. `human_agreement_score` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Percentage agreement between AI and human reviewer
- **Populated By:** System (calculated after human review)
- **AI Involvement:** NONE - Comparison metric
- **NULL Status:** CAN BE NULL (until human review available)
- **Range:** 0.000 to 1.000
- **Justification:** Model accuracy ground truth - if human_agreement consistently low, model needs retraining
- **Calculation:** Binary agreement (did human agree with AI classification?) or F1 score
- **Sample Value:** `0.975` (97.5% agreement with human reviewer)

#### 18. `model_accuracy_score` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Calibrated accuracy based on historical human validation
- **Populated By:** System (calibration algorithms)
- **AI Involvement:** NONE - Statistical calibration
- **NULL Status:** CAN BE NULL (requires historical data)
- **Range:** 0.000 to 1.000
- **Justification:** Model confidence may be mis-calibrated (e.g., says 90% but actually 70% accurate) - this tracks true accuracy
- **Sample Value:** `0.980` (98% accuracy when calibrated against human ground truth)

---

### Model Performance Tracking

#### 19. `processing_time_ms` (INTEGER, NULLABLE)
- **Purpose:** Milliseconds spent processing this entity or session
- **Populated By:** Pass 1 Worker (timing instrumentation)
- **AI Involvement:** NONE - System metric
- **NULL Status:** CAN BE NULL
- **Justification:** Performance monitoring for cost optimization and timeout detection
- **Sample Value:** `8450` (8.45 seconds processing time)

#### 20. `model_version` (TEXT, NULLABLE)
- **Purpose:** AI model identifier for version tracking
- **Populated By:** Pass 1 Worker (model metadata)
- **AI Involvement:** NONE - System metadata
- **NULL Status:** CAN BE NULL
- **Justification:** Model version changes affect quality - enables A/B testing and rollback analysis
- **Sample Value:** `'gpt-4o-mini-2024-07-18'`

#### 21. `calibration_score` (NUMERIC(4,3), NULLABLE)
- **Purpose:** How well-calibrated is the model? (confidence matches actual accuracy?)
- **Populated By:** System (calibration analysis)
- **AI Involvement:** NONE - Statistical calibration assessment
- **NULL Status:** CAN BE NULL (requires calibration dataset)
- **Range:** 0.000 to 1.000
- **Justification:** Well-calibrated model: if it says 80% confident, it's right 80% of the time. Poorly calibrated: overconfident or underconfident.
- **Calculation:** Expected Calibration Error (ECE) or Brier score-based
- **Sample Value:** `0.910` (91% calibration quality)

---

### Pass 2 Clinical Enrichment Fields

#### 22. `clinical_coding_confidence` (NUMERIC(4,3), NULLABLE)
- **Purpose:** Pass 2's confidence in clinical code assignment (ICD-10, SNOMED, etc.)
- **Populated By:** Pass 2 Worker (FUTURE - not yet implemented)
- **AI Involvement:** HIGH - AI clinical coding model confidence
- **NULL Status:** CAN BE NULL (not set by Pass 1, optional for Pass 2)
- **Range:** 0.000 to 1.000
- **Justification:** Clinical coding is distinct from entity detection - may detect entity perfectly but struggle with coding
- **Pass 1 Behavior:** NOT POPULATED (Pass 1 doesn't do clinical coding)
- **Pass 2 Behavior:** UPDATED with coding confidence (when Pass 2 is implemented)
- **Sample Value:** `null` (Pass 1 complete, Pass 2 not run)

---

### System Timestamps

#### 23. `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- **Purpose:** When confidence record was created
- **Populated By:** System (automatic)
- **AI Involvement:** NONE
- **NULL Status:** NEVER NULL (has default)
- **Sample Value:** `'2025-10-08 05:36:49.779+00'`

#### 24. `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- **Purpose:** Last modification timestamp (Pass 2 updates trigger this)
- **Populated By:** System (trigger on UPDATE)
- **AI Involvement:** NONE
- **NULL Status:** NEVER NULL (has default)
- **Sample Value:** `'2025-10-08 05:36:49.779+00'`

---

## Critical Issues Found

### Issue 1: Schema-Worker Field Name Mismatch (CRITICAL - BLOCKING)

**Problem:** Worker builds records with field names that don't exist in the database schema.

**Worker Provides:**
```typescript
{
  processing_session_id,           // ✅ Matches schema
  shell_file_id,                   // ❌ NOT IN SCHEMA
  patient_id,                      // ❌ NOT IN SCHEMA
  entity_id,                       // ❌ NOT IN SCHEMA
  pass1_detection_confidence,      // ❌ Schema: entity_detection_confidence
  pass1_classification_confidence, // ❌ NOT IN SCHEMA
  pass1_cross_validation_score,    // ❌ NOT IN SCHEMA
  pass1_overall_confidence,        // ❌ Schema: overall_confidence
  confidence_factors,              // ❌ NOT IN SCHEMA (JSONB)
  uncertainty_sources,             // ❌ Schema: confidence_flags
  confidence_trend                 // ✅ Matches schema
}
```

**Schema Expects:**
```sql
{
  processing_session_id,           // ✅ Worker provides
  entity_processing_audit_id,      // ❌ Worker doesn't provide
  entity_detection_confidence,     // ❌ Worker uses different name
  text_extraction_confidence,      // ❌ Worker doesn't provide
  spatial_alignment_confidence,    // ❌ Worker doesn't provide
  vision_model_confidence,         // ❌ Worker doesn't provide
  language_model_confidence,       // ❌ Worker doesn't provide
  classification_model_confidence, // ❌ Worker doesn't provide
  overall_confidence,              // ❌ Worker uses different name
  reliability_score,               // ❌ Worker doesn't provide
  clinical_relevance_score,        // ❌ Worker doesn't provide
  confidence_trend,                // ✅ Worker provides
  outlier_detection,               // ❌ Worker doesn't provide
  confidence_flags,                // ❌ Worker uses different name
  processing_time_ms,              // ❌ Worker doesn't provide
  model_version,                   // ❌ Worker doesn't provide
  calibration_score                // ❌ Worker doesn't provide
}
```

**Impact:**
- Worker attempts INSERT with non-existent columns → **PostgreSQL error**
- Error logged but job continues (silent failure)
- Table remains empty despite 107 low-confidence entities identified
- No confidence metrics available for quality monitoring

**Evidence:**
```sql
-- 107 entities with confidence < 0.8 should have triggered records
SELECT COUNT(*) FROM entity_processing_audit WHERE pass1_confidence < 0.8;
-- Returns: 107

SELECT COUNT(*) FROM ai_confidence_scoring;
-- Returns: 0  (should be 107)
```

---

### Issue 2: Bridge Schema Not Followed (PROCESS ISSUE)

**Problem:** Worker implementation diverged from bridge schema specification.

**Bridge Schema Specified:**
- 24 columns with specific names
- Granular confidence breakdown (entity_detection, text_extraction, spatial_alignment)
- Model-specific scores (vision, language, classification)
- Composite metrics (overall, reliability, clinical_relevance)

**Worker Implemented:**
- 11 columns (13 less than specified)
- Different naming convention (pass1_* prefix instead of schema names)
- Consolidated fields (confidence_factors JSONB instead of discrete columns)
- Missing critical fields (entity_processing_audit_id, model_version, processing_time_ms)

**Root Cause:** Developer didn't reference bridge schema during worker implementation.

**Impact:** Schema designed for rich quality analysis, but worker provides minimal data.

---

### Issue 3: Legacy Test Data with Placeholder Values (INFORMATIONAL)

**Problem:** October 7 data contains hardcoded 0.500 confidence scores.

**Evidence:**
```sql
-- All Oct 7 entities have identical 0.500 confidence
SELECT DISTINCT pass1_confidence, ai_visual_confidence, ocr_confidence, created_at::date
FROM entity_processing_audit
WHERE created_at::date = '2025-10-07';
-- Returns: 0.500, 0.500, null, 2025-10-07 (for all rows)
```

**Analysis:**
- Real AI confidence scores vary (e.g., 0.883, 0.947, 0.912)
- Identical 0.500 values are statistically impossible
- OCR confidence is NULL (suggests incomplete processing)
- October 8+ data shows realistic confidence distributions

**Impact:** Misleading historical data, but doesn't affect current operations.

**Recommendation:** Delete or flag October 7 test data to avoid skewing analytics.

---

## Recommended Fixes

### Fix 1: Rewrite Worker to Match Bridge Schema (RECOMMENDED)

**Action:** Complete worker rewrite following bridge schema specification exactly.

**Implementation:**
```typescript
// Pass 1 Worker - buildAIConfidenceScoringRecords()
function buildAIConfidenceScoringRecords(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata,
  entityAuditRecords: EntityAuditRecord[]
): AIConfidenceScoringRecord[] {
  const records: AIConfidenceScoringRecord[] = [];

  // Only create records for low-confidence entities (< 0.8)
  for (const entity of entityAuditRecords) {
    if (entity.pass1_confidence < 0.8) {

      // Calculate composite scores
      const overallConfidence = calculateOverallConfidence(entity);
      const reliabilityScore = calculateReliabilityScore(entity);
      const clinicalRelevance = calculateClinicalRelevance(entity);

      records.push({
        // Primary references (REQUIRED)
        processing_session_id: input.processing_session_id,
        entity_processing_audit_id: entity.id,  // ✅ CRITICAL FIX

        // Confidence breakdown (Pass 1 entity detection)
        entity_detection_confidence: entity.pass1_confidence,  // ✅ RENAME
        text_extraction_confidence: entity.ocr_confidence || null,
        spatial_alignment_confidence: calculateSpatialConfidence(entity),

        // Model-specific confidence scores (Pass 1)
        vision_model_confidence: entity.ai_visual_confidence,
        language_model_confidence: deriveLanguageConfidence(aiResponse),
        classification_model_confidence: entity.pass1_confidence,  // Classification confidence

        // Composite scores (Pass 1)
        overall_confidence: overallConfidence,  // ✅ RENAME from pass1_overall_confidence
        reliability_score: reliabilityScore,
        clinical_relevance_score: clinicalRelevance,

        // Quality indicators
        confidence_trend: 'stable',  // Default for first run
        outlier_detection: detectOutlier(entity, entityAuditRecords),
        confidence_flags: buildConfidenceFlags(entity),  // ✅ RENAME from uncertainty_sources

        // Human validation (not available in Pass 1)
        human_validation_available: false,
        human_agreement_score: null,
        model_accuracy_score: null,

        // Model performance tracking
        processing_time_ms: sessionMetadata.entity_processing_time_ms || null,
        model_version: sessionMetadata.model_used,
        calibration_score: null,  // Requires historical calibration data

        // Pass 2 clinical coding (not set by Pass 1)
        clinical_coding_confidence: null
      });
    }
  }

  return records;
}

// Helper functions
function calculateOverallConfidence(entity: EntityAuditRecord): number {
  return (
    (entity.pass1_confidence || 0) * 0.30 +
    (entity.ocr_confidence || 0) * 0.25 +
    (entity.ai_visual_confidence || 0) * 0.30 +
    0.75 * 0.15  // Default language confidence placeholder
  );
}

function calculateReliabilityScore(entity: EntityAuditRecord): number {
  const scores = [
    entity.pass1_confidence,
    entity.ocr_confidence,
    entity.ai_visual_confidence
  ].filter(s => s !== null && s !== undefined);

  if (scores.length < 2) return 1.0;  // Not enough data

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
  return Math.max(0, 1.0 - Math.sqrt(variance));
}

function calculateClinicalRelevance(entity: EntityAuditRecord): number {
  // Map processing_priority to clinical relevance score
  const priorityMap = {
    'highest': 1.0,
    'high': 0.85,
    'medium': 0.70,
    'low': 0.50,
    'logging_only': 0.30
  };
  return priorityMap[entity.processing_priority] || 0.70;
}

function calculateSpatialConfidence(entity: EntityAuditRecord): number | null {
  // If we have bbox from both AI and OCR, calculate agreement
  if (entity.spatial_bbox && entity.ai_ocr_agreement_score) {
    return entity.ai_ocr_agreement_score;
  }
  return null;
}

function deriveLanguageConfidence(aiResponse: Pass1AIResponse): number {
  // Use overall language understanding from AI response
  return aiResponse.processing_metadata.confidence_metrics.overall_confidence;
}

function detectOutlier(
  entity: EntityAuditRecord,
  allEntities: EntityAuditRecord[]
): boolean {
  // Z-score outlier detection
  const confidences = allEntities.map(e => e.pass1_confidence);
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const stdDev = Math.sqrt(
    confidences.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / confidences.length
  );
  const zScore = Math.abs((entity.pass1_confidence - mean) / stdDev);
  return zScore > 3;  // Outlier if Z-score > 3
}

function buildConfidenceFlags(entity: EntityAuditRecord): string[] {
  const flags: string[] = [];

  if (entity.pass1_confidence < 0.7) flags.push('low_detection_confidence');
  if (entity.ocr_confidence && entity.ocr_confidence < 0.7) flags.push('low_ocr_confidence');
  if (entity.ai_visual_confidence < 0.7) flags.push('low_visual_confidence');
  if (entity.discrepancy_type) flags.push(`ai_ocr_discrepancy_${entity.discrepancy_type}`);
  if (entity.ai_ocr_agreement_score && entity.ai_ocr_agreement_score < 0.7) {
    flags.push('ai_ocr_disagreement');
  }

  return flags;
}
```

**Benefits:**
- Full compliance with bridge schema design
- Rich confidence breakdown enables sophisticated quality analysis
- Proper entity-level tracking via entity_processing_audit_id
- Model performance monitoring (processing_time_ms, model_version)
- Future-ready for Pass 2 clinical_coding_confidence updates

**Effort:** ~4-6 hours of development + testing

---

### Fix 2: Clean Legacy Test Data

**Action:** Remove or flag October 7 test data with placeholder 0.500 values.

**Implementation:**
```sql
-- Option A: Delete legacy test data
DELETE FROM entity_processing_audit
WHERE created_at::date = '2025-10-07'
  AND pass1_confidence = 0.500
  AND ai_visual_confidence = 0.500
  AND ocr_confidence IS NULL;

-- Option B: Flag as test data (if keeping for reference)
ALTER TABLE entity_processing_audit ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE;

UPDATE entity_processing_audit
SET is_test_data = TRUE
WHERE created_at::date = '2025-10-07'
  AND pass1_confidence = 0.500;
```

**Benefits:**
- Clean analytics without placeholder values
- Historical trend analysis reflects real production data

**Effort:** 5 minutes

---

### Fix 3: Add Integration Tests for Schema Compliance

**Action:** Prevent future schema-worker mismatches with automated testing.

**Implementation:**
```typescript
// test/schema-compliance.test.ts
import { buildAIConfidenceScoringRecords } from '../pass1/pass1-database-builder';
import { AIConfidenceScoringSchema } from '../types/database-schema';

describe('ai_confidence_scoring schema compliance', () => {
  it('should build records matching database schema columns', () => {
    const mockInput = createMockPass1Input();
    const mockResponse = createMockAIResponse();
    const mockEntityRecords = createMockEntityRecords();

    const records = buildAIConfidenceScoringRecords(
      mockInput,
      mockResponse,
      mockEntityRecords
    );

    // Verify every record field exists in schema
    records.forEach(record => {
      const recordKeys = Object.keys(record);
      const schemaKeys = Object.keys(AIConfidenceScoringSchema);

      // No extra fields
      const extraFields = recordKeys.filter(k => !schemaKeys.includes(k));
      expect(extraFields).toHaveLength(0);

      // All required fields present
      const requiredFields = ['processing_session_id', 'entity_processing_audit_id'];
      requiredFields.forEach(field => {
        expect(record).toHaveProperty(field);
      });
    });
  });

  it('should respect NUMERIC(4,3) precision constraints', () => {
    const records = buildAIConfidenceScoringRecords(...);

    records.forEach(record => {
      // All confidence scores should be 0.000-1.000
      const confidenceFields = [
        'entity_detection_confidence',
        'text_extraction_confidence',
        'overall_confidence',
        // ... etc
      ];

      confidenceFields.forEach(field => {
        if (record[field] !== null) {
          expect(record[field]).toBeGreaterThanOrEqual(0);
          expect(record[field]).toBeLessThanOrEqual(1);
          // Check precision (3 decimal places max)
          const decimalPlaces = (record[field].toString().split('.')[1] || '').length;
          expect(decimalPlaces).toBeLessThanOrEqual(3);
        }
      });
    });
  });
});
```

**Benefits:**
- Catch schema mismatches in CI/CD before deployment
- Enforce precision constraints (NUMERIC(4,3) validation)
- Living documentation of schema requirements

**Effort:** 2-3 hours

---

## Verification Queries

### Check if Fix 1 Resolved Insertion Issue
```sql
-- After worker rewrite, verify records are being created
SELECT
  COUNT(*) as total_records,
  COUNT(DISTINCT processing_session_id) as unique_sessions,
  COUNT(entity_processing_audit_id) as entity_level_records,
  COUNT(*) - COUNT(entity_processing_audit_id) as session_level_records,
  AVG(overall_confidence) as avg_confidence,
  MIN(created_at) as first_record,
  MAX(created_at) as latest_record
FROM ai_confidence_scoring;

-- Should return > 0 records after fix
```

### Confidence Distribution Analysis
```sql
-- Analyze confidence score distributions
SELECT
  CASE
    WHEN overall_confidence >= 0.90 THEN 'Excellent (90%+)'
    WHEN overall_confidence >= 0.80 THEN 'Good (80-90%)'
    WHEN overall_confidence >= 0.70 THEN 'Fair (70-80%)'
    WHEN overall_confidence >= 0.60 THEN 'Poor (60-70%)'
    ELSE 'Critical (<60%)'
  END as confidence_tier,
  COUNT(*) as record_count,
  AVG(reliability_score) as avg_reliability,
  AVG(clinical_relevance_score) as avg_clinical_relevance,
  COUNT(*) FILTER (WHERE outlier_detection = true) as outlier_count
FROM ai_confidence_scoring
WHERE overall_confidence IS NOT NULL
GROUP BY
  CASE
    WHEN overall_confidence >= 0.90 THEN 'Excellent (90%+)'
    WHEN overall_confidence >= 0.80 THEN 'Good (80-90%)'
    WHEN overall_confidence >= 0.70 THEN 'Fair (70-80%)'
    WHEN overall_confidence >= 0.60 THEN 'Poor (60-70%)'
    ELSE 'Critical (<60%)'
  END
ORDER BY MIN(overall_confidence) DESC;
```

### Model Performance Tracking
```sql
-- Track model performance over time
SELECT
  model_version,
  DATE_TRUNC('day', created_at) as processing_date,
  COUNT(*) as entities_processed,
  AVG(overall_confidence) as avg_confidence,
  AVG(processing_time_ms) as avg_processing_time_ms,
  AVG(calibration_score) as avg_calibration,
  COUNT(*) FILTER (WHERE confidence_trend = 'declining') as declining_count
FROM ai_confidence_scoring
WHERE model_version IS NOT NULL
GROUP BY model_version, DATE_TRUNC('day', created_at)
ORDER BY processing_date DESC, model_version;
```

### Confidence Flags Analysis
```sql
-- Identify common quality issues
SELECT
  unnest(confidence_flags) as flag,
  COUNT(*) as occurrence_count,
  AVG(overall_confidence) as avg_confidence_when_flagged,
  COUNT(*) FILTER (WHERE human_validation_available = true) as human_reviewed_count
FROM ai_confidence_scoring
WHERE array_length(confidence_flags, 1) > 0
GROUP BY unnest(confidence_flags)
ORDER BY occurrence_count DESC
LIMIT 20;
```

---

## Summary

**Table Purpose:** Granular AI quality metrics and model performance monitoring for Pass 1 entity detection (and future Pass 2 clinical enrichment).

**Current Status:** EMPTY due to schema-worker field name mismatch preventing record insertion.

**Critical Issue:** Worker implementation diverged from bridge schema specification - 13 missing fields, incompatible naming conventions.

**Recommended Fix:** Complete worker rewrite (Fix 1) following bridge schema exactly, enabling rich confidence analysis as designed.

**Multi-Pass Context:** Table designed for progressive confidence accumulation - Pass 1 creates with entity detection metrics, Pass 2 optionally updates with clinical coding confidence. Pass 1 does most work because entity detection is the foundational quality layer.

**Next Steps:**
1. Implement Fix 1 (worker rewrite) - 4-6 hours
2. Implement Fix 2 (clean test data) - 5 minutes
3. Implement Fix 3 (schema compliance tests) - 2-3 hours
4. Verify records populate correctly
5. Re-audit table with real production data
