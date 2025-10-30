# Pass 1 Entity Detection - Documentation Map

**Last Updated:** October 13, 2025
**Status:** ✅ OPERATIONAL
**Source Code:** `apps/render-worker/src/pass1/` (3,116 lines TypeScript, 8 files)

---

## Purpose of This Folder

This folder contains documentation for **Pass 1 Entity Detection**, the first stage of Exora's three-pass AI processing pipeline for medical documents.

**This folder provides:**
- **A)** Architectural overview for understanding Pass 1 in context of the 3-pass system
- **B)** Historical tracking of changes, improvements, and iterative development
- **C)** Current TODO items, audit findings, and remaining work

---

## Folder Structure

### Current Documentation

#### PASS-1-OVERVIEW.md (Start Here)
Concise architectural overview of Pass 1 entity detection system.

**When to read:** Need to understand what Pass 1 does, how it works, or load context for AI assistants

**What it contains:**
- What is Pass 1 and its role in the 3-pass pipeline
- Three-Category Classification System (clinical/context/structure)
- Processing flow (input → AI detection → translation → 7-table writes)
- Production metrics (costs, performance, quality)
- Key implementation files with links to actual code
- Recent improvements (October 2025 enhancements)
- Current TODO items

**Key principle:** Links to production code, doesn't duplicate it. Code is source of truth.

---

### Audit & Improvement Tracking

#### pass1-audits/
Column-by-column database audits identifying issues and optimization opportunities.

**When to read:** Need to see what database improvements have been made or what remains to be done

**What it contains:**
- [README.md](./pass1-audits/README.md) - Quick summary, critical work remaining
- [pass1-audit-consolidated-fixes.md](./pass1-audits/pass1-audit-consolidated-fixes.md) - Master implementation plan with status tracking
- `pass1-individual-table-audits/` - Deep-dive analysis of each database table

**Status:** 6 of 8 tables complete, 2 critical tasks deferred until after Pass 2

---

#### pass1-enhancements/
Worker and system enhancements (completed and future planned).

**When to read:** Need to see what improvements have been deployed or are planned for future implementation.

**What it contains:**
- **`pass1-enhancements-completed/`** (9 documents):
  - `pass1-worker-data-quality-enhancements.md` - 5 production improvements (October 2025)
  - `pass1-TOKEN-BREAKDOWN-MIGRATION.md` - Token breakdown for cost accuracy
  - `pass1-architectural-improvements.md` - Core architecture enhancements
  - `pass1-cost-calculation-half-fix.md` - Cost calculation improvements
  - `pass1-image-downscaling-implementation.md` - Image optimization for OCR
  - `pass1-ocr-transition-to-worker-implementation.md` - OCR moved from Edge Function
  - `pass1-prompt-optimization-implementation.md` - AI prompt improvements
  - `pass1-retry-logic-implementation.md` - Network resilience
  - `pass1-structured-logging-implementation.md` - Production logging
- **`pass1-enhancements-future-planned/`** (4 planning documents):
  - `file-format-optimization-roadmap-plan.md` - Future format support
  - `pass1-performance-optimization-roadmap.plan.md` - Performance improvements
  - `pass1_ocr_only_preparation_plan.md` - OCR-only processing mode
  - `pass1_token_output_optimization.plan.md` - Token usage optimization

**Status:** 9 completed enhancements documented, 4 future enhancements planned

---

#### pass1-hypothesis-tests-results/
Production validation tests, cost reports, and migration verifications.

**When to read:** Need to see actual test results, cost data, or migration validation

**What it contains:**
- [test-11-worker-data-quality-enhancements.md](./pass1-hypothesis-tests-results/test-11-worker-data-quality-enhancements.md) - 5 production improvements validated (October 2025)
- [test-10-migration-22-23-database-schema-validation.md](./pass1-hypothesis-tests-results/test-10-migration-22-23-database-schema-validation.md) - Migration 22 & 23 production validation
- [openai-usage-and-cost-report-2025-10-12.md](./pass1-hypothesis-tests-results/openai-usage-and-cost-report-2025-10-12.md) - Actual OpenAI usage and cost data
- test-05 through test-09: Historical production validation baselines

**Status:** 11 hypothesis tests completed, system validated in production

---

