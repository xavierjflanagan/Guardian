# Pass 0.5 Architecture Documentation

**Last Updated:** 2025-11-20
**Current Production Version:** Strategy A v11
**Status:** Operational - Universal Progressive Mode
**Supersedes:** v2.9 single-shot processing

## Overview

Pass 0.5 (Healthcare Encounter Discovery) is the first AI processing stage in the Guardian document analysis pipeline. It analyzes uploaded medical documents to identify and classify discrete healthcare encounters, preparing them for downstream clinical extraction.

**Strategy A (v11):** ALL documents (1-1000+ pages) now use universal progressive processing with cascade-based encounter continuity. Legacy single-shot mode has been archived.

## Purpose

Pass 0.5 performs two critical functions:

1. **Encounter Discovery**: Identify ALL healthcare encounters in a document
2. **Encounter Classification**: Categorize encounters as real-world visits, planned appointments, or pseudo-encounters (administrative documents)

This enables:
- Multi-document handling (Frankenstein files with multiple encounters)
- Precise timeline placement for patient journey visualization
- Targeted downstream processing (Pass 1/2 can focus on specific encounter types)
- Scalable processing for documents of any size (1-1000+ pages)

## File Structure (as of November 20, 2024)

```
apps/render-worker/src/pass05/
├── CURRENT_VERSION              # v11 version indicator
├── PASS05_ARCHITECTURE.md       # This file
├── index.ts                     # Entry point - idempotency, flow control
├── encounterDiscovery.ts        # Simplified router to progressive mode
├── types.ts                     # TypeScript interfaces and type definitions
├── aiPrompts.v11.ts             # ONLY active prompt - Strategy A v11
│
├── _archive/                    # Legacy code (archived Nov 20, 2024)
│   ├── README.md                # Archive documentation
│   ├── legacy-prompts/          # v2.4, v2.7, v2.8, v2.9, v10
│   ├── legacy-standard-mode/    # manifestBuilder.ts
│   └── prompt-versions-and-improvements/  # Historical docs
│
├── progressive/                 # Active progressive pipeline
│   ├── session-manager.ts       # Session orchestration
│   ├── chunk-processor.ts       # 50-page chunk processing
│   ├── pending-reconciler.ts    # Post-chunk reconciliation
│   ├── database.ts              # Database operations
│   ├── handoff-builder.ts       # Inter-chunk continuity
│   ├── types.ts                 # Progressive mode types
│   ├── post-processor.ts        # Post-processing utilities
│   ├── cascade-manager.ts       # Cascade ID generation
│   ├── coordinate-extractor.ts  # OCR coordinate lookup
│   └── identifier-extractor.ts  # Medical identifier parsing
│
├── providers/                   # AI provider abstraction
│   ├── base-provider.ts         # Abstract base class
│   ├── google-provider.ts       # Google Gemini
│   ├── openai-provider.ts       # OpenAI GPT
│   └── provider-factory.ts      # Provider selection
│
└── models/                      # Model configuration
    ├── model-registry.ts        # Available models
    └── model-selector.ts        # Model selection logic
```

## Core Components (Strategy A v11)

### 1. Entry Point (`index.ts`)

**Purpose:** Main orchestration and entry point for Pass 0.5

**Responsibilities:**
- Idempotency check via shell_files table (avoids reprocessing)
- Calls encounter discovery (progressive mode)
- Creates AI processing session
- Writes metrics to pass05_encounter_metrics
- Writes page assignments to pass05_page_assignments
- Updates shell_files completion status
- Error handling and metrics

**Processing Flow:**
1. Check shell_files.pass_0_5_completed (early return if already processed)
2. Run encounter discovery (`discoverEncounters()`)
3. Create AI processing session (required for metrics FK)
4. Write encounter metrics
5. Write page assignments (if present)
6. Finalize shell_file status
7. Return result with success status

**Key Changes from Legacy:**
- No longer writes to shell_file_manifests (Migration 45 - manifest-free)
- Queries distributed data (healthcare_encounters + metrics) for idempotency response
- Direct database writes instead of atomic RPC wrapper

### 2. Encounter Discovery Router (`encounterDiscovery.ts`)

**Purpose:** Simplified entry point - routes ALL documents to progressive mode

