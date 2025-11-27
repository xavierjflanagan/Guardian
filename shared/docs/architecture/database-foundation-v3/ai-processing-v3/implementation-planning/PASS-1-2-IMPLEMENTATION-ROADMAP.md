# Pass 1-2 Integration Implementation Roadmap

**Created:** 2025-11-24
**Status:** 🔄 Active Planning
**Last Updated:** 2025-11-24
**Target Completion:** TBD

---

## Executive Summary

This roadmap covers the integration and implementation of Pass 1 (Entity Detection), Pass 1.5 (Medical Code Embedding), and Pass 2 (Clinical Enrichment) into a cohesive AI processing pipeline. Pass 1 already exists and is operational but was built before Pass 0.5 (Encounter Discovery) existed, requiring integration updates. Pass 1.5 infrastructure exists on the windsurf-staging-assistant branch but needs integration work. Pass 2 has complete database schemas and documentation but no worker implementation.

The pipeline flow is: **Pass 0.5 (Encounters)** → **Pass 1 (Entity Detection)** → **Pass 1.5 (Code Candidates)** → **Pass 2 (Clinical Enrichment)**

**Estimated Duration:** 14-20 days across 6 phases

---

## Current State Assessment

### Pass 0.5: Encounter Discovery ✅ OPERATIONAL

**Status:** Production-ready (Strategy A architecture)
**Location:** `apps/render-worker/src/pass05/` (~2000 lines TypeScript)
**Last Updated:** November 2025

**What it provides:**
- Healthcare encounter detection and classification
- Progressive chunking for large documents (50 pages per chunk)
- Cascade reconciliation for multi-chunk encounters
- Encounter manifests with metadata
- Page range mappings

**Key Outputs:**
- `healthcare_encounters` table records (pre-created with UUIDs)
- `shell_file_manifests` table (encounter context packages)
- `pass05_encounter_metrics` table
- Encounter-to-page mappings

**Integration Points for Pass 1:**
- Provides `encounter_id` for all detected entities
- Supplies macro context (encounter type, date, facility)
- Defines page ranges for batching Pass 1/2 processing

**Production Metrics:**
- Cost: ~$0.03-0.08 per document
- Processing: 5-15 seconds per 50-page chunk
- Quality: 90-95% confidence on encounter detection
- Tested: Up to 219-page documents

**Documentation:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-0.5-encounter-discovery/strategy-a-docs/00-START-HERE.md`

---

### Pass 1: Entity Detection ✅ OPERATIONAL

**Status:** Production-ready since October 2025
**Location:** `apps/render-worker/src/pass1/` (3,116 lines TypeScript, 8 files)
**Model:** GPT-5 Mini (gpt-5-mini-2025-08-07)

**What it does:**
- Three-category classification (clinical/context/structure)
- Detects and classifies every entity in medical documents
- Outputs to 7 database tables
- Provides confidence scoring and entity relationships

**Key Files:**
- `Pass1EntityDetector.ts` (24,665 bytes) - Main detection class
- `pass1-types.ts` (14,746 bytes) - TypeScript interfaces
- `pass1-prompts.ts` (12,618 bytes) - AI prompt templates
- `pass1-translation.ts` (17,532 bytes) - AI → database translation
- `pass1-database-builder.ts` (15,393 bytes) - 7-table record builder

**Database Tables (Pass 1 writes to):**
1. `entity_processing_audit` - Main entity records
2. `ai_processing_sessions` - Session metadata
3. `ai_confidence_scoring` - Confidence metrics
4. `manual_review_queue` - Low confidence items
5. `profile_classification_audit` - Patient identity classification
6. `pass1_entity_metrics` - Processing metrics
7. `shell_files` - Updates completion flags

**Production Metrics:**
- Cost: ~$0.032 USD per 1-page document
- Processing: 3-4 minutes (Pass 1 AI), 6-8 minutes total (including OCR)
- Quality: 92-95% average confidence
- AI-OCR agreement: 95-100%

**CRITICAL ISSUE:** Built BEFORE Pass 0.5 existed (see ISSUE-001 below)

**Documentation:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1-entity-detection/PASS-1-OVERVIEW.md`

---

### Pass 1.5: Medical Code Embedding 🟡 PARTIALLY BUILT

**Status:** Infrastructure exists on windsurf-staging-assistant branch, integration layer missing
**Purpose:** Vector similarity search for medical code candidate retrieval

**What exists (on windsurf-staging-assistant):**

**Medical Code Data:**
- `data/medical-codes/snomed/core-subset/` - SNOMED CT CORE 202506 (47,749 codes)
- `data/medical-codes/snomed/core-subset/core_mapping.json` - Complete mappings
- LOINC codes migrated to `universal_medical_codes` table
- Migration scripts in `scripts/medical-codes/`

**Database Infrastructure:**
- `universal_medical_codes` table (LOINC populated)
- `regional_medical_codes` table (ready for PBS/MBS)
- Vector index creation scripts (HNSW)
- Working index creation: `scripts/medical-codes/create-loinc-hnsw-index.sql`

**Scripts:**
- `scripts/medical-codes/loinc/generate-loinc-embeddings.ts` - LOINC embedding generation
- `scripts/medical-codes/snomed/generate-snomed-embeddings.ts` - SNOMED embedding generation
- `scripts/medical-codes/snomed/mark-core-codes.ts` - SNOMED CORE subset marking
- `scripts/medical-codes/migrate-loinc-upsert.ts` - LOINC migration to universal table

**What's missing:**
- [ ] Integration layer for Pass 2 handoff
- [ ] Embedding generation for Pass 1 clinical entity text
- [ ] Top-K retrieval service (RPC function)
- [ ] TypeScript wrapper in worker
- [ ] Performance benchmarking

**Key Insight:** This is NOT an AI processing pass - it's a database vector similarity search service that sits between Pass 1 and Pass 2.

**Target Performance:**
- Retrieval speed: < 100ms per entity
- Top-K candidates: 10-20 codes per entity
- Semantic matching accuracy: > 85%

**Documentation:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/README.md`

---

### Pass 2: Clinical Enrichment 🔴 NOT BUILT

**Status:** Designed, schema complete, NO worker implementation
**Location (planned):** `apps/render-worker/src/pass2/` (does not exist yet)

**Database Schema Status:** ✅ COMPLETE
- Schema exists in `current_schema/03_clinical_core.sql`
- Hub table: `patient_clinical_events`
- 7 spoke tables: observations, interventions, vitals, conditions, allergies, medications, immunizations
- Composite foreign keys enforce hub-and-spoke referential integrity

**Bridge Schemas:** ✅ COMPLETE
- 14 bridge schemas in `bridge-schemas/source/pass-2/`
- Three-tier system: source (.md) → detailed (.json) → minimal (.json)
- Detailed: ~1,500 tokens/schema (rich medical context)
- Minimal: ~200 tokens/schema (condensed format)

**AI Prompts:** ✅ DOCUMENTED
- Prompt templates in `PASS-2-PROMPTS.md`
- Encounter-first extraction strategy
- Medical code assignment via Pass 1.5

**Worker Code:** ❌ DOES NOT EXIST
- No TypeScript implementation
- No Pass2ClinicalExtractor class
- No database write logic
- No integration with Pass 1/1.5

**Target Metrics:**
- Cost: $0.003-0.006 per document (GPT-5-mini)
- Processing: 3-5 seconds per document
- Extraction completeness: >95%
- Database write success: >99%
- Referential integrity: 100% (FK constraints)
- Code assignment rate: >80% auto-accepted (confidence >= 0.80)

**Documentation:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-2-clinical-enrichment/PASS-2-OVERVIEW.md`

