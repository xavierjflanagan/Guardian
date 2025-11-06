# Pass 0.5 Prompt v2.9 Specification

**Date:** 2025-11-06
**Base Version:** v2.8 (aiPrompts.v2.8.ts)
**Purpose:** Add encounter timeframe status detection + date source tracking

---

## Changes Required

### 1. Add New Fields to JSON Output Schema

**Current v2.8 Schema:**
```json
{
  "encounters": [
    {
      "encounter_id": "enc-N",
      "encounterType": "EncounterType",
      "isRealWorldVisit": boolean,
      "dateRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} | null,
      "provider": "string" | null,
      "facility": "string" | null,
      "summary": "string",
      "confidence": 0.0-1.0,
      "pageRanges": [[startPage, endPage]],
      "extractedText": "string (optional)"
    }
  ]
}
```

**New v2.9 Schema (additions marked with // NEW):**
```json
{
  "encounters": [
    {
      "encounter_id": "enc-N",
      "encounterType": "EncounterType",
      "isRealWorldVisit": boolean,
      "dateRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} | null,
      "encounterTimeframeStatus": "completed" | "ongoing" | "unknown_end_date",  // NEW
      "dateSource": "ai_extracted" | "file_metadata" | "upload_date" | null,  // NEW
      "provider": "string" | null,
      "facility": "string" | null,
      "summary": "string",
      "confidence": 0.0-1.0,
      "pageRanges": [[startPage, endPage]],
      "extractedText": "string (optional)"
    }
  ]
}
```

---

### 2. Add Encounter Timeframe Detection Section

**Insert after "Common Patterns" section (before "Boundary Verification Step"):**

```markdown
# Encounter Timeframe Status Determination

For **REAL-WORLD ENCOUNTERS** (`isRealWorldVisit = true`), analyze the document to determine the encounter timeframe status:

## Status Categories

### 1. COMPLETED Encounters (`encounterTimeframeStatus: "completed"`)

**Multi-Day Encounters (Hospital Admissions):**
- Look for: "Admission date: [X]", "Discharge date: [Y]"
- Look for: "3-day hospital stay", "admitted [date], discharged [date]"
- Look for: "Patient was admitted on [date] and discharged on [date]"
- Return: `dateRange.start` = admission date, `dateRange.end` = discharge date
- Set: `encounterTimeframeStatus = "completed"`

**Single-Day Encounters (GP visits, specialist consults, same-day ER):**
- Look for: Single date only, no admission/discharge language
- Look for: "Clinic visit on [date]", "Office visit [date]"
- Return: `dateRange.start` = visit date, `dateRange.end` = same date
- Set: `encounterTimeframeStatus = "completed"`

### 2. ONGOING Encounters (`encounterTimeframeStatus: "ongoing"`)

**Currently Admitted Patients:**
- Look for: "currently admitted", "ongoing treatment", "patient remains hospitalized"
- Look for: "Admission date: [X]" with no discharge date mentioned
- Look for: Progress notes during active hospital stay
- Return: `dateRange.start` = admission date, `dateRange.end = null`
- Set: `encounterTimeframeStatus = "ongoing"`

### 3. UNKNOWN END DATE (`encounterTimeframeStatus: "unknown_end_date"`)

**Uncertain Completion Status:**
- Found start date but cannot determine if encounter is completed or ongoing
- Document doesn't explicitly indicate completion or ongoing status
- Return: `dateRange.start` = found date, `dateRange.end = null`
- Set: `encounterTimeframeStatus = "unknown_end_date"`

## For PSEUDO ENCOUNTERS

**All pseudo encounters (`isRealWorldVisit = false`):**
- Always set: `encounterTimeframeStatus = "completed"`
- Rationale: Pseudo encounters are observations/documents, not ongoing care relationships
- The worker will handle date fallback logic for pseudo encounters without dates
```

---

### 3. Add Date Source Detection Section

**Insert after "Encounter Timeframe Status Determination" section:**

```markdown
# Date Source Tracking

For ALL encounters, indicate how the encounter date was determined:

## Date Source Categories

### ai_extracted
- AI successfully extracted a specific date from document content
- Examples: "Visit Date: 10/27/2025", "Collected: 03-Jul-2025", "Admission: June 22, 2025"
- This is the PREFERRED source (highest quality)

### null (for pseudo encounters without dates)
- No date found in document content
- Set `dateRange = null` and `dateSource = null`
- Worker will apply fallback logic (file metadata or upload date)

## Rules

**Real-World Encounters:**
- MUST have `dateSource = "ai_extracted"` (by definition, timeline-worthy = has specific date)
- If you cannot extract a date from a real-world encounter, reconsider if it should be real-world

**Pseudo Encounters:**
- Set `dateSource = "ai_extracted"` if date found (e.g., lab collection date, medication fill date)
- Set `dateSource = null` if no date found (worker will apply fallback)

**Examples:**
```json
{
  "encounter_id": "enc-1",
  "encounterType": "outpatient",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2025-07-03", "end": "2025-07-03"},
  "encounterTimeframeStatus": "completed",
  "dateSource": "ai_extracted"
}
```

```json
{
  "encounter_id": "enc-2",
  "encounterType": "pseudo_medication_list",
  "isRealWorldVisit": false,
  "dateRange": null,
  "encounterTimeframeStatus": "completed",
  "dateSource": null
}
```
```

---

### 4. Update Examples

**Update Example 1 (Multi-Encounter Frankenstein File):**

Add new fields to both encounters:
```json
{
  "encounter_id": "enc-1",
  "encounterType": "specialist_consultation",
  "isRealWorldVisit": true,
  "dateRange": {
    "start": "2025-10-27",
    "end": "2025-10-27"  // UPDATED: Same-day visit
  },
  "encounterTimeframeStatus": "completed",  // NEW
  "dateSource": "ai_extracted",  // NEW
  "provider": "Mara Ehret, PA-C",
  "facility": "Interventional Spine & Pain PC",
  "summary": "Pain management specialist visit on October 27, 2025 for post-procedure follow-up",
  "confidence": 0.96,
  "pageRanges": [[1, 12]],
  "extractedText": "INTERVENTIONAL SPINE & PAIN PC - Visit Date: 10/27/2025..."
}
```

**Update Example 2 (Mixed Real and Pseudo):**

Add new fields to both encounters:
```json
{
  "encounter_id": "enc-1",
  "encounterType": "pseudo_medication_list",
  "isRealWorldVisit": false,
  "dateRange": null,
  "encounterTimeframeStatus": "completed",  // NEW
  "dateSource": null,  // NEW: No date in document
  "provider": null,
  "facility": "Sydney Hospital Pharmacy",
  "summary": "Pharmacy dispensing label for moxifloxacin 400 mg",
  "confidence": 0.90,
  "pageRanges": [[1, 1]]
}
```

**Add New Example 4: Multi-Day Hospital Admission**

```markdown
## Example 4: Multi-Day Hospital Admission (Real-World)
**Input:** 8-page discharge summary with admission and discharge dates
**Output:**
\`\`\`json
{
  "page_assignments": [
    {"page": 1, "encounter_id": "enc-1", "justification": "Discharge Summary header for St Vincent's Hospital admission"},
    {"page": 8, "encounter_id": "enc-1", "justification": "Discharge instructions completing the hospital stay documentation"}
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
      "encounterType": "inpatient",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-06-15",
        "end": "2025-06-18"
      },
      "encounterTimeframeStatus": "completed",
      "dateSource": "ai_extracted",
      "provider": "Dr. Sarah Johnson, MD",
      "facility": "St Vincent's Hospital",
      "summary": "Inpatient admission from June 15-18, 2025 at St Vincent's Hospital for pneumonia management",
      "confidence": 0.98,
      "pageRanges": [[1, 8]],
      "extractedText": "DISCHARGE SUMMARY - Admission: 06/15/2025, Discharge: 06/18/2025..."
    }
  ]
}
\`\`\`
```

---

### 5. Update Field Requirements Section

**Replace "dateRange" subsection with:**

```markdown
**dateRange:**
- Use ISO date format: YYYY-MM-DD (preferred) or YYYY-MM (if only month known)
- **For single-day encounters:** Set `start` and `end` to the SAME date (explicit completion)
- **For multi-day encounters:** Set `start` = admission date, `end` = discharge date
- **For ongoing encounters:** Set `start` = admission date, `end = null`
- **For unknown end date:** Set `start` = found date, `end = null`
- **For pseudo-encounters without dates:** Set entire `dateRange = null`
- For planned encounters, populate with future date(s)

**encounterTimeframeStatus:** (NEW)
- Must be one of: "completed", "ongoing", "unknown_end_date"
- For real-world encounters: Analyze document to determine status (see Timeframe Status section)
- For pseudo encounters: Always "completed"
- For planned encounters: Always "completed" (future appointment is a complete plan)

**dateSource:** (NEW)
- Must be one of: "ai_extracted", null
- "ai_extracted": Date successfully extracted from document content
- null: No date found (pseudo encounters only - worker will apply fallback)
```

---

### 6. Update Critical Rules Section

**Add new rules:**

```markdown
- For single-day completed encounters, set `dateRange.end` to the same value as `dateRange.start`
- For multi-day hospital admissions, extract both admission and discharge dates
- Always populate `encounterTimeframeStatus` based on document analysis
- Set `dateSource = "ai_extracted"` for all real-world encounters (by definition they have dates)
- For pseudo encounters without dates, set `dateRange = null` and `dateSource = null`
```

---

## Implementation Checklist

- [ ] Create new file: `apps/render-worker/src/pass05/aiPrompts.v2.9.ts`
- [ ] Copy entire v2.8 prompt as base
- [ ] Add new fields to JSON schema example (Section 1)
- [ ] Insert "Encounter Timeframe Status Determination" section (Section 2)
- [ ] Insert "Date Source Tracking" section (Section 3)
- [ ] Update all examples with new fields (Section 4)
- [ ] Update Field Requirements section (Section 5)
- [ ] Update Critical Rules section (Section 6)
- [ ] Update encounterDiscovery.ts to support v2.9
- [ ] Update types.ts to include new fields in EncounterMetadata interface
- [ ] Set PASS_05_VERSION=v2.9 in environment configuration
- [ ] Test with sample discharge summary (multi-day)
- [ ] Test with sample single-day visit
- [ ] Test with pseudo encounter (no date)

---

## Backward Compatibility

**Worker Code Mapping:**

The worker's `manifestBuilder.ts` will need to map v2.9 JSON output to database schema:

```typescript
// From AI JSON response:
encounter.dateRange.start → encounter_start_date
encounter.dateRange.end → encounter_date_end
encounter.encounterTimeframeStatus → encounter_timeframe_status
encounter.dateSource → date_source (if null, apply fallback logic)
```

**Fallback Logic (in manifestBuilder.ts):**

```typescript
if (encounter.dateSource === null && !encounter.isRealWorldVisit) {
  // Pseudo encounter without AI-extracted date
  // Apply waterfall: file_metadata → upload_date
  if (fileMetadata?.createdAt) {
    encounter_start_date = fileMetadata.createdAt;
    date_source = 'file_metadata';
  } else {
    encounter_start_date = uploadTimestamp;
    date_source = 'upload_date';
  }
  encounter_date_end = encounter_start_date; // Pseudo = completed
}
```

---

**Last Updated:** 2025-11-06
**Status:** Specification complete - Ready for implementation
**Next Step:** Create aiPrompts.v2.9.ts based on this specification
