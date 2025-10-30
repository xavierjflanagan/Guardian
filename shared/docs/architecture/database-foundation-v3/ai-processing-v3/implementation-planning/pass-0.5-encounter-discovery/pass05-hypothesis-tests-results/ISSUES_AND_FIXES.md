# Pass 0.5 Critical Issues and Fix Plan

**Date:** October 30, 2025
**Status:** ACTIVE - Fixes in progress
**Context:** Test 02 validation revealed 4 critical issues requiring immediate attention

---

## Issue Summary Table

| # | Issue | Severity | Status | Files Affected |
|---|-------|----------|--------|----------------|
| 1 | Hardcoded AI model name | MEDIUM | IDENTIFIED | encounterDiscovery.ts |
| 2 | Emojis in prompts/scripts | LOW | IDENTIFIED | aiPrompts.ts |
| 3 | False positive encounter detection | HIGH | INVESTIGATING | aiPrompts.ts |
| 4 | Page range end is NULL | HIGH | INVESTIGATING | AI response / manifestBuilder.ts |
| 5 | Empty spatial bounds array | CRITICAL | INVESTIGATING | manifestBuilder.ts |
| 6 | Pass 1 does not load manifest | CRITICAL | PENDING | worker.ts (Pass 1 section) |

---

## Issue 1: Hardcoded AI Model Name

### Problem
The `aiModel` field is hardcoded as `'gpt-4o-mini'` in the return statement instead of using the actual model from the OpenAI response.

### Evidence
**File:** `apps/render-worker/src/pass05/encounterDiscovery.ts`

**Lines 79, 90:**
```typescript
return {
  success: true,
  encounters: parsed.encounters,
  aiModel: 'gpt-4o-mini',  // ← HARDCODED
  aiCostUsd: cost,
  inputTokens,
  outputTokens
};
```

### Impact
- Database records show incorrect model name if OpenAI changes model behavior
- Cannot track actual model usage in production
- Violates principle of dynamic configuration

### Fix Required
Use the model from the OpenAI response object:

```typescript
aiModel: response.model,  // Dynamic from API response
```

### User Feedback
> "ai_model_used Column in the past 05 metrics table is currently stating that the AI model used was GPT 40 this is inaccurate as we are using GT5 mini. Please tell me this tells me that this was auto populated and hard written into the code so please remove it and we don't. We shouldn't have a hard code anyway. Hopefully the AI can just work it out itself and put its own name in there."

---

## Issue 2: Emojis in Prompts and Scripts

### Problem
Emojis are present in AI prompts and should be removed per coding standards.

### Evidence
**File:** `apps/render-worker/src/pass05/aiPrompts.ts`

**Lines 75-76:**
```typescript
### Date Precision Requirements
- ✅ **Specific:** "2024-03-15", "March 2024", "15-20 January 2024"
- ❌ **Vague:** "last month", "recently", "early 2024", "a few weeks ago", "Day 2" (relative without anchor)
```

### Impact
- Violates project coding standards (no emojis in scripts/documentation)
- Potential encoding issues in some environments
- Unprofessional appearance

### Fix Required
Replace emojis with text equivalents:

```typescript
### Date Precision Requirements
- VALID **Specific:** "2024-03-15", "March 2024", "15-20 January 2024"
- INVALID **Vague:** "last month", "recently", "early 2024", "a few weeks ago", "Day 2" (relative without anchor)
```

### User Feedback
> "I think we need to review thoroughly the prompts we're giving to the AI to perform past 0.5. I just had a look and there's and it's full of emojis remove them all. never put emojis in any scripts or anything really any documentation so go through these past 05 scripts and remove all emojis apps/render-worker/src/pass05."

---

## Issue 3: False Positive Encounter Detection

### Problem
AI detected `pseudo_lab_report` encounter when the document contained only immunization records, not lab results.

### Test Evidence
**Document:** BP2025060246784 V5 (Patient Health Summary)

**AI Detected:** 2 encounters
1. `pseudo_medication_list` (CORRECT)
2. `pseudo_lab_report` (FALSE POSITIVE)

**AI's Reasoning (from extracted text):**
```
"Immunisations : 11/04/2010 Fluvax ( Influenza ) 02/04/2011 Fluvax ( Influenza )
 03/10/2011 Vivaxim ( Hepatitis A , Typhoid )"
```

