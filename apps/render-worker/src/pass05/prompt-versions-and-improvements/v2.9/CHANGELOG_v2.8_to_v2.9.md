# Changelog: Pass 0.5 v2.8 → v2.9

**Release Date:** 2025-11-06
**Migration:** Migration 42 (healthcare_encounters timeframe redesign)
**Status:** Ready for implementation

---

## Overview

Version 2.9 adds encounter timeframe status detection and date source tracking to support the healthcare_encounters table schema redesign (Migration 42).

**Key Features:**
- Multi-day hospital admission support (admission + discharge dates)
- Encounter timeframe status determination (completed | ongoing | unknown_end_date)
- Date source transparency tracking (ai_extracted | null for fallback)
- Single-day encounter explicit completion (start_date = end_date)

---

## Schema Changes

### Database Schema (Migration 42)

**Column Changes:**
```sql
-- RENAMED
encounter_date → encounter_start_date

-- ADDED
encounter_timeframe_status TEXT CHECK (status IN ('completed', 'ongoing', 'unknown_end_date'))
date_source TEXT CHECK (source IN ('ai_extracted', 'file_metadata', 'upload_date'))

-- DROPPED
visit_duration_minutes
confidence_score
ai_confidence
```

### AI Response Schema Changes

**New Fields Added to JSON Output:**

```json
{
  "encounters": [
    {
      // ... existing fields ...
      "encounterTimeframeStatus": "completed",  // NEW
      "dateSource": "ai_extracted"  // NEW
    }
  ]
}
```

**Field Definitions:**

**encounterTimeframeStatus:**
- `"completed"`: Encounter has ended (single-day visit OR multi-day with discharge)
- `"ongoing"`: Currently admitted/ongoing care (hospital admission without discharge)
- `"unknown_end_date"`: Start date found but unclear if completed or ongoing

**dateSource:**
- `"ai_extracted"`: Date successfully extracted from document content (high quality)
- `null`: No date found in document (pseudo encounters only - worker applies fallback)

---

## Prompt Changes

### 1. New Section: Encounter Timeframe Status Determination

Added comprehensive instructions for analyzing encounter timeframes:

**Multi-Day Encounters (Hospital Admissions):**
- Detect: "Admission date: [X]", "Discharge date: [Y]"
- Extract both dates: `dateRange.start` = admission, `dateRange.end` = discharge
- Set: `encounterTimeframeStatus = "completed"`

**Single-Day Encounters (GP/Specialist/ER):**
- Detect: Single date only, no admission/discharge language
- Set both dates to same value: `dateRange.end = dateRange.start`
- Set: `encounterTimeframeStatus = "completed"`

**Ongoing Encounters (Rare):**
- Detect: "currently admitted", "patient remains hospitalized"
- Extract admission date only: `dateRange.end = null`
- Set: `encounterTimeframeStatus = "ongoing"`

**Pseudo Encounters:**
- Always: `encounterTimeframeStatus = "completed"` (observations are complete)

### 2. New Section: Date Source Tracking

Instructions for indicating date extraction success:

- Set `dateSource = "ai_extracted"` when date found in document
- Set `dateSource = null` when no date found (pseudo encounters only)
- Real-world encounters MUST have `dateSource = "ai_extracted"` (by definition)

### 3. Updated Examples

**Added Example 4: Multi-Day Hospital Admission**
```json
{
  "encounter_id": "enc-1",
  "encounterType": "inpatient",
  "dateRange": {
    "start": "2025-06-15",
    "end": "2025-06-18"  // Discharge date extracted
  },
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted"
}
```

**Updated Existing Examples:**
- All examples now include `encounterTimeframeStatus` field
- All examples now include `dateSource` field
- Single-day encounters now show `dateRange.end = dateRange.start` (explicit)

### 4. Updated Field Requirements

**dateRange:**
- Single-day encounters: Set `end` to SAME date as `start` (was: `end = null`)
- Multi-day encounters: Extract both admission and discharge dates
- Ongoing encounters: Set `end = null` with status = "ongoing"
- Pseudo without dates: Set entire `dateRange = null`

**Critical Rules Added:**
- "For single-day completed encounters, set dateRange.end to the same value as dateRange.start"
- "For multi-day hospital admissions, extract both admission and discharge dates"
- "Always populate encounterTimeframeStatus based on document analysis"

---

## Worker Changes

### TypeScript Interface Updates

**EncounterMetadata Interface:**

```typescript
// RENAMED FIELD
encounterDate → encounterStartDate

// NEW FIELDS
encounterTimeframeStatus: 'completed' | 'ongoing' | 'unknown_end_date'
dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date'
```

