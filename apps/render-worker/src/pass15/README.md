# Pass 1.5 Medical Code Embedding Module

**Purpose:** Vector similarity search service for medical code candidate retrieval

**Status:** IMPLEMENTED - Ready for Pass 2 integration

**Coverage:** 20,383 Australian medical codes (PBS + MBS) with universal codes pending

---

## Overview

Pass 1.5 is an isolated module within the Pass 2 worker that provides AI with 10-20 relevant medical code candidates instead of overwhelming it with 300,000+ possible codes. This prevents hallucination while maintaining semantic matching power.

### Core Function
```
Clinical Entity Text → Vector Embedding → Similarity Search → Ranked Candidates → Pass 2 AI
```

### Key Benefits
- **Prevents AI Hallucination:** Limited candidate set vs full database
- **Fast Performance:** <200ms per entity via pgvector
- **Cost Effective:** ~$0.0000004 per entity (essentially free)
- **Healthcare Compliant:** Complete audit trail via pass15_code_candidates table
- **Entity-Type Optimized:** Smart strategy for different medical entities

---

## Module Structure

```
apps/render-worker/src/pass15/
├── index.ts                    # Main entry point for Pass 2 integration
├── types.ts                    # TypeScript interfaces and types
├── config.ts                   # Configuration and constants
├── embedding-strategy.ts       # Smart Entity-Type Strategy
├── embedding-generator.ts      # OpenAI API integration with caching
├── vector-search.ts           # pgvector similarity search
├── candidate-selection.ts     # Filtering and ranking logic
└── README.md                  # This file
```

---

## Integration with Pass 2

### Usage Pattern
```typescript
// In Pass 2 worker before AI call
import { retrieveCodeCandidatesForBatch } from '../pass15';

async function processPass2Batch(entities: Pass1Entity[], patientId: string) {
  // Step 1: Get medical code candidates via Pass 1.5
  const candidateResults = await retrieveCodeCandidatesForBatch(entities, patientId);
  
  // Step 2: Prepare for AI call
  const codeCandidates = new Map<string, CodeCandidate[]>();
  for (const [entityId, result] of candidateResults.successful_entities) {
    const finalCandidates = processCodeCandidates(
      result.universal_candidates,
      result.regional_candidates,
      entity.entity_subtype
    );
    codeCandidates.set(entityId, finalCandidates);
  }
  
  // Step 3: Call Pass 2 AI with candidates
  const aiResult = await pass2AI(entities, bridgeSchemas, codeCandidates);
}
```

### Main Functions

**`retrieveCodeCandidatesForBatch(entities, patientId, countryCode)`**
- Primary entry point for Pass 2 integration
- Processes multiple entities concurrently
- Returns Map<entityId, CodeCandidatesResult>
- Handles errors gracefully

**`retrieveCodeCandidatesForEntity(entity, patientId, countryCode)`**
- Single entity processing
- Full pipeline: embedding → search → ranking
- Audit logging included

**`healthCheck()`**
- Validates database connectivity and API access
- Used for monitoring and deployment validation

---

## Smart Entity-Type Strategy

Different medical entities require different embedding text for optimal matching:

### Medications & Immunizations
```typescript
// Use original text (AI-cleaned standardized format)
"Lisinopril 10mg" → PBS/RxNorm search
```

### Diagnoses & Conditions
```typescript
// Use expanded AI interpretation when available
"T2DM" → "Type 2 Diabetes Mellitus" → SNOMED/ICD search
```

### Vital Signs & Lab Results
```typescript
// Combine measurement with context
"128/82" + "Blood pressure reading" → LOINC search
```

### Procedures
```typescript
// Use expanded description when available
"ECG" → "Electrocardiogram" → MBS/CPT search
```

---

## Configuration

### Embedding Settings
- **Model:** `text-embedding-3-small` (1536 dimensions)
- **Cache:** 24-hour TTL, in-memory
- **Retries:** 3 attempts with exponential backoff

### Search Settings
- **Universal Limit:** 30 candidates per search
- **Regional Limit:** 30 candidates per search  
- **Similarity Threshold:** 0.60 minimum
- **Timeout:** 5 seconds per search

### Candidate Selection
- **Target:** 10 candidates per entity
- **Min/Max:** 5-20 candidates
- **Auto-include:** >0.85 similarity
- **Entity-type filtering:** Prefer regional over universal codes

---

## Performance Targets

### Latency
- **Vector search:** <100ms p95
- **Total Pass 1.5:** <200ms per entity
- **Embedding generation:** <50ms (70% cached)

### Accuracy
- **Code assignment:** >95% (correct code in candidates)
- **Candidate relevance:** >90% (top candidate >0.75 similarity)
- **Recall:** >98% (correct code present in list)

### Cost
- **Runtime:** $0.0000004 per entity
- **Cache hit rate:** >70%
- **Token savings:** 20x reduction vs full database

---

## Error Handling

### Graceful Degradation
- OpenAI API failure → Return empty candidates (Pass 2 handles)
- Database failure → Return empty candidates
- Individual entity failure → Continue with rest of batch

### Audit Trail
All Pass 1.5 operations logged to `pass15_code_candidates` table:
- Embedding text used
- Candidates found (universal + regional)
- Search duration and metadata
- Required for healthcare compliance

### Monitoring
- Success/failure rates per entity type
- Search latency percentiles
- Cache hit rates
- API error rates

---

## Testing

### Unit Tests (Planned)
```bash
# Individual component tests
npm test pass15/embedding-strategy.test.ts
npm test pass15/candidate-selection.test.ts
npm test pass15/vector-search.test.ts
```

### Integration Tests (Planned)
```bash
# End-to-end pipeline tests
npm test pass15/integration.test.ts
```

### Manual Testing
```typescript
// Test with real entity
const testEntity = {
  id: 'test-123',
  entity_subtype: 'medication',
  original_text: 'Lisinopril 10mg',
};

const result = await retrieveCodeCandidatesForEntity(testEntity, 'patient-123');
console.log('Candidates found:', result.total_candidates_found);
```

---

## Current Status

### ✅ Implemented
- Complete module structure
- Smart Entity-Type Strategy
- OpenAI embedding generation with caching
- pgvector similarity search (universal + regional)
- Candidate filtering and ranking
- Healthcare audit logging
- Error handling and graceful fallbacks

### ⏳ Pending
- Unit test suite
- Integration with Pass 2 worker
- Performance monitoring integration
- Universal medical codes (awaiting UMLS approval)

### 📊 Available Data
- **PBS Medications:** 14,382 codes with embeddings
- **MBS Procedures:** 6,001 codes with embeddings
- **Universal Codes:** Pending UMLS approval (RxNorm, SNOMED, LOINC)

---

## Next Steps

1. **Integrate with Pass 2 Worker**
   - Import Pass 1.5 module
   - Update Pass 2 batch processing
   - Test end-to-end flow

2. **Add Universal Codes**
   - Process UMLS data when approved
   - Add ~200,000 additional codes
   - Test cross-system matching

3. **Performance Optimization**
   - Benchmark search latency
   - Optimize candidate selection
   - Monitor cache effectiveness

4. **Production Deployment**
   - Deploy to Render.com worker
   - Enable monitoring
   - Validate healthcare compliance