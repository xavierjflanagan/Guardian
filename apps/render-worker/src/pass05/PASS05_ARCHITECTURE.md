# Pass 0.5 Architecture Documentation

**Last Updated:** 2025-11-06
**Current Production Version:** v2.9
**Status:** Operational

## Overview

Pass 0.5 (Healthcare Encounter Discovery) is the first AI processing stage in the Guardian document analysis pipeline. It analyzes uploaded medical documents to identify and classify discrete healthcare encounters, preparing them for downstream clinical extraction.

## Purpose

Pass 0.5 performs two critical functions:

1. **Encounter Discovery**: Identify ALL healthcare encounters in a document
2. **Encounter Classification**: Categorize encounters as real-world visits, planned appointments, or pseudo-encounters (administrative documents)

This enables:
- Multi-document handling (Frankenstein files with multiple encounters)
- Precise timeline placement for patient journey visualization
- Targeted downstream processing (Pass 1/2 can focus on specific encounter types)

## File Structure

```
apps/render-worker/src/pass05/
├── aiPrompts.ts                 # Default prompt (v2.4) - fallback version
├── aiPrompts.v2.7.ts            # Historical: Optimized version
├── aiPrompts.v2.8.ts            # Historical: Previous production
├── aiPrompts.v2.9.ts            # CURRENT PRODUCTION - Multi-day encounter support
├── databaseWriter.ts            # Atomic database writer (RPC transaction wrapper)
├── encounterDiscovery.ts        # Orchestrator - version selection, OpenAI calls
├── index.ts                     # Entry point - idempotency, flow control
├── manifestBuilder.ts           # AI response parser, validator, database pre-creation
├── types.ts                     # TypeScript interfaces and type definitions
└── prompt-versions-and-improvements/  # Documentation for all versions
```

## Core Components

### 1. Entry Point (`index.ts`)

**Purpose:** Main orchestration and entry point for Pass 0.5

**Responsibilities:**
- Idempotency check (avoids reprocessing)
- Calls encounter discovery
- Builds manifest
- Writes to database atomically
- Error handling and metrics

**Processing Flow:**
1. Check for existing manifest (early return if already processed)
2. Run encounter discovery (`discoverEncounters()`)
3. Build manifest with encounter metadata
4. Write manifest + metrics atomically (`writeManifestToDatabase()`)
5. Return result with success status

**Key Feature:** Safe idempotency - if manifest exists, all related data (metrics, shell_files flags) MUST also exist due to atomic transaction wrapper.

### 2. Encounter Discovery Orchestrator (`encounterDiscovery.ts`)

**Purpose:** Task 1 orchestration - extract encounters from OCR text

**Key Features:**
- **Version Selection:** Reads `PASS_05_VERSION` env var (v2.4/v2.7/v2.8/v2.9)
- **Strategy Selection:** Reads `PASS_05_STRATEGY` env var (ocr/ocr_optimized/vision)
- **Model Detection:** GPT-5 vs GPT-4o with different parameters
- **Cost Calculation:** GPT-5-mini pricing ($0.25/1M input, $2.00/1M output)

**Model Handling:**
- GPT-5: Uses `max_completion_tokens`, temperature fixed at 1.0
- GPT-4o: Uses `max_tokens`, temperature 0.1

**Returns:**
- `encounters`: Array of EncounterMetadata
- `page_assignments`: v2.3 page-by-page assignments with justifications
- `aiModel`, `aiCostUsd`, `inputTokens`, `outputTokens`: Metrics

### 3. Manifest Builder (`manifestBuilder.ts`)

**Purpose:** Parse AI response and enrich with spatial data

**Critical Functions:**

**`parseEncounterResponse()`** - Main parsing and validation
- Parses JSON from AI
- Validates page assignments (v2.3)
- Validates non-overlapping page ranges (Phase 1 constraint)
- Validates encounter types (TypeScript union safety)
- Implements two-branch date logic (v2.9):
  - **Branch A (Real-world)**: Direct AI date mapping
  - **Branch B (Pseudo)**: Date waterfall (ai_extracted → file_metadata → upload_date)
- Pre-creates encounters in database (UPSERT for idempotency)
- Extracts spatial bounds from OCR

**`validatePageAssignments()`** - v2.3 validation
- Ensures all pages assigned
- Checks encounter_id consistency
- Validates justifications present

**`validateNonOverlappingPageRanges()`** - Phase 1 constraint
- Each page belongs to exactly ONE encounter
- Throws error if overlap detected

**`validateEncounterType()`** - Type safety
- Validates against 17 valid EncounterType values
- Prevents invalid types from AI

**Key Fixes:**
- **FIX #3**: PageRanges normalization (sorts + fixes inverted ranges)
- **FIX #4**: Type safety for encounterType validation

### 4. Database Writer (`databaseWriter.ts`)

**Purpose:** Atomic database write via RPC transaction