**Key Changes from Legacy:**
- **Removed:** All version routing logic (v2.4, v2.7, v2.8, v2.9, v10)
- **Removed:** Environment variable checks (PASS_05_VERSION, PASS_05_STRATEGY)
- **Removed:** 100-page threshold logic
- **Removed:** Standard mode processing code
- **Simplified:** 238 lines → 76 lines

**Current Implementation:**
- Simply calls `processDocumentProgressively()` for ALL documents
- No conditional logic - single code path
- Returns empty encounters/page_assignments arrays (data written to DB by progressive pipeline)

**Returns:**
- `success`: Boolean
- `aiModel`, `aiCostUsd`, `inputTokens`, `outputTokens`: Metrics from progressive mode
- `encounters`: Empty array (query healthcare_encounters to retrieve)
- `page_assignments`: Empty array (query pass05_page_assignments to retrieve)

### 3. Progressive Mode Pipeline (`progressive/`)

#### session-manager.ts
**Purpose:** Session-level orchestration for progressive processing

**Key Functions:**
- `processDocumentProgressively()` - Main entry point
- Chunks documents into 50-page batches
- Manages session state across chunks
- Coordinates final reconciliation via pending-reconciler

#### chunk-processor.ts
**Purpose:** Process individual 50-page chunks with AI

**Key Functions:**
- `processChunk()` - Process single chunk with aiPrompts.v11
- Extracts encounters, identifiers, coordinates
- Handles cascade-based continuity
- Writes pending encounters to pass05_pending_encounters

**Dependencies:**
- cascade-manager.ts (cascade ID generation)
- coordinate-extractor.ts (OCR position lookup)
- identifier-extractor.ts (medical identifier parsing)
- handoff-builder.ts (inter-chunk continuity)

#### pending-reconciler.ts
**Purpose:** Reconcile all pending encounters after all chunks complete

**Key Functions:**
- `reconcilePendings()` - Consolidate cascade-linked encounters
- Groups by cascade_id to merge split encounters
- Migrates identifiers to encounter_identifiers table
- Calculates data quality tiers
- Writes final encounters to healthcare_encounters

#### database.ts
**Purpose:** Database operations for progressive mode

**Key Functions:**
- Batch inserts to pass05_pending_encounters
- Writes chunk results to pass05_chunk_results
- Session state management

### 4. Supporting Modules

#### cascade-manager.ts
**Purpose:** Generate deterministic cascade IDs for encounter continuity

**Key Functions:**
- Creates cascade_id based on encounter characteristics
- Links encounters across chunk boundaries
- Enables reconciliation grouping

#### coordinate-extractor.ts
**Purpose:** Extract OCR coordinates for intra-page boundaries

**Key Functions:**
- Looks up OCR coordinates for position markers
- Supports sub-page spatial granularity

#### identifier-extractor.ts
**Purpose:** Parse and extract medical identifiers

**Key Functions:**
- Extracts MRN, Medicare, insurance numbers
- Stores in pending_identifiers during chunk processing
- Migrated to encounter_identifiers during reconciliation

### 5. Type Definitions (`types.ts`)

**Key Types:**

**`ShellFileManifest`** - Top-level manifest
- `shellFileId`, `patientId`, `totalPages`
- `ocrAverageConfidence`
- `encounters`: Array of EncounterMetadata
- `page_assignments`: v2.3 page-by-page mappings (optional)
- `batching`: null (Phase 1)

**`PageAssignment`** - v2.3 addition
- `page`: Page number (1-indexed)
- `encounter_id`: Matches encounter in encounters array
- `justification`: Brief reasoning (15-20 words)

**`EncounterMetadata`** - Encounter details
- `encounterId`: UUID from database
- `encounterType`: One of 17 types
- `isRealWorldVisit`: true (real), false (planned/pseudo)
- `dateRange`: { start, end } (v2.9: updated for multi-day)
- `encounterTimeframeStatus`: completed/ongoing/unknown_end_date (v2.9)
- `dateSource`: ai_extracted/file_metadata/upload_date (v2.9)
- `provider`, `facility`: Optional strings
- `pageRanges`: [[start, end], ...] (normalized, sorted)
- `spatialBounds`: Bounding boxes from OCR
- `confidence`: AI confidence (0.0-1.0)
- `summary`: Plain English description (Migration 38)

