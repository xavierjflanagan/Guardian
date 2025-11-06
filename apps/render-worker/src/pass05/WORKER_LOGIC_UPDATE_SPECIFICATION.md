# Pass 0.5 Worker Logic Update Specification

**Date:** 2025-11-06
**Target File:** `manifestBuilder.ts` (both source of truth and deployed versions)
**Purpose:** Implement two-branch encounter logic + date source fallback

---

## Overview

After Migration 42 completes, the worker must populate new database columns:
- `encounter_start_date` (renamed from `encounter_date`)
- `encounter_timeframe_status` (new column)
- `date_source` (new column)
- `encounter_date_end` (existing column, now actively populated)

The worker receives AI output (from v2.9 prompt) and applies additional logic for pseudo encounters without dates.

---

## Changes Required

### 1. Update TypeScript Interfaces

**File:** `types.ts`

**Current EncounterMetadata:**
```typescript
export interface EncounterMetadata {
  encounterId: string;
  encounterType: string;
  encounterDate: string | null;  // ISO date string
  encounterDateEnd: string | null;
  isRealWorldVisit: boolean;
  providerName: string | null;
  facilityName: string | null;
  summary: string;
  spatialBounds: SpatialBound[];
  pageRanges: number[][];
  confidence: number;
  extractedText?: string;
}
```

**Updated EncounterMetadata:**
```typescript
export interface EncounterMetadata {
  encounterId: string;
  encounterType: string;

  // RENAMED FIELD
  encounterStartDate: string | null;  // Was: encounterDate

  // UPDATED FIELD (actively populated)
  encounterDateEnd: string | null;

  // NEW FIELDS
  encounterTimeframeStatus: 'completed' | 'ongoing' | 'unknown_end_date';
  dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

  // Existing fields
  isRealWorldVisit: boolean;
  providerName: string | null;
  facilityName: string | null;
  summary: string;
  spatialBounds: SpatialBound[];
  pageRanges: number[][];
  confidence: number;
  extractedText?: string;
}
```

---

### 2. Update AI Response Mapping

**File:** `manifestBuilder.ts`

**Current Logic (encounterDiscovery.ts returns AI JSON):**

The AI returns (v2.9 format):
```json
{
  "encounter_id": "enc-1",
  "encounterType": "specialist_consultation",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2025-10-27", "end": "2025-10-27"},
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted",
  "provider": "Dr. Jones",
  "facility": "City Hospital",
  "summary": "...",
  "confidence": 0.96,
  "pageRanges": [[1, 5]]
}
```

**New Mapping Logic:**

```typescript
// In manifestBuilder.ts - buildEncounterMetadata() function

function mapAIEncounterToMetadata(
  aiEncounter: any,  // Raw AI JSON response
  shellFileMetadata: { createdAt?: Date; modifiedAt?: Date },
  uploadTimestamp: Date
): EncounterMetadata {

  // Branch A: Real-World Encounters (AI provides dates)
  if (aiEncounter.isRealWorldVisit) {
    return {
      encounterId: aiEncounter.encounter_id,
      encounterType: aiEncounter.encounterType,

      // Direct mapping from AI response
      encounterStartDate: aiEncounter.dateRange?.start || null,
      encounterDateEnd: aiEncounter.dateRange?.end || null,
      encounterTimeframeStatus: aiEncounter.encounterTimeframeStatus || 'completed',
      dateSource: aiEncounter.dateSource || 'ai_extracted',

      isRealWorldVisit: true,
      providerName: aiEncounter.provider || null,
      facilityName: aiEncounter.facility || null,
      summary: aiEncounter.summary,
      spatialBounds: [], // Populated separately
      pageRanges: aiEncounter.pageRanges,
      confidence: aiEncounter.confidence,
      extractedText: aiEncounter.extractedText
    };
  }

  // Branch B: Pseudo Encounters (may need date fallback)
  else {
    let encounterStartDate: string | null;
    let dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

    // Date Waterfall Logic
    if (aiEncounter.dateRange?.start) {
      // AI extracted date from document (e.g., lab collection date)
      encounterStartDate = aiEncounter.dateRange.start;
      dateSource = 'ai_extracted';
    }
    else if (shellFileMetadata.createdAt || shellFileMetadata.modifiedAt) {
      // Fallback to file creation/modification date
      const fallbackDate = shellFileMetadata.createdAt || shellFileMetadata.modifiedAt;
      encounterStartDate = fallbackDate.toISOString().split('T')[0]; // YYYY-MM-DD
      dateSource = 'file_metadata';
    }
    else {
      // Last resort: upload timestamp
      encounterStartDate = uploadTimestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      dateSource = 'upload_date';
    }

    return {
      encounterId: aiEncounter.encounter_id,
      encounterType: aiEncounter.encounterType,

      // Pseudo encounters: start = end (completed observation)
      encounterStartDate: encounterStartDate,
      encounterDateEnd: encounterStartDate,  // Same as start
      encounterTimeframeStatus: 'completed',  // Always completed for pseudo
      dateSource: dateSource,

      isRealWorldVisit: false,
      providerName: aiEncounter.provider || null,
      facilityName: aiEncounter.facility || null,
      summary: aiEncounter.summary,
      spatialBounds: [], // Populated separately
      pageRanges: aiEncounter.pageRanges,
      confidence: aiEncounter.confidence,
      extractedText: aiEncounter.extractedText
    };
  }
}
```

