# Medical Code Resolution

**Status**: Production-Ready Implementation Specification  
**Created**: 11 September 2025  
**Last Updated**: 16 September 2025

## Overview

This folder addresses the critical challenge of accurately mapping clinical entities extracted from uplaoded files to standardized medical codes without overwhelming AI models with massive terminology databases. 

Although applying a standardized medical code system is important for external interoperability and regulatory compliance, the main role and necessity of having a standardized medical coding process within Exora is to enable the accurate comparison of clinical entities, therefore facilitating A; deduplication, and B; efficient hierarchical narrative building.

## Problem Domain

Healthcare requires standardized medical coding for:
- Clinical decision support (drug interactions, allergies)
- Regulatory compliance (PBS, MBS, SNOMED requirements)
- Data interoperability across healthcare systems
- Accurate deduplication of clinical entities
- The cultivation and maintenance of a succinct, up-to-date, interlinking and overarching clinical narrative architecture for every user.

### Key Challenges
- AI models hallucinate medical codes when asked to generate them
- Medical code databases are too large for AI context windows (300K+ RxNorm concepts)
- Australian-specific codes (PBS, MBS) are not in standard AI training data
- Code granularity affects deduplication safety (ingredient vs specific drug formulation)

## Our Solution: Vector-Based Code Matching

We use semantic embeddings for fast, accurate medical code resolution through a **simple 4-step process**:

1. **Pass 1**: Extract clinical entities (not codes) via AI
2. **Vector Search**: Embed entity text and find 10-20 most similar medical codes using pgvector
3. **AI Selection**: AI chooses best code from candidates (eliminates hallucination risk)
4. **Parallel Assignment**: Both universal AND regional codes assigned when found (not hierarchical)
5. **Pass 2**: AI receives verified medical codes for enhanced clinical processing

⚠️ **Architectural Note**: Pass 1 output structure and embedding field selection are pending decisions that will affect vector search implementation.

**Key Advantage**: Vector embeddings handle synonyms, typos, and semantic relationships automatically ("heart attack" → "myocardial infarction") while preventing AI hallucination by limiting selection to verified codes only.

## Core Implementation Files

### **Primary Architecture**
- **`embedding-based-code-matching.md`** - ✅ **Core Implementation**
  - Vector similarity search with pgvector
  - Database schema with embedding columns
  - Performance optimization and caching

- **`simple-database-schema.md`** - ✅ **Database Design**
  - 3 essential tables: codes + embeddings, mappings, resolution log
  - Vector indexes and search functions
  - Minimal, focused design

- **`pass-integration.md`** - ✅ **AI Pipeline Integration**
  - Simple Pass 1 → Vector Search → AI Selection → Pass 2 flow
  - Error handling and fallback strategies
  - Performance targets

### **Clinical Logic**
- **`code-hierarchy-selection.md`** - ✅ **Code Granularity Logic**
  - RxNorm SCD vs ingredient-level decisions
  - Clinical safety rules for code selection
  - Australian PBS/MBS integration

- **`vague-medication-handling.md`** - ✅ **Edge Cases**
  - Drug class mentions ("steroids", "antibiotics")
  - Incomplete medication references
  - ATC code assignment

### **Multi-Regional Healthcare System**
- **`simple-database-schema.md`** - ✅ **Split Code Libraries Architecture**
  - Parallel assignment: Universal (SNOMED/RxNorm/LOINC) + Regional (PBS/MBS/NHS/etc.)
  - Split table design for universal vs regional codes
  - Australian launch ready with expansion framework for 6+ countries

- **`australian-healthcare-codes.md`** - ✅ **Multi-Regional Launch Ready**
  - Australia: PBS/MBS/TGA integration
  - UK: NHS dm+d/BNF support
  - US: NDC/CPT/CMS integration
  - Germany: PZN/ICD_10_GM support
  - Canada: DIN/Health Canada support
  - France: CIP/ANSM support

- **`data-type-coding/`** - ✅ **Entity-Specific Coding**
  - Detailed frameworks for medications, conditions, procedures, allergies, observations
  - Australian healthcare context for each type

## Integration with Deduplication System

**Critical Dependency**: Medical code assignment **directly enables** clinical entity deduplication through identity policies:

### **Code Assignment Architecture** (see [`./simple-database-schema.md`](./simple-database-schema.md))
- **Storage**: Medical codes stored in separate `medical_code_assignments` table (not embedded in clinical tables)
- **Assignment Strategy**: Parallel assignment of both universal AND regional codes (never hierarchical)
- **Success Scenarios**:
  - Both universal + regional assigned ✅ (ideal)
  - Only universal assigned ✅ (acceptable)
  - Only regional assigned ✅ (acceptable)
  - Neither assigned - fallback used ✅ (safe)

