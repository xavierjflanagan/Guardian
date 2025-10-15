# Pass 1.5 Medical Code Embedding - Architectural Overview

**Status:** Planning Complete - Ready for implementation
**Created:** 2025-10-15
**Dependencies:** Pass 1 Entity Detection (operational), Medical code libraries (to be acquired)

---

## Purpose

**Provide AI with 10-20 relevant medical code candidates through vector similarity search, preventing code hallucination while maintaining semantic matching power.**

Pass 1.5 sits between Pass 1 entity detection and Pass 2 clinical enrichment, converting raw clinical entity text into shortlists of medical codes from universal (RxNorm, SNOMED, LOINC) and regional (PBS, MBS) code libraries.

---

## What is Pass 1.5?

**NOT an AI processing pass** - It's a vector similarity search service.

**Core Components:**
1. Pre-populated medical code database with vector embeddings (~228,000 codes)
2. pgvector similarity search engine (Postgres extension)
3. Smart entity-type-based text selection strategy
4. Top-K candidate retrieval service (5-20 candidates per entity)

**Why it exists:**
- Prevents AI hallucination of medical codes
- Reduces token costs (20x reduction vs sending full code database)
- Enables semantic matching (handles synonyms, typos, medical relationships)
- Supports Australian healthcare specificity (PBS/MBS codes)

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

### Pass 1.5 → Pass 2 Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Pass 1 Complete (40 entities waiting)                      │
│ - entity_processing_audit.pass2_status = 'pending'         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Pass 2 Worker Starts                                        │
│ 1. Fetch pending entities (40 entities)                    │
│ 2. Group by required schemas (e.g., 20 need vitals schema) │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ For Each Batch Group (e.g., 20 vital sign entities):       │
│                                                             │
│ Step A: Prepare Bridge Schemas                             │
│   - Load patient_vitals bridge schema                      │
│   - Load patient_observations bridge schema                │
│                                                             │
│ Step B: Prepare Medical Code Candidates (PASS 1.5) ⭐      │
│   - For entity 1: Get 15 LOINC code candidates             │
│   - For entity 2: Get 12 LOINC code candidates             │
│   - ...for all 20 entities in parallel                     │
│   - Store in pass15_code_candidates table (MANDATORY)      │
│                                                             │
│   PASS 1.5 PROCESS PER ENTITY:                             │
│   a) Read entity from entity_processing_audit              │
│   b) Select embedding text (Smart Entity-Type Strategy)    │
│   c) Generate embedding via OpenAI API                     │
│   d) Search universal_medical_codes (pgvector)             │
│   e) Search regional_medical_codes (pgvector, country=AUS) │
│   f) Combine + rank + filter (5-20 candidates)             │
│   g) Return candidates to Pass 2 worker                    │
│                                                             │
│ Step C: Single AI Call to Pass 2                           │
│   INPUT: {                                                  │
│     entities: [20 vital sign entities],                    │
│     bridgeSchemas: {vitals, observations},                 │
│     codeCandidates: {                                       │
│       entity1_id: [15 LOINC codes with scores],           │
│       entity2_id: [12 LOINC codes with scores],           │
│       ...                                                   │
│     }                                                       │
│   }                                                         │
│   OUTPUT: {                                                 │
│     entity1: {selected_code: "LOINC:85354-9", ...data},   │
│     entity2: {selected_code: "LOINC:8480-6", ...data},    │
│     ...                                                     │
│   }                                                         │
│                                                             │
│ Step D: Write Results                                      │
│   - Insert into patient_vitals (20 rows)                   │
│   - Insert into medical_code_assignments (20 rows)         │
│   - Update entity_processing_audit.pass2_status            │
└─────────────────────────────────────────────────────────────┘
```

---

## Smart Entity-Type Strategy

**Different entity types need different text for optimal embedding matching:**

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

---

## Database Schema

### Medical Code Libraries (Pre-Populated)

**universal_medical_codes** (~200,000 codes)
```sql
CREATE TABLE universal_medical_codes (
  id UUID PRIMARY KEY,
  code_system VARCHAR(20),           -- 'rxnorm', 'snomed', 'loinc'
  code_value VARCHAR(50),
  display_name TEXT,
  embedding VECTOR(1536),            -- OpenAI text-embedding-3-small
  entity_type VARCHAR(20),
  library_version VARCHAR(20),       -- 'v1.0', 'v2.0' (versioning)
  valid_from DATE,
  valid_to DATE,                     -- NULL = currently active
  active BOOLEAN,
  superseded_by UUID                 -- Link to replacement code
);

