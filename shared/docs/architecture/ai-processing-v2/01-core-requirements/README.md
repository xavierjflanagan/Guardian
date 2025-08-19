# Core Requirements - Foundation Concepts

**Purpose:** Define the fundamental requirements that AI processing must meet to integrate with Guardian's database foundation  
**Status:** Foundation layer - must implement before any clinical data processing  
**Priority:** BLOCKING - Phase 1 requirements that prevent database integration if missing

---

## Overview

These core requirements represent the fundamental concepts that Guardian's AI processing must implement to successfully populate the database foundation tables. Each requirement directly maps to specific database tables and fields that cannot be populated without the corresponding AI capability.

Unlike the MVP v1 approach of simple text extraction, these requirements demand sophisticated AI processing that understands medical concepts, healthcare contexts, and multi-profile family dynamics.

---

## Core Requirements Map

### 1. Multi-Profile Support
**File:** [multi-profile-support.md](./multi-profile-support.md)  
**Database Target:** `user_profiles`  
**Requirement:** Classify documents to correct profile types (self/child/adult_dependent/pet)

**Why Critical:**
- Enables family healthcare management
- Prevents cross-profile data contamination  
- Supports specialized care (pediatric, veterinary, elderly care)
- Required for healthcare provider coordination

**Without This:** All documents default to single user, making family healthcare impossible.

### 2. O3 Clinical Events Framework  
**File:** [o3-clinical-events.md](./o3-clinical-events.md)  
**Database Target:** `patient_clinical_events`  
**Requirement:** Two-axis classification (observation/intervention × clinical purposes)

**Why Critical:**
- Core clinical data structure for all medical facts
- Enables clinical decision support and analytics
- Required for healthcare standards compliance
- Foundation for timeline and smart features

**Without This:** No structured clinical data storage - only plain text.

### 3. Healthcare Standards Integration
**File:** [healthcare-standards.md](./healthcare-standards.md)  
**Database Targets:** `snomed_code`, `loinc_code`, `cpt_code` fields across clinical tables  
**Requirement:** Integrate SNOMED-CT, LOINC, and CPT coding systems

**Why Critical:**
- Healthcare interoperability with provider systems
- Clinical analytics and decision support
- Regulatory compliance requirements
- Future provider portal integration

**Without This:** No healthcare system interoperability or clinical analytics.

### 4. Spatial Precision (Phase 2+)
**File:** [spatial-precision.md](./spatial-precision.md)  
**Database Target:** `clinical_fact_sources.bounding_box`  
**Requirement:** PostGIS GEOMETRY integration for document provenance

**Why Critical:**
- Click-to-zoom document navigation
- Complete fact provenance and traceability
- Quality assurance and verification capabilities
- Advanced UI document interaction features

**Without This:** No spatial document features or advanced provenance tracking.

### 5. Timeline Integration
**File:** [timeline-integration.md](./timeline-integration.md)  
**Database Target:** `healthcare_timeline_events`  
**Requirement:** Generate timeline metadata for every clinical event

**Why Critical:**
- Patient healthcare journey visualization
- Natural language search and chatbot integration
- Patient engagement and healthcare literacy
- Smart feature activation based on timeline context

**Without This:** No patient timeline or healthcare journey features.

---

## Implementation Priority

### Phase 1: Foundation (BLOCKING)
**Must complete all three to enable any database integration:**

1. **Multi-Profile Support** - Routes documents correctly
2. **O3 Clinical Events** - Structures clinical data  
3. **Healthcare Standards** - Enriches data with standard codes

**Dependencies:** Complete database-foundation-v2 implementation  
**Timeline:** 5-7 days  
**Team:** Full development focus required

### Phase 2: Timeline and Experience  
**Enables patient-facing features:**

4. **Timeline Integration** - Generates healthcare journey
5. **Smart Feature Detection** - Context-sensitive UI (covered in 02-clinical-classification)

**Dependencies:** Phase 1 completion  
**Timeline:** 3-4 days  
**Team:** Frontend integration required

### Phase 2+: Advanced Capabilities
**Enables advanced document features:**

6. **Spatial Precision** - Document coordinate tracking and click-to-zoom

**Dependencies:** OCR integration ready  
**Timeline:** 4-6 days  
**Team:** Spatial processing specialists

---

## Database Foundation Integration