**`EncounterType`** - Union of 17 types
- Real-world (6): inpatient, outpatient, emergency_department, specialist_consultation, gp_appointment, telehealth
- Planned (3): planned_specialist_consultation, planned_procedure, planned_gp_appointment
- Pseudo (7): pseudo_medication_list, pseudo_insurance, pseudo_admin_summary, pseudo_lab_report, pseudo_imaging_report, pseudo_referral_letter, pseudo_unverified_visit

## Prompt Versions

### Version History

| Version | Status | Date | Key Changes | Lines |
|---------|--------|------|-------------|-------|
| **v2.9** | **CURRENT PRODUCTION** | 2025-11-06 | Multi-day encounters, timeframe status, date source tracking (Migration 42) | 569 |
| v2.8 | Previous Production | 2025-11-05 | Boundary detection fixes, citation requirement, verification step | 434 |
| v2.7 | Historical | 2025-11-05 | Phase 1 optimization (~47% token reduction) | 368 |
| v2.4 | Default Fallback | 2025-11-04 | Lab report date extraction fix, page-by-page assignment | 698 |

### Version Comparison

| Feature | v2.4 | v2.7 | v2.8 | v2.9 |
|---------|------|------|------|------|
| Page-by-page assignment | ✅ | ✅ | ✅ | ✅ |
| Boundary detection priority | ✅ | ❌ | ✅ | ✅ |
| Citation requirement | ❌ | ❌ | ✅ | ✅ |
| Boundary verification step | ❌ | ❌ | ✅ | ✅ |
| Multi-day encounters | ❌ | ❌ | ❌ | ✅ |
| Timeframe status tracking | ❌ | ❌ | ❌ | ✅ |
| Date source tracking | ❌ | ❌ | ❌ | ✅ |
| Two-branch date logic | ❌ | ❌ | ❌ | ✅ |
| Token count | High | Low | Medium | Medium |

### v2.9 (Current Production)

**File:** `aiPrompts.v2.9.ts`
**Function:** `buildEncounterDiscoveryPromptV29()`

**Key Features:**
1. **Multi-day Hospital Admissions:** Supports admission + discharge dates
2. **Encounter Timeframe Status:** completed/ongoing/unknown_end_date
3. **Date Source Tracking:** ai_extracted/file_metadata/upload_date
4. **Single-day Encounters:** Explicit end dates (start = end)
5. **Two-branch Date Logic:**
   - Branch A: Real-world encounters → Direct AI mapping
   - Branch B: Pseudo encounters → Date waterfall fallback

**Database Requirements:** Migration 42 must be executed first

**New Fields in v2.9:**
- `encounterTimeframeStatus`: Explicit completion tracking
- `dateSource`: Date provenance tracking

**Example (Multi-day admission):**
```json
{
  "encounterType": "inpatient",
  "dateRange": {
    "start": "2025-06-15",
    "end": "2025-06-18"
  },
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted"
}
```

### v2.8 (Previous Production)

**File:** `aiPrompts.v2.8.ts`
**Function:** `buildEncounterDiscoveryPromptV28()`

**Key Features:**
1. **Boundary Detection Priority List:** Restored from v2.7 regression
2. **Boundary Verification Step:** Final check before submission
3. **Citation Requirement:** Justifications must cite exact phrases from specific pages
4. **Page Markers:** "--- PAGE N START ---" for tracking
5. **Document Header vs Metadata Distinction:** Critical for Frankenstein files

**Why v2.8 was needed:** v2.7 optimization removed critical boundary detection guidance, causing regression in multi-encounter files.

### v2.7 (Historical)

**File:** `aiPrompts.v2.7.ts`
**Function:** `buildEncounterDiscoveryPromptV27()`

**Key Features:**
1. **Phase 1 Optimization:** ~47% token reduction
2. **Linear Flow:** Removed nested sections
3. **Consolidated Validation:** Simplified rules
4. **Schema Alignment:** Field names match TypeScript interfaces

**Regression:** Removed boundary detection priority list, causing issues with Frankenstein files (fixed in v2.8).

