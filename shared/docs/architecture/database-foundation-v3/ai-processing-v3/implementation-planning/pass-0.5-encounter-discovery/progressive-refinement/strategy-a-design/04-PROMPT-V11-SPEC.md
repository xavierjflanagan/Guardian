# Pass 0.5 Strategy A - V11 Prompt Specification

**Date:** November 14, 2024 (Updated: November 19, 2025)
**Version:** 2.0 (MAJOR UPDATE)
**Purpose:** Define the V11 unified progressive prompt for Strategy A

**UPDATE (Nov 19, 2025) - BREAKING CHANGES:**
- **Added Identity Extraction**: 4 patient demographic fields (name, DOB, address, phone)
- **Added Medical Identifier Extraction**: MRN, Medicare, insurance IDs with validation
- **Updated Cascade Package Structure**: Changed to `cascade_contexts` array (snake_case for AI JSON)
- **Added Source Metadata**: `encounter_source` and `created_by_user_id` fields
- **Added Profile Classification Fields**: System-populated fields explained (not AI-generated)
- **Added Data Quality Tier**: System-calculated quality scoring explained
- **Updated Page Separation Analysis**: Simplified structure, renamed fields
- **Documented Cascade ID Format**: Deterministic generation algorithm
- **Total New Fields**: 20+ fields added to match Nov 18-19, 2025 implementation

**NAMING CONVENTION:**
- **AI JSON Output**: Use snake_case (`cascade_contexts`, `medical_identifiers`, `page_number`)
- **TypeScript Code**: Worker normalizes to camelCase (`cascadeContexts`, `medicalIdentifiers`, `pageNumber`)
- This spec documents AI JSON output format (snake_case)

**PREVIOUS UPDATE (Nov 15, 2024):** Position tracking updated to match batching design (inter_page/intra_page), added batching analysis output, added pseudo-encounter detection (Timeline Test from v2.9), added OCR integration.

## Executive Summary

V11 is the evolution of V10 designed specifically for Strategy A's simplified architecture. Key features:

**Core Encounter Detection:**
- Every encounter gets cascade_id detection logic
- Simplified handoff to just cascade context (via `cascade_contexts` array)
- Position tracking with inter_page vs intra_page boundaries (matches batching design)
- Batching analysis output for downstream Pass 1/2 splitting
- Pseudo-encounter detection using Timeline Test (from v2.9)
- OCR bounding box integration for precise Y-coordinates
- Clear instructions: AI never generates IDs