**Expected:** 1 encounter (`pseudo_admin_summary` or `pseudo_health_summary`)

### Root Cause Analysis

**Current Prompt Allows:**
```
### Pseudo-Encounter (NOT Timeline-Worthy)
Documents containing clinical info but NOT representing a discrete visit:
- Missing specific date (vague/relative dates)
- Missing provider AND facility
- Administrative documents
- Standalone results/reports  ← TOO VAGUE

**Encounter Types:** `pseudo_medication_list`, `pseudo_lab_report`, `pseudo_imaging_report`, ...
```

**Problem:** The prompt says "standalone results/reports" without clarifying what constitutes a "lab report" vs. other types of medical records.

**AI Misclassification:**
- Saw "Immunisations" with dates
- Interpreted immunization records as "lab results" (dates + medical data)
- Created separate `pseudo_lab_report` encounter

### Why This is Critically Wrong

1. **Semantic Confusion:** Immunizations are NOT lab reports
   - Lab reports: Pathology, blood tests, chemistry panels, microbiology
   - Immunizations: Vaccines administered (procedure/intervention, not diagnostic test)

2. **Document Context Ignored:** The document is a "Patient Health Summary"
   - Should be ONE administrative summary encounter
   - Sections within summary should NOT become separate encounters
   - Medications, immunizations, past history are COMPONENTS of the summary

3. **Over-segmentation:** AI is breaking up a unified administrative document into multiple pseudo-encounters

### Prompt Improvement Strategy

#### Strategy 1: Add Explicit Classification Guide

Add a section before encounter types:

```
## Document Type Recognition (BEFORE identifying encounters)

First, determine the OVERALL document type:

### Single Unified Administrative Documents
If the document is ONE cohesive administrative record, create ONLY ONE pseudo-encounter:
- Patient Health Summary / GP Summary
- Insurance/Medicare card
- Referral letter (entire letter is one encounter)
- Medication list (standalone sheet)

**Key Indicator:** Document header/title suggests unified purpose (e.g., "Patient Health Summary")

**Action:** Create 1 encounter of type `pseudo_admin_summary` covering ALL pages

### Multi-Section Clinical Documents
If the document contains MULTIPLE DISTINCT clinical encounters:
- Hospital discharge summary + attached lab reports from admission
- Multiple consultation notes from different dates
- Surgery report + pre-op assessment + post-op follow-up

**Key Indicator:** Clear page breaks, different dates, different providers, different clinical settings

**Action:** Create separate encounters for each distinct clinical event

### Standalone Results/Reports
ONLY create `pseudo_lab_report` or `pseudo_imaging_report` if:
- Document is PRIMARILY a diagnostic test result
- Examples:
  - Pathology report (blood chemistry, FBC, LFTs)
  - Radiology report (X-ray, CT, MRI interpretation)
  - Microbiology culture results
- NOT immunization records (use parent encounter or `pseudo_admin_summary`)
- NOT medication lists (use `pseudo_medication_list` or parent encounter)
```

#### Strategy 2: Add Decision Tree

```
## Encounter Detection Decision Tree

Step 1: Is this document a single-page administrative summary?
  - Header: "Patient Health Summary", "GP Summary", "Medical Summary"
  - Contains: Multiple sections (medications, allergies, history, immunizations)
  - NO distinct date ranges or providers for sections
  → YES: Create 1 `pseudo_admin_summary` encounter, stop analysis

Step 2: Are there multiple documents with different dates/providers?
  - Example: "Discharge Summary 2024-03-10" on pages 1-3, "Lab Report 2024-03-08" on pages 4-5
  → YES: Create separate encounters for each document

Step 3: Is this a standalone diagnostic result?
  - Pathology report: Blood tests, chemistry panels
  - Imaging report: Radiology interpretation
  → YES: Create `pseudo_lab_report` or `pseudo_imaging_report`

Step 4: Is this a medication list?
  - Standalone medication sheet
  → YES: Create `pseudo_medication_list`
```

#### Strategy 3: Add Negative Examples

