# Narrative Architecture Implementation Roadmap

**Date**: 23 September 2025 (Updated from 18 Sep)
**Status**: Implementation Roadmap - Bridge from Current State to Target Architecture
**Purpose**: Define step-by-step implementation path from existing clinical_narratives infrastructure to the comprehensive narrative architecture specified in NARRATIVE-ARCHITECTURE-DRAFT-VISION.md
**Technical Authority**: See [NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md) for complete technical specifications

## Core Implementation Requirements

**Purpose**: Document critical components and database requirements for narrative architecture implementation based on NARRATIVE-ARCHITECTURE-DRAFT-VISION.md specifications.

---

## Current State Analysis

### Existing Infrastructure (What We Have)
- **clinical_narratives** table with basic structure (id, patient_id, title, content, summary, shell_file_id, timestamps)
- **Separate entity linking tables** already implemented:
  - narrative_condition_links, narrative_medication_links, narrative_procedure_links, narrative_observation_links, narrative_allergy_links
- **Medical code resolution system** with separate `medical_code_assignments` table providing universal AND regional codes

### Missing Components (Implementation Gaps)
- **Narrative embeddings** for semantic discovery
- **Narrative-to-narrative relationships** table for hierarchical connections
- **Narrative type categorization** (condition, medication, event, procedure, allergy, monitoring)
- **Pass 3 AI processing pipeline** for narrative creation and updates
- **Versioning system** with immutable audit trail
- **discovery algorithm** combining embeddings + code matching

### Target Architecture Reference
See [NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md) for:
- Complete technical specifications
- Pass 3 processing pipeline details
- Database schema definitions
- Performance requirements and policies

## Core Architecture Design

### Flexible Relationship-Based Structure
**Approach**: Replace fixed hierarchy levels with dynamic parent-child relationships based on clinical logic and medical context.

**Key Design Principles**:
- **Entity-Type Categorization**: Organize narratives by clinical entity type rather than arbitrary hierarchy levels
- **Flexible Relationships**: Parent-child connections determined by actual medical relationships
- **Multi-Parent Support**: Complex conditions can have multiple parent narratives
- **Automatic Sibling Inference**: Siblings derived from shared parents (not explicitly stored)

### Narrative Entity Types
**Clinical Categorization System**:
- **Condition Narratives**: Chronic diseases, acute conditions (Heart Failure, Diabetes, Hypertension)
- **Medication Narratives**: Drug therapy journeys (Lisinopril management, Metformin therapy)
- **Event Narratives**: Time-bounded episodes (Hospital admissions, emergency visits, procedures)
- **Procedure Narratives**: Surgical and diagnostic procedures (Surgery recovery, diagnostic workups)
- **Allergy Narratives**: Reaction tracking (Drug allergies, food sensitivities)
- **Monitoring Narratives**: Ongoing surveillance (Blood pressure tracking, glucose monitoring)

**Cross-Type Relationship Examples**:
- Hospital admission (event) → contains medication changes + procedure narratives
- Lisinopril therapy (medication) → spans multiple hospital episodes (events)
- Heart Failure (condition) → encompasses medications + monitoring + events

### Narrative Evolution Model
**Immutable Accumulation**: AI continuously enriches narratives with each document upload, preserving complete historical context without overwriting previous versions.

**Progressive Enhancement Process**:
1. **Document Upload** → Pass 1/2 extract clinical events
2. **Narrative Discovery** → Find existing narratives to update
3. **AI Enhancement** → Add new clinical context while preserving history
4. **Version Creation** → New narrative version with audit trail

### Future Dashboard Integration
**Narrative-Driven Interface** (Future Enhancement):
- Dashboard components pull from narrative summaries rather than raw clinical data
- Medication lists derived from medication narrative summaries
- Condition overviews generated from condition narrative content
- Timeline integration maintains dual-lens architecture

## Database Schema Implementation

## CRITICAL ARCHITECTURE FIX REQUIRED

### **🚨 HIGH PRIORITY: Complete Clinical Event Linking**

**Problem Identified**: Current schema has incomplete clinical event linking across entity tables, breaking provenance tracking and narrative discovery.

