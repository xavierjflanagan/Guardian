# Pass 1 Strategy-A Comprehensive Audit

**Created:** 2025-11-27
**Status:** Complete
**Purpose:** Full audit of existing Pass 1 system to inform Strategy-A transformation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [TypeScript File Audit](#2-typescript-file-audit)
3. [Database Table Audit](#3-database-table-audit)
4. [Data Flow Analysis](#4-data-flow-analysis)
5. [Gap Analysis: Pass 0.5 to Pass 1](#5-gap-analysis-pass-05-to-pass-1)
6. [OCR vs Raw Image Usage](#6-ocr-vs-raw-image-usage)
7. [Key Findings and Recommendations](#7-key-findings-and-recommendations)

---

## 1. Executive Summary

### Overview

Pass 1 Entity Detection was built in **October 2025**, BEFORE Pass 0.5 Encounter Discovery existed. This creates fundamental architectural misalignments that Strategy-A must address.

### Current State Metrics

| Metric | Value |
|--------|-------|
| TypeScript Files | 8 files in `pass1/` + worker.ts |
| Total Lines of Code | ~3,116 lines (pass1/) + 1,694 lines (worker.ts) |
| Database Tables Written | 7 tables |
| AI Model | GPT-5-mini (vision-enabled) |
| Cost per Page | ~$0.032 |
| Processing Mode | Dual-input (Vision PRIMARY + OCR SECONDARY) |

### Critical Issues Identified

1. **No Encounter Awareness**: Pass 1 processes entire documents without knowledge of encounter boundaries
2. **Raw Image Dependency**: Uses raw document images as PRIMARY input (vision model)
3. **No Integration with Pass 0.5**: Does not read from `healthcare_encounters` or use encounter context
4. **Spatial Data Format Mismatch**: Uses `SpatialElement[]` format, not enhanced OCR XY format
5. **Single-Page Processing**: Downloads only first page for Vision AI processing

---

## 2. TypeScript File Audit

### 2.1 Pass 1 Module Files

#### index.ts (78 lines)
**Purpose:** Public API exports for Pass 1 module

**Exports:**
- `Pass1EntityDetector` class
- Type exports: `Pass1Input`, `Pass1ProcessingResult`, `Pass1AIResponse`, etc.
- Schema mapping functions: `assignEntitySchemas`, `determineProcessingPriority`
- Translation functions: `translateAIOutputToDatabase`, `batchEntityRecords`
- Prompt functions: `generatePass1ClassificationPrompt`, `PASS1_SYSTEM_MESSAGE`
- Database builder: `buildPass1DatabaseRecords`

**Strategy-A Impact:** Keep as public API surface, update exports for new module structure

---

#### Pass1EntityDetector.ts (~707 lines)
**Purpose:** Main orchestration class for Pass 1 entity detection

**Key Methods:**
- `processDocument(input: Pass1Input)` - Main entry point
- `callOpenAIVision()` - Makes GPT-5-mini API call with image + OCR
- `getAllDatabaseRecords()` - Returns all 7 table records

**Critical Code Sections:**

```typescript
// Lines 45-60: Dual-input processing setup
const messages = [
  { role: 'system', content: PASS1_SYSTEM_MESSAGE },
  {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${input.raw_file.file_type};base64,${input.raw_file.file_data}` } },
      { type: 'text', text: generatePass1ClassificationPrompt(input, this.config.model) }
    ]
  }
];
```

**Issues:**
- Hardcoded to use vision model with raw image as PRIMARY input
- No encounter context passed to AI
- Single-page processing (only first page image)
- No integration with enhanced OCR format

**Strategy-A Impact:** MAJOR REWRITE - Transform to OCR-only input, add encounter context

---

#### pass1-types.ts (~400 lines)
**Purpose:** Type definitions for Pass 1

**Key Types:**

```typescript
// Pass1Input - Current input structure
interface Pass1Input {
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;
  raw_file: {              // RAW IMAGE - Strategy-A removes this
    file_data: string;     // Base64 image
    file_type: string;     // image/jpeg
    filename: string;
    file_size: number;
  };
  ocr_spatial_data: {
    extracted_text: string;
    spatial_mapping: SpatialElement[];  // OLD FORMAT - Strategy-A uses enhanced OCR XY
    ocr_confidence: number;
    processing_time_ms: number;
    ocr_provider: string;
  };
  document_metadata: DocumentMetadata;
}

// SpatialElement - OLD spatial format
interface SpatialElement {
  text: string;
  page_number: number;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  line_number: number;
  word_index: number;
  confidence: number;
}
```

**Strategy-A Impact:**
- Remove `raw_file` field
- Replace `spatial_mapping: SpatialElement[]` with `enhanced_ocr_xy: string`
- Add `encounter_context` field with encounter boundaries

---

#### pass1-prompts.ts (269 lines)
**Purpose:** AI prompt templates for entity classification

**Key Functions:**
- `generatePass1ClassificationPrompt()` - Main classification prompt
- `generateValidationPrompt()` - QA validation prompt
- `generateErrorRecoveryPrompt()` - Retry prompt

**Current Prompt Structure:**
```typescript
// Lines 79-131: Main classification prompt
`You are a medical document entity detection system using DUAL INPUTS for maximum accuracy.

INPUT 1 - RAW DOCUMENT IMAGE: [Base64 image provided to vision model]

INPUT 2 - OCR REFERENCE DATA:
- OCR Text: "${truncateOCRText(input.ocr_spatial_data.extracted_text, 2000)}"
- Spatial Coordinates: ${formatSpatialMapping(input.ocr_spatial_data.spatial_mapping, 100)}
...

PROCESSING INSTRUCTIONS:
1. PRIMARY ANALYSIS: Use your vision capabilities to interpret the raw document image
2. SPATIAL MAPPING: For each entity you identify visually, map it to the closest OCR spatial coordinates
3. CROSS-VALIDATION: Use OCR text as reference but trust your visual interpretation for accuracy
...`
```

**Issues:**
- Explicitly instructs AI to use vision as PRIMARY
- OCR is SECONDARY for cross-validation only
- No encounter context in prompt
- Spatial mapping truncated to 100 elements

**Strategy-A Impact:** MAJOR REWRITE - Transform to OCR-only prompt with encounter context

---

#### pass1-translation.ts (450 lines)
**Purpose:** Translates AI JSON output to database-ready format

**Key Functions:**
- `translateAIOutputToDatabase()` - Main translation function
- `normalizeEntityCategory()` - Normalize AI category strings
- `truncateTextField()` - Defensive text truncation
- `validateEntityRecord()` - Record validation
- `generateRecordStatistics()` - Statistics generation

**Output Structure:** `EntityAuditRecord[]` for `entity_processing_audit` table

**Strategy-A Impact:** Mostly reusable, may need updates for new fields

---

#### pass1-schema-mapping.ts (336 lines)
**Purpose:** Maps entity subtypes to required database schemas

**Key Constants:**
```typescript
// Entity subtype to database table mapping
const ENTITY_SCHEMA_MAPPING: Record<EntitySubtype, string[]> = {
  // CLINICAL EVENTS
  vital_sign: ['patient_clinical_events', 'patient_observations', 'patient_vitals'],
  lab_result: ['patient_clinical_events', 'patient_observations', 'patient_lab_results'],
  medication: ['patient_clinical_events', 'patient_interventions', 'patient_medications'],
  diagnosis: ['patient_clinical_events', 'patient_conditions'],
  ...
  // HEALTHCARE CONTEXT
  patient_identifier: ['healthcare_encounters'],
  provider_identifier: ['healthcare_encounters'],
  ...
  // DOCUMENT STRUCTURE
  header: [],
  footer: [],
  ...
};
```

**Key Functions:**
- `assignEntitySchemas()` - Get schemas for entity subtype
- `determineProcessingPriority()` - Calculate processing priority
- `assessEnrichmentComplexity()` - Estimate Pass 2 complexity

**Strategy-A Impact:** Reusable as-is, three-tier classification system is preserved

---

#### pass1-database-builder.ts (404 lines)
**Purpose:** Builds all 7 database records from AI response

**Key Function:**
```typescript
function buildPass1DatabaseRecords(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata,
  entityAuditRecords: EntityAuditRecord[],
  processingTimeMs: number
): Pass1DatabaseRecords {
  return {
    ai_processing_session: buildAIProcessingSessionRecord(...),
    entity_processing_audit: entityAuditRecords,
    shell_file_updates: buildShellFileUpdates(...),
    profile_classification_audit: buildProfileClassificationAudit(...),
    pass1_entity_metrics: buildPass1EntityMetrics(...),
    ai_confidence_scoring: buildAIConfidenceScoringRecords(...),
    manual_review_queue: buildManualReviewQueueRecords(...),
  };
}
```

**Strategy-A Impact:** Mostly reusable, update for new input structure

---

#### pass1-prompts-minimal-test.ts (111 lines)
**Purpose:** Experimental minimal prompt for testing

**Notes:** Test file from October 2025 hypothesis testing. Can be archived.

**Strategy-A Impact:** Archive to `archive-pre-strategy-a/`

---

### 2.2 Worker Integration (worker.ts)

**Location:** `apps/render-worker/src/worker.ts`
**Lines:** 1,694

**Pass 1 Relevant Sections:**

#### Lines 166-192: Pass 1 Initialization
```typescript
// Initialize Pass 1 detector if enabled and OpenAI key is available
if (config.passes.pass1Enabled && config.openai.apiKey) {
  const pass1Config: Pass1Config = {
    openai_api_key: config.openai.apiKey,
    model: 'gpt-5-mini',
    temperature: 0.1,
    max_tokens: 32000,
    confidence_threshold: 0.7,
  };
  this.pass1Detector = new Pass1EntityDetector(pass1Config);
}
```

#### Lines 491-515: Pass 1 Execution Flow
```typescript
// Run Pass 1 (Entity Detection) - OPTIONAL (controlled by config flag)
if (config.passes.pass1Enabled) {
  await this.runPass1(payload, ocrResult, processingSessionId, job);
  return { success: true, message: 'Pass 0.5 and Pass 1 completed successfully' };
} else {
  return { success: true, message: 'Pass 0.5 completed successfully. Pass 1 disabled.' };
}
```

#### Lines 1210-1300: runPass1() Method
```typescript
private async runPass1(payload, ocrResult, processingSessionId, job) {
  // Download first processed image for Vision AI
  const firstPagePath = `${shellFileRecord.processed_image_path}/page-1.jpg`;
  // ... download image ...

  // Build Pass1Input
  const pass1Input: Pass1Input = {
    shell_file_id: payload.shell_file_id,
    raw_file: {
      file_data: processedImageBase64,  // RAW IMAGE
      file_type: 'image/jpeg',
      ...
    },
    ocr_spatial_data: {
      extracted_text: ocrResult.pages.map(p => p.spatially_sorted_text).join(' '),
      spatial_mapping: ocrResult.pages.flatMap(page =>
        page.blocks.flatMap(block =>
          block.paragraphs.flatMap(para =>
            para.words.map(word => ({
              text: word.text,
              bounding_box: { x, y, width, height },
              ...
            }))
          )
        )
      ),
      ...
    },
    ...
  };

  return await this.processPass1EntityDetection(pass1Input);
}
```

**Issues:**
- Downloads only FIRST page image
- Builds `SpatialElement[]` from blocks (not enhanced OCR format)
- No encounter context passed
- No integration with `healthcare_encounters` table

**Strategy-A Impact:** MAJOR REWRITE - Transform to OCR-only, multi-encounter parallel processing

---

## 3. Database Table Audit

### 3.1 Tables Pass 1 Writes To (7 Tables)

#### entity_processing_audit (57 columns)
**Purpose:** Audit trail for all detected entities

**Key Columns:**
| Column | Type | Pass 1 Writes | Strategy-A Notes |
|--------|------|---------------|------------------|
| id | uuid | Yes | Auto-generated |
| shell_file_id | uuid | Yes | From input |
| patient_id | uuid | Yes | From input |
| entity_id | text | Yes | AI-generated |
| original_text | text | Yes | AI-extracted |
| entity_category | text | Yes | clinical_event/healthcare_context/document_structure |
| entity_subtype | text | Yes | vital_sign, medication, diagnosis, etc. |
| spatial_bbox | jsonb | Yes | {x, y, width, height} |
| page_number | integer | Yes | From AI |
| pass1_confidence | numeric | Yes | 0.0-1.0 |
| **final_encounter_id** | uuid | **NO** | **CRITICAL GAP - Strategy-A must set this** |
| encounter_assignment_method | text | NO | Strategy-A will use |
| encounter_assignment_confidence | numeric | NO | Strategy-A will use |
| ai_visual_interpretation | text | Yes | From vision model |
| ocr_reference_text | text | Yes | From OCR |
| ai_ocr_agreement_score | numeric | Yes | Vision vs OCR agreement |

**Key Finding:** `final_encounter_id` column EXISTS but Pass 1 never sets it. Strategy-A must link entities to encounters.

---

#### ai_processing_sessions (23 columns)
**Purpose:** Track processing session state

**Key Columns:**
| Column | Type | Pass 1 Writes |
|--------|------|---------------|
| id | uuid | Yes |
| patient_id | uuid | Yes |
| shell_file_id | uuid | Yes |
| session_type | text | 'entity_extraction' |
| session_status | text | 'completed' |
| ai_model_name | text | 'gpt-5-mini' |
| workflow_step | text | 'entity_detection' |

**Strategy-A Impact:** Minimal changes needed

---

#### ai_confidence_scoring (24 columns)
**Purpose:** Detailed confidence breakdowns for low-confidence entities

**Key Columns:**
| Column | Type | Pass 1 Writes |
|--------|------|---------------|
| processing_session_id | uuid | Yes |
| entity_detection_confidence | numeric | Yes |
| overall_confidence | numeric | Yes |
| confidence_factors | jsonb | Yes |

**Strategy-A Impact:** Minimal changes needed

---

#### manual_review_queue (28 columns)
**Purpose:** Queue for entities requiring human review

**Key Columns:**
| Column | Type | Pass 1 Writes |
|--------|------|---------------|
| patient_id | uuid | Yes |
| processing_session_id | uuid | Yes |
| review_type | text | entity_validation/low_confidence/safety_concern |
| priority | text | low/normal/high/urgent/critical |
| clinical_context | jsonb | Entity details |

**Strategy-A Impact:** Minimal changes needed

---

#### profile_classification_audit (6 columns - CHANGED)
**Purpose:** Originally for profile classification, now repurposed for Pass 0.5

**Current Columns:**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| pending_encounter_id | text | Used by Pass 0.5 |
| attempted_match | jsonb | Pass 0.5 matching data |
| result | varchar | Match result |
| confidence | numeric | Match confidence |
| created_at | timestamp | |

**Key Finding:** This table was REPURPOSED for Pass 0.5 profile matching. Pass 1's original usage pattern may conflict.

**Strategy-A Impact:** Need to investigate current usage by Pass 0.5

---

#### pass1_entity_metrics (18 columns)
**Purpose:** Aggregate metrics for Pass 1 processing

**Key Columns:**
| Column | Type | Pass 1 Writes |
|--------|------|---------------|
| profile_id | uuid | Yes (= patient_id) |
| shell_file_id | uuid | Yes |
| entities_detected | integer | Yes |
| processing_time_ms | integer | Yes |
| vision_model_used | text | 'gpt-5-mini' |
| input_tokens | integer | Yes |
| output_tokens | integer | Yes |
| total_tokens | integer | Yes |

**Strategy-A Impact:** Minimal changes, update model name if changed

---

#### shell_files (42 columns)
**Purpose:** Document metadata and processing status

**Key Columns Updated by Pass 1:**
| Column | Type | Pass 1 Updates |
|--------|------|----------------|
| status | text | 'pass1_complete' |
| processing_completed_at | timestamp | Yes |
| extracted_text | text | From OCR |
| confidence_score | numeric | Overall confidence |

**Strategy-A Impact:** Minimal changes needed

---

### 3.2 Tables Pass 1 Should Read From (Currently Does NOT)

#### healthcare_encounters (75 columns)
**Purpose:** Encounter records created by Pass 0.5

**Key Columns for Strategy-A:**
| Column | Type | Strategy-A Usage |
|--------|------|------------------|
| id | uuid | Link entities to encounters |
| patient_id | uuid | Filter encounters |
| source_shell_file_id | uuid | Match to shell file |
| start_page | integer | Encounter page range |
| end_page | integer | Encounter page range |
| start_y | integer | Y-coordinate boundary |
| end_y | integer | Y-coordinate boundary |
| cascade_id | varchar | Unique encounter identifier |
| encounter_type | text | consultation, lab_result, etc. |
| pass_0_5_confidence | numeric | Encounter detection confidence |

**CRITICAL GAP:** Pass 1 DOES NOT query this table. Strategy-A MUST read encounter boundaries.

---

## 4. Data Flow Analysis

### 4.1 Current Flow (Pass 1 WITHOUT Pass 0.5 Integration)

```
[OCR Result] ─────────────────────────────────────────────────┐
                                                              │
[Processed Image] ──┐                                         │
                    │                                         │
                    ▼                                         ▼
              ┌───────────────────────────────────────────────────┐
              │                  Pass 1 Input                      │
              │  - raw_file.file_data (base64 image)              │
              │  - ocr_spatial_data.spatial_mapping (SpatialElement[])│
              │  - document_metadata                               │
              │                                                    │
              │  MISSING: encounter_context                        │
              └───────────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │              GPT-5-mini Vision API                 │
              │  INPUT 1: Raw document image (PRIMARY)            │
              │  INPUT 2: OCR text + spatial coords (SECONDARY)   │
              │                                                    │
              │  PROBLEM: No encounter context                     │
              └───────────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │               Entity Classification                │
              │  - 3-tier taxonomy (clinical/context/structure)   │
              │  - Per-entity confidence scores                   │
              │  - Spatial bounding boxes                         │
              │                                                    │
              │  MISSING: encounter_id assignment                  │
              └───────────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │              Write to 7 Tables                     │
              │  - entity_processing_audit (final_encounter_id = NULL)│
              │  - ai_processing_sessions                         │
              │  - ai_confidence_scoring                          │
              │  - manual_review_queue                            │
              │  - profile_classification_audit                   │
              │  - pass1_entity_metrics                           │
              │  - shell_files (status update)                    │
              └───────────────────────────────────────────────────┘
```

### 4.2 Strategy-A Target Flow (Pass 1 WITH Pass 0.5 Integration)

```
[Pass 0.5 Complete] ──────────────────────────────────────────────┐
                                                                  │
                                                                  ▼
              ┌───────────────────────────────────────────────────┐
              │           Load Encounter Context                   │
              │  SELECT * FROM healthcare_encounters               │
              │  WHERE source_shell_file_id = ?                   │
              │  ORDER BY start_page, start_y                     │
              └───────────────────────────────────────────────────┘
                                      │
                                      ▼
[Enhanced OCR XY] ───────────────────────────────────────────────┐
                                                                  │
                                                                  ▼
              ┌───────────────────────────────────────────────────┐
              │              Strategy-A Pass 1 Input               │
              │  - enhanced_ocr_xy: string (XY format)            │
              │  - encounter_context: EncounterInfo[]              │
              │    - encounter_id, start_page, end_page           │
              │    - start_y, end_y, encounter_type               │
              │  - safe_split_points: SplitPoint[] (for batching) │
              │                                                    │
              │  NO raw_file (OCR-only)                           │
              └───────────────────────────────────────────────────┘
                                      │
                ┌─────────────────────┴─────────────────────┐
                │                                           │
                ▼                                           ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│      Encounter 1 Batch         │       │      Encounter 2 Batch         │
│  Pages 1-5, Y: 0-2263          │       │  Pages 6-10, Y: 0-1500         │
│  GPT-5-mini (OCR-only)         │  ...  │  GPT-5-mini (OCR-only)         │
│  Encounter context provided    │       │  Encounter context provided    │
└───────────────────────────────┘       └───────────────────────────────┘
                │                                           │
                └─────────────────────┬─────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │              Entity Classification                 │
              │  - 3-tier taxonomy (preserved)                    │
              │  - Per-entity confidence scores                   │
              │  - Spatial bounding boxes (from XY format)        │
              │  - encounter_id ASSIGNED per entity               │
              └───────────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │              Write to 7 Tables                     │
              │  - entity_processing_audit                        │
              │    - final_encounter_id = encounter.id            │
              │    - encounter_assignment_method = 'pass1_spatial'│
              │    - encounter_assignment_confidence = 0.95       │
              │  - (other tables as before)                       │
              └───────────────────────────────────────────────────┘
```

---

## 5. Gap Analysis: Pass 0.5 to Pass 1

### 5.1 What Pass 0.5 Produces (Available to Pass 1)

| Output | Table/Storage | Available |
|--------|---------------|-----------|
| Encounter records | `healthcare_encounters` | Yes |
| Page ranges per encounter | `start_page`, `end_page` columns | Yes |
| Y-coordinate boundaries | `start_y`, `end_y` columns | Yes |
| Cascade IDs | `cascade_id` column | Yes |
| Safe split points | Stored in manifest | Yes |
| Enhanced OCR (Y-only) | `enhanced-ocr-y.txt` | Yes |
| Enhanced OCR (XY) | `enhanced-ocr-xy.txt` | Yes |
| Encounter types | `encounter_type` column | Yes |

### 5.2 What Pass 1 Currently Consumes

| Input | Current Source | Gap |
|-------|----------------|-----|
| Raw document image | Processed JPEG storage | REMOVE - use OCR-only |
| OCR text | `spatially_sorted_text` | REPLACE with enhanced OCR XY |
| Spatial mapping | Built from blocks as `SpatialElement[]` | REPLACE with enhanced OCR XY |
| Encounter context | **NONE** | **CRITICAL GAP** |
| Page ranges | **NONE** | **CRITICAL GAP** |

### 5.3 Integration Points Required

1. **Load encounters before processing:**
   ```sql
   SELECT id, encounter_type, start_page, end_page, start_y, end_y,
          cascade_id, pass_0_5_confidence
   FROM healthcare_encounters
   WHERE source_shell_file_id = :shell_file_id
     AND is_current = true
   ORDER BY start_page, start_y;
   ```

2. **Load enhanced OCR XY format:**
   ```typescript
   const enhancedOcrXY = await loadEnhancedOCR_XY(supabase, patientId, shellFileId);
   ```

3. **Set encounter_id on entities:**
   ```typescript
   entityRecord.final_encounter_id = encounter.id;
   entityRecord.encounter_assignment_method = 'pass1_spatial';
   entityRecord.encounter_assignment_confidence = 0.95;
   ```

---

## 6. OCR vs Raw Image Usage

### 6.1 Current Dual-Input Architecture

**Vision Model (PRIMARY):**
- Receives: Base64 JPEG image of first page only
- Purpose: Direct visual interpretation
- Trust level: HIGH (primary source of truth)

**OCR Data (SECONDARY):**
- Receives: Concatenated `spatially_sorted_text` from all pages
- Receives: `SpatialElement[]` array (truncated to 100 elements)
- Purpose: Cross-validation and spatial coordinate lookup
- Trust level: MEDIUM (reference only)

### 6.2 Current Prompt Instructions

From `pass1-prompts.ts` lines 92-96:
```
PROCESSING INSTRUCTIONS:
1. PRIMARY ANALYSIS: Use your vision capabilities to interpret the raw document image
2. SPATIAL MAPPING: For each entity you identify visually, map it to the closest OCR spatial coordinates
3. CROSS-VALIDATION: Use OCR text as reference but trust your visual interpretation for accuracy
4. DISCREPANCY DETECTION: Note where your vision differs from OCR interpretation
```

### 6.3 Strategy-A OCR-Only Architecture

**Enhanced OCR XY (PRIMARY):**
- Receives: Full enhanced OCR with XY coordinates
- Format: `[Y:###] text (x:###) | text (x:###)`
- Purpose: Primary source of truth for entity detection
- Trust level: HIGH

**Raw Image (FALLBACK - Optional):**
- Available but not used by default
- Can be enabled for specific document types
- Purpose: Troubleshooting, edge cases

### 6.4 Strategy-A Prompt Instructions (Proposed)

```
PROCESSING INSTRUCTIONS:
1. PRIMARY ANALYSIS: Use the enhanced OCR text with coordinates as your primary source
2. COORDINATE EXTRACTION: Use [Y:###] and (x:###) markers for precise spatial positioning
3. ENCOUNTER CONTEXT: Each entity belongs to a specific encounter - use the encounter boundaries provided
4. ENTITY CLASSIFICATION: Classify using 3-tier taxonomy (clinical_event, healthcare_context, document_structure)
5. CONFIDENCE SCORING: Base confidence on text clarity and coordinate precision
```

---

## 7. Key Findings and Recommendations

### 7.1 Critical Findings

| # | Finding | Severity | Impact |
|---|---------|----------|--------|
| 1 | Pass 1 has NO encounter awareness | CRITICAL | Entities cannot be linked to encounters |
| 2 | Pass 1 uses raw image as PRIMARY input | HIGH | Prevents OCR-only processing |
| 3 | Pass 1 only processes FIRST page image | HIGH | Multi-page documents partially processed |
| 4 | `final_encounter_id` column never populated | CRITICAL | Pass 2 cannot use encounter context |
| 5 | Spatial format mismatch (SpatialElement[] vs XY format) | MEDIUM | Requires format translation |
| 6 | `profile_classification_audit` table repurposed | MEDIUM | May need new table or columns |

### 7.2 Strategy-A Transformation Requirements

#### Phase 1: Input Transformation
- [ ] Remove `raw_file` from `Pass1Input` interface
- [ ] Add `enhanced_ocr_xy: string` field
- [ ] Add `encounter_context: EncounterInfo[]` field
- [ ] Add `safe_split_points: SplitPoint[]` field

#### Phase 2: Encounter Integration
- [ ] Query `healthcare_encounters` for encounter boundaries
- [ ] Pass encounter context to AI prompt
- [ ] Assign `final_encounter_id` to each entity

#### Phase 3: Prompt Transformation
- [ ] Rewrite prompt for OCR-only input
- [ ] Add encounter context section
- [ ] Update processing instructions

#### Phase 4: Worker Integration
- [ ] Update `runPass1()` to load encounters
- [ ] Update `runPass1()` to load enhanced OCR XY
- [ ] Remove image download for Vision API
- [ ] Add parallel encounter processing (optional)

#### Phase 5: Database Updates
- [ ] Populate `final_encounter_id` on insert
- [ ] Populate `encounter_assignment_method`
- [ ] Populate `encounter_assignment_confidence`

### 7.3 Preserved Components

The following should be preserved with minimal changes:
- Three-tier entity classification taxonomy
- Entity subtype to schema mapping
- Processing priority logic
- Translation layer (AI response to database)
- Database builder (7 table records)
- Confidence scoring logic
- Manual review queue logic

### 7.4 Files to Create/Modify

| File | Action | Priority |
|------|--------|----------|
| `pass1/strategy-a/types.ts` | Create new | HIGH |
| `pass1/strategy-a/prompts.ts` | Create new | HIGH |
| `pass1/strategy-a/StrategyAEntityDetector.ts` | Create new | HIGH |
| `pass1/strategy-a/encounter-loader.ts` | Create new | HIGH |
| `worker.ts` (runPass1 method) | Modify | HIGH |
| `pass1-translation.ts` | Minor updates | MEDIUM |
| `pass1-database-builder.ts` | Minor updates | MEDIUM |
| `pass1-schema-mapping.ts` | No changes | LOW |

---

## Appendix A: Full Database Column Lists

### entity_processing_audit (57 columns)
```
id, shell_file_id, patient_id, entity_id, original_text, entity_category,
entity_subtype, unique_marker, location_context, spatial_bbox, page_number,
pass1_confidence, requires_schemas, processing_priority, pass2_status,
pass2_confidence, pass2_started_at, pass2_completed_at, enrichment_errors,
final_event_id, final_encounter_id, final_observation_id, final_intervention_id,
final_condition_id, final_allergy_id, final_vital_id, processing_session_id,
pass2_model_used, pass2_token_usage, pass2_cost_estimate, ai_visual_interpretation,
visual_formatting_context, ai_visual_confidence, ocr_reference_text, ocr_confidence,
ocr_provider, ai_ocr_agreement_score, spatial_mapping_source, discrepancy_type,
discrepancy_notes, visual_quality_assessment, validation_flags, cross_validation_score,
manual_review_required, manual_review_completed, manual_review_notes, manual_reviewer_id,
profile_verification_confidence, pii_sensitivity_level, compliance_flags, created_at,
updated_at, search_variants, encounter_assignment_method, encounter_assignment_score,
encounter_assignment_confidence, temporal_precision
```

### healthcare_encounters (75 columns)
```
id, patient_id, encounter_type, encounter_start_date, provider_name, provider_type,
facility_name, specialty, chief_complaint, summary, clinical_impression, billing_codes,
source_shell_file_id, related_shell_file_ids, requires_review, archived, created_at,
updated_at, clinical_event_id, primary_narrative_id, valid_from, valid_to,
superseded_by_record_id, supersession_reason, is_current, extracted_dates, date_source,
date_conflicts, clinical_identity_key, page_ranges, spatial_bounds, identified_in_pass,
is_real_world_visit, pass_0_5_confidence, ocr_average_confidence, encounter_end_date,
is_planned_future, master_encounter_id, master_encounter_confidence, all_shell_file_ids,
source_method, encounter_timeframe_status, cascade_id, chunk_count, reconciliation_key,
start_page, start_boundary_type, start_marker, start_text_y_top, start_text_height,
start_y, end_page, end_boundary_type, end_marker, end_text_y_top, end_text_height,
end_y, position_confidence, completed_at, reconciled_from_pendings, patient_full_name,
patient_date_of_birth, patient_mrn, patient_address, facility_address, matched_profile_id,
match_confidence, match_status, is_orphan_identity, data_quality_tier, quality_criteria_met,
quality_calculation_date, encounter_source, manual_created_by, created_by_user_id,
api_source_name, api_import_date, start_marker_context, end_marker_context,
start_region_hint, end_region_hint
```

---

**Document Complete**
**Next:** `02-PASS-1-STRATEGY-A-IMPLEMENTATION-PLAN.md`


Xavier's thoughts 28th nov 2025:
Ive just done some thinking, im now thinkning that pass1 may not require the 
xy coordinate ocr format version (its 4x the input tokens so seeing if its 
essential for pass 1 to receive that version). So we need to ask what the 
ulitmate role is for pass1, and whether that role requires xy ocr version like 
pass2 likely does. Pass 1's role is to indentify and label the all the clinical 
entities within the page and within all pages of the file, with the purpose 
behind this being to indentify which bridge schemas are needed for pass 2 so 
that pass 2 outputs everything that is demanded of it for that type of clinical 
entity (because there are so many possible types of clinical entities it is 
impossible to give 1 ai all the possible bridge schemas). So this begs the 
question, does pass 1 need to identify every clincial entity, or does it just 
need look at a page and determine what bridge schemas are needed without 
actually picking out and labelling every single clincial entity? It seems like 
there might just need to a deciosn on whether we give pass 1 more of a 
magnifying glass and more indepth extractiont tasks, or whether we give pass 1 
more of a simple sumarizing type task - leaving pass 2 to do more of the work. 
If we make pass 1 a lighter role, then we would only give it the Y coorindate 
ocr output - asking it to just identify more broadly what zones of the page 
require what bridge schemas (path result section is a big bbox zone and requires
 path result bridge schema, where as the medication list section from y to y 
cooridnates requires medication bridge schema, etc), then we lean more on pass 2
 giving it the full xy ocr output as it will need to go way more indepth 
extracting every medication or every path result (along with all relevant 
context) according to the provided schemas.  Another way of looking at it that 
may help our decision making is that pass 2 definitly needs the bridge schemas, 
which will be a lot of input tokens, and i think it definitly also needs the xy 
coorindates as it needs to be able to decipher columns, such as columns of 
successive differently dated path results within a table, sot herefore i think 
the question remaining is wehtehr pass 1 needs the xy coorindate data? im 
starting to think it doesnt and we slihhtly pivot pass 1 to silently identifying
 the three tiers of clincial entities just so that it can work out what the 
required bridge schemas are.   what do you think about all this? im a bit unsure


Xavier's thoughts 28th nov 2025: 
I have something else to add into the mix that we haven't actually remembered to put in yet, and that's Pass 1.5 and its requirement to add a specific medical code to an extracted clinical entity. Pass 1.5, as per the current design, needs a clinical entity extracted by Pass 1 in order to do its job, which is to provide Pass 2 with a shortlisted set of matching medical codes for Pass 2 to select from. The medical code concept is important in the current design because it enables deduplication and temporal management (for example, you might upload another discharge summary two weeks later that contains much of the same information, such as an identical allergy list or medication list, and so all those clinical entities from both files, separated in time, will have a lot of overlap—so there needs to be dedicated mechanisms for this, and the medical code system was designed for that purpose). If we go down the route of a "light" Pass 1, then we would have to redesign the medical code system, possibly by moving it after Pass 2 and using the extracted clinical entities from Pass 2, perhaps building another AI API call to simply find the best medical code. However, that said, I think it's best if we document these ideas and thoughts here but, instead, actually turn Pass 1 back on and test it using some of the files we've been experimenting with, to see what the actual outputs look like. That way, we can get a clearer idea of the Pass 1 token counts and capacity, with the only variable changed being the switch from the old OCR format to the new OCR formats (we can try both the XY coordinate format and the Y coordinate format and compare). But, before that, I want you to review the latest job run from when we were last testing Pass 1; the shell_file id was fbed75ec-ba6d-4c16-8b80-54868e9c851e. Look at pass1_entity_metrics and entity_processing_audit and report back with how it looks—I want a full audit of that latest job. I want to know what went into it (OCR—what type of OCR format, did the actual pixel image go in as well?), whether the spatial coordinates it output for each clinical entity extracted are correct, and general overall performance. Also check any other tables you find relevant for this assessment.  



Estimated Token Breakdown for 10,686 input tokens for the single page uploaded to Pass 1 in Early October 2025:

  | Component             | Estimated Tokens | Notes                                 |
  |-----------------------|------------------|---------------------------------------|
  | System prompt         | ~200             | PASS1_SYSTEM_MESSAGE                  |
  | Classification prompt | ~2,500           | Entity taxonomy, rules, JSON schema   |
  | OCR extracted_text    | ~250             | 1,004 chars / 4 chars per token       |
  | Spatial mapping JSON  | ~1,500           | 100 word objects as JSON              |
  | Raw JPEG image        | ~6,200           | Remainder - vision model image tokens |

  The image is 6,200 tokens and ~58% of input tokens!

Now for question 4 - enabling Pass 1 with Y-only OCR and no image. This requires several changes:

⏺ Before I make these changes, let me confirm the approach with you:

  ---
  Proposed Changes for OCR-Only Pass 1 Test

  1. New Config Flag

  Add PASS1_OCR_ONLY=true environment variable to control this mode.

  2. Worker Changes (worker.ts)

  - When PASS1_OCR_ONLY=true:
    - Skip downloading processed JPEG image
    - Load enhanced-ocr-y.txt from storage
    - Pass enhanced OCR text to Pass 1 instead of spatial_mapping

  3. Prompt Changes (pass1-prompts.ts)

  - Create new function generatePass1ClassificationPromptOCROnly() that:
    - Removes "INPUT 1 - RAW DOCUMENT IMAGE" section
    - Changes "INPUT 2 - OCR REFERENCE DATA" to be PRIMARY
    - Updates instructions to not reference vision capabilities

  4. Pass1EntityDetector Changes

  - Skip adding image to the OpenAI message when OCR-only mode
  - Use text-only model call instead of vision model call

  ---
  Question before proceeding:

  Do you want me to:
  - A) Create a separate OCR-only code path (preserves existing dual-input mode)
  - B) Replace the existing dual-input mode entirely with OCR-only

  I'd recommend A so we can A/B test and compare results. We can toggle between modes with an
  environment variable.

  Should I proceed with option A?