**Key Features:**
- **FIX #1**: Transaction wrapper - all 3 writes in single atomic RPC call:
  1. shell_file_manifests (manifest data)
  2. pass05_metrics (AI metrics)
  3. shell_files.pass_05_completed flag
- **FIX #2**: Separate planned vs pseudo encounter counts
- Calls `write_pass05_manifest_atomic()` RPC function
- Computes metrics from encounters
- Tracks version via `PASS_05_VERSION` env var

**Why Atomic?** Prevents partial failures. If manifest exists, metrics and completion flags MUST also exist.

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

## Data Flow

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
│    - Idempotency check (existing manifest?)                     │
│    - If exists: return early (all data guaranteed to exist)     │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. encounterDiscovery.ts (Orchestrator)                         │
│    - Select prompt version (PASS_05_VERSION env var)            │
│    - Select strategy (PASS_05_STRATEGY env var)                 │
│    - Build prompt with OCR text                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. aiPrompts.v2.9.ts (Current Production Prompt)                │
│    - buildEncounterDiscoveryPromptV29()                         │
│    - Returns comprehensive prompt text                          │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. OpenAI GPT-5-mini API Call                                   │
│    - Model: gpt-5 (GPT-5-mini)                                  │
│    - Response format: JSON                                      │
│    - Max completion tokens: 32000                               │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. manifestBuilder.ts (Parser & Validator)                      │
│    - parseEncounterResponse()                                   │
│    - Validate page assignments (v2.3)                           │
│    - Validate non-overlapping page ranges (Phase 1)             │
│    - Validate encounter types (TypeScript union)                │
│    - Two-branch date logic (real-world vs pseudo)               │
│    - Pre-create encounters in database (UPSERT)                 │
│    - Extract spatial bounds from OCR                            │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. databaseWriter.ts (Atomic Writer)                            │
│    - Call write_pass05_manifest_atomic() RPC                    │
│    - Writes 3 tables atomically:                                │
│      1. shell_file_manifests (manifest data)                    │
│      2. pass05_metrics (AI metrics)                             │
│      3. shell_files.pass_05_completed flag                      │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Return Success                                              │
│     - manifest: ShellFileManifest                               │
│     - aiModel, aiCostUsd, processingTimeMs                      │
│     - encounters with UUIDs                                     │
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
- `OPENAI_API_KEY`: OpenAI API key (GPT-5 access)

**Optional:**
- `PASS_05_VERSION`: Prompt version (default: "v2.4", production: "v2.9")
  - Valid values: "v2.4", "v2.7", "v2.8", "v2.9"
- `PASS_05_STRATEGY`: Processing strategy (default: "ocr")
  - Valid values: "ocr", "ocr_optimized", "vision" (not yet implemented)

## Database Integration

### Tables Written

**shell_file_manifests:**
- `shell_file_id`: FK to shell_files
- `manifest_data`: Full manifest JSON (JSONB)
- `total_pages`, `total_encounters_found`, `ocr_average_confidence`
- `ai_model_used`, `ai_cost_usd`, `processing_time_ms`
- `pass_0_5_version`: Tracks prompt version used

**healthcare_encounters:**
- Created via UPSERT in `parseEncounterResponse()`
- `patient_id`, `encounter_type`, `is_real_world_visit`
- `encounter_start_date`, `encounter_date_end` (v2.9 - Migration 42)
- `encounter_timeframe_status` (v2.9)
- `date_source` (v2.9)
- `provider_name`, `facility_name`
- `primary_shell_file_id`, `page_ranges`, `spatial_bounds`
- `pass_0_5_confidence`, `summary`

**pass05_metrics:**
- `processing_session_id`: FK to ai_processing_sessions
- `shell_file_id`: FK to shell_files
- `encounters_detected`, `real_world_encounters`, `planned_encounters`, `pseudo_encounters`
- `input_tokens`, `output_tokens`, `ai_cost_usd`
- `encounter_confidence_average`, `encounter_types_found`

**shell_files:**
- `pass_05_completed`: Set to true (atomic with manifest write)

### RPC Functions

**write_pass05_manifest_atomic():**
- Transaction wrapper for atomic writes
- Writes manifest + metrics + shell_files flag
- All or nothing - prevents partial failures
- Parameters: manifest fields + metrics fields

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

Pass 0.5 is a production-ready, version-controlled AI system for healthcare encounter discovery. The current production version (v2.9) supports multi-day encounters, explicit completion tracking, and robust date provenance. The system is idempotent, atomic, and handles complex Frankenstein files with multiple encounters.

Key strengths:
- Version-controlled prompts (4 versions available)
- Comprehensive validation (page assignments, type safety, page ranges)
- Two-branch date logic (real-world vs pseudo)
- Atomic database writes (transaction wrapper)
- Cost-effective ($0.005-0.050 per file)
- Idempotent (safe retry)

Active files: 6 production, 3 historical
Total lines of code: ~2,600
Current model: GPT-5-mini
Database tables: 4 (shell_file_manifests, healthcare_encounters, pass05_metrics, shell_files)