**NEW in V2.0 (Nov 19, 2025):**
- **Identity Extraction**: 4 patient demographic fields for profile matching
- **Medical Identifier Extraction**: MRN, Medicare, insurance IDs with organizational context
- **Enhanced Cascade Context**: 6-field structure with pending linking
- **Source Tracking**: Distinguish shell_file vs manual vs API encounters
- **Profile Classification Support**: Extract data for downstream matching (AI doesn't match, system does)
- **Data Quality Support**: Extract complete data for quality tier calculation (AI doesn't calculate, system does)

## Core Design Principles

1. **Universal Application**: Same prompt for 1-page to 1000-page documents
2. **Cascade Awareness**: Built-in logic for detecting cascading encounters
3. **Position Granularity**: Sub-page precision for encounter boundaries
4. **ID Agnostic**: AI describes encounters, system generates IDs
5. **Minimal Handoff**: Only cascade_id and semantic context passed

## Major Changes from V10

### 1. Removed Fields
- `tempId` - System generates, not AI
- `encounterId` - System generates, not AI
- Complex `status` field logic - Replaced with simpler `is_cascading` boolean

### 2. New Fields
```json
{
  "is_cascading": true,  // Does this touch chunk boundary?
  "continues_previous": false,  // Does this continue from previous chunk's cascade?
  "cascade_context": "admission continuing from previous",

  // Position tracking (inter_page vs intra_page)
  "start_boundary_type": "inter_page",
  "start_marker": "page begins with 'ADMISSION NOTE'",
  "start_text_y_top": null,  // null for inter_page
  "start_text_height": null,
  "start_y": null,

  "end_boundary_type": "intra_page",
  "end_marker": "before header 'DISCHARGE SUMMARY'",
  "end_text_y_top": 2400,  // From OCR bbox
  "end_text_height": 24,
  "end_y": 2376,  // Calculated: 2400 - 24

  "position_confidence": 0.92,

  // Pseudo-encounter detection (Timeline Test)
  "is_real_world_visit": true  // Has date + provider/facility
}
```

### 3. Identity Extraction (NEW in V2.0)
```json
{
  // NEW: Patient demographic fields for profile matching
  "patient_full_name": "John Michael Smith",
  "patient_date_of_birth": "15/03/1985",
  "patient_address": "123 Main Street, Sydney NSW 2000",
  "patient_phone": "0412 345 678"
}
```

**Purpose**: These fields enable the system to match encounters to existing user profiles or detect orphan identities (patients not yet in the system).

**AI Responsibility**: Extract complete, accurate demographic data when present in documents.

**System Responsibility**: Use extracted data for profile matching, calculate match confidence, detect orphans (AI does NOT perform matching).

### 4. Medical Identifier Extraction (NEW in V2.0)
```json
{
  // NEW: Medical identifiers with organizational context
  "medical_identifiers": [
    {
      "identifier_type": "MRN",
      "identifier_value": "MRN123456",
      "issuing_organization": "St Vincent's Hospital",
      "detected_context": "Patient ID: MRN123456 (St Vincent's)"
    },
    {
      "identifier_type": "Medicare",
      "identifier_value": "2950123456",
      "issuing_organization": "Services Australia",
      "detected_context": "Medicare Card: 2950 1234 5678 9 (1)"
    }
  ]
}
```

**Purpose**: Medical identifiers (MRN, Medicare, insurance) are crucial for profile matching and duplicate detection.

**AI Responsibility**: Extract identifiers with their organizational context.

**System Responsibility**: Validate formats, normalize values, use for profile matching (AI does NOT validate or normalize).

### 5. Updated Cascade Package Structure (BREAKING CHANGE in V2.0)

**V10/V11.0 Handoff (OLD - DEPRECATED):**
```json
{
  "cascade_context": {
    "encounter_type": "hospital_admission",
    "summary": "STEMI patient in cardiac ICU",
    "expecting": "discharge_summary"
  }
}
```

**V11.2 Handoff (NEW - REQUIRED):**
```json
{
  "cascade_contexts": [  // ← AI outputs snake_case (worker normalizes to camelCase)
    {
      // NOTE: cascade_id and pending_id shown here are SYSTEM-GENERATED
      // AI does NOT output these fields - they are added by the worker
      // This example shows the FINAL shape after system processing

      "encounter_type": "hospital_admission",     // AI outputs this
      "partial_summary": "STEMI patient, PCI completed, stable in CCU",  // AI outputs this
      "expected_in_next_chunk": "discharge_summary",  // AI outputs this
      "ai_context": "Patient stable, awaiting discharge planning"  // AI outputs this
    }
  ]
}
```

**AI Output vs System-Generated Fields:**
- **AI outputs**: `encounter_type`, `partial_summary`, `expected_in_next_chunk`, `ai_context`
- **System adds later**: `cascade_id` (deterministic ID), `pending_id` (links to pending encounter)

**Why the Change?**
- Multiple encounters can cascade simultaneously (array handles this)
- `cascade_id` and `pending_id` added by system to link contexts to specific encounters
- `ai_context` provides richer continuity hints
- Clearer field names (`partial_summary`, `expected_in_next_chunk`)

### 6. Source Metadata (NEW in V2.0)
```json
{
  // NEW: Track encounter source
  "encounter_source": "shell_file",  // or "manual" or "api"
  "created_by_user_id": null  // null for shell_file, user_id for manual entry
}
```

**Purpose**: Distinguish uploaded documents from manual entry or API-sourced encounters.

**AI Responsibility**: For shell_file processing, these are always `"shell_file"` and `null` (system sets these).

**System Responsibility**: Set correctly based on entry method.

## V11 Prompt Structure

### 1. Opening Context
```
You are a medical data extraction specialist analyzing healthcare documents.
This document has been split into {totalChunks} chunks of approximately 50 pages each.
You are processing chunk {chunkNumber} containing pages {startPage} to {endPage}.
```

### 2. Core Task Definition
```
# ENCOUNTER DISCOVERY WITH CASCADE DETECTION

Extract ALL healthcare encounters from this chunk. An encounter is any
documented interaction between a patient and healthcare provider(s).

CRITICAL: You are part of a cascade detection system. If an encounter's
documentation appears to continue beyond this chunk's last page, mark it
as cascading. The system will link it with its continuation in the next chunk.
```

### 3. Cascade Detection Rules
```
## WHEN TO MARK AS CASCADING (is_cascading: true)

An encounter is cascading if ANY of these conditions are met:

1. **Page Boundary Test**: The encounter's last page equals this chunk's last page
   AND the encounter appears incomplete (no discharge summary, no final notes)

2. **Content Incompleteness**: Clear indicators of more content:
   - Hospital admission without discharge documentation
   - Surgery without post-operative notes
   - Emergency visit without disposition
   - Multi-day stay where we haven't reached the end date

3. **Explicit Continuation**: Document says "continued on next page" or similar

4. **Sub-page Position**: Encounter ends in bottom three-quarters of last page
   (High probability it continues on next page)

IMPORTANT: Having an end date does NOT mean the encounter won't cascade.
A 2022 admission with 142 pages of documentation will cascade across chunks
even though the real-world encounter has ended.
```

### 4. Position Tracking Instructions (Inter-Page vs Intra-Page)
```
## POSITION TRACKING (MATCHES BATCHING DESIGN)

For each encounter, identify boundary types and precise coordinates:

### Boundary Types

**Inter-Page Boundaries:** Encounter starts at page top or ends at page bottom
- No pixel coordinates needed
- Highest confidence (page boundaries are always clean)
- Most common case
- Example: Hospital admission starts on page 1 (top) and ends on page 50 (bottom)

**Intra-Page Boundaries:** Encounter starts/ends mid-page
- Requires precise Y-coordinates from OCR data
- Include descriptive marker text
- Less common but critical for accuracy
- Example: Consultation ends mid-page, next encounter begins below

### Output Format

**For Inter-Page Start:**
{
  "start_boundary_type": "inter_page",
  "start_marker": "page begins with 'ADMISSION NOTE' header",
  "start_text_y_top": null,
  "start_text_height": null,
  "start_y": null
}

**For Intra-Page End:**
{
  "end_boundary_type": "intra_page",
  "end_marker": "before header 'DISCHARGE SUMMARY'",
  "end_text_y_top": 2400,  // From OCR bbox
  "end_text_height": 24,   // From OCR bbox
  "end_y": 2376           // Calculated: 2400 - 24
}

### OCR Coordinate Extraction

Use the provided OCR bounding box data to extract coordinates:
1. Locate the marker text in OCR data for the page
2. Extract bbox.y (top coordinate) as text_y_top
3. Extract bbox.height as text_height
4. Calculate split line based on marker direction:
   - "before" markers: split_y = text_y_top (split ABOVE text)
   - "after" markers: split_y = text_y_top + text_height (split BELOW text)
5. Store coordinates: { y: text_y_top, height: text_height } for intra_page splits

### Position Confidence Scoring

- Inter-page boundaries: 1.0 (always reliable)
- Intra-page with clear marker + OCR coords: 0.9-1.0
- Intra-page estimated (no clear marker): 0.6-0.8
- Unclear boundaries: <0.6

Why this matters:
- Enables precise visual highlighting in UI
- Supports page cropping for encounter-specific PDFs
- Allows validation of AI-identified boundaries
```

### 5. Handoff Context Handling (V2.0 - Updated)
```
## CASCADE CONTEXTS FROM PREVIOUS CHUNK

{if cascade_contexts array provided}
You received cascade contexts indicating encounters that continue from the previous chunk.

For each cascade context in the array:
{
  "encounter_type": "{encounter_type}",
  "partial_summary": "{what we know so far}",
  "expected_in_next_chunk": "{what to look for}",
  "ai_context": "{additional continuity information}"
}

Instructions for each cascading encounter:
1. Look for the continuation based on encounter_type and expected_in_next_chunk
2. When found, set continues_previous: true in your encounter object
3. Set cascade_context: "continues from previous chunk" (or more specific context)
4. Start your page_ranges from where you find it in this chunk
5. If it ends in this chunk, mark is_cascading: false
6. If it continues beyond this chunk, mark is_cascading: true and set expected_continuation

Note: You may receive MULTIPLE cascade contexts if multiple encounters were cascading.
Handle each independently.
```

### 6. Output Schema (V2.0 - Updated Nov 2025)
```json
{
  "encounters": [
    {
      // NO IDs - System generates these
      "encounter_type": "hospital_admission",
      "is_cascading": true,
      "cascade_context": "admission continuing to next chunk",
      "expected_continuation": "discharge_summary",  // NEW V2.0: What to expect in next chunk

      // Dates
      "encounter_start_date": "2024-03-15",
      "encounter_end_date": null,  // null if ongoing or unknown
      "date_source": "ai_extracted",  // Enum: 'ai_extracted' | 'file_metadata' | 'upload_date'

      // Position data (inter_page vs intra_page)
      // IMPORTANT: Pages are document-absolute (1-N), NOT chunk-relative
      "start_page": 1,
      "start_boundary_type": "inter_page",
      "start_marker": "page begins with 'EMERGENCY ADMISSION'",
      "start_text_y_top": null,
      "start_text_height": null,
      "start_y": null,

      "end_page": 50,
      "end_boundary_type": "intra_page",
      "end_marker": "before header 'CONTINUED NEXT PAGE'",
      "end_text_y_top": 2800,
      "end_text_height": 24,
      "end_y": 2776,

      "position_confidence": 0.95,
      "page_ranges": [[1, 50]],

      // Pseudo-encounter detection (Timeline Test)
      "is_real_world_visit": true,  // Has date + provider/facility

      // NEW V2.0: Identity Extraction (Section 3)
      "patient_full_name": "John Michael Smith",
      "patient_date_of_birth": "15/03/1985",
      "patient_address": "123 Main Street, Sydney NSW 2000",
      "patient_phone": "0412 345 678",

      // NEW V2.0: Medical Identifiers (Section 4)
      "medical_identifiers": [
        {
          "identifier_type": "MRN",
          "identifier_value": "MRN123456",
          "issuing_organization": "St Vincent's Hospital",
          "detected_context": "Patient ID: MRN123456"
        },
        {
          "identifier_type": "MEDICARE",
          "identifier_value": "1234 56789 0",
          "issuing_organization": "Medicare Australia",
          "detected_context": "Medicare Number: 1234 56789 0"
        }
      ],

      // NEW V2.0: Source Metadata (Section 6)
      // NOTE: encounter_source and created_by_user_id are SYSTEM-SET, not AI-extracted
      // AI does NOT populate these fields - they are documented here for completeness only
      // "encounter_source": "shell_file",  // System sets based on upload method
      // "created_by_user_id": "uuid",      // System sets from auth context

      // NEW V2.0: Profile Classification Fields (Section 8.1)
      // NOTE: These are SYSTEM-POPULATED after AI extraction, NOT set by AI
      // AI extracts identity data above, system performs matching
      // "matched_profile_id": "uuid",      // System sets via profile matching
      // "match_confidence": 0.95,          // System calculates match score
      // "match_status": "matched",         // System determines: matched/unmatched/orphan/review
      // "is_orphan_identity": false,       // System sets if no profile match

      // NEW V2.0: Data Quality Tier (Section 8.2)
      // NOTE: This is SYSTEM-CALCULATED based on A/B/C criteria, NOT set by AI
      // AI extracts complete data, system calculates quality tier
      // "data_quality_tier": "high",       // System calculates: low/medium/high/verified

      // Clinical content
      "provider_name": "Dr. Smith",
      "facility_name": "St Vincent's Hospital",  // Note: facility_name (matches database column)
      "department": "Cardiac ICU",
      "chief_complaint": "Chest pain",
      "diagnoses": ["STEMI"],
      "procedures": ["PCI with stent"],
      "provider_role": "Cardiologist",  // Provider's specialty/role
      "disposition": "Admitted to CCU",  // Patient disposition
      "summary": "STEMI patient admitted for cardiac intervention",

      // Confidence
      "confidence": 0.95
    }
  ],
  "page_assignments": [
    {
      "page": 1,
      "encounter_index": 0,  // Index in encounters array
      "justification": "Contains 'ADMISSION NOTE' and date '15/03/2024'"
    }
  ],

  // NEW V2.0: Updated Cascade Package Structure (Section 5 - BREAKING CHANGE)
  // Old v2.9: Single object { encounter_type, summary, expecting }
  // New V2.0: Array of cascade contexts (supports multiple cascading encounters)
  "cascade_contexts": [
    {
      // NOTE: cascade_id and pending_id are SYSTEM-GENERATED, not AI-extracted
      // AI provides the context below, system generates IDs during processing
      "encounter_type": "hospital_admission",
      "partial_summary": "STEMI patient in cardiac ICU, PCI completed",
      "expected_in_next_chunk": "discharge_summary",
      "ai_context": "Patient stable post-PCI, awaiting discharge planning"
    }
  ]
}
```

### 7. Key Instruction Changes

#### ID Generation
```
CRITICAL: Do NOT generate any IDs. The system will:
- Generate deterministic encounter IDs
- Assign cascade IDs when needed
- Create temporary IDs for pending storage

You only describe what you see.
```

#### Page Assignments
```
Page assignments now use encounter_index instead of encounter_id:
- First encounter in array: encounter_index = 0
- Second encounter: encounter_index = 1
- This links pages to encounters without requiring IDs

IMPLEMENTATION NOTE (for worker code):
When persisting page assignments, the worker will:
1. Map encounter_index → system-generated pending_id
2. Store in pass05_page_assignments with encounter_id = pending_id
3. Leave encounter_id as temp ID until reconciliation
4. After reconciliation, update encounter_id → final healthcare_encounters.id
```

#### Cascade Package (V2.0 - BREAKING CHANGE)
```
V2.0 CHANGE: cascade_package is now cascade_contexts (array, not object)

Old v2.9 format (DEPRECATED):
{
  "cascade_package": {
    "encounter_type": "hospital_admission",
    "summary": "...",
    "expecting": "..."
  }
}

New V2.0 format (REQUIRED):
{
  "cascade_contexts": [
    {
      "encounter_type": "hospital_admission",
      "partial_summary": "...",           // RENAMED from "summary"
      "expected_in_next_chunk": "...",    // RENAMED from "expecting"
      "ai_context": "..."                 // NEW field for free-form context
    }
  ]
}

Key Changes:
- Now an ARRAY (supports multiple cascading encounters per chunk)
- Field renames for clarity: summary → partial_summary, expecting → expected_in_next_chunk
- New ai_context field for additional continuity information
- System will add cascade_id and pending_id (DO NOT generate these)

Only populate cascade_contexts if you have cascading encounters (is_cascading: true).
Keep it minimal - just enough context for the next chunk to recognize the continuation.

**IMPORTANT: Two Different Cascade Fields**

1. **Per-encounter `cascade_context` (string):**
   - Field on each encounter object
   - Describes this encounter's cascade state within the current chunk
   - Examples: "continues from previous chunk", "new admission starting in this chunk"

2. **Top-level `cascade_contexts` (array):**
   - Top-level field in output JSON (same level as encounters, page_assignments)
   - Array of cascade handoff objects for the NEXT chunk
   - Only populated if encounters in THIS chunk are cascading (is_cascading: true)
   - Worker uses per-encounter data to build this handoff array

These are related but distinct: encounter.cascade_context describes current state,
top-level cascade_contexts provides handoff data for next chunk.
```

### 8. Pseudo-Encounter Detection (Timeline Test)

```
## PSEUDO-ENCOUNTER DETECTION (FROM V2.9)

### Core Principle: Timeline Test

A healthcare encounter is **timeline-worthy** when it has BOTH:
1. **Specific Date**: YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility**: Named healthcare provider OR specific facility

**Timeline-Worthy (Real World Visits):**
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility) ✓
- "GP visit with Dr. Jones on 2024-01-15" (date + provider) ✓
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" (date + facility) ✓
- "Imaging study dated 15-Mar-2024 from City Radiology" (date + facility) ✓

**NOT Timeline-Worthy (Pseudo-Encounters):**
- Medication lists without visit dates ✗
- Lab reports without collection dates ✗
- Administrative summaries without specific encounter dates ✗
- Insurance forms ✗
- General health information summaries ✗

### Output Field

is_real_world_visit: true   // Passes Timeline Test (has date + provider/facility)
is_real_world_visit: false  // Fails Timeline Test (pseudo-encounter)

### Examples

**Real World Visit:**
{
  "encounter_type": "outpatient",
  "is_real_world_visit": true,
  "encounter_start_date": "2025-07-03",
  "provider_name": null,
  "facility": "NSW Health Pathology",
  "summary": "Pathology test collected 03-Jul-2025"
}

**Pseudo-Encounter:**
{
  "encounter_type": "medication_list",
  "is_real_world_visit": false,
  "encounter_start_date": null,
  "provider_name": null,
  "facility": "Sydney Hospital Pharmacy",
  "summary": "Pharmacy dispensing label for moxifloxacin 400 mg"
}

**CRITICAL:** Lab/imaging reports WITH specific collection/study dates + facility ARE timeline-worthy (real world visits).
```

### 8.1. Profile Classification Support (NEW in V2.0 - SYSTEM-SIDE)

```
## PROFILE CLASSIFICATION (SYSTEM-POPULATED, NOT AI)

**Important**: The AI does NOT perform profile matching. The system uses extracted identity data and medical identifiers to match encounters to user profiles after chunk processing.

### AI Responsibility: Extract Data

Extract these fields when present:
- `patient_full_name`: Full name as it appears
- `patient_date_of_birth`: DOB in any format found
- `patient_address`: Full address if present
- `patient_phone`: Phone number if present
- `medical_identifiers`: Array of MRN, Medicare, insurance IDs

### System Responsibility: Perform Matching

The system will:
1. Normalize extracted identities (format names, parse DOBs)
2. Query existing `user_profiles` for matches
3. Calculate match confidence based on field overlap
4. Detect orphan identities (3+ unmatched occurrences)
5. Populate these fields (AI does NOT set these):
   - `matched_profile_id`: UUID of matched profile or null
   - `match_confidence`: 0-1 confidence score
   - `match_status`: 'matched' | 'unmatched' | 'orphan' | 'review'
   - `is_orphan_identity`: Boolean flag for orphans

### AI Output (What You Provide)

{
  // Extract these when present
  "patient_full_name": "John Michael Smith",
  "patient_date_of_birth": "15/03/1985",
  "patient_address": "123 Main St, Sydney NSW 2000",
  "patient_phone": "0412 345 678",
  "medical_identifiers": [
    {
      "identifier_type": "MRN",
      "identifier_value": "MRN123456",
      "issuing_organization": "St Vincent's Hospital",
      "detected_context": "Patient ID: MRN123456"
    }
  ],

  // DO NOT SET - System populates after chunk processing
  // "matched_profile_id": null,  // ← System sets
  // "match_confidence": null,     // ← System sets
  // "match_status": null,         // ← System sets
  // "is_orphan_identity": false   // ← System sets
}

**Key Point**: Focus on extracting complete, accurate identity data. The system handles the matching logic.
```

### 8.2. Data Quality Tier Support (NEW in V2.0 - SYSTEM-CALCULATED)

```
## DATA QUALITY TIER (SYSTEM-CALCULATED, NOT AI)

**Important**: The AI does NOT calculate data quality tiers. The system calculates quality based on completeness of extracted data.

### Quality Tier Criteria (System Logic)

**Tier A - Identity Completeness**:
- All 4 identity fields present (name, DOB, address, phone)
- Threshold: 4/4 fields = Criteria A met

**Tier B - Clinical Context**:
- Provider name OR facility name present
- Encounter start date present
- Threshold: 2/2 fields = Criteria B met

**Tier C - Medical Identifiers**:
- At least 1 medical identifier present (MRN, Medicare, insurance)
- Threshold: 1+ identifiers = Criteria C met

**Quality Tiers**:
- `low`: Only C met (has identifier, minimal context)
- `medium`: B + C met (clinical context + identifier)
- `high`: A + B + C met (complete identity + clinical + identifier)
- `verified`: User manually confirmed data (highest tier)

### AI Responsibility: Extract Complete Data

To support high-quality tiers, extract:
- All available identity fields (complete addresses, full names, formatted DOBs)
- Provider AND facility names when both present
- All medical identifiers with organizational context
- Precise encounter dates

### System Responsibility: Calculate Tier

The system will:
1. Count identity fields present
2. Check clinical context completeness
3. Check medical identifiers present
4. Calculate tier based on criteria met
5. Populate `data_quality_tier` field (AI does NOT set this)

### AI Output (What You Provide)

{
  // Extract these completely to enable high quality tier
  "patient_full_name": "John Michael Smith",       // → Criteria A (1/4)
  "patient_date_of_birth": "15/03/1985",           // → Criteria A (2/4)
  "patient_address": "123 Main St, Sydney NSW 2000", // → Criteria A (3/4)
  "patient_phone": "0412 345 678",                 // → Criteria A (4/4) ✓

  "provider_name": "Dr. Sarah Jones",              // → Criteria B (1/2)
  "encounter_start_date": "2024-03-15",            // → Criteria B (2/2) ✓

  "medical_identifiers": [                         // → Criteria C (1+) ✓
    { "identifier_type": "MRN", ...}
  ],

  // DO NOT SET - System calculates after extraction
  // "data_quality_tier": "high"  // ← System calculates (A+B+C met)
}

**Key Point**: Extract complete data to enable high-quality tiers. The system handles the tier calculation logic.
```

### 9. Batching Analysis Output

```
## BATCHING ANALYSIS (NEW IN V11)

In addition to encounter detection, identify ADDITIONAL safe split points WITHIN encounters for downstream Pass 1/2 batching.

### Critical Rules

1. **DO NOT mark encounter boundaries as split points** - those are handled separately
2. **Only identify splits WITHIN encounters** - places where parallel processing is safe
3. **Provide precise coordinates for intra-page splits**

### Two Types of Split Points

**Inter-Page Splits:**
Natural page boundaries WITHIN same encounter where content naturally separates.

Example: Page 11 ends Day 2 notes, Page 12 begins radiology report (same admission)

**Intra-Page Splits:**
Safe split points within a single page.

Example: Page 23 has consultation ending mid-page, pathology report beginning below

### Output Structure (V2.0 - Matches types.ts)

{
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 12,  // Page where split occurs (inter-page: page after boundary)
        "split_type": "inter_page",  // BoundaryType: 'inter_page' | 'intra_page'
        "marker": "Day 2 notes end page 11. Radiology begins page 12.",
        "confidence": 1.0
        // No coordinates for inter_page splits
      },
      {
        "page_number": 23,  // Page where split occurs
        "split_type": "intra_page",  // Split occurs within this page
        "marker": "just before header 'PATHOLOGY REPORT'",
        "confidence": 0.92,
        "coordinates": {  // Required for intra_page splits
          "y": 1200,      // Y coordinate (pixels from top) where split occurs
          "height": 22    // Text height at split point
        }
      }
    ],
    "summary": {  // Optional summary statistics
      "total_splits": 8,
      "inter_page_count": 3,
      "intra_page_count": 5,
      "average_confidence": 0.94,
      "pages_per_split": 6.25
    }
  }
}

**Key Changes from V1.0:**
- Removed: `chunk_number`, `pages_analyzed`, `split_location`, `between_pages`, `justification`
- Simplified: `split_type` now only indicates inter_page vs intra_page (not semantic types)
- Nested coordinates: `text_y_top`, `split_y`, `text_height` → `coordinates.y` and `coordinates.height`
- Renamed: `metadata` → `summary`, `splits_found` → `total_splits`, `avg_confidence` → `average_confidence`
- Added: `pages_per_split` to summary

### Safe Split Criteria

Mark as SAFE when content after split can be understood with just encounter context:
- Clear section headers WITHIN encounter ("PATHOLOGY REPORT", "DAY 2 NOTES")
- New document type starts within same encounter
- Complete clinical narrative ends, new one begins
- Successive progress notes within same admission

### Analysis Frequency

- Examine every page boundary for potential inter-page splits
- Look for intra-page splits at major headers and transitions
- Aim for 1 split per 3-5 pages minimum
```

### 10. OCR Bounding Box Data Format

```
## OCR INTEGRATION

You receive OCR data in this format alongside the document text:

{
  "pages": [
    {
      "page_number": 1,
      "blocks": [
        {
          "text": "EMERGENCY ADMISSION",
          "bbox": {
            "x": 100,
            "y": 150,
            "width": 400,
            "height": 24
          }
        }
      ]
    }
  ]
}

### How to Extract Coordinates

1. **Find marker text:** Search OCR blocks for the header/marker
2. **Extract y-coordinate:** Use bbox.y as text_y_top
3. **Extract height:** Use bbox.height as text_height
4. **Determine marker direction:** "before" vs "after" from marker text
5. **Calculate split line:**
   - "before" markers: split_y = text_y_top (split ABOVE text)
   - "after" markers: split_y = text_y_top + text_height (split BELOW text)
6. **Store in coordinates:** { y: text_y_top, height: text_height }

### Coordinate System

- Origin: Top-left of page
- Y-axis: Increases downward
- Units: Pixels
- Typical page: 2550 x 3300 pixels (8.5" x 11" at 300 DPI)

### When to Use Coordinates

- **Intra-page encounter boundaries:** When encounter starts/ends mid-page
- **Intra-page batching splits:** When safe split point exists within a page
- **Inter-page boundaries:** Coordinates NOT needed (use page boundary)
```

## Implementation Strategy

### Phase 1: Core V11 Prompt
1. Create `aiPrompts.v11.ts` with new structure
2. Remove ID generation logic
3. Add position tracking
4. Implement cascade detection

### Phase 2: Response Processing
1. Update post-processor for V11 response format
2. Generate IDs after AI processing
3. Extract position data
4. Build cascade packages

### Phase 3: Integration
1. Update chunk-processor to use V11
2. Modify handoff-builder for cascade packages
3. Test with 142-page document
4. Verify single encounter result

## Testing Scenarios

### Scenario 1: Single Chunk Document (20 pages)
- Expected: No cascading, no cascade package
- Position data for single encounter
- Complete encounter within chunk

### Scenario 2: Multi-Chunk Single Encounter (142 pages)
- Chunk 1: is_cascading=true, cascade package created
- Chunk 2: Receives context, is_cascading=true
- Chunk 3: Receives context, is_cascading=false (ends here)
- Result: 1 final encounter with pages [1,142]

### Scenario 3: Multi-Encounter Multi-Chunk
- Multiple encounters, some cascade, some don't
- Proper cascade_id assignment
- Correct page assignments

## Migration Path from V10

### Step 1: Parallel Testing
- Run V10 and V11 on same documents
- Compare results
- Tune V11 instructions based on differences

### Step 2: Gradual Rollout
- Start with documents <100 pages
- Monitor cascade detection accuracy
- Expand to larger documents

### Step 3: Full Migration
- Replace V10 with V11
- Update all processors
- Delete V10 code

## Success Metrics

1. **Cascade Detection Accuracy**: >95% correct cascade identification
2. **Position Accuracy**: >80% correct position estimates
3. **Encounter Completeness**: No missed encounters
4. **Processing Efficiency**: <10% overhead vs V10
5. **142-Page Test**: Single encounter result

## Prompt Engineering Notes

### Cascade Detection Tuning
The cascade detection rules may need adjustment based on testing:
- Too aggressive: Many false cascades
- Too conservative: Missing real cascades
- Sweet spot: Slight over-detection (reconciler will merge)

### Position Granularity
V11 uses a two-tier precision system:
- **Inter-page boundaries:** No coordinates needed (natural page breaks)
- **Intra-page boundaries:** Precise Y-coordinates from OCR bounding boxes

This replaces the previous 5-position system (top/quarter/middle/three-quarters/bottom) with exact pixel-level positioning for mid-page boundaries.

### Context Window Management
V11 uses less context than V10:
- Smaller handoff packages
- No complex state tracking
- Focused on current chunk

This allows processing larger chunks or using smaller models.

## Future Enhancements

### Phase 1 (With V11)
- Basic position tracking
- Cascade detection
- Simplified handoff

### Phase 2 (V11.1)
- Bounding box support
- Pixel-level positions
- Visual layout awareness

### Phase 3 (V11.2)
- Multi-column detection
- Table/form awareness
- Handwritten note handling

## Appendix: Example V11 Responses

### Example 1: Single Complete Encounter
```json
{
  "encounters": [{
    "encounter_type": "outpatient_consultation",
    "is_cascading": false,
    "is_real_world_visit": true,
    "encounter_start_date": "2024-03-15",
    "encounter_end_date": "2024-03-15",

    "start_page": 1,
    "start_boundary_type": "inter_page",
    "start_marker": "page begins with 'CONSULTATION NOTE'",
    "start_text_y_top": null,
    "start_text_height": null,
    "start_y": null,

    "end_page": 3,
    "end_boundary_type": "intra_page",
    "end_marker": "before footer area",
    "end_text_y_top": 2200,
    "end_text_height": 20,
    "end_y": 2180,

    "position_confidence": 0.9,
    "page_ranges": [[1, 3]],
    "provider_name": "Dr. Jones",
    "facility": "City Medical",
    "summary": "Follow-up for hypertension",
    "confidence": 0.95
  }],
  "page_assignments": [
    {"page": 1, "encounter_index": 0, "justification": "Contains 'CONSULTATION NOTE'"},
    {"page": 2, "encounter_index": 0, "justification": "Shows 'blood pressure 140/90'"},
    {"page": 3, "encounter_index": 0, "justification": "Contains 'Plan: Continue lisinopril'"}
  ],
  "cascade_contexts": [],  // V2.0: No cascading encounters
  "page_separation_analysis": {
    "safe_split_points": [],  // V2.0: No safe splits in this short document
    "summary": {
      "total_splits": 0,
      "inter_page_count": 0,
      "intra_page_count": 0,
      "average_confidence": 0,
      "pages_per_split": 0
    }
  }
}
```

### Example 2: Cascading Encounter
```json
{
  "encounters": [{
    "encounter_type": "hospital_admission",
    "is_cascading": true,
    "is_real_world_visit": true,
    "cascade_context": "new admission starting in this chunk",
    "encounter_start_date": "2024-03-15",
    "encounter_end_date": null,

    "start_page": 1,
    "start_boundary_type": "inter_page",
    "start_marker": "page begins with 'EMERGENCY ADMISSION'",
    "start_text_y_top": null,
    "start_text_height": null,
    "start_y": null,

    "end_page": 50,
    "end_boundary_type": "inter_page",
    "end_marker": "page ends with 'Day 2 progress notes continuing'",
    "end_text_y_top": null,
    "end_text_height": null,
    "end_y": null,

    "position_confidence": 0.95,
    "page_ranges": [[1, 50]],
    "provider_name": "Dr. Smith",
    "facility": "St Vincent's Hospital",
    "summary": "STEMI admission, PCI performed, ongoing care",
    "confidence": 0.9
  }],
  "page_assignments": [
    {"page": 1, "encounter_index": 0, "justification": "Contains 'EMERGENCY ADMISSION'"},
    // ... pages 2-49 ...
    {"page": 50, "encounter_index": 0, "justification": "Shows 'Day 2 progress notes'"}
  ],
  "cascade_contexts": [  // V2.0: Array of cascade contexts
    {
      "encounter_type": "hospital_admission",
      "partial_summary": "STEMI patient, PCI completed, stable in CCU",
      "expected_in_next_chunk": "discharge_summary",
      "ai_context": "Patient stable post-PCI, awaiting discharge planning"
    }
  ],
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 12,  // V2.0: Page after boundary
        "split_type": "inter_page",
        "marker": "Page 11 ends Day 1 notes. Page 12 begins radiology report.",
        "confidence": 1.0
      },
      {
        "page_number": 28,
        "split_type": "intra_page",
        "marker": "just before header 'PATHOLOGY RESULTS'",
        "confidence": 0.91,
        "coordinates": {
          "y": 1350,
          "height": 22
        }
      }
    ],
    "summary": {
      "total_splits": 2,
      "inter_page_count": 1,
      "intra_page_count": 1,
      "average_confidence": 0.96,
      "pages_per_split": 25.0
    }
  }
}
```

### Example 3: Continuing from Previous Chunk
```json
{
  "encounters": [{
    "encounter_type": "hospital_admission",
    "is_cascading": false,
    "continues_previous": true,
    "cascade_context": "continues from previous chunk",
    "encounter_start_date": "2024-03-15",
    "encounter_end_date": "2024-03-22",

    // Position data (inter_page vs intra_page)
    "start_page": 51,
    "start_boundary_type": "inter_page",
    "start_marker": "page begins mid-admission (continuation)",
    "start_text_y_top": null,
    "start_text_height": null,
    "start_y": null,

    "end_page": 75,
    "end_boundary_type": "intra_page",
    "end_marker": "before header 'OUTPATIENT CLINIC VISIT - 2024-03-30'",
    "end_text_y_top": 1850,
    "end_text_height": 24,
    "end_y": 1826,

    "position_confidence": 0.88,
    "is_real_world_visit": true,

    "page_ranges": [[51, 75]],
    "provider_name": "Dr. Roberts",
    "facility": "St Vincent's Hospital",
    "summary": "Discharge summary for STEMI admission",
    "confidence": 0.92
  }],
  "page_assignments": [
    {"page": 51, "encounter_index": 0, "justification": "Contains 'DISCHARGE SUMMARY'"},
    {"page": 52, "encounter_index": 0, "justification": "Medication reconciliation"},
    {"page": 53, "encounter_index": 0, "justification": "Discharge instructions"},
    {"page": 54, "encounter_index": 0, "justification": "Follow-up care plan"},
    // ... pages 55-74 omitted for brevity ...
    {"page": 75, "encounter_index": 0, "justification": "Shows 'Follow-up instructions'"}
  ],
  "cascade_contexts": [],  // V2.0: Cascade completed in this chunk
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 63,  // V2.0: Page after boundary
        "split_type": "inter_page",
        "marker": "Page 62 ends discharge medications. Page 63 begins cardiology consult report.",
        "confidence": 1.0
      },
      {
        "page_number": 75,
        "split_type": "intra_page",
        "marker": "just before header 'OUTPATIENT CLINIC VISIT - 2024-03-30'",
        "confidence": 0.88,
        "coordinates": {
          "y": 1850,
          "height": 24
        }
      }
    ],
    "summary": {
      "total_splits": 2,
      "inter_page_count": 1,
      "intra_page_count": 1,
      "average_confidence": 0.94,
      "pages_per_split": 25.0
    }
  }
}
```

## V2.0 Summary: All Breaking Changes

**Version History:**
- **V1.0** (Nov 14, 2024): Original V11 spec with cascade detection, position tracking
- **V2.0** (Nov 19, 2025): Strategy A enhancements - identity extraction, profile classification support, data quality tier

### New Required Fields (AI Must Extract)

**Identity Extraction (4 fields):**
- `patient_full_name` - Full patient name as appears in document
- `patient_date_of_birth` - DOB in any format (system normalizes)
- `patient_address` - Patient address
- `patient_phone` - Patient phone number

**Medical Identifiers (array):**
- `medical_identifiers[]` - Array of medical IDs:
  - `identifier_type` - MRN, MEDICARE, INSURANCE, etc.
  - `identifier_value` - Actual identifier value
  - `issuing_organization` - Hospital/provider that issued ID
  - `detected_context` - Raw text where identifier was found

**Cascade Enhancement (1 field):**
- `expected_continuation` - What AI expects in next chunk (was separate in cascade_package)

### New System-Populated Fields (AI Does NOT Extract)

**Profile Classification (4 fields - Section 8.1):**
- `matched_profile_id` - Which user_profile matched (system sets)
- `match_confidence` - Match confidence score (system calculates)
- `match_status` - Match result: matched/unmatched/orphan/review (system determines)
- `is_orphan_identity` - True if no profile match (system sets)

**Data Quality (1 field - Section 8.2):**
- `data_quality_tier` - Quality tier: low/medium/high/verified (system calculates based on A/B/C criteria)

**Source Metadata (2 fields - Section 6):**
- `encounter_source` - How encounter created: shell_file/manual/api (system sets)
- `created_by_user_id` - User who uploaded/created (system sets)

### Breaking Changes

**1. Cascade Package Structure (Section 5):**
```
OLD v2.9:
{
  "cascade_package": {
    "encounter_type": "...",
    "summary": "...",
    "expecting": "..."
  }
}

NEW V2.0:
{
  "cascade_contexts": [  // Now ARRAY
    {
      "encounter_type": "...",
      "partial_summary": "...",           // RENAMED
      "expected_in_next_chunk": "...",    // RENAMED
      "ai_context": "..."                 // NEW
    }
  ]
}
```

**2. Batching Analysis Structure (Section 9):**
```
OLD V1.0:
{
  "page_separation_analysis": {
    "chunk_number": 1,
    "pages_analyzed": [1, 50],
    "safe_split_points": [
      {
        "split_location": "inter_page",
        "between_pages": [11, 12],
        "split_type": "natural_boundary",  // Semantic type
        "justification": "...",
        "text_y_top": 1200,
        "split_y": 1178,
        "text_height": 22
      }
    ],
    "metadata": {
      "splits_found": 8,
      "avg_confidence": 0.94
    }
  }
}

NEW V2.0:
{
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 12,                    // CHANGED: Single page number
        "split_type": "inter_page",           // SIMPLIFIED: Just boundary type
        "marker": "...",                      // KEPT
        "confidence": 0.94,                   // KEPT
        "coordinates": {                      // NESTED: Only for intra_page
          "y": 1200,
          "height": 22
        }
      }
    ],
    "summary": {                              // RENAMED from metadata
      "total_splits": 8,                      // RENAMED from splits_found
      "inter_page_count": 3,
      "intra_page_count": 5,
      "average_confidence": 0.94,             // RENAMED from avg_confidence
      "pages_per_split": 6.25                 // NEW
    }
  }
}
```

Key Changes:
- Removed: `chunk_number`, `pages_analyzed`, `split_location`, `between_pages`, `justification`
- Simplified: `split_type` now only 'inter_page' | 'intra_page' (not semantic types)
- Nested coordinates: Flat fields → `coordinates.y` and `coordinates.height`
- Renamed: `metadata` → `summary`, field name changes for consistency

### Implementation Notes

**AI Responsibilities:**
1. Extract ALL identity data and medical identifiers from documents
2. Extract complete clinical data (dates, providers, facilities, diagnoses, etc.)
3. Provide cascade context for encounters spanning chunks
4. Set `expected_continuation` field for cascading encounters
5. Identify safe split points WITHIN encounters for batching (page_separation_analysis)

**System Responsibilities:**
1. Generate all IDs (cascade_id, pending_id, encounter IDs)
2. Perform profile matching using extracted identity data
3. Calculate data quality tier based on completeness of extracted data
4. Set source metadata based on upload context

**Key Principle:** AI extracts complete data, system performs classification and matching.

## Conclusion

V2.0 enhances V11 with identity extraction and profile classification support while maintaining the core principle: **AI describes what it sees, system handles the mechanics.**

By extracting patient identity data and medical identifiers, V2.0 enables:
1. Automatic profile classification (multi-patient household support)
2. Data quality tier calculation (treatment confidence scoring)
3. Orphan identity detection (unmatched patients)
4. Medical identifier tracking (cross-system record linkage)
5. Audit trail for profile matching decisions

The cascade system remains unchanged in principle - only the output structure evolved to support multiple concurrent cascades per chunk.