# Pass 3 Processing Framework

**Status**: Implementation Ready - Aligned with DRAFT-VISION
**Purpose**: Define the Pass 3 AI processing framework for creating semantically coherent clinical narratives from structured clinical events
**Technical Authority**: Based on [NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md)

## Overview

Pass 3 transforms structured clinical events (from Pass 2) into coherent clinical narratives through a single AI call with three internal phases. This framework ensures narrative coherence while maintaining clinical safety and audit requirements.

## Core Architecture

### Single AI Call with Three Phases
**Design Decision**: Use one AI call with structured phases (not separate calls) to maintain narrative coherence across direct and indirect narrative updates.

```typescript
// Pass 3 Architecture
async function processNarratives(
  newClinicalEvents: ClinicalEvent[],
  discoveredNarratives: DiscoveryResults
) {
  // Single AI call with three phases inside one prompt
  const result = await aiModel.call({
    phase1: "Update direct narratives",
    phase2: "Generate relationship hints",
    phase3: "Update indirect narratives",
    context: { events: newClinicalEvents, existing: discoveredNarratives }
  });
}
```

## Phase-by-Phase Processing

### Phase 1: Direct Narratives
**Purpose**: Update or create narratives directly linked to clinical events

**Input**:
- New clinical events from current document upload
- Deterministically matched direct narratives (via medical codes)
- Active parent narratives for context (capped at top-5, depth-2)

**Processing**:
- Always update deterministically matched narratives (even duplicates may change valid_to dates)
- Create new direct narrative if no deterministic match exists
- Include active parents (valid_to IS NULL) for context only

**Output**:
- Updated/created direct narrative content
- Updated temporal fields (narrative_start_date, narrative_end_date, last_event_effective_at)
- Content fingerprint hash for change detection

### Phase 2: Relationship Hints
**Purpose**: Propose parent-child narrative relationships based on Phase 1 outputs

**Input**:
- All direct narratives from Phase 1 (updated and newly created)
- Existing narrative relationship context

**Processing**:
- Analyze Phase 1 narratives for logical parent-child connections
- Propose relationships with confidence scores and reasoning
- Keep suggestions bounded (top-k) to control context and cost
- **Note**: Siblings automatically inferred from shared parents (not AI-assigned)

**Output**:
- Relationship suggestions with types: 'contains', 'relates_to', 'caused_by', 'part_of'
- Confidence scores and clinical reasoning for each suggestion

### Phase 3: Indirect Narratives
**Purpose**: Update or create overarching narratives based on relationships and semantic context

**Input**:
- Semantically discovered indirect narrative candidates (via embedding search)
- Relationship hints from Phase 2
- Direct narrative summaries from Phase 1

**Processing**:
- Consider shortlisted indirect candidates from semantic discovery
- Update existing indirect narratives based on new clinical context
- Create new indirect narratives when clinical logic warrants
- Keep work bounded and idempotent

**Output**:
- Updated/created indirect narrative content
- New narrative relationships based on Phase 2 hints
- Updated temporal and relevance fields

## Dual-Engine Narrative Discovery

### Engine 1: Deterministic Discovery (for Direct Narratives)
**Method**: Match via medical codes on clinical events
**Target**: Direct narratives with clinical event links
**Implementation**:
```sql
-- Find direct narratives via medical code matching
SELECT DISTINCT n.*
FROM clinical_narratives n
JOIN narrative_medication_links nml ON n.id = nml.narrative_id
JOIN patient_medications pm ON nml.medication_id = pm.id
JOIN medical_code_assignments mca ON pm.id = mca.entity_id
WHERE mca.universal_code IN (${newEventCodes})
   OR mca.regional_code IN (${newEventCodes});
```

### Engine 2: Semantic Discovery (for Indirect Narratives)
**Method**: Vector search over narrative summary embeddings
**Target**: Indirect narratives without direct clinical event links
**Implementation**:
```typescript
// Semantic discovery for indirect narratives
const semanticMatches = await supabase.rpc('search_narrative_embeddings', {
  query_embedding: await embed(newEvents.map(e => e.summary).join(' ')),
  similarity_threshold: 0.7,
  max_results: 10,
  patient_id: currentPatientId
});
```

## AI Context Management

