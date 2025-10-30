# Pass 1.5 Medical Code Embedding - Master Implementation Plan

**Purpose:** Vector similarity search service providing AI with 10-20 relevant medical code candidates to prevent hallucination while enabling semantic matching

**Status:** SapBERT embedding generation 42% complete (6,046/14,381 PBS codes)

**Last Updated:** October 22, 2025

---

## Current Status

**Phase 6 - SapBERT Embedding Generation: IN PROGRESS**
- PBS medication embeddings: 6,046/14,381 (42.04% complete)
- Running locally
- Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext (768 dimensions)
- Strategy: Normalized text (17.3pp better than OpenAI per Experiment 2)

**Completed Phases:**
- Phase 1: Database schema (Migration 26 - versioning fields)
- Phase 2: Data acquisition (PBS: 14,381, MBS: 6,001 codes)
- Phase 3: Data parsing (standardized JSON format)
- Phase 4: OpenAI embeddings (20,382 codes, kept for comparison)
- Phase 5: Normalized text population (Migration 30 - normalized_embedding_text)

**Validated Decisions:**
- Experiment 2 validated SapBERT superiority (75.3% vs 58.0% OpenAI)
- Pure vector search insufficient (40% accuracy baseline)
- Hybrid retrieval required (70% lexical + 30% vector target)
- Normalized text strategy confirmed (5.4pp better than ingredient-only)

---

## Executive Summary

Pass 1.5 is a lightweight vector similarity search service that sits between Pass 1 entity detection and Pass 2 clinical enrichment. It retrieves 10-20 relevant code candidates each from pre-embedded regional and universal medical libraries (PBS, MBS, RxNorm, SNOMED, LOINC) using vector similarity search, preventing AI code hallucination while maintaining semantic matching capability.

**Core Function:**
```
Pass 1 Entity → Embed Query Text → Vector Search → Top-K Candidates → Pass 2 AI Selection
```

**Key Characteristics:**
- NOT an AI processing pass (no LLM inference during search)
- Lightweight pgvector database queries only
- Separate job_type within single Render.com worker (batch preparation pattern)
- Medical-domain optimized with SapBERT embeddings for medications
- Hybrid retrieval architecture combining lexical and vector search

**Cost Profile:**
- Initial setup: $0.03 USD (PBS/MBS embedding generation, one-time)
- Runtime: $0.0000004 per entity (negligible with caching)
- 20x reduction in AI context costs vs full code database

---

## Architecture Overview

### Three-Pass Pipeline Position

```
Pass 1: Entity Detection (OPERATIONAL)
  ↓
  Outputs 40 entities: "Blood Pressure: 128/82 mmHg", "Lisinopril 10mg", etc.
  ↓
Pass 1.5: Vector Code Search (THIS SYSTEM)
  ↓
  For each entity:
    1. Select embedding text (Smart Entity-Type Strategy)
    2. Generate embedding (SapBERT for meds, OpenAI for others)
    3. Search regional + universal code libraries (pgvector)
    4. Apply hybrid retrieval (lexical + vector)
    5. Return top 10-20 candidates with similarity scores, for both regional and universal.
  ↓
  Outputs: Entity → [10-20 code candidates]
  ↓
Pass 2: Clinical Enrichment (DESIGNED)
  ↓
  AI selects best code from candidates + extracts structured data
  Writes to medical_code_assignments table
```

### Entity Type Routing Architecture

**Critical Design Decision:** Medications AND Procedures receive specialized treatment from the START of Pass 1.5:

```
Pass 1 Entities (40 total)
  ↓
  Entity Type Classification
  ↓
┌───────────────┬───────────────┬────────────────────┐
│  MEDICATIONS  │  PROCEDURES   │  OTHER TYPES       │
│  (Fork Path)  │  (Fork Path)  │  (Standard Path)   │
├───────────────┼───────────────┼────────────────────┤
│ • SapBERT     │ • OpenAI      │ • OpenAI           │
│   embeddings  │   embeddings  │   embeddings       │
│ • Hybrid      │ • Hybrid      │ • Simple vector    │
│   search      │   search      │   search           │
│   (semantic + │   (lexical    │ • Top 10-20        │
│   lexical)    │   70% +       │   candidates       │
│ • Gradient    │   semantic    │ • Status: PENDING  │
│   candidates  │   30%)        │   (no libraries)   │
│   (3-30 codes)│ • AI-generated│                    │
│               │   search      │ Includes:          │
│ PBS: 14,382   │   variants    │ • Lab results      │
│ codes         │   (max 5)     │   (LOINC)          │
│               │               │ • Conditions       │
│ Status:       │ MBS: 6,001    │   (SNOMED)         │
│ ✓ VALIDATED   │ codes         │ • Allergies        │
│ (Exp 2,3,4)   │               │   (SNOMED)         │
│               │ Status:       │ • Vitals           │
│               │ ✓ VALIDATED   │                    │
│               │ (Exp 5)       │                    │
└───────────────┴───────────────┴────────────────────┘
```

**Rationale:**

**Medications** (Experiment 4): Require specialized handling due to:
- Brand name variations (Ventolin, Panadol Osteo vs generic names)
- Dose-specific matching requirements
- Signal dilution in embeddings (brand names buried in long text)
- Need for lexical fallback when semantic search fails