### Direct Table Mapping
Each core requirement directly enables population of specific database tables:

```yaml
multi_profile_support:
  enables: "user_profiles table population"
  blocks_without: "All clinical data routing"
  
o3_clinical_events:
  enables: "patient_clinical_events table population"
  blocks_without: "Core clinical data storage"
  
healthcare_standards:
  enables: "snomed_code, loinc_code, cpt_code fields"
  blocks_without: "Healthcare interoperability"
  
timeline_integration:
  enables: "healthcare_timeline_events table population"  
  blocks_without: "Patient journey visualization"
  
spatial_precision:
  enables: "clinical_fact_sources.bounding_box field"
  blocks_without: "Advanced document navigation"
```

### Cross-Requirement Dependencies
Requirements are interdependent and build upon each other:

```
Multi-Profile Support
    ↓
O3 Clinical Events (requires profile context)
    ↓  
Healthcare Standards (enriches clinical events)
    ↓
Timeline Integration (generates from clinical events)
    ↓
Spatial Precision (provides provenance for timeline)
```

---

## Validation Criteria

### Technical Validation
Each requirement must meet specific technical criteria:

**Multi-Profile Support:**
- 95%+ accuracy for profile type classification
- Zero cross-profile contamination in testing
- Handles edge cases (family documents, unclear ownership)

**O3 Clinical Events:**
- 90%+ accuracy for activity type classification
- 85%+ accuracy for clinical purpose assignment  
- Every medical fact classified in both dimensions

**Healthcare Standards:**
- 80%+ coverage of clinical concepts with standard codes
- 95%+ accuracy for assigned codes
- Integration with authoritative medical terminology sources

**Timeline Integration:**
- Every clinical event generates timeline metadata
- Patient-friendly language appropriate for healthcare literacy
- Searchable content supports natural language queries

**Spatial Precision:**
- 85%+ successful alignment for clear documents
- Graceful degradation for poor OCR quality
- Support for multi-page clinical documents

### Healthcare Validation
Requirements must also meet healthcare professional standards:

- **Clinical accuracy** validated by medical professionals
- **Healthcare compliance** meeting regulatory requirements
- **Patient safety** ensuring no data integrity issues
- **Clinical utility** supporting healthcare decision-making

---

## Reference Documentation

### Database Foundation Links
- [Core Schema](../../database-foundation-v2/core/schema.md) - Tables these requirements populate
- [Multi-Profile System](../../database-foundation-v2/core/multi-profile.md) - Profile architecture details
- [Clinical Events SQL](../../database-foundation-v2/implementation/sql/005_clinical_events_core.sql) - O3 implementation

### AI Processing Integration
- [Database Bridge Specifications](../06-technical-specifications/database-bridge/) - Technical integration details
- [Normalization Pipeline](../03-extraction-pipeline/normalization/) - How requirements feed into database
- [Implementation Roadmap](../IMPLEMENTATION_ROADMAP.md) - Detailed implementation plan

### Current State Assessment
- [Gap Analysis](../CURRENT_STATUS.md) - What's missing from current implementation
- [Architecture Overview](../ARCHITECTURE_OVERVIEW.md) - How requirements fit into overall system

---

## Getting Started

### For Developers New to Guardian AI Processing
1. **Read Architecture Overview** - Understand the overall system design
2. **Review Gap Analysis** - Understand what needs to be built
3. **Study Database Schema** - Understand the tables you'll populate
4. **Start with Phase 1** - Multi-profile, O3, and healthcare standards

### For Implementation Teams
1. **Begin with Multi-Profile Support** - Foundation for all other processing
2. **Implement O3 Clinical Events** - Core clinical data structure
3. **Integrate Healthcare Standards** - Enrich clinical data with codes
4. **Add Timeline Integration** - Generate patient experience metadata
5. **Enhance with Spatial Precision** - Advanced document navigation

### For Medical Professionals Reviewing Requirements
1. **Focus on Clinical Accuracy** - Validate medical concept understanding
2. **Review Healthcare Standards** - Ensure proper code usage and coverage
3. **Assess Patient Safety** - Verify profile classification prevents contamination
4. **Evaluate Clinical Utility** - Confirm data structure supports care decisions

---

*These core requirements transform Guardian from MVP-level text extraction to enterprise-grade healthcare data processing, enabling multi-profile family healthcare management with clinical precision and compliance.*