### Historical Archive

#### archive/
Pre-implementation planning documents (October 3, 2025) and code reviews.

**When to read:** Need to understand the original design decisions or see historical context

**What it contains:**
- [PASS-1-ARCHITECTURE.md](./archive/PASS-1-ARCHITECTURE.md) - Original architectural planning (outdated costs/metrics)
- [PASS-1-BRIDGE-SCHEMA-AND-PROMPTS.md](./archive/PASS-1-BRIDGE-SCHEMA-AND-PROMPTS.md) - Original prompt specifications (duplicates production code)
- [PASS-1-WORKER-IMPLEMENTATION.md](./archive/PASS-1-WORKER-IMPLEMENTATION.md) - Original implementation guide (duplicates production code)
- [CLAUDE-CODE-REVIEW-RESPONSE-2025-10-03.md](./archive/CLAUDE-CODE-REVIEW-RESPONSE-2025-10-03.md) - Independent verification of GPT-5 code review findings
- [PASS-1-CODE-REVIEW-2025-10-03.md](./archive/PASS-1-CODE-REVIEW-2025-10-03.md) - Original GPT-5 code review (11 critical issues, all resolved)
- [PASS1-OPTIMIZATION-RECOMMENDATIONS.md](./archive/PASS1-OPTIMIZATION-RECOMMENDATIONS.md) - Pre-implementation optimization analysis (led to Migrations 16-17)
- [flag-extraction-non-issue.md](./archive/flag-extraction-non-issue.md) - Investigation showing flag extraction was already working (false positive)

**Note:** These documents served their purpose during planning/implementation but are now superseded by production code. Archived October 13, 2025 for historical reference.

---

## Quick Start Paths

### Path 1: Understand Pass 1 Quickly
**Goal:** Load context about Pass 1 architecture and implementation

1. Read [PASS-1-OVERVIEW.md](./PASS-1-OVERVIEW.md) - Architectural overview with code links
2. Browse key files in `apps/render-worker/src/pass1/`:
   - `Pass1EntityDetector.ts` - Main detection class
   - `pass1-prompts.ts` - AI prompt templates
   - `pass1-types.ts` - TypeScript interfaces

---

### Path 2: See What Needs to Be Done
**Goal:** Understand current TODO items and remaining work

1. Read [pass1-audits/README.md](./pass1-audits/README.md) - Quick summary
2. Review critical work remaining:
   - Profile classification implementation (deferred)
   - ai_confidence_scoring rewrite (deferred)

---

### Path 3: See Implementation History
**Goal:** Understand how Pass 1 evolved from planning to production

1. Browse [archive/](./archive/) folder - Pre-implementation planning docs
2. Read [archive/CLAUDE-CODE-REVIEW-RESPONSE-2025-10-03.md](./archive/CLAUDE-CODE-REVIEW-RESPONSE-2025-10-03.md) - Verification of 11 critical issues
3. Review [pass1-enhancements/](./pass1-enhancements/) - 9 completed enhancements + 4 future plans
4. Check [pass1-hypothesis-tests-results/](./pass1-hypothesis-tests-results/) - Validation test results (test-05 through test-11)

---

### Path 4: Deep Dive into Production Code
**Goal:** Understand implementation details

**TypeScript Source (Production Code):**
```
apps/render-worker/src/pass1/
├── Pass1EntityDetector.ts       (24,665 bytes) - Main detection class
├── pass1-types.ts               (14,746 bytes) - TypeScript interfaces
├── pass1-prompts.ts             (12,618 bytes) - AI prompt templates (sent to GPT-5 Mini)
├── pass1-schema-mapping.ts      (9,982 bytes)  - Entity → schema mappings
├── pass1-translation.ts         (17,532 bytes) - AI → database translation
├── pass1-database-builder.ts    (15,393 bytes) - 7-table record builder
├── index.ts                     (1,659 bytes)  - Public exports (clean module interface)
└── __tests__/                                  - Unit tests

apps/render-worker/src/
└── worker.ts                    (1,047 lines)  - Job coordination (claims jobs, runs OCR, calls Pass 1, writes to database)

Total: 3,116 lines TypeScript (Pass 1 files)
```