**Procedures** (Experiment 5): Require specialized handling due to:
- Semantic terminology mismatch ("X-ray" vs "direct radiography")
- Medical synonym failures ("replacement" vs "arthroplasty")
- Abbreviation expansion failures ("CT" vs "Computed tomography")
- Verbose MBS descriptions diluting embedding signal

**Other entity types** (lab results, conditions, allergies) use standard OpenAI embeddings with simple vector search pending code library availability.

---

## Medication-Specific Hybrid Search Strategy

### Experiment 4 Validation Results

**Test Dataset:** 30 realistic Pass 1 medication entities from actual medical documents

**Semantic Search Performance (SapBERT alone):**
- Success rate: 73.3% (22/30 correct in top-20)
- Failed entities: Brand names without dose information
  - "Ventolin" → Failed (no dose specified)
  - "Panadol Osteo" → Failed (Australian brand, not in PubMed training)
- Success pattern: Generic names with dose → 95%+ accuracy
  - "Lisinopril 10mg" → Perfect match
  - "Metformin 500mg" → Perfect match

**Critical Discovery:** Brand names ARE in embeddings but suffer signal dilution:
```
Query: "Ventolin" (7 characters)
Database embedding: "salbutamol pressurised inhalation 100 micrograms... ventolin cfc-free with dose counter" (160+ characters)
Result: Brand name signal diluted by dominant ingredient/dose text
```

**Lexical Search Rescue (search_text field):**
- Using `search_text ILIKE '%ventolin%'` → 100% success
- Using `search_text ILIKE '%panadol osteo%'` → 100% success
- **CRITICAL:** Must use `search_text` field (contains brands), NOT `display_name` (generic only)

**Hybrid Strategy Expected Performance:** 95-100% success rate

### Confidence-Based Gradient Candidate System

**Problem:** High-confidence matches waste context by sending 20 candidates to Pass 2 when top match is 99% accurate.

**Solution:** Variable candidate count based on confidence tiers (saves 45-55% context tokens on average):

```typescript
async function searchMedicationCodes(queryText: string) {
  const semanticResults = await searchSapBERTCodes(queryText, limit: 30);
  const topScore = semanticResults[0].similarity_score;

  // TIER 1: Extreme Confidence (≥95%)
  if (topScore >= 0.95) {
    return {
      candidates: semanticResults.slice(0, 3),
      confidence: 'EXTREME',
      reasoning: 'Top match ≥95% similarity - virtually certain'
    };
  }

  // TIER 2: High Confidence (≥85%)
  else if (topScore >= 0.85) {
    return {
      candidates: semanticResults.slice(0, 7),
      confidence: 'HIGH',
      reasoning: 'Top match ≥85% similarity - high confidence'
    };
  }

  // TIER 3: Moderate-High Confidence (≥75%)
  else if (topScore >= 0.75) {
    return {
      candidates: semanticResults.slice(0, 10),
      confidence: 'MODERATE_HIGH',
      reasoning: 'Top match ≥75% similarity - correct ingredient/dose likely'
    };
  }

  // TIER 4: Moderate Confidence (≥60%) - Hybrid Mode Conservative
  else if (topScore >= 0.60) {
    const lexicalResults = await searchByText(
      queryText,
      column: 'search_text',  // CRITICAL: Use search_text (contains brands)
      limit: 10
    );
    return {
      candidates: deduplicateAndMerge(semanticResults.slice(0, 10), lexicalResults),
      confidence: 'MODERATE',
      reasoning: 'Top match 60-75% - supplementing with lexical search'
    };
  }

  // TIER 5: Low Confidence (<60%) - Hybrid Mode Aggressive
  else {
    const lexicalResults = await searchByText(
      queryText,
      column: 'search_text',
      limit: 20
    );
    return {
      candidates: deduplicateAndMerge(semanticResults, lexicalResults).slice(0, 30),
      confidence: 'LOW',
      reasoning: 'Top match <60% - aggressive lexical supplementation'
    };
  }
}
```

**Threshold Justification (from Experiment 4):**
- **75% threshold**: Natural performance cliff observed
  - Everything ≥75%: Correct ingredient + dose (high precision)
  - Everything <75%: Wrong ingredient or missing dose (failures)
- **95% threshold**: Virtual certainty (exact matches)
- **85% threshold**: High confidence with minor variations
- **60% threshold**: Conservative hybrid trigger

**Context Savings Analysis:**
- High confidence matches (≥85%): Send 3-7 codes vs 20 = 65-85% savings
- Moderate confidence (75-85%): Send 10 codes vs 20 = 50% savings
- Low confidence (<75%): Send 15-30 codes vs 20 = 0-50% cost increase
- **Average savings: 45-55% across typical workload**

**Expected Performance:**
- Hybrid search target: >95% accuracy (correct code in final candidates)
- Latency: <500ms p95 per entity
- Validated against 30-entity realistic test set from Experiment 4

---

## Procedure-Specific Hybrid Search Strategy

**Status:** ✓ VALIDATED via Experiment 5 (October 22, 2025)

**Root Cause Identified:** OpenAI text-embedding-3-small is INSUFFICIENT for MBS procedure matching due to semantic terminology mismatch between casual medical language and formal MBS descriptions.

### Evidence of OpenAI Failure