### Context Structure for Pass 3
```typescript
interface Pass3Context {
  // Phase 1 inputs
  newClinicalEvents: ClinicalEvent[];
  determinismicMatches: DirectNarrative[];
  activeParents: ParentNarrative[]; // Capped at 5 parents, depth 2

  // Phase 3 inputs
  semanticCandidates: IndirectNarrative[];

  // Guardrails
  maxNarrativeUpdates: number; // Cap per job
  contentDiet: boolean; // Use summaries, not full content
}
```

### Token Budget Optimization
- **Lean context**: Use titles, summaries, key timeline points (not bulk content)
- **Bounded work**: Cap narratives updated per job, re-queue overflow
- **Content fingerprints**: Only re-embed when content actually changes
- **Active filtering**: Only include active narratives (valid_to IS NULL)

## Quality Assurance Framework

### Narrative Coherence Validation
**Content Fingerprint Hash**: Detect actual content changes to prevent unnecessary processing
```typescript
const contentHash = generateFingerprint(narrative.summary + narrative.content);
if (contentHash !== existingNarrative.content_fingerprint) {
  // Content actually changed, proceed with update
  await updateNarrative({ ...narrative, content_fingerprint: contentHash });
}
```

### Clinical Safety Checks
- **Idempotency**: Stable keys per narrative update using fingerprints
- **Audit trail**: Complete versioning with created_by tracking
- **Safe retries**: Fingerprint-based deduplication prevents double processing
- **Bounded processing**: Prevent runaway AI processing with hard limits

### Performance Monitoring
**Key Metrics**:
- Phase 1 direct narrative update success rate
- Phase 2 relationship suggestion accuracy
- Phase 3 indirect narrative coherence scores
- Overall processing time per clinical event
- Content fingerprint change frequency

## Integration Points

### Medical Code Resolution System
- **Input dependency**: Requires medical codes assigned to clinical events
- **Discovery enablement**: Medical codes enable deterministic narrative matching
- **No code storage**: Codes remain on clinical events, not narratives

### Temporal Data Management
- **Event foundation**: Narratives reference deduplicated clinical events as source of truth
- **Timeline integration**: Narrative temporal fields align with clinical effective dates
- **Audit compatibility**: Narrative versioning follows healthcare audit requirements

### Health Data Universality
- **Display layer**: Narrative summaries can be translated/adapted for different complexity levels
- **Source preservation**: Core narrative content remains canonical regardless of display layer

## Implementation Guidelines

### Pass 3 API Contract
```typescript
interface Pass3Input {
  patient_id: UUID;
  profile_id: UUID;
  new_clinical_events: ClinicalEvent[];
  deterministic_matches: DirectNarrativeMatch[];
  active_parents: ParentNarrative[];
  indirect_shortlist: IndirectNarrativeCandidate[];
}

interface Pass3Output {
  direct_narratives: { id: UUID; summary: string; fingerprint: string; is_current: boolean }[];
  indirect_narratives: { id: UUID; summary: string; fingerprint: string; is_current: boolean }[];
  relationships: { parent_id: UUID; child_id: UUID; type: string; confidence: number }[];
  reembedding_required: UUID[]; // Narratives with changed fingerprints
  job_metrics: { token_count: number; processing_time_ms: number };
}
```

### Error Handling
- **Graceful degradation**: System remains functional if Pass 3 unavailable
- **Retry logic**: Safe retries using content fingerprints
- **Overflow handling**: Re-queue work if job exceeds processing limits
- **Context limits**: Hard caps on parent depth and narrative count

## Success Criteria

### Technical Performance
- **Processing speed**: <2 seconds for typical document with 5-10 clinical events
- **Accuracy**: >85% relevant narrative relationships identified
- **Efficiency**: <50% token usage compared to processing full document text
- **Reliability**: <1% processing failures requiring manual intervention

### Clinical Quality
- **Coherence**: Healthcare professional validation >85% agreement
- **Safety**: Zero inappropriate clinical connections between unrelated narratives
- **Completeness**: All relevant clinical events incorporated into appropriate narratives
- **Auditability**: Complete decision trail for regulatory compliance

This framework provides the foundation for transforming structured clinical data into coherent, navigable healthcare narratives while maintaining clinical safety and system performance.