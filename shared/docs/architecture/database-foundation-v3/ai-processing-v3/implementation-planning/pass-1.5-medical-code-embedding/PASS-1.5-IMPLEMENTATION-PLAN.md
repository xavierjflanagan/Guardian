# Pass 1.5 Implementation Plan - Medical Code Embedding

**Purpose:** Master planning document for Pass 1.5 vector embedding system

**Status:** Core decisions documented, detailed implementation spec pending

**Created:** 2025-10-14

---

## Overview

Pass 1.5 is a lightweight vector similarity search service that provides AI with 10-20 relevant medical code candidates instead of overwhelming it with 300,000+ possible codes. This prevents hallucination while maintaining semantic matching power.

**NOT an AI processing pass** - Just a database vector similarity search service.

---

## Key Decisions Documented

### 1. Code Candidate Strategy (DECIDED)

**Hybrid Approach with Confidence Thresholds:**

- **MIN_CANDIDATES:** 5 (unless fewer exist)
- **MAX_CANDIDATES:** 20 (token cost control)
- **TARGET_CANDIDATES:** 10 (flex 5-20 based on quality)

**Thresholds:**
- **AUTO_INCLUDE:** similarity >= 0.85 (always include)
- **MIN_SIMILARITY:** 0.60 (reject below this)

**Benefits:**
- Token cost control (hard cap at 20)
- Quality guarantee (min 0.60 threshold)
- Flexibility based on match quality
- Always provides options (min 5 if available)

### 2. Pass 1 Input Format (DECIDED)

**Source:** `entity_processing_audit` table

**Required Fields:**
```typescript
interface Pass15Input {
  entity_id: UUID;
  entity_subcategory: string;
  entity_text: string;
  normalized_entity: string;
  patient_id: UUID;
}
```

### 3. Embedding Text Strategy (DECIDED)

**Entity Type-Based Selection:**
- **Medications:** Use `normalized_entity` (standardized dose format)
- **Conditions:** Use `entity_text` (preserve clinical nuance)
- **Observations:** Combine both (maximum context)
- **Default:** Concatenate both fields

**Rationale:** Different entity types benefit from different text representations for optimal vector matching.

### 4. Pass 2 Output Format (DECIDED)

```typescript
interface CodeCandidate {
  code_system: string;       // 'rxnorm', 'snomed', 'loinc', 'pbs', 'mbs'
  code_value: string;
  display_name: string;
  similarity_score: number;  // 0.60-1.00
  code_type: 'universal' | 'regional';
  country_code?: string;     // For regional codes
}
```

---

## PLACEHOLDER SECTIONS

**To be completed:**

### Technical Architecture
- Complete pgvector implementation details
- OpenAI API integration specifications
- Fork-style parallel search (universal + regional codes)
- Caching layer design

### Database Schema
- Migration strategy
- Table structures (see simple-database-schema.md reference)
- pgvector indexes
- RLS policies

### Medical Code Data Sources
- RxNorm acquisition and licensing
- SNOMED-CT access
- PBS/MBS data sources
- Update schedules

### Worker Implementation
- TypeScript function signatures
- Render.com integration
- Error handling
- Logging and monitoring

### Performance Benchmarks
- Sub-100ms candidate retrieval (p95)
- 95%+ code assignment accuracy
- Caching effectiveness (70%+ hit rate)

### Cost Analysis
- Initial embedding generation costs
- Runtime API costs per search
- Token savings vs alternatives

### Testing Strategy
- Validation test suite
- Accuracy benchmarks
- Performance testing

### Deployment Plan
- Database migration sequence
- Code data population
- Worker deployment
- Monitoring setup

---

**Reference Documentation:**

See `../../../V3_Features_and_Concepts/medical-code-resolution/` for:
- `simple-database-schema.md` - Complete database design
- `embedding-based-code-matching.md` - Vector search architecture
- `pass-integration.md` - AI pipeline integration
- `code-hierarchy-selection.md` - Code selection logic

---

**Last Updated:** 2025-10-14
**Status:** Core decisions documented, full spec pending