### v2.4 (Default Fallback)

**File:** `aiPrompts.ts`
**Function:** `buildEncounterDiscoveryPrompt()`

**Key Features:**
1. **Page-by-page Assignment:** v2.3 feature (15-20 word justifications)
2. **Lab Report Date Extraction:** Migration 38 follow-up fix
3. **Timeline Test Principle:** date + provider/facility = timeline-worthy
4. **Comprehensive Documentation:** Detailed scenarios and examples

**Usage:** Default if `PASS_05_VERSION` not set

## Data Flow (Strategy A v11)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User uploads PDF via web frontend                            │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. shell-file-processor-v3 Edge Function                        │
│    - Creates shell_file record                                  │
│    - Enqueues job to job_queue                                  │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Render.com Worker claims job                                 │
│    - Runs Pass 0.5 (this module)                                │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. index.ts (Pass 0.5 Entry Point)                              │
│    - Idempotency check (shell_files.pass_0_5_completed?)        │
│    - If exists: query healthcare_encounters + metrics, return   │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. encounterDiscovery.ts (Simplified Router)                    │
│    - Calls processDocumentProgressively() for ALL documents     │
│    - No version/strategy selection (single code path)           │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. session-manager.ts (Progressive Orchestration)               │
│    - Splits document into 50-page chunks                        │
│    - Processes each chunk sequentially                          │
│    - Manages inter-chunk handoff data                           │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. chunk-processor.ts (Per-Chunk Processing)                    │
│    FOR EACH 50-PAGE CHUNK:                                      │
│    - Build prompt with aiPrompts.v11                            │
│    - Call OpenAI GPT API                                        │
│    - Parse AI response                                          │
│    - Generate cascade IDs (cascade-manager)                     │
│    - Extract identifiers (identifier-extractor)                 │
│    - Extract coordinates (coordinate-extractor)                 │
│    - Write to pass05_pending_encounters (database.ts)           │
│    - Build handoff for next chunk (handoff-builder)             │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. pending-reconciler.ts (Post-Chunk Reconciliation)            │
│    AFTER ALL CHUNKS COMPLETE:                                   │
│    - Group pendings by cascade_id                               │
│    - Merge split encounters across chunk boundaries             │
│    - Calculate data quality tiers                               │
│    - Migrate identifiers to encounter_identifiers               │
│    - Write final encounters to healthcare_encounters            │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. index.ts (Finalization)                                      │
│    - Create AI processing session                               │
│    - Write pass05_encounter_metrics                             │
│    - Write pass05_page_assignments (if present)                 │
│    - Update shell_files completion status                       │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Return Success                                              │
│     - success: true                                             │
│     - aiModel, aiCostUsd, inputTokens, outputTokens             │
│     - encounters: [] (query healthcare_encounters)              │
│     - page_assignments: [] (query pass05_page_assignments)      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Timeline Test

**Definition:** A healthcare encounter is timeline-worthy when it has BOTH:
1. **Specific Date:** YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility:** Named healthcare provider OR specific facility

**Timeline-Worthy Examples:**
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility)
- "GP visit with Dr. Jones on 2024-01-15" (date + provider)
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" (date + facility)

**Not Timeline-Worthy (Pseudo-Encounters):**
- Medication lists without visit dates
- Lab reports without collection dates
- Administrative summaries
- Insurance forms

### Frankenstein Files

**Definition:** PDFs containing multiple distinct encounters from different dates/providers.

**Example:** 12-page specialist consultation + 8-page emergency department visit in same PDF

**Challenge:** AI must detect boundaries between encounters using:
- Headers: "Encounter Summary", "Visit Note", "Discharge Summary"
- Provider/facility changes
- Date discontinuities

**v2.8+ Solution:** Boundary detection priority list + verification step

### Two-Branch Date Logic (v2.9)

**Branch A: Real-World Encounters**
- Direct AI date mapping
- `dateSource = "ai_extracted"`
- Date MUST be present (by Timeline Test definition)

**Branch B: Pseudo Encounters**
- Date waterfall fallback:
  1. AI extracted date (e.g., lab collection date) → `dateSource = "ai_extracted"`
  2. File creation metadata → `dateSource = "file_metadata"`
  3. Upload timestamp → `dateSource = "upload_date"`