CREATE INDEX idx_universal_codes_vector
  ON universal_medical_codes USING ivfflat (embedding vector_cosine_ops);
```

**regional_medical_codes** (~28,000 codes for Australia)
```sql
CREATE TABLE regional_medical_codes (
  id UUID PRIMARY KEY,
  code_system VARCHAR(20),           -- 'pbs', 'mbs', 'icd10_am'
  code_value VARCHAR(50),
  display_name TEXT,
  embedding VECTOR(1536),
  entity_type VARCHAR(20),
  country_code CHAR(3),              -- 'AUS', 'GBR', 'USA', etc.
  library_version VARCHAR(20),
  valid_from DATE,
  valid_to DATE,
  active BOOLEAN,
  superseded_by UUID
);

CREATE INDEX idx_regional_codes_vector
  ON regional_medical_codes USING ivfflat (embedding vector_cosine_ops);
```

### Code Candidate Audit (Mandatory Storage)

**pass15_code_candidates** (audit trail for debugging/training)
```sql
CREATE TABLE pass15_code_candidates (
  id UUID PRIMARY KEY,
  entity_id UUID REFERENCES entity_processing_audit(id),
  patient_id UUID REFERENCES user_profiles(id),

  embedding_text TEXT,               -- What text was embedded
  universal_candidates JSONB,        -- [{code_id, similarity_score}, ...]
  regional_candidates JSONB,         -- [{code_id, similarity_score}, ...]

  total_candidates_found INTEGER,
  search_duration_ms INTEGER,
  created_at TIMESTAMPTZ
);
```

**Storage cost:** ~480 bytes per entity (20 UUIDs + 20 floats)
**Monthly cost:** ~$0.005 per 1M entities (negligible)

---

## Medical Code Library Setup

### One-Time Data Acquisition

**Universal Codes (Free/Licensed):**
- **RxNorm:** Free from NIH (~50,000 medication codes)
- **SNOMED-CT:** Free for SNOMED members (~100,000 condition/procedure codes)
- **LOINC:** Free for clinical use (~50,000 observation/lab codes)

**Regional Codes (Australia - Free):**
- **PBS:** Free from PBS website (~3,000 medication codes)
- **MBS:** Free from MBS Online (~5,000 procedure codes)
- **ICD-10-AM:** Licensed from ACCD (~20,000 diagnosis codes)

**Total:** ~228,000 medical codes

### One-Time Embedding Generation

**Process:**
1. Download code files from sources
2. Parse into standardized format
3. Generate search text (with synonyms, brand names)
4. Batch generate embeddings via OpenAI API (100 codes per request)
5. Insert into database with pgvector indexes

**Time:** 1-2 hours total
**Cost:** ~$0.23 USD (11.4M tokens × $0.02/1M)

**Quarterly Updates:**
- Medical codes update quarterly
- Typically <1,000 new codes
- Use versioning strategy (no table replacement)
- Cost: ~$0.01 per update

---

## Runtime Performance

### Cost Per Entity

**Embedding generation:**
- Average entity text: ~20 tokens
- Cost: $0.0000004 USD per entity (essentially free)
- Can process 2.5 million entities for $1

**Caching strategy:**
- Cache embeddings for 24 hours
- Expected 70% cache hit rate
- Reduces API calls by 70%

### Performance Targets

- **Vector search latency:** <100ms p95
- **Total Pass 1.5 duration:** <200ms per entity (including embedding generation)
- **Code assignment accuracy:** >95% (selected code in top 10 candidates)
- **Candidate relevance:** >90% (top candidate similarity > 0.75)

---

## Success Metrics

### Technical Performance
- Sub-100ms candidate retrieval (95th percentile)
- 95%+ code assignment accuracy (validated against medical experts)
- 20x token reduction (compared to full code database in prompt)

### Clinical Safety
- Zero harmful code misassignments
- Complete audit trail for all code selections
- Conservative fallbacks for low confidence matches
- Australian healthcare compliance (TGA/PBS standards)

### Cost Optimization
- 90% reduction in AI context costs (vs full code database)
- Efficient caching (70%+ API call reduction)
- Negligible runtime embedding costs

---

## Integration with Pass 2

### Worker Module Structure

```typescript
// apps/render-worker/src/pass15/index.ts
export async function retrieveCodeCandidatesForBatch(
  entities: Entity[]
): Promise<Map<UUID, CodeCandidate[]>> {
  // All Pass 1.5 logic isolated in this module
}

