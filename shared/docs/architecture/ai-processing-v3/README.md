# AI Processing v3: Direct Schema Integration Approach

**Status:** Planning & Implementation Phase  
**Date:** 25 August 2025  
**Purpose:** Direct database-to-AI schema integration, skipping bridge documentation layer  
**Previous:** Built comprehensive pipeline architecture in [ai-processing-v2](../ai-processing-v2/)

---

## Overview

AI Processing v3 implements the two-pass AI architecture with direct database schema integration. This approach eliminates the bridge documentation layer and creates AI schemas directly from database tables for maximum efficiency.

**Key Decision:** Skip comprehensive bridge documentation and go directly from database schema to AI-consumable schemas.

---

## File Structure

```
ai-processing-v3/
├── README.md (this file)
├── schemas/
│   ├── source/                    # Master documentation schemas
│   │   └── patient_clinical_events.json
│   ├── detailed/                  # AI version with guidance (~300 tokens)
│   │   └── patient_clinical_events.json  
│   ├── minimal/                   # AI version selective minimization (~100 tokens)
│   │   └── patient_clinical_events.json
│   └── schema_loader.ts           # Simple loader for runtime use
└── tests/
    ├── accuracy_comparison/       # A/B test detailed vs minimal
    │   ├── detailed_vs_minimal_test.ts
    │   └── medical_document_samples/
    └── token_analysis/            # Measure token efficiency
        └── token_count_comparison.ts
```

## Progress Checklist

### COMPLETED: Architecture & Research Phase

- [x] **Pipeline Architecture Complete** - Built comprehensive 4-component pipeline architecture (v2)
- [x] **Database Foundation Analysis** - Analyzed all 47 production tables across 15 migration files
- [x] **Implementation Status Review** - Confirmed database foundation is production-ready
- [x] **Schema Strategy Analysis** - Identified direct approach vs bridge documentation approach
- [x] **Entity Classification Taxonomy** - Created complete entity classification system
- [x] **Cost Optimization Strategy** - Two-pass approach reduces AI costs by 70%

**Key Insights Discovered:**
- Database foundation is fully implemented (47 tables, 917 functions)
- Bridge documentation adds 20-30 hours of work with minimal value
- Can extract all needed schema info directly from migration files
- AI schemas need different info than database bridge docs provide

### CURRENT PHASE: Direct Schema Implementation

#### Phase 1: Schema Foundation (Current Week)

**Goal:** Create working AI schemas for core clinical tables

- [ ] **1.1 Core Table Schema Analysis** - Extract schema requirements from database
  - [ ] Analyze `patient_clinical_events` (central hub table)
  - [ ] Analyze `patient_observations` (lab results, vitals, assessments)  
  - [ ] Analyze `patient_interventions` (medications, procedures, treatments)
  - [ ] Analyze `patient_conditions` (diagnoses and medical conditions)
  - [ ] Analyze `patient_allergies` (safety-critical allergy data)

- [ ] **1.2 AI Schema Template Creation** - Build AI-optimized instruction templates
  - [ ] Create `patient_clinical_events` AI schema (O3 two-axis classification)
  - [ ] Create `patient_observations` AI schema (observation details)
  - [ ] Create `patient_interventions` AI schema (intervention details)
  - [ ] Create `patient_conditions` AI schema (condition extraction)
  - [ ] Create `patient_allergies` AI schema (allergy extraction)

- [ ] **1.3 Schema Loading Logic** - Implement entity-to-schema mapping
  - [ ] Build Pass 1 entity classification to schema requirements mapping
  - [ ] Create dynamic schema loader (loads only needed schemas per document)
  - [ ] Implement schema size optimization (target <200 tokens per schema)

#### Phase 2: Two-Pass Flow Implementation (Next Week)

**Goal:** Working end-to-end two-pass AI processing

- [ ] **2.1 Pass 1 Implementation** - Entity detection and classification
  - [ ] Build lightweight Pass 1 entity classifier (GPT-4o-mini/Claude Haiku)
  - [ ] Implement entity type classification (clinical_event, healthcare_identifier, processing_metadata)
  - [ ] Test Pass 1 with real medical documents
  - [ ] Validate entity detection completeness and accuracy