```
### What NOT to Create as Separate Encounters

**DO NOT create pseudo_lab_report for:**
- Immunization records (part of admin summary or parent encounter)
- Vital signs in a consultation note (part of consultation encounter)
- Brief test results mentioned in discharge summary (part of discharge encounter)

**DO NOT split admin summaries into sections:**
- If document says "Patient Health Summary", keep it as ONE encounter
- Sections like "Current Medications", "Immunisations", "Past History" are COMPONENTS, not separate encounters
```

#### Strategy 4: Confidence Calibration

Add explicit confidence guidance:

```
### Confidence Scoring Guidelines

- **0.90-1.0 (High):**
  - Clear document type indicated by header/title
  - Distinct page boundaries between encounters
  - Clear dates, providers, facilities for real-world visits

- **0.70-0.89 (Medium):**
  - Document type inferred from content (no clear header)
  - Some ambiguity about whether to create 1 or 2 encounters

- **0.40-0.69 (Low):**
  - Significant ambiguity about encounter boundaries
  - Mixed content with unclear segmentation
  - **ACTION:** When in doubt for pseudo-encounters, prefer ONE unified encounter over multiple
```

### Recommended Fix

**Replace lines 59-72 in aiPrompts.ts** with the enhanced version including:
1. Document Type Recognition section (Strategy 1)
2. Decision Tree (Strategy 2)
3. Negative Examples (Strategy 3)
4. Confidence Calibration (Strategy 4)

### User Feedback
> "what are your suggestions for fixing or improving the AI prompt to prevent false positives based on the data and evidence or feedback we received in that test which was catastrophically wrong in general? The AI should just be looking at all uploaded pages at once and deciding what is this? Is it a healthcare encounter? Is it multiple healthcare encounters and what type of healthcare encounters is it? then it should be able to easily do it just like you're doing it now and you're an AI so what's going wrong? We need to work it out."

---

## Issue 4: Page Range End is NULL

### Problem
AI is returning page ranges as `[[1, null]]` instead of `[[1, 1]]` for a 1-page document.

### Evidence
**From Test 02 manifest_data:**
```json
{
  "encounterType": "pseudo_medication_list",
  "pageRanges": [[1, null]],  // ← Should be [[1, 1]]
  ...
}
```

**Database records:**
```sql
page_ranges: [[1, null]]
```

### Impact
- Cannot validate non-overlapping page ranges (end page is NULL)
- Cannot determine if page range is complete
- Breaks spatial assignment logic in Pass 1

### Root Cause
**Hypothesis 1:** AI is not returning the end page in its JSON response

**Hypothesis 2:** JSON parsing is setting `null` for missing end values

**Investigation Needed:**
1. Check raw AI response JSON before parsing
2. Verify if OpenAI is returning `null` or if our parsing is setting it
3. Check if prompt explicitly requires end page

### Current Prompt (Line 130):
```
"pageRanges": [[1, 10], [15, 18]],  // Example shows both start and end
```

The example is correct, but may need explicit instruction:

```
CRITICAL: pageRanges must ALWAYS include both start AND end page:
- Single page: [[1, 1]] NOT [[1]] or [[1, null]]
- Multiple pages: [[1, 5]] NOT [[1, 5, null]]
- Non-contiguous: [[1, 3], [7, 8]] (separate ranges for separate sections)
```

### Fix Required
1. Add explicit validation in prompt
2. Add runtime validation in `parseEncounterResponse()` to reject NULL end pages
3. If AI returns NULL, infer end page = start page (for 1-page docs)

---

## Issue 5: Empty Spatial Bounds Array

### Problem
Manifest shows `spatialBounds: []` (empty array) instead of bbox coordinate arrays.

### Evidence
**From Test 02 manifest_data:**
```json
{
  "encounterType": "pseudo_medication_list",
  "spatialBounds": [],  // ← Should contain bbox data
  "pageRanges": [[1, null]]
}
```

### Impact
- **CRITICAL:** Pass 1 cannot assign entities to encounters using spatial matching
- Entity-to-encounter mapping is broken
- All 37 entities in Test 02 have `final_encounter_id = NULL`

### Root Cause Investigation

**Code Analysis:**