**Current State**:
```sql
-- ✅ HAS clinical_event_id link:
patient_conditions.clinical_event_id UUID REFERENCES patient_clinical_events(id)

-- ❌ MISSING clinical_event_id links:
patient_medications    -- No clinical_event_id
patient_allergies      -- No clinical_event_id
patient_vitals         -- No clinical_event_id
patient_immunizations  -- No clinical_event_id
```

**Required Fix**:
```sql
-- CRITICAL: Add missing clinical_event_id links to complete architecture
ALTER TABLE patient_medications ADD COLUMN clinical_event_id UUID REFERENCES patient_clinical_events(id);
ALTER TABLE patient_allergies ADD COLUMN clinical_event_id UUID REFERENCES patient_clinical_events(id);
ALTER TABLE patient_vitals ADD COLUMN clinical_event_id UUID REFERENCES patient_clinical_events(id);
ALTER TABLE patient_immunizations ADD COLUMN clinical_event_id UUID REFERENCES patient_clinical_events(id);
```

**Impact**: Without these links, the event-based narrative discovery strategy cannot work, and we cannot eliminate the redundant `narrative_*_links` tables.

**Benefits After Fix**:
- Complete provenance tracking (entity → clinical event → medical codes)
- Enable narrative discovery via clinical events (eliminates redundant linking tables)
- Support future dashboard generation from narratives rather than core tables
- Simplified architecture with single source of truth through clinical events

### Schema Updates Required

**Core Table Enhancements**:
```sql
-- ADD to existing clinical_narratives table
ALTER TABLE clinical_narratives ADD COLUMN narrative_embedding VECTOR(1536) NOT NULL;
ALTER TABLE clinical_narratives ADD COLUMN narrative_type VARCHAR(50) NOT NULL; -- 'condition', 'medication', 'event', 'procedure', 'allergy', 'monitoring'
ALTER TABLE clinical_narratives ADD COLUMN narrative_start_date DATE;
ALTER TABLE clinical_narratives ADD COLUMN narrative_end_date DATE;
ALTER TABLE clinical_narratives ADD COLUMN confidence_score DECIMAL(3,2);
ALTER TABLE clinical_narratives ADD COLUMN clinical_coherence_score DECIMAL(3,2);

-- Timestamp-based versioning (UPDATED: no version numbers)
ALTER TABLE clinical_narratives ADD COLUMN is_current BOOLEAN DEFAULT TRUE;
ALTER TABLE clinical_narratives ADD COLUMN supersedes_id UUID REFERENCES clinical_narratives(id);
ALTER TABLE clinical_narratives ADD COLUMN content_fingerprint TEXT;
ALTER TABLE clinical_narratives ADD COLUMN created_by TEXT; -- Which Pass/model created this

-- New relationship table
CREATE TABLE narrative_relationships (
  id UUID PRIMARY KEY,
  parent_narrative_id UUID REFERENCES clinical_narratives(id),
  child_narrative_id UUID REFERENCES clinical_narratives(id),
  relationship_type VARCHAR(50), -- 'contains', 'relates_to', 'caused_by', 'part_of'
  relationship_strength DECIMAL(3,2),
  patient_id UUID NOT NULL, -- For RLS
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generic narrative-event linking (supplements existing specific tables)
CREATE TABLE narrative_event_links (
  id UUID PRIMARY KEY,
  narrative_id UUID REFERENCES clinical_narratives(id),
  clinical_event_id UUID,
  event_table VARCHAR(50), -- Which table the event is in
  patient_id UUID NOT NULL, -- For RLS
  created_at TIMESTAMP
);
```

**Performance Indexes**:
```sql
CREATE INDEX idx_clinical_narratives_embedding ON clinical_narratives
  USING ivfflat (narrative_embedding vector_cosine_ops);
CREATE INDEX idx_clinical_narratives_type ON clinical_narratives(narrative_type);
CREATE INDEX idx_clinical_narratives_current ON clinical_narratives(is_current) WHERE is_current = true;
CREATE INDEX idx_narrative_relationships_parent ON narrative_relationships(parent_narrative_id);
CREATE INDEX idx_narrative_relationships_child ON narrative_relationships(child_narrative_id);
```