---

## Critical Integration Issues

### ISSUE-001: Pass 1 Built Before Pass 0.5 Existed

**Priority:** 🔴 HIGH (blocks proper Pass 2 integration)
**Status:** 🔲 Not Investigated

**Problem:**
Pass 1 was designed and implemented when encounter context didn't exist in the system. Pass 0.5 was built AFTER Pass 1 went to production. Now Pass 0.5 provides rich encounter context that Pass 1 may not be leveraging:
- Healthcare encounter IDs (`encounter_id`)
- Encounter type classification (hospital admission, outpatient visit, etc.)
- Page range mappings (which pages belong to which encounter)
- Macro context packages (encounter metadata for AI context)

**Specific Unknowns:**
- Does `entity_processing_audit` table have an `encounter_id` column?
- Does Pass 1 read from `healthcare_encounters` or `shell_file_manifests`?
- Does Pass 1 pass encounter context to Pass 2?
- Does Pass 1 batch processing consider encounter boundaries?

**Impact:**
- Pass 2 may not receive encounter_id for clinical events
- Clinical data extraction may lack encounter context
- Hub-and-spoke writes may fail FK constraints (if encounter_id missing)
- Batching strategy for Pass 2 may be suboptimal

**Resolution Steps:**
1. [ ] Read `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (main class)
2. [ ] Check `pass1-types.ts` for encounter_id in type definitions
3. [ ] Query Supabase: `SELECT column_name FROM information_schema.columns WHERE table_name = 'entity_processing_audit'`
4. [ ] Search codebase for references to `healthcare_encounters` in Pass 1 code
5. [ ] Review `worker.ts` orchestration - does it pass encounter manifest to Pass 1?
6. [ ] Test Pass 1 with multi-encounter document from Pass 0.5
7. [ ] Update Pass 1 to leverage encounter context (if missing)

**Files to Investigate:**
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts`
- `apps/render-worker/src/pass1/pass1-types.ts`
- `apps/render-worker/src/pass1/pass1-database-builder.ts`
- `apps/render-worker/src/worker.ts` (job orchestration)
- `current_schema/04_ai_processing.sql` (entity_processing_audit table definition)

**Success Criteria:**
- [ ] Pass 1 receives `encounter_id` from Pass 0.5 manifest
- [ ] Pass 1 outputs include `encounter_id` in `entity_processing_audit`
- [ ] Entity detection considers encounter type for context
- [ ] Pass 1 → Pass 2 handoff includes encounter context

---

### ISSUE-002: Pass 1.5 Medical Code Infrastructure Split Across Branches

**Priority:** 🟡 MEDIUM (needed before Pass 2 coding begins)
**Status:** 🔲 Not Resolved

**Problem:**
Pass 1.5 medical code infrastructure (LOINC, SNOMED, vector indexes) exists on `windsurf-staging-assistant` branch but not on `main`. This creates a branch synchronization issue and blocks Pass 2 development.

**What's on windsurf-staging-assistant (not on main):**
- `data/medical-codes/snomed/core-subset/` - 47,749 SNOMED CT CORE codes
- `scripts/medical-codes/` - LOINC/SNOMED parsing and migration scripts
- `scripts/medical-codes/create-loinc-hnsw-index.sql` - Working vector index
- LOINC migration to `universal_medical_codes` table
- SNOMED CT CORE subset population

**What's missing entirely:**
- Pass 1.5 integration layer for Pass 2 handoff
- Embedding generation for clinical entity text (from Pass 1)
- Top-K retrieval service (RPC function)
- TypeScript wrapper for vector search
- Performance benchmarks and validation

**Impact:**
- Cannot build Pass 2 without medical code candidates
- Pass 2 AI would hallucinate codes without Pass 1.5
- Deduplication system (temporal data management) depends on code assignment

**Resolution Steps:**
1. [ ] Review `windsurf-staging-assistant` branch changes
2. [ ] Create merge plan (or cherry-pick specific commits)
3. [ ] Merge medical code data and scripts to `main`
4. [ ] Verify LOINC/SNOMED tables exist in production Supabase
5. [ ] Test HNSW vector index creation on production DB
6. [ ] Document migration steps for future reference

**After Merge:**
7. [ ] Build Pass 1.5 retrieval service (Phase 3)
8. [ ] Create embedding generation for entity text
9. [ ] Build top-K RPC function
10. [ ] Create TypeScript wrapper in worker
11. [ ] Benchmark retrieval performance

**Success Criteria:**
- [ ] Medical code database on `main` branch
- [ ] LOINC and SNOMED codes populated in production
- [ ] Vector indexes operational
- [ ] Pass 1.5 retrieval service returns 10-20 relevant codes per entity
- [ ] Retrieval speed < 100ms per entity
- [ ] Semantic matching accuracy > 85%

---

## Implementation Phases

### Phase 1: Pass 0.5 ↔ Pass 1 Integration Audit (1-2 days)

**Status:** 🔲 Not Started
**Owner:** TBD
**Started:** TBD
**Completed:** TBD

**Goal:** Ensure Pass 1 properly uses Pass 0.5 encounter context and passes encounter_id to downstream processing.