**manifestBuilder.ts lines 167-177:**
```typescript
// Extract spatial bounds from OCR for this encounter's pages (use normalized ranges)
const spatialBounds = extractSpatialBounds(normalizedPageRanges, ocrOutput);

encounters.push({
  encounterId: dbEncounter.id,
  encounterType: aiEnc.encounterType as EncounterType,
  isRealWorldVisit: aiEnc.isRealWorldVisit,
  dateRange: aiEnc.dateRange,
  provider: aiEnc.provider,
  facility: aiEnc.facility,
  pageRanges: normalizedPageRanges,
  spatialBounds,  // ← This is empty
  confidence: aiEnc.confidence,
  extractedText: aiEnc.extractedText
});
```

**extractSpatialBounds() function (lines 190-235):**
```typescript
for (const range of pageRanges) {
  const [startPage, endPage] = range;  // If endPage is null, loop breaks!

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    // ← This condition fails when endPage is null
    const ocrPage = ocrOutput.fullTextAnnotation.pages[pageNum - 1];
    if (!ocrPage) continue;

    // Create bbox...
    bounds.push({
      page: pageNum,
      region: 'entire_page',
      boundingBox: entirePageBbox,
      boundingBoxNorm: entirePageBboxNorm,
      pageDimensions: pageDims
    });
  }
}
```

**ROOT CAUSE IDENTIFIED:**

When `pageRanges = [[1, null]]`:
1. Destructure: `startPage = 1`, `endPage = null`
2. Loop condition: `pageNum <= endPage` → `1 <= null` → **FALSE**
3. Loop never executes
4. `bounds` array remains empty
5. Function returns `[]`

### Fix Required

**Option 1: Defensive Coding (Handle NULL)**
```typescript
for (const range of pageRanges) {
  const [startPage, endPage] = range;
  const actualEndPage = endPage ?? startPage;  // Treat null as same page

  for (let pageNum = startPage; pageNum <= actualEndPage; pageNum++) {
    // ...
  }
}
```

**Option 2: Strict Validation (Reject NULL)**
```typescript
export async function parseEncounterResponse(...) {
  // Validate page ranges before processing
  for (const aiEnc of parsed.encounters) {
    for (const range of aiEnc.pageRanges) {
      if (range[1] === null || range[1] === undefined) {
        throw new Error(
          `Invalid page range [${range[0]}, ${range[1]}] for encounter "${aiEnc.encounterType}". ` +
          `End page must be a valid page number. For single-page encounters, use [start, start].`
        );
      }
    }
  }
}
```

**Recommended:** Use Option 2 (strict validation) + prompt fix to prevent AI from returning NULL.

---

## Issue 6: Pass 1 Does Not Load Manifest

### Problem
Pass 1 entity detection does not load or use the Pass 0.5 encounter manifest for entity-to-encounter assignment.

### Evidence
**From Test 02 validation:**
- Total entities detected: 37
- Entities with `final_encounter_id`: 0
- Assignment rate: 0%

**Database query result:**
```sql
SELECT COUNT(*) as total_entities,
       COUNT(final_encounter_id) as entities_with_encounter
FROM entity_processing_audit
WHERE shell_file_id = '482006fe-8545-40f6-9082-5ed499c44df8';

-- Result: total_entities: 37, entities_with_encounter: 0
```

### Impact
- **CRITICAL:** Entity-to-encounter mapping is completely broken
- Pass 0.5 output is unused
- No clinical context for entities
- Cannot group entities by encounter for Pass 2 processing

### Root Cause
Pass 1 code in `worker.ts` does not include manifest loading logic.

### Fix Required
**Location:** `apps/render-worker/src/worker.ts` (Pass 1 execution section)

**Required Implementation:**

1. **Load manifest from database:**
```typescript
// Before Pass 1 entity processing
const { data: manifestRecord, error: manifestError } = await this.supabase
  .from('shell_file_manifests')
  .select('manifest_data')
  .eq('shell_file_id', payload.shell_file_id)
  .single();

if (manifestError || !manifestRecord) {
  throw new Error(`Failed to load Pass 0.5 manifest: ${manifestError?.message}`);
}

const manifest = manifestRecord.manifest_data as ShellFileManifest;
```

2. **Pass encounter data to entity processing:**
```typescript
const pass1Input = {
  // ... existing fields
  encounterManifest: manifest.encounters  // NEW: Pass encounters to entity detection
};
```

