# Pass 1.5 Implementation Plan - Medical Code Embedding

**Purpose:** Authoritative reference plan for Pass 1.5 vector embedding system

**Status:** Planning Complete - Ready for implementation

**Created:** 2025-10-14
**Last Updated:** 2025-10-15

---

## Executive Summary

Pass 1.5 is a **vector similarity search service** that provides AI with 10-20 relevant medical code candidates instead of overwhelming it with 300,000+ possible codes. This prevents hallucination while maintaining semantic matching power.

**Core Function:** Convert clinical entity text → vector embedding → retrieve similar medical codes → pass to Pass 2

**Key Characteristics:**
- NOT an AI processing pass (no LLM calls)
- Lightweight vector database search only
- Runs as isolated module within Pass 2 worker
- Batch preparation before Pass 2 AI call

**Cost Profile:**
- Initial setup: ~$0.23 USD (one-time embedding generation)
- Runtime: ~$0.0000004 per entity (essentially free)
- 90% reduction in AI context costs vs full code database

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
    1. Generate embedding from entity text (Smart Entity-Type Strategy)
    2. Search universal + regional code libraries (pgvector)
    3. Return top 10-20 candidates with similarity scores
  ↓
  Outputs: Entity → [10-20 code candidates]
  ↓
Pass 2: Clinical Enrichment (DESIGNED)
  ↓
  AI selects best code from candidates + extracts structured data
  Writes to medical_code_assignments table
```

### Integration with Pass 2 (Batch Preparation Pattern)

**CRITICAL DESIGN DECISION:** Pass 1.5 runs BEFORE the Pass 2 AI call, not during it.

```
┌─────────────────────────────────────────────────────────────┐
│ Pass 2 Worker Starts                                        │
│ 1. Fetch pending entities (40 entities from Pass 1)        │
│ 2. Group by required schemas (e.g., 20 vital sign entities)│
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ For Each Batch Group (e.g., 20 vital sign entities):       │
│                                                             │
│ Step A: Prepare Bridge Schemas                             │
│   - Load patient_vitals bridge schema (detailed/minimal)   │
│   - Load patient_observations bridge schema                │
│                                                             │
│ Step B: Prepare Medical Code Candidates (PASS 1.5) ⭐      │
│   FOR EACH entity in batch (parallel processing):          │
│     1. Read entity from entity_processing_audit            │
│     2. Select embedding text (Smart Entity-Type Strategy)  │
│     3. Generate embedding via OpenAI API                   │
│     4. Search universal_medical_codes (pgvector)           │
│     5. Search regional_medical_codes (pgvector, AUS)       │
│     6. Combine + rank + filter (5-20 candidates)           │
│     7. Store in pass15_code_candidates table (MANDATORY)   │
│                                                             │
│   RESULT: Map<entity_id, CodeCandidate[]>                  │
│   {                                                         │
│     entity1_id: [15 LOINC codes with similarity scores],  │
│     entity2_id: [12 LOINC codes with similarity scores],  │
│     ...                                                     │
│   }                                                         │
│                                                             │
│ Step C: Single AI Call to Pass 2                           │
│   INPUT: {                                                  │
│     entities: [20 vital sign entities],                    │
│     bridgeSchemas: {vitals, observations},                 │
│     codeCandidates: {entity_id → [code candidates]}        │
│   }                                                         │
│   OUTPUT: {                                                 │
│     entity1: {                                              │
│       selected_code: "LOINC:85354-9",                      │
│       structured_data: {...}                               │
│     },                                                      │
│     entity2: {...},                                         │
│     ...                                                     │
│   }                                                         │
│                                                             │
│ Step D: Write Results                                      │
│   - Insert into patient_vitals (20 rows)                   │
│   - Insert into medical_code_assignments (20 rows)         │
│   - Insert into code_resolution_log (20 rows)              │
│   - Update entity_processing_audit.pass2_status            │
└─────────────────────────────────────────────────────────────┘
```

### Worker Architecture (Hybrid Module Design)

**DECISION:** Pass 1.5 runs as an **isolated module within the Pass 2 worker process**.

```typescript
// apps/render-worker/src/pass15/index.ts (isolated module)
export async function retrieveCodeCandidatesForBatch(
  entities: Entity[]
): Promise<Map<UUID, CodeCandidate[]>> {
  // All Pass 1.5 logic isolated in this module
}