Xavier's thoughts 28th nov 2025: 
I think that looks good, but I'm just going to word vomit for a bit to make sure my vision is expressed and it aligns: we eventually need an architecture where the pixel image can be included as needed to accompany the OCR, but OCR will always be primary. This is a shift from the previous system two months ago. At first, we'll only be testing OCR using the new enhanced OCR format, but we should leave the door open for the future so that, ideally, when Pass 0.5 identifies a non-text Block—like an image, graph, or table, anything without text—we can send that zone through a pathway that includes pixels for both Pass 1 and Pass 2. So our design now needs to accommodate a primary OCR-only pathway and a secondary OCR-plus-pixel pathway. The secondary pixel pathway could be used just for specific zones, so, for example, if Pass 1 receives three pages of input from an uploaded file in a batch, and one zone on the second page contains a non-text Block (like a graph), then for that zone a cropped area of the pixel raw image would accompany the OCR, allowing models like GPT-5 or Gemini 2.5 Flash (which are both vision-capable as well as text-capable) to process both types of input. All of this is the grand vision for Pass 1, but I understand that right now it might be best to proceed with a more primitive design for testing—such as what you've just described. So from my understanding, you want to create a new path that's OCR-only, while the old legacy path still exists, but with the plan that the legacy path will eventually be retired and we'll transition fully to the new vision-based system I explained. Is that correct? 