**Existing Tables (ELIMINATION PLAN)**:
- narrative_condition_links, narrative_medication_links, etc. - **TARGET FOR REMOVAL** after clinical event linking is complete
- Replace with single `narrative_event_links` table using clinical events as intermediary
- Simpler architecture: narrative → clinical event → clinical entity (via clinical_event_id)

## Integration with Medical Code Resolution

### Dual-Engine Narrative Discovery
Based on the DRAFT-VISION specification, narrative discovery uses **two parallel engines**:

#### **Engine 1: Deterministic Matching (for Direct Narratives)**
- **Purpose**: Find direct narratives that should be updated with new clinical events
- **Method**: Match via medical codes attached to clinical events (NOT stored on narratives)
- **Target**: Direct narratives with clinical event links
- **Logic**: If clinical event has codes that match codes of events linked to existing narratives

#### **Engine 2: Semantic Matching (for Indirect Narratives)**
- **Purpose**: Find indirect "overarching" narratives that may need updating
- **Method**: Vector search over narrative summary embeddings
- **Target**: Indirect narratives without direct clinical event links
- **Logic**: Semantic similarity between new clinical event text and existing narrative summaries

### Discovery Algorithm (Aligned with DRAFT-VISION)
tbc

### Key Principles
- **No codes on narratives**: Medical codes remain on clinical events only
- **Direct via codes**: Use medical codes to find direct narratives with linked events
- **Indirect via embeddings**: Use semantic similarity for overarching narratives
- **Parallel processing**: Both engines run simultaneously for efficiency
- **Clear separation**: Direct narratives updated in Pass 3 Phase 1, indirect in Phase 3

## Implementation Decisions (Finalized)

### ✅ 1. Hierarchy Architecture
**Decision**: Flexible relationship-based tree structure
- Use `narrative_relationships` table for parent-child connections
- No fixed hierarchy levels (Grand/Minor/Sub)
- Allow multi-parent relationships for complex medical conditions

### ✅ 2. Sibling Relationships
**Decision**: Infer siblings from shared parents (not explicitly stored)
- Siblings = narratives with same parent
- Query via graph traversal, not relationship table
- Reduces AI complexity and storage overhead

### ✅ 3. Versioning Strategy
**Decision**: Timestamp-based with is_current flag
- No version numbers (risk of miscounting)
- Use `is_current` BOOLEAN as source of truth
- `created_at` timestamp for natural ordering
- `supersedes_id` for lineage tracking

### ✅ 4. Discovery Strategy
**Decision**: Dual-engine parallel approach (deterministic + semantic)
- **Deterministic engine**: Uses medical codes on clinical events to find direct narratives with matching linked events
- **Semantic engine**: Uses narrative summary embeddings to find indirect overarching narratives
- **Entity links**: Existing tables provide the connection between narratives and clinical events (not discovery mechanism)
- **Parallel processing**: Both engines run simultaneously for efficiency

### ✅ 5. Pass 3 Processing
**Decision**: Single AI call with three phases (from DRAFT-VISION)
- Phase 1: Direct narratives (clinical event → narrative)
- Phase 2: Relationship hints (parent-child suggestions)
- Phase 3: Indirect narratives (narrative → narrative relationships)

### ✅ 6. Performance Architecture
**Decision**: Always-embed strategy
- Every narrative gets embedded for consistent performance
- pgvector indexes for <50ms vector search
- Content fingerprint hash to prevent unnecessary re-embedding

## Pass 2 → Pass 3 Handoff: Deterministic Signals

### Payload-Only Metadata Hints
**Purpose**: Lightweight metadata hints that Pass 2 generates while processing clinical events to enable efficient narrative discovery.

**Pass 2 Signals (when available)**:
- **canonical_identity_key**: From medical code resolution (e.g., "rxnorm_314076_lisinopril_10mg")
- **code_signature**: From parallel code assignment (e.g., "rxnorm:314076|pbs:2345")
- **temporal_bucket**: Simple date parsing (e.g., "2025-09")
- **encounter_key**: IF extractable from document text (often missing)
- **change_hint**: IF detectable from context (e.g., "dose_increase")

