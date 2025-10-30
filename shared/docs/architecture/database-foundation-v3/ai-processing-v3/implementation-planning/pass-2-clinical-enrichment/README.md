# Pass 2 Clinical Enrichment - Implementation Planning

**Purpose:** Extract structured clinical data from Pass 1 detected entities using bridge schemas and hub-and-spoke database architecture.

**Last Updated:** 2025-10-14
**Status:** Planning Phase

---

## Quick Navigation

### Core Documentation
- [PASS-2-OVERVIEW.md](./PASS-2-OVERVIEW.md) - Architectural overview and system design
- [PASS-2-PROMPTS.md](./PASS-2-PROMPTS.md) - AI prompt templates for clinical extraction
- [archive/01-planning.md](./archive/01-planning.md) - Original planning document (2025-09-30)

### Implementation Planning
- [archive/PASS-2-ARCHITECTURE.md](./archive/PASS-2-ARCHITECTURE.md) - Detailed technical architecture (PLACEHOLDER)
- [archive/PASS-2-WORKER-IMPLEMENTATION.md](./archive/PASS-2-WORKER-IMPLEMENTATION.md) - Worker code specification (PLACEHOLDER)

### Testing and Validation
- [pass2-hypothesis-tests-results/](./pass2-hypothesis-tests-results/) - Production validation tests (PLACEHOLDER)
- [pass2-audits/](./pass2-audits/) - Database audits post-implementation (PLACEHOLDER)

### Enhancements
- [pass2-enhancements/](./pass2-enhancements/) - Completed and planned improvements (PLACEHOLDER)

---

## Quick Start Paths

### For Understanding Pass 2 Architecture
1. Read [PASS-2-OVERVIEW.md](./PASS-2-OVERVIEW.md)
2. Review [PASS-2-PROMPTS.md](./PASS-2-PROMPTS.md)
3. Check bridge schemas: `../../bridge-schema-architecture/bridge-schemas/source/pass-2/`

### For Implementation
1. Review [archive/PASS-2-ARCHITECTURE.md](./archive/PASS-2-ARCHITECTURE.md) (when available)
2. Review [archive/PASS-2-WORKER-IMPLEMENTATION.md](./archive/PASS-2-WORKER-IMPLEMENTATION.md) (when available)
3. Check Pass 1.5 medical code resolution system: `../pass-1.5-medical-code-embedding/`

### For Testing
1. Review hypothesis test suite: [pass2-hypothesis-tests-results/](./pass2-hypothesis-tests-results/)
2. Check database validation: [pass2-audits/](./pass2-audits/)

---

## Pass 2 Overview

**Goal:** Convert Pass 1 detected entities into structured clinical data following V3 hub-and-spoke architecture.

**Key Features:**
- Encounter-first extraction (Step 0: healthcare_encounters)
- Hub-and-spoke database writes (patient_clinical_events + spoke tables)
- Medical code assignment via Pass 1.5 vector embedding
- Dynamic bridge schema loading (detailed vs minimal)
- Cost target: $0.003-0.006 per document
- Processing time: 3-5 seconds per document

**Integration Points:**
- Input: Pass 1 entity detection results from entity_processing_audit
- Output: Structured clinical data across 18 Pass 2 tables
- Dependency: Pass 1.5 Medical Code Resolution (vector embeddings for code candidates)

---

## Architecture Highlights

### Three-Tier Bridge Schema System
- **Source (.md):** Human-readable reference (NOT sent to AI)
- **Detailed (.json):** Rich medical context, ~1,500 tokens/schema
- **Minimal (.json):** Condensed format, ~200 tokens/schema
- **Location:** `../../bridge-schema-architecture/bridge-schemas/`

### Hub-and-Spoke Database Architecture (Migration 08)
- **Hub:** `patient_clinical_events` (central event record with O3 classification)
- **Spokes:** 7 clinical detail tables (observations, interventions, vitals, conditions, allergies, medications, immunizations)
- **Enforcement:** Composite foreign keys ensure patient_id consistency

