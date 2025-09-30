# Render.com Narrative Functions Reference

**Purpose**: Functions that should be implemented in the Render.com worker service (NOT in Supabase)
**Context**: These complement the database functions in `2025-09-25_03_narrative_architecture.sql`

## Required Functions for Render.com Worker

### 1. Content Fingerprint Generation
```typescript
export function generateContentFingerprint(content: string, summary: string = ''): string {
  const normalized = (summary + ' ' + content).trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

### 2. Narrative Version Creation (Business Logic)
```typescript
export async function createNarrativeVersion(params: {
  narrativeId: UUID;
  title: string;
  content: string;
  summary: string;
  narrativeType: string;
  patientId: UUID;
  createdBy?: string;
}): Promise<UUID> {
  // Generate fingerprint
  const newFingerprint = generateContentFingerprint(params.content, params.summary);

  // Check if content changed (Supabase query)
  const { data: current } = await supabase
    .from('clinical_narratives')
    .select('content_fingerprint')
    .eq('id', params.narrativeId)
    .eq('is_current', true)
    .single();

  if (current?.content_fingerprint === newFingerprint) {
    return params.narrativeId; // No change
  }

  // Call Supabase atomic helper
  const { data, error } = await supabase.rpc('create_narrative_version_atomic', {
    p_narrative_id: params.narrativeId,
    p_title: params.title,
    p_content: params.content,
    p_summary: params.summary,
    p_narrative_type: params.narrativeType,
    p_patient_id: params.patientId,
    p_content_fingerprint: newFingerprint,
    p_created_by: params.createdBy || 'Pass3_AI'
  });

  if (error) throw new Error(`Narrative version creation failed: ${error.message}`);
  return data;
}
```

### 3. Pass 3 AI Processing Pipeline
```typescript
export async function processNarrativesPass3(params: {
  patientId: UUID;
  profileId: UUID;
  newClinicalEvents: ClinicalEvent[];
  deterministicMatches: DirectNarrativeMatch[];
  activeParents: ParentNarrative[];
  indirectShortlist: IndirectNarrativeCandidate[];
}): Promise<Pass3Output> {
  // Phase 1: Direct narratives
  const directNarratives = await updateDirectNarratives(params);

  // Phase 2: Relationship hints
  const relationshipHints = await generateRelationshipHints(directNarratives);

  // Phase 3: Indirect narratives
  const indirectNarratives = await updateIndirectNarratives(params.indirectShortlist, relationshipHints);

  return {
    direct_narratives: directNarratives,
    indirect_narratives: indirectNarratives,
    relationships: relationshipHints,
    reembedding_required: [...], // Narratives that need new embeddings
    job_metrics: { /* ... */ }
  };
}
```

### 4. Embedding Generation
```typescript
export async function generateNarrativeEmbedding(summary: string): Promise<number[]> {
  // Call OpenAI text-embedding-3-small API
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: summary,
    dimensions: 1536
  });

  return response.data[0].embedding;
}
```

### 5. Dual-Engine Narrative Discovery
```typescript
export async function discoverRelevantNarratives(params: {
  newClinicalEvents: ClinicalEvent[];
  patientId: UUID;
}): Promise<{
  deterministicMatches: DirectNarrativeMatch[];
  semanticCandidates: IndirectNarrativeCandidate[];
}> {
  // Engine 1: Deterministic matching via medical codes
  const deterministicMatches = await findNarrativesByMedicalCodes(params.newClinicalEvents, params.patientId);

  // Engine 2: Semantic matching via embeddings
  const eventSummary = params.newClinicalEvents.map(e => e.summary).join(' ');
  const eventEmbedding = await generateNarrativeEmbedding(eventSummary);

  const { data: semanticCandidates } = await supabase.rpc('find_similar_narratives', {
    p_narrative_embedding: eventEmbedding,
    p_patient_id: params.patientId,
    p_similarity_threshold: 0.7,
    p_limit: 10
  });

  return { deterministicMatches, semanticCandidates };
}
```

## Integration with Supabase Functions

### Query Current Narratives
```typescript
const { data: narratives } = await supabase.rpc('get_current_narratives', {
  p_patient_id: patientId
});
```

### Get Timeline for Narrative
```typescript
const { data: timeline } = await supabase.rpc('get_narrative_timeline', {
  p_narrative_id: narrativeId
});
```

### Navigate Relationships
```typescript
const { data: relationships } = await supabase.rpc('get_narrative_relationships', {
  p_narrative_id: narrativeId,
  p_relationship_direction: 'both'
});
```

## Architecture Benefits

### Supabase Handles:
- ✅ **RLS enforcement** on all narrative queries
- ✅ **Complex joins** for timeline integration
- ✅ **Vector search** with pgvector optimization
- ✅ **Graph traversal** with recursive CTEs
- ✅ **Atomic transactions** for data consistency

### Render.com Handles:
- ✅ **AI integration** and embedding generation
- ✅ **Business logic** validation and error handling
- ✅ **Content fingerprinting** and change detection
- ✅ **Pass 3 processing** pipeline orchestration
- ✅ **Retry logic** and job queue management

This split ensures optimal performance while maintaining proper separation of concerns between database operations and application business logic.