**Implementation Notes**:
- Not all signals will be present for all events
- Pass 3 handles missing signals gracefully
- Duplicate detection relies on matching medical codes and identity keys
- Signals travel in Pass 2 → Pass 3 payload only (can be persisted in audit table later)

## Event-Type Identity and Reopen Policy

### Encounter Identity Strategy
**Preferred Identity**: Use source encounter identifiers when available
- encounter_id/visit number/MRN + facility + encounter type

**Fallback Identity**: Deterministic key generation
- facility/location + clinician + overlapping date range + encounter type

### Narrative Reopen Policy
**Reopen Conditions**: Event narratives with `valid_to` may be reopened if:
- Late-arriving events extend or clarify the clinical window
- New events fall within grace period after `valid_to`

**Grace Period**: Optional time window after `valid_to` during which propagation still considers the narrative active for updates.

## Security & Privacy Requirements

### Row Level Security (RLS)
**Critical Requirement**: Every narrative, relationship, and link row carries patient/profile context for strict access control
```sql
-- RLS policies required for all narrative tables
ALTER TABLE clinical_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_event_links ENABLE ROW LEVEL SECURITY;

-- Policy example
CREATE POLICY narrative_patient_isolation ON clinical_narratives
  USING (patient_id IN (SELECT get_allowed_patient_ids(auth.uid())));
```

### PHI Protection
**Embedding Safety**: Narrative summaries used for embeddings must be de-identified and scoped per patient during search
- No cross-patient semantic matching
- De-identified summary generation for embedding
- Patient-scoped vector search only

### Audit Requirements
**AI Provenance Tracking**: Capture method/model/version and provenance for AI-assisted updates
- Which AI model created/updated narrative
- Pass 3 processing session ID
- Clinical event sources that triggered update
- Confidence scores and reasoning

## Performance & UX Policies

### Caching Strategy
**narratives_display Cache**: Optional cache for UI performance
- Language/complexity variants for health-data-universality
- Hydrated from core narrative records
- Separate from source-of-truth narratives

### Relationship Traversal Optimization
**Recursive Query Performance**:
```sql
-- Cache common narrative tree views
CREATE MATERIALIZED VIEW patient_narrative_trees AS
SELECT patient_id, narrative_id, parent_path, depth
FROM (recursive narrative tree query);

-- Refresh strategy for materialized views
REFRESH MATERIALIZED VIEW patient_narrative_trees;
```

### Timeline Integration Performance
**Quick Event Fetch**: Provide fast chronological sequences for narrative's linked events
- Pre-computed event counts per narrative
- Indexed joins between narratives and clinical events
- Response time target: <100ms for narrative timeline view

## Event Bundling Policy

### Identity-Based Bundling (Not Time-Windowed)
**Grouping Strategy**: Group direct-narrative candidates by canonical identity keys
- medication_identity_key, condition_identity_key, etc.
- No arbitrary time windows needed
- Prevents double-counting same clinical fact from multiple documents

### Duplicate Detection
**Medical Code Matching**: Skip duplicates via matching medical codes and identity keys
```typescript
interface EventBundle {
  canonical_identity_key: string;
  events: ClinicalEvent[];
  existing_narrative_id?: UUID;
  medical_codes: string[]; // For duplicate detection
}
```

### Encounter-Based Boundaries
**Exception Handling**: Healthcare encounters use encounter-based boundaries
- Not arbitrary time windows
- Natural clinical episode boundaries
- Encounter identity for grouping related events

### Bundle Processing
**Per-Bundle Operations**:
1. Update/create the direct narrative
2. Adjust timeline fields (valid_to/last_event_effective_at)
3. Emit parent relationship hints only
4. Siblings inferred from graph structure (not explicitly assigned)

## Pass 3 MVP API Contract

### Input Specification
```typescript
interface Pass3Input {
  patient_id: UUID;
  profile_id: UUID;
  new_or_updated_events: {
    event_id: UUID;
    event_type: string;
    canonical_identity_key?: string;
    code_signature?: string;
    temporal_bucket?: string;
  }[];
  deterministic_matches: UUID[]; // Direct narrative IDs per event
  active_parents: UUID[]; // Parent narrative IDs (filtered by valid_to IS NULL, top-k, depth-capped)
  indirect_shortlist: UUID[]; // Candidate indirect narrative IDs from semantic + heuristics
}
```

