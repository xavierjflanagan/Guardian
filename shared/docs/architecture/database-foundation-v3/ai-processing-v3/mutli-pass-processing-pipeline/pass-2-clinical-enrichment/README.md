# Pass 2 Clinical Enrichment

**Purpose:** Extract structured clinical data from Pass 1 detected entities, assign medical codes, and populate V3 hub-and-spoke database architecture.

**Status:** Strategy A in active design (December 2025)
**Owner:** Xavier

---

## Folder Structure

```
pass-2-clinical-enrichment/
├── README.md                     # This file
├── strategy-a/                   # Current implementation approach (Dec 2025)
├── bridge-schema-architecture/   # Bridge schema system for Pass 2
└── archive-pre-strategy-a/       # Previous planning docs (Oct 2025)
```

---

## Quick Navigation

### Strategy A (Current - December 2025)
The active implementation approach. Start here.

| Document | Purpose |
|----------|---------|
| [00-STRATEGY-A-DESIGN-NOTES.md](./strategy-a/00-STRATEGY-A-DESIGN-NOTES.md) | Original thinking and design decisions |
| [01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md](./strategy-a/01-MEDICAL-CODE-ASSIGNMENT-ARCHITECTURE.md) | Pass 2.5 Agentic Waterfall for medical codes |
| [02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md](./strategy-a/02-BRIDGE-SCHEMA-ZONE-ARCHITECTURE.md) | Zone hierarchy and context management |
| [03-FINE-TUNED-EXORA-MODEL-VISION.md](./strategy-a/03-FINE-TUNED-EXORA-MODEL-VISION.md) | Future fine-tuned model at 100k records |

### Bridge Schema Architecture
The schema system that guides Pass 2 AI extraction.

| Document | Purpose |
|----------|---------|
| [bridge-schema-architecture/README.md](./bridge-schema-architecture/README.md) | Three-tier schema system overview |
| [bridge-schema-architecture/bridge-schemas/](./bridge-schema-architecture/bridge-schemas/) | Source, detailed, and minimal schemas |

### Archive (Pre-Strategy A)
Historical planning from October 2025. Reference only.

| Document | Purpose |
|----------|---------|
| [archive-pre-strategy-a/PASS-2-OVERVIEW.md](./archive-pre-strategy-a/PASS-2-OVERVIEW.md) | Original architectural overview |
| [archive-pre-strategy-a/PASS-2-PROMPTS.md](./archive-pre-strategy-a/PASS-2-PROMPTS.md) | Original AI prompt templates |

---

## Pass 2 Pipeline Overview

```
Pass 1 Output                    Pass 2                           Pass 2.5
(entities)                       (enrichment)                     (medical codes)
     |                                |                                |
     v                                v                                v
entity_processing_audit  -->  AI extracts structured    -->  Agentic Waterfall
with schema_types_needed      clinical data per              assigns codes via
                              bridge schema zone             3-tier priority
```

### Key Concepts

1. **Encounter-First Processing**: All clinical events reference healthcare_encounters from Pass 0.5
2. **Bridge Schema Zones**: Minimize context per API call (Level 1-3 hierarchy)
3. **Hub-and-Spoke Database**: patient_clinical_events hub + 7 spoke tables
4. **Agentic Waterfall**: Post-Pass 2 medical code assignment (Primary/Secondary/Tertiary)

---

## Current State (December 2025)

| Component | Status |
|-----------|--------|
| Pass 2 Architecture | Designed |
| Bridge Schemas | Complete (75 schemas) |
| Zone Hierarchy | Level 1-2 active, Level 3 disabled |
| Medical Code Assignment | Designed (Pass 2.5 Agentic Waterfall) |
| Worker Implementation | Not started |

---

## Related Documentation

- **Pass 1**: `../pass-1-entity-detection/` (operational, reference implementation)
- **Database Schema**: `../../../current_schema/03_clinical_core.sql`
- **V3 Master Guide**: `../../../V3_ARCHITECTURE_MASTER_GUIDE.md`

---

**Last Updated:** 2025-12-02
