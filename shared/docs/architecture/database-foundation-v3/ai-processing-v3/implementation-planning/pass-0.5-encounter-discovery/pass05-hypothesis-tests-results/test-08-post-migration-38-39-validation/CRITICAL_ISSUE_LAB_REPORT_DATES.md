# CRITICAL ISSUE: Lab Report Date Extraction Failure

**Issue ID:** PASS05-001
**Severity:** CRITICAL
**Status:** IDENTIFIED - Decision Required
**Date Discovered:** 2025-11-04
**Affects:** Patient timelines, analytics, date tracking for lab tests

---

## Problem Statement

Lab reports with specific collection dates are being classified as `pseudo_lab_report` encounters, resulting in:
- `encounter_date`: NULL (should contain collection date)
- `date_source`: NULL (should be 'ai_extracted')
- `is_real_world_visit`: false (questionable)
- Timeline impact: Lab tests invisible on patient medical timeline

**Example:**
```json
{
  "encounter_type": "pseudo_lab_report",
  "encounter_date": null,
  "facility_name": "NSW Health Pathology",
  "summary": "Urine Mycoplasma genitalium resistance test by NSW Health Pathology collected 03-Jul-2025; azithromycin resistance mutation detected.",
  "date_source": null,
  "is_real_world_visit": false
}
```

The date **"03-Jul-2025"** appears in the summary text but is not captured in `encounter_date`.

---

## Root Cause Analysis

### Conflicting Instructions in AI Prompt

The AI prompt contains contradictory rules:

**Rule 1: Timeline Test (Lines 213-230)**
```
Real-World Encounter (Timeline-Worthy)
A completed past visit that meets BOTH criteria:
1. Specific Date: YYYY-MM-DD or YYYY-MM format
2. Provider OR Facility: Named provider OR specific facility

Examples:
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility)
- "GP visit with Dr. Jones on 2024-01-15" (date + provider)
```

**Lab report with date meets Timeline Test:**
- Specific date: 03-Jul-2025
- Facility: NSW Health Pathology
- **Should be timeline-worthy**

**Rule 2: Pseudo-Encounter Classification (Lines 259-285)**
```
Use pseudo_lab_report ONLY when ALL conditions are met:
1. Document structure indicates laboratory report
2. Contains actual test values with units
3. Is genuinely standalone

For pseudo-encounters, leave dateRange null
```

**Contradiction:**
- Prompt says "For pseudo-encounters, leave dateRange null"
- But lab report with date + facility passes Timeline Test
- AI follows pseudo-encounter rule → dateRange remains null

### Why This Happens

The prompt treats all standalone lab reports as pseudo-encounters regardless of whether they have specific dates. The "leave dateRange null" instruction overrides the Timeline Test logic.

---

## Impact Assessment

### User Experience Impact

**What Users See:**
- Lab test results exist in document but don't appear on timeline
- Timeline shows: "GP visit on March 5" but NOT "Lab test on July 3"
- Inconsistent: Some medical events on timeline, others missing

**What Users Expect:**
- All dated medical events on timeline
- Lab results with specific collection dates should be timeline items
- Consistency: If it has a date and facility, it should appear

### Analytics Impact

**Queries That Will Fail:**
```sql
-- Find all medical events in July 2025
SELECT * FROM healthcare_encounters
WHERE encounter_date BETWEEN '2025-07-01' AND '2025-07-31';
-- Lab test on 03-Jul-2025 will NOT appear
```

**Metrics Affected:**
- Medical event frequency analysis
- Timeline density calculations
- Lab test ordering patterns
- Provider interaction timelines

### Data Integrity Impact

**Current State:**
- Date information exists (in summary text)
- Date is AI-extracted (AI found it in document)
- But date not stored in structured field
- Analytics can't query by date

**Severity: CRITICAL** because:
- Violates Timeline Test design principle
- Creates invisible timeline gaps
- Defeats purpose of structured date field

---

## Current Behavior Examples

### Example 1: Lab Report with Date (TIFF File Test)
```json
{
  "encounter_type": "pseudo_lab_report",
  "encounter_date": null,              // Should be "2025-07-03"
  "encounter_date_end": null,
  "provider_name": null,
  "facility_name": "NSW Health Pathology",
  "is_real_world_visit": false,        // Questionable
  "date_source": null,                 // Should be "ai_extracted"
  "summary": "Urine Mycoplasma genitalium resistance test by NSW Health Pathology collected 03-Jul-2025; azithromycin resistance mutation detected.",
  "pass_0_5_confidence": 0.94
}
```

**Timeline Test Evaluation:**
- Specific date: 03-Jul-2025
- Facility: NSW Health Pathology
- **Should be timeline-worthy: YES**
- **Actual behavior: Not on timeline**

### Example 2: Medication List (Correct Behavior)
```json
{
  "encounter_type": "pseudo_medication_list",
  "encounter_date": null,              // Correct (no date in document)
  "facility_name": "Sydney Hospital Pharmacy",
  "is_real_world_visit": false,        // Correct
  "date_source": null,                 // Correct (no date to track)
  "summary": "Pharmacy dispensing label for moxifloxacin 400 mg...",
  "pass_0_5_confidence": 0.90
}
```

**Timeline Test Evaluation:**
- Specific date: No date
- Facility: Pharmacy
- **Should be timeline-worthy: NO (missing date)**
- **Actual behavior: Not on timeline** Correct

---

## Proposed Fix Options

### Option A: Reclassify Dated Lab Reports as Timeline-Worthy (RECOMMENDED)

**Change:** Update AI prompt to make lab reports with specific dates real-world encounters.

