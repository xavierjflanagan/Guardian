# Pass 0.5 Column Audit: healthcare_encounters

**Date:** 2025-11-03 (original), 2025-11-04 (user review), 2025-11-06 (major update)
**Status:** IMPLEMENTATION REQUIRED - Schema changes and worker logic updates needed
**Context:** Comprehensive analysis of `healthcare_encounters` table with encounter date/timeframe redesign

**Location:** `shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql:519`

---

## Executive Summary

### What's Been Fixed (4th-6th Nov 2025)

**Major Improvements Completed:**
1. ✅ `summary` column - NOW POPULATED with AI-generated plain English descriptions
2. ✅ `pass_0_5_confidence` column - NOW POPULATED with confidence scores
3. ✅ `spatial_bounds` column - NOW POPULATED with bounding box data
4. ✅ `source_method` column - RENAMED from `ai_extracted` and populated with 'ai_pass_0_5'
5. ✅ `facility_name` column - NOW POPULATED for all encounter types
6. ✅ `provider_name` column - NOW POPULATED where applicable

### What Needs Implementation (This Document)

**Critical Design Changes:**
1. ⚠️ RENAME `encounter_date` → `encounter_start_date` (clarity)
2. ⚠️ ADD `encounter_timeframe_status` column (completed | ongoing | unknown_end_date)
3. ⚠️ POPULATE `encounter_date_end` with two-branch logic:
   - **Pseudo encounters:** start_date = end_date (always completed)
   - **Real-world encounters:** AI extracts both dates for multi-day stays
4. ⚠️ ADD `date_source` column with waterfall fallback logic
5. ⚠️ UPDATE AI prompt to extract start/end dates + determine timeframe status
6. ⚠️ UPDATE worker logic with pseudo vs real-world branching

---

## Design Rationale

### Problem Statement

