# v2.6 Corrections Plan - Schema Alignment & Type Safety

**Date:** 2025-11-05
**Purpose:** Fix critical JSON schema misalignment in v2.5 while preserving structural improvements
**Status:** Planning Phase
**Source of Truth:** `/apps/render-worker/src/pass05/types.ts`

---

## Executive Summary

v2.5 optimization achieved excellent structural improvements (Timeline Test first, examples early, consolidated sections) but introduced **critical JSON schema misalignment** that would break the manifestBuilder. v2.6 fixes these errors while preserving all Phase 1 optimizations.

**Critical Finding:** GPT-5 review correctly identified that v2.5 uses wrong field names that don't match TypeScript interfaces.

---

## Critical Fixes Required

### 1. JSON Schema Field Names (BLOCKER)

**Source of Truth:** `types.ts:37-57` (PageAssignment interface) and `types.ts:59-99` (EncounterMetadata interface)

#### Fix A: Page Assignment Structure

**v2.5 (WRONG):**
```json
"pageAssignments": [
  {
    "pageNumber": 1,
    "encounterIndex": 0,
    "justification": "..."
  }
]
```

**v2.6 (CORRECT):**
```json
"page_assignments": [
  {
    "page": 1,
    "encounter_id": "enc-1",
    "justification": "..."
  }
]
```

**Why:** PageAssignment interface (types.ts:37-57) requires:
- `page` (not `pageNumber`)
- `encounter_id` (not `encounterIndex`)
- `justification` (correct in v2.5)

#### Fix B: Provider/Facility Field Names

**v2.5 (WRONG):**
```json
{
  "providerName": "Dr. Smith",
  "facilityName": "City Hospital"
}
```

**v2.6 (CORRECT):**
```json
{
  "provider": "Dr. Smith",
  "facility": "City Hospital"
}
```

**Why:** EncounterMetadata interface (types.ts:71-72) requires:
- `provider` (not `providerName`)
- `facility` (not `facilityName`)

#### Fix C: Encounter ID Field

**v2.5 (MISSING):**
```json
{
  "encounterType": "outpatient",
  // No encounter_id field
}
```

**v2.6 (CORRECT):**
```json
{
  "encounter_id": "enc-1",
  "encounterType": "outpatient"
}
```

**Why:** AI must generate unique encounter IDs that match page_assignments references (types.ts:60)

---

### 2. Encounter Type Validation (IMPORTANT)

**Source of Truth:** `types.ts:101-122` (EncounterType union)

#### Valid Real-World Types:
- `inpatient` (NOT discharge_summary or hospital_admission)
- `outpatient` (for general outpatient visits, dated lab/imaging)
- `emergency_department` (NOT emergency or ed_visit)
- `specialist_consultation` (NOT specialist_visit)
- `gp_appointment` (NOT general_practice)
- `telehealth` (correct)

#### Valid Planned Types:
- `planned_specialist_consultation` (NOT planned_appointment)
- `planned_procedure` (correct)
- `planned_gp_appointment` (correct)

#### Valid Pseudo Types:
- `pseudo_medication_list` (correct)
- `pseudo_admin_summary` (correct)
- `pseudo_lab_report` (correct)
- `pseudo_imaging_report` (correct)
- `pseudo_referral_letter` (correct)
- `pseudo_insurance` (correct)
- `pseudo_unverified_visit` (correct)

#### Invalid Types Used in v2.5 (MUST FIX):
- `general_practice` → Use `gp_appointment`
- `hospital_admission` → Use `inpatient`
- `hospital_discharge` → Use `inpatient` (discharge is a document, not encounter type)
- `day_procedure` → Use `outpatient`
- `allied_health` → Use `specialist_consultation` or `outpatient`
- `immunization` → Use `gp_appointment` or `outpatient`
- `lab_test` → Use `outpatient`
- `planned_appointment` → Use `planned_gp_appointment` or `planned_specialist_consultation`

---

### 3. Current Prompt Bugs to Fix (BONUS)

**Finding:** The CURRENT v2.4 prompt also has invalid encounter types!

**Current aiPrompts.ts Line 602, 635:** Uses `discharge_summary` which doesn't exist in union
**Current aiPrompts.ts Examples:** Use several invalid types

**v2.6 Fix:** Use only valid types from union, improving on both v2.4 AND v2.5

---

## Structural Improvements to PRESERVE from v2.5

These are good changes that should remain in v2.6:

