# Pass 0.5 Strategy A - System Overview

**Date:** November 14, 2024 (Updated November 15, 2024)
**Version:** 2.0
**Status:** Design Complete - Ready for Implementation

## Executive Summary

Strategy A implements a unified progressive processing pipeline for ALL medical documents, regardless of page count. Every document follows the same path: chunking → pending encounters → reconciliation → final encounters.

**V2 Updates (Nov 15, 2024):**
- OCR integration design complete for precise intra-page boundaries
- Position reconciliation strategy defined for multi-chunk encounters
- Reconciler duplicate-prevention strategy finalized
- Prompt V11 specification updated with all position fields
- Script analysis V2 complete with 6-7 new scripts identified

## Core Principles

1. **Universal Progressive Path**: All files processed progressively (1-page to 1000-page)
2. **All Encounters Pending First**: Every encounter goes to pending table before finalization
3. **Cascade ID Linking**: Unique IDs track encounters across chunk boundaries
4. **Deterministic Reconciliation**: Cascade IDs group related pendings into final encounters
5. **Position Awareness**: Precise intra-page boundaries using OCR bounding box coordinates
6. **Two-Tier Boundary System**: Inter-page (natural breaks) vs Intra-page (Y-coordinates)
7. **Graceful Degradation**: Coordinate extraction failures degrade to inter-page boundaries

## System Architecture

### Phase 1: Document Intake
- Shell file received with OCR pages
- Progressive session created (always, regardless of size)
- Document chunked into 50-page segments
- Single chunk for documents ≤50 pages

### Phase 2: Chunk Processing
- Each chunk processed sequentially
- AI identifies ALL encounters in chunk with position data
- **OCR Coordinate Extraction**: Convert AI text markers → Y-coordinates from OCR bboxes
- Post-processor assigns IDs and cascade markers
- ALL encounters saved as pending with 13 position fields
- Cascading encounter packaged for handoff
- **Batching Analysis**: AI identifies safe split points for Pass 1/2 batching

### Phase 3: Reconciliation
- **Session-level guard**: Ensures all chunks completed before reconciliation
- Groups pending encounters by cascade_id
- **Position Merging**: First chunk's start position + last chunk's end position
- **Weighted Confidence**: Calculate position confidence across all chunks
- **Batching Aggregation**: Combine safe split points from all chunks → shell_files
- Creates final encounters from groups with merged position data
- **Duplicate Prevention**: Cascade linking prevents duplicate encounter creation
- Updates page assignments to final IDs
- No reliance on AI state management

### Phase 4: Metrics & Summary
- Aggregates session statistics
- Optional summary generation for multi-chunk encounters
- Updates reporting tables

## Data Flow Diagram (V2)

```
[Shell File Upload + OCR Data]
        ↓
[Create Progressive Session]
        ↓
[Chunk Document (50 pages each)]
        ↓
┌──────────────────────────────────┐
│   Process Chunk 1                │
│   - AI analyzes encounters       │
│   - Outputs text markers         │
│   - Extract OCR coordinates      │ → [Pending Encounters + 13 position fields]
│   - Batching analysis            │ → [Chunk batching analysis]
│   - Assign cascade IDs           │ → [Cascade Handoff]
└──────────────────────────────────┘         ↓
        ↓                                    ↓
┌──────────────────────────────────┐   ┌─────────────────────┐
│   Process Chunk 2                │ ← │ cascade_id: xyz     │
│   - Receives handoff context     │   │ context: {...}      │
│   - AI continues cascade         │   │ continues_previous  │
│   - Extract coordinates          │   └─────────────────────┘
│   - More batching analysis       │
└──────────────────────────────────┘
        ↓
[All Chunks Complete]
        ↓
┌───────────────────────────────────────────┐
│     Reconciler (V2)                       │
│ - Session guard check                     │
│ - Group by cascade_id                     │
│ - Merge start positions (first chunk)     │
│ - Merge end positions (last chunk)        │
│ - Weighted confidence calculation         │
│ - Aggregate batching analysis             │
│ - Create final encounters                 │
│ - Update page assignments                 │
└───────────────────────────────────────────┘
        ↓
[Healthcare Encounters + shell_files.page_separation_analysis]
        ↓
[Update Metrics]
        ↓
[Complete]
```

## Key Innovations

### 1. Cascade ID System
- Generated once when encounter reaches chunk boundary
- Passed through handoff to next chunk
- Used as primary key for reconciliation
- Eliminates ambiguity in multi-chunk encounters

### 2. Universal Pipeline
- No branching logic based on document size
- 20-page document = 1-chunk progressive session
- 500-page document = 10-chunk progressive session
- Same code path, same prompt, same processing

### 3. Position Granularity (V2: OCR Integration Complete)
- **Two-tier boundary system:**
  - **Inter-page**: Natural page breaks (no coordinates needed)
  - **Intra-page**: Precise Y-coordinates from OCR bounding boxes
- **13 position fields per encounter:**
  - Start: page, boundary_type, marker, text_y_top, text_height, split_y
  - End: page, boundary_type, marker, text_y_top, text_height, split_y
  - position_confidence: weighted average across chunks
- **Coordinate extraction process:**
  1. AI outputs text markers (e.g., "just before header 'EMERGENCY ADMISSION'")
  2. Worker code extracts Y-coordinates from OCR bounding boxes
  3. Fuzzy matching fallback for OCR variations
  4. Graceful degradation to inter-page if extraction fails
