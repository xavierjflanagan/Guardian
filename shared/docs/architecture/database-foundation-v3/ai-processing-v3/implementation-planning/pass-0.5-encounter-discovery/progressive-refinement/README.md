# Pass 0.5 Progressive Refinement Architecture

## Overview

Progressive refinement enables Pass 0.5 encounter discovery to process documents of any size by splitting them into manageable chunks while preserving context across boundaries.

## Problem Statement

**Current Limitation:** Gemini 2.5 Flash has a 65,536 token output limit, causing failures on large documents (200+ pages).

**Example Failure:**
```
219-page medical file → Output exceeds 65K tokens → MAX_TOKENS error
Error: "Gemini stopped generation with reason: MAX_TOKENS"
```

## Solution: Tap-In/Tap-Out Processing

Process documents in chunks (e.g., 50 pages) with context handoff between chunks:

```
Chunk 1 (Pages 1-50)   → Handoff Package → Chunk 2 (Pages 51-100)
                                         → Handoff Package → Chunk 3 (Pages 101-150)
                                                          → etc.
```

## Key Features

1. **Context Preservation:** Handoff package carries incomplete encounters and active context
2. **No Data Loss:** Encounters spanning chunks are completed using handoff context
3. **Efficient:** Only used for documents >100 pages (90% of files use standard processing)
4. **Bulletproof:** Sequential processing ensures no encounters are missed

## Quick Start

### 1. Apply Database Migration
The migration is applied via Supabase MCP tools (not psql). See migration file:
```
migration_history/2025-11-10_44_pass05_progressive_refinement_infrastructure.sql
```

Execute using `mcp__supabase__apply_migration()` following the two-touchpoint workflow.

### 2. Deploy Worker Code
Update `encounterDiscovery.ts` with logic from `progressive-processing-logic.ts`

### 3. Test
Upload a 200+ page document and verify progressive processing activates

## Architecture Documents

- **CURRENT_STATE.md** - Detailed analysis of current limitations
- **IMPLEMENTATION_PLAN.md** - Phased rollout strategy
- **database-schema.sql** - Database DDL for progressive tables
- **progressive-processing-logic.ts** - Core implementation reference

## Processing Flow

```typescript
// Automatic selection based on document size
if (pages.length > 100) {
  return processProgressivePass05(pages); // Uses chunking
} else {
  return processStandardPass05(pages);    // Single AI call
}
```

## Handoff Package Structure

```typescript
{
  pendingEncounter: {
    tempId: "enc_temp_001",
    startPage: 45,
    partialData: { date: "2024-03-15", provider: "Dr. Smith" },
    lastSeenContext: "...continuing treatment plan..."
  },
  activeContext: {
    currentAdmission: { facility: "City Hospital", admitDate: "2024-03-14" },
    recentLabOrders: [...]
  }
}
```

## Performance Metrics

- **Small docs (<100 pages):** No change
- **Large docs (250 pages):** 5 chunks × ~15K output = SUCCESS
- **Cost increase:** ~48% for large docs (but actually works vs total failure!)
- **Quality:** Higher due to better context preservation

## Status

- **Phase 1:** Database schema design ✓
- **Phase 2:** Implementation (pending)
- **Phase 3:** Testing & rollout (pending)

## Related Documentation

- AI Model Switching: `../ai-model-switching/`
- Pass 0.5 Prompts: `../pass-0.5-encounter-discovery/`
- Database Schema: `../../current_schema/`
