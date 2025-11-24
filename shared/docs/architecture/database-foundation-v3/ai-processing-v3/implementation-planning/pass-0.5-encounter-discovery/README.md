# Pass 0.5 Encounter Discovery

**Last Updated:** 2025-11-24
**Status:** ✅ PRODUCTION-READY (Strategy A)
**Source Code:** `apps/render-worker/src/pass05/` (~2000 lines TypeScript across multiple files)

---

## Start Here

**👉 For current documentation:** See [`strategy-a-docs/00-START-HERE.md`](./strategy-a-docs/00-START-HERE.md)

**For historical context:** Keep reading below

---

## What is Pass 0.5?

Pass 0.5 is the **first stage** of Exora's five-pass AI processing pipeline. It discovers healthcare encounters within uploaded medical documents and creates structured manifests for downstream processing by Pass 1 (Entity Detection) and Pass 2 (Clinical Extraction).

**Core Capabilities:**
- Handles documents of any size (tested up to 219 pages, no theoretical limit)
- Discovers real-world encounters (hospital visits, procedures) and pseudo encounters (lab reports, letters)
- Creates cascade chains for encounters spanning multiple document pages/chunks
- Reconciles multi-chunk encounters into single final healthcare_encounter records
- Provides complete audit trail and confidence scoring

---

## The Iterative Journey to Strategy A

Pass 0.5 went through **three major iterations** over 4-5 weeks before reaching production-ready state. This section explains the evolution and why each pivot was necessary.

### Iteration 1: Initial Approach (Weeks 1-2)

**Goal:** Basic encounter discovery for simple medical documents

**Design:**
- Single-pass processing (no chunking)
- AI analyzes entire document at once
- Creates final `healthcare_encounters` records directly
- Simple, straightforward architecture

**Limitations:**
- **File size:** Only worked for documents <18 pages
- **Why:** GPT-4o Vision context window limits, processing time, cost
- **Result:** Worked great for discharge summaries and single-page letters, failed for complex hospital admissions

**Outcome:** ✅ Proved concept, ❌ couldn't handle real-world complexity

**Documentation:** See `archive-pre-strategy-a/IMPLEMENTATION_PLAN.md` and `PASS-0.5-OVERVIEW.md`

---

### Iteration 2: Progressive Refinement (Week 3)

**Trigger:** User uploaded 142-page hospital admission document → system crashed

**Realization:** Need chunking/batching for large documents

**Design Pivot:**
- **Progressive chunking:** Split large documents into 50-page chunks
- **Handoff packages:** Pass context between chunks for cascading encounters
- **Challenge:** How to reconcile encounters that span chunk boundaries?

**Implementation:**
- Created `pass05_progressive_sessions` table
- Added `pass05_chunk_results` tracking
- Implemented handoff context passing between chunks
- Attempted reconciliation DURING chunk processing