Yes, that's exactly correct. Let me confirm I understand your vision:

  Your Grand Vision (Future State)

  Pass 0.5 Output:
  ├── Encounter 1 (pages 1-3)
  │   ├── Zone A: Text content → OCR-only pathway
  │   ├── Zone B: Text content → OCR-only pathway
  │   └── Zone C: Graph/Image detected → OCR + cropped pixel pathway
  ├── Encounter 2 (pages 4-6)
  │   └── All zones: Text content → OCR-only pathway

  Key Principles:
  1. OCR is ALWAYS primary - Every zone gets enhanced OCR
  2. Pixels are SUPPLEMENTARY - Only added for non-text zones (graphs, images, tables without text)
  3. Zone-level decisions - Pass 0.5 flags which zones need pixel accompaniment
  4. Same AI model - GPT-5 or Gemini 2.5 Flash handles both pathways (they're multimodal)

  What We're Doing Now (Primitive Test)

  Current Test:
  ├── OLD PATH (legacy): Raw image PRIMARY + SpatialElement[] SECONDARY
  └── NEW PATH (test): Enhanced OCR Y-only, NO pixels

  Purpose: Test if Pass 1 can work with OCR-only to establish baseline before building the grand
  vision.

  The Plan

  1. Now: Create OCR-only test path alongside legacy path
  2. Test: Compare OCR-only vs legacy dual-input quality
  3. Later: Discard legacy path entirely
  4. Future: Build the zone-aware system where:
    - Most zones → OCR-only
    - Non-text zones → OCR + cropped pixel region

  Confirmation

  Yes, the old legacy path (raw image PRIMARY) will eventually be discarded. We're keeping it
  temporarily only for comparison testing. The future is OCR-primary with selective pixel
  supplementation for non-text zones.

  Should I proceed with creating the OCR-only test path now?




  New strategy a design for pass 1:
  1. Pass 1 role/tasks and purpose:
    - Identify bridge scehmas for pass 2
      - Bridge scehmas are needed by pass 2 to correctly extract all necessary data in the correct format as per db schemas.
        - A secondary task here for pass 1 could be to go a little deeper and categorize ocr data into 'bridge schemas regions'. Where y to y coordinate zones are marked and recorded. 
          - This feature would fascilitate efficient batching by 'bridge schema zone'. 
          - For example, in a 20 page file with 5 seperate path result sections scattered throughout the 20 pages. If they are all identified as a 'results' 'bridge schema zone' then they can all be grouped together and sent to their own pass 2 api call that requires only the 1 bridge schema AND runs in parralel to other batched zones. Furthermore, we could parralel all 5 seperate path zones and cache the prompt + results bridge schema, meaning the processing time is 4 times as fast with only a minor increase in token cost (caching reduces cost by 90%). This architectural design would not only speed up pass 2 processing whihc is invaluable to UX, but also potentiially allow us to use cheaper ai models as the computation and reasoning and context volumes will be lower. 
  2. Extract all clincial entities that need a medical code shortlist assigned to them by pass 1.5 (pass 1.5 shorltist for each clincial entity handed across to pass2 for selection during pass 2 ai call)
    - The information that the pass 1 ai needs to output is only that which is necessary for the pass1.5 module to successfully function and generate the best possible shortlist of medical codes for each clincial entity, to hand across to pass 2. 
      - atm the pass 1.5 universal_medical_codes table has the the entity_type column that i believe has the following options;
              'medication'::character varying,
              'condition'::character varying,
              'procedure'::character varying,
              'observation'::character varying,
              'allergy'::character varying,
              'lab_result'::character varying,
              'vital_sign'::character varying,
              'physical_finding'::character varying
      - so all pass1 really needs to do is identify the entity (original text), the entity_type so that we can easily do some entity_type filtering to make pass1.5's job easier, before lexial and semantic vector matching/short-listing occurs. 
      - But also, it would be a good idea for pass1 to output some additional alias names or synonym names to further help pass1.5 in ase the original text fo the extracted entity is alternative or spelling mistake or rare brand name or region specific name etc. (but maybe cap it to 3 alias 1 word texts to avoid output token bloat). 

Then pass 2 will take over:
  1. Pass 2 will receive at most 1 encounter to analyse per api call (encounters discovery performed in pass 0.5). 
    - If the encounter is high volume (or the economomics and UX -processing time - indicate it) the encounter will be broken up into inteligently determined batches, primarily based on the identified bridge schema zones. 
    - For a given batch, pass 2 will receive 
      a. A brief context package that provides context about the encounter within which the batch, and clinical entities, reside.
          - Not sure how helpful to the pass 2 ai this will be, or whether it will alter the quality and accuracy of the output at all, but worth including for now. 
      b. The enhanced ocr output specific to the batch, containing the text + xy coordinates for each word within the batch
          - xy coordinates (via the enhanced-xy-ocr format) are needed to:
            - Assign bounding boxes to each clinical entity. To reduce token output by 50% the ai need only output 1 y and 1 x. With a post-ai cross-analysis function to find the other two vertices
            - Allow the pass 2 ai model to 'see' the layout of strangely formatted text, such as path result tables with lateral columns. This is the real reason why xy coordinates are needed for pass 2.
      c. The specific bridge scehma to help guide the enrichment process and output requiremnts 
      d. A list of all the pass 1 clinical entities (original text markers) that it must 'enrich'
          - Each clinical entity will come with a shortlist of matched medical codes (~ 10-20 maybe). 
  2. Pass 2 will also have a second side alley system for any non-text blocks identified and labeled within the ocr output data, such as non-text images, graphs etc. 
    - If this second path is triggered by the presence of non-text blocks, then the cropped pixels will be sent to accompany the enhanced xy ocr output within the pass 2 api call, for the given batch. 
    - For now pass 1 does not need to be involved at all int his second side alley non-text block pathway, and hopefully pass 2 can deal with it itself without the prep material that pass 1 provides it. 
        

End outcome: 
  - Every clinical entity from the uploaded file is extracted labeled and stored inteligently, with all context recorded and preserved, with all clincial entitiy relationships and encoutner-clincial-entity relationship links preserved and utilized come frontend display and user interacation. 
  - The above relationships will be used for pass 3 Narrative generation (future concept). 
  - Future vision: Complety change the way users and doctors view and keep track of healthcare, replacing a document-centric or document-reliant approach to more meaningul narrative approach. Instead of referring to a document or file you refer to the narrative, which only used the file once off to gather and learn the ifnormation to build and bolster the health narrative and sub narratives. 