**New Logic:**
```
Lab Report Classification:
1. IF lab report has specific date (YYYY-MM-DD) AND facility
   → encounterType: "lab_test" or similar
   → isRealWorldVisit: true
   → populate dateRange and date_source

2. IF lab report has vague/no date
   → encounterType: "pseudo_lab_report"
   → isRealWorldVisit: false
   → dateRange: null
```

**AI Prompt Changes:**
1. Add new encounter type: `lab_test` (or use existing encounter type)
2. Update Timeline Test section with lab report example
3. Update Pseudo-Encounter section to exclude dated labs
4. Add date extraction instructions for lab reports

**Example Output (After Fix):**
```json
{
  "encounter_type": "lab_test",        // New or repurposed type
  "encounter_date": "2025-07-03",      // FIXED
  "encounter_date_end": null,
  "provider_name": null,
  "facility_name": "NSW Health Pathology",
  "is_real_world_visit": true,         // FIXED
  "date_source": "ai_extracted",       // FIXED
  "summary": "Urine Mycoplasma genitalium resistance test...",
  "pass_0_5_confidence": 0.94
}
```

**Pros:**
- Aligns with Timeline Test principle
- Lab tests appear on patient timeline
- Analytics can query by date
- Clean semantic: timeline-worthy events have dates
- Minimal code changes (AI prompt only)

**Cons:**
- Requires new encounter type or repurposing existing type
- Need to verify EncounterType union includes lab_test (or use outpatient?)

### Option B: Allow Pseudo-Encounters to Have Dates

**Change:** Remove restriction that pseudo-encounters must have null dates.

**New Logic:**
```
Pseudo-Encounter Classification:
- Still classified as pseudo_lab_report (document type)
- But populate dateRange if specific date found
- is_real_world_visit remains false
- Frontend timeline shows pseudo-encounters with dates
```

**Example Output:**
```json
{
  "encounter_type": "pseudo_lab_report",
  "encounter_date": "2025-07-03",      // Now populated
  "is_real_world_visit": false,        // Still false
  "date_source": "ai_extracted",       // Now populated
  "summary": "Urine Mycoplasma genitalium resistance test..."
}
```

**Pros:**
- Simple prompt change (remove "leave dateRange null" rule)
- No new encounter types needed
- Preserves pseudo_lab_report classification

**Cons:**
- Semantic confusion: is_real_world_visit=false but has specific date?
- Timeline logic needs update: "Show encounters where is_real_world_visit=true OR (encounter_date IS NOT NULL)"
- Violates Timeline Test definition (timeline-worthy = real-world visit)

---

## Recommendation: Option A

**Rationale:**

1. **Semantic Clarity:** Lab tests with specific dates ARE timeline-worthy events
2. **Timeline Test Alignment:** Date + Facility = timeline item (by design)
3. **User Expectations:** "I got a lab test on July 3" should appear on timeline
4. **Clean Data Model:** Timeline events (is_real_world_visit=true) have dates, pseudo-encounters don't
5. **Analytics Simplicity:** Query "WHERE is_real_world_visit=true" gives all timeline events

**Implementation:**
1. Update AI prompt (aiPrompts.ts)
2. Add/verify encounter type for lab tests
3. Update Timeline Test section with lab example
4. Update Pseudo-Encounter section to exclude dated labs
5. Re-test with TIFF file to validate

---

## Verification Plan (After Fix)

### Test Case 1: Lab Report with Specific Date
**Input:** NSW Health Pathology lab report "collected 03-Jul-2025"

**Expected Output:**
```json
{
  "encounter_type": "lab_test",
  "encounter_date": "2025-07-03",
  "date_source": "ai_extracted",
  "is_real_world_visit": true,
  "facility_name": "NSW Health Pathology"
}
```

**Metrics Expected:**
- real_world_encounters: 1 (not 0)
- pseudo_encounters: 1 (medication list only)

### Test Case 2: Lab Report Without Date
**Input:** Standalone lab report with no collection date

**Expected Output:**
```json
{
  "encounter_type": "pseudo_lab_report",
  "encounter_date": null,
  "date_source": null,
  "is_real_world_visit": false
}
```

### Test Case 3: Medication List (Control)
**Input:** Pharmacy dispensing label with no visit date

**Expected Output:**
```json
{
  "encounter_type": "pseudo_medication_list",
  "encounter_date": null,
  "date_source": null,
  "is_real_world_visit": false
}
```

---

## Timeline for Fix

**Priority:** HIGH (affects core timeline functionality)

**Estimated Effort:**
- AI prompt update: 1-2 hours
- Testing with TIFF file: 30 minutes
- Regression testing: 1 hour
- Total: ~3 hours

**Deployment:**
- Worker code updated (aiPrompts.ts)
- Git commit and push
- Render.com auto-deploy
- Re-upload TIFF file to validate

---

## Related Issues

**Page Count Mismatch (PASS05-002):** Minor issue, separate from this critical issue

**ocr_average_confidence Null (PASS05-003):** Minor observation, separate from this critical issue

---

## Decision Required

**Question for Product Owner:**

Should lab reports with specific collection dates be:
- **Option A:** Timeline-worthy events (appear on patient timeline) RECOMMENDED
- **Option B:** Pseudo-encounters with dates (stay pseudo but have dates)

**Impact of Not Fixing:**
- Lab tests remain invisible on patient timelines
- Users must search through document summaries to find lab dates
- Analytics can't track lab test frequency or timing
- Violates Timeline Test design principle

**Please confirm Option A or B to proceed with fix.**