- Pseudo encounters: start = end (completed observation)
- `encounterTimeframeStatus = "completed"`

### Encounter Timeframe Status (v2.9)

**completed:** Encounter has ended
- Single-day visits (GP, specialist, same-day ER)
- Multi-day with discharge date (hospital admission + discharge)
- Pseudo encounters (always completed)

**ongoing:** Currently admitted/ongoing care
- Hospital stay without discharge date
- Progress notes during active admission

**unknown_end_date:** Start date found but unclear if completed or ongoing
- Document doesn't explicitly indicate status

### Page-by-Page Assignment (v2.3)

**Purpose:** Force AI to consciously evaluate each page assignment

**Format:**
```json
"page_assignments": [
  {
    "page": 1,
    "encounter_id": "enc-1",
    "justification": "Continuation of discharge summary, same provider and facility"
  },
  {
    "page": 14,
    "encounter_id": "enc-2",
    "justification": "NEW Encounter Summary header, different provider and facility"
  }
]
```

**Benefits:**
- Exposes AI reasoning at boundaries
- Prevents errors from ignoring boundary signals
- Helps debug encounter detection issues

## Environment Variables

**Required:**
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (full access)
- `OPENAI_API_KEY`: OpenAI API key for GPT API access

**Removed (Strategy A v11):**
- `PASS_05_VERSION`: No longer used (single v11 prompt)
- `PASS_05_STRATEGY`: No longer used (progressive mode only)

## Database Integration (Strategy A v11)

### Tables Written

**pass05_pending_encounters:** (Intermediate storage during chunk processing)
- Written by chunk-processor.ts for each chunk
- `session_id`: Links to processing session
- `chunk_number`: Which chunk created this pending
- `cascade_id`: Deterministic ID for encounter continuity
- All encounter fields (type, dates, provider, facility, etc.)
- Reconciled after all chunks via pending-reconciler.ts

**healthcare_encounters:** (Final encounter storage)
- Written by pending-reconciler.ts after reconciliation
- `patient_id`, `encounter_type`, `is_real_world_visit`
- `encounter_start_date`, `encounter_end_date`
- `encounter_timeframe_status` (completed/ongoing/unknown_end_date)
- `date_source` (ai_extracted/file_metadata/upload_date)
- `provider_name`, `facility_name`
- `source_shell_file_id`, `page_ranges`, `spatial_bounds`
- `pass_0_5_confidence`, `summary`
- `data_quality_tier` (low/medium/high/verified)
- Identity fields: `patient_full_name`, `patient_date_of_birth`, etc.

**pass05_encounter_metrics:**
- Written by index.ts after processing completes
- `processing_session_id`: FK to ai_processing_sessions
- `shell_file_id`: FK to shell_files
- `patient_id`: FK to user_profiles
- `encounters_detected`, `real_world_encounters`, `planned_encounters`, `pseudo_encounters`
- `input_tokens`, `output_tokens`, `total_tokens`, `ai_cost_usd`
- `encounter_confidence_average`, `encounter_types_found`
- `processing_time_ms`, `ai_model_used`

**pass05_page_assignments:** (Optional per-page mappings)
- Written by index.ts if AI returns page_assignments
- `shell_file_id`: FK to shell_files
- `page_num`: Page number (1-indexed)
- `encounter_id`: FK to healthcare_encounters
- `justification`: Brief reasoning (15-20 words)

**shell_files:** (Completion tracking)
- `pass_0_5_completed`: Boolean flag
- `pass_0_5_completed_at`: Timestamp
- `pass_0_5_version`: "v11" (Strategy A)
- `pass_0_5_progressive`: true (always progressive mode)

**Supporting Tables:**
- `pass05_chunk_results`: Chunk-level processing results
- `pass05_sessions`: Progressive session state
- `encounter_identifiers`: Medical identifiers (MRN, Medicare, etc.)
- `pending_identifiers`: Identifiers during chunk processing
- `cascade_chains`: Cascade ID tracking

### RPC Functions

**No longer used:**
- `write_pass05_manifest_atomic()`: Removed in Migration 45 (manifest-free architecture)

## Cost Analysis