---

### 3. Update Database UPSERT

**File:** `databaseWriter.ts` or `manifestBuilder.ts` (wherever encounter UPSERT happens)

**Current UPSERT:**
```typescript
const { data: encounterData, error: encounterError } = await supabase
  .from('healthcare_encounters')
  .upsert({
    id: encounter.encounterId,
    patient_id: patientId,
    encounter_type: encounter.encounterType,
    encounter_date: encounter.encounterDate,  // OLD COLUMN NAME
    encounter_date_end: encounter.encounterDateEnd,
    is_real_world_visit: encounter.isRealWorldVisit,
    provider_name: encounter.providerName,
    facility_name: encounter.facilityName,
    summary: encounter.summary,
    spatial_bounds: encounter.spatialBounds,
    page_ranges: encounter.pageRanges,
    pass_0_5_confidence: encounter.confidence,
    source_method: 'ai_pass_0_5',
    // ... other fields
  });
```

**Updated UPSERT:**
```typescript
const { data: encounterData, error: encounterError } = await supabase
  .from('healthcare_encounters')
  .upsert({
    id: encounter.encounterId,
    patient_id: patientId,
    encounter_type: encounter.encounterType,

    // UPDATED COLUMNS (Migration 42)
    encounter_start_date: encounter.encounterStartDate,  // RENAMED
    encounter_date_end: encounter.encounterDateEnd,
    encounter_timeframe_status: encounter.encounterTimeframeStatus,  // NEW
    date_source: encounter.dateSource,  // NEW

    // Existing columns
    is_real_world_visit: encounter.isRealWorldVisit,
    provider_name: encounter.providerName,
    facility_name: encounter.facilityName,
    summary: encounter.summary,
    spatial_bounds: encounter.spatialBounds,
    page_ranges: encounter.pageRanges,
    pass_0_5_confidence: encounter.confidence,
    source_method: 'ai_pass_0_5',
    requires_review: encounter.summary === null || encounter.confidence < 0.80,
    // ... other fields
  });
```

---

### 4. File Metadata Retrieval

**File:** `manifestBuilder.ts` or wherever shell_files is queried

**Ensure file metadata is available for fallback logic:**

```typescript
// Query shell_files to get file creation metadata
const { data: shellFileData } = await supabase
  .from('shell_files')
  .select('created_at, original_filename')
  .eq('id', shellFileId)
  .single();

const shellFileMetadata = {
  createdAt: shellFileData?.created_at ? new Date(shellFileData.created_at) : undefined,
  modifiedAt: undefined,  // Not currently tracked
  uploadTimestamp: shellFileData?.created_at ? new Date(shellFileData.created_at) : new Date()
};

// Pass this to mapAIEncounterToMetadata()
```

---

## Testing Scenarios

### Scenario 1: Multi-Day Hospital Admission (Real-World)

**AI Output (v2.9):**
```json
{
  "encounter_id": "enc-1",
  "encounterType": "inpatient",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2025-06-15", "end": "2025-06-18"},
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted",
  "provider": "Dr. Sarah Johnson",
  "facility": "St Vincent's Hospital"
}
```

**Worker Output → Database:**
```typescript
{
  encounter_start_date: "2025-06-15",
  encounter_date_end: "2025-06-18",
  encounter_timeframe_status: "completed",
  date_source: "ai_extracted"
}
```