1. **Timeline Test First** - Core principle upfront
2. **Examples Early** - Better comprehension
3. **Consolidated Document Analysis** - From 800 tokens to 400 tokens
4. **Removed Redundant DO NOT Lists** - From 5+ repetitions to 1 section
5. **Simplified Metadata Handling** - From 80 lines to 10 lines
6. **Linear Flow** - Easier to understand sequentially

---

## Fields That Must Be Present

**Mandatory Fields per EncounterMetadata (types.ts:59-99):**

```typescript
{
  encounter_id: string;        // AI generates (enc-1, enc-2, etc.)
  encounterType: EncounterType; // From union only
  isRealWorldVisit: boolean;    // true for timeline-worthy

  // Optional but expected:
  dateRange?: { start: string; end?: string }; // ISO dates
  provider?: string;                            // For real-world only
  facility?: string;                            // For real-world only
  pageRanges: number[][];                      // [[1,5], [10,12]]
  spatialBounds: SpatialBound[];               // Entire page bounds
  confidence: number;                          // 0.0-1.0
  summary?: string;                            // Plain English
  extractedText?: string;                      // Optional debug field
}
```

**Mandatory Fields per PageAssignment (types.ts:37-57):**

```typescript
{
  page: number;           // 1-indexed
  encounter_id: string;   // Must match encounter array
  justification: string;  // 15-20 words
}
```

---

## GPT-5 Review Assessment

### Points Where GPT-5 Was CORRECT:
1. JSON schema mismatch (CRITICAL BLOCKER) - v2.5 would break manifestBuilder
2. Encounter type drift - both v2.4 and v2.5 have invalid types
3. Need to standardize to TypeScript union

### Points Where GPT-5 Was WRONG/CONFUSED:
1. "Spatial bounds enriched later" - FALSE, Pass 0.5 creates them
2. "Boundary handling reduction will cause regressions" - SPECULATIVE, no evidence
3. Suggested adding 10-15 line appendix - UNNECESSARY cargo cult

### Points Where GPT-5 Was OVERCAUTIOUS:
1. Fears about condensing metadata section - condensing ≠ losing functionality
2. Wants to preserve every detail - missing the point of optimization

---

## v2.6 Design Principles

1. **Type Safety First** - Every field matches TypeScript interfaces exactly
2. **Structural Clarity** - Keep v2.5 improvements (Timeline Test first, examples early)
3. **Token Efficiency** - Maintain ~400-500 token reduction from v2.4
4. **No Regression** - All functionality preserved, just more concise
5. **Production Ready** - Can be deployed without breaking manifestBuilder

---

## Testing Requirements for v2.6

Before deployment, validate:

1. **Schema Validation:**
   - All field names match types.ts interfaces
   - All encounter types exist in EncounterType union
   - All required fields present in examples

2. **Functionality Validation:**
   - Frankenstein file boundary detection (page 13 split)
   - TIFF lab report date extraction (03-Jul-2025)
   - Medication list (pseudo-encounter without date)
   - Administrative summary (single pseudo across all pages)
   - Mixed real/pseudo encounters

3. **Output Validation:**
   - manifestBuilder can parse AI response
   - page_assignments references match encounter_id values
   - All encounter types validate against union
   - Confidence scores in valid ranges (0.0-1.0)

---

## Implementation Checklist

- [ ] Create PROMPT_v2.6_OPTIMIZED.ts with all corrections
- [ ] Fix all field names (page_assignments, encounter_id, provider, facility)
- [ ] Use only valid EncounterType values from union
- [ ] Preserve structural improvements from v2.5
- [ ] Add encounter_id to all examples
- [ ] Validate all examples compile against types.ts
- [ ] Create detailed v2.5-to-v2.6 changelog
- [ ] Document why each change was made
- [ ] Provide migration guidance

---

## Token Budget

**v2.4 Baseline:** ~4,500 tokens
**v2.5 Target:** ~4,000 tokens (-500)
**v2.6 Target:** ~4,000 tokens (same as v2.5, just correct)

v2.6 should maintain the same token reduction as v2.5 while fixing critical schema issues.

---

## Risk Assessment

**v2.6 Risk Level:** LOW (fixing bugs, not adding features)

**Why Low Risk:**
- Fixing schema alignment makes it MORE compatible with existing code
- Using valid encounter types prevents runtime validation errors
- Structural improvements already proven safe in v2.5
- No logic changes, only field name corrections

**Deployment Confidence:** HIGH after schema validation tests pass

---

## Next Steps

1. Create PROMPT_v2.6_OPTIMIZED.ts
2. Create CHANGELOG_v2.5_to_v2.6.md
3. Validate against types.ts
4. Report back for review before any deployment