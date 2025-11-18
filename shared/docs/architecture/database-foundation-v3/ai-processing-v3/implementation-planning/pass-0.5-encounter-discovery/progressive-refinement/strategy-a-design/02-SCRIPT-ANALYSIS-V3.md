# Pass 0.5 Strategy A - Script Analysis V3

**Date:** November 18, 2024
**Version:** 3.0
**Supersedes:** 02-SCRIPT-ANALYSIS-V2.md (v2.0, Nov 15, 2024)
**Purpose:** Complete script change plan with full Files 04-13 integration

## Changelog from V2

**Major Integrations Since V2:**
- **File 10:** Profile classification system (identity extraction, matching, orphan detection)
- **File 11:** Data quality tiers (A/B/C criteria calculation)
- **File 12:** Encounter source metadata (tracking document origins)
- **File 13:** Manual encounter scaffolding (minimal - most features OUT OF SCOPE)

**New Worker Files Required:**
- `coordinate-extractor.ts` - OCR coordinate lookup for intra-page boundaries
- `cascade-manager.ts` - Cascade ID generation and tracking
- `profile-classifier.ts` - Identity normalization and profile matching (optional/future)
- `identifier-extractor.ts` - Medical identifier parsing and storage
- `aiPrompts.v11.ts` - V11 prompt with all new features

**Updated Script Complexity:**
- `chunk-processor.ts`: MEDIUM → **HIGH** (identity extraction, identifier parsing, coordinate extraction)
- `pending-reconciler.ts`: HIGH → **VERY HIGH** (identifier migration, quality calculation, metadata handling)
- Timeline: 4-5 weeks → **5-6 weeks** (profile classification adds complexity)

**New Database Fields (from Files 10-13):**
- Identity markers: 4 fields (patient_full_name, patient_date_of_birth, patient_address, patient_phone)
- Classification: 4 fields (matched_profile_id, match_confidence, match_status, is_orphan_identity)
- Quality: 1 field (data_quality_tier)
- Source metadata: 5 fields (encounter_source, manual_created_by, created_by_user_id, api_source_name, api_import_date)
- **Total new fields since V2:** +14 fields across both tables

---

## Executive Summary

### What is Strategy A?

**Universal Progressive Processing** - ALL documents (1-page to 1000-page) use the same progressive chunk-based processing pipeline.

### Complete Feature Set

**Core Pipeline (Files 04-08):**
- ✅ Cascade-based encounter continuity
- ✅ Sub-page position granularity (13 position fields)
- ✅ OCR coordinate extraction for intra-page boundaries
- ✅ Batching analysis for Pass 1/2 optimization
- ✅ Simplified reconciliation (group by cascade_id)

**Identity & Quality (Files 10-11):**
- ✅ Patient identity extraction (name, DOB, address, phone)
- ✅ Medical identifier extraction (MRN, insurance, Medicare)
- ✅ Profile classification (match to account profiles)
- ✅ Orphan identity detection (3+ occurrences suggest new profile)
- ✅ Data quality tiers (A/B/C criteria → low/medium/high/verified)

**Source Tracking (File 12):**
- ✅ Encounter source metadata (shell_file, manual, API)
- ✅ Creator tracking (user who uploaded/created)
- ✅ API source identification (for quality tier calculation)

**Out of Scope (File 13):**
- ❌ Manual encounter UI (future)
- ❌ AI chat sessions (future)
- ❌ Voice recording processing (future)
- ❌ Progress note generation (future)

### Implementation Scope

**Worker Files:**
- **New files:** 5 (coordinate-extractor, cascade-manager, profile-classifier, identifier-extractor, aiPrompts.v11)
- **Modified files:** 5 (chunk-processor, reconciler, session-manager, handoff-builder, database)
- **No changes:** 4 (provider files, model files)

**Database Integration:**
- **New tables:** 6 (cascade_chains, reconciliation_log, pending_identifiers, encounter_identifiers, orphan_identities, classification_audit)
- **Modified tables:** 2 (pass05_pending_encounters +39 cols, healthcare_encounters +38 cols)
- **Supporting tables:** 2 (pass05_chunk_results, shell_files)

**Estimated Timeline:**
- Core pipeline (Files 04-08): 3 weeks
- Identity & quality (Files 10-11): 1.5 weeks
- Source metadata (File 12): 0.5 weeks
- Testing & integration: 1 week
- **Total: 5-6 weeks**

---

## Directory Structure

```
apps/render-worker/src/pass05/
├── Core Scripts
├── progressive/
│   ├── session-manager.ts          [MODIFY - Medium]
│   ├── chunk-processor.ts          [MODIFY - HIGH]
│   ├── pending-reconciler.ts       [MODIFY - VERY HIGH]
│   ├── handoff-builder.ts          [MODIFY - Low]
│   ├── database.ts                 [MODIFY - Medium]
│   ├── types.ts                    [MODIFY - Medium]
│   ├── coordinate-extractor.ts     [NEW - File 07]
│   ├── cascade-manager.ts          [NEW - File 05]
│   ├── identifier-extractor.ts     [NEW - File 10]
│   ├── profile-classifier.ts       [NEW - File 10, optional]
│   └── quality-calculator.ts       [NEW - File 11, can be function in reconciler]
├── providers/
│   ├── base-provider.ts            [NO CHANGE]
│   ├── google-provider.ts          [NO CHANGE]
│   ├── openai-provider.ts          [NO CHANGE]
│   └── provider-factory.ts         [NO CHANGE]
├── models/
│   ├── model-registry.ts           [NO CHANGE]
│   └── model-selector.ts           [NO CHANGE]
└── aiPrompts.v11.ts                [NEW - File 04]
```

---

## Part 1: Script Categories

### 1. KEEP AS-IS (Infrastructure) ✅

**Status:** No changes required

#### Provider Scripts (`providers/`)
- `base-provider.ts` - Abstract base class for AI providers
- `google-provider.ts` - Google AI (Gemini) implementation
- `openai-provider.ts` - OpenAI GPT implementation
- `provider-factory.ts` - Factory pattern for provider selection

**Purpose:** Abstracts AI model interfaces, handles API calls
**Strategy A Impact:** None - works perfectly for new system

#### Model Management (`models/`)
- `model-registry.ts` - Available models and configurations
- `model-selector.ts` - Model selection logic

**Purpose:** Manages which AI model to use
**Strategy A Impact:** None - compatible with Strategy A

---

### 2. NEW SCRIPTS REQUIRED ✨

---

#### 2.1 aiPrompts.v11.ts

**Source:** File 04 (PROMPT-V11-SPEC.md)
**Complexity:** HIGH
**Timeline:** 1 week

**Purpose:** V11 prompt incorporating all Strategy A features

**Major Features:**
1. **Cascade Detection** - AI detects encounters touching chunk boundaries
2. **Position Tracking** - Inter-page vs intra-page boundaries with markers
3. **Timeline Test** - Detects pseudo-encounters (date + provider/facility = real visit)
4. **Batching Analysis** - AI identifies safe split points WITHIN encounters
5. **Identity Extraction** - Patient name, DOB, address, phone
6. **Identifier Extraction** - MRN, insurance numbers, Medicare numbers