### Encounter-First Processing Flow
```
Step 0: Load manifest from Pass 0.5 → encounter_id (pre-created)
  ↓
For each clinical entity detected by Pass 1:
  Step N.1: Create patient_clinical_events hub (with encounter_id)
  Step N.2: Create spoke record (observations/interventions/vitals)
  Step N.3: Assign medical code via Pass 1.5 (LOINC/SNOMED/RxNorm/PBS)
```

---

## Dependencies

### Completed
- Pass 0.5 Encounter Discovery (operational)
- Pass 1 Entity Detection (operational)
- Bridge Schema System (75 schemas complete)
- Database Schema (Migration 08 applied)

### In Progress
- Pass 1.5 Medical Code Resolution (design phase)

### Pending
- Pass 2 Worker Implementation
- Hypothesis Test Suite
- Database Audits

---

## Key Metrics (Target)

**Cost:** $0.003-0.006 per document (GPT-5-mini)
**Processing Time:** 3-5 seconds per document
**Extraction Completeness:** >95% of clinical entities successfully extracted
**Database Write Success:** >99% successful writes to V3 tables
**Referential Integrity:** 100% (hub-and-spoke FK constraints enforced)
**Code Assignment Rate:** >80% auto-accepted (confidence >= 0.80)

---

## File Organization

```
pass-2-clinical-enrichment/
├── README.md                          # This file (navigation map)
├── PASS-2-OVERVIEW.md                 # Lean architectural overview
├── PASS-2-PROMPTS.md                  # AI prompt templates
│
├── archive/                           # Pre-implementation planning
│   ├── README.md                      # Archive navigation
│   ├── 01-planning.md                 # Original planning document
│   ├── pass2-commencement-draft-planning-file.md  # GPT-5 assessment
│   ├── PASS-2-ARCHITECTURE.md         # Detailed technical architecture (PLACEHOLDER)
│   └── PASS-2-WORKER-IMPLEMENTATION.md # Worker code spec (PLACEHOLDER)
│
├── pass2-hypothesis-tests-results/    # Production validation tests
│   ├── README.md                      # Test suite overview (PLACEHOLDER)
│   └── [test files when created]
│
├── pass2-enhancements/                # Future improvements
│   ├── pass2-enhancements-completed/
│   └── pass2-enhancements-future-planned/
│
└── pass2-audits/                      # Database audits (post-implementation)
    ├── README.md                      # Audit overview (PLACEHOLDER)
    ├── pass2-audit-consolidated-fixes.md (PLACEHOLDER)
    └── pass2-individual-table-audits/ (PLACEHOLDER)
```

---

## Related Documentation

### Bridge Schemas
- `../../bridge-schema-architecture/README.md` - Three-tier system overview
- `../../bridge-schema-architecture/BRIDGE_SCHEMA_BUILD_PROCESS.md` - Assembly line process
- `../../bridge-schema-architecture/bridge-schemas/source/pass-2/` - Pass 2 source schemas

### Database Schema
- `../../../current_schema/03_clinical_core.sql` - Clinical tables
- `../../../current_schema/08_job_coordination.sql` - Job queue and metrics
- `../../../migration_history/2025-09-30_08_enforce_hub_spoke_architecture.sql` - Migration 08

### V3 Pipeline Planning
- `../../v3-pipeline-planning/04-ai-processing-architecture.md` - Three-pass architecture
- `../../v3-pipeline-planning/05-entity-classification-taxonomy.md` - Entity categories
- `../../v3-pipeline-planning/06-schema-driven-processing.md` - Schema loading logic

### Pass 1 Reference
- `../pass-1-entity-detection/` - Reference implementation structure

---

## Usage Notes

**For AI Models:** Start with PASS-2-OVERVIEW.md for architectural context, then review PASS-2-PROMPTS.md for prompt templates. Refer to bridge schema documentation for schema structure details.

**For Developers:** Review architectural overview, check dependencies (Pass 1.5 must be complete), then proceed to worker implementation planning.

---

**Last Updated:** 2025-10-14
**Maintained By:** Exora Health Development Team