**Critical Failures:**
- **Cholecystectomy:** Exact term in entity text and MBS code → similarity < 0.0 (catastrophic)
- **Chest X-ray (5 variations):** All formats failed → "Chest (lung fields) by direct radiography"
- **CT scan head:** Failed to map "CT" → "Computed tomography" and "head" → "brain"
- **Ultrasound abdomen:** Very similar terminology yet similarity < 0.0

**Experiment 5 Results:** 13/35 entities (37.1%) returned zero results despite correct codes existing in database.

### Hybrid Search Architecture

**Code Matching Algorithm:**

1. **Pass 1 Enhancement:**
   - AI outputs `search_variants` array (max 5 variants) for ALL entities destined for Pass 1.5
   - Includes synonyms, abbreviations, formatting variations, medical terminology
   - Example: "Chest X-ray" → ["chest x-ray", "chest radiography", "CXR", "thoracic radiograph", "lung fields x-ray"]

2. **Lexical Phase (70% weight):**
   - Fast text matching against MBS `normalized_embedding_text` or `search_text`
   - Match ALL variants in `search_variants` array using ILIKE
   - Returns initial candidate pool (typically 10-50 codes)
   - Deterministic, handles spelling/formatting variations

3. **Semantic Phase (30% weight):**
   - OpenAI embedding cosine similarity on lexical candidates
   - Reranks candidates by semantic relevance
   - Fills gaps where lexical matching insufficient
   - Uses original `entity_text`, NOT variants

4. **Weighted Combination:**
   - Normalized lexical score × 0.70
   - Normalized semantic score × 0.30
   - Final ranked candidate list (Top 10-20)

**Cost Estimate:**
- AI variant generation: ~$0.0002 per entity (GPT-4o mini)
- 40 entities per document: ~$0.008 per document
- Negligible cost increase vs pure vector search

### Search Variants Schema

**Pass 1 Output Enhancement:**
```typescript
{
  entity_text: string;           // Original extracted text
  entity_type: string;           // 'procedure' | 'medication' | etc
  search_variants: string[];     // NEW: Max 5 AI-generated variants
  confidence: number;
  bounding_box?: BoundingBox;
}
```

**Variant Generation Prompt Template:**
```
Given the medical procedure: "{entity_text}"
Generate up to 5 search variants including:
- Synonyms (medical and common language)
- Abbreviations (e.g., CXR, CT, ECG)
- Formatting variations (hyphenation, capitalization, spacing)
- Anatomical variations (e.g., "left knee" → "knee left")

Return as JSON array of strings, max 5 variants.
```

### MBS Code Characteristics

**Database:** 6,001 Australian procedure codes
**Embedding Model:** OpenAI text-embedding-3-small (1536d) - VALIDATED as insufficient for pure vector search
**Hybrid Approach:** Required due to verbose MBS descriptions diluting semantic signal

**Example MBS Code:**
```
Code: 58500
Display: "Chest (lung fields) by direct radiography (NR)"
Search Text: "MBS 58500... Chest (lung fields) by direct radiography (NR)"
```

**Challenges:**
- Long descriptive text (up to 200+ characters)
- Negative definitions ("not being a service to which...")
- Formal medical terminology vs casual language
- No summary field exists in government MBS data source

---

## Worker Architecture & Job Flow

### Single Worker, Multiple Job Types

**Infrastructure Pattern:**
- ONE Render.com worker service ($7/month)
- Handles all passes (1, 1.5, 2, 3) via job_type routing
- No need for separate worker services
- Scales horizontally only if processing >500 documents/day

**Worker Job Loop:**
```typescript
// apps/render-worker/src/worker.ts
while (true) {
  const job = await claimNextJob()

  switch (job.job_type) {
    case 'process_document_pass1':
      await runPass1EntityDetection(job)
      break
    case 'process_document_pass1.5':
      await runPass1_5CodeMatching(job)
      break
    case 'process_document_pass2':
      await runPass2ClinicalExtraction(job)
      break
    case 'process_document_pass3':
      await runPass3NarrativeGeneration(job)
      break
  }
}
```

### Full Pipeline Job Flow

```
Document Upload
  ↓
Shell File Created (shell_files table)
  ↓
Enqueue Job: { job_type: 'process_document_pass1', shell_file_id: 123 }
  ↓
Worker claims job → Runs Pass 1 (OCR + OpenAI GPT-5-mini)
  - Detects 40 entities from document
  - Writes to entity_processing_audit table
  ↓
Complete Job → Enqueue NEW Job: { job_type: 'process_document_pass1.5', shell_file_id: 123 }
  ↓
Worker claims job → Runs Pass 1.5 Code Matching (THIS SYSTEM)
  For each of 40 entities:
    - Select embedding text (Smart Entity-Type Strategy)
    - Get embedding (SapBERT for meds, OpenAI for others - see fork logic below)
    - Run hybrid search RPC (lexical + vector)
    - Store top-20 code shortlist in pass15_code_candidates
  ↓
Complete Job → Enqueue NEW Job: { job_type: 'process_document_pass2', shell_file_id: 123 }
  ↓
Worker claims job → Runs Pass 2 Clinical Extraction (OpenAI GPT-5-mini)
  For each entity + shortlist:
    - Load appropriate bridge schema
    - Call OpenAI with entity + shortlist context
    - Extract structured clinical data
    - Write to patient_medications / patient_vitals / etc.
  ↓
Complete Job → Enqueue NEW Job: { job_type: 'process_document_pass3', shell_file_id: 123 }
  ↓
Worker claims job → Runs Pass 3 Narrative Generation (OpenAI GPT-5-mini)
  - Generate patient-friendly summary
  - Write to narrative tables
  ↓
Complete Job → Document fully processed
```