**New AI Response Fields:**
```json
{
  "encounters": [
    {
      // Cascade fields
      "is_cascading": true,
      "continues_previous": false,
      "cascade_context": "admission continuing",

      // Position fields (13 total)
      "start_boundary_type": "inter_page",
      "start_marker": "page begins with 'ADMISSION NOTE'",
      "start_text_y_top": null,
      "start_text_height": null,
      "start_y": null,
      "end_boundary_type": "intra_page",
      "end_marker": "before 'DISCHARGE SUMMARY'",
      "end_text_y_top": 2400,
      "end_text_height": 24,
      "end_y": 2376,
      "position_confidence": 0.92,

      // Timeline Test
      "is_real_world_visit": true,

      // Identity markers (File 10)
      "identity_markers": {
        "patient_full_name": "John Robert Smith",
        "patient_date_of_birth": "15/03/1985",
        "patient_address": "123 Main St, Melbourne VIC",
        "patient_phone": "0412 345 678"
      },

      // Identifiers (File 10)
      "identifiers": [
        {
          "identifier_type": "MRN",
          "identifier_value": "RMH-123456",
          "issuing_organization": "Royal Melbourne Hospital"
        }
      ]
    }
  ],

  // Batching analysis (File 06)
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 15,
        "split_type": "inter_page",
        "marker": "new section starts",
        "confidence": 1.0
      }
    ]
  },

  // Handoff context (File 05)
  "cascade_context": {
    "cascade_id": "cascade_uuid",
    "encounter_type": "hospital_admission",
    "summary": "STEMI patient in ICU",
    "expecting": "discharge_summary"
  }
}
```

**Implementation Steps:**
1. Copy V10 prompt structure
2. Add cascade detection instructions
3. Add position tracking instructions (inter_page vs intra_page)
4. Add Timeline Test instructions
5. Add batching analysis instructions
6. Add identity marker extraction instructions
7. Add identifier extraction instructions
8. Add cascade_context handoff structure
9. Remove old fields (tempId, encounterId, complex status)
10. Test with multi-chunk documents

**Key Validation Rules:**
- Cascade detection: page boundary test + content incompleteness
- Position confidence: inter=1.0, intra with clear marker=0.9-1.0, estimated=0.6-0.8
- Timeline Test: date + (provider OR facility) = true
- Batching: at least 1 split per 5 pages for long encounters

---

#### 2.2 coordinate-extractor.ts

**Source:** File 07 (OCR-INTEGRATION-DESIGN.md)
**Complexity:** MEDIUM-HIGH
**Timeline:** 1 week

**Purpose:** Extract OCR bounding box coordinates for intra-page position markers

**Core Functions:**

```typescript
/**
 * Main extraction function
 * Searches OCR data for text marker and returns Y coordinates
 */
async function extractCoordinatesForMarker(
  marker: string,
  pageNumber: number,
  ocrData: OCRData
): Promise<ExtractedCoordinates | null> {
  // 1. Parse marker text (remove instruction words like "before", "after")
  const searchText = parseMarkerText(marker);

  // 2. Search OCR for exact match
  const exactMatch = findExactMatch(searchText, pageNumber, ocrData);
  if (exactMatch) {
    return validateCoordinates(exactMatch);
  }

  // 3. Fallback to fuzzy match (handles OCR errors)
  const fuzzyMatch = findFuzzyMatch(searchText, pageNumber, ocrData);
  if (fuzzyMatch) {
    return validateCoordinates(fuzzyMatch, 0.8); // Reduce confidence
  }

  // 4. Extraction failed
  await logExtractionFailure(marker, pageNumber);
  return null;
}

/**
 * Extract searchable text from AI marker string
 * Examples:
 * - "before header 'DISCHARGE SUMMARY'" → "DISCHARGE SUMMARY"
 * - "after 'Patient History'" → "Patient History"
 */
function parseMarkerText(marker: string): string {
  // Remove instruction words
  const cleaned = marker
    .replace(/before|after|header|section/gi, '')
    .replace(/['"]/g, '')
    .trim();

  return cleaned;
}

/**
 * Fuzzy matching for OCR errors
 * Handles common OCR mistakes (O→0, I→l, etc.)
 */
function findFuzzyMatch(
  searchText: string,
  pageNumber: number,
  ocrData: OCRData,
  threshold: number = 0.85
): OCRMatch | null {
  // Levenshtein distance or similar algorithm
  // Return best match above threshold
}

/**
 * Validate extracted coordinates
 */
function validateCoordinates(
  coords: OCRMatch,
  confidenceMultiplier: number = 1.0
): ExtractedCoordinates {
  const pageHeight = 3300; // A4 at 300 DPI

  // Validation checks
  if (coords.y < 0 || coords.y > pageHeight) {
    throw new Error('Y coordinate out of page bounds');
  }

  if (coords.height <= 0 || coords.height > 500) {
    throw new Error('Unrealistic text height');
  }

  return {
    text_y_top: coords.y,
    text_height: coords.height,
    split_y: coords.y - coords.height,
    confidence: coords.confidence * confidenceMultiplier
  };
}

/**
 * Batch optimization for multiple markers
 * Processes all markers in one OCR lookup
 */
async function batchExtractCoordinates(
  markers: Array<{marker: string, page: number}>,
  ocrData: OCRData
): Promise<Map<string, ExtractedCoordinates | null>> {
  // Process all markers efficiently
  // Return map of marker → coordinates
}
```

**Integration Points:**
- Called by `chunk-processor.ts` after AI response
- Queries OCR data from Google Cloud Vision results
- Returns coordinates or null (graceful degradation)
- Logs failures to `pass05_coordinate_extraction_failures` table

**Error Handling:**
- Extraction failure → fallback to inter_page
- Log warning with marker text and page number
- Reduce position_confidence to 0.6-0.8
- Continue processing (non-blocking)

---

#### 2.3 cascade-manager.ts

**Source:** File 05 (CASCADE-IMPLEMENTATION.md)
**Complexity:** MEDIUM
**Timeline:** 3-4 days

**Purpose:** Manage cascade ID generation and cascade chain tracking

**Core Functions:**

```typescript
/**
 * Generate deterministic cascade ID
 * Format: cascade_{sessionId}_{chunkNum}_{encounterIndex}_{hash}
 */
function generateCascadeId(
  sessionId: string,
  chunkNumber: number,
  encounterIndex: number,
  encounterType: string
): string {
  const hash = createHash('md5')
    .update(`${sessionId}_${chunkNumber}_${encounterIndex}_${encounterType}`)
    .digest('hex')
    .substring(0, 8);

  return `cascade_${sessionId}_${chunkNumber}_${encounterIndex}_${hash}`;
}

/**
 * Determine if encounter should cascade
 * V2 logic with inter/intra boundary awareness
 */
function shouldCascade(
  encounter: AIEncounter,
  chunkNumber: number,
  totalChunks: number
): boolean {
  // Not last chunk AND is_cascading flag from AI
  if (chunkNumber < totalChunks && encounter.is_cascading) {
    return true;
  }

  // Additional validation: check end_boundary_type
  if (encounter.end_boundary_type === 'inter_page' &&
      encounter.end_page === lastPageOfChunk) {
    return true; // Touches chunk boundary at page level
  }

  return false;
}

/**
 * Track cascade in database
 * Inserts to pass05_cascade_chains table
 */
async function trackCascade(
  cascadeId: string,
  sessionId: string,
  originChunk: number,
  encounterType: string
): Promise<void> {
  await supabase.from('pass05_cascade_chains').insert({
    session_id: sessionId,
    cascade_id: cascadeId,
    origin_chunk: originChunk,
    last_chunk: null, // Updated during reconciliation
    final_encounter_id: null, // Updated after reconciliation
    pendings_count: 1,
    created_at: new Date()
  });
}

/**
 * Complete cascade after reconciliation
 * Updates cascade chain with final encounter ID
 */
async function completeCascade(
  cascadeId: string,
  lastChunk: number,
  finalEncounterId: string,
  pendingsCount: number
): Promise<void> {
  await supabase
    .from('pass05_cascade_chains')
    .update({
      last_chunk: lastChunk,
      final_encounter_id: finalEncounterId,
      pendings_count: pendingsCount,
      completed_at: new Date()
    })
    .eq('cascade_id', cascadeId);
}
```

