# Pass 1 Strategy-A Documentation

**Created:** 2025-11-27
**Status:** Active Development
**Purpose:** Transform Pass 1 to align with Pass 0.5 architecture (OCR-only, encounter-aware)

---

## What is Strategy-A?

Pass 1 was built in October 2025, BEFORE Pass 0.5 (Encounter Discovery) existed. Strategy-A is a comprehensive redesign of Pass 1 to:

1. **Remove raw image dependency** - Use OCR-only input (like Pass 0.5)
2. **Integrate with Pass 0.5** - Consume encounter context and page mappings
3. **Support parallel processing** - Multi-encounter + safe split point batching
4. **Maintain three-tier classification** - Clinical events, healthcare context, document structure
5. **Enable click-through-to-source** - Preserve data linkage for bbox attribution

---

## Document Index

### 01-PASS-1-STRATEGY-A-AUDIT.md
**Purpose:** Comprehensive audit of existing Pass 1 system

**Contents:**
- All 8 Pass 1 TypeScript files analyzed
- worker.ts orchestration analyzed
- All 7 database tables audited (columns, relationships)
- Data flow analysis (Pass 0.5 outputs vs Pass 1 inputs)
- Gap analysis (what's missing for Strategy-A)
- OCR vs raw image usage documentation

**Status:** In Progress

---

### 02-PASS-1-STRATEGY-A-IMPLEMENTATION-PLAN.md (Future)
**Purpose:** Architecture specification and implementation roadmap

**Will contain:**
- Strategy-A architecture design
- New module structure
- Database schema changes required
- Implementation phases
- Task breakdown

**Status:** Not Started (depends on audit completion)

---

## Key Context

### Why Strategy-A?

From Xavier's analysis (Nov 24, 2025):

> "Pass 0.5 uses an OCR spatial mapped text output as the input for the AI model. There is no raw image interpretation by the AI model in Pass 0.5. Whereas Pass 1 analyzes both OCR text and the raw image together... I want to see whether we can transform Pass 1 into something similar to what we've done with Pass 0.5, which is an OCR-only reliant system."

### Core Decisions Made

1. **OCR-only approach** - Remove raw image from AI prompts (with fallback option)
2. **Fresh start** - Build in strategy-a subfolder, cherry-pick from existing code
3. **Keep three-tier system** - Clinical events, healthcare context, document structure
4. **Encounter context to Pass 1** - Not just Pass 2 (improves entity classification)
5. **Parallel processing** - Multi-encounter + safe split point batching

### Related Documents

- **Pass 0.5 Strategy-A:** `pass-0.5-encounter-discovery/strategy-a-docs/`
- **Pass 1-2 Roadmap:** `PASS-1-2-IMPLEMENTATION-ROADMAP.md`
- **Pass 1 Overview (historical):** `PASS-1-OVERVIEW.md`
- **Original Pass 1 archive:** `archive/` and `archive-pre-strategy-a/`

---

## Navigation

| Document | Purpose | Status |
|----------|---------|--------|
| This file | Navigation and context | Active |
| `01-PASS-1-STRATEGY-A-AUDIT.md` | Comprehensive system audit | In Progress |
| `02-PASS-1-STRATEGY-A-IMPLEMENTATION-PLAN.md` | Architecture and roadmap | Not Started |

---

**Last Updated:** 2025-11-27