**Key distinction:**
- **Files sent to AI:** `pass1-prompts.ts` (system message + classification prompt)
- **AI response structure:** `pass1-types.ts` (AI must match this JSON format)
- **Worker infrastructure:** `worker.ts` orchestrates pipeline, `index.ts` exports clean API

**Time:** Variable (depends on depth of investigation)

---

## Integration with 5-Pass AI Pipeline

### Pass 0.5: Encounter Discovery (Operational)
- **Purpose:** Discover healthcare encounters, create manifest
- **Output:** shell_file_manifest with pre-created healthcare_encounters
- **Status:** ✅ Operational since October 2025

### Pass 1: Entity Detection (Operational - This Folder)
- **Purpose:** Identify and classify every piece of information
- **Input:** Manifest from Pass 0.5 (encounter context)
- **Output:** Detected entities with categories, confidence scores
- **Status:** ✅ Operational since October 2025

### Pass 1.5: Medical Code Resolution (In Design)
- **Purpose:** Vector embedding code candidate retrieval
- **Output:** Shortlisted medical codes for Pass 2
- **Status:** Design phase

### Pass 2: Clinical Extraction (Designed, Not Implemented)
- **Purpose:** Extract structured clinical data
- **Input:** Entities from Pass 1 + manifest from Pass 0.5
- **Output:** Populated clinical schemas
- **Status:** Schema complete, implementation pending

### Pass 3: Narrative Generation (Planned)
- **Purpose:** Generate patient-friendly medical summaries
- **Status:** Planning phase

**For complete V3 architecture:** See [V3_ARCHITECTURE_MASTER_GUIDE.md](../../../V3_ARCHITECTURE_MASTER_GUIDE.md)

---

## Key Metrics (October 2025)

**Production Performance:**
- **Cost:** ~$0.032 USD per 1-page document (GPT-5 Mini pricing)
- **Processing time:** 3-4 minutes (Pass 1 AI entity detection), 6-8 minutes total (end-to-end including OCR, database writes, and job coordination)
- **Quality:** 92-95% average confidence, 95-100% AI-OCR agreement
- **Cost savings:** 85-90% reduction vs AWS Textract ($2-3/document historically)

**Implementation:**
- **Code size:** 3,116 lines TypeScript across 8 files
- **AI model:** GPT-5 Mini (gpt-5-mini-2025-08-07)
- **OCR provider:** Google Cloud Vision
- **Database tables:** Writes to 7 tables per document processed (excludes `job_queue` which is infrastructure managed by Edge Functions/RPCs)

**For detailed metrics:** See [PASS-1-OVERVIEW.md](./PASS-1-OVERVIEW.md) Production Metrics section

---

## Environment Variables

**Required for Pass 1 operation:**
```bash
OPENAI_API_KEY=sk-...           # Required for GPT-5 Mini
GOOGLE_CLOUD_API_KEY=AIzaSy...  # Required for Google Cloud Vision OCR
SUPABASE_URL=https://...        # Required for database
SUPABASE_SERVICE_ROLE_KEY=...  # Required for server-side operations
```

**For worker configuration:** See [Render.com Deployment Guide](../../../render-com-deployment-guide.md)

---

## Related Documentation

**V3 Architecture:**
- [V3 Architecture Master Guide](../../../V3_ARCHITECTURE_MASTER_GUIDE.md) - Complete system overview
- [Migration History](../../../migration_history/) - Database migration tracking
- [Current Schema](../../../current_schema/) - Source of truth database schemas

**Bridge Schema Architecture:**
- [Bridge Schema README](../bridge-schema-architecture/README.md) - Overview of bridge schema system
- [Pass 1 Bridge Schemas](../bridge-schema-architecture/bridge-schemas/source/pass-1/) - Pass 1 schema specifications
- [Pass 2 Bridge Schemas](../bridge-schema-architecture/bridge-schemas/source/pass-2/) - Pass 2 schema specifications

**Worker Documentation:**
- [Worker Architecture](../../../current_workers/WORKER_ARCHITECTURE.md) - Render.com worker overview
- [Exora V3 Worker](../../../current_workers/exora-v3-worker/) - Worker implementation

---

**Last Updated:** October 13, 2025
**Maintained by:** Exora Health Pty Ltd
**Status:** Active documentation for operational system