**Model:** GPT-5-mini
**Pricing (as of Oct 2025):**
- Input: $0.25 per 1M tokens
- Output: $2.00 per 1M tokens

**Typical Costs:**
- 10-page document: ~$0.005-0.015 per file
- 50-page document: ~$0.020-0.050 per file
- 100-page document: ~$0.040-0.100 per file

**Cost Reduction from Pass 1:** ~85-90% (compared to AWS Textract + GPT-4o Vision)

## Error Handling

**Idempotency:**
- Check for existing manifest at start
- UPSERT encounters (safe retry)
- Atomic transaction wrapper (all or nothing)

**Validation:**
- Page assignment validation (v2.3)
- Non-overlapping page range check (Phase 1)
- Encounter type validation (TypeScript union)
- PageRanges normalization (fix inverted ranges)

**Failure Modes:**
- Empty AI response → Error returned
- Invalid JSON → Parse error
- Invalid encounter type → Validation error
- Overlapping page ranges → Validation error
- Database write failure → Transaction rollback

## Testing

**Test Files:** See `pass05-hypothesis-tests-results/` for detailed test results

**Key Tests:**
- Test 06: Frankenstein file (12-page specialist + 8-page ED)
- Test 07: Multi-day hospital admission (admission + discharge dates)
- Test 08: Pseudo encounter with date waterfall fallback

**Validation Queries:** See `production/v2.9-current/VALIDATION_REPORT.md`

## Future Enhancements

**Phase 2 (Planned):**
- Batching detection (Task 2)
- Vision strategy implementation (raw images, no OCR)
- Pre-batching for 100+ page files (GPT-5 token limit)
- Sub-page spatial regions (content density analysis)

**Potential Optimizations:**
- Prompt compression (further token reduction)
- Parallel processing (multiple documents)
- Caching (repeated file processing)

## Related Documentation

**Prompt Documentation:**
- `prompt-versions-and-improvements/README.md` - Version directory structure
- `prompt-versions-and-improvements/production/v2.9-current/SPECIFICATION.md` - v2.9 design
- `prompt-versions-and-improvements/production/v2.9-current/VALIDATION_REPORT.md` - Test results

**Database Documentation:**
- `shared/docs/architecture/database-foundation-v3/migration_history/2025-11-06_42_healthcare_encounters_timeframe_redesign.sql` - Migration 42

**Worker Documentation:**
- `shared/docs/architecture/database-foundation-v3/current_workers/WORKER_ARCHITECTURE.md` - Worker overview

## Summary

Pass 0.5 is a production-ready, scalable AI system for healthcare encounter discovery. **Strategy A (v11)** uses universal progressive processing for ALL documents (1-1000+ pages) with cascade-based encounter continuity. Legacy single-shot and conditional routing have been archived.

**Key Architecture Principles:**
- **Single Code Path:** ALL documents use progressive mode (no thresholds)
- **Cascade-Based Continuity:** Deterministic cascade IDs link encounters across chunk boundaries
- **Pending-then-Reconcile:** Chunks write to pending table, reconciliation merges at end
- **Scalable:** Handles any document size (tested to 1000+ pages)
- **Idempotent:** Safe retry via shell_files.pass_0_5_completed check

**Key Features:**
- 50-page chunk processing with inter-chunk handoff
- Multi-day encounter support (admission + discharge dates)
- Medical identifier extraction (MRN, Medicare, insurance)
- Data quality tiers (low/medium/high/verified)
- Patient identity extraction (name, DOB, address, phone)
- Sub-page position granularity (13 position fields)
- Comprehensive validation (page assignments, type safety, page ranges)

**Current State (November 20, 2024):**
- Active prompt: aiPrompts.v11.ts (ONLY prompt)
- Active files: 23 total (10 progressive pipeline, 4 providers, 2 models, 7 core)
- Archived files: 10 legacy prompts + manifestBuilder.ts + documentation
- Total lines of code: ~4,500 (progressive pipeline adds complexity)
- Current model: OpenAI GPT (configurable via model-selector)
- Database tables: 9+ (pending encounters, final encounters, metrics, identifiers, sessions, etc.)
- Cost: $0.005-0.050 per file (similar to legacy, but scales to any size)