### Embedding Model Fork Logic

**Conditional Routing Based on Entity Type:**

```typescript
async function getEntityEmbedding(
  entityText: string,
  entityType: string
): Promise<number[]> {

  if (entityType === 'medication') {
    // Use SapBERT (medical-specific, 768 dimensions)
    // 75.3% accuracy vs 58.0% OpenAI per Experiment 2
    return await callHuggingFaceAPI({
      model: 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext',
      inputs: entityText
    })
  } else {
    // Use OpenAI embedding (general-purpose, 1536 dimensions)
    // For procedures, conditions, observations, etc.
    return await callOpenAIEmbedding({
      model: 'text-embedding-3-small',
      input: entityText
    })
  }
}
```

**Embedding Model Routing Table:**

| Entity Type | Embedding Model | Dimensions | Code System | Status | Notes |
|-------------|----------------|------------|-------------|--------|-------|
| medication | SapBERT | 768 | PBS (regional), RxNorm (universal) | VALIDATED | 17.3pp better accuracy, hybrid search required |
| procedure | OpenAI | 1536 | MBS (regional), CPT (universal) | ✓ VALIDATED - Hybrid Required (Exp 5) | Lexical (70%) + Semantic (30%) with AI variants |
| lab_result | OpenAI | 1536 | LOINC (universal only) | PLANNED | No regional Australian codes (LOINC is international standard) |
| condition | OpenAI | 1536 | SNOMED-CT (universal), ICD-10-AM (regional) | PLANNED | Generic embeddings likely sufficient |
| allergy | OpenAI | 1536 | SNOMED-CT (universal) | PLANNED | Generic embeddings likely sufficient |
| vital_sign | OpenAI | 1536 | LOINC (universal) | PLANNED | Generic embeddings likely sufficient |

**Runtime Model Selection:**
- Database field `active_embedding_model` indicates which embedding to use for search
- Query logic checks this field: `WHERE active_embedding_model = 'sapbert'` for medications
- Fallback to OpenAI embedding if SapBERT unavailable (field NULL or embedding NULL)
- Enables A/B testing and gradual migration between embedding models

### Entity-Specific Strategy Notes

**Medications (VALIDATED - Current Focus):**
- Strategy: SapBERT embeddings + hybrid search with confidence-based gradient candidates
- Regional codes: PBS (14,381 codes)
- Universal codes: RxNorm (pending UMLS approval, ~50,000 codes)
- Validation: Experiment 4 (30 realistic entities, 95%+ expected hybrid success)
- Special handling: Brand name fallback via `search_text` field

**Procedures (✓ VALIDATED - Experiment 5):**
- Strategy: OpenAI embeddings + hybrid search (lexical 70% + semantic 30%)
- AI-generated search_variants array (max 5 per entity)
- Regional codes: MBS (6,001 codes)
- Universal codes: CPT (pending, ~10,000 codes)
- Validation: Experiment 5 (35 realistic entities, pure OpenAI insufficient)

**Lab Results (UNIVERSAL CODES ONLY):**
- Strategy: OpenAI embeddings + simple vector search
- Regional codes: NONE - No Australian regional lab code system exists
- Universal codes: LOINC (pending UMLS approval, ~50,000 codes)
- Research findings (October 2025):
  - Australia mandates LOINC + SNOMED-CT per NPAAC 2025 requirements
  - RCPA SPIA Guidelines v4.0 require international standards
  - No proprietary regional Australian lab codes (confirmed via web research)
  - All major pathology providers (Sonic, etc.) use LOINC
- Cost savings: No need to purchase regional codes ($100 saved)

**Conditions/Allergies (PLANNED):**
- Strategy: OpenAI embeddings + simple vector search
- Regional codes: ICD-10-AM (Australian modifications, pending acquisition)
- Universal codes: SNOMED-CT (pending UMLS approval, ~100,000 codes)
- Assumption: Generic embeddings likely sufficient for clinical terminology matching
- Future consideration: Monitor accuracy and upgrade to domain model if needed

### Idempotence Strategy

**Retry Safety:**
```typescript
async function runPass1_5CodeMatching(job: Job): Promise<void> {
  // Check if already processed
  const existing = await supabase
    .from('pass15_code_candidates')
    .select('id')
    .eq('entity_id', job.entity_id)
    .single()

  if (existing) {
    // Already processed, skip (idempotent)
    return
  }

  // Process entity...
  const candidates = await hybridSearch(entity.embedding_text)

  // Store results (insert only, never update)
  await supabase.from('pass15_code_candidates').insert({
    entity_id: job.entity_id,
    patient_id: job.patient_id,
    embedding_text: entity.embedding_text,
    regional_candidates: candidates.regional,
    universal_candidates: candidates.universal
  })
}
```

**Error Handling:**
- Transient API failures → Retry with exponential backoff
- Persistent failures → Mark job failed, alert for manual review
- Database write failures → Rollback, retry entire job
- Embedding generation failures → Fallback to OpenAI (from SapBERT)

---

## Database Schema

### Medical Code Libraries