### Two-Branch Logic Implementation

**Branch A: Real-World Encounters**
- Direct mapping from AI response
- AI provides dates, timeframe status, and date source
- No fallback needed (timeline-worthy = has dates)

**Branch B: Pseudo Encounters**
- AI may or may not provide date
- If `dateSource = null`, worker applies fallback:
  1. Try file creation metadata → `dateSource = 'file_metadata'`
  2. Fall back to upload timestamp → `dateSource = 'upload_date'`
- Always: `encounterDateEnd = encounterStartDate` (completed observation)
- Always: `encounterTimeframeStatus = 'completed'`

### Database UPSERT Updates

**Updated Column Names:**
```typescript
{
  encounter_start_date: encounter.encounterStartDate,  // RENAMED
  encounter_date_end: encounter.encounterDateEnd,
  encounter_timeframe_status: encounter.encounterTimeframeStatus,  // NEW
  date_source: encounter.dateSource,  // NEW
}
```

---

## Breaking Changes

**None - Backward compatible with v2.8 for worker code**

The worker can handle v2.8 AI responses (missing new fields) with defaults:
- Missing `encounterTimeframeStatus` → default to `'completed'`
- Missing `dateSource` → default to `'ai_extracted'` for real-world, `null` for pseudo

However, **Migration 42 must complete** before deploying v2.9 (database schema changes required).

---

## Migration Path

### Pre-Deployment Checklist

- [ ] Migration 42 executed successfully
- [ ] Database columns verified:
  - [ ] `encounter_start_date` exists (renamed from `encounter_date`)
  - [ ] `encounter_timeframe_status` exists with CHECK constraint
  - [ ] `date_source` exists with CHECK constraint
  - [ ] Redundant columns dropped (visit_duration_minutes, confidence_score, ai_confidence)
- [ ] Bridge schemas updated
- [ ] Source of truth schemas updated

### Deployment Steps

1. **Execute Migration 42** (database schema changes)
2. **Update worker code** (types.ts, manifestBuilder.ts)
3. **Deploy aiPrompts.v2.9.ts** to worker
4. **Set environment variable** `PASS_05_VERSION=v2.9`
5. **Deploy to Render.com**
6. **Test with sample documents** (multi-day admission, single-day visit, pseudo without date)
7. **Validate database records** (verify new columns populated correctly)

---

## Testing Requirements

### Test Documents Needed

1. **Multi-day hospital admission** (discharge summary with admission + discharge dates)
   - Expected: Both dates extracted, status = "completed"

2. **Single-day GP visit** (clinic note with one date)
   - Expected: start_date = end_date (same), status = "completed"

3. **Lab report with collection date** (pathology result)
   - Expected: Date extracted, status = "completed", real-world encounter

4. **Medication list photo** (no date visible)
   - Expected: Fallback to file_metadata or upload_date, status = "completed"

5. **Ongoing hospital admission** (progress note during stay - rare)
   - Expected: Admission date only, end_date = null, status = "ongoing"

### Validation Checks

- [ ] All real-world encounters have `dateSource = 'ai_extracted'`
- [ ] Single-day encounters have `start_date = end_date` (not null)
- [ ] Multi-day encounters have different start/end dates
- [ ] Pseudo encounters without dates have fallback date_source
- [ ] All encounters have `encounterTimeframeStatus` populated
- [ ] Database CHECK constraints not violated

---

## Rollback Plan

If issues arise:

1. **Keep Migration 42** (database changes are safe - defaults applied)
2. **Revert to v2.8 prompt** (`PASS_05_VERSION=v2.8`)
3. **Revert worker code** (restore v2.8 UPSERT statement)
4. New columns will remain empty but won't break existing functionality

---

## Performance Impact

**No significant performance impact expected:**

- AI now extracts 2 additional fields (minimal token overhead)
- Worker adds simple waterfall fallback logic (negligible CPU)
- Database has 2 new columns (minimal storage impact)
- No new database queries required

---

## Related Documentation

- **Migration:** `migration_history/2025-11-06_42_healthcare_encounters_timeframe_redesign.sql`
- **Audit File:** `pass05-audits/pass05-individual-table-audits/healthcare_encounters-COLUMN-AUDIT-ANSWERS.md`
- **Prompt Spec:** `apps/render-worker/src/pass05/PROMPT_v2.9_SPECIFICATION.md`
- **Worker Spec:** `apps/render-worker/src/pass05/WORKER_LOGIC_UPDATE_SPECIFICATION.md`

---

**Created:** 2025-11-06
**Status:** Ready for implementation and testing
**Next Steps:** Execute Migration 42, then deploy v2.9 prompt and worker updates