**Integration Points:**
- Called by `chunk-processor.ts` during pending encounter creation
- Called by `pending-reconciler.ts` after final encounter creation
- Writes to `pass05_cascade_chains` table
- Provides cascade context for handoff

---

#### 2.4 identifier-extractor.ts

**Source:** File 10 (PROFILE-CLASSIFICATION-INTEGRATION.md)
**Complexity:** LOW-MEDIUM
**Timeline:** 2-3 days

**Purpose:** Extract and store medical identifiers (MRN, insurance, Medicare)

**Core Functions:**

```typescript
/**
 * Extract identifiers from AI response
 * Stores in pass05_pending_encounter_identifiers table
 */
async function extractAndStoreIdentifiers(
  sessionId: string,
  pendingId: string,
  identifiers: Array<{
    identifier_type: string,
    identifier_value: string,
    issuing_organization?: string
  }>,
  detectedContext?: string
): Promise<void> {
  if (!identifiers || identifiers.length === 0) {
    return; // No identifiers to store
  }

  const rows = identifiers.map(id => ({
    session_id: sessionId,
    pending_id: pendingId,
    identifier_type: id.identifier_type,
    identifier_value: id.identifier_value,
    issuing_organization: id.issuing_organization || null,
    detected_context: detectedContext || null,
    created_at: new Date()
  }));

  await supabase
    .from('pass05_pending_encounter_identifiers')
    .insert(rows);
}

/**
 * Migrate identifiers from pending to final table
 * Called during reconciliation
 */
async function migrateIdentifiers(
  pendingIds: string[],
  finalEncounterId: string
): Promise<void> {
  // Fetch all identifiers for pending encounters
  const { data: identifiers } = await supabase
    .from('pass05_pending_encounter_identifiers')
    .select('*')
    .in('pending_id', pendingIds);

  if (!identifiers || identifiers.length === 0) {
    return; // No identifiers to migrate
  }

  // Normalize and deduplicate
  const uniqueIdentifiers = deduplicateIdentifiers(identifiers);

  // Insert to final table
  const rows = uniqueIdentifiers.map(id => ({
    encounter_id: finalEncounterId,
    identifier_type: id.identifier_type,
    identifier_value: normalizeIdentifierValue(id.identifier_value),
    issuing_organization: id.issuing_organization,
    source_pending_id: id.pending_id,
    migrated_at: new Date()
  }));

  await supabase
    .from('healthcare_encounter_identifiers')
    .insert(rows)
    .onConflict('encounter_id, identifier_type, identifier_value')
    .ignore(); // Prevent duplicates
}

/**
 * Normalize identifier value
 * Trim, collapse whitespace, but PRESERVE case for case-sensitive IDs
 */
function normalizeIdentifierValue(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' '); // Collapse whitespace
}

/**
 * Deduplicate identifiers from multiple pending encounters
 * Same type + value = deduplicate
 */
function deduplicateIdentifiers(
  identifiers: PendingIdentifier[]
): PendingIdentifier[] {
  const seen = new Set<string>();
  const unique: PendingIdentifier[] = [];

  for (const id of identifiers) {
    const key = `${id.identifier_type}:${id.identifier_value}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(id);
    }
  }

  return unique;
}
```

**Integration Points:**
- Called by `chunk-processor.ts` after AI response
- Called by `pending-reconciler.ts` during final encounter creation
- Writes to `pass05_pending_encounter_identifiers` and `healthcare_encounter_identifiers`
- Normalizes values during migration

---

#### 2.5 profile-classifier.ts (OPTIONAL/FUTURE)

**Source:** File 10 (PROFILE-CLASSIFICATION-INTEGRATION.md)
**Complexity:** MEDIUM-HIGH
**Timeline:** 1 week (if implemented)
**Status:** **OPTIONAL for Strategy A initial implementation**

**Purpose:** Match encounters to user profiles, detect orphan identities

**Core Functions:**

```typescript
/**
 * Normalize identity for matching
 * Handles name variations and date format ambiguity
 */
function normalizeIdentity(encounter: PendingEncounter): NormalizedIdentity {
  return {
    normalized_name: normalizeName(encounter.patient_full_name),
    normalized_dob: parseAustralianDate(
      encounter.patient_date_of_birth,
      encounter.facility_name, // For locale inference
      encounter.encounter_start_date // For validation
    ),
    parse_method: 'fuzzy_au_format',
    parse_confidence: 0.95
  };
}

/**
 * Normalize name
 * Lowercase, trim, remove diacritics
 */
function normalizeName(name: string | null): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD') // Decompose diacritics
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
}

/**
 * Parse Australian date with validation guards
 * Handles DD/MM/YYYY vs MM/DD/YYYY ambiguity
 */
function parseAustralianDate(
  dateStr: string | null,
  providerLocation?: string,
  encounterStartDate?: string
): Date | null {
  if (!dateStr) return null;

  try {
    const parts = dateStr.split(/[\/\-\.]/);
    if (parts.length !== 3) return null;

    const [part1, part2, part3] = parts.map(p => parseInt(p));

    let parsedDate: Date;

    // Determine format based on context
    if (providerLocation?.includes('Australia') || providerLocation?.includes('VIC')) {
      parsedDate = new Date(part3, part2 - 1, part1); // DD/MM/YYYY
    } else if (part1 > 12) {
      parsedDate = new Date(part3, part2 - 1, part1); // Must be DD/MM/YYYY
    } else if (part2 > 12) {
      parsedDate = new Date(part3, part1 - 1, part2); // Must be MM/DD/YYYY
    } else {
      parsedDate = new Date(part3, part2 - 1, part1); // Default AU format
    }

    // Validation guards
    const now = new Date();
    if (parsedDate > now) {
      console.warn(`Invalid DOB: ${dateStr} parses to future date`);
      return null;
    }

    if (encounterStartDate) {
      const encDate = new Date(encounterStartDate);
      if (parsedDate > encDate) {
        console.warn(`Invalid DOB: ${dateStr} after encounter date`);
        return null;
      }
    }

    // Age range validation (0-150 years)
    const age = (now.getTime() - parsedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 0 || age > 150) {
      console.warn(`Invalid DOB: ${dateStr} results in age ${age}`);
      return null;
    }

    return parsedDate;
  } catch (error) {
    console.warn(`Failed to parse DOB: ${dateStr}`, error);
    return null;
  }
}

/**
 * Classify encounter against account profiles
 * Returns match result with confidence
 */
async function classifyEncounterProfile(
  encounter: PendingEncounter,
  accountProfiles: UserProfile[]
): Promise<ClassificationResult> {
  // Step 1: Exact match (high confidence)
  for (const profile of accountProfiles) {
    if (exactMatch(encounter, profile)) {
      return {
        matched_profile_id: profile.id,
        match_confidence: 0.95,
        match_status: 'matched',
        match_explanation: 'Exact name and DOB match'
      };
    }
  }

  // Step 2: Fuzzy match (medium confidence)
  const fuzzyMatches = accountProfiles
    .map(p => ({ profile: p, score: fuzzyScore(encounter, p) }))
    .filter(m => m.score > 0.7)
    .sort((a, b) => b.score - a.score);

  if (fuzzyMatches.length === 1) {
    return {
      matched_profile_id: fuzzyMatches[0].profile.id,
      match_confidence: fuzzyMatches[0].score,
      match_status: 'review', // Requires user confirmation
      match_explanation: 'Fuzzy name match, DOB match'
    };
  }

  // Step 3: Check for orphan pattern
  const orphanCount = await countOrphanOccurrences(
    encounter.patient_full_name,
    encounter.patient_date_of_birth
  );

  if (orphanCount > 2) {
    return {
      match_confidence: 0.0,
      match_status: 'orphan',
      match_explanation: `Found ${orphanCount} encounters for unknown identity`
    };
  }

  // Step 4: Unmatched
  return {
    match_confidence: 0.0,
    match_status: 'unmatched',
    match_explanation: 'No profile match found'
  };
}