**regional_medical_codes** (Current: 20,382 Australian codes)
```sql
CREATE TABLE regional_medical_codes (
  id UUID PRIMARY KEY,
  code_system VARCHAR(20),              -- 'pbs', 'mbs', 'icd10_am'
  code_value VARCHAR(50),
  display_name TEXT,
  entity_type VARCHAR(20),              -- 'medication', 'procedure', 'condition'
  country_code CHAR(3) DEFAULT 'AUS',

  -- Normalized text (Migration 30)
  normalized_embedding_text TEXT,       -- Clean text for both lexical and vector
  search_text TEXT,                     -- Original verbose text (fallback)

  -- Dual embeddings (A/B testing, fallback safety)
  embedding VECTOR(1536),               -- OpenAI text-embedding-3-small (baseline)
  normalized_embedding VECTOR(1536),    -- OpenAI on normalized text
  sapbert_embedding VECTOR(768),        -- SapBERT (active for medications)

  -- Metadata
  sapbert_embedding_generated_at TIMESTAMPTZ,
  active_embedding_model VARCHAR(20) DEFAULT 'openai',
  library_version VARCHAR(20),
  valid_from DATE,
  valid_to DATE,
  active BOOLEAN DEFAULT TRUE,

  UNIQUE(code_system, code_value, country_code)
);

-- Indexes
CREATE INDEX idx_regional_sapbert_pbs
  ON regional_medical_codes USING ivfflat (sapbert_embedding vector_cosine_ops)
  WHERE code_system = 'pbs' AND country_code = 'AUS';

CREATE INDEX idx_regional_normalized_text_trgm
  ON regional_medical_codes USING gin (normalized_embedding_text gin_trgm_ops)
  WHERE entity_type = 'medication';
```

**universal_medical_codes** (Future: RxNorm, SNOMED, LOINC - ~200K codes)
```sql
CREATE TABLE universal_medical_codes (
  id UUID PRIMARY KEY,
  code_system VARCHAR(20),              -- 'rxnorm', 'snomed', 'loinc'
  code_value VARCHAR(50),
  display_name TEXT,
  entity_type VARCHAR(20),

  normalized_embedding_text TEXT,
  embedding VECTOR(1536),

  library_version VARCHAR(20),
  valid_from DATE,
  valid_to DATE,
  active BOOLEAN DEFAULT TRUE,

  UNIQUE(code_system, code_value)
);
```

