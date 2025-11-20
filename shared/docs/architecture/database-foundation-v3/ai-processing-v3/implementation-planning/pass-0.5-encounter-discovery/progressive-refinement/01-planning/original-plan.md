# Implementation Plan: Progressive Refinement for Pass 0.5

## Overview

Three-phase rollout over 2 weeks with incremental testing and validation at each stage.

## Phase 1: Foundation (Days 1-3)

### Database Schema (Day 1)

**Tasks:**
1. Create new tables via migration
2. Add indexes for performance
3. Create monitoring views
4. Test with synthetic data

**Deliverables:**
- Migration file: `2025-11-11_XX_progressive_refinement_infrastructure.sql`
- Updated `current_schema/04_ai_processing.sql`
- Performance testing results

**Validation:**
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'pass05_%';

-- Test insert/select
INSERT INTO pass05_progressive_sessions (...) VALUES (...);
SELECT * FROM pass05_progressive_performance;
```

### Core Processing Logic (Days 2-3)

**Tasks:**
1. Implement chunk processor function
2. Build handoff package logic
3. Create progressive orchestrator
4. Add decision logic (standard vs progressive)

**Deliverables:**
- `apps/render-worker/src/pass05/progressive/`
  - `chunk-processor.ts` - Individual chunk processing
  - `handoff-manager.ts` - Context carrying logic
  - `progressive-orchestrator.ts` - Main coordinator
  - `types.ts` - TypeScript interfaces

**Integration Point:**
```typescript
// In encounterDiscovery.ts
export async function discoverEncounters(input: Input): Promise<Result> {
  const PAGE_THRESHOLD = 100;

  if (input.pageCount <= PAGE_THRESHOLD) {
    return processStandardPass05(input);
  } else {
    return processProgressivePass05(input);
  }
}
```

**Validation:**
- Unit tests for chunk processing
- Mock handoff package tests
- Type checking passes

## Phase 2: Integration & Testing (Days 4-7)

### Prompt Engineering (Day 4)

**Tasks:**
1. Design progressive prompt template
2. Add handoff context formatting
3. Create continuation detection logic
4. Test prompt variations

**Deliverables:**
- `buildProgressivePrompt()` function
- Prompt template in `aiPrompts.progressive.ts`
- Test cases for various handoff scenarios

**Prompt Structure:**
```typescript
`You are processing chunk ${chunkNum} of ${totalChunks}
Pages ${pageStart}-${pageEnd} of ${totalPages}

${handoffContext ? formatHandoffContext(handoffContext) : 'First chunk'}

TASK:
1. Complete pending encounter from previous chunk
2. Identify new encounters in your page range
3. Create handoff for encounters continuing beyond page ${pageEnd}

OUTPUT:
{
  "completed_encounters": [...],
  "continuing_encounter": {...},
  "handoff_package": {...}
}
`
```

### Database Integration (Day 5)

**Tasks:**
1. Implement session management functions
2. Add chunk result tracking
3. Create pending encounter handlers
4. Build reconciliation logic

**Deliverables:**
- `progressive-db.ts` - Database access layer
- Functions for:
  - `initializeProgressiveSession()`
  - `saveChunkResults()`
  - `savePendingEncounter()`
  - `finalizePendingEncounters()`

**Validation:**
```typescript
// Test complete flow
const session = await initializeProgressiveSession(shellFileId, 200, 50);
const chunk1 = await processChunk({ sessionId: session.id, ... });
await saveChunkResults(chunk1);
// Verify database state
```

### End-to-End Testing (Days 6-7)

**Test Cases:**

1. **Small Document (10 pages)** - Should use standard processing
2. **Medium Document (100 pages)** - Boundary case, uses standard
3. **Large Document (150 pages)** - 3 chunks, test handoff
4. **Very Large Document (250 pages)** - 5 chunks, complex handoff

**Test Documents:**
- Create synthetic medical documents with known encounters
- Test edge cases:
  - Encounter spanning 3 chunks
  - Lab results across chunk boundary
  - Hospital admission (admit in chunk 1, discharge in chunk 4)

**Validation Criteria:**
- All encounters detected
- Page assignments correct
- No duplicates
- Proper handoff between chunks
- Database state consistent

## Phase 3: Production Rollout (Days 8-10)

### Deployment (Day 8)

**Pre-deployment Checklist:**
- [ ] All unit tests passing
- [ ] E2E tests passing with synthetic docs
- [ ] Database migration tested on staging
- [ ] Performance benchmarks acceptable
- [ ] Monitoring dashboards ready
- [ ] Rollback plan documented

**Deployment Steps:**
1. Apply database migration to production
2. Deploy worker code with feature flag OFF
3. Verify deployment health
4. Enable progressive mode for test account
5. Process real 219-page document
6. Validate results
7. Enable for all users

**Feature Flag:**
```typescript
// Follows existing Pass 0.5 env var naming convention (PASS_05_STRATEGY, PASS_05_VERSION)
const PROGRESSIVE_ENABLED = process.env.PASS_05_PROGRESSIVE_ENABLED === 'true';

