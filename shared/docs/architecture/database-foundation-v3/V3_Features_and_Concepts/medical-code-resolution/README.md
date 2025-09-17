# Medical Code Resolution

**Status**: Production-Ready Implementation Specification  
**Created**: 11 September 2025  
**Last Updated**: 16 September 2025

## Overview

This folder addresses the critical challenge of accurately mapping clinical entities extracted from documents to standardized medical codes without overwhelming AI models with massive terminology databases. 

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

## Our Solution: Embedding-Based Code Matching

We use semantic embeddings to bridge the gap between extracted clinical text and verified medical codes through a **deterministic, safety-first approach**:

1. **Pass 1**: Extract clinical attributes (not codes) via AI
2. **Step 1.5**: Use embeddings to find semantically similar codes from curated database  
3. **Step 1.5**: Apply deterministic selection rules to choose final code from candidates
4. **Pass 2**: AI receives verified medical codes for enhanced clinical processing

**Critical**: Final code selection is **AI-powered from curated candidates** to eliminate AI hallucination risk. AI selects from a short list of verified medical codes (10-20 candidates) provided by embedding search, never from the full 300K+ database directly.

## Key Files in This Folder

- **`embedding-based-code-matching.md`** - ✅ **Production Ready**
  - Semantic embedding approach with vector similarity search
  - Global format detection and Australian healthcare specialization
  - Comprehensive caching and performance optimization strategies

- **`code-hierarchy-selection.md`** - ✅ **Production Ready**  
  - Deterministic code selection rules for medications, conditions, procedures
  - RxNorm SCD/SBD vs ingredient-level granularity decisions
  - Australian PBS/MBS code integration with international standards

- **`vague-medication-handling.md`** - ✅ **Production Ready**
  - ATC code assignment for drug class mentions ("steroids", "antibiotics")
  - Pattern recognition for non-specific medication references
  - Integration with clinical identity policies for safe deduplication

## Integration with Deduplication System

**Critical Dependency**: Medical code assignment **directly enables** clinical entity deduplication through identity policies:

### **Code Granularity Requirements** (see [`../temporal-data-management/clinical-identity-policies.md`](../temporal-data-management/clinical-identity-policies.md))
- **Medications**: RxNorm SCD/SBD level (not ingredient-only) for safe route/form/strength distinctions
- **Conditions**: SNOMED-CT primary with hierarchical specificity; ICD-10-AM for Australian reporting  
- **Allergies**: SNOMED substance/agent codes for precise allergen identification
- **Procedures**: SNOMED procedure codes; MBS codes for Australian Medicare integration

### **Identity Safety Integration** 
```
Medical Code Assignment → Clinical Identity Key → Deduplication Safety
RxNorm SCD: 314076 → rxnorm_scd:314076 → Safe medication deduplication
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

The medical code resolution system receives normalized clinical attributes from Pass 1 AI extraction and returns verified medical codes with confidence scores. Pass 1 provides entity type (medication, condition, allergy, procedure), extracted attributes like medication name and strength, clinical context for disambiguation, and file origin for format-specific processing. The code resolution service responds with the selected primary medical code, confidence score, alternative candidates considered, and the selection method used (embedding similarity, exact match, or fallback).

**Detailed schemas**: See [`./embedding-based-code-matching.md`](./embedding-based-code-matching.md) for complete API specifications.

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

- **Clinical Safety**: Deterministic code selection eliminates AI hallucination risk
- **Accuracy**: Only real, verified medical codes from authoritative sources
- **Efficiency**: Controlled context size (10-20 relevant codes vs 300K+ database)
- **Australian Compliance**: Native PBS, MBS, SNOMED-AU integration
- **Global Scalability**: Extensible to international healthcare coding standards
- **Performance**: Vector similarity search with intelligent caching for sub-second response times