- [ ] **2.2 Pass 2 Implementation** - Schema-based enrichment
  - [ ] Build targeted Pass 2 enrichment system (Claude Sonnet/GPT-5)
  - [ ] Implement dynamic schema selection based on Pass 1 results
  - [ ] Create AI output validation against database constraints
  - [ ] Test Pass 2 extraction accuracy and database insertion

- [ ] **2.3 End-to-End Integration** - Complete pipeline testing
  - [ ] Test full Pass 1 → Pass 2 → Database flow
  - [ ] Validate foreign key relationships and referential integrity
  - [ ] Test with multiple document types and complexity levels
  - [ ] Measure token usage and cost optimization vs single-pass

#### Phase 3: Production Readiness (Week 3)

**Goal:** Production-ready AI processing system

- [ ] **3.1 Error Handling & Recovery** - Robust failure management
  - [ ] Implement AI extraction failure recovery strategies
  - [ ] Create low-confidence extraction review queue
  - [ ] Build database constraint violation handling
  - [ ] Test failure scenarios and rollback procedures

- [ ] **3.2 Quality Assurance** - Accuracy and safety validation
  - [ ] Implement confidence score thresholds per table
  - [ ] Create safety-critical validation for medications/allergies
  - [ ] Build extraction completeness monitoring
  - [ ] Validate medical coding accuracy (SNOMED/LOINC/CPT)

- [ ] **3.3 Performance Optimization** - Production scalability
  - [ ] Optimize batch processing for large documents
  - [ ] Implement intelligent entity batching for token limits
  - [ ] Create performance monitoring and alerting
  - [ ] Document cost savings and accuracy metrics

---

## Success Metrics

### Phase 1 Success Criteria
- [ ] AI schemas created for 5 core clinical tables
- [ ] Schema loading logic working with entity classification
- [ ] Total schema size <1000 tokens per document (vs 3000+ for full schemas)

### Phase 2 Success Criteria  
- [ ] End-to-end two-pass processing working
- [ ] >90% AI extraction accuracy for clinical events
- [ ] >95% successful database insertion rate
- [ ] 70%+ cost reduction vs single comprehensive AI call

### Phase 3 Success Criteria
- [ ] Production-ready error handling and recovery
- [ ] Safety-critical validation for medications/allergies
- [ ] Performance suitable for 1000+ documents/day
- [ ] Complete audit trail and compliance tracking

---

## Architecture Decisions

### Confirmed Decisions
1. **Two-Pass AI Architecture** - Pass 1 classification, Pass 2 enrichment
2. **Direct Schema Approach** - Skip bridge documentation layer
3. **Entity-Driven Schema Loading** - Load only relevant schemas per document
4. **Database-First Design** - AI schemas derived from database constraints
5. **Cost Optimization Focus** - Minimize token usage while maximizing accuracy

### Open Questions
1. **Entity Deduplication** - Handle at database level or UI level?
2. **Multi-Schema Entities** - How to handle entities spanning multiple tables?
3. **Confidence Thresholds** - What triggers manual review?
4. **Batch Processing Strategy** - Optimal batching for large documents?

---

### Schema Architecture

**Three-Version Approach:**
- **Source schemas**: Comprehensive documentation for developers (600+ tokens)
- **Detailed schemas**: AI-optimized with key guidance retained (300 tokens)  
- **Minimal schemas**: Selective minimization for maximum efficiency (100 tokens)

**Manual Creation Process:**
1. Create source schema with full documentation
2. Manually create detailed version (remove verbose descriptions, keep examples)
3. Manually create minimal version (essential fields and enums only)
4. A/B test both AI versions for accuracy vs efficiency trade-offs

---

## Next Immediate Action

**START HERE:** Create the first AI schema template for `patient_clinical_events` based on the database migration file `005_clinical_events_core.sql`. This validates the direct approach before scaling to other tables.

**Command:** Begin with Schema 1.1 - Core Table Schema Analysis for `patient_clinical_events`

---

*This approach prioritizes speed-to-value and real-world validation over comprehensive documentation, getting us to a working two-pass AI system as quickly as possible.*