// apps/render-worker/src/pass2/Pass2ClinicalEnricher.ts
import { retrieveCodeCandidatesForBatch } from '../pass15';

async function processPass2Batch(entities: Entity[]) {
  const bridgeSchemas = loadBridgeSchemasForBatch(entities);
  const codeCandidates = await retrieveCodeCandidatesForBatch(entities);  // Pass 1.5

  const result = await pass2AI(entities, bridgeSchemas, codeCandidates);
}
```

**Benefits:**
- Clean separation of concerns
- Pass 1.5 logic fully isolated
- No worker-to-worker communication overhead
- Simple integration interface

---

## Key Decisions and Rationales

### 1. Smart Entity-Type Strategy (CONFIRMED)

**Different entity types need different text for optimal embedding matching.**

```typescript
function getEmbeddingText(entity: Pass1Entity): string {
  const subtype = entity.entity_subtype;

  // Medications/Immunizations: AI-cleaned standardized format
  if (['medication', 'immunization'].includes(subtype)) {
    return entity.original_text;  // "Lisinopril 10mg"
  }

  // Diagnoses/Conditions/Allergies: Expanded clinical context
  if (['diagnosis', 'allergy', 'symptom'].includes(subtype)) {
    // AI often expands abbreviations: "T2DM" → "Type 2 Diabetes Mellitus"
    if (entity.ai_visual_interpretation !== entity.original_text) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Vital Signs/Labs: Need measurement type context
  if (['vital_sign', 'lab_result', 'physical_finding'].includes(subtype)) {
    // Combine "128/82" + "Blood pressure reading" = better match
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

  // Healthcare Identifiers: Exact text only
  if (['patient_identifier', 'provider_identifier'].includes(subtype)) {
    return entity.original_text;
  }

  // Safe default
  return entity.original_text;
}
```

**Rationale:** Different medical code systems expect different text formats:
- RxNorm/PBS: Standardized drug names
- SNOMED/ICD: Expanded clinical descriptions
- LOINC: Measurement types with context

### 2. Medical Code Library Versioning (CONFIRMED)

**Single table with version tracking fields (NOT separate v1/v2 tables)**

```sql
-- VERSIONING FIELDS (to be added to existing tables via migration)
library_version VARCHAR(20),       -- 'v1.0', 'v2.0', 'v2024Q1'
valid_from DATE,                   -- When this code became active
valid_to DATE,                     -- NULL = currently active, else deprecated date
superseded_by UUID                 -- Link to replacement code (if deprecated)
```

**Benefits:**
- Single query for latest codes (`WHERE valid_to IS NULL`)
- Historical lookup possible (`WHERE valid_from <= date AND (valid_to IS NULL OR valid_to > date)`)
- Audit trail preserved (never delete deprecated codes)
- Graceful code transitions (superseded_by links)

**Update Strategy:**
- Quarterly updates (~1,000 new codes per quarter)
- Cost: ~$0.01 per update (1,000 codes × 50 tokens × $0.02/1M)
- No table replacement needed

### 3. Audit Table Strategy (MANDATORY)

**DECISION:** `pass15_code_candidates` table is **MANDATORY**, not optional.

```sql
CREATE TABLE pass15_code_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entity_processing_audit(id) NOT NULL,
  patient_id UUID REFERENCES user_profiles(id) NOT NULL,

  -- What was embedded
  embedding_text TEXT NOT NULL,

  -- Candidates retrieved from vector search
  universal_candidates JSONB NOT NULL,  -- [{code_id, code_system, code_value, display_name, similarity_score}, ...]
  regional_candidates JSONB NOT NULL,   -- [{code_id, code_system, code_value, display_name, similarity_score}, ...]

  -- Metadata
  total_candidates_found INTEGER NOT NULL,
  search_duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- RLS
  CONSTRAINT fk_patient FOREIGN KEY (patient_id) REFERENCES user_profiles(id)
);

CREATE INDEX idx_pass15_entity ON pass15_code_candidates(entity_id);
CREATE INDEX idx_pass15_patient ON pass15_code_candidates(patient_id);
```

**Rationale:**
1. **Healthcare Compliance**: Complete audit trail required for medical data processing
2. **AI Accountability**: Track what options AI had available vs what it selected
3. **Quality Monitoring**: Identify vector search failures ("correct code wasn't in candidate list")
4. **Training Data**: Essential for improving both vector search and AI selection
5. **Cost Negligible**: ~480 bytes per entity = ~$0.005 per 1M entities
6. **Debugging**: Critical for troubleshooting embedding strategy effectiveness

**Relationship with `code_resolution_log`:**

```
pass15_code_candidates (Pre-AI Selection)
  - What options were available?
  - What were the similarity scores?
  - How long did vector search take?
  ↓
Pass 2 AI Selection
  ↓
code_resolution_log (Post-AI Selection)
  - What was chosen?
  - What confidence score?
  - Did fallback trigger?
```

### 4. Code Candidate Selection Strategy (CONFIRMED)

**Hybrid Approach with Confidence Thresholds:**

```typescript
interface CandidateSelectionConfig {
  MIN_CANDIDATES: 5;
  MAX_CANDIDATES: 20;
  AUTO_INCLUDE_THRESHOLD: 0.85;
  MIN_SIMILARITY: 0.60;
  TARGET_CANDIDATES: 10;
}

const CONFIG: CandidateSelectionConfig = {
  MIN_CANDIDATES: 5,
  MAX_CANDIDATES: 20,
  AUTO_INCLUDE_THRESHOLD: 0.85,
  MIN_SIMILARITY: 0.60,
  TARGET_CANDIDATES: 10
};

export function selectCodeCandidates(
  rawCandidates: CodeCandidate[]
): CodeCandidate[] {

  // Step 1: Filter out low similarity candidates
  const filtered = rawCandidates.filter(
    c => c.similarity_score >= CONFIG.MIN_SIMILARITY
  );

  // Step 2: Auto-include high confidence candidates
  const highConfidence = filtered.filter(
    c => c.similarity_score >= CONFIG.AUTO_INCLUDE_THRESHOLD
  );

  // Step 3: Fill to target of 10 candidates
  const remaining = filtered.filter(
    c => c.similarity_score < CONFIG.AUTO_INCLUDE_THRESHOLD
  );
  const toInclude = Math.max(CONFIG.TARGET_CANDIDATES - highConfidence.length, 0);
  const additional = remaining.slice(0, toInclude);

  // Step 4: If many good matches (>= 0.75), include up to 20 total
  const goodMatches = filtered.filter(c => c.similarity_score >= 0.75);
  const finalList = goodMatches.length > 10
    ? goodMatches.slice(0, CONFIG.MAX_CANDIDATES)
    : [...highConfidence, ...additional];

  // Step 5: Ensure minimum of 5 candidates (if available)
  if (finalList.length < CONFIG.MIN_CANDIDATES && filtered.length >= CONFIG.MIN_CANDIDATES) {
    return filtered.slice(0, CONFIG.MIN_CANDIDATES);
  }

  return finalList;
}
```

**Benefits:**
- Token cost control (hard cap at 20)
- Quality guarantee (min 0.60 threshold)
- Flexibility based on match quality
- Always provides options (min 5 if available)

---

## Database Schema Requirements

### Current State vs Required State

**Universal Medical Codes Table:**

```sql
-- CURRENT STATE (03_clinical_core.sql lines 1236-1259)
CREATE TABLE IF NOT EXISTS universal_medical_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_system VARCHAR(20) NOT NULL CHECK (code_system IN ('rxnorm', 'snomed', 'loinc')),
    code_value VARCHAR(50) NOT NULL,
    display_name TEXT NOT NULL,
    embedding VECTOR(1536),
    entity_type VARCHAR(20) NOT NULL,
    search_text TEXT NOT NULL,
    synonyms TEXT[] DEFAULT ARRAY[]::TEXT[],
    usage_frequency INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code_system, code_value)
);