**pass15_code_candidates** (Audit trail - MANDATORY for healthcare compliance)
```sql
CREATE TABLE pass15_code_candidates (
  id UUID PRIMARY KEY,
  entity_id UUID REFERENCES entity_processing_audit(id),
  patient_id UUID REFERENCES user_profiles(id),

  embedding_text TEXT,                  -- What text was embedded
  universal_candidates JSONB,           -- [{code_id, similarity_score}, ...]
  regional_candidates JSONB,            -- [{code_id, similarity_score}, ...]

  total_candidates_found INTEGER,
  search_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### Versioning Strategy

**Single table with temporal tracking** (NOT separate v1/v2 tables):
- `library_version` - 'v2024Q4', 'v2025Q1', etc.
- `valid_from` / `valid_to` - Temporal validity windows
- `superseded_by` - Link to replacement code (graceful transitions)
- Active codes: `WHERE valid_to IS NULL`
- Historical lookup: `WHERE valid_from <= date AND (valid_to IS NULL OR valid_to > date)`

**Quarterly Updates:**
- Typically <1,000 new codes per quarter
- Cost: ~$0.01 per update (1,000 codes × 20 tokens × $0.02/1M)
- No table replacement needed

---

## Smart Entity-Type Strategy

**Different entity types require different embedding text for optimal matching:**

```typescript
function getEmbeddingText(entity: Pass1Entity): string {
  const subtype = entity.entity_subtype;

  // Medications/Immunizations: Use clean standardized format from Pass 1
  if (['medication', 'immunization'].includes(subtype)) {
    return entity.original_text;  // "Lisinopril 10mg"
  }

  // Conditions/Allergies: Use AI-expanded clinical context
  if (['diagnosis', 'allergy', 'symptom'].includes(subtype)) {
    // AI expands abbreviations: "T2DM" → "Type 2 Diabetes Mellitus"
    if (entity.ai_visual_interpretation !== entity.original_text) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Vital Signs/Labs: Combine measurement value + context
  if (['vital_sign', 'lab_result', 'physical_finding'].includes(subtype)) {
    // Combine "128/82" + "Blood pressure reading" for better LOINC matching
    const parts = [entity.original_text];
    if (entity.visual_formatting_context) {
      parts.push(entity.visual_formatting_context);
    }
    return parts.join(' ').trim();
  }

  // Procedures: Use expanded descriptions when available
  if (subtype === 'procedure') {
    if (entity.ai_visual_interpretation?.length > entity.original_text.length) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Safe default
  return entity.original_text;
}
```

**Rationale:** Medical code systems expect different text formats:
- PBS/RxNorm: Clean drug names ("Metformin 500mg")
- SNOMED/ICD: Expanded clinical descriptions ("Type 2 Diabetes Mellitus")
- LOINC: Measurement context ("Blood pressure systolic and diastolic")

---

## Experiment 2 Results Summary

**Test Methodology:**
- 40 validated entities (20 medications, 10 procedures, 10 conditions)
- 4 models tested: OpenAI, SapBERT, BioBERT, Clinical-ModernBERT
- 3 text strategies: Original, Normalized, Core Ingredient
- Ground truth from manual expert validation

**Key Findings:**

**Medications (PBS codes):**
- SapBERT + Normalized: 75.3% accuracy (WINNER)
- OpenAI + Normalized: 58.0% accuracy
- Improvement: 17.3 percentage points
- Average similarity: 33.2% (SapBERT) vs 50.5% (OpenAI)

**Text Strategy Comparison (Medications):**
- Normalized text: 75.3% accuracy
- Core ingredient only: 69.9% accuracy
- Original verbose: 58.0% accuracy
- Normalized beats ingredient-only by 5.4pp

**Procedures (MBS codes):**
- OpenAI performs adequately (no SapBERT advantage)
- Continue using OpenAI embeddings for procedures

**Test Data Location:** `pass1.5-testing/experiment-2/test-data/final-40-entities.json`

---

## Implementation Progress

### Phase 1: Database Setup - COMPLETE
**Migration 26** (2025-10-15):
- Added versioning fields (library_version, valid_from, valid_to, superseded_by)
- Created pass15_code_candidates audit table
- Verified pgvector extension v0.8.0
- Created IVFFlat indexes

**Migration 30** (2025-10-20):
- Added normalized_embedding_text column
- Added normalized_embedding VECTOR(1536) column
- Applied to both regional and universal tables

**Migration 31** (2025-10-21):
- Added sapbert_embedding VECTOR(768) column
- Added sapbert_embedding_generated_at timestamp
- Added active_embedding_model tracking field
- Created SapBERT-specific IVFFlat index for PBS

### Phase 2-4: Data Acquisition & Embedding - COMPLETE

**Australian Regional Codes:**
- PBS: 14,381 medications parsed and embedded
- MBS: 6,001 procedures parsed and embedded
- Total: 20,382 Australian codes

**OpenAI Embeddings (Baseline):**
- Generated for all 20,382 codes
- Cost: ~$0.05 USD (one-time)
- Kept for A/B testing and fallback

**Normalized Text Population:**
- All 20,382 codes have normalized_embedding_text
- Normalization includes:
  - Unit standardization (g → mg, mcg → mg)
  - Salt form removal (hydrochloride, arginine, etc.)
  - Brand name extraction
  - Release type preservation (modified release, enteric coated)

### Phase 5: SapBERT Embeddings - IN PROGRESS (42%)

**Current Status:**
- Script: `apps/render-worker/src/pass15/generate-sapbert-embeddings.ts`
- Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext
- Progress: 6,046/14,381 PBS medications (42.04%)
- Rate: ~0.8 codes/second
- ETA: ~3 hours remaining
- Running locally with caffeinate to prevent sleep

**Resume-Safe Design:**
- Queries `.is('sapbert_embedding', null)` to skip completed codes
- Can safely restart if interrupted
- HuggingFace API retry logic with exponential backoff

### Phase 6: Hybrid Search - PENDING

**Next Steps:**
1. Create IVFFLAT index on sapbert_embedding (after generation completes)
2. Enable pg_trgm extension for fuzzy text matching
3. Implement helper RPC functions:
   - `extract_ingredient(query TEXT)` - Parse drug name from query
   - `extract_dose(query TEXT)` - Parse dose patterns ("500mg")
   - `extract_anatomy(query TEXT)` - Parse anatomy for procedures
4. Implement main RPC function:
   - `search_medications_hybrid(query, max_results, weights)`
   - Lexical filtering with ILIKE + pg_trgm similarity
   - Vector reranking on filtered subset
   - Configurable lexical/vector weight ratio (start 70/30)

**Validation Plan:**
- Test with 40 validated entities from Experiment 2
- Measure pure SapBERT vector accuracy (baseline ~75%)
- Measure hybrid search accuracy (target >95%)
- Expand to 100 medication test cases
- Include typos, abbreviations, edge cases

### Phase 7: Pass 2 Integration - PENDING

**Worker Module Structure:**
```typescript
// apps/render-worker/src/pass15/index.ts (isolated module)
export async function retrieveCodeCandidatesForBatch(
  entities: Entity[],
  countryCode: string = 'AUS'
): Promise<Map<UUID, CodeCandidate[]>> {
  // All Pass 1.5 logic isolated here
}

// apps/render-worker/src/pass2/Pass2ClinicalEnricher.ts
import { retrieveCodeCandidatesForBatch } from '../pass15';

async function processPass2Batch(entities: Entity[]) {
  const bridgeSchemas = loadBridgeSchemasForBatch(entities);
  const codeCandidates = await retrieveCodeCandidatesForBatch(entities);
  const result = await pass2AI(entities, bridgeSchemas, codeCandidates);
}
```

**Integration Pattern (Batch Preparation):**
- Pass 1.5 runs BEFORE the Pass 2 AI call (not during)
- Process all entities in batch to collect candidates
- Store in pass15_code_candidates table (MANDATORY for audit)
- Pass candidates to AI in single prompt
- AI selects from candidates (no code invention)

---

## Performance Targets

### Accuracy
- Medication matching (hybrid): >95% (correct code in top 5)
- Medication matching (pure SapBERT): ~75% (baseline from Experiment 2)
- Procedure matching: >90%
- Standalone formulation preference: >90% (vs combinations)

### Latency
- Vector search: <100ms p95
- Lexical filtering: <50ms p95
- Hybrid combined: <200ms p95
- Total Pass 1.5 per entity: <500ms (including embedding generation)

### Cost
- Initial setup: $0.05 USD (Australian codes, one-time)
- Runtime per entity: $0.0000004 (negligible with caching)
- Quarterly updates: ~$0.01 per 1,000 new codes
- Token savings: 20x reduction vs full code database in AI prompt

### Cache Efficiency
- Expected hit rate: 85-90% (common medications pre-cached)
- Cache memory: ~50MB (14,381 PBS embeddings: 768-dim float32 × 4 bytes = 42MB + overhead)
- Cache TTL: 24 hours
- Warmup: Load all PBS codes on worker startup

---

## Integration with Pass 2

### Data Flow

```
Pass 2 Worker Starts
  ↓
1. Fetch pending entities (40 entities from Pass 1)
  ↓
2. Group by schema requirements (20 need vitals schema, etc.)
  ↓
FOR EACH BATCH:
  ↓
  Step A: Load bridge schemas
  ↓
  Step B: Pass 1.5 code candidate retrieval (THIS SYSTEM)
    - For each entity in batch (parallel):
      a) Select embedding text (Smart Entity-Type Strategy)
      b) Generate embedding (SapBERT for meds, OpenAI for others)
      c) Hybrid search (lexical + vector)
      d) Select top 10-20 candidates
      e) Store in pass15_code_candidates table
    - Result: Map<entity_id, CodeCandidate[]>
  ↓
  Step C: Single AI call to Pass 2
    - Input: entities + schemas + code candidates
    - Output: Selected codes + structured data
  ↓
  Step D: Write results
    - patient_vitals / patient_medications (clinical data)
    - medical_code_assignments (code linkage)
    - code_resolution_log (audit trail)
    - Update entity_processing_audit.pass2_status