### Scenario 2: Single-Day GP Visit (Real-World)

**AI Output (v2.9):**
```json
{
  "dateRange": {"start": "2025-10-27", "end": "2025-10-27"},
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted"
}
```

**Worker Output → Database:**
```typescript
{
  encounter_start_date: "2025-10-27",
  encounter_date_end: "2025-10-27",  // Same day
  encounter_timeframe_status: "completed",
  date_source: "ai_extracted"
}
```

### Scenario 3: Lab Report with Date (Pseudo → Real)

**AI Output (v2.9):**
```json
{
  "encounterType": "outpatient",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2025-07-03", "end": "2025-07-03"},
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted"
}
```

**Worker Output → Database:**
```typescript
{
  encounter_start_date: "2025-07-03",
  encounter_date_end: "2025-07-03",
  encounter_timeframe_status: "completed",
  date_source: "ai_extracted"
}
```

### Scenario 4: Medication List Photo (Pseudo, No Date)

**AI Output (v2.9):**
```json
{
  "encounterType": "pseudo_medication_list",
  "isRealWorldVisit": false,
  "dateRange": null,
  "encounterTimeframeStatus": "completed",
  "dateSource": null
}
```

**Worker Applies Fallback:**
```typescript
// File metadata available
shellFileMetadata.createdAt = "2025-11-01T08:30:00Z"

// Worker output → Database:
{
  encounter_start_date: "2025-11-01",  // From file metadata
  encounter_date_end: "2025-11-01",    // Same as start (pseudo = completed)
  encounter_timeframe_status: "completed",
  date_source: "file_metadata"  // Fallback applied
}
```

### Scenario 5: Ongoing Hospital Admission (Rare)

**AI Output (v2.9):**
```json
{
  "encounterType": "inpatient",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2025-11-01", "end": null},
  "encounterTimeframeStatus": "ongoing",
  "dateSource": "ai_extracted"
}
```

**Worker Output → Database:**
```typescript
{
  encounter_start_date: "2025-11-01",
  encounter_date_end: null,  // Still admitted
  encounter_timeframe_status: "ongoing",
  date_source: "ai_extracted"
}
```

---

## Implementation Checklist

**Type Updates:**
- [ ] Update `EncounterMetadata` interface in `types.ts`
- [ ] Rename `encounterDate` → `encounterStartDate`
- [ ] Add `encounterTimeframeStatus` field
- [ ] Add `dateSource` field

**Worker Logic:**
- [ ] Create `mapAIEncounterToMetadata()` function in `manifestBuilder.ts`
- [ ] Implement Branch A logic (real-world encounters - direct mapping)
- [ ] Implement Branch B logic (pseudo encounters - date fallback)
- [ ] Query shell_files for file creation metadata
- [ ] Pass metadata to mapping function

**Database Updates:**
- [ ] Update UPSERT statement with new column names
- [ ] Add `encounter_timeframe_status` to UPSERT
- [ ] Add `date_source` to UPSERT
- [ ] Update `encounter_date` → `encounter_start_date`

**Testing:**
- [ ] Test multi-day hospital admission (dateRange with both start/end)
- [ ] Test single-day visit (dateRange with same start/end)
- [ ] Test pseudo with AI date (dateSource = ai_extracted)
- [ ] Test pseudo without date (dateSource = file_metadata fallback)
- [ ] Test pseudo without date or metadata (dateSource = upload_date fallback)
- [ ] Verify database records match expected schema

---

## Files to Update

1. **Source of Truth:**
   - `/shared/docs/architecture/.../current_workers/exora-v3-worker/src/pass05/types.ts` (if exists)
   - `/shared/docs/architecture/.../current_workers/exora-v3-worker/src/pass05/manifestBuilder.ts` (if exists)

2. **Deployed Version:**
   - `/apps/render-worker/src/pass05/types.ts`
   - `/apps/render-worker/src/pass05/manifestBuilder.ts`
   - `/apps/render-worker/src/pass05/databaseWriter.ts` (if UPSERT is here)

3. **Sync both locations after updates**

---

**Last Updated:** 2025-11-06
**Status:** Specification complete - Ready for implementation
**Next Step:** Implement changes in manifestBuilder.ts and types.ts
**Dependencies:** Migration 42 must complete before deployment
