# Pass 2 Strategy A - December 2025

**Status:** Active Design
**Owner:** Xavier
**Created:** 2025-12-02
**Last Updated:** 2025-12-03

---

## Overview

Strategy A is the current implementation approach for Pass 2 Clinical Enrichment. Key principles:

1. **Pass 2 as Primary Extractor** - Pass 2 discovers AND enriches entities (no handoff from Pass 1)
2. **Pass 1 as Schema Router** - Pass 1 identifies which bridge schemas are needed per batch
3. **Direct to Hub-and-Spoke** - Pass 2 writes directly to database (no intermediate tables)
4. **Post-Pass 2 Medical Codes** - Pass 2.5 assigns codes via Agentic Waterfall
5. **Token Optimization** - AI outputs only clinical content; server adds IDs/context

---

## Documents

### Master File

| Document | Purpose |
|----------|---------|
| [PASS2-STRATEGY-A-MASTER.md](./PASS2-STRATEGY-A-MASTER.md) | Dashboard, phases, progress tracking |

### Design Documents

| # | Document | Purpose |
|---|----------|---------|
| 00 | [00-STRATEGY-A-DESIGN-NOTES.md](./00-STRATEGY-A-DESIGN-NOTES.md) | Original thinking and design decisions |
| 01 | [01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md](./01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md) | Pass 2.5 Agentic Waterfall - 3-tier medical code assignment |
| 02 | [02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md](./02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md) | Zone hierarchy, context limits, cut-out problem |
| 03 | [03-FINE-TUNED-EXORA-MODEL-VISION.md](./03-FINE-TUNED-EXORA-MODEL-VISION.md) | Future: custom fine-tuned model at 100k records |

### Architecture Documents (Foundational)

| # | Document | Purpose |
|---|----------|---------|
| 04 | [04-HUB-AND-SPOKE-DATABASE-PATTERN.md](./04-HUB-AND-SPOKE-DATABASE-PATTERN.md) | Database architecture - hub + 7 spoke tables |
| 05 | [05-PASS2-AS-PRIMARY-EXTRACTOR.md](./05-PASS2-AS-PRIMARY-EXTRACTOR.md) | Pass 2's role as discovery + enrichment engine |
| 06 | [06-AI-OUTPUT-TOKEN-OPTIMIZATION.md](./06-AI-OUTPUT-TOKEN-OPTIMIZATION.md) | Minimizing AI output tokens |

---

## Key Architectural Decisions

### Pass 1 = Schema Router (not Entity Detector)

Pass 1 no longer outputs individual entities. It outputs:
- `schema_types_needed[]` - Which bridge schemas Pass 2 needs
- (Future) `bridge_schema_zones[]` - Y-coordinate zones for finer parallelism

### Pass 2 = Discovery + Enrichment

Pass 2 discovers all clinical entities and extracts enrichment data in one step:
- Receives: OCR batch + bridge schemas + encounter context
- Outputs: Structured clinical data (spoke fields + Y-anchor)
- Writes: Directly to `patient_clinical_events` (hub) + spoke tables

### Hub-and-Spoke Database Pattern

Every clinical entity creates:
1. Hub record (`patient_clinical_events`) - core entity with encounter link
2. Spoke record(s) - type-specific details (medications, conditions, vitals, etc.)

### Token Optimization

AI outputs only what it uniquely knows:
- Clinical content (medication name, dosage, condition, etc.)
- Y-anchor coordinate
- Confidence score

Server adds everything else (IDs, encounter_id, patient_id, timestamps).

---

## Reading Order

**For understanding the architecture:**
1. [PASS2-STRATEGY-A-MASTER.md](./PASS2-STRATEGY-A-MASTER.md) - Overview and current status
2. [05-PASS2-AS-PRIMARY-EXTRACTOR.md](./05-PASS2-AS-PRIMARY-EXTRACTOR.md) - Pass 2's role
3. [04-HUB-AND-SPOKE-DATABASE-PATTERN.md](./04-HUB-AND-SPOKE-DATABASE-PATTERN.md) - Database pattern
4. [06-AI-OUTPUT-TOKEN-OPTIMIZATION.md](./06-AI-OUTPUT-TOKEN-OPTIMIZATION.md) - Output design

**For specific features:**
- Medical codes: [01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md](./01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md)
- Zone optimization: [02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md](./02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md)
- Original thinking: [00-STRATEGY-A-DESIGN-NOTES.md](./00-STRATEGY-A-DESIGN-NOTES.md)

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Architecture docs | Complete | This folder |
| Phase 1: Table triage | In Progress | See MASTER file |
| Database schema | Needs review | Phase 1 will determine changes |
| Worker code | Not started | `apps/render-worker/src/pass2/` |
| Prompt engineering | Not started | After bridge schema reconstruction |

---

**Last Updated:** 2025-12-03