**Original Issue:** `encounter_date_end` always NULL - ambiguous meaning
- Does NULL mean single-day encounter? (completed)
- Does NULL mean ongoing encounter? (hospital admission in progress)
- Does NULL mean unknown end date? (AI couldn't find it)

**User Insight:** "Hospital discharge summaries (25%+ of documents) are multi-day stays with admission + discharge dates. We need to record both."

### Solution: Semantic Clarity + AI Intelligence

**1. Rename for Clarity**
```sql
encounter_date → encounter_start_date  -- Unambiguous semantics
```

**2. Add Status Column**
```sql
encounter_timeframe_status TEXT CHECK (
  encounter_timeframe_status IN ('completed', 'ongoing', 'unknown_end_date')
)
```

**3. Two-Branch Logic**

**Branch A: Pseudo Encounters (Simple Rule)**
- `is_real_world_visit = FALSE`
- Clinical observation without provider/facility/location
- Dates often lower quality (file_metadata or upload_date)
- Logic: `encounter_date_end = encounter_start_date` (observation is complete)
- Status: Always `'completed'`

**Branch B: Real-World Encounters (AI-Driven)**
- `is_real_world_visit = TRUE`
- Actual visit with provider/facility/location
- AI analyzes document for temporal context
- Logic: Extract admission + discharge dates when present
- Status: `'completed'` | `'ongoing'` | `'unknown_end_date'`

**AI Detection Scenarios (Real-World Encounters):**

| Document Type | Start Date | End Date | Status | Logic |
|---------------|------------|----------|--------|-------|
| Discharge summary (multi-day) | Admission date | Discharge date | `'completed'` | AI extracts both |
| Discharge summary (ongoing) | Admission date | NULL | `'ongoing'` | Currently admitted |
| Single-day visit (GP, specialist) | Visit date | Same as start | `'completed'` | Only one date present |
| Document with unclear end | Visit date | NULL | `'unknown_end_date'` | AI couldn't determine |

---

## Schema Changes Required

### 1. Column Rename

```sql
ALTER TABLE healthcare_encounters
RENAME COLUMN encounter_date TO encounter_start_date;
```

**Rationale:** Removes semantic ambiguity between "date" and "start date"

### 2. New Status Column

```sql
ALTER TABLE healthcare_encounters
ADD COLUMN encounter_timeframe_status TEXT NOT NULL DEFAULT 'completed'
CHECK (encounter_timeframe_status IN ('completed', 'ongoing', 'unknown_end_date'));
```

**Rationale:** Explicit status removes NULL ambiguity for `encounter_date_end`

### 3. Date Source Column (from previous audit)

```sql
ALTER TABLE healthcare_encounters
ADD COLUMN date_source TEXT NOT NULL DEFAULT 'upload_date'
CHECK (date_source IN ('ai_extracted', 'file_metadata', 'upload_date'));
```

**Rationale:** Tracks date quality/confidence for pseudo encounters with fallback dates

### 4. Cleanup Redundant Columns (from previous audit)

```sql
ALTER TABLE healthcare_encounters DROP COLUMN visit_duration_minutes;
ALTER TABLE healthcare_encounters DROP COLUMN confidence_score;
ALTER TABLE healthcare_encounters DROP COLUMN ai_confidence;
```

**Rationale:** Low value, redundant, rarely populated

---

## Pass 0.5 Worker Logic Updates

### Current File Structure

**Worker Location (Source of Truth):**
`shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/src/pass05/manifestBuilder.ts`

**Worker Location (Deployed - May Be Outdated):**
`apps/render-worker/src/pass05/manifestBuilder.ts`

**Note:** Both locations must be updated and synced

### Implementation: Two-Branch Encounter Logic

```typescript
// ============================================
// BRANCH A: PSEUDO ENCOUNTERS (Simple)
// ============================================
if (!is_real_world_visit) {
  // Pseudo encounter = clinical observation without provider/facility

  // Date waterfall logic (ensures all pseudo encounters get SOME date)
  let encounter_start_date: Date | null = null;
  let date_source: 'ai_extracted' | 'file_metadata' | 'upload_date' = 'upload_date';

  if (aiExtractedDate) {
    encounter_start_date = aiExtractedDate;
    date_source = 'ai_extracted';
  } else if (fileMetadata?.createdAt || fileMetadata?.modifiedAt) {
    encounter_start_date = fileMetadata.createdAt || fileMetadata.modifiedAt;
    date_source = 'file_metadata';
  } else {
    encounter_start_date = uploadTimestamp;
    date_source = 'upload_date';
  }

  // Simple rule: start = end (observation is complete)
  const encounter_date_end = encounter_start_date;
  const encounter_timeframe_status = 'completed';
}

// ============================================
// BRANCH B: REAL-WORLD ENCOUNTERS (AI-Driven)
// ============================================
else {
  // Real-world visit = has provider/facility/location data

  let encounter_start_date: Date;
  let encounter_date_end: Date | null;
  let encounter_timeframe_status: 'completed' | 'ongoing' | 'unknown_end_date';
  let date_source: 'ai_extracted' | 'file_metadata' | 'upload_date';

  // AI analyzes document for temporal context
  if (aiDetectedDischargeDate) {
    // Multi-day hospital stay with admission + discharge dates
    encounter_start_date = aiExtractedAdmissionDate;
    encounter_date_end = aiExtractedDischargeDate;
    encounter_timeframe_status = 'completed';
    date_source = 'ai_extracted';

  } else if (aiIndicatesOngoing) {
    // Currently admitted patient (discharge summary produced mid-stay)
    encounter_start_date = aiExtractedAdmissionDate;
    encounter_date_end = null;
    encounter_timeframe_status = 'ongoing';
    date_source = 'ai_extracted';

  } else if (aiFoundOnlyOneDate) {
    // Single-day visit (GP, specialist, ER with same-day discharge)
    encounter_start_date = aiExtractedDate;
    encounter_date_end = aiExtractedDate;  // Same day = completed
    encounter_timeframe_status = 'completed';
    date_source = 'ai_extracted';

  } else {
    // AI found date but uncertain about end date
    encounter_start_date = aiExtractedDate || fileMetadata?.createdAt || uploadTimestamp;
    encounter_date_end = null;
    encounter_timeframe_status = 'unknown_end_date';
    date_source = aiExtractedDate ? 'ai_extracted' : 'file_metadata';
  }
}
```

---

## AI Prompt Updates Required

### Add to Pass 0.5 Prompt

**Section: Encounter Date Extraction**

```
For REAL-WORLD ENCOUNTERS (is_real_world_visit = TRUE):

Analyze the document to determine the encounter timeframe:

1. MULTI-DAY ENCOUNTERS (Hospital Admissions, Inpatient Care):
   - Look for: "Admission date: [X]", "Discharge date: [Y]"
   - Look for: "3-day hospital stay", "admitted [date], discharged [date]"
   - Return: encounter_start_date = admission, encounter_date_end = discharge
   - Set: encounter_timeframe_status = "completed"

2. ONGOING ENCOUNTERS (Currently Admitted):
   - Look for: "currently admitted", "ongoing treatment", "patient remains hospitalized"
   - Return: encounter_start_date = admission, encounter_date_end = null
   - Set: encounter_timeframe_status = "ongoing"

3. SINGLE-DAY ENCOUNTERS (GP visits, specialist consults, same-day ER):
   - Look for: Single date only, no admission/discharge language
   - Return: encounter_start_date = date, encounter_date_end = same date
   - Set: encounter_timeframe_status = "completed"

4. UNCERTAIN END DATE:
   - Found start date but cannot determine if completed or ongoing
   - Return: encounter_start_date = date, encounter_date_end = null
   - Set: encounter_timeframe_status = "unknown_end_date"

For PSEUDO ENCOUNTERS (is_real_world_visit = FALSE):
   - Extract date if present (lab test date, medication fill date, etc.)
   - Worker will handle fallback to file metadata or upload date
   - Worker will automatically set end_date = start_date (completed observation)
```

---

## Database UPSERT Updates

### Current UPSERT Location

File: `manifestBuilder.ts` (both source of truth and deployed versions)

### Required Changes

```typescript
// Update the healthcare_encounters UPSERT statement

const { data: encounterData, error: encounterError } = await supabase
  .from('healthcare_encounters')
  .upsert({
    id: encounterId,
    patient_id: patientId,
    encounter_type: encounterType,

    // NEW SCHEMA: Renamed column
    encounter_start_date: encounter_start_date,  // Was: encounter_date

    // UPDATED LOGIC: Populated via two-branch logic
    encounter_date_end: encounter_date_end,

    // NEW COLUMN: Status tracking
    encounter_timeframe_status: encounter_timeframe_status,

    // NEW COLUMN: Date quality tracking
    date_source: date_source,

    // Existing columns...
    provider_name: providerName,
    facility_name: facilityName,
    summary: summary,
    spatial_bounds: spatialBounds,
    page_ranges: pageRanges,
    is_real_world_visit: isRealWorldVisit,
    pass_0_5_confidence: confidence,
    source_method: 'ai_pass_0_5',
    requires_review: requiresReview,
    // ... other fields
  })
  .select()
  .single();
```

---

## TypeScript Interface Updates

### Update EncounterMetadata Interface

File: Worker type definitions (check both source and deployed)

```typescript
interface EncounterMetadata {
  encounterId: string;
  encounterType: string;

  // RENAMED FIELD
  encounterStartDate: string | null;  // Was: encounterDate

  // UPDATED FIELD
  encounterDateEnd: string | null;    // Now actively populated

  // NEW FIELDS
  encounterTimeframeStatus: 'completed' | 'ongoing' | 'unknown_end_date';
  dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

  // Existing fields...
  providerName: string | null;
  facilityName: string | null;
  summary: string;
  spatialBounds: SpatialBound[];
  pageRanges: number[][];
  isRealWorldVisit: boolean;
  confidence: number;
  // ...
}
```

---

## Testing Requirements

### Test Scenarios

**1. Multi-Day Hospital Admission (Real-World)**
- Upload: Discharge summary with admission + discharge dates
- Expected:
  - `encounter_start_date` = admission date
  - `encounter_date_end` = discharge date
  - `encounter_timeframe_status` = 'completed'
  - `date_source` = 'ai_extracted'
  - `is_real_world_visit` = TRUE

**2. Single-Day GP Visit (Real-World)**
- Upload: Clinic visit note with one date
- Expected:
  - `encounter_start_date` = visit date
  - `encounter_date_end` = visit date (same)
  - `encounter_timeframe_status` = 'completed'
  - `date_source` = 'ai_extracted'
  - `is_real_world_visit` = TRUE

**3. Lab Report (Pseudo Encounter)**
- Upload: Pathology result with test date
- Expected:
  - `encounter_start_date` = test date
  - `encounter_date_end` = test date (same)
  - `encounter_timeframe_status` = 'completed'
  - `date_source` = 'ai_extracted'
  - `is_real_world_visit` = FALSE

**4. Medication List Photo (Pseudo, No Date)**
- Upload: Photo of medication list (no date visible)
- Expected:
  - `encounter_start_date` = file creation date or upload date
  - `encounter_date_end` = same as start date
  - `encounter_timeframe_status` = 'completed'
  - `date_source` = 'file_metadata' or 'upload_date'
  - `is_real_world_visit` = FALSE

**5. Ongoing Hospital Admission (Real-World, Rare)**
- Upload: Progress note during active admission
- Expected:
  - `encounter_start_date` = admission date
  - `encounter_date_end` = NULL
  - `encounter_timeframe_status` = 'ongoing'
  - `date_source` = 'ai_extracted'
  - `is_real_world_visit` = TRUE

---

## Implementation Checklist

### Phase 1: Database Schema Migration

- [ ] Create migration script (MCP-based migration system)
- [ ] RENAME `encounter_date` → `encounter_start_date`
- [ ] ADD `encounter_timeframe_status` column with CHECK constraint
- [ ] ADD `date_source` column with CHECK constraint
- [ ] DROP `visit_duration_minutes` column
- [ ] DROP `confidence_score` column
- [ ] DROP `ai_confidence` column
- [ ] Update `current_schema/03_clinical_core.sql` (source of truth)
- [ ] Update bridge schemas (source, detailed, minimal)
- [ ] Mark migration complete in `migration_history/`

### Phase 2: AI Prompt Updates

- [ ] Add multi-day encounter detection instructions
- [ ] Add ongoing encounter detection instructions
- [ ] Add single-day encounter logic
- [ ] Add timeframe status determination guidelines
- [ ] Test prompt with sample discharge summaries

### Phase 3: Worker Logic Updates

- [ ] Update `manifestBuilder.ts` (source of truth version)
- [ ] Implement two-branch logic (pseudo vs real-world)
- [ ] Implement date_source waterfall fallback
- [ ] Update database UPSERT statement with new columns
- [ ] Update EncounterMetadata TypeScript interface
- [ ] Test with sample documents
- [ ] Deploy to `apps/render-worker/` (sync with source of truth)
- [ ] Deploy to Render.com

### Phase 4: Testing & Validation

- [ ] Test multi-day hospital admission document
- [ ] Test single-day GP visit document
- [ ] Test pseudo encounter with AI-extracted date
- [ ] Test pseudo encounter without date (fallback logic)
- [ ] Test ongoing encounter (rare scenario)
- [ ] Validate database records match expected schema
- [ ] Validate timeline display shows correct encounter durations

---

## Questions & Decisions Log

### Resolved Questions

**Q1:** Should `encounter_date_end` be NULL for single-day encounters?
**A1 (User Decision):** NO - Set `encounter_date_end = encounter_start_date` for completed single-day encounters. Use `encounter_timeframe_status` to distinguish completed vs ongoing.

**Q2:** How to handle hospital discharge summaries with multi-day stays?
**A2 (User Decision):** Pass 0.5 AI should extract both admission and discharge dates. This is 25%+ of documents and critical data.

**Q3:** What about pseudo encounters without dates?
**A3 (User Decision):** Use waterfall fallback: ai_extracted → file_metadata → upload_date. Track source with `date_source` column. Never leave dates NULL.

**Q4:** Should we use `encounter_status` or `encounter_timeframe_status`?
**A4 (User Decision):** Use `encounter_timeframe_status` to avoid confusion with other status concepts.

**Q5:** Does Pass 1 need to modify `encounter_date_end`?
**A5 (User Decision):** NO - Pass 0.5 sets final values. Later passes should not modify encounter date fields.

### Open Questions

None - All design decisions finalized.

---

## Related Documentation

**Migration System:**
- `shared/docs/architecture/database-foundation-v3/migration_history/README.md`

**Worker Source of Truth:**
- `shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/`

**Current Schema:**
- `shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql`

**Bridge Schemas:**
- `shared/docs/architecture/database-foundation-v3/ai-processing-v3/bridge-schema-architecture/bridge-schemas/`

---

**Last Updated:** 2025-11-06
**Status:** Ready for implementation - All design decisions finalized
**Next Step:** Create migration script and proceed with implementation checklist
