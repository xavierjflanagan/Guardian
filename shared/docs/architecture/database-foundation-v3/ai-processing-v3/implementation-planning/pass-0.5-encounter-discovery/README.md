# Pass 0.5 Encounter Discovery - Documentation Map

**Last Updated:** October 30, 2025
**Status:** ✅ OPERATIONAL
**Source Code:** `apps/render-worker/src/pass05/` (~600 lines TypeScript, 5 files)

---

## Purpose of This Folder

This folder contains documentation for **Pass 0.5 Encounter Discovery**, the first stage of Exora's five-pass AI processing pipeline that discovers healthcare encounters and creates manifests for downstream consumption.

**This folder provides:**
- Architectural overview for understanding Pass 0.5 in context
- Implementation plan and technical details
- Testing and validation results
- Audit findings and improvements

---

## Folder Structure

### Core Documentation

#### PASS-0.5-OVERVIEW.md (Start Here)
Concise architectural overview of Pass 0.5 encounter discovery system.

**When to read:** Need to understand what Pass 0.5 does, how it works, or load context for AI assistants

**What it contains:**
- What is Pass 0.5 and its role in the 5-pass pipeline
- Encounter types (real-world, planned, pseudo)
- Processing flow (OCR → AI discovery → manifest build → atomic database writes)
- Shell file manifest structure (JSONB)
- Integration points (how Pass 1/2 consume manifests)
- Production metrics and performance

---

#### IMPLEMENTATION_PLAN.md
Complete technical implementation plan with database schema, worker code design, and phase planning.

**When to read:** Need deep technical details about implementation decisions

**What it contains:**
- Phase 1 MVP design (encounter discovery only, <18 pages)
- Phase 2 planning (batching for large files)
- Database schema (healthcare_encounters, shell_file_manifests, metrics)
- Worker architecture (5 TypeScript files)
- Timeline Test prompt methodology
- Code references and file locations

---

### Testing and Validation

#### pass05-hypothesis-tests-results/
Production validation tests for Pass 0.5 system.

**When to read:** Need to see test results, validation queries, or cost data

**What it contains:**
- Test plans with hypothesis and expected outcomes
- Validation queries for database integrity
- Cost reports and performance metrics
- Success/failure criteria and results

**Status:** Test suite created, first test pending execution

---

### Audit & Improvement Tracking

#### pass05-audits/
Database audits identifying optimization opportunities post-implementation.

**When to read:** Need to see what database improvements have been made

**What it contains:**
- Column-by-column audit findings
- Performance optimization recommendations
- Data quality improvements

**Status:** Placeholder for post-testing audits

---

### Historical Archive

#### archive/
Pointers to original implementation planning documents.

**What it contains:**
- Link to V3_Features_and_Concepts/shell-file-batching-and-encounter-discovery/ (original planning location)
- Historical issue analysis and worker fixes

---

## Quick Start Paths

### Path 1: Understand Pass 0.5 Quickly
**Goal:** Load context about Pass 0.5 architecture

1. Read [PASS-0.5-OVERVIEW.md](./PASS-0.5-OVERVIEW.md)
2. Browse key files in `apps/render-worker/src/pass05/`:
   - `index.ts` - Main entry point
   - `encounterDiscovery.ts` - AI call
   - `manifestBuilder.ts` - Validation and enrichment

---

### Path 2: Implement Integration with Pass 1/2
**Goal:** Understand how to load and consume manifests

1. Read [PASS-0.5-OVERVIEW.md](./PASS-0.5-OVERVIEW.md) Integration Points section
2. Review manifest structure and encounter metadata
3. Use sample query to load manifest in your worker code

---

### Path 3: Run Tests
**Goal:** Validate Pass 0.5 functionality

1. Review [pass05-hypothesis-tests-results/README.md](./pass05-hypothesis-tests-results/README.md)
2. Execute test plans
3. Run validation queries
4. Document results

---

### Path 4: Deep Dive into Implementation
**Goal:** Understand technical details

1. Read [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
2. Review database schema in `current_schema/08_job_coordination.sql`
3. Examine worker code in `apps/render-worker/src/pass05/`

---

## Integration with 5-Pass AI Pipeline

### Pass 0.5: Encounter Discovery (Operational - This Folder)
- **Purpose:** Discover healthcare encounters, create manifest
- **Output:** shell_file_manifest + pre-created healthcare_encounters records
- **Status:** ✅ Operational since October 2025

### Pass 1: Entity Detection (Operational)
- **Purpose:** Detect and classify entities
- **Input:** Manifest from Pass 0.5 (encounter context)
- **Status:** ✅ Operational
- **Location:** `../pass-1-entity-detection/`

### Pass 1.5: Medical Code Resolution (In Design)
- **Purpose:** Vector embedding code candidates
- **Status:** Design phase

### Pass 2: Clinical Extraction (Designed)
- **Purpose:** Extract structured clinical data
- **Input:** Entities from Pass 1 + manifest from Pass 0.5
- **Status:** Schema complete

### Pass 3: Narrative Generation (Planned)
- **Purpose:** Generate patient summaries
- **Status:** Planning phase

---

## Key Metrics (Production Target)

**Cost:** ~$0.01-0.03 per document (GPT-4o Vision)
**Processing Time:** 3-6 seconds total (AI + database)
**Phase 1 Limitation:** Files ≥18 pages not supported (batching pending)
**Quality:** 90-95% confidence on encounter detection

---

## Related Documentation

**V3 Architecture:**
- [V3 Architecture Master Guide](../../../V3_ARCHITECTURE_MASTER_GUIDE.md)
- [Migration History](../../../migration_history/)
- [Current Schema](../../../current_schema/08_job_coordination.sql)

**Pass 1 Reference:**
- [Pass 1 Entity Detection](../pass-1-entity-detection/)

**Original Planning Location:**
- [V3 Features and Concepts](../../../V3_Features_and_Concepts/shell-file-batching-and-encounter-discovery/)

---

**Last Updated:** October 30, 2025
**Maintained By:** Exora Health Development Team
