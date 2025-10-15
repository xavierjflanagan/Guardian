# Pass 1.5 Medical Code Embedding
**Purpose:** Vector embedding system for medical code candidate retrieval
**Status:** Planning Complete - Ready for implementation
**Created:** 2025-10-14

---

## Overview

Pass 1.5 is a lightweight vector similarity search service that sits between Pass 1 entity detection and Pass 2 clinical enrichment. It provides AI with 10-20 relevant medical code candidates instead of overwhelming it with 300,000+ possible codes.

**Key Function:** Convert clinical entity text → vector embedding → retrieve similar medical codes → pass to Pass 2

---

## Folder Structure

```
pass-1.5-medical-code-embedding/
├── README.md                                    # This file
├── PASS-1.5-IMPLEMENTATION-PLAN.md             # Master planning document (to be created)
│
├── technical-design/
│   ├── vector-search-architecture.md           # Core technical design (PLACEHOLDER)
│   ├── database-schema.md                      # Tables and pgvector setup (PLACEHOLDER)
│   └── integration-points.md                   # Pass 1 → 1.5 → Pass 2 handoffs (PLACEHOLDER)
│
├── code-data-preparation/
│   ├── medical-code-sources.md                 # RxNorm, SNOMED, PBS, MBS data sources (PLACEHOLDER)
│   ├── embedding-generation-plan.md            # How to generate embeddings for codes (PLACEHOLDER)
│   └── data-population-scripts.md              # SQL/scripts to load data (PLACEHOLDER)
│
├── implementation/
│   ├── worker-functions.md                     # TypeScript functions (PLACEHOLDER)
│   └── performance-benchmarks.md               # Speed/accuracy targets (PLACEHOLDER)
│
└── testing/
    └── validation-plan.md                      # How to test accuracy (PLACEHOLDER)
```

---

## Quick Reference: Related Documentation

### Medical Code Resolution System

**Location:** `../../V3_Features_and_Concepts/medical-code-resolution/`

- [`README.md`](../../../V3_Features_and_Concepts/medical-code-resolution/README.md) - Medical code resolution overview and integration with deduplication
- [`simple-database-schema.md`](../../../V3_Features_and_Concepts/medical-code-resolution/simple-database-schema.md) - 5-table database design (universal codes, regional codes, assignments, resolution log, RLS)
- [`embedding-based-code-matching.md`](../../../V3_Features_and_Concepts/medical-code-resolution/embedding-based-code-matching.md) - Vector similarity search architecture and performance optimization
- [`pass-integration.md`](../../../V3_Features_and_Concepts/medical-code-resolution/pass-integration.md) - AI pipeline integration (Pass 1 → Vector Search → AI Selection → Pass 2)
- [`code-hierarchy-selection.md`](../../../V3_Features_and_Concepts/medical-code-resolution/code-hierarchy-selection.md) - Code granularity logic and confidence thresholds
- [`vague-medication-handling.md`](../../../V3_Features_and_Concepts/medical-code-resolution/vague-medication-handling.md) - Drug class mentions and ATC code assignment
- [`australian-healthcare-codes.md`](../../../V3_Features_and_Concepts/medical-code-resolution/australian-healthcare-codes.md) - PBS/MBS/TGA integration and multi-regional expansion framework
- [`data-type-coding/`](../../../V3_Features_and_Concepts/medical-code-resolution/data-type-coding/) - Entity-specific coding frameworks (medications, conditions, procedures, allergies, observations)

### Temporal Data Management

**Location:** `../../V3_Features_and_Concepts/temporal-data-management/`

- [`README.md`](../../../V3_Features_and_Concepts/temporal-data-management/README.md) - Temporal data management overview (deduplication, historical tracking, conflict resolution)
- [`deduplication-framework.md`](../../../V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md) - Deterministic supersession logic using medical codes
- [`clinical-identity-policies.md`](../../../V3_Features_and_Concepts/temporal-data-management/clinical-identity-policies.md) - Identity determination rules for safe clinical entity comparison
- [`temporal-conflict-resolution.md`](../../../V3_Features_and_Concepts/temporal-data-management/temporal-conflict-resolution.md) - Date hierarchy and confidence propagation

---

## What is Pass 1.5?

**NOT an AI processing pass** - Just a database vector similarity search service.

**Core Components:**
1. Embedded medical code database (universal + regional codes with vector embeddings)
2. pgvector similarity search engine
3. Top-K candidate retrieval service
4. Integration layer for Pass 1 → Pass 2 handoff

**Why it exists:**
- Prevents AI hallucination of medical codes
- Reduces token costs (20x reduction vs sending full code database)
- Enables semantic matching (handles synonyms, typos, medical relationships)
- Supports Australian healthcare specificity (PBS/MBS codes)

---

## Integration Flow

```
Pass 1: Entity Detection
  ↓
  Outputs: "Blood Pressure: 128/82 mmHg"
  ↓
Pass 1.5: Vector Search
  ↓
  1. Generate embedding for entity text
  2. Query pgvector for top 10-20 similar codes
  3. Return code candidates with similarity scores
  ↓
  Outputs: [
    {code: "LOINC 85354-9", display: "Blood pressure panel", similarity: 0.94},
    {code: "LOINC 85352-3", display: "Blood pressure systolic and diastolic", similarity: 0.92},
    ...
  ]
  ↓
Pass 2: Clinical Enrichment
  ↓
  AI selects best code from candidates
  Writes to medical_code_assignments table
```

---

## Critical Dependencies

**Upstream:**
- Pass 1 entity detection output from `entity_processing_audit` table:
  - `original_text` - AI-curated clean entity text (primary input)
  - `ai_visual_interpretation` - AI's contextual understanding (used for diagnoses/conditions)
  - `visual_formatting_context` - Formatting context (used for vital signs/labs)
  - `entity_subtype` - Entity classification for smart text selection strategy
- Medical code databases (RxNorm, SNOMED, PBS, MBS)
- OpenAI embedding API (text-embedding-3-small)

**Downstream:**
- Pass 2 AI prompt structure (expects code candidates)
- Deduplication system (uses assigned codes for identity)
- Narrative system (uses coded data for semantic understanding)

---

## Success Metrics

**Performance:**
- Sub-100ms candidate retrieval (p95)
- 95%+ code assignment accuracy
- 20x token reduction vs full code database

**Clinical Safety:**
- Zero harmful code misassignments
- Complete audit trail
- Conservative fallbacks for low confidence

**Cost:**
- 90% reduction in AI context costs
- Efficient caching (70%+ API call reduction)

---

## Next Steps

1. ✅ Create PASS-1.5-IMPLEMENTATION-PLAN.md with complete technical design
2. Create database migration for versioning fields and pass15_code_candidates table
3. Identify medical code data sources and acquisition plan
4. Design worker integration with Pass 1 and Pass 2
5. Build validation test suite

---

**Last Updated:** 2025-10-15
**Status:** Planning Complete - Ready for implementation