/**
 * Count occurrences of same unknown identity
 * Used for orphan detection
 */
async function countOrphanOccurrences(
  name: string | null,
  dob: string | null
): Promise<number> {
  if (!name || !dob) return 0;

  const { count } = await supabase
    .from('healthcare_encounters')
    .select('*', { count: 'exact', head: true })
    .is('matched_profile_id', null)
    .eq('patient_full_name', name)
    .eq('patient_date_of_birth', dob);

  return count || 0;
}
```

**Integration Points:**
- **OPTIONAL:** Can be run post-reconciliation as separate service
- NOT required for core Pass 0.5 pipeline
- Can be added later without breaking existing functionality
- If implemented, runs AFTER reconciliation completes

**Decision:** Recommend implementing basic identity extraction in chunk-processor, but DEFER profile classification to future iteration.

---

### 3. MODIFY SIGNIFICANTLY ⚠️

---

#### 3.1 session-manager.ts

**Current Purpose:** Manages progressive sessions for >100 page documents

**Strategy A Changes:**
- Remove page count threshold check → ALL documents use progressive
- Add cascade_id tracking
- Build cascade_package for handoff
- Universal entry point for ALL documents

**Complexity:** MEDIUM
**Timeline:** 3-4 days

**Detailed Changes:**

```typescript
// BEFORE V1 (page threshold check)
if (pageCount > 100) {
  return await processProgressively(shellFileId);
} else {
  return await processDirect(shellFileId);
}

// AFTER V3 (universal progressive)
return await processProgressively(shellFileId); // ALL documents
```

**New Functions:**

```typescript
/**
 * Build cascade package for handoff
 * Contains cascade context from cascading encounters
 */
function buildCascadePackage(
  cascadingEncounters: PendingEncounter[]
): CascadePackage {
  const cascades = cascadingEncounters.map(enc => ({
    cascade_id: enc.cascade_id,
    encounter_type: enc.encounter_type,
    summary: enc.summary || enc.chief_complaint || 'continuation',
    expecting: enc.expected_continuation
  }));

  return {
    cascade_context: cascades
  };
}

/**
 * Updated handoff structure
 */
function buildHandoffPackage(
  sessionId: string,
  chunkNumber: number,
  cascadingEncounters: PendingEncounter[]
): HandoffPackage {
  return {
    session_id: sessionId,
    chunk_number: chunkNumber,
    cascade_context: buildCascadePackage(cascadingEncounters)
  };
}
```

**Database Changes:**
- Remove `pass_0_5_progressive` flag (always true in Strategy A)
- Add `total_cascades` tracking
- Add `reconciliation_completed_at` timestamp

---

#### 3.2 chunk-processor.ts

**Current Purpose:** Process single chunk, detect encounters, create pending records

**Strategy A Changes (EXTENSIVE):**
- Extract 13 position fields from AI response
- Call `extractCoordinatesForMarker()` for intra-page boundaries
- Fallback to inter_page if coordinate extraction fails
- Generate cascade_id for cascading encounters
- Generate pending_id for all encounters
- Store page_separation_analysis in chunk_results
- Extract identity markers from AI response
- Extract identifiers and store in separate table
- Map encounter_index to pending_id for page assignments

**Complexity:** MEDIUM → **HIGH**
**Timeline:** 1.5-2 weeks

**Detailed Changes:**

```typescript
/**
 * Main processing function - UPDATED for Strategy A
 */
async function processChunk(
  sessionId: string,
  chunkNumber: number,
  pages: Page[],
  handoffContext?: CascadeContext,
  ocrData?: OCRData
): Promise<ChunkResult> {

  // 1. Call AI with V11 prompt
  const aiResponse = await callAIWithV11Prompt(pages, handoffContext);

  // 2. Extract coordinates for intra-page boundaries
  const encountersWithCoordinates = await enrichEncountersWithCoordinates(
    aiResponse.encounters,
    ocrData
  );

  // 3. Generate IDs and create pending encounters
  const pendingEncounters = [];
  for (let i = 0; i < encountersWithCoordinates.length; i++) {
    const encounter = encountersWithCoordinates[i];

    // Generate pending_id
    const pendingId = `pending_${sessionId}_${chunkNumber}_${i}`;

    // Generate cascade_id if cascading
    let cascadeId = null;
    if (shouldCascade(encounter, chunkNumber, totalChunks)) {
      cascadeId = generateCascadeId(sessionId, chunkNumber, i, encounter.encounter_type);
      await trackCascade(cascadeId, sessionId, chunkNumber, encounter.encounter_type);
    }

    // Build pending encounter record
    const pending = {
      session_id: sessionId,
      pending_id: pendingId,
      cascade_id: cascadeId,
      is_cascading: cascadeId !== null,
      continues_previous: encounter.continues_previous || false,

      // 13 position fields
      start_page: encounter.start_page,
      start_boundary_type: encounter.start_boundary_type,
      start_marker: encounter.start_marker,
      start_text_y_top: encounter.start_text_y_top,
      start_text_height: encounter.start_text_height,
      start_y: encounter.start_y,
      end_page: encounter.end_page,
      end_boundary_type: encounter.end_boundary_type,
      end_marker: encounter.end_marker,
      end_text_y_top: encounter.end_text_y_top,
      end_text_height: encounter.end_text_height,
      end_y: encounter.end_y,
      position_confidence: encounter.position_confidence,

      // Identity markers (File 10)
      patient_full_name: encounter.identity_markers?.patient_full_name || null,
      patient_date_of_birth: encounter.identity_markers?.patient_date_of_birth || null,
      patient_address: encounter.identity_markers?.patient_address || null,
      patient_phone: encounter.identity_markers?.patient_phone || null,

      // Existing fields
      encounter_type: encounter.encounter_type,
      page_ranges: encounter.page_ranges,
      is_real_world_visit: encounter.is_real_world_visit,
      // ... other fields
    };

    pendingEncounters.push(pending);

    // 4. Store identifiers in separate table (File 10)
    if (encounter.identifiers && encounter.identifiers.length > 0) {
      await extractAndStoreIdentifiers(
        sessionId,
        pendingId,
        encounter.identifiers
      );
    }

    // 5. Create page assignments
    await createPageAssignments(sessionId, pendingId, encounter.page_ranges);
  }

  // 6. Insert all pending encounters
  await supabase.from('pass05_pending_encounters').insert(pendingEncounters);

  // 7. Store batching analysis in chunk_results (File 06)
  await supabase
    .from('pass05_chunk_results')
    .update({
      page_separation_analysis: aiResponse.page_separation_analysis
    })
    .eq('session_id', sessionId)
    .eq('chunk_number', chunkNumber);

  // 8. Return cascading encounters for handoff
  const cascadingEncounters = pendingEncounters.filter(p => p.is_cascading);

  return {
    encounters_created: pendingEncounters.length,
    cascading_encounters: cascadingEncounters,
    handoff_package: buildHandoffPackage(sessionId, chunkNumber, cascadingEncounters)
  };
}

/**
 * NEW: Enrich encounters with OCR coordinates
 * Extracts coordinates for intra-page boundaries
 */