### Output Specification
```typescript
interface Pass3Output {
  direct_narratives: {
    id: UUID;
    summary: string;
    fingerprint: string;
    last_event_effective_at: Date;
    is_current: boolean;
  }[];
  indirect_narratives: {
    id: UUID;
    summary: string;
    fingerprint: string;
    is_current: boolean;
  }[];
  relationships: {
    parent_id: UUID;
    child_id: UUID;
    type: string;
    confidence: number;
  }[];
  reembedding_required: UUID[]; // Narratives with changed fingerprints
  job_metrics: {
    token_count: number;
    processing_time_ms: number;
    narratives_updated: number;
    relationships_created: number;
  };
}
```

## Pass 3 Context Limits & Guardrails (MVP)

### Sequencing Policy
**Single Call Structure**: Three phases within one prompt for coherence
- Phase 1: Direct narratives (clinical event → narrative)
- Phase 2: Relationship hints (parent-child suggestions)
- Phase 3: Indirect narratives (narrative → narrative relationships)

### Context Caps
**Hard Limits to Prevent Runaway Processing**:
- Top-k parents: Maximum 5 parents for context
- Depth limit: Maximum 2 levels for parent context
- Narratives per job: Cap at 20 narrative updates/creations
- Re-queue overflow: Jobs exceeding limits split and re-queued

### Idempotency Requirements
**Safe Retry Logic**:
- Stable keys per narrative update: narrative_id + content_fingerprint_hash
- Retries are safe due to fingerprint-based deduplication
- Failed transactions leave no partial state changes

### Re-embedding Policy
**Efficiency Rules**:
- Re-embed summaries only when content_fingerprint_hash changes
- Batch embedding operations when possible
- Priority queue for embedding updates

### Context Diet
**Lean Context Strategy**: Use titles, summaries, and key timeline points
- Avoid bulk content payloads in AI context
- Focus on narrative summaries, not full clinical event details
- Minimize token usage while preserving clinical coherence

## Complementary Enhancement Layer

### System Independence
**Core Functionality Without Pass 3**: System remains fully functional on Pass 1/2 alone
- Events/timeline/UI work independently
- Pass 3 adds coherence and relationships
- No write-on-read patterns in database functions
- Jobs enqueued via API, not inline processing

### Future Evolution
**Narrative-First UI Option**: Future capability to pivot to narrative-first interface
- Without changing core data writes
- Narratives become primary user interface
- Timeline becomes secondary view
- Maintains data layer independence

## MVP Scope Gate Criteria

### Prerequisites for Pass 3 Start
**Required Infrastructure**:
- Pass 1/2 outputs finalized (including deterministic signals in Pass 2 → Pass 3 payload)
- Medical code resolution system operational
- pgvector extension enabled and indexed
- RLS policies implemented and tested

### Test Harness Requirements
**Validation Setup**:
- Small test dataset: 10-20 documents covering meds, labs, encounters, conditions
- Multiple patient scenarios for relationship testing
- Edge cases: duplicate medications, complex conditions, multi-encounter episodes

### Guardrails Configuration
**Operational Limits**:
- Bundle caps configured and enforced
- Parent/depth caps implemented
- Idempotency keys working correctly
- Re-embedding policy operational

### Metrics Infrastructure
**Monitoring Setup**:
- Counts: narratives created/updated, relationships formed
- Token usage: per job, per patient, daily totals
- Latencies: Pass 3 processing time, discovery query time
- Success/error codes: job completion rates, failure analysis

## Open Questions for Implementation

### Relationship Semantics
**Decisions Needed**:
- Minimal set of relationship types for MVP (contains, part_of, relates_to)?
- Relationship strength scoring algorithm
- Confidence thresholds for automatic relationship creation

### Update Propagation Strategy
**Design Decisions**:
- When small narrative changes, how/when to update parent episode/condition narratives?
- Propagation depth limits
- Batch vs real-time relationship updates

### Embedding Governance
**Policy Decisions**:
- Summary length limits for consistent embeddings
- Re-embedding cadence (immediate vs batched)
- Cost controls for embedding operations
- Embedding model versioning strategy