3. **Implement spatial assignment in Pass 1:**
```typescript
// For each detected entity:
function assignEntityToEncounter(
  entity: DetectedEntity,
  encounters: EncounterMetadata[]
): string | null {

  // Find encounter that contains this entity's page
  for (const encounter of encounters) {
    for (const pageRange of encounter.pageRanges) {
      const [start, end] = pageRange;
      if (entity.page_number >= start && entity.page_number <= end) {
        // Optional: Check if entity bbox is within encounter spatial bounds
        // For Phase 1: Page-based assignment is sufficient
        return encounter.encounterId;
      }
    }
  }

  return null;  // Unassigned (should be rare)
}
```

4. **Populate final_encounter_id in database:**
```typescript
// When inserting entity_processing_audit record:
{
  // ... other fields
  final_encounter_id: assignEntityToEncounter(entity, manifest.encounters),
  encounter_assignment_method: 'page_based_spatial',
  encounter_assignment_confidence: 0.95  // High confidence for page-based matching
}
```

### Status
**PENDING** - User acknowledged this is not implemented yet and will be addressed soon.

### User Feedback
> "And yes, I'm aware that we haven't implemented the manifest floating into past one or past two yet we can do that soon."

---

## Fix Implementation Plan

### Phase 1: Quick Fixes (Deploy Today)

**Priority 1: Fix Issue 1 (Hardcoded Model)**
- File: `encounterDiscovery.ts`
- Change: Lines 79, 90
- Deploy: Immediate
- Testing: Verify database records show correct model

**Priority 2: Fix Issue 2 (Remove Emojis)**
- File: `aiPrompts.ts`
- Change: Lines 75-76
- Deploy: With Phase 1
- Testing: Visual inspection of prompt

**Priority 3: Fix Issue 5 (Spatial Bounds NULL Handling)**
- File: `manifestBuilder.ts`
- Change: Lines 197-200 (add NULL check)
- Deploy: With Phase 1
- Testing: Verify spatialBounds populated in next test

**Priority 4: Fix Issue 4 (Page Range Validation)**
- File: `aiPrompts.ts` + `manifestBuilder.ts`
- Change: Add explicit instruction + runtime validation
- Deploy: With Phase 1
- Testing: Verify page ranges are complete

### Phase 2: Prompt Improvements (Test and Deploy)

**Priority 5: Fix Issue 3 (False Positives)**
- File: `aiPrompts.ts`
- Change: Add Document Type Recognition, Decision Tree, Negative Examples
- Deploy: After internal testing
- Testing: Re-run Test 02 with V5 file, expect 1 encounter (not 2)

### Phase 3: Critical Integration (Next Sprint)

**Priority 6: Fix Issue 6 (Pass 1 Manifest Loading)**
- File: `worker.ts` (Pass 1 section)
- Change: Implement manifest loading and entity assignment
- Deploy: After comprehensive testing
- Testing: Re-run Test 02, expect 100% entity assignment rate

---

## Testing Protocol

### After Phase 1 Fixes
1. Re-upload BP2025060246784 V5 file
2. Verify manifest has complete page ranges (no NULL)
3. Verify spatialBounds array is populated
4. Verify aiModel in database matches response

### After Phase 2 Fixes
1. Re-upload BP2025060246784 V5 file
2. Expected result: 1 encounter (pseudo_admin_summary)
3. Verify NO false positive pseudo_lab_report
4. Check confidence scores ≥ 0.85

### After Phase 3 Fixes
1. Re-upload BP2025060246784 V5 file
2. Verify all entities have final_encounter_id populated
3. Verify entities on page 1 assigned to page-1 encounter
4. Check assignment rate = 100%

---

## Open Investigations

### Investigation 1: Why is AI returning NULL for end page?

**Questions:**
1. Is the raw OpenAI response JSON actually returning `null`?
2. Or is our JSON parsing/TypeScript conversion setting it?
3. Does the prompt need explicit "MUST include end page" instruction?

**Next Steps:**
- Add console.log for raw AI response before JSON.parse()
- Check if OpenAI docs mention array handling
- Test with explicit prompt instruction

### Investigation 2: Are there other emoji instances in pass05?

**Files to check:**
- types.ts
- manifestBuilder.ts
- databaseWriter.ts
- index.ts

**Action:** Full grep scan for Unicode emoji characters

---

**Last Updated:** October 30, 2025
**Status:** Active investigation and fixes in progress