```

### Pass 2 AI Prompt Structure

```
You are analyzing medical entities from a healthcare document.

ENTITY: "Lisinopril 10mg"
Type: medication

MEDICAL CODE CANDIDATES (from hybrid search):
1. PBS:2062K - "Lisinopril tablet 10mg" (similarity: 0.94)
2. PBS:9302H - "Lisinopril tablet 5mg" (similarity: 0.87)
3. PBS:1234X - "Perindopril tablet 10mg" (similarity: 0.78)
... (7 more candidates)

TASK: Select the most appropriate code from the candidates provided.
IMPORTANT: Only select from provided candidates. Do not invent codes.
```

---

## Audit Trail Requirements

### pass15_code_candidates Table (MANDATORY)

**Healthcare Compliance Rationale:**
1. Complete audit trail for medical data processing
2. Track what options AI had available vs what it selected
3. Identify vector search failures ("correct code wasn't in candidate list")
4. Training data for improving both search and AI selection
5. Debugging tool for embedding strategy effectiveness

**Relationship with code_resolution_log:**

```
pass15_code_candidates (Pre-AI Selection)
  - What options were available?
  - What were the similarity scores?
  - How long did vector search take?
  ↓
Pass 2 AI Selection
  ↓
code_resolution_log (Post-AI Selection)
  - What code was chosen?
  - What confidence score?
  - Did fallback trigger?