// apps/render-worker/src/pass2/Pass2ClinicalEnricher.ts
import { retrieveCodeCandidatesForBatch } from '../pass15';

async function processPass2Batch(entities: Entity[]) {
  // Call Pass 1.5 module (clean interface)
  const candidates = await retrieveCodeCandidatesForBatch(entities);

  // Pass to AI with bridge schemas
  const result = await pass2AI(entities, bridgeSchemas, candidates);
}
```

### Pass 2 AI Prompt Integration

```
You are analyzing medical entities extracted from a healthcare document.

ENTITIES TO PROCESS:
- Entity: "Blood Pressure: 128/82 mmHg"
  Type: vital_sign

  MEDICAL CODE CANDIDATES (from vector similarity search):
  - LOINC:85354-9 "Blood pressure panel" (similarity: 0.94)
  - LOINC:85352-3 "Blood pressure systolic and diastolic" (similarity: 0.92)
  - LOINC:8480-6 "Systolic blood pressure" (similarity: 0.89)
  ...10 more candidates

TASK: Select the most appropriate medical code from the candidates provided.
IMPORTANT: Only select codes from the provided candidates. Do not invent new codes.
```

---

## Critical Dependencies

### Completed
1. **Pass 1 Entity Detection** - Operational on Render.com (provides input)
2. **Database Schema** - Migration complete (tables ready for medical codes)
3. **Smart Entity-Type Strategy** - Documented and ready for implementation

### Pending
1. **Medical Code Library Acquisition** - Download RxNorm, SNOMED, LOINC, PBS, MBS
2. **Initial Embedding Generation** - One-time setup script (~$0.23, 1-2 hours)
3. **Worker Implementation** - TypeScript functions for vector search
4. **Pass 2 Integration** - Module import and prompt structure
5. **Validation Tests** - Verify embedding quality and code matching accuracy

---

## File Locations

### Documentation
- **Overview:** `pass-1.5-medical-code-embedding/PASS-1.5-OVERVIEW.md` (this file)
- **Implementation Plan:** `PASS-1.5-IMPLEMENTATION-PLAN.md`
- **Worker Functions:** `implementation/worker-functions.md` (TypeScript spec)
- **Embedding Generation:** `code-data-preparation/embedding-generation-plan.md`
- **Integration Points:** `technical-design/integration-points.md`
- **Vector Search:** `technical-design/vector-search-architecture.md`

### Database Schema
- **Source of truth:** `../../../current_schema/` (to be added in migration)
- **Reference:** `../../../V3_Features_and_Concepts/medical-code-resolution/simple-database-schema.md`

### Worker Implementation
- **Location:** `apps/render-worker/src/pass15/` (when created)
- **Structure:**
  - `index.ts` - Public exports
  - `pass15-embedding.ts` - Embedding generation
  - `pass15-search.ts` - Vector similarity search
  - `pass15-selection.ts` - Candidate filtering
  - `pass15-types.ts` - TypeScript interfaces

---

## Next Steps

1. **Database Migration** - Create medical code tables with pgvector indexes
2. **Data Acquisition** - Download medical code sources
3. **Initial Population** - Generate embeddings and populate tables (~$0.23, 1-2 hours)
4. **Worker Implementation** - Code TypeScript functions
5. **Pass 2 Integration** - Import module and update prompts
6. **Validation Tests** - Test embedding quality and matching accuracy
7. **Production Deployment** - Monitor performance and costs

---

## Related Documentation

**Planning:**
- [README.md](./README.md) - Quick reference overview
- [PASS-1.5-IMPLEMENTATION-PLAN.md](./PASS-1.5-IMPLEMENTATION-PLAN.md) - Core decisions

**Technical:**
- [worker-functions.md](./implementation/worker-functions.md) - Complete TypeScript spec
- [embedding-generation-plan.md](./code-data-preparation/embedding-generation-plan.md) - Setup process
- [vector-search-architecture.md](./technical-design/vector-search-architecture.md) - Search algorithm

**Integration:**
- [integration-points.md](./technical-design/integration-points.md) - Pass 1 → 1.5 → Pass 2
- [../pass-2-clinical-enrichment/PASS-2-OVERVIEW.md](../pass-2-clinical-enrichment/PASS-2-OVERVIEW.md) - Pass 2 architecture

**Reference:**
- [../../../V3_Features_and_Concepts/medical-code-resolution/](../../../V3_Features_and_Concepts/medical-code-resolution/) - Medical code resolution system

---

**Last Updated:** 2025-10-15
**Status:** Planning Complete - Ready for implementation