### User Personalization
**Future Considerations**:
- Should narrative tree be user-editable (labels, grouping)?
- Safe constraints for user modifications
- Relationship override capabilities
- Custom narrative organization options

## Implementation Roadmap

### Phase 1: Foundation (Database Schema) - 2 weeks
**Deliverables**:
- [ ] **CRITICAL FIRST**: Execute clinical event linking fix (add clinical_event_id to all entity tables)
- [ ] Execute narrative schema migration scripts (see Database Schema Implementation above)
- [ ] Add pgvector extension if not already enabled
- [ ] Create performance indexes
- [ ] Update RLS policies for new tables/columns
- [ ] Plan elimination of narrative_*_links tables in favor of event-based approach

**Success Criteria**:
- All new columns added without data loss
- Vector indexes operational
- RLS policies prevent cross-patient data access

### Phase 2: Pass 3 Pipeline - 3 weeks
**Dependencies**: Medical code resolution system operational
**Deliverables**:
- [ ] Implement Pass 3 single-call three-phase processing (see DRAFT-VISION)
- [ ] Build hybrid discovery algorithm (embeddings + entity links + medical codes)
- [ ] Create narrative embedding generation functions
- [ ] Implement content fingerprint change detection
- [ ] Add timestamp-based versioning logic

**Success Criteria**:
- Pass 3 processes clinical events into narratives
- Hybrid discovery finds relevant existing narratives
- Versioning preserves complete audit trail

### Phase 3: Integration & Testing - 2 weeks
**Deliverables**:
- [ ] Backfill embeddings for existing narratives
- [ ] End-to-end testing with sample patient data
- [ ] Performance validation (<100ms hybrid discovery)
- [ ] Clinical coherence validation with healthcare professionals

**Success Criteria**:
- Narrative discovery accuracy >85%
- Performance targets met
- Clinical validation passed

### Phase 4: Production Deployment - 1 week
**Deliverables**:
- [ ] Deploy Pass 3 to production pipeline
- [ ] Enable narrative features in dashboard UI
- [ ] Set up monitoring and alerting
- [ ] Create operational runbooks

**Success Criteria**:
- Production system processes new documents into narratives
- Users can navigate narrative relationships
- System maintains <100ms response times

## Files Requiring Updates

1. **semantic-coherence-framework.md** - Add hybrid discovery algorithm
2. **master-sub-narrative-hierarchy.md** - Update to relationship-based model
3. **timeline-narrative-integration.md** - Ensure compatibility with new structure
4. **narrative-versioning-supersession.md** - Verify with enhanced schema
5. **Database migration scripts** - Schema updates for existing tables

## Success Metrics & Validation

### Technical Performance
- **Discovery Accuracy**: >85% relevant narrative relationships identified
- **Response Time**: <100ms for hybrid narrative discovery
- **Vector Search**: <50ms for embedding similarity queries
- **Data Integrity**: Zero data loss during schema migrations
- **Audit Trail**: Complete versioning history preserved

### Clinical Quality
- **Healthcare Professional Validation**: >85% agreement on narrative coherence
- **Clinical Safety**: Zero inappropriate narrative connections
- **User Experience**: Intuitive navigation between narrative relationships
- **Timeline Integration**: Seamless switching between timeline and narrative views

### Operational Readiness
- **Monitoring**: Real-time performance and error rate tracking
- **Scalability**: System handles 1000+ narratives per patient
- **Compliance**: Full audit trail for healthcare regulatory requirements

## Next Steps

1. **Review & Approve**: This roadmap and technical specifications in DRAFT-VISION
2. **Resource Allocation**: Assign development team for 8-week implementation
3. **Dependencies**: Ensure medical code resolution system is operational
4. **Stakeholder Alignment**: Healthcare professional validation framework setup

## References

- **[NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md)**: Complete technical specifications
- **[Xavier's North Star Vision](#xaviers-comprehensive-narrative-vision---north-star)**: User experience goals and principles
- **[Current Database Schema](../../../current_schema/03_clinical_core.sql)**: Existing infrastructure baseline

---

**Implementation Status**: Ready to proceed with Phase 1 database schema updates upon approval.