async function enrichEncountersWithCoordinates(
  encounters: AIEncounter[],
  ocrData?: OCRData
): Promise<AIEncounter[]> {
  if (!ocrData) {
    console.warn('No OCR data available, using inter_page only');
    return encounters;
  }

  for (const encounter of encounters) {
    // Extract start coordinates if intra_page
    if (encounter.start_boundary_type === 'intra_page') {
      const startCoords = await extractCoordinatesForMarker(
        encounter.start_marker,
        encounter.start_page,
        ocrData
      );

      if (startCoords) {
        encounter.start_text_y_top = startCoords.text_y_top;
        encounter.start_text_height = startCoords.text_height;
        encounter.start_y = startCoords.split_y;
      } else {
        // Fallback to inter_page
        console.warn(`Failed to extract start coords, falling back to inter_page`);
        encounter.start_boundary_type = 'inter_page';
        encounter.start_text_y_top = null;
        encounter.start_text_height = null;
        encounter.start_y = null;
        encounter.position_confidence *= 0.7; // Reduce confidence
      }
    }

    // Extract end coordinates if intra_page
    if (encounter.end_boundary_type === 'intra_page') {
      const endCoords = await extractCoordinatesForMarker(
        encounter.end_marker,
        encounter.end_page,
        ocrData
      );

      if (endCoords) {
        encounter.end_text_y_top = endCoords.text_y_top;
        encounter.end_text_height = endCoords.text_height;
        encounter.end_y = endCoords.split_y;
      } else {
        // Fallback to inter_page
        console.warn(`Failed to extract end coords, falling back to inter_page`);
        encounter.end_boundary_type = 'inter_page';
        encounter.end_text_y_top = null;
        encounter.end_text_height = null;
        encounter.end_y = null;
        encounter.position_confidence *= 0.7; // Reduce confidence
      }
    }
  }

  return encounters;
}

/**
 * NEW: Create page assignments
 * Maps pages to encounters via pending_id
 */
async function createPageAssignments(
  sessionId: string,
  pendingId: string,
  pageRanges: number[][]
): Promise<void> {
  const assignments = [];

  for (const [startPage, endPage] of pageRanges) {
    for (let page = startPage; page <= endPage; page++) {
      assignments.push({
        session_id: sessionId,
        page_num: page, // Column name is page_num (not page_number)
        pending_id: pendingId
      });
    }
  }

  await supabase.from('pass05_page_assignments').insert(assignments);
}
```

**New Dependencies:**
- `coordinate-extractor.ts` - OCR coordinate lookup
- `cascade-manager.ts` - Cascade ID generation
- `identifier-extractor.ts` - Identifier storage

**Error Handling:**
- Coordinate extraction failure → fallback to inter_page (non-blocking)
- Identifier extraction failure → log warning, continue (non-blocking)
- Page assignment failure → CRITICAL (must succeed)

---

#### 3.3 pending-reconciler.ts

**Current Purpose:** Reconcile pending encounters into final healthcare_encounters

**Strategy A Changes (VERY EXTENSIVE):**
- **CRITICAL: Add session guard** - Check all chunks completed before starting
- Group by cascade_id (primary grouping)
- `mergeCascadeGroupV2()` - Merge 13 position fields (first start, last end)
- `recalculatePositionConfidence()` - Weighted average by page count
- `aggregateBatchingAnalysis()` - Combine chunk analyses, deduplicate, store in shell_files
- `migrateIdentifiers()` - Copy from pending to final table with normalization
- `calculateEncounterQuality()` - A/B/C criteria for data_quality_tier
- Copy source metadata from shell_file
- Update cascade chains with final encounter IDs

**Complexity:** HIGH → **VERY HIGH**
**Timeline:** 2 weeks

**Detailed Changes:**

```typescript
/**
 * Main reconciliation function - UPDATED for Strategy A
 */
async function reconcilePendingEncounters(
  sessionId: string,
  shellFileId: string
): Promise<ReconciliationResult> {

  // CRITICAL: Session guard - verify all chunks completed
  const incompletedChunks = await checkIncompletedChunks(sessionId);
  if (incompletedChunks.length > 0) {
    throw new Error(
      `Cannot reconcile: ${incompletedChunks.length} chunks still processing. ` +
      `Wait for all chunks to complete before reconciliation.`
    );
  }

  // 1. Fetch all pending encounters for this session
  const { data: allPendings } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .order('pending_id');

  // 2. Group by cascade_id (primary grouping)
  const cascadeGroups = groupByCascadeId(allPendings);
  const finalEncounters = [];

  // 3. Process each cascade group
  for (const [cascadeId, pendings] of cascadeGroups) {
    // Validate group
    const validation = validateCascadeGroup(pendings);
    if (!validation.isValid) {
      await handleInvalidGroup(pendings, validation.errors);
      continue;
    }

    // Merge cascade group
    const mergedEncounter = await mergeCascadeGroupV2(pendings, shellFileId);

    // Migrate identifiers
    const pendingIds = pendings.map(p => p.pending_id);
    await migrateIdentifiers(pendingIds, mergedEncounter.id);

    // Update cascade chain
    if (cascadeId) {
      await completeCascade(
        cascadeId,
        pendings[pendings.length - 1].chunk_number,
        mergedEncounter.id,
        pendings.length
      );
    }

    // Mark all pendings in this group as reconciled to this final encounter
    await supabase
      .from('pass05_pending_encounters')
      .update({ reconciled_to: mergedEncounter.id })
      .in('pending_id', pendingIds);

    finalEncounters.push(mergedEncounter);
  }

  // 4. Aggregate batching analysis to shell_files
  await aggregateBatchingAnalysis(sessionId, shellFileId);

  // 5. Mark all pendings as completed and set reconciliation metadata
  const pendingIds = allPendings.map(p => p.pending_id);
  await supabase
    .from('pass05_pending_encounters')
    .update({
      status: 'completed',
      reconciled_at: new Date(),
      reconciliation_method: 'cascade', // All Strategy A reconciliations use cascade grouping
      reconciliation_key: null, // Cascade ID is the grouping key (stored separately)
      reconciliation_confidence: 1.0 // High confidence when validation passes
    })
    .in('pending_id', pendingIds);

  return {
    final_encounters_created: finalEncounters.length,
    pending_encounters_processed: allPendings.length,
    cascades_completed: cascadeGroups.size
  };
}

/**
 * CRITICAL: Check for incompleted chunks
 * Must be called BEFORE reconciliation starts
 */
async function checkIncompletedChunks(sessionId: string): Promise<number[]> {
  const { data: chunks } = await supabase
    .from('pass05_chunk_results')
    .select('chunk_number')
    .eq('session_id', sessionId)
    .neq('status', 'completed');

  return chunks?.map(c => c.chunk_number) || [];
}

/**
 * Group pending encounters by cascade_id
 * NULL cascade_id = single-chunk encounter (group by itself)
 */