if (PROGRESSIVE_ENABLED && input.pageCount > 100) {
  return processProgressivePass05(input);
}
```

### Monitoring & Validation (Days 9-10)

**Metrics to Track:**

```sql
-- Progressive session success rate
SELECT
  processing_status,
  COUNT(*) as sessions,
  AVG(total_pages) as avg_pages,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
FROM pass05_progressive_sessions
GROUP BY processing_status;

-- Chunk failure analysis
SELECT
  chunk_number,
  processing_status,
  COUNT(*) as occurrences,
  AVG(input_tokens + output_tokens) as avg_tokens
FROM pass05_chunk_results
GROUP BY chunk_number, processing_status
ORDER BY chunk_number;

-- Pending encounter completion rate
SELECT
  status,
  COUNT(*) as encounters,
  AVG(chunk_last_seen - chunk_started) as avg_chunks_to_complete
FROM pass05_pending_encounters
GROUP BY status;
```

**Success Criteria (E2E Testing Acceptance):**
- Progressive sessions complete successfully
- No encounter data loss
- Pending encounters properly reconciled
- Performance acceptable (<5min for 200-page doc - initial acceptance target)
- Cost within expected range (~48% increase for large docs)

### User Acceptance Testing (Day 10)

**Test with Real Documents:**
1. Original 219-page failure document
2. Various large documents from production
3. Edge cases (jumbled pages, multiple providers)

**User Experience:**
- Processing completes successfully
- Encounters appear correctly in timeline
- Page assignments accurate
- No duplicate encounters
- Reasonable processing time

## Rollback Plan

### If Critical Issues Found

**Immediate Rollback:**
```bash
# Disable progressive mode
render env set PASS_05_PROGRESSIVE_ENABLED=false

# Revert to previous deployment
render rollback
```

**Database Rollback:**
```sql
-- Tables can remain (no breaking changes)
-- Just disable progressive processing at application level
-- Data in progressive tables preserved for analysis
```

### Partial Rollback

If issues only affect progressive mode:
- Keep standard mode enabled
- Disable only progressive processing
- Investigate and fix issues
- Re-enable incrementally

## Post-Deployment Tasks

### Documentation (Ongoing)

**Update:**
- `CLAUDE.md` - Add progressive processing section
- API documentation - Note chunk-based processing
- User-facing docs - Processing time estimates

### Optimization (Future Iterations)

**Potential Improvements:**
1. **Adaptive chunk sizing** - Adjust based on document complexity
2. **Parallel preparation** - Pre-process next chunk while AI processes current
3. **Smart boundaries** - Detect natural break points
4. **Resume capability** - Restart from last successful chunk
5. **Quality scoring** - Flag low-confidence handoffs for review

## Success Metrics (30 Days Post-Launch)

**Technical Metrics (Optimization Targets):**
- [ ] 100% success rate for documents <300 pages
- [ ] <5% manual review rate for progressive sessions
- [ ] <2% pending encounter reconciliation failures
- [ ] Average processing time <3min for 200-page docs (optimized from <5min acceptance target)

**Business Metrics:**
- [ ] Zero MAX_TOKENS failures
- [ ] User satisfaction with large document processing
- [ ] Cost per document within budget
- [ ] Support tickets for large documents reduced

## Timeline Summary

```
Week 1:
Mon-Tue:  Database + Core Logic
Wed-Thu:  Prompt Engineering + Integration
Fri:      End-to-End Testing

Week 2:
Mon:      Production Deployment
Tue-Wed:  Monitoring + Validation
Thu-Fri:  User Acceptance + Documentation

Week 3:
Ongoing:  Monitoring + Optimization
```

## Risk Mitigation

### High-Risk Areas

1. **Handoff Context Loss**
   - Mitigation: Extensive testing of edge cases
   - Monitoring: Track pending encounter completion rates

2. **Performance Degradation**
   - Mitigation: Parallel processing where possible
   - Monitoring: Track processing times per chunk

3. **Cost Overruns**
   - Mitigation: Set chunk size based on cost analysis
   - Monitoring: Track AI costs daily

4. **Data Quality Issues**
   - Mitigation: Confidence scoring for handoffs
   - Monitoring: Manual review queue metrics

## Go/No-Go Decision Criteria

**Must Have:**
- All unit tests passing
- E2E test with 219-page document succeeds
- Database migration applies cleanly
- No regressions in standard processing

**Should Have:**
- Performance within 2x of target
- Cost within 20% of estimate
- Manual review rate <10%

**Nice to Have:**
- Adaptive chunk boundaries working
- Progress indicator for users
- Resume capability functional

## Appendix: Migration Template

See `database-schema.sql` for complete DDL.

**Key Functions to Implement:**
- `initializeProgressiveSession()`
- `processChunk()`
- `saveChunkResults()`
- `finalizePendingEncounters()`
- `reconcileChunkEncounters()`