**Tasks:**
- [ ] Read `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (24,665 bytes)
- [ ] Check `pass1-types.ts` for encounter_id in type definitions
- [ ] Query Supabase schema: Does `entity_processing_audit` have `encounter_id` column?
- [ ] Search Pass 1 codebase for references to `healthcare_encounters` table
- [ ] Review `worker.ts` orchestration - does it pass encounter manifest to Pass 1?
- [ ] Trace data flow: Pass 0.5 manifest → Pass 1 input → Pass 1 output
- [ ] Test Pass 1 with multi-encounter document (e.g., 142-page hospital admission)
- [ ] Update Pass 1 code to include encounter context (if missing)
- [ ] Update Pass 1 database writes to include `encounter_id`
- [ ] Document integration approach for Pass 2

**Deliverable:**
Pass 1 properly leverages Pass 0.5 encounter manifest and outputs encounter_id for Pass 2 consumption.

**Files Created/Modified:**
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (if updates needed)
- `apps/render-worker/src/pass1/pass1-types.ts` (if encounter_id missing)
- `apps/render-worker/src/pass1/pass1-database-builder.ts` (if encounter_id write missing)
- `current_schema/04_ai_processing.sql` (if entity_processing_audit needs migration)
- Migration file (if database schema change required)

**Testing:**
- [ ] Pass 1 processes multi-encounter document successfully
- [ ] `entity_processing_audit` records include valid `encounter_id`
- [ ] Encounter context visible in Pass 1 processing logs
- [ ] Pass 1 → Pass 2 handoff data includes encounter metadata

**Dependencies:** None (first phase)

**Sign-off:** [ ] Ready for Phase 2

---

### Phase 2: Merge Windsurf Medical Code Work (1 day)

**Status:** 🔲 Not Started
**Owner:** TBD
**Started:** TBD
**Completed:** TBD

**Goal:** Get Pass 1.5 medical code infrastructure onto `main` branch and verify database population.

**Tasks:**
- [ ] Review `windsurf-staging-assistant` commit history (since divergence)
- [ ] Identify medical code commits to merge/cherry-pick
- [ ] Create merge strategy (full merge vs cherry-pick)
- [ ] Merge medical code data files to `main`
- [ ] Merge medical code scripts to `main`
- [ ] Update `.gitignore` if large data files need exclusion
- [ ] Push merged changes to `origin/main`
- [ ] Connect to production Supabase and verify tables exist:
  - [ ] `universal_medical_codes` table exists
  - [ ] `regional_medical_codes` table exists
  - [ ] LOINC codes populated (check row count)
  - [ ] SNOMED CT CORE codes populated (check row count)
- [ ] Test HNSW vector index creation script
- [ ] Document migration steps in this file

**Deliverable:**
Medical code database operational on `main` branch with LOINC and SNOMED codes populated in production.

**Files Created/Modified:**
- `data/medical-codes/snomed/core-subset/*` (merged from windsurf)
- `scripts/medical-codes/*` (merged from windsurf)
- `scripts/medical-codes/create-loinc-hnsw-index.sql`
- Git merge commit on `main`

**Testing:**
- [ ] Verify LOINC codes in production: `SELECT COUNT(*) FROM universal_medical_codes WHERE code_system = 'LOINC'`
- [ ] Verify SNOMED codes in production: `SELECT COUNT(*) FROM universal_medical_codes WHERE code_system = 'SNOMED_CT'`
- [ ] Test vector index creation: Run `create-loinc-hnsw-index.sql` in staging
- [ ] Verify index performance: `EXPLAIN ANALYZE` on vector similarity query

**Dependencies:** Phase 1 (not blocking, can run in parallel)

**Sign-off:** [ ] Ready for Phase 3

---

### Phase 3: Build Pass 1.5 Retrieval Service (2-3 days)

**Status:** 🔲 Not Started
**Owner:** TBD
**Started:** TBD
**Completed:** TBD

**Goal:** Create vector similarity search service for medical code candidate retrieval.

**Tasks:**
- [ ] Design Pass 1.5 module structure (similar to Pass 1)
- [ ] Create `apps/render-worker/src/pass1.5/` directory
- [ ] Build embedding generation function for entity text:
  - [ ] Choose embedding model (OpenAI text-embedding-3-small recommended)
  - [ ] Create `embedding-generator.ts` module
  - [ ] Handle batch embedding generation (multiple entities)
  - [ ] Add error handling and retries
- [ ] Create top-K retrieval RPC in PostgreSQL:
  - [ ] Write `rpc_pass15_retrieve_codes.sql` function
  - [ ] Use pgvector for similarity search
  - [ ] Return top 10-20 candidates with similarity scores
  - [ ] Add code_system filtering (LOINC/SNOMED/RxNorm)
  - [ ] Add performance optimization (index usage verification)
- [ ] Build TypeScript wrapper in worker:
  - [ ] Create `vector-search.ts` module
  - [ ] Call RPC function from TypeScript
  - [ ] Parse and validate results
  - [ ] Add logging and metrics
- [ ] Test retrieval accuracy:
  - [ ] Create test entity samples (10-15 entities)
  - [ ] Verify semantic matching (synonyms, typos)
  - [ ] Measure precision@10 (are top 10 results relevant?)
- [ ] Benchmark performance:
  - [ ] Measure RPC execution time
  - [ ] Test with 100 concurrent requests
  - [ ] Optimize if > 100ms per lookup
- [ ] Create Pass 1 → Pass 1.5 → Pass 2 integration flow
- [ ] Document API and usage examples

**Deliverable:**
Working Pass 1.5 code candidate retrieval service integrated into worker pipeline.

**Files Created:**
- `apps/render-worker/src/pass1.5/index.ts` (public API)
- `apps/render-worker/src/pass1.5/embedding-generator.ts` (OpenAI embeddings)
- `apps/render-worker/src/pass1.5/vector-search.ts` (database queries)
- `apps/render-worker/src/pass1.5/types.ts` (TypeScript interfaces)
- `current_schema/rpc_pass15_retrieve_codes.sql` (PostgreSQL RPC)
- `shared/docs/.../pass-1.5-medical-code-embedding/PASS-1.5-IMPLEMENTATION.md` (documentation)

**Testing:**
- [ ] Unit tests for embedding generation
- [ ] Integration tests for vector search
- [ ] Performance benchmark: < 100ms per entity
- [ ] Accuracy test: > 85% relevant results in top 10
- [ ] Test with real Pass 1 entity samples

**Dependencies:** Phase 2 (medical code database must exist)

**Sign-off:** [ ] Ready for Phase 4

---

### Phase 4: Design Pass 2 Worker Architecture (2-3 days)

**Status:** 🔲 Not Started
**Owner:** TBD
**Started:** TBD
**Completed:** TBD

**Goal:** Plan Pass 2 implementation structure and technical specifications.

**Tasks:**
- [ ] Study Pass 1 worker architecture as template
- [ ] Design Pass 2 worker class structure:
  - [ ] Main class: `Pass2ClinicalExtractor`
  - [ ] Bridge schema loader module
  - [ ] Prompt builder module (with encounter context)
  - [ ] AI response translator module
  - [ ] Hub-and-spoke database writer module
- [ ] Map Pass 1 entities → Pass 2 bridge schemas:
  - [ ] Clinical entities → which bridge schemas to load?
  - [ ] Entity filtering logic (which entities need Pass 2?)
  - [ ] Bridge schema selection strategy (detailed vs minimal)
- [ ] Design batch processing strategy:
  - [ ] How to avoid overwhelming AI with too many entities?
  - [ ] Batching by encounter? By entity type? By page range?
  - [ ] Token limit management (~8k tokens input target)
- [ ] Design hub-and-spoke database write logic:
  - [ ] Order of operations (hub first, then spokes)
  - [ ] Transaction management (atomic writes)
  - [ ] Foreign key validation
  - [ ] Error handling and rollback
- [ ] Design encounter context packaging:
  - [ ] What encounter metadata to include in prompts?
  - [ ] How to structure encounter context for AI?
  - [ ] Page range context for entity location
- [ ] Plan medical code assignment integration (Pass 1.5):
  - [ ] When to call Pass 1.5 (before or during Pass 2)?
  - [ ] How to pass code candidates to AI?
  - [ ] AI decision logic for code selection
  - [ ] Confidence thresholds for auto-acceptance
- [ ] Create technical specification document
- [ ] Design TypeScript module structure
- [ ] Plan error handling and retry logic
- [ ] Design comprehensive logging strategy

**Deliverable:**
Complete Pass 2 technical specification with architecture diagrams and module design.

**Files Created:**
- `shared/docs/.../pass-2-clinical-enrichment/PASS-2-WORKER-ARCHITECTURE.md`
- `shared/docs/.../pass-2-clinical-enrichment/PASS-2-IMPLEMENTATION-PLAN.md`
- `shared/docs/.../pass-2-clinical-enrichment/PASS-2-BATCHING-STRATEGY.md`
- `shared/docs/.../pass-2-clinical-enrichment/PASS-2-CODE-ASSIGNMENT-FLOW.md`
- Architecture diagrams (Mermaid or ASCII)

**Testing:**
- [ ] Specification reviewed by second AI bot
- [ ] Architecture diagrams validated
- [ ] Module responsibilities clearly defined
- [ ] All integration points documented

**Dependencies:** Phase 3 (Pass 1.5 must be operational)

**Sign-off:** [ ] Ready for Phase 5

---

### Phase 5: Implement Pass 2 Core (5-7 days)

**Status:** 🔲 Not Started
**Owner:** TBD
**Started:** TBD
**Completed:** TBD

**Goal:** Build Pass 2 clinical enrichment worker following the architecture specification.

**Tasks:**
- [ ] Create `apps/render-worker/src/pass2/` directory structure
- [ ] Implement main class: `Pass2ClinicalExtractor.ts`:
  - [ ] Constructor with dependency injection
  - [ ] Main `extract()` method (entry point)
  - [ ] Entity batching logic
  - [ ] Orchestration of sub-modules
- [ ] Implement bridge schema loader:
  - [ ] Create `pass2-bridge-loader.ts`
  - [ ] Load detailed vs minimal schemas based on entity count
  - [ ] Schema caching for performance
  - [ ] Schema validation
- [ ] Create prompt builder:
  - [ ] Create `pass2-prompts.ts`
  - [ ] Build system message (instructions for AI)
  - [ ] Build entity extraction prompt with encounter context
  - [ ] Include code candidates from Pass 1.5
  - [ ] Include bridge schemas (detailed or minimal)
  - [ ] Token counting and optimization
- [ ] Build AI response translator:
  - [ ] Create `pass2-translation.ts`
  - [ ] Parse AI JSON response
  - [ ] Validate against bridge schemas
  - [ ] Transform AI format → database format
  - [ ] Handle missing/invalid data
  - [ ] Confidence score calculation
- [ ] Implement hub-and-spoke database writer:
  - [ ] Create `pass2-database-builder.ts`
  - [ ] Build `patient_clinical_events` hub records
  - [ ] Build spoke records (observations, interventions, etc.)
  - [ ] Handle composite foreign keys
  - [ ] Transaction management (atomic writes)
  - [ ] Rollback on errors
- [ ] Create type definitions:
  - [ ] Create `pass2-types.ts`
  - [ ] AI response interface
  - [ ] Database record interfaces
  - [ ] Configuration interfaces
- [ ] Add comprehensive error handling:
  - [ ] Try-catch blocks for all AI calls
  - [ ] Database constraint violation handling
  - [ ] Retry logic for transient failures
  - [ ] Error logging with context
- [ ] Add comprehensive logging:
  - [ ] Processing start/end timestamps
  - [ ] Entity counts and batch sizes
  - [ ] AI token usage and costs
  - [ ] Database write counts
  - [ ] Error rates and warnings
- [ ] Create public API:
  - [ ] Create `index.ts` with clean exports
  - [ ] Document usage examples
- [ ] Integration with worker orchestration:
  - [ ] Update `apps/render-worker/src/worker.ts`
  - [ ] Add Pass 2 job claiming logic
  - [ ] Coordinate Pass 1 → Pass 1.5 → Pass 2 flow
- [ ] Add cost tracking:
  - [ ] Calculate AI costs (input + output tokens)
  - [ ] Write to `pass2_processing_costs` table
- [ ] Write unit tests for critical functions
- [ ] Write integration tests for database writes

**Deliverable:**
Functional Pass 2 worker that processes Pass 1 entities into structured clinical data.

**Files Created:**
- `apps/render-worker/src/pass2/index.ts` (public API)
- `apps/render-worker/src/pass2/Pass2ClinicalExtractor.ts` (main class ~500 lines)
- `apps/render-worker/src/pass2/pass2-prompts.ts` (AI prompts ~300 lines)
- `apps/render-worker/src/pass2/pass2-types.ts` (TypeScript interfaces ~400 lines)
- `apps/render-worker/src/pass2/pass2-database-builder.ts` (database writes ~600 lines)
- `apps/render-worker/src/pass2/pass2-bridge-loader.ts` (schema loading ~200 lines)
- `apps/render-worker/src/pass2/pass2-translation.ts` (AI → DB translation ~500 lines)
- `apps/render-worker/src/pass2/__tests__/` (unit tests)

**Files Modified:**
- `apps/render-worker/src/worker.ts` (add Pass 2 orchestration)

**Testing:**
- [ ] Unit tests for each module (>80% coverage target)
- [ ] Integration test: Pass 1 entities → Pass 2 → database writes
- [ ] Test hub-and-spoke FK constraints
- [ ] Test transaction rollback on errors
- [ ] Test with small sample document (3-5 entities)
- [ ] Test with medium document (20-30 entities)

**Dependencies:** Phase 4 (architecture specification must be complete)

**Sign-off:** [ ] Ready for Phase 6

---

### Phase 6: Pass 2 Testing & Validation (3-4 days)

**Status:** 🔲 Not Started
**Owner:** TBD
**Started:** TBD
**Completed:** TBD

**Goal:** Validate Pass 2 extraction quality, database integrity, and production readiness.

**Tasks:**
- [ ] Create hypothesis test suite:
  - [ ] Test 01: Single-encounter, simple clinical document (3-5 entities)
  - [ ] Test 02: Single-encounter, complex document (20-30 entities)
  - [ ] Test 03: Multi-encounter document (2-3 encounters)
  - [ ] Test 04: Large document (142 pages, multiple encounters)
  - [ ] Test 05: Edge cases (low confidence, ambiguous data)
  - [ ] Test 06: Medical code assignment accuracy
  - [ ] Test 07: Hub-and-spoke referential integrity
  - [ ] Test 08: Encounter context integration
  - [ ] Test 09: Cost and performance benchmarks
  - [ ] Test 10: Error handling and retry logic
- [ ] Validate hub-and-spoke FK constraints:
  - [ ] Test all 7 spoke tables have valid hub references
  - [ ] Test patient_id consistency (hub and spoke match)
  - [ ] Test encounter_id propagation from Pass 0.5
  - [ ] Attempt invalid writes and verify rejection
- [ ] Test medical code assignment accuracy:
  - [ ] Measure auto-acceptance rate (target: >80%)
  - [ ] Measure manual review rate (target: <20%)
  - [ ] Validate code relevance (human review of 50 samples)
  - [ ] Test code hierarchy selection (granularity logic)
- [ ] Measure extraction completeness:
  - [ ] Count Pass 1 entities vs Pass 2 extracted records
  - [ ] Target: >95% extraction completeness
  - [ ] Identify missing entity types
  - [ ] Document extraction gaps
- [ ] Benchmark cost and performance:
  - [ ] Measure cost per document (10 sample documents)
  - [ ] Target: $0.003-0.006 per document
  - [ ] Measure processing time (end-to-end)
  - [ ] Target: 3-5 seconds per document
  - [ ] Compare actual vs target metrics
- [ ] Audit database writes:
  - [ ] Verify referential integrity (100% target)
  - [ ] Test database write success rate (>99% target)
  - [ ] Check for orphaned records
  - [ ] Verify transaction atomicity
- [ ] Conduct table-by-table audit:
  - [ ] Audit `patient_clinical_events` (hub)
  - [ ] Audit each spoke table (7 tables)
  - [ ] Verify column population rates
  - [ ] Identify NULL value patterns
  - [ ] Document data quality issues
- [ ] Create validation report:
  - [ ] Test results summary
  - [ ] Metrics comparison (actual vs target)
  - [ ] Data quality findings
  - [ ] Known issues and limitations
  - [ ] Production readiness recommendation
- [ ] Document test cases and results

**Deliverable:**
Production-validated Pass 2 system with comprehensive test results and quality audit.

**Files Created:**
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/README.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-01-simple-document.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-02-complex-document.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-03-multi-encounter.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-04-large-document.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-05-edge-cases.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-06-code-assignment.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-07-referential-integrity.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-08-encounter-context.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-09-cost-performance.md`
- `pass-2-clinical-enrichment/pass2-hypothesis-tests-results/test-10-error-handling.md`
- `pass-2-clinical-enrichment/pass2-audits/README.md`
- `pass-2-clinical-enrichment/pass2-audits/pass2-audit-consolidated-fixes.md`
- `pass-2-clinical-enrichment/pass2-audits/pass2-individual-table-audits/patient_clinical_events-audit.md`
- `pass-2-clinical-enrichment/VALIDATION-REPORT-2025-[DATE].md`

**Testing:**
- [ ] All 10 hypothesis tests executed and documented
- [ ] Metrics meet or exceed targets
- [ ] Data quality audit complete
- [ ] Known issues documented with workarounds
- [ ] Production readiness checklist complete

**Dependencies:** Phase 5 (Pass 2 implementation must be complete)

**Sign-off:** [ ] Pass 2 ready for production deployment

---

## Success Criteria

### Pass 1 ↔ Pass 0.5 Integration
- [ ] Pass 1 receives `encounter_id` from Pass 0.5 manifest
- [ ] Pass 1 outputs include `encounter_id` in `entity_processing_audit` table
- [ ] Entity detection considers encounter type for context
- [ ] Multi-encounter documents process correctly
- [ ] Pass 1 → Pass 2 handoff includes encounter metadata

### Pass 1.5 Operational
- [ ] Medical code database on `main` branch
- [ ] LOINC codes populated (target: 100k+ codes)
- [ ] SNOMED CT CORE codes populated (target: 47,749 codes)
- [ ] Vector indexes operational (HNSW)
- [ ] Vector search returns 10-20 relevant codes per entity
- [ ] Retrieval speed < 100ms per entity
- [ ] Semantic matching accuracy > 85%
- [ ] Integration with Pass 2 complete

### Pass 2 Operational
- [ ] Pass 2 worker implemented and tested
- [ ] Extracts clinical data to hub-and-spoke tables
- [ ] Assigns medical codes via Pass 1.5
- [ ] Cost: $0.003-0.006 per document (within target)
- [ ] Processing time: 3-5 seconds per document (within target)
- [ ] Extraction completeness: >95% (within target)
- [ ] Database write success: >99% (within target)
- [ ] Referential integrity: 100% (FK constraints enforced)
- [ ] Code assignment rate: >80% auto-accepted (within target)
- [ ] All hypothesis tests passing
- [ ] Production readiness validated

---

## Timeline & Milestones

**Total Duration:** 14-20 days (assumes full-time focus)
**Target Completion:** TBD

**Milestones:**
- [ ] **Phase 1 Complete:** TBD - Pass 1 integration with Pass 0.5 verified
- [ ] **Phase 2 Complete:** TBD - Medical code database on main branch
- [ ] **Phase 3 Complete:** TBD - Pass 1.5 retrieval service operational
- [ ] **Phase 4 Complete:** TBD - Pass 2 architecture specification approved
- [ ] **Phase 5 Complete:** TBD - Pass 2 worker implementation complete
- [ ] **Phase 6 Complete:** TBD - Pass 2 production-validated

**Critical Path:**
Phase 1 → Phase 3 → Phase 4 → Phase 5 → Phase 6
(Phase 2 can run in parallel with Phase 1)

---

## Decision Log

### Decision 001: 2025-11-24 - Start with Pass 1 Integration Audit

**Context:** Need to determine starting point for Pass 1-2 integration work. Pass 1 was built before Pass 0.5 existed, creating uncertainty about encounter context usage.

**Options Considered:**
- A) Start building Pass 2 immediately (assume Pass 1 is fine)
- B) Start with Pass 1 integration audit (verify encounter context)
- C) Start with Pass 1.5 medical code merge (get infrastructure first)

**Decision:** Option B - Start with Pass 1 integration audit (Phase 1)

**Rationale:**
- Pass 2 depends on Pass 1 outputting encounter_id
- Unknown if Pass 1 leverages Pass 0.5 encounter context
- Risk of building Pass 2 on incorrect assumptions
- Low cost to verify (1-2 days) vs high risk if wrong
- Pass 1.5 merge can happen in parallel (Phase 2)

**Impact:**
- Phase 1 starts immediately
- Phase 2 (windsurf merge) can run concurrently
- Pass 2 design (Phase 4) delayed until integration verified
- Reduces risk of rework in Pass 2 implementation

---

### Decision 002: 2025-11-24 - Single Roadmap File Structure

**Context:** Need to decide how to structure implementation planning documentation.

**Options Considered:**
- A) Single comprehensive roadmap file
- B) Multi-file structure (phases/, session-notes/, decision-log/, etc.)

**Decision:** Option A - Single comprehensive roadmap file (this file)

**Rationale:**
- Easier to search (Ctrl+F finds everything)
- Faster to update progress (one place)
- Better for AI context loading (one Read command)
- Simpler for quick reference during work
- Can split later if it becomes unwieldy

**Impact:**
- All planning, progress, decisions in one file
- File will grow as work progresses (expected)
- May split into multi-file structure if >1000 lines
- Session notes and decisions tracked inline

---

## Session Notes

### Session 2025-11-24: Initial Planning & Roadmap Creation

**Duration:** ~2 hours
**Participants:** Xavier Flanagan, Claude Code
**Branch:** `main`

**Work Completed:**
- ✅ Assessed current state of Pass 1, Pass 1.5, Pass 2
- ✅ Identified 2 critical integration issues (ISSUE-001, ISSUE-002)
- ✅ Created 6-phase implementation roadmap (14-20 days)
- ✅ Documented Pass 0.5, Pass 1, Pass 1.5, Pass 2 status
- ✅ Created this roadmap file (PASS-1-2-IMPLEMENTATION-ROADMAP.md)
- ✅ Reviewed windsurf-staging-assistant branch (medical code work exists)

**Decisions Made:**
- Decision 001: Start with Phase 1 (Pass 1 integration audit)
- Decision 002: Use single roadmap file structure

**Key Findings:**
1. Pass 1 built BEFORE Pass 0.5 existed → may not use encounter context
2. Pass 1.5 infrastructure exists on windsurf-staging-assistant (not main)
3. Pass 2 has complete schema but zero worker implementation
4. 14 Pass 2 bridge schemas already exist and ready to use
5. LOINC migration complete on windsurf branch (needs merge)
6. SNOMED CT CORE subset (47,749 codes) ready on windsurf branch

**Action Items for Next Session:**
- [ ] Begin Phase 1: Read Pass1EntityDetector.ts
- [ ] Check entity_processing_audit table schema for encounter_id
- [ ] Trace data flow from Pass 0.5 → Pass 1 → database

**Notes:**
- Pass 0.5 reorganization just completed (strategy-a-docs promoted)
- Migration 66 (single-page constraint fix) just deployed
- Windsurf team merged main → windsurf-staging-assistant today
- All branches are up to date and clean

---

## References

### Related Documentation

**Pass Documentation:**
- [Pass 0.5 Overview](./pass-0.5-encounter-discovery/strategy-a-docs/00-START-HERE.md)
- [Pass 1 Overview](./pass-1-entity-detection/PASS-1-OVERVIEW.md)
- [Pass 1.5 README](./pass-1.5-medical-code-embedding/README.md)
- [Pass 2 Overview](./pass-2-clinical-enrichment/PASS-2-OVERVIEW.md)

**Architecture Documentation:**
- [V3 Architecture Master Guide](../../V3_ARCHITECTURE_MASTER_GUIDE.md)
- [Bridge Schema Architecture](../bridge-schema-architecture/README.md)
- [Worker Architecture](../../current_workers/WORKER_ARCHITECTURE.md)

**Database Documentation:**
- [Current Schema Files](../../current_schema/)
- [Migration History](../../migration_history/)

### Key Files to Reference

**Pass 1 Source Code:**
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (main class)
- `apps/render-worker/src/pass1/pass1-types.ts` (TypeScript interfaces)
- `apps/render-worker/src/pass1/pass1-prompts.ts` (AI prompts)
- `apps/render-worker/src/pass1/pass1-database-builder.ts` (database writes)

**Pass 0.5 Source Code:**
- `apps/render-worker/src/pass05/index.ts` (main entry point)
- `apps/render-worker/src/pass05/progressive/pending-reconciler.ts` (reconciliation)
- `apps/render-worker/src/pass05/progressive/session-manager.ts` (session management)

**Database Schema:**
- `current_schema/03_clinical_core.sql` (Pass 2 hub-and-spoke tables)
- `current_schema/04_ai_processing.sql` (Pass 1 entity tables)
- `current_schema/08_job_coordination.sql` (Pass 0.5 tables)

**Worker Orchestration:**
- `apps/render-worker/src/worker.ts` (job coordination)

**Medical Code Scripts (Windsurf Branch):**
- `scripts/medical-codes/loinc/generate-loinc-embeddings.ts`
- `scripts/medical-codes/snomed/generate-snomed-embeddings.ts`
- `scripts/medical-codes/create-loinc-hnsw-index.sql`

### External Resources

**Medical Code Standards:**
- LOINC: https://loinc.org/
- SNOMED CT: https://www.snomed.org/
- RxNorm: https://www.nlm.nih.gov/research/umls/rxnorm/
- PBS (Australian): http://www.pbs.gov.au/

**Technical Resources:**
- pgvector documentation: https://github.com/pgvector/pgvector
- OpenAI embeddings: https://platform.openai.com/docs/guides/embeddings
- GPT-5 Mini pricing: https://openai.com/pricing

---

**Maintained By:** Exora Health Development Team
**Status:** 🔄 Living document - updated as we progress through phases
**Last Updated:** 2025-11-24




Xaviers thoughts - 24th Nov 2025:
Okay so we're starting with a pass1 review to determine what needs to change about it, which is a lot. I've thought about it and here is my word vomit ramblings which I want you to make sense of and respond back to me in an organised way: 
- pass 05 uses an OCR spatial mapped text output as the input for the AI model in pass 05. There is no raw image interpretation by the AI model in pass 05. Whereas pass 1 in the current state I believe analyses both OCR text and the raw image together, with the original intention being that the OCR text and the raw image complement each other, and my original intention was that all the spatial data would also be there so that the AI model in pass one could attribute spatial data to the data it's interpreting from the raw image (but as discussed in more detail below, i soon learnt the spatial data in the ocr output is very dense and would overwhelm the system in token volume / costs etc)
- Hence, I want to see whether we can transform/change pass 1 into something similar to what we've done with pass 05, which is an OCR-only reliant system that does not use the raw image for AI interpretation.
- This obviously means probably quite a lot of changes to pass 1 and I don't know what that would be yet. I haven't looked. 
- Just based on that alone, I'm starting to think and lean towards the idea of creating a new subfolder within pass 1 titled "pass 1 strategy-a" or something similar, that aligns fully with the pass 05 strategy-a. Then, within this subfolder, we can start building a new pass 1 system fresh without contamination because you, as in you Claude code, are better at creating files rather than editing old files which leads to more errors I've found. 
- So I think we cherry pick and comb through every single line of the pre-existing pass 1 system and all the code and scripts and tables and take out everything and start building anew in the new subfolder for Strategy A. This will require a very systematic initial analysis and investigative review followed by a design and iterative design, constantly referencing the investigative analytical review to generate the new version strategy-a. Another point to talk about is that originally pass 05 didn't exist and therefore I think I built pass one to deal with a bit of the encounter context related stuff, where it had a 3-2 system where it would label and extract and identify document structure, healthcare context, and clinical entities. It should all definitely be written down somewhere. But in general, by that 3-2 system there was a hierarchy where the document structure was not passed on to pass 2, but the healthcare context and clinical entities were. So my point here is that I'm wondering whether the healthcare context should be looked into and decided whether it still needs to the extent that it was previously to pass 05. I think it probably is still needed because within an encounter there's gonna be lots of little potentially little things, such as in a 10 day admission to hospital, where there will be a visit to the Imaging department, and there's a report; there would be health context related to that imaging such as the radiographer who did the image and the radiologist who reported on it—that's healthcare context. So now I'm thinking about it, yes it will still be needed. So now I'm thinking we keep this three tiered system, the core of what pass one is; we keep that and try not to touch it unless we realise we have to. And I guess we focus more so on the entry point into pass one because that'll all need to be changed as I previously talked about, because now I think we're gonna try and remove the requirement for a raw image to be given to pass one. 
- The final question and thing to think about is whether we bother giving pass one the encounter context that pass 05 generates, or whether we leave this for pass 2, which is more involved in the in-depth enrichment as per the bridge schemas. So we need to make that decision: Is pass one going to benefit by having the encounter context? And of course we need to work out if we do decide to give it to pass one, how we ensure that each section that pass one is analysing receives the appropriate (and not incorrect) encounter context handoff from pass 05. 
- Because that raises another issue, which is how many pages can we get away with cramming into one pass one AI API call. For pass 05 we are currently doing chunks of 50, and I'm not sure yet for pass 1, because we haven't ever stress tested pass 1. 
- But thankfully I've already anticipated this via the safe split points and batching process that is built into pass 05, where it outputs what it thinks to be safe split points within a very long encounter, allowing us, if we want, to split up a very large file into much smaller chunks and then allow us to run them all in parallel to speed up processing time. In this case we would definitely be giving the encounter context to the API call, because the nature of batching by the safe split points is that it is—the batch is—taken out of context of its encounter that it resides within. Obviously, if it is a single, simple encounter that spans one or two or three pages, for example, we could easily just hand it over to pass one without much deliberation because we know that the API calling pass one will be able to handle that, but if it's a very large file then we need to pull out all the stops and apply the safe split point batching processes. The same can also be said for what will be applied to pass 2, by the way.
-  Some other things we want to make sure that we build into pass 1 as well as pass 2 is that of parallel processing via batching: if we get one shell file that has three encounters we want the ability to split those encounters into three separate API calls for both pass one and pass two, as this will speed up processing and that's very important for the user experience. And then, on top of this, if we can go even more intense and further split up those three encounters into ten separate parallel API calls because each encounter has safe split points within them that are safeguarded by an encounter context handoff from pass 05, then all the better. And obviously at the end of all this parallel processing, everything will have to come back—all the data would have to come back together and be married up nicely; that goes without saying. 
- Just so you're aware and it's clear, pass one and pass two have to be sequential as pass two relies on pass one. Another thing that I want to say is if we can leave the door open to allow for raw image to be accompanying the OCR output, that would be good, because you never know what's around the corner and what will be needed; perhaps we do want to get the AI to be interpreting the image alongside or in place of the OCR data. 
- Since I'm spilling everything I can think of onto the page, I will also flag and mention the key feature of the app, which is the click-through-to-search functionality, which allows anyone using the dashboard of the health profile to click on a clinical entity of any kind and click through to view its original source, which is the original file, and also more in-depth than that—the original piece of text within that page within that file. This is for audit reasons, and also for great trust building and all that credibility. So for this feature to work, every clinical entity that comes out of pass two will need to have the complete link chain linkeding it to the page, encounter, shell file. But furthermore, my plan is to go even more specific any apply bbox coordinates to each clinicaly entity, meaning when you click through, you see: the shell file, the encounter, the page, the piece of origal text that led to the entity (which for UX shows up higlighted etc). My plan for how to go about this, although completely untested, is to have a post-pass2 processing function that uses grabs the original text and searches for it within the ocr spatial text data file, using the shell file and page number as the critical filters. once the bbox coordiantes for that piece of original text for that clinical entity are found, the bbox coordinates are inserted into the db, permanently acocompanying that clinical entity.  (oriignaly i wanted to just give the AI the enntire spatial+text ocr data, but i soon learnt this would overwhelm the system or explode costs)
- We willl need to do a complete audit of A) all schema tables that touch or are dependent downstream or upstream of pass 1, and B) all scripts that are in anyway relevant or linked to Pass 1. Then from this, we can start to see how this all fits into our strategy-a pass 1 design, and what can be kept vs changed vs deleted. And importantly, what needs to be added, as we have had many learnings with the last month of building out pass0.5. 
- And for pass 2, once we get to that, pass 2s role is to ensure that every healthcare related entity (wehther that be healthcare context, such as a future appointment or the name of a doctor that provided the healthcare), is extracted along with every piece of relevant information that exists on the page for that clinical entity. The breadth of knoeldge required to do this accurately for all possible types of healthcare clincial entities is complex and broad, and hence pass 2 will be provided with bridge schemas that spcifically tell it what to extract (if available) and how to output it correctly to align with the database. 
- Similarly to pass 1, Pass 2 will also fall victim to pass05 beign designed and built after pass 2. Hence many of the same issues and re-designs for pass 1 will likely be needed for pass 2. However, for pass 2, only the bridge schema files and db tables were built. No other scripts of worker functions have been built yet. And once again, pass05 may also have taken some of the tasks and roles that was previously designed to be performed by pass 2,, but im not entirely sure what they are yet, but it is worth noting that pass 2 bridge scehmas and pass 2 tables will at least need significant revisiting and reviewing and likely updating. 



claude code sonnet4.5's response - 24th Nov 2025:

I've read your thoughts. Let me organize this into a structured response:

  ---
  Xavier's Vision for Pass 1 Strategy-A: Organized Analysis

  1. CORE ARCHITECTURAL SHIFT: OCR-Only Model (Like Pass 0.5)

  Current State:
  - Pass 1 uses OCR text + raw image together
  - AI interprets both sources simultaneously
  - Original intention: Use OCR spatial data for bbox attribution
  - Problem discovered: Spatial data too dense → token explosion

  Proposed Change:
  - Transform Pass 1 to OCR-only (like Pass 0.5)
  - Remove raw image from AI interpretation
  - AI only sees OCR text (no visual analysis)

  Your Question: Can we make this transformation? What are the implications?

  My Analysis:
  ✅ Feasible - Pass 0.5 proves OCR-only works well for encounter discovery
  ⚠️ Trade-off - May lose visual context (tables, charts, layouts)
  ✅ Benefit - Massive token reduction, cost savings, faster processing
  🔍 Needs Investigation - What does Pass 1 currently extract that requires visual interpretation?

  ---
  2. IMPLEMENTATION STRATEGY: Fresh Start in "pass-1-strategy-a" Subfolder

  Your Proposal:
  - Create new subfolder: pass1/strategy-a/ or similar
  - Build fresh system from scratch (no contamination)
  - Cherry-pick from existing Pass 1 (systematic review → selective import)
  - Avoid editing old files (reduces errors)

  My Response:
  ✅ Strongly Agree - This aligns with what we did for Pass 0.5
  ✅ Best Practice - Clean slate reduces technical debt
  ✅ Process:
  1. Deep audit of existing Pass 1 (all code, scripts, tables)
  2. Document what works vs what's obsolete
  3. Design new Strategy-A architecture
  4. Build fresh in new subfolder
  5. Iteratively reference audit findings

  ---
  3. THREE-TIER CLASSIFICATION SYSTEM: Keep or Modify?

  Current Pass 1 System:
  - Tier 1: Document Structure (NOT passed to Pass 2)
  - Tier 2: Healthcare Context (passed to Pass 2)
  - Tier 3: Clinical Entities (passed to Pass 2)

  Your Question: Does Healthcare Context still need to exist now that Pass 0.5 handles encounters?

  Your Answer (mid-thought): YES, still needed
  - Example: 10-day hospital admission has sub-contexts
    - Imaging department visit
    - Radiographer name (who performed imaging)
    - Radiologist name (who reported)
    - These are NOT encounters, they're healthcare context within an encounter

  My Response:
  ✅ Keep the three-tier system - Healthcare context is distinct from encounter context
  - Pass 0.5 context: Macro (encounter boundaries, types, dates)
  - Pass 1 healthcare context: Micro (providers, departments, roles within encounters)
  - Pass 1 clinical entities: The actual clinical data

  Recommendation: Focus changes on entry point (OCR input), keep core logic intact

  ---
  4. ENCOUNTER CONTEXT HANDOFF: Pass 1 or Pass 2?

  Critical Decision: Should Pass 1 receive encounter context from Pass 0.5?

  Arguments FOR giving to Pass 1:
  - Helps entity classification accuracy
  - Provides temporal context (encounter date)
  - Helps distinguish multi-encounter documents

  Arguments FOR saving for Pass 2:
  - Pass 2 does deeper enrichment (needs it more)
  - Pass 1 is simpler, may not benefit much
  - Reduces Pass 1 token usage

  Your Question: Which approach? And if Pass 1 gets it, how do we ensure correct encounter context per batch?

  My Response:
  ✅ Give encounter context to BOTH Pass 1 and Pass 2

  Rationale:
  - Pass 1 Benefits: Entity classification improves with encounter type context
  - Pass 2 Benefits: Clinical enrichment requires encounter metadata
  - Implementation: Include encounter_id + encounter type in both API calls

  How to ensure correct context:
  - Use Pass 0.5 page-to-encounter mappings (pass05_page_assignments table)
  - Each Pass 1 batch includes only pages from single encounter
  - Batch boundaries respect encounter boundaries (don't split mid-encounter)
  - Exception: Use safe split points within large encounters

  ---
  5. BATCHING STRATEGY: Pages per API Call

  Current Status:
  - Pass 0.5: 50 pages per chunk (tested, operational)
  - Pass 1: Unknown (never stress-tested)

  Your Plan:
  - Use Pass 0.5 safe split points for batching
  - Small encounters (1-3 pages): Single API call, no batching needed
  - Large encounters: Apply safe split point batching with encounter context handoff

  My Response:
  ✅ Excellent strategy - Leverage Pass 0.5 infrastructure

  Proposed Batching Logic:
  1. Simple case: Encounter ≤10 pages → Single Pass 1 API call
  2. Complex case: Encounter >10 pages → Use safe split points
  3. Parallel processing: Split by safe split points → Run in parallel → Merge results

  Token limit consideration:
  - GPT-5 Mini context: 128K tokens
  - Estimated: ~500 tokens per page (OCR text)
  - Safe limit: 20-30 pages per API call (10-15k tokens input)
  - Pass 0.5 uses 50 pages (higher token density for encounter discovery)
  - Pass 1 may need smaller batches (more detailed entity extraction)

  Action: Benchmark Pass 1 token usage per page

  ---
  6. PARALLEL PROCESSING: Multi-Encounter + Safe Split Points

  Your Vision:
  - Level 1 parallelization: Multiple encounters in one document → Parallel API calls
    - Example: 3 encounters → 3 parallel Pass 1 calls
  - Level 2 parallelization: Large encounters with safe split points → Further parallel API calls
    - Example: 3 encounters, each split into 2-3 batches → 6-9 parallel calls
  - Result merging: All parallel results come back together and merge

  My Response:
  ✅ Ambitious but achievable - This is the right approach for UX

  Implementation Considerations:
  1. Job coordination: Use job_queue table with parent/child job relationships
  2. Merge logic: Each encounter's results merge first, then encounters merge at document level
  3. Transaction safety: Atomic writes after all parallel jobs complete
  4. Error handling: Partial failure strategy (some batches fail, others succeed)

  Caveat: Pass 1 → Pass 2 is sequential (Pass 2 needs Pass 1 complete first)

  ---
  7. RAW IMAGE FALLBACK: Keep the Door Open

  Your Request: Leave option for raw image + OCR (future flexibility)

  My Response:
  ✅ Good practice - Design for future extensibility

  Implementation:
  - Pass 1 Strategy-A: OCR-only by default
  - Optional parameter: includeRawImage: boolean
  - If true: Include base64 image in AI prompt (fallback mode)
  - Use cases: Complex tables, charts, diagrams (if OCR fails)

  Code structure:
  interface Pass1Input {
    ocrText: string;
    rawImage?: string; // Optional
    spatialData?: OCRSpatialData; // Optional (for future bbox)
  }

  ---
  8. CLICK-THROUGH-TO-SOURCE: Bbox Coordinate Attribution

  Feature Goal:
  User clicks clinical entity → See original file, page, highlighted text

  Your Plan:
  1. Post-Pass 2 processing function
  2. Grab original text from clinical entity
  3. Search OCR spatial text data (filtered by shell_file_id + page_number)
  4. Find bbox coordinates for that text
  5. Insert bbox coordinates into DB (permanent link)

  Why post-Pass 2 (not during):
  - Avoids overwhelming AI with dense spatial data
  - Avoids token explosion
  - Keeps Pass 2 focused on clinical extraction

  My Response:
  ✅ Smart approach - Decouple coordinate lookup from extraction

  Implementation Details:
  - New table: clinical_entity_coordinates (entity_id, bbox_coords, confidence)
  - New worker function: pass2.5-coordinate-mapper.ts (runs after Pass 2)
  - Fuzzy text matching: Handle OCR errors and text variations
  - Fallback: If exact match fails, return page-level location (no bbox)

  Challenges:
  - OCR text may not match extracted entity text exactly (typos, formatting)
  - Multiple matches possible (same text appears multiple times on page)
  - Need confidence scoring for bbox matches

  ---
  9. AUDIT REQUIREMENTS: Tables + Scripts

  Your Requirements:
  A) Audit all schema tables touching Pass 1 (upstream/downstream)
  B) Audit all scripts relevant to Pass 1

  My Response:
  ✅ Critical first step - Must happen in Phase 1

  Audit Scope:

  Tables (Pass 1 writes to):
  1. entity_processing_audit - Main entity records
  2. ai_processing_sessions - Session metadata
  3. ai_confidence_scoring - Confidence metrics
  4. manual_review_queue - Low confidence items
  5. profile_classification_audit - Patient identity
  6. pass1_entity_metrics - Processing metrics
  7. shell_files - Completion flags

  Tables (Pass 1 reads from):
  - shell_files - File metadata
  - healthcare_encounters - Encounter context (if we add this)
  - shell_file_manifests - Pass 0.5 manifest (if we add this)
  - pass05_page_assignments - Page-to-encounter mapping (if we add this)

  Scripts to Audit:
  - apps/render-worker/src/pass1/*.ts (all 8 files)
  - apps/render-worker/src/worker.ts (orchestration)
  - Any migration scripts creating Pass 1 tables
  - Any test scripts for Pass 1

  Output: Comprehensive audit report (what's kept, changed, deleted, added)

  ---
  10. PASS 2 IMPLICATIONS

  Your Note: Pass 2 also built before Pass 0.5 exists

  Status:
  - Bridge schemas exist (may need updates)
  - Database tables exist (may need updates)
  - NO worker code exists (clean slate)

  Tasks Pass 2 Must Do:
  - Extract ALL healthcare-related entities (clinical + context)
  - Extract ALL relevant information for each entity
  - Use bridge schemas to guide extraction
  - Output must align with database schema

  My Response:
  ✅ Pass 2 easier than Pass 1 - No existing worker code to refactor

  Pass 2 Strategy-A Considerations:
  - Same OCR-only approach as Pass 1
  - Same batching strategy (safe split points)
  - Same parallel processing (multi-encounter + batches)
  - Bridge schemas may need updates (encounter context fields)
  - Database tables may need new columns (encounter_id, bbox coordinates)

  ---
  CONSOLIDATED RECOMMENDATIONS

  Immediate Actions (Phase 1 Revision):

  1. Expand Phase 1 Scope:
  - ✅ Audit Pass 1 tables (upstream/downstream)
  - ✅ Audit Pass 1 scripts (all 8 files + orchestration)
  - ✅ Analyze OCR vs raw image usage in current Pass 1
  - ✅ Document three-tier classification system
  - ✅ Assess feasibility of OCR-only transformation
  - ✅ Design Pass 1 Strategy-A architecture

  2. Create Pass 1 Strategy-A Subfolder:
  pass-1-entity-detection/
  ├── README.md (update with Strategy-A reference)
  ├── strategy-a/ (NEW - fresh Pass 1 implementation)
  │   ├── 00-START-HERE.md
  │   ├── 01-ARCHITECTURE.md
  │   ├── 02-AUDIT-FINDINGS.md
  │   ├── 03-DESIGN-DECISIONS.md
  │   └── [strategy-a docs]
  ├── archive-pre-strategy-a/ (move existing docs here)
  │   ├── PASS-1-OVERVIEW.md
  │   ├── pass1-audits/
  │   ├── pass1-enhancements/
  │   └── [all existing docs]
  └── [keep top-level README as navigation]

  3. Key Design Decisions Needed:

  Decision A: OCR-only vs OCR+Image
  - Recommendation: OCR-only (with image fallback option)

  Decision B: Encounter context to Pass 1?
  - Recommendation: Yes (improves entity classification)

  Decision C: Batching strategy
  - Recommendation: 20-30 pages per batch (test and optimize)

  Decision D: Parallel processing
  - Recommendation: Yes (multi-encounter + safe split points)

  Decision E: Bbox coordinate attribution
  - Recommendation: Post-Pass 2 processing (separate function)

  ---
  Updated Phase 1 Plan:

  Phase 1 (REVISED): Pass 1 Strategy-A Architecture & Audit (3-5 days)

  Goal: Design Pass 1 Strategy-A architecture based on comprehensive audit of existing system.

  Tasks:
  1. Audit all 8 Pass 1 TypeScript files
  2. Audit 7 database tables (Pass 1 writes)
  3. Audit Pass 0.5 integration points
  4. Analyze OCR vs raw image usage
  5. Document three-tier classification system
  6. Assess OCR-only transformation feasibility
  7. Design Pass 1 Strategy-A architecture
  8. Create strategy-a subfolder structure
  9. Write architecture specification docs
  10. Get approval for Strategy-A design

  Deliverable: Pass 1 Strategy-A architecture specification + audit report

  ---
  MY QUESTIONS FOR YOU:

  1. OCR-only confirmation: Are you comfortable removing raw image from Pass 1 AI prompts? What if we
  encounter complex tables/charts that OCR misses?
  2. Batching limit: Should we start with 20 pages per batch and optimize later? Or do comprehensive
  benchmarking first?
  3. Parallel processing priority: Is this a Phase 1 requirement (architecture design) or Phase 5 enhancement
   (after basic Pass 1 Strategy-A works)?
  4. Pass 1 vs Pass 2 sequencing: Should we fully complete Pass 1 Strategy-A before touching Pass 2? Or
  design both architectures in parallel?
  5. Timeline impact: This expanded scope adds 2-4 days to Phase 1. Total timeline now 16-24 days.
  Acceptable?

  ---
  Ready to proceed with revised Phase 1?