function groupByCascadeId(
  pendings: PendingEncounter[]
): Map<string | null, PendingEncounter[]> {
  const groups = new Map<string | null, PendingEncounter[]>();

  for (const pending of pendings) {
    const key = pending.cascade_id || pending.pending_id; // Use pending_id for non-cascades
    const group = groups.get(key) || [];
    group.push(pending);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Validate cascade group
 * Checks for sequential chunks, no gaps, same encounter type
 */
function validateCascadeGroup(
  pendings: PendingEncounter[]
): ValidationResult {
  const errors: string[] = [];

  // Check sequential chunks
  const chunkNumbers = pendings.map(p => p.chunk_number).sort((a, b) => a - b);
  for (let i = 1; i < chunkNumbers.length; i++) {
    if (chunkNumbers[i] !== chunkNumbers[i - 1] + 1) {
      errors.push(`Non-sequential chunks: ${chunkNumbers[i - 1]} to ${chunkNumbers[i]}`);
    }
  }

  // Check same encounter type
  const types = new Set(pendings.map(p => p.encounter_type));
  if (types.size > 1) {
    errors.push(`Mixed encounter types in cascade: ${Array.from(types).join(', ')}`);
  }

  // Check page continuity
  for (let i = 1; i < pendings.length; i++) {
    const prevEndPage = pendings[i - 1].end_page;
    const currStartPage = pendings[i].start_page;
    if (currStartPage < prevEndPage) {
      errors.push(`Page overlap: chunk ${i - 1} ends at ${prevEndPage}, chunk ${i} starts at ${currStartPage}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Merge cascade group V2
 * Handles 13 position fields + all new identity/quality fields
 */
async function mergeCascadeGroupV2(
  pendings: PendingEncounter[],
  shellFileId: string
): Promise<HealthcareEncounter> {
  // Sort by chunk number
  const sorted = pendings.sort((a, b) => a.chunk_number - b.chunk_number);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Merge position fields: first chunk start + last chunk end
  const mergedPosition = {
    start_page: first.start_page,
    start_boundary_type: first.start_boundary_type,
    start_marker: first.start_marker,
    start_text_y_top: first.start_text_y_top,
    start_text_height: first.start_text_height,
    start_y: first.start_y,

    end_page: last.end_page,
    end_boundary_type: last.end_boundary_type,
    end_marker: last.end_marker,
    end_text_y_top: last.end_text_y_top,
    end_text_height: last.end_text_height,
    end_y: last.end_y,

    position_confidence: recalculatePositionConfidence(sorted)
  };

  // Merge page ranges
  const mergedPageRanges = mergePageRanges(sorted.map(p => p.page_ranges));

  // Calculate quality tier (File 11)
  const qualityTier = calculateEncounterQuality(first);

  // Parse DOB from text to date (healthcare_encounters requires date type)
  let parsedDOB: Date | null = null;
  if (first.patient_date_of_birth) {
    parsedDOB = parseAustralianDate(
      first.patient_date_of_birth,
      first.facility_name,
      first.encounter_start_date
    );
    if (!parsedDOB) {
      console.warn(`Failed to parse DOB "${first.patient_date_of_birth}", storing as NULL`);
    }
  }

  // Build final encounter
  const finalEncounter = {
    patient_id: first.patient_id,
    source_shell_file_id: shellFileId,
    encounter_type: first.encounter_type,

    // Position fields
    ...mergedPosition,
    page_ranges: mergedPageRanges,

    // Identity fields (File 10) - DOB converted from text to date
    patient_full_name: first.patient_full_name,
    patient_date_of_birth: parsedDOB, // Normalized to date type
    patient_address: first.patient_address,
    patient_phone: first.patient_phone,

    // Provider fields
    provider_name: first.provider_name,
    facility_name: first.facility_name,
    encounter_start_date: first.encounter_start_date,
    encounter_end_date: last.encounter_end_date, // Last chunk's end date

    // Quality (File 11)
    data_quality_tier: qualityTier,
    is_real_world_visit: first.is_real_world_visit,

    // Source metadata (File 12)
    encounter_source: 'shell_file',
    created_by_user_id: await getShellFileUploadedBy(shellFileId),

    // Cascade metadata
    cascade_id: first.cascade_id,
    chunk_count: sorted.length,

    // Existing fields
    encounter_data: mergeEncounterData(sorted),
    summary: mergeSummaries(sorted),
    // ... other fields
  };

  // Insert final encounter
  const { data, error } = await supabase
    .from('healthcare_encounters')
    .insert(finalEncounter)
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * Recalculate position confidence
 * Weighted average by page count
 */
function recalculatePositionConfidence(
  pendings: PendingEncounter[]
): number {
  let totalConfidence = 0;
  let totalPages = 0;

  for (const pending of pendings) {
    const pageCount = calculatePageCount(pending.page_ranges);
    totalConfidence += pending.position_confidence * pageCount;
    totalPages += pageCount;
  }

  return totalPages > 0 ? totalConfidence / totalPages : 0.5;
}

/**
 * NEW: Aggregate batching analysis
 * Combines chunk analyses and stores in shell_files
 */
async function aggregateBatchingAnalysis(
  sessionId: string,
  shellFileId: string
): Promise<void> {
  // 1. Fetch all chunk analyses
  const { data: chunks } = await supabase
    .from('pass05_chunk_results')
    .select('chunk_number, page_separation_analysis')
    .eq('session_id', sessionId)
    .order('chunk_number');

  if (!chunks || chunks.length === 0) {
    console.warn('No chunk analyses found');
    return;
  }

  // 2. Combine safe_split_points from all chunks
  const allSplits = [];
  for (const chunk of chunks) {
    if (chunk.page_separation_analysis?.safe_split_points) {
      allSplits.push(...chunk.page_separation_analysis.safe_split_points);
    }
  }

  // 3. Sort by page number
  allSplits.sort((a, b) => a.page_number - b.page_number);

  // 4. Deduplicate splits at chunk boundaries
  const deduplicated = deduplicateSplitPoints(allSplits, chunks);

  // 5. Calculate summary statistics
  const interPageCount = deduplicated.filter(s => s.split_type === 'inter_page').length;
  const intraPageCount = deduplicated.filter(s => s.split_type === 'intra_page').length;
  const avgConfidence = deduplicated.reduce((sum, s) => sum + s.confidence, 0) / deduplicated.length;

  const totalPages = chunks.reduce((sum, c) =>
    sum + (c.page_separation_analysis?.total_pages || 0), 0
  );
  const pagesPerSplit = totalPages / deduplicated.length;

  // 6. Store aggregated analysis in shell_files
  const aggregated = {
    safe_split_points: deduplicated,
    summary: {
      total_splits: deduplicated.length,
      inter_page_count: interPageCount,
      intra_page_count: intraPageCount,
      average_confidence: avgConfidence,
      pages_per_split: pagesPerSplit
    },
    aggregated_from_chunks: chunks.length,
    aggregated_at: new Date().toISOString()
  };

  await supabase
    .from('shell_files')
    .update({ page_separation_analysis: aggregated })
    .eq('id', shellFileId);
}

/**
 * Deduplicate split points at chunk boundaries
 * If same page appears in multiple chunks, keep higher confidence
 */
function deduplicateSplitPoints(
  splits: SplitPoint[],
  chunks: ChunkResult[]
): SplitPoint[] {
  const pageMap = new Map<number, SplitPoint>();

  for (const split of splits) {
    const existing = pageMap.get(split.page_number);
    if (!existing || split.confidence > existing.confidence) {
      pageMap.set(split.page_number, split);
    }
  }

  return Array.from(pageMap.values()).sort((a, b) => a.page_number - b.page_number);
}

/**
 * NEW: Calculate encounter quality tier
 * Based on A/B/C criteria from File 11
 */
function calculateEncounterQuality(
  encounter: PendingEncounter
): 'low' | 'medium' | 'high' | 'verified' {
  // Criteria A: Patient identity (name AND DOB)
  const criteriaA = !!(
    encounter.patient_full_name &&
    encounter.patient_date_of_birth
  );

  // Criteria B: Provider/date (provider OR facility) AND start date
  const criteriaB = !!(
    (encounter.provider_name || encounter.facility_name) &&
    encounter.encounter_start_date
  );

  // Quality tier assignment
  if (!criteriaA && !criteriaB) return 'low';
  if (criteriaA && !criteriaB) return 'medium';
  if (criteriaA && criteriaB) return 'high';

  // Note: 'verified' can only be set manually or via trusted API
  return 'low';
}

/**
 * NEW: Get shell_file uploaded_by user ID
 * Used for created_by_user_id field
 */
async function getShellFileUploadedBy(
  shellFileId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('shell_files')
    .select('uploaded_by') // Auth user who uploaded the file
    .eq('id', shellFileId)
    .single();

  return data?.uploaded_by || null;
}

/**
 * Handle invalid cascade group
 * Mark pendings as abandoned, log errors
 */
async function handleInvalidGroup(
  pendings: PendingEncounter[],
  errors: string[]
): Promise<void> {
  console.error('Invalid cascade group:', errors);

  // Mark all as abandoned
  const pendingIds = pendings.map(p => p.pending_id);
  await supabase
    .from('pass05_pending_encounters')
    .update({
      status: 'abandoned',
      abandonment_reason: errors.join('; ')
    })
    .in('pending_id', pendingIds);

  // Log to reconciliation_log
  await supabase.from('pass05_reconciliation_log').insert({
    session_id: pendings[0].session_id,
    cascade_id: pendings[0].cascade_id,
    pending_ids: pendingIds,
    match_type: 'validation_failed',
    confidence: 0.0,
    reasons: errors.join('\n')
  });
}
```

**New Dependencies:**
- `identifier-extractor.ts` - Identifier migration
- `cascade-manager.ts` - Cascade completion
- File 11 quality logic - A/B/C criteria

**Critical Validations:**
1. **Session guard** - All chunks must be completed (BLOCKING)
2. **Cascade group validation** - Sequential chunks, no gaps
3. **Page continuity** - No overlaps between chunks
4. **Position merging** - First start + last end

---

#### 3.4 handoff-builder.ts

**Current Purpose:** Build handoff package for next chunk

**Strategy A Changes:**
- Simplify to cascade_context only
- Remove complex pendingEncounter structure
- Use cascade_id for continuity tracking

**Complexity:** LOW
**Timeline:** 1 day

**Detailed Changes:**

```typescript
// BEFORE V1 (complex handoff)
{
  "pendingEncounter": {
    "tempId": "encounter_temp_chunk1_001",
    "partialData": {...},
    "expectedContinuation": "discharge_summary",
    "pageRanges": [[1,50]]
  },
  "activeContext": {...}
}

// AFTER V3 (simple cascade context)
{
  "cascade_context": {
    "cascade_id": "cascade_uuid_hash",
    "encounter_type": "hospital_admission",
    "summary": "STEMI patient in ICU",
    "expecting": "discharge_summary"
  }
}
```

**Implementation:**

```typescript
/**
 * Build handoff package for next chunk
 * Contains only cascade context (simplified)
 */
function buildHandoffPackage(
  cascadingEncounters: PendingEncounter[]
): HandoffPackage {
  const cascadeContexts = cascadingEncounters.map(enc => ({
    cascade_id: enc.cascade_id,
    encounter_type: enc.encounter_type,
    summary: enc.summary || enc.chief_complaint || 'continuation',
    expecting: enc.expected_continuation
  }));

  return {
    cascade_context: cascadeContexts
  };
}
```

---

#### 3.5 database.ts

**Current Purpose:** Database helper functions

**Strategy A Changes:**
- Add RPC for `enqueue_job_v3()` if not already present
- Add helper functions for new tables
- Add batch insert optimizations

**Complexity:** LOW-MEDIUM
**Timeline:** 2-3 days

**New Helper Functions:**

```typescript
/**
 * Batch insert identifiers
 */
async function batchInsertIdentifiers(
  identifiers: PendingIdentifier[]
): Promise<void> {
  if (identifiers.length === 0) return;

  const BATCH_SIZE = 1000;
  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE);
    await supabase
      .from('pass05_pending_encounter_identifiers')
      .insert(batch);
  }
}

/**
 * Fetch shell_file metadata
 */
async function getShellFileMetadata(
  shellFileId: string
): Promise<ShellFileMetadata | null> {
  const { data } = await supabase
    .from('shell_files')
    .select('patient_id, shell_file_subtype, api_source_name')
    .eq('id', shellFileId)
    .single();

  return data;
}
```

---

#### 3.6 types.ts

**Current Purpose:** TypeScript type definitions

**Strategy A Changes:**
- Add types for 13 position fields
- Add types for identity markers
- Add types for identifiers
- Add types for quality tiers
- Add types for source metadata

**Complexity:** LOW
**Timeline:** 1 day

**New Type Definitions:**

```typescript
/**
 * Position boundary types
 */
type BoundaryType = 'inter_page' | 'intra_page';

/**
 * Position fields (13 total)
 */
interface PositionFields {
  start_page: number;
  start_boundary_type: BoundaryType;
  start_marker: string | null;
  start_text_y_top: number | null;
  start_text_height: number | null;
  start_y: number | null;

  end_page: number;
  end_boundary_type: BoundaryType;
  end_marker: string | null;
  end_text_y_top: number | null;
  end_text_height: number | null;
  end_y: number | null;

  position_confidence: number;
}

/**
 * Identity markers (File 10)
 */
interface IdentityMarkers {
  patient_full_name: string | null;
  patient_date_of_birth: string | null;
  patient_address: string | null;
  patient_phone: string | null;
}

/**
 * Medical identifier
 */
interface MedicalIdentifier {
  identifier_type: string; // 'MRN', 'INSURANCE', 'MEDICARE'
  identifier_value: string;
  issuing_organization: string | null;
}

/**
 * Quality tier
 */
type QualityTier = 'low' | 'medium' | 'high' | 'verified';

/**
 * Match status (File 10)
 */
type MatchStatus = 'matched' | 'unmatched' | 'orphan' | 'review';

/**
 * Encounter source (File 12)
 */
type EncounterSource = 'shell_file' | 'manual' | 'api';

/**
 * Updated PendingEncounter interface
 */
interface PendingEncounter extends PositionFields {
  session_id: string;
  pending_id: string;
  cascade_id: string | null;
  is_cascading: boolean;
  continues_previous: boolean;

  // Identity fields
  patient_full_name: string | null;
  patient_date_of_birth: string | null;
  patient_address: string | null;
  patient_phone: string | null;

  // Classification fields
  matched_profile_id: string | null;
  match_confidence: number | null;
  match_status: MatchStatus | null;
  is_orphan_identity: boolean;

  // Quality field
  data_quality_tier: QualityTier | null;

  // Source metadata
  encounter_source: EncounterSource;
  created_by_user_id: string | null;

  // Existing fields
  encounter_type: string;
  page_ranges: number[][];
  is_real_world_visit: boolean;
  // ...
}

/**
 * Batching analysis (File 06)
 */
interface PageSeparationAnalysis {
  safe_split_points: Array<{
    page_number: number;
    split_type: BoundaryType;
    marker: string;
    confidence: number;
    coordinates?: {
      y: number;
      height: number;
    };
  }>;
  summary?: {
    total_splits: number;
    inter_page_count: number;
    intra_page_count: number;
    average_confidence: number;
    pages_per_split: number;
  };
}
```

---

## Part 2: Implementation Timeline

### Week 1-2: Core Pipeline (Files 04-08)
- [ ] **Week 1:**
  - Create `aiPrompts.v11.ts` with all new fields
  - Create `coordinate-extractor.ts` with OCR lookup
  - Create `cascade-manager.ts` with ID generation
  - Update `types.ts` with new interfaces

- [ ] **Week 2:**
  - Update `chunk-processor.ts` with position extraction
  - Update `session-manager.ts` with cascade handoff
  - Update `handoff-builder.ts` with simplified structure
  - Update `database.ts` with new helpers

### Week 3-4: Reconciliation & Quality (Files 05, 11)
- [ ] **Week 3:**
  - Update `pending-reconciler.ts` - Part 1:
    - Session guard validation
    - Cascade grouping logic
    - Position field merging (13 fields)
    - Batching analysis aggregation

- [ ] **Week 4:**
  - Update `pending-reconciler.ts` - Part 2:
    - Quality tier calculation (A/B/C criteria)
    - Source metadata copying
    - Cascade chain completion
    - Error handling and logging

### Week 5: Identity & Classification (File 10)
- [ ] **Week 5:**
  - Create `identifier-extractor.ts`
  - Update `chunk-processor.ts` with identity extraction
  - Update `pending-reconciler.ts` with identifier migration
  - OPTIONAL: Create `profile-classifier.ts` (can defer to later)

### Week 6: Testing & Integration
- [ ] **Week 6:**
  - End-to-end testing with multi-chunk documents
  - Validation of all 13 position fields
  - Verification of cascade continuity
  - Quality tier calculation testing
  - Identifier migration testing
  - Performance optimization

---

## Part 3: Testing Requirements

### Unit Tests
- [ ] `coordinate-extractor.ts` - OCR lookup accuracy
- [ ] `cascade-manager.ts` - ID generation determinism
- [ ] `identifier-extractor.ts` - Normalization correctness
- [ ] Quality calculation - A/B/C criteria logic
- [ ] Position merging - First start + last end
- [ ] Batching aggregation - Deduplication logic

### Integration Tests
- [ ] End-to-end multi-chunk document (142 pages)
- [ ] Cascade continuity across 3+ chunks
- [ ] Position confidence degradation (intra → inter fallback)
- [ ] Identifier migration completeness
- [ ] Quality tier assignment correctness
- [ ] Session guard enforcement (reconciliation blocking)

### Validation Tests
- [ ] OCR coordinate bounds checking
- [ ] Date parsing validation guards
- [ ] Cascade group validation (sequential, no gaps)
- [ ] Page assignment completeness
- [ ] Identifier deduplication

---

## Part 4: Migration Coordination

### Database Migrations Required
**BEFORE worker code deployment:**
1. Run all migrations from `03-TABLE-DESIGN-V3.md`
2. Verify all 6 new tables exist
3. Verify all new columns exist on pending and final tables
4. Verify indexes created

**Deployment Order:**
1. Database migrations (03-TABLE-DESIGN-V3.md)
2. Worker code (02-SCRIPT-ANALYSIS-V3.md - this file)
3. Smoke test with 1 document
4. Full testing with multi-chunk documents

### Code Deployment Sequence
1. Deploy new files first (coordinate-extractor, cascade-manager, identifier-extractor, aiPrompts.v11)
2. Deploy modified files (chunk-processor, reconciler, session-manager)
3. Verify no TypeScript errors
4. Run smoke test on staging

---

## Part 5: Complexity Summary

### File Complexity Matrix

| File | Current Lines | Estimated New Lines | Complexity | Timeline |
|------|---------------|---------------------|------------|----------|
| aiPrompts.v11.ts | 0 (new) | ~800 | HIGH | 1 week |
| coordinate-extractor.ts | 0 (new) | ~400 | MEDIUM-HIGH | 1 week |
| cascade-manager.ts | 0 (new) | ~250 | MEDIUM | 3-4 days |
| identifier-extractor.ts | 0 (new) | ~300 | LOW-MEDIUM | 2-3 days |
| profile-classifier.ts | 0 (new) | ~500 | MEDIUM-HIGH | 1 week (optional) |
| chunk-processor.ts | ~500 | ~900 | HIGH | 1.5 weeks |
| pending-reconciler.ts | ~600 | ~1200 | VERY HIGH | 2 weeks |
| session-manager.ts | ~300 | ~400 | MEDIUM | 3-4 days |
| handoff-builder.ts | ~100 | ~150 | LOW | 1 day |
| database.ts | ~200 | ~300 | LOW-MEDIUM | 2-3 days |
| types.ts | ~150 | ~300 | LOW | 1 day |

**Total Estimated Development Time:** 5-6 weeks

---

## Part 6: Success Criteria

### Core Pipeline Success
- ✅ All documents (1-1000 pages) process through progressive pipeline
- ✅ Cascade continuity maintained across chunks
- ✅ 13 position fields populated correctly
- ✅ OCR coordinates extracted for intra-page boundaries (or graceful fallback)
- ✅ Batching analysis aggregated to shell_files

### Identity & Quality Success
- ✅ Patient identity fields extracted from AI
- ✅ Medical identifiers stored in separate table
- ✅ Identifiers migrated to final table during reconciliation
- ✅ Quality tiers calculated correctly (A/B/C criteria)
- ✅ Source metadata copied to final encounters

### Validation & Error Handling
- ✅ Session guard prevents premature reconciliation
- ✅ Cascade group validation catches errors
- ✅ Coordinate extraction failures don't block pipeline
- ✅ Invalid groups marked as abandoned with reasons logged

### Performance
- ✅ 142-page document processes in <5 minutes
- ✅ Memory usage <1GB for worker process
- ✅ No memory leaks during long-running sessions
- ✅ Batch inserts optimize database writes

---

## Appendix A: File 13 Exclusions

**The following features from File 13 are OUT OF SCOPE for Strategy A:**

- ❌ `shell_file_metadata` table (not created)
- ❌ AI chat session integration
- ❌ Manual update session tracking
- ❌ Voice recording processing
- ❌ Progress note generation from manual UI
- ❌ Session-based batching
- ❌ Governance policies

**What IS in scope from File 12:**
- ✅ `encounter_source`, `manual_created_by`, `created_by_user_id` fields (added to schema, mostly NULL initially)
- ✅ `api_source_name`, `api_import_date` fields (for future API imports)

---

## Appendix B: Cross-Reference Matrix

### Which File Defines What

| Feature | Source File | Worker Script | Database Table |
|---------|-------------|---------------|----------------|
| Cascade detection | File 04 | aiPrompts.v11.ts | pass05_pending_encounters |
| Position tracking (13 fields) | File 04 | chunk-processor.ts | both tables |
| OCR coordinate extraction | File 07 | coordinate-extractor.ts | (coordinates in position fields) |
| Cascade ID generation | File 05 | cascade-manager.ts | pass05_cascade_chains |
| Batching analysis | File 06 | chunk-processor.ts | pass05_chunk_results, shell_files |
| Reconciliation logic | File 08 | pending-reconciler.ts | healthcare_encounters |
| Identity extraction | File 10 | chunk-processor.ts | pass05_pending_encounters |
| Identifier storage | File 10 | identifier-extractor.ts | pass05_pending_encounter_identifiers |
| Identifier migration | File 10 | pending-reconciler.ts | healthcare_encounter_identifiers |
| Profile classification | File 10 | profile-classifier.ts (optional) | orphan_identities, classification_audit |
| Quality tier calculation | File 11 | pending-reconciler.ts | healthcare_encounters |
| Source metadata | File 12 | pending-reconciler.ts | healthcare_encounters |

---

## Appendix C: Database Schema Quick Reference

### New Fields in pass05_pending_encounters (41 new fields)

**Cascade (3):**
- cascade_id, is_cascading, continues_previous

**Position (13):**
- start_page, start_boundary_type, start_marker, start_text_y_top, start_text_height, start_y
- end_page, end_boundary_type, end_marker, end_text_y_top, end_text_height, end_y
- position_confidence

**Reconciliation (5):**
- reconciliation_key, reconciliation_method, reconciliation_confidence, reconciled_to, reconciled_at

**Identity (4):**
- patient_full_name, patient_date_of_birth, patient_address, patient_phone

**Provider (4):**
- provider_name, facility_name, encounter_start_date, encounter_end_date

**Classification (4):**
- matched_profile_id, match_confidence, match_status, is_orphan_identity

**Quality (3):**
- data_quality_tier, quality_criteria_met, quality_calculation_date

**Source Metadata (5):**
- encounter_source, manual_created_by, created_by_user_id, api_source_name, api_import_date

### New Fields in healthcare_encounters (40 new fields)

**Same as pending_encounters** (all 41 fields minus pending_id which is internal to pending table only)

### New Tables

1. **pass05_cascade_chains** - Cascade tracking
2. **pass05_reconciliation_log** - Reconciliation audit
3. **pass05_pending_encounter_identifiers** - Identifier storage during processing
4. **healthcare_encounter_identifiers** - Final identifier storage
5. **orphan_identities** - Orphan detection (optional)
6. **profile_classification_audit** - Classification audit (optional)

---

**End of Script Analysis V3**