```

**Cost Analysis:**
- Storage: ~480 bytes per entity (20 UUIDs + 20 floats + metadata)
- Cost: ~$0.005 per 1M entities
- Trade-off: Essential for healthcare compliance, negligible cost

---

## Monitoring & Metrics

### Performance Metrics
- Vector search latency (p50, p95, p99)
- Lexical filter selectivity (candidates reduced %)
- Hybrid search accuracy (% correct in top-K)
- Cache hit rate (%)
- Embedding generation latency
- Total Pass 1.5 duration per entity

### Quality Metrics
- Code assignment accuracy (selected code was in top-K candidates)
- Candidate relevance (average similarity scores)
- Empty candidate lists (rate and reasons)
- Manual review triggers (low confidence matches)

### Cost Metrics
- OpenAI API calls per hour
- HuggingFace API calls per hour
- API costs per hour
- Cache savings (API calls avoided)
- Storage costs (pass15_code_candidates table)

### Error Metrics
- API failures (OpenAI, HuggingFace)
- pgvector query errors
- Database write errors
- Fallback triggers

---

## Risk Mitigation

### Risk 1: Vector Search Quality Degradation
**Mitigation:**
- Dual embedding storage (OpenAI + SapBERT) for A/B testing
- Hybrid search reduces dependence on vector-only matching
- Comprehensive validation with 40-entity ground truth set
- Monitoring of candidate relevance scores
- Manual review queue for low-similarity matches

### Risk 2: API Availability (OpenAI, HuggingFace)
**Mitigation:**
- Pre-compute all PBS medication embeddings (eliminates 85% of API calls)
- 24-hour embedding cache (reduces remaining calls by 70%)
- Fallback from SapBERT to OpenAI on API failure
- Retry logic with exponential backoff
- Alert on sustained API errors

### Risk 3: Medical Code Library Updates
**Mitigation:**
- Versioning system tracks old codes (valid_to field)
- superseded_by field links to replacement codes
- Never delete deprecated codes (audit trail)
- Manual review queue for low-confidence matches
- Test updates in staging before production

### Risk 4: Cost Overruns
**Mitigation:**
- Hard limit on API calls per hour
- Real-time cost monitoring dashboard
- Alert on cost thresholds
- Cache effectiveness monitoring
- Ability to adjust cache TTL dynamically

### Risk 5: Regulatory Compliance
**Mitigation:**
- Mandatory pass15_code_candidates table (complete audit trail)
- Every code selection logged in code_resolution_log
- RLS policies on all audit tables
- Immutable audit records (append-only)
- Regular compliance audits

---

## Next Steps

### Immediate (After SapBERT Embedding Completes)

**Step 1: Create Indexes** (Migration 32)
```sql
-- IVFFLAT index for vector similarity (already created in Migration 31)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regional_medical_codes_sapbert_embedding_pbs
  ON public.regional_medical_codes
  USING ivfflat (sapbert_embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE code_system = 'pbs' AND country_code = 'AUS';

-- GIN index for fuzzy text matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regional_normalized_text_trgm
  ON public.regional_medical_codes
  USING gin (normalized_embedding_text gin_trgm_ops)
  WHERE entity_type = 'medication';

-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Step 2: Validate SapBERT Embeddings**
- Run 40 validated entities from Experiment 2 through pure vector search
- Verify ~75% accuracy matches experimental results
- Check embedding dimensions (768) and vector format
- Spot-check similarity scores vs ground truth

**Step 3: Implement Hybrid Search RPC**
- Create helper functions (extract_ingredient, extract_dose)
- Create search_medications_hybrid() with configurable weights
- Test with 40 validated entities
- Measure accuracy improvement (target >95%)

**Step 4: Extended Validation**
- Expand test set to 100 medications
- Include typos, abbreviations, brand names, combinations
- Measure precision/recall metrics
- Document failure patterns

**Step 5: Performance Optimization**
- Benchmark query latency (target <500ms p95)
- Tune lexical/vector weight ratio
- Optimize batch sizes
- Monitor cache effectiveness

### Future Expansion

**Phase 1: Universal Medical Codes (Pending UMLS Approval):**
- RxNorm: ~50,000 medication codes (universal alternative to PBS)
- SNOMED-CT: ~100,000 condition/procedure codes (universal terminology)
- LOINC: ~50,000 observation/lab codes (international standard, NO regional alternative)
- Total: ~200,000 universal codes
- Cost: ~$0.20 USD (embedding generation, one-time)
- Timeline: 3 business days after UMLS account approval

**Phase 2: Validate Procedure Strategy (Future):**
- Test MBS procedure matching accuracy with OpenAI embeddings
- Evaluate if domain-specific model or hybrid search needed
- Expand test set to 50+ procedure entities
- Document procedure-specific challenges (anatomy matching, CPT vs MBS differences)

**Phase 3: Expand to Other Entity Types (Future):**
- Conditions: ICD-10-AM (regional) + SNOMED-CT (universal)
- Allergies: SNOMED-CT (universal only)
- Vital signs: LOINC (universal only)
- All using OpenAI embeddings unless validation shows otherwise

**Multi-Region Support:**
- UK: NHS-DM+D, BNF codes
- US: NDC, CPT codes
- Same table structure with country_code discriminator

**Procedure Hybrid Search:**
- Similar pattern to medications
- Anatomy + procedure type extraction
- MBS code validation

---

## Related Documentation

### Implementation Planning (This Folder)
- SESSION-PLAN-2025-10-21.md - Current session plan
- CRITICAL-FINDING-PURE-VECTOR-INSUFFICIENT.md - Why hybrid needed
- MBS-PROCEDURE-VALIDATION-RESULTS.md - Procedure validation findings
- pass1.5-testing/experiment-2/COMPREHENSIVE_ANALYSIS.md - SapBERT validation
- **pass1.5-testing/experiment-4-realistic-pass1-extracted-text/ANALYSIS_SUMMARY.md** - Realistic entity validation, brand name findings, hybrid strategy validation

### Database Schema
- current_schema/03_clinical_core.sql - Clinical tables (lines 1236-1315)
- migration_history/2025-10-15_26_add_medical_code_versioning.sql
- migration_history/2025-10-20_30_add_normalized_embedding_text.sql
- migration_history/2025-10-21_31_add_sapbert_embedding.sql

### Worker Implementation
- apps/render-worker/src/pass15/ - Pass 1.5 module (when implemented)
- apps/render-worker/src/pass15/generate-sapbert-embeddings.ts - Batch script
- apps/render-worker/src/pass15/normalization.ts - Text normalization logic

### Integration Points
- Pass 2 Clinical Enrichment (future integration)
- Medical Code Resolution System

---

**Last Updated:** October 22, 2025

**Current Phase:** 5 of 7 (SapBERT embedding generation 42% complete)

**Next Milestone:** Implement hybrid search RPC functions after embedding completion

**Recent Updates:**
- Added entity type routing architecture (medications fork to specialized path)
- Documented medication-specific hybrid search strategy (Experiment 4 findings)
- Implemented confidence-based gradient candidate system (95%, 85%, 75%, 60% thresholds)
- Confirmed LOINC-only strategy for lab results (no regional Australian codes exist)
- Marked procedure strategy as "needs validation" (Phase 2 milestone)