### **Code Granularity Requirements** (see [`../temporal-data-management/clinical-identity-policies.md`](../temporal-data-management/clinical-identity-policies.md))
- **Medications**: RxNorm SCD/SBD level (not ingredient-only) for safe route/form/strength distinctions
- **Conditions**: SNOMED-CT primary with hierarchical specificity; ICD_10_AM for Australian reporting
- **Allergies**: SNOMED substance/agent codes for precise allergen identification
- **Procedures**: SNOMED procedure codes; MBS codes for Australian Medicare integration

### **Identity Safety Integration**
```
Parallel Code Assignment → Clinical Identity Key → Deduplication Safety
Universal: RxNorm SCD 314076 → rxnorm_scd:314076 → Safe medication deduplication
Regional: PBS 2345 → pbs:2345 → Australian healthcare context
Missing/Low Confidence → fallback:unique_id → Conservative no-merge approach
```

## Confidence Thresholds & Fallback Strategy

**Deterministic Confidence-Based Selection** (detailed in [`./code-hierarchy-selection.md`](./code-hierarchy-selection.md)):

- **≥0.8 confidence**: Accept code assignment automatically
- **0.6-0.8 confidence**: Accept with low-confidence flag for user review
- **<0.6 confidence**: Create `custom_code` fallback to prevent unsafe merging
- **No candidates**: Conservative `fallback:unique_id` approach for safety

**Safety Principle**: When in doubt, preserve as separate entities rather than risk unsafe merging.

## API Contracts & System Integration

### **Pass 1 → Code Resolution Interface**

The medical code resolution system receives normalized clinical attributes from Pass 1 AI extraction and returns verified medical codes with confidence scores. Pass 1 provides entity type (medication, condition, allergy, procedure, observation), extracted attributes like medication name and strength, clinical context for disambiguation, and file origin for format-specific processing. The code resolution service responds with the selected primary medical code, confidence score, alternative candidates considered, and the selection method used (embedding similarity, exact match, or fallback).

**Detailed schemas**: See [`./embedding-based-code-matching.md`](./embedding-based-code-matching.md) and [`./simple-database-schema.md`](./simple-database-schema.md) for complete specifications.

## Relationships to Other Folders

### **Downstream Enablement**
- **[`../temporal-data-management/`](../temporal-data-management/)**: Provides medical codes for clinical entity identity and safe deduplication
- **[`../narrative-architecture/`](../narrative-architecture/)**: Supplies coded clinical data for semantic narrative creation  
- **[`../implementation-planning/`](../implementation-planning/)**: Database schemas and AI pipeline integration requirements

### **Quality Assurance Integration**
- **Confidence propagation**: Code confidence flows through to dashboard display badges
- **Audit compliance**: Complete decision logging for Australian Privacy Act requirements
- **Performance targets**: <150ms p95 latency for code resolution with 95%+ accuracy

## Operational Readiness

### **Privacy & Compliance**
- **Australian Privacy Act**: PHI de-identification before embedding processing
- **Data residency**: Medical code databases and embeddings stored in Australian data centers
- **Audit logging**: Complete decision trails for regulatory compliance
- **RLS policies**: Row-level security on all code assignment tables

### **Performance & Monitoring**
- **Latency targets**: <150ms p95 for code resolution; <50ms with cache hits
- **Accuracy metrics**: 95%+ code assignment success rate; <5% low-confidence flags
- **Key observability**: Match rate, confidence distribution, fallback frequency, processing latency
- **Caching strategy**: Hot embeddings cached; common medication/condition codes pre-loaded

### **Versioning & Governance**
- **Code system versions**: RxNorm monthly updates; SNOMED-AU quarterly; PBS/MBS as released
- **Change management**: Staged deployments with rollback capability
- **Quality validation**: Automated testing against known entity/code pairs

**Detailed operational procedures**: See [`../implementation-planning/`](../implementation-planning/) for deployment guides and monitoring setup.

## Implementation Benefits

- **Clinical Safety**: AI selects from verified candidates only - eliminates hallucination risk
- **Semantic Accuracy**: Vector embeddings handle synonyms, typos, and medical relationships automatically
- **Efficiency**: Vector search + AI selection instead of complex deterministic rules
- **Australian Ready**: Complete PBS/MBS integration for immediate launch
- **Global Scalable**: Universal code framework supports international expansion
- **High Performance**: <100ms vector search with pgvector indexes