-- MISSING FIELDS (need migration):
-- library_version VARCHAR(20)
-- valid_from DATE
-- valid_to DATE
-- superseded_by UUID
```

**Regional Medical Codes Table:**

```sql
-- CURRENT STATE (03_clinical_core.sql lines 1261-1284)
CREATE TABLE IF NOT EXISTS regional_medical_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_system VARCHAR(20) NOT NULL CHECK (code_system IN ('pbs', 'mbs', 'icd10_am')),
    code_value VARCHAR(50) NOT NULL,
    display_name TEXT NOT NULL,
    embedding VECTOR(1536),
    entity_type VARCHAR(20) NOT NULL,
    country_code CHAR(3) NOT NULL DEFAULT 'AUS',
    search_text TEXT NOT NULL,
    synonyms TEXT[] DEFAULT ARRAY[]::TEXT[],
    usage_frequency INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code_system, code_value, country_code)
);

-- MISSING FIELDS (need migration):
-- library_version VARCHAR(20)
-- valid_from DATE
-- valid_to DATE
-- superseded_by UUID
```

**Missing Table:**

```sql
-- DOES NOT EXIST (need migration)
CREATE TABLE pass15_code_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entity_processing_audit(id) NOT NULL,
  patient_id UUID REFERENCES user_profiles(id) NOT NULL,

  embedding_text TEXT NOT NULL,

  universal_candidates JSONB NOT NULL,
  regional_candidates JSONB NOT NULL,

  total_candidates_found INTEGER NOT NULL,
  search_duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_patient FOREIGN KEY (patient_id) REFERENCES user_profiles(id)
);