**Problems Encountered:**
- Reconciliation logic too complex when interleaved with processing
- Cascade detection inconsistent (AI sometimes said "cascading", sometimes didn't)
- Multi-chunk encounters created duplicate final records
- Audit trail gaps (timestamps missing, metrics incomplete)

**Outcome:** ✅ Chunking worked, ❌ reconciliation approach too fragile

**Documentation:** See `archive-pre-strategy-a/progressive-refinement/` folder

---

### Iteration 3: Strategy A Design (Weeks 4-5)

**Trigger:** Progressive Refinement reconciliation failures, complexity spiraling

**Key Insight:** "Don't try to reconcile DURING processing - do it AFTER all chunks complete"

**Design Pivot:**
- **Pending-to-final workflow:** All chunks create `pass05_pending_encounters`, reconciliation happens at the end
- **Cascade chains:** Smart cascade_id assignment based on boundary detection (not just AI flag)
- **Atomic reconciliation:** Single RPC function (`reconcile_pending_to_final`) groups pendings by cascade_id
- **Complete audit:** Every timestamp, every metric, every tracking field populated

**Architecture:**
```
Document Upload
  ↓
Progressive Session Created (determines chunk count)
  ↓
FOR EACH CHUNK:
  - Process 50 pages
  - Create pass05_pending_encounters (NOT final encounters)
  - Assign cascade_ids if encounter reaches chunk boundary
  - Pass handoff context to next chunk
  ↓
AFTER ALL CHUNKS COMPLETE:
  - Reconcile all pendings grouped by cascade_id
  - Merge dates, positions, confidence scores
  - Create single healthcare_encounter per cascade chain
  - Populate complete metrics and audit trail
  ↓
Session Complete
```

**Tables (Strategy A):**
- `pass05_progressive_sessions` - Session tracking
- `pass05_chunk_results` - Per-chunk metrics
- `pass05_pending_encounters` - Temporary encounter records
- `pass05_cascade_chains` - Cascade linkage tracking
- `pass05_page_assignments` - Page→encounter mapping
- `healthcare_encounters` - Final reconciled encounters
- `pass05_encounter_metrics` - Comprehensive metrics
- Plus: reconciliation logs, identifiers, coordinates

**Hardening (Rabbit Hunt & Technical Debt):**
After initial Strategy A implementation, systematic verification found 26 issues:
- 22 fixed via Migrations 58-66
- 4 remaining (extracted to OPEN-ISSUES-AND-FUTURE-WORK.md)

**Production Status:** ✅ **FULLY OPERATIONAL**
- 142-page documents: ✅ Tested and working
- 219-page documents: ✅ Tested and working
- Single-page images: ✅ Working (Migration 66)
- DD/MM/YYYY dates: ✅ Working (Migration 63-65)
- Cascade reconciliation: ✅ Verified correct
- Audit trails: ✅ Complete

**Documentation:** See `strategy-a-docs/` folder (current/active)

---

## Current Folder Structure

```
pass-0.5-encounter-discovery/
├── README.md (this file)
│
├── strategy-a-docs/  ← PRIMARY DOCUMENTATION (start here!)
│   ├── 00-START-HERE.md (navigation guide)
│   ├── 01-SYSTEM-OVERVIEW.md
│   ├── 02-SCRIPT-ANALYSIS-V3.md
│   ├── 03-TABLE-DESIGN-V3.md
│   ├── 04-PROMPT-V11-SPEC.md
│   ├── 05-CASCADE-IMPLEMENTATION.md
│   ├── 06-BATCHING-TASK-DESIGN-V2.md
│   ├── 07-OCR-INTEGRATION-DESIGN-v2.md
│   ├── 08-RECONCILIATION-STRATEGY-V2.md
│   ├── 10-17... (additional design docs)
│   ├── OPEN-ISSUES-AND-FUTURE-WORK.md (active issue tracking)
│   └── archive-strategy-a/ (completed rabbit hunt, tech debt)
│
└── archive-pre-strategy-a/  ← HISTORICAL REFERENCE
    ├── README.md (explains pre-Strategy A journey)
    ├── progressive-refinement/ (Week 3 iteration)
    ├── pass05-hypothesis-tests-results/ (v2.7-v2.11 tests)
    ├── pass05-audits/ (early table audits)
    ├── ai-model-switching/ (deferred to post-launch)
    └── [original planning docs]
```

---

## Why the Reorganization? (2025-11-24)

After 4-5 weeks of iteration, we had nested folders 3 levels deep:
```
pass-0.5-encounter-discovery/
  progressive-refinement/
    strategy-a-design/  ← Only folder we cared about
```

**Problem:** Current docs buried, navigation confusing

**Solution:**
1. Promote `strategy-a-design/` → `strategy-a-docs/` to top level
2. Archive everything from Iterations 1-2 to `archive-pre-strategy-a/`
3. Close out completed work (Rabbit Hunt, Technical Debt)
4. Create clear navigation guides

**Benefit:** New developers see current state immediately, can explore history if needed

---

## Quick Start

### I'm new to Pass 0.5
→ Read [`strategy-a-docs/00-START-HERE.md`](./strategy-a-docs/00-START-HERE.md)
→ Then [`strategy-a-docs/01-SYSTEM-OVERVIEW.md`](./strategy-a-docs/01-SYSTEM-OVERVIEW.md)

### I need to fix a bug
→ Check [`strategy-a-docs/OPEN-ISSUES-AND-FUTURE-WORK.md`](./strategy-a-docs/OPEN-ISSUES-AND-FUTURE-WORK.md)
→ Review issue priority and status

### I'm planning Pass 2 development
→ Review open issues (especially ISSUE-002: medical identifiers pipeline)
→ Read [`strategy-a-docs/06-BATCHING-TASK-DESIGN-V2.md`](./strategy-a-docs/06-BATCHING-TASK-DESIGN-V2.md) for batching strategy
→ Understand page separation analysis for safe split points

### I want to understand the evolution
→ Read [`archive-pre-strategy-a/README.md`](./archive-pre-strategy-a/README.md)
→ Review progressive-refinement test results (especially TEST_04_142_pages)

---

## Integration with 5-Pass Pipeline

### Pass 0.5: Encounter Discovery ✅ OPERATIONAL
- **Purpose:** Discover healthcare encounters, create manifest
- **Output:** `healthcare_encounters` records + metadata
- **Status:** Production-ready (Strategy A)

### Pass 1: Entity Detection ✅ OPERATIONAL
- **Purpose:** Detect and classify medical entities
- **Input:** Encounter context from Pass 0.5
- **Status:** Operational since October 2025

### Pass 2: Clinical Extraction (Designed, Not Built)
- **Purpose:** Extract structured clinical data
- **Input:** Entities from Pass 1 + encounters from Pass 0.5
- **Status:** Schema complete, implementation pending

### Pass 3: Narrative Generation (Planned)
- **Purpose:** Generate patient summaries
- **Status:** Design phase

---

## Key Learnings from the Journey

1. **Iterate Based on Real Data:** The 142-page document exposed fundamental design flaws that testing with small files never revealed

2. **Simpler is Better:** Pending-to-final workflow is cleaner than trying to reconcile during processing

3. **Cascade Detection:** Don't rely solely on AI flags - use position/boundary logic to definitively detect cascades

4. **Audit Everything:** Timestamps, metrics, and tracking fields seem optional but are critical for debugging

5. **Test at Scale:** System that works for 3-page file may completely fail for 142-page file - test large documents early

6. **Systematic Verification:** Rabbit Hunt approach (systematic schema vs code verification) found 26 issues that would have caused production failures

---

## Production Metrics

**Cost:** ~$0.03-0.08 per document (varies by page count, GPT-4o Vision pricing)
**Processing Time:** 5-15 seconds per 50-page chunk + reconciliation overhead
**File Size:** No theoretical limit (tested up to 219 pages, 50 pages per chunk)
**Quality:** 90-95% confidence on encounter detection and classification

---

## Related Documentation

**Database Schema:** `shared/docs/architecture/database-foundation-v3/current_schema/`
- `04_ai_processing.sql` - Pass 0.5 tables
- `08_job_coordination.sql` - Progressive session tables, RPCs, metrics

**Migration History:** `shared/docs/architecture/database-foundation-v3/migration_history/`
- Migrations 58-66: Strategy A hardening (audit trails, fixes, constraints)

**V3 Architecture:** `shared/docs/architecture/database-foundation-v3/V3_ARCHITECTURE_MASTER_GUIDE.md`

---

**Last Updated:** 2025-11-24
**Reorganized:** 2025-11-24 (promoted Strategy A to top level, archived Iterations 1-2)
**Maintained By:** Exora Health Development Team