- Handles multiple encounters per page
- Prevents false cascading from mid-page endings

### 4. Batching Analysis for Pass 1/2
- AI identifies safe document split points during Pass 0.5
- Stored per chunk, aggregated during reconciliation
- Deduplicated at chunk boundaries
- Written to `shell_files.page_separation_analysis` for Pass 1/2 use
- Enables intelligent batching for clinical extraction phases

## Success Metrics

- **Accuracy**: 142-page test → 1 final encounter (not 3)
- **Completeness**: All 142 pages assigned correctly
- **Efficiency**: Minimal handoff data between chunks
- **Reliability**: No dependency on AI memory/state
- **Scalability**: Handles 10-page to 1000-page documents

## Implementation Timeline

**V2 Estimate: 4-5 weeks** (updated from V1's 4 weeks)

### Week 1-2: Core Pipeline + Position System
- Implement cascade ID management
- Build coordinate extraction from OCR bboxes
- Create position validation logic
- Update chunk-processor with 13 position fields

### Week 3: Reconciliation + Batching
- Implement position merging (start/end/confidence)
- Build batching analysis aggregation
- Session-level guard checks
- Duplicate prevention via cascade linking

### Week 4: Testing + Integration
- Multi-chunk encounter testing
- Coordinate extraction edge cases
- Position validation testing
- Integration with existing progressive pipeline

### Week 5: Polish + Documentation
- Error handling refinement
- Performance optimization
- Documentation updates
- Deployment preparation

**Key Complexity Increases:**
- chunk-processor.ts: HIGH → VERY HIGH
- pending-reconciler.ts: MEDIUM → VERY HIGH
- 6-7 new scripts required (vs V1's 4 scripts)

## Design Evolution (V1 → V2)

### November 14, 2024: V1 Initial Design
- Core cascade ID system defined
- Basic position awareness (5-position system: top/quarter/middle/three-quarters/bottom)
- Initial script analysis (4 new scripts estimated)
- Reconciliation strategy outlined

### November 15, 2024: V2 Blocker Resolution
**Three critical blockers identified and resolved:**

#### Blocker 1: Reconciler Duplicate Prevention
- **Problem**: Original reconciliation could create duplicate encounters
- **Solution**: Cascade ID-based grouping ensures 1 final encounter per cascade
- **Impact**: CRITICAL - prevents data corruption
- **Document**: 06-RECONCILER-FIXES.md

#### Blocker 2: OCR Integration Missing
- **Problem**: V1 used 5-position qualitative system, no coordinate extraction
- **Solution**: Two-stage approach (AI text markers → code extracts Y-coordinates)
- **Impact**: CRITICAL - enables precise intra-page boundaries
- **Document**: 07-OCR-INTEGRATION-DESIGN.md
- **Changes**:
  - Replaced 5-position system with inter_page vs intra_page
  - Added 13 position fields to pending/final encounters
  - New coordinate-extractor.ts script required

#### Blocker 3: Position Data Merging
- **Problem**: Multi-chunk encounters need merged position data
- **Solution**: First chunk = start, last chunk = end, weighted confidence
- **Impact**: HIGH - accurate positions for cascading encounters
- **Document**: 08-RECONCILIATION-STRATEGY-V2.md
- **Changes**:
  - Added position merging functions to reconciler
  - Batching analysis aggregation to shell_files
  - Session-level guard checks for concurrency safety

### Key Design Decisions
1. **Multiple Match Policy**: Keep "first match" approach, rely on AI disambiguating context
2. **Page Number Format**: Document-absolute (1-N), not chunk-relative
3. **Error Handling**: Graceful degradation (intra_page → inter_page on extraction failure)
4. **Batching Deduplication**: Remove duplicate split points at chunk boundaries
5. **Concurrency Safety**: Session-level guard prevents premature reconciliation

## Related Documents

### Core Design Documents
- [02-SCRIPT-ANALYSIS-V2.md](./02-SCRIPT-ANALYSIS-V2.md) - **V2 CURRENT**: Complete script change plan
- [02-SCRIPT-ANALYSIS-V1.md](./02-SCRIPT-ANALYSIS-V1.md) - V1 historical reference
- [03-TABLE-DESIGN.md](./03-TABLE-DESIGN.md) - Database schema for Strategy A
- [04-PROMPT-V11-SPEC.md](./04-PROMPT-V11-SPEC.md) - V11 unified prompt specification

### Blocker Resolution Documents (Nov 15, 2024)
- [06-RECONCILER-FIXES.md](./06-RECONCILER-FIXES.md) - Reconciler duplicate prevention strategy
- [07-OCR-INTEGRATION-DESIGN.md](./07-OCR-INTEGRATION-DESIGN.md) - OCR coordinate extraction design
- [08-RECONCILIATION-STRATEGY-V2.md](./08-RECONCILIATION-STRATEGY-V2.md) - Position merging & batching aggregation

### Supporting Documents
- [05-TESTING-STRATEGY.md](./05-TESTING-STRATEGY.md) - Testing approach for Strategy A
- [09-SCRIPT-UPDATES-REQUIRED.md](./09-SCRIPT-UPDATES-REQUIRED.md) - DELETED (merged into V2)