CREATE INDEX idx_pass15_entity ON pass15_code_candidates(entity_id);
CREATE INDEX idx_pass15_patient ON pass15_code_candidates(patient_id);
```

### Migration Required

**Next Step:** Create migration to:
1. Add versioning fields to `universal_medical_codes`
2. Add versioning fields to `regional_medical_codes`
3. Create `pass15_code_candidates` table
4. Update RLS policies if needed

---

## Medical Code Libraries

### Universal Codes (~200,000 codes)

**RxNorm** (~50,000 active codes)
- **Source**: Free from NIH (National Library of Medicine)
- **Coverage**: Medications (generic + brand names)
- **Update Frequency**: Monthly
- **License**: Free for clinical use
- **Download**: https://www.nlm.nih.gov/research/umls/rxnorm/

**SNOMED-CT** (~100,000 active codes)
- **Source**: SNOMED International (membership required)
- **Coverage**: Conditions, procedures, body structures
- **Update Frequency**: Bi-annual (January, July)
- **License**: Free for SNOMED members (Australia is member nation)
- **Download**: https://www.snomed.org/

**LOINC** (~50,000 active codes)
- **Source**: Regenstrief Institute
- **Coverage**: Observations, lab tests, clinical measurements
- **Update Frequency**: Bi-annual (June, December)
- **License**: Free for clinical use
- **Download**: https://loinc.org/

### Regional Codes - Multi-Region Support

**ARCHITECTURE NOTE:** All regional codes stored in **single table** with `country_code` discriminator (ISO 3166-1 alpha-3). The `regional_medical_codes` table supports multiple countries via:
- `country_code CHAR(3)` - e.g., 'AUS', 'USA', 'GBR', 'DEU', 'FRA'
- `code_system` - e.g., 'pbs', 'mbs', 'nhs_dmd', 'bnf', 'ndc', 'cpt', 'icd10_am', 'icd10_gm'

**Australia (~28,000 codes):**

**PBS (Pharmaceutical Benefits Scheme)** (~3,000 active codes)
- **Source**: Australian Government Department of Health
- **Coverage**: Subsidized medications in Australia
- **Update Frequency**: Monthly
- **License**: Free (public data)
- **Download**: http://www.pbs.gov.au/

**MBS (Medicare Benefits Schedule)** (~5,000 active codes)
- **Source**: Australian Government Department of Health
- **Coverage**: Medical services covered by Medicare
- **Update Frequency**: Quarterly
- **License**: Free (public data)
- **Download**: http://www.mbsonline.gov.au/

**ICD-10-AM** (~20,000 codes)
- **Source**: Australian Consortium for Classification Development (ACCD)
- **Coverage**: Diagnoses and procedures (Australian modification)
- **Update Frequency**: Annual (July 1)
- **License**: Licensed (fee required)
- **Download**: https://www.accd.net.au/

**Future Expansion (Same Table):**
- UK: NHS-DM+D (~15,000), BNF codes
- US: NDC (~150,000), CPT codes
- Germany: PZN codes, ICD-10-GM
- France: CIP codes

---

## Embedding Generation

### OpenAI API Configuration (Verified 2025)

**Model:** `text-embedding-3-small`
- **Dimensions:** 1536 (default) - **Configurable down to 512** via API parameter
- **Cost:** $0.02 per 1M tokens (5x cheaper than ada-002)
- **Performance:** 44.0% MIRACL, 62.3% MTEB (major improvement over ada-002)
- **Context length:** 8,191 tokens per input (hard limit, must chunk if exceeded)
- **Encoding:** cl100k_base tokenizer
- **Batch limit:** ~100 inputs per API request
- **Total batch limit:** ~300K tokens across all inputs in single request

**Dimension Configuration Trade-offs:**
- **1536 dimensions:** Best accuracy, standard choice
- **1024 dimensions:** 33% smaller embeddings, minimal accuracy loss
- **512 dimensions:** 66% smaller embeddings, moderate accuracy loss
- **Recommendation:** Start with 1536, benchmark 1024 in Phase 7 validation

**Alternative Options for Future Consideration:**
- **Voyage-3-lite:** Better performance at 1/5 the cost ($0.004 per 1M tokens)
- **Medical-specific models:** BioBERT, ClinicalBERT, PubMedBERT (domain-optimized)

### Initial Population Cost

**Universal Codes (200,000):**
- Average search text length: ~50 tokens
- Total tokens: 200,000 × 50 = 10M tokens
- Cost: 10M × $0.02 / 1M = **$0.20 USD**

**Regional Codes (28,000):**
- Average search text length: ~50 tokens
- Total tokens: 28,000 × 50 = 1.4M tokens
- Cost: 1.4M × $0.02 / 1M = **$0.03 USD**

**Total Initial Population:** **~$0.23 USD**

### Runtime Cost (Per Entity Search)

**Per entity embedding:**
- Average entity text: ~20 tokens
- Cost per embedding: 20 × $0.02 / 1M = **$0.0000004 USD**
- Essentially free (~400 embeddings per penny)

**Caching Strategy:**
- Cache embeddings for 24 hours
- Expected 70% cache hit rate
- Reduces runtime costs by 70%

---

## Implementation Checklist

### Phase 1: Database Setup ✅ COMPLETE (2025-10-15)
- [X] Create migration for versioning fields (library_version, valid_from, valid_to, superseded_by)
- [X] Create migration for pass15_code_candidates table
- [X] Apply migrations via Supabase MCP (Migration 26)
- [X] Update current_schema/*.sql files (03_clinical_core.sql, 04_ai_processing.sql)
- [X] Verify pgvector extension installed and indexes created (v0.8.0, IVFFlat indexes active)

### Phase 2: Data Acquisition ⏳ IN PROGRESS (2025-10-15)
- [X] Create data acquisition guide (DATA-ACQUISITION-GUIDE.md)
- [X] Create directory structure (data/medical-codes/{system}/raw + processed)
- [X] USER: Register for UMLS account (awaiting approval, 1-2 business days)
- [ ] USER: Download RxNorm data from NIH (after UMLS approval)
- [ ] USER: Download SNOMED-CT data (after UMLS approval)
- [ ] USER: Download LOINC data (after UMLS approval)
- [X] USER: Download PBS data from Australian Government (32 CSV files, 7.6 MB items.csv)
- [X] USER: Save PBS CSV files to data/medical-codes/pbs/raw/
- [X] USER: Download MBS data from Australian Government (XML format, Nov 2025 update)
- [X] USER: Save MBS XML to data/medical-codes/mbs/raw/
- [ ] USER: (Optional) Research IHACPA ICD-10-AM license (~$100 AUD)

**STATUS UPDATE (2025-10-15 EOD):**
- PBS and MBS data acquired and organized ✅
- UMLS account registration submitted, awaiting approval ⏳
- Ready to begin PBS/MBS parser implementation while waiting for UMLS

### Phase 3: Data Preparation
- [X] Design parsing strategy (PARSING-STRATEGY.md)
- [ ] Implement RxNorm parser (parse-rxnorm.ts)
- [ ] Implement SNOMED-CT parser (parse-snomed.ts)
- [ ] Implement LOINC parser (parse-loinc.ts)
- [ ] Implement PBS parser (parse-pbs.ts)
- [ ] Implement MBS parser (parse-mbs.ts)
- [ ] Implement ICD-10-AM parser (parse-icd10am.ts)
- [ ] Parse all code systems to standardized JSON
- [ ] Validate parsed output (record counts, schema compliance)

### Phase 4: Embedding Generation
- [X] Create embedding generation script (generate-embeddings.ts)
- [X] Create embedding generation guide (EMBEDDING-GENERATION-GUIDE.md)
- [ ] Set up OpenAI API key in environment
- [ ] Generate embeddings for universal codes (200,000 codes, ~$0.20)
- [ ] Generate embeddings for regional codes (28,000 codes, ~$0.03)
- [ ] Validate embedding dimensions (1536)
- [ ] Verify all codes have embeddings

### Phase 5: Database Population
- [X] Create database population script (populate-database.ts)
- [X] Create database population guide (DATABASE-POPULATION-GUIDE.md)
- [ ] Set up Supabase environment variables
- [ ] Run dry run test (--dry-run flag)
- [ ] Populate universal_medical_codes table
- [ ] Populate regional_medical_codes table
- [ ] Verify pgvector indexes active
- [ ] Run validation queries (record counts, embeddings)

### Phase 6: Worker Implementation
- [ ] Create apps/render-worker/src/pass15/ directory
- [ ] Implement getEmbeddingText() function (Smart Entity-Type Strategy)
- [ ] Implement generateEmbedding() function (OpenAI API)
- [ ] Implement searchMedicalCodeCandidates() function (pgvector)
- [ ] Implement selectCodeCandidates() function (filtering)
- [ ] Implement caching layer (24-hour TTL)
- [ ] Implement error handling and fallbacks
- [ ] Add logging and monitoring

### Phase 7: Pass 2 Integration
- [ ] Update Pass 2 worker to import Pass 1.5 module
- [ ] Implement batch preparation pattern (Step B)
- [ ] Update Pass 2 AI prompts to include code candidates
- [ ] Implement code_resolution_log writes (Step D)
- [ ] Test end-to-end flow (Pass 1 → 1.5 → Pass 2)

### Phase 8: Validation and Testing
- [ ] Create validation test suite
- [ ] Test embedding quality (expected code matches)
- [ ] Test vector search performance (<100ms p95)
- [ ] Test code assignment accuracy (>95%)
- [ ] Test caching effectiveness (>70% hit rate)
- [ ] Test error handling and fallbacks

### Phase 9: Deployment
- [ ] Deploy database migrations to production
- [ ] Populate medical code libraries (run embedding script)
- [ ] Deploy updated Pass 2 worker to Render.com
- [ ] Monitor performance and costs
- [ ] Set up quarterly update cron job

---

## Performance Targets

### Latency
- **Vector search latency:** <100ms p95
- **Total Pass 1.5 duration:** <200ms per entity (including embedding generation)
- **Embedding generation:** <50ms per entity (cached 70% of time)

### Accuracy
- **Code assignment accuracy:** >95% (selected code in top 10 candidates)
- **Candidate relevance:** >90% (top candidate similarity > 0.75)
- **Recall:** >98% (correct code present in candidate list)

### Cost
- **Initial setup:** $0.23 USD (one-time)
- **Runtime:** $0.0000004 per entity (negligible)
- **Token savings:** 20x reduction vs full code database in prompt
- **Quarterly updates:** ~$0.01 per update

### Reliability
- **Availability:** >99.9% (pgvector + Supabase)
- **Cache hit rate:** >70% (24-hour TTL)
- **Fallback success:** 100% (always returns empty array on failure)

---

## Monitoring and Observability

### Key Metrics

**Performance Metrics:**
- Vector search latency (p50, p95, p99)
- Embedding generation latency
- Cache hit rate
- Total Pass 1.5 duration per entity

**Quality Metrics:**
- Candidate relevance scores (average, median)
- Codes selected from top-N candidates (histogram)
- Empty candidate lists (rate)
- Manual review triggers (rate)

**Cost Metrics:**
- OpenAI API calls per hour
- OpenAI API costs per hour
- Cache savings (API calls avoided)
- Storage costs (pass15_code_candidates table)

**Error Metrics:**
- OpenAI API errors
- pgvector query errors
- Database write errors
- Fallback triggers

### Dashboards

**Real-time Monitoring:**
- Pass 1.5 processing rate (entities/second)
- Vector search latency (live graph)
- Cache hit rate (rolling average)
- API error rate

**Quality Dashboard:**
- Code assignment accuracy (daily)
- Candidate relevance distribution
- Manual review rate (daily)
- Empty candidate list rate

**Cost Dashboard:**
- OpenAI API costs (daily, monthly)
- Storage costs (pass15_code_candidates)
- Cost per entity processed
- Cost savings vs alternatives

---

## Risk Mitigation

### Risk 1: Medical Code Library Updates

**Risk:** Quarterly updates may introduce breaking changes or deprecated codes.

**Mitigation:**
- Versioning system tracks old codes (`valid_to` field)
- `superseded_by` field links to replacement codes
- Never delete deprecated codes (audit trail)
- Manual review queue for low-confidence matches
- Test updates in staging before production

### Risk 2: Vector Search Quality Degradation

**Risk:** Embedding strategy may not work well for certain entity types.

**Mitigation:**
- Comprehensive validation test suite
- Monitoring of candidate relevance scores
- `pass15_code_candidates` audit table tracks all searches
- Ability to adjust Smart Entity-Type Strategy per entity type
- Manual review queue for low-similarity matches

### Risk 3: OpenAI API Availability

**Risk:** OpenAI API outage would block Pass 1.5 processing.

**Mitigation:**
- 24-hour embedding cache (70% hit rate)
- Graceful fallback returns empty array (Pass 2 handles)
- Retry logic with exponential backoff
- Alert on sustained API errors
- Consider pre-computing embeddings for common entities

### Risk 4: Cost Overruns

**Risk:** Higher than expected API costs due to cache misses or usage patterns.

**Mitigation:**
- Hard limit on API calls per hour
- Monitor costs in real-time dashboard
- Alert on cost thresholds
- Cache effectiveness monitoring
- Ability to adjust cache TTL dynamically

### Risk 5: Regulatory Compliance

**Risk:** Audit trail may be insufficient for healthcare compliance.

**Mitigation:**
- Mandatory `pass15_code_candidates` table (complete audit trail)
- Every code selection logged in `code_resolution_log`
- RLS policies on all audit tables
- Immutable audit records (append-only)
- Regular compliance audits

---

## Related Documentation

### Implementation Planning (This Folder)
- **PASS-1.5-OVERVIEW.md** - Architectural overview (reference)
- **README.md** - Quick reference and folder structure
- **technical-design/vector-search-architecture.md** - Core technical design
- **code-data-preparation/embedding-generation-plan.md** - Setup process
- **implementation/worker-functions.md** - Complete TypeScript spec

### Integration Points
- **../pass-2-clinical-enrichment/PASS-2-OVERVIEW.md** - Pass 2 integration
- **../pass-1-entity-detection/PASS-1-OVERVIEW.md** - Pass 1 reference

### Medical Code Resolution System
- **../../../V3_Features_and_Concepts/medical-code-resolution/README.md** - System overview
- **../../../V3_Features_and_Concepts/medical-code-resolution/simple-database-schema.md** - Database design
- **../../../V3_Features_and_Concepts/medical-code-resolution/embedding-based-code-matching.md** - Vector search architecture

### Database Schema
- **../../../current_schema/03_clinical_core.sql** - Clinical tables (lines 1236-1315)
- **../../../migration_history/** - Migration scripts and history

---

**Last Updated:** 2025-10-15
**Status:** Planning Complete - Ready for implementation
**Next Step:** Create migration for versioning fields and pass15_code_candidates table

