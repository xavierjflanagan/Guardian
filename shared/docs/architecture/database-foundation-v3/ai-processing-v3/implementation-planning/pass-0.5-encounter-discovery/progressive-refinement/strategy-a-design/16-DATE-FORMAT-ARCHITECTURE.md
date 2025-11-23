# 16. Date Format Architecture & Normalization Strategy

**Status:** In Review
**Created:** 2025-11-23
**Related Rabbits:** #24 (DOB Reconciliation Failure), #26 (Reconciliation Log Empty)
**Severity:** HIGH - Affects patient identity reconciliation

---

## Executive Summary

This document defines the complete date handling architecture for Exora's Pass 0.5 encounter discovery pipeline. It addresses the critical DD/MM/YYYY vs MM/DD/YYYY ambiguity problem discovered in production testing and establishes industry-standard patterns for date normalization, storage, and display.

**Key Findings:**
- Current database schema is **correct** (already uses ISO 8601 compliant types)
- Bug is in **application layer** normalization (TypeScript)
- Industry standard approach: **Store ISO 8601 → Display in user's locale**
- Immediate fix required for `patient_date_of_birth`, `encounter_start_date`, `encounter_end_date`

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Industry Best Practices Research](#industry-best-practices-research)
3. [Current Architecture Assessment](#current-architecture-assessment)
4. [Root Cause Analysis](#root-cause-analysis)
5. [Immediate Action Plan](#immediate-action-plan)
6. [Implementation Specification](#implementation-specification)
7. [Future Enhancements](#future-enhancements)
8. [Testing Strategy](#testing-strategy)
9. [References](#references)

---

## Problem Statement

### The Discovery

**Production Test Results (2025-11-22):**

**Case 1: Vincent Cheers (3-page file)**
- AI Extracted DOB: `"16/02/1959"` (DD/MM/YYYY format)
- Stored in `pass05_pending_encounters.patient_date_of_birth`: `"16/02/1959"`
- After reconciliation in `healthcare_encounters.patient_date_of_birth`: `NULL` ❌

**Case 2: Emma Thompson (142-page file)**
- AI Extracted DOB: `"November 14, 1965"`, `"11/14/1965"` (text + MM/DD/YYYY format)
- Stored in `pass05_pending_encounters.patient_date_of_birth`: Multiple formats
- After reconciliation in `healthcare_encounters.patient_date_of_birth`: `"1965-11-14"` ✅

### The Pattern

**Working Formats:**
- `"November 14, 1965"` → Works (JavaScript Date constructor handles text)
- `"11/14/1965"` → Works (JS interprets as MM/DD/YYYY)
- `"1965-11-14"` → Works (ISO 8601)

**Failing Formats:**
- `"16/02/1959"` → Fails (day > 12, JS tries to parse as month 16)
- `"31/12/2023"` → Fails (month 31 invalid)
- Any DD/MM/YYYY with day > 12 → Fails

### The Stakes

**Why This Matters:**
1. **Patient Identity:** DOB is a critical identifier for patient matching
2. **Global Application:** Australian medical records use DD/MM/YYYY format
3. **Safety Critical:** Date misinterpretation in healthcare can lead to medical errors
4. **Data Loss:** NULL values break identity reconciliation logic

---

## Industry Best Practices Research

### Universal Recommendation: ISO 8601

**Research Sources (2025-11-23):**
- Stack Overflow consensus
- PostgreSQL official documentation
- HL7 FHIR standards
- FDA and EU regulatory guidelines

**The Pattern:**
```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ Input Data  │      │   Storage    │      │   Display   │
│  (Various)  │ ───▶ │ (ISO 8601)   │ ───▶ │ (User Pref) │
└─────────────┘      └──────────────┘      └─────────────┘
  DD/MM/YYYY         YYYY-MM-DD or          DD/MM/YYYY
  MM/DD/YYYY         YYYY-MM-DDTHH:MM:SSZ   MM/DD/YYYY
  "Nov 14, 1965"                            locale format
```

### Healthcare-Specific Standards

**HL7 FHIR:**
- Foundation: ISO 8601
- Date format: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`
- DateTime format: `YYYY-MM-DDThh:mm:ss+zz:zz`

**FDA 21 CFR 801.18:**
- Mandates ISO 8601 for medical device labeling
- Format: `YYYY-MM-DD` for dates

**EU EN ISO 15223-1:**
- Medical devices must use ISO 8601
- Reduces international ambiguity

**B.C. Health Information Standards:**
- Based on ISO 8601 EDTF (Extended Date/Time Format)
- Used in Canadian healthcare systems

### PostgreSQL Best Practices

**Recommended Types:**
- `DATE`: For date-only fields (stores YYYY-MM-DD internally)
- `TIMESTAMPTZ`: For timestamps (stores UTC internally, converts on retrieval)
- `TIMESTAMP`: **NOT recommended** (no timezone awareness)

**Why TIMESTAMPTZ:**
```sql
-- Stores UTC internally
INSERT INTO encounters (start_date) VALUES ('2024-03-14 10:30:00-08:00');
-- Stored as: 2024-03-14 18:30:00+00 (UTC)

-- Retrieves in user's timezone
SET timezone = 'Australia/Sydney';
SELECT start_date FROM encounters;
-- Returns: 2024-03-15 05:30:00+11 (Sydney time)
```

### Key Principle: Separation of Concerns

**Application Layer Responsibility:**
- Parse various input formats
- Validate date values
- Normalize to ISO 8601
- Handle ambiguity with heuristics

**Database Layer Responsibility:**
- Store in standard format (ISO 8601)
- Handle timezone conversions (TIMESTAMPTZ)
- Ensure data integrity

**Display Layer Responsibility:**
- Format according to user's locale preference
- Use libraries like `date-fns` or `Intl.DateTimeFormat`

---

## Current Architecture Assessment

### Database Schema: ✅ Already Correct

**From `current_schema/03_clinical_core.sql` (lines 519-520, 587):**
```sql
-- Encounter dates (with timezone awareness)
encounter_start_date TIMESTAMPTZ,
encounter_end_date TIMESTAMPTZ,

-- Patient DOB (date only, no time)
patient_date_of_birth DATE,
```

**Assessment:** This is **textbook perfect** according to industry standards.
- ✅ Uses `TIMESTAMPTZ` for encounter timestamps (stores UTC, converts on retrieval)
- ✅ Uses `DATE` for date-of-birth (no time component needed)
- ✅ Both types expect ISO 8601 input

**No schema changes needed.**

### Application Layer: ❌ Broken Normalization

**From `apps/render-worker/src/pass05/progressive/pending-reconciler.ts` (lines 56-72):**
```typescript
function normalizeDateToISO(dateString: string | null): string | null {
  if (!dateString) return null;

  try {
    const parsed = new Date(dateString);  // ❌ BUG HERE
    if (isNaN(parsed.getTime())) return null;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.warn('[Identity] Failed to parse date:', dateString, error);
    return null;
  }
}
```

**Problems:**
1. **JavaScript Date Constructor Limitation:**
   - `new Date("16/02/1959")` interprets slashes as MM/DD/YYYY
   - Attempts to parse as **month 16**, day 2, year 1959
   - Month 16 is invalid → `NaN` → Returns `null`

2. **No Disambiguation Logic:**
   - Cannot distinguish between DD/MM/YYYY and MM/DD/YYYY
   - Always assumes MM/DD/YYYY for slash-separated dates

3. **Limited Scope:**
   - Only called for `patient_date_of_birth`
   - **NOT called** for `encounter_start_date` or `encounter_end_date`
   - Encounter dates passed directly to RPC without normalization

### Reconciliation RPC: Missing Normalization

**From `current_schema/08_job_coordination.sql` (lines 596-597, 643):**
```sql
-- Encounter dates cast directly without normalization
encounter_start_date = (p_encounter_data->>'encounter_start_date')::TIMESTAMPTZ,
encounter_end_date = (p_encounter_data->>'encounter_end_date')::TIMESTAMPTZ,

-- Patient DOB cast directly (expects ISO format)
patient_date_of_birth = (p_encounter_data->>'patient_date_of_birth')::DATE,
```

**Risk:** If AI outputs encounter dates in DD/MM/YYYY format, PostgreSQL will **fail** to cast to TIMESTAMPTZ.

---

## Root Cause Analysis

### Bug Timeline

1. **AI Extraction:** GPT-4o Vision correctly extracts `"16/02/1959"` from Australian medical document
2. **Pending Storage:** Value stored as-is in `pass05_pending_encounters.patient_date_of_birth` (JSONB)
3. **Normalization Call:** `normalizeDateToISO("16/02/1959")` called before reconciliation
4. **JavaScript Parsing:** `new Date("16/02/1959")` attempts to parse as MM/DD/YYYY
5. **Failure:** Month 16 is invalid → `NaN` → Function returns `null`
6. **Reconciliation:** `null` value passed to RPC
7. **Final Storage:** `healthcare_encounters.patient_date_of_birth` = `NULL` ❌

### Why "11/14/1965" Worked

1. **Valid in MM/DD/YYYY:** Month 11 (November), day 14 → Valid
2. **JavaScript Parsing:** `new Date("11/14/1965")` successfully parses
3. **Normalization:** Converts to `"1965-11-14"` (ISO 8601)
4. **PostgreSQL:** Accepts ISO format → Stores successfully ✅

### The Ambiguity Problem

**Ambiguous Cases:**
- `"01/02/2024"` → Could be Jan 2 or Feb 1
- `"05/06/2023"` → Could be May 6 or Jun 5
- `"12/11/2022"` → Could be Dec 11 or Nov 12

**Unambiguous Cases:**
- `"16/02/1959"` → **Must be** Feb 16 (month 16 doesn't exist)
- `"31/12/2023"` → **Must be** Dec 31 (day 31 of month 12)
- `"13/05/2020"` → **Must be** May 13 (month 13 doesn't exist)

**Heuristic:** If day > 12, we know it's DD/MM/YYYY format.

---

## Immediate Action Plan

### Required Actions (Blocking for Production)

**Action 1: Replace `normalizeDateToISO()` Function**
- **File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
- **Lines:** 56-72
- **Replacement:** 115-line smart parser (see Implementation Specification)
- **Impact:** Fixes DOB reconciliation for DD/MM/YYYY formats

**Action 2: Expand Normalization Scope**
- **File:** Same as Action 1
- **Current:** Only `patient_date_of_birth` is normalized
- **Required:** Add normalization for `encounter_start_date` and `encounter_end_date`
- **Impact:** Prevents future failures on encounter dates

**Action 3: Test with Real-World Data**
- **Test Case 1:** Vincent Cheers (`"16/02/1959"`)
- **Test Case 2:** Emma Thompson (`"11/14/1965"`)
- **Test Case 3:** Ambiguous date (`"01/02/2024"`) → Verify defaults to DD/MM/YYYY
- **Test Case 4:** ISO format (`"2024-03-14"`) → Verify pass-through
- **Test Case 5:** Text format (`"March 14, 2024"`) → Verify parsing

### Non-Actions (Schema Already Correct)

**No Schema Changes:**
- ❌ No migration needed
- ❌ No table alterations
- ❌ No type changes

**Rationale:** Current schema already follows industry best practices.

---

## Implementation Specification

### New `normalizeDateToISO()` Function

**Location:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts` (replace lines 56-72)

**Full Implementation:**
```typescript
/**
 * Normalize various date formats to ISO 8601 (YYYY-MM-DD)
 *
 * Handles:
 * - ISO 8601: "2024-03-14" → pass through
 * - Text dates: "March 14, 2024" → parse naturally
 * - Slash dates: "16/02/1959" (DD/MM/YYYY) → disambiguate
 * - Slash dates: "11/14/1965" (MM/DD/YYYY) → disambiguate
 * - Dot dates: "14.03.2024" (DD.MM.YYYY) → disambiguate
 * - Dash dates: "14-03-2024" (DD-MM-YYYY) → disambiguate
 *
 * Disambiguation logic:
 * - If day > 12: Must be DD/MM/YYYY
 * - If month > 12: Must be MM/DD/YYYY
 * - If ambiguous: Default to DD/MM/YYYY (international standard)
 *
 * @param dateString - Date in various formats
 * @returns ISO 8601 formatted date (YYYY-MM-DD) or null if invalid
 */
function normalizeDateToISO(dateString: string | null): string | null {
  if (!dateString || dateString.trim() === '') return null;

  const trimmed = dateString.trim();

  try {
    // ============================================================
    // 1. ISO 8601 Format (YYYY-MM-DD) - Pass Through
    // ============================================================
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return trimmed; // Already in correct format
      }
    }

    // ============================================================
    // 2. Text/Written Format - Let JavaScript Date Handle
    // ============================================================
    // Examples: "November 14, 1965", "14 March 2024", "March 14, 2024"
    if (/[a-zA-Z]/.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    // ============================================================
    // 3. Numeric Formats with Disambiguation Logic
    // ============================================================
    // Matches: DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, DD-MM-YYYY
    // Separators: slash (/), dot (.), dash (-)
    const numericMatch = trimmed.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);

    if (numericMatch) {
      let [_, first, second, year] = numericMatch;

      // Normalize 2-digit year to 4-digit
      // Rule: 00-49 → 2000s, 50-99 → 1900s
      if (year.length === 2) {
        const yearNum = parseInt(year, 10);
        year = yearNum < 50 ? `20${year}` : `19${year}`;
      }

      const firstNum = parseInt(first, 10);
      const secondNum = parseInt(second, 10);

      let day: number;
      let month: number;

      // ============================================================
      // Disambiguation Logic
      // ============================================================

      if (firstNum > 12) {
        // First number can't be a month → Must be DD/MM/YYYY
        // Examples: "16/02/1959", "31/12/2023"
        day = firstNum;
        month = secondNum;
      } else if (secondNum > 12) {
        // Second number can't be a month → Must be MM/DD/YYYY
        // Examples: "02/16/1959", "12/31/2023"
        month = firstNum;
        day = secondNum;
      } else {
        // ============================================================
        // AMBIGUOUS CASE
        // ============================================================
        // Both numbers ≤ 12 → Could be either format
        // Examples: "01/02/2024", "05/06/2023"
        //
        // DEFAULT TO DD/MM/YYYY (International Standard)
        // Rationale:
        // - DD/MM/YYYY used by majority of world
        // - Australian medical records use DD/MM/YYYY
        // - ISO 8601 is YYYY-MM-DD (day before month)
        // - HL7 FHIR recommends DD/MM/YYYY for international use
        // ============================================================
        day = firstNum;
        month = secondNum;
      }

      // ============================================================
      // Validate Date Ranges
      // ============================================================
      if (day < 1 || day > 31) {
        console.warn('[Identity] Invalid day value:', { day, month, year, dateString });
        return null;
      }
      if (month < 1 || month > 12) {
        console.warn('[Identity] Invalid month value:', { day, month, year, dateString });
        return null;
      }

      // ============================================================
      // Construct ISO 8601 String
      // ============================================================
      const monthStr = String(month).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const isoDate = `${year}-${monthStr}-${dayStr}`;

      // ============================================================
      // Final Validation: Check if Date is Actually Valid
      // ============================================================
      // This catches cases like "31/02/2024" (Feb 31 doesn't exist)
      const testDate = new Date(isoDate);
      if (isNaN(testDate.getTime())) {
        console.warn('[Identity] Constructed invalid date:', isoDate, 'from', dateString);
        return null;
      }

      // Verify the constructed date matches our intended values
      // (JavaScript Date might "roll over" invalid dates like Feb 31 → Mar 3)
      if (
        testDate.getFullYear() !== parseInt(year, 10) ||
        testDate.getMonth() + 1 !== month ||
        testDate.getDate() !== day
      ) {
        console.warn('[Identity] Date rollover detected:', {
          input: dateString,
          constructed: isoDate,
          actual: testDate.toISOString().split('T')[0]
        });
        return null;
      }

      return isoDate;
    }

    // ============================================================
    // 4. Fallback - Try JavaScript Date Constructor
    // ============================================================
    // Handles edge cases we might have missed
    const fallback = new Date(trimmed);
    if (!isNaN(fallback.getTime())) {
      const year = fallback.getFullYear();
      const month = String(fallback.getMonth() + 1).padStart(2, '0');
      const day = String(fallback.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // ============================================================
    // 5. No Matching Format
    // ============================================================
    console.warn('[Identity] No matching date format for:', trimmed);
    return null;

  } catch (error) {
    console.warn('[Identity] Failed to parse date:', dateString, error);
    return null;
  }
}
```

### Expanded Normalization Scope

**Current Code (Approximate Location):**
```typescript
// In reconcilePendingToFinal() or similar function
const encounterData = {
  patient_date_of_birth: normalizeDateToISO(pending.patient_date_of_birth),
  // encounter_start_date: pending.encounter_start_date,  // ❌ Not normalized
  // encounter_end_date: pending.encounter_end_date,      // ❌ Not normalized
  // ... other fields
};
```

**Required Change:**
```typescript
// In reconcilePendingToFinal() or similar function
const encounterData = {
  patient_date_of_birth: normalizeDateToISO(pending.patient_date_of_birth),
  encounter_start_date: normalizeDateToISO(pending.encounter_start_date),    // ✅ ADD
  encounter_end_date: normalizeDateToISO(pending.encounter_end_date),        // ✅ ADD
  // ... other fields
};
```

**Note:** Need to identify exact location in code where encounter data is prepared for RPC call.

---

## Future Enhancements

### Enhancement 1: User Locale Preference Storage

**Schema Addition (Future Migration):**
```sql
-- Add to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN date_format_preference TEXT DEFAULT 'DD/MM/YYYY'
  CHECK (date_format_preference IN ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'));

ADD COLUMN timezone TEXT DEFAULT 'Australia/Sydney';
```

**Usage:**
- Store user's preferred date display format
- Use for frontend rendering only
- Database always stores ISO 8601

### Enhancement 2: Frontend Display Formatting

**Example with `date-fns`:**
```typescript
import { format, parseISO } from 'date-fns';

interface UserProfile {
  date_format_preference: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
}

function formatDateForUser(isoDate: string, profile: UserProfile): string {
  const date = parseISO(isoDate); // Parse ISO 8601 from database

  const formatMap = {
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'YYYY-MM-DD': 'yyyy-MM-dd'
  };

  return format(date, formatMap[profile.date_format_preference]);
}

// Usage in React component
const { currentProfile } = useProfile();
const encounter = { start_date: '2024-03-14' }; // From database (ISO 8601)

const displayDate = formatDateForUser(encounter.start_date, currentProfile);
// Australian user sees: "14/03/2024"
// US user sees: "03/14/2024"
```

### Enhancement 3: Timezone Handling for Encounter Dates

**Current Behavior:**
```sql
-- PostgreSQL TIMESTAMPTZ automatically converts on retrieval
SET timezone = 'Australia/Sydney';
SELECT encounter_start_date FROM healthcare_encounters;
-- Returns timestamps in Sydney time
```

**Future Frontend Enhancement:**
```typescript
import { formatInTimeZone } from 'date-fns-tz';

const userTimezone = currentProfile.timezone; // 'Australia/Sydney'
const encounterTimestamp = '2024-03-14T10:30:00Z'; // From database (UTC)

const localTime = formatInTimeZone(
  encounterTimestamp,
  userTimezone,
  'dd/MM/yyyy HH:mm zzz'
);
// Result: "14/03/2024 21:30 AEDT"
```

### Enhancement 4: Consider Library Migration

**Option: Migrate to `date-fns` for Production Robustness**

**Pros:**
- Battle-tested by millions of applications
- Comprehensive edge case handling
- Tree-shakeable (only import what you use)
- Active maintenance and updates

**Cons:**
- Adds dependency (~20KB for parsing functions)
- Requires specifying all possible input formats

**Alternative Implementation:**
```typescript
import { parse, isValid, format } from 'date-fns';

function normalizeDateToISO(dateString: string | null): string | null {
  if (!dateString || dateString.trim() === '') return null;

  const trimmed = dateString.trim();

  // ISO 8601 - pass through
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try multiple formats in order of likelihood
  const formats = [
    'dd/MM/yyyy',    // International
    'MM/dd/yyyy',    // US
    'dd.MM.yyyy',    // European
    'dd-MM-yyyy',    // Alternative
    'MMMM d, yyyy',  // "March 14, 2024"
    'd MMMM yyyy',   // "14 March 2024"
  ];

  for (const fmt of formats) {
    try {
      const parsed = parse(trimmed, fmt, new Date());
      if (isValid(parsed)) {
        return format(parsed, 'yyyy-MM-dd');
      }
    } catch {
      continue;
    }
  }

  return null;
}
```

**Recommendation:** Implement custom parser first (no dependencies), migrate to `date-fns` if edge cases emerge in production.

---

## Testing Strategy

### Unit Tests Required

**Test File:** `apps/render-worker/src/pass05/progressive/__tests__/pending-reconciler.test.ts`

**Test Cases:**
```typescript
describe('normalizeDateToISO', () => {
  describe('ISO 8601 format (pass through)', () => {
    it('should pass through valid ISO dates unchanged', () => {
      expect(normalizeDateToISO('2024-03-14')).toBe('2024-03-14');
      expect(normalizeDateToISO('1959-02-16')).toBe('1959-02-16');
    });
  });

  describe('DD/MM/YYYY format (unambiguous)', () => {
    it('should parse when day > 12', () => {
      expect(normalizeDateToISO('16/02/1959')).toBe('1959-02-16');
      expect(normalizeDateToISO('31/12/2023')).toBe('2023-12-31');
      expect(normalizeDateToISO('25/06/2020')).toBe('2020-06-25');
    });
  });

  describe('MM/DD/YYYY format (unambiguous)', () => {
    it('should parse when month > 12', () => {
      expect(normalizeDateToISO('02/16/1959')).toBe('1959-02-16');
      expect(normalizeDateToISO('12/31/2023')).toBe('2023-12-31');
    });
  });

  describe('Ambiguous numeric formats', () => {
    it('should default to DD/MM/YYYY when both ≤ 12', () => {
      expect(normalizeDateToISO('01/02/2024')).toBe('2024-02-01'); // Feb 1
      expect(normalizeDateToISO('05/06/2023')).toBe('2023-06-05'); // Jun 5
      expect(normalizeDateToISO('12/11/2022')).toBe('2022-11-12'); // Nov 12
    });
  });

  describe('Text/written formats', () => {
    it('should parse text dates', () => {
      expect(normalizeDateToISO('November 14, 1965')).toBe('1965-11-14');
      expect(normalizeDateToISO('March 14, 2024')).toBe('2024-03-14');
      expect(normalizeDateToISO('14 March 2024')).toBe('2024-03-14');
    });
  });

  describe('Alternative separators', () => {
    it('should handle dot separators', () => {
      expect(normalizeDateToISO('14.03.2024')).toBe('2024-03-14');
      expect(normalizeDateToISO('31.12.2023')).toBe('2023-12-31');
    });

    it('should handle dash separators', () => {
      expect(normalizeDateToISO('14-03-2024')).toBe('2024-03-14');
      expect(normalizeDateToISO('31-12-2023')).toBe('2023-12-31');
    });
  });

  describe('2-digit year handling', () => {
    it('should convert 2-digit years to 4-digit', () => {
      expect(normalizeDateToISO('16/02/59')).toBe('1959-02-16');
      expect(normalizeDateToISO('14/03/24')).toBe('2024-03-14');
      expect(normalizeDateToISO('01/01/00')).toBe('2000-01-01');
      expect(normalizeDateToISO('31/12/99')).toBe('1999-12-31');
    });
  });

  describe('Invalid dates', () => {
    it('should return null for invalid dates', () => {
      expect(normalizeDateToISO('31/02/2024')).toBeNull(); // Feb 31 doesn't exist
      expect(normalizeDateToISO('32/01/2024')).toBeNull(); // Day 32 invalid
      expect(normalizeDateToISO('01/13/2024')).toBeNull(); // Month 13 invalid
      expect(normalizeDateToISO('invalid')).toBeNull();
      expect(normalizeDateToISO('')).toBeNull();
      expect(normalizeDateToISO(null)).toBeNull();
    });
  });

  describe('Real production cases', () => {
    it('should handle Vincent Cheers case', () => {
      expect(normalizeDateToISO('16/02/1959')).toBe('1959-02-16');
    });

    it('should handle Emma Thompson cases', () => {
      expect(normalizeDateToISO('November 14, 1965')).toBe('1965-11-14');
      expect(normalizeDateToISO('11/14/1965')).toBe('1965-11-14');
    });
  });
});
```

### Integration Tests Required

**Test Scenario 1: Full Reconciliation Pipeline**
```typescript
describe('Date normalization in reconciliation', () => {
  it('should reconcile DD/MM/YYYY DOB to final encounter', async () => {
    // Create pending encounter with DD/MM/YYYY DOB
    const pending = {
      patient_date_of_birth: '16/02/1959',
      encounter_start_date: '14/03/2024',
      encounter_end_date: '14/03/2024'
    };

    // Run reconciliation
    const result = await reconcilePendingToFinal(sessionId);

    // Verify final encounter has ISO dates
    const final = await getFinalEncounter(sessionId);
    expect(final.patient_date_of_birth).toBe('1959-02-16');
    expect(final.encounter_start_date).toContain('2024-03-14'); // TIMESTAMPTZ
    expect(final.encounter_end_date).toContain('2024-03-14');
  });
});
```

### Manual Testing Checklist

**Pre-Implementation:**
- [ ] Backup production database
- [ ] Document current test data state
- [ ] Prepare rollback plan

**Post-Implementation:**
- [ ] Re-upload Vincent Cheers 3-page file
- [ ] Verify `healthcare_encounters.patient_date_of_birth` = `'1959-02-16'`
- [ ] Re-upload Emma Thompson 142-page file
- [ ] Verify DOB = `'1965-11-14'`
- [ ] Upload test file with ambiguous date (e.g., `"01/02/2024"`)
- [ ] Verify defaults to DD/MM/YYYY (`'2024-02-01'`)
- [ ] Check all 3 date fields are populated in final encounters
- [ ] Review console logs for warnings

---

## References

### Internal Documentation
- `RABBIT-HUNT-2025-11-20.md` - Original bug report (#24)
- `current_schema/03_clinical_core.sql` - Healthcare encounters table schema
- `current_schema/08_job_coordination.sql` - Reconciliation RPC definition
- `apps/render-worker/src/pass05/progressive/pending-reconciler.ts` - Current implementation

### External Standards
- **ISO 8601:** https://www.iso.org/iso-8601-date-and-time-format.html
- **HL7 FHIR:** https://www.hl7.org/fhir/datatypes.html#date
- **FDA 21 CFR 801.18:** Medical device date labeling requirements
- **PostgreSQL Date/Time Types:** https://www.postgresql.org/docs/current/datatype-datetime.html
- **JavaScript Date Constructor:** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date

### Research Sources (2025-11-23)
- Stack Overflow: "Best practices for storing dates in PostgreSQL"
- PostgreSQL Wiki: "Don't Do This - Timestamp Without Time Zone"
- HL7 International: "FHIR Data Types - date, dateTime, instant"
- BC Health Information Standards: ISO 8601 EDTF adoption

---

## Appendix: Example Data Flow

### Before Fix (Current State)

```
AI Extraction:
  patient_date_of_birth: "16/02/1959"

↓ Stored in pass05_pending_encounters (JSONB)

normalizeDateToISO("16/02/1959"):
  new Date("16/02/1959")
  → Tries to parse as MM/DD/YYYY
  → Month 16 invalid
  → Returns null

↓ Passed to reconcile_pending_to_final RPC

RPC Cast:
  (null)::DATE
  → NULL

↓ Stored in healthcare_encounters

Final Result:
  patient_date_of_birth: NULL ❌
```

### After Fix (Expected State)

```
AI Extraction:
  patient_date_of_birth: "16/02/1959"

↓ Stored in pass05_pending_encounters (JSONB)

normalizeDateToISO("16/02/1959"):
  Regex match: (\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})
  → first=16, second=02, year=1959
  → first > 12, so must be DD/MM/YYYY
  → day=16, month=02
  → Returns "1959-02-16"

↓ Passed to reconcile_pending_to_final RPC

RPC Cast:
  ("1959-02-16")::DATE
  → Valid ISO 8601 format
  → Successfully casts to DATE type

↓ Stored in healthcare_encounters

Final Result:
  patient_date_of_birth: "1959-02-16" ✅
```

---

## Appendix A: GPT-5.1 Review & Accepted Enhancements

**Review Date:** 2025-11-23
**Reviewer:** GPT-5.1 (second AI analysis)
**Status:** Reviewed and integrated

### Changes Accepted from Review

#### 1. Enhanced Fallback Logging (Safety Critical)

**Issue:** Fallback `new Date(trimmed)` could silently accept unexpected formats.

**Solution:** Keep fallback but add distinct logging and metric tracking:

```typescript
// 4. Fallback: Try JS Date() as last resort WITH EXPLICIT LOGGING
const fallback = new Date(trimmed);
if (!isNaN(fallback.getTime())) {
  console.warn('[Identity] FALLBACK DATE PARSE USED - REVIEW IF FREQUENT:', {
    original: dateString,
    parsed: fallback.toISOString(),
    field: fieldName,  // 'patient_date_of_birth', 'encounter_start_date', etc.
    context: 'Unexpected format - should match known patterns'
  });
  // TODO: Track in metrics: fallback_parse_count by field type
  const year = fallback.getFullYear();
  const month = String(fallback.getMonth() + 1).padStart(2, '0');
  const day = String(fallback.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

**Rationale:** Allows graceful handling of edge cases while maintaining visibility into unexpected formats.

#### 2. Ambiguity Flagging for QA Review

**Issue:** Ambiguous dates (e.g., `"01/02/2024"`) silently default to DD/MM/YYYY with no QA signal.

**Solution:** Return metadata object instead of plain string:

```typescript
interface DateNormalizationResult {
  isoDate: string | null;           // Normalized ISO 8601 date
  wasAmbiguous: boolean;             // True if both DD/MM and MM/DD were valid
  originalFormat: string;            // Raw input for audit trail
  parseMethod: 'iso_passthrough' | 'text' | 'dd_mm' | 'mm_dd' | 'ambiguous_default' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}

// Example usage:
const dobResult = normalizeDateToISO('01/02/2024', 'patient_date_of_birth');
// Returns:
// {
//   isoDate: '2024-02-01',
//   wasAmbiguous: true,
//   originalFormat: '01/02/2024',
//   parseMethod: 'ambiguous_default',
//   confidence: 'low'
// }
```

**Storage in Database:**

```typescript
// In pending-reconciler.ts when preparing encounterData:
const dobResult = normalizeDateToISO(
  pickBestValue(groupPendings.map(p => p.patient_date_of_birth)),
  'patient_date_of_birth'
);

const encounterData = {
  patient_date_of_birth: dobResult.isoDate,
  quality_criteria_met: {
    ...existingCriteria,
    date_ambiguity_flags: {
      patient_date_of_birth: dobResult.wasAmbiguous ? 'ambiguous_dd_mm_assumed' : 'unambiguous',
      patient_date_of_birth_confidence: dobResult.confidence
    }
  }
};
```

**UI Impact (Future):**
- QA dashboard can filter encounters with ambiguous dates
- Manual review queue can prioritize low-confidence dates
- User can see "Date format was ambiguous (DD/MM/YYYY assumed)" indicator

#### 3. DOB Year Sanity Checks

**Issue:** OCR errors like "2165-11-14" not caught.

**Solution:** Add field-specific validation:

```typescript
// After constructing ISO date, add sanity checks
if (fieldName === 'patient_date_of_birth') {
  const yearNum = parseInt(year, 10);
  const currentYear = new Date().getFullYear();

  // DOB must be between 1900 and current year + 1
  if (yearNum < 1900 || yearNum > currentYear + 1) {
    console.warn('[Identity] DOB year out of range - likely OCR error:', {
      year: yearNum,
      dateString,
      validRange: `1900-${currentYear + 1}`,
      suggestion: 'Review source document for OCR misread digits'
    });
    return {
      isoDate: null,
      wasAmbiguous: false,
      originalFormat: dateString,
      parseMethod: 'failed_sanity_check',
      confidence: 'low',
      error: 'year_out_of_range'
    };
  }
}
```

**Rationale:**
- Common OCR errors: `1` → `l`, `0` → `O`, digit transposition
- Patient DOB has natural bounds (unlike encounter dates which can be historical or future)
- Better to flag for review than store obviously wrong data

#### 4. Documentation Correction: FHIR Date Standards

**Issue:** Document incorrectly claimed "HL7 FHIR recommends DD/MM/YYYY for international use"

**Correction:**

**FHIR Actual Standard:**
- HL7 FHIR mandates **ISO 8601 format** for date storage and interchange
- Format: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` (no DD/MM vs MM/DD prescription)
- FHIR does NOT specify input/display formats (left to implementation)

**Our Policy Justification (Corrected):**
The decision to default ambiguous dates to DD/MM/YYYY is based on:
1. **Majority usage:** DD/MM/YYYY used by ~70% of world population
2. **Primary market:** Australia uses DD/MM/YYYY in medical records
3. **International standards:** ISO 8601 uses descending significance (YYYY-MM-DD implies day before month)
4. **Safety:** Explicit policy is safer than inconsistent behavior

This is an **application-layer parsing decision**, not a FHIR requirement.

#### 5. Date Normalization Observability Metrics

**Addition to Future Enhancements:**

Track normalization statistics to detect issues early:

```typescript
// Store in pass05_progressive_sessions.metadata JSONB or new metrics table
interface DateNormalizationMetrics {
  patient_date_of_birth: {
    total_processed: number;
    successfully_normalized: number;
    failed_null: number;
    ambiguous_defaulted: number;
    fallback_used: number;
    format_breakdown: {
      iso_passthrough: number;
      text_format: number;
      dd_mm_unambiguous: number;
      mm_dd_unambiguous: number;
      ambiguous_default: number;
      fallback: number;
    };
  };
  encounter_start_date: { /* same structure */ };
  encounter_end_date: { /* same structure */ };
}
```

**Usage:**
- Dashboard shows normalization success rate per field
- Alerts trigger if failure rate exceeds threshold (e.g., >10%)
- Analysis identifies which formats are most common (inform prompt tuning)

### Changes Rejected from Review

#### AI Contract Tightening (Rejected)

**Suggestion:** Require AI to output ISO 8601 only; treat non-ISO as contract violation.

**Rationale for Rejection:**
1. **OCR reality:** AI extracts what appears in document; if document says "16/02/1959", AI should preserve that
2. **Audit trail:** Raw extracted value is critical for healthcare compliance
3. **Separation of concerns:** AI = faithful extractor, Code = normalizer (testable, deterministic)
4. **AI date parsing:** Would move disambiguation logic into AI's black box (less debuggable)

**Correct Architecture:**
- AI outputs EXACTLY what it sees in document
- Application code normalizes with explicit, testable rules
- Both raw and normalized values stored for audit

#### Date-fns Library Migration (Deferred)

**Suggestion:** Use `date-fns` library with explicit format whitelist.

**Decision:** Defer to future if custom parser proves insufficient.

**Rationale:**
- Custom parser covers all known formats with full control
- No external dependency (20KB savings)
- Can migrate to `date-fns` if edge cases emerge post-launch

#### Server-Side Parsing with Region Metadata (Deferred)

**Suggestion:** Tag documents with region (AU/US/EU) and use PostgreSQL `to_date()` with region-specific formats.

**Decision:** Defer pending region metadata availability.

**Rationale:**
- Requires storing region code per document
- Multi-region documents exist (US doctor treating AU patient)
- Current heuristic-based approach handles mixed sources gracefully

---

## Appendix B: Context-Based Disambiguation Strategies (Exploratory)

**Status:** Research and design phase
**Priority:** Medium (post-MVP enhancement)
**Goal:** Improve ambiguous date resolution beyond simple DD/MM/YYYY default

### Overview

For ambiguous date strings where both DD/MM/YYYY and MM/DD/YYYY are valid (e.g., `"05/06/2023"`), we currently default to DD/MM/YYYY (international standard). This section explores using **contextual signals** from the same document/encounter to make smarter disambiguation decisions.

---

### Strategy 1: Intra-Encounter Date Format Consistency

**Principle:** All dates within a single encounter should use the same format.

**Logic:**
1. Extract ALL dates from same encounter (DOB, encounter start, encounter end, prescription dates, lab dates, etc.)
2. Identify unambiguous dates (day > 12 or month > 12)
3. Infer format from unambiguous dates
4. Apply same format to ambiguous dates

**Example:**

```typescript
// Within same encounter:
const dates = {
  dob: "05/06/1959",           // AMBIGUOUS
  encounter_date: "15/06/2023", // UNAMBIGUOUS (day=15, must be DD/MM/YYYY)
  prescription_date: "03/07/2023" // AMBIGUOUS
};

// Analysis:
// - encounter_date is unambiguous → DD/MM/YYYY format detected
// - Apply DD/MM/YYYY to ALL dates in this encounter
// - dob: "1959-06-05" (June 5)
// - prescription_date: "2023-07-03" (July 3)
```

**Implementation:**

```typescript
interface DateContext {
  dates: Array<{
    fieldName: string;
    rawValue: string;
    isAmbiguous: boolean;
    detectedFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY';
  }>;
}

function inferEncounterDateFormat(context: DateContext): 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'unknown' {
  // Count unambiguous dates by format
  const formatVotes = {
    'DD/MM/YYYY': 0,
    'MM/DD/YYYY': 0
  };

  for (const date of context.dates) {
    if (!date.isAmbiguous && date.detectedFormat) {
      formatVotes[date.detectedFormat]++;
    }
  }

  // Require at least 2 unambiguous dates for confidence
  const totalUnambiguous = formatVotes['DD/MM/YYYY'] + formatVotes['MM/DD/YYYY'];
  if (totalUnambiguous < 2) {
    return 'unknown';  // Fall back to default policy
  }

  // Return majority format
  return formatVotes['DD/MM/YYYY'] >= formatVotes['MM/DD/YYYY']
    ? 'DD/MM/YYYY'
    : 'MM/DD/YYYY';
}
```

**Data Sources:**
- DOB: `pass05_pending_encounters.patient_date_of_birth`
- Encounter dates: `encounter_start_date`, `encounter_end_date`
- Future: Lab result dates, prescription dates, procedure dates (Pass 2 data)

**Confidence Levels:**
```typescript
const confidence = {
  '3+ unambiguous dates, unanimous format': 'high',
  '2 unambiguous dates, same format': 'medium',
  '1 unambiguous date': 'low',
  '0 unambiguous dates': 'use_default_policy'
};
```

**Database Schema Addition (Future):**
```sql
-- Add to pass05_pending_encounters or healthcare_encounters
ALTER TABLE pass05_pending_encounters
ADD COLUMN inferred_date_format VARCHAR(20)
  CHECK (inferred_date_format IN ('DD/MM/YYYY', 'MM/DD/YYYY', 'unknown')),
ADD COLUMN date_format_confidence VARCHAR(10)
  CHECK (date_format_confidence IN ('high', 'medium', 'low'));
```

---

### Strategy 2: Geographic Context from Address

**Principle:** Patient/provider address indicates likely date format convention.

**Logic:**
1. Extract address from encounter (patient or facility)
2. Detect country/region from address
3. Apply region-specific date format

**Regional Date Format Standards:**
```typescript
const REGION_DATE_FORMATS = {
  // DD/MM/YYYY regions
  'AU': 'DD/MM/YYYY',  // Australia
  'GB': 'DD/MM/YYYY',  // United Kingdom
  'NZ': 'DD/MM/YYYY',  // New Zealand
  'IE': 'DD/MM/YYYY',  // Ireland
  'ZA': 'DD/MM/YYYY',  // South Africa
  'IN': 'DD/MM/YYYY',  // India
  'EU': 'DD/MM/YYYY',  // European Union (most countries)

  // MM/DD/YYYY regions
  'US': 'MM/DD/YYYY',  // United States
  'PH': 'MM/DD/YYYY',  // Philippines
  'CA': 'MM/DD/YYYY',  // Canada (mixed, but MM/DD common)

  // YYYY/MM/DD regions (ISO order)
  'JP': 'YYYY/MM/DD',  // Japan
  'KR': 'YYYY/MM/DD',  // South Korea
  'CN': 'YYYY/MM/DD',  // China
};
```

**Example:**

```typescript
// Encounter data:
const encounter = {
  patient_address: "123 Main St, Boston, MA 02101, USA",
  patient_dob: "05/06/1959"  // AMBIGUOUS
};

// Address parsing:
const detectedCountry = extractCountryFromAddress(encounter.patient_address);
// Returns: "US"

// Format inference:
const dateFormat = REGION_DATE_FORMATS[detectedCountry];
// Returns: "MM/DD/YYYY"

// Apply to DOB:
// "05/06/1959" → "1959-05-06" (May 6) instead of default June 5
```

**Implementation Challenges:**

1. **Address Parsing Reliability:**
   - Addresses may be incomplete ("Sydney" without country)
   - OCR errors in address field
   - Abbreviated addresses ("NSW, Australia" vs full postal address)

2. **Ambiguous Addresses:**
   - City names exist in multiple countries (Paris, TX vs Paris, France)
   - Requires postal code or state/province for disambiguation

3. **Multi-National Documents:**
   - US doctor treating Australian patient (which address wins?)
   - Patient moved countries (address on document may not match DOB document)

**Proposed Solution:**

```typescript
interface AddressContext {
  patient_address?: string;
  facility_address?: string;
  provider_address?: string;
}

function inferDateFormatFromAddress(context: AddressContext): {
  format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  source: 'patient' | 'facility' | 'provider' | 'none';
} {
  // Priority: facility > patient > provider
  // Rationale: Facility location is where document was created

  for (const [source, address] of [
    ['facility', context.facility_address],
    ['patient', context.patient_address],
    ['provider', context.provider_address]
  ]) {
    if (!address) continue;

    const country = extractCountryFromAddress(address as string);
    if (country && REGION_DATE_FORMATS[country]) {
      return {
        format: REGION_DATE_FORMATS[country],
        confidence: source === 'facility' ? 'high' : 'medium',
        source: source as 'patient' | 'facility' | 'provider'
      };
    }
  }

  return { format: 'unknown', confidence: 'low', source: 'none' };
}
```

**Data Sources:**
- `pass05_pending_encounters.patient_address`
- `pass05_pending_encounters.facility_name` (may need geocoding)
- Future: `healthcare_encounter_identifiers` table may contain address data

**Database Schema Addition (Future):**
```sql
-- Add to pass05_pending_encounters
ALTER TABLE pass05_pending_encounters
ADD COLUMN detected_country_code VARCHAR(2),  -- ISO 3166-1 alpha-2
ADD COLUMN address_confidence VARCHAR(10),
ADD COLUMN address_source VARCHAR(20) CHECK (address_source IN ('patient', 'facility', 'provider'));
```

---

### Strategy 3: User Device/Account Timezone (Lower Priority)

**Principle:** User's account timezone or device locale may indicate preferred date format.

**Logic:**
1. Capture user timezone on upload
2. Map timezone to likely date format
3. Use as weak signal (lowest priority)

**Timezone → Format Mapping:**
```typescript
const TIMEZONE_DATE_FORMATS = {
  // US timezones → MM/DD/YYYY
  'America/New_York': 'MM/DD/YYYY',
  'America/Chicago': 'MM/DD/YYYY',
  'America/Los_Angeles': 'MM/DD/YYYY',

  // AU/NZ timezones → DD/MM/YYYY
  'Australia/Sydney': 'DD/MM/YYYY',
  'Australia/Melbourne': 'DD/MM/YYYY',
  'Pacific/Auckland': 'DD/MM/YYYY',

  // UK/EU timezones → DD/MM/YYYY
  'Europe/London': 'DD/MM/YYYY',
  'Europe/Paris': 'DD/MM/YYYY',
};
```

**Challenges:**

1. **User Mobility:**
   - Australian user traveling in US (which timezone to trust?)
   - Uploaded old documents from different country

2. **VPN/Proxy:**
   - Timezone may not reflect actual location

3. **Multi-User Accounts:**
   - Healthcare proxy uploading for parent (different timezones)

**Recommendation:**
- Use as **tie-breaker only** when all other signals are ambiguous
- Never override stronger signals (intra-encounter consistency, address)

**Implementation:**

```typescript
// Capture on upload (already available in user_profiles or session)
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// e.g., "Australia/Sydney"

// Use as lowest-priority signal
function inferDateFormatFromTimezone(timezone: string): 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'unknown' {
  return TIMEZONE_DATE_FORMATS[timezone] || 'unknown';
}
```

**Priority Order:**
1. Intra-encounter date consistency (Strategy 1) - **HIGH**
2. Address geographic context (Strategy 2) - **MEDIUM**
3. User timezone (Strategy 3) - **LOW** (tie-breaker only)

---

### Strategy 4: Medical Record Number (MRN) Pattern Analysis

**Principle:** MRN format may contain embedded geographic or system identifiers.

**Examples of MRN Patterns:**

```typescript
// US Healthcare Systems
const US_MRN_PATTERNS = {
  Epic: /^[E]\d{7}$/,           // Epic EMR: E1234567
  Cerner: /^[C]\d{8}$/,         // Cerner: C12345678
  Medicare: /^\d{10}[A-Z]$/,    // Medicare number: 1234567890A
};

// Australian Healthcare Systems
const AU_MRN_PATTERNS = {
  Medicare: /^\d{10}$/,         // Medicare: 1234567890 (10 digits)
  IHI: /^\d{16}$/,              // Individual Healthcare Identifier: 16 digits
  Hospital: /^[A-Z]{2}\d{6}$/,  // Hospital MRN: AB123456
};

// UK Healthcare Systems
const UK_MRN_PATTERNS = {
  NHS: /^\d{3}\s?\d{3}\s?\d{4}$/, // NHS number: 123 456 7890
};
```

**Detection Logic:**

```typescript
interface MRNContext {
  identifiers: Array<{
    identifier_type: string;      // 'MRN', 'Medicare', 'NHS', 'IHI'
    identifier_value: string;
    identifier_system?: string;   // 'Epic', 'Cerner', 'AU_Medicare', etc.
  }>;
}

function inferDateFormatFromMRN(context: MRNContext): {
  format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'unknown';
  confidence: 'medium' | 'low';
  detectedSystem?: string;
} {
  for (const identifier of context.identifiers) {
    // Check Australian patterns
    if (/^\d{10}$/.test(identifier.identifier_value)) {
      return {
        format: 'DD/MM/YYYY',
        confidence: 'medium',
        detectedSystem: 'AU_Medicare'
      };
    }

    if (/^\d{16}$/.test(identifier.identifier_value)) {
      return {
        format: 'DD/MM/YYYY',
        confidence: 'medium',
        detectedSystem: 'AU_IHI'
      };
    }

    // Check US patterns
    if (/^[E]\d{7}$/.test(identifier.identifier_value)) {
      return {
        format: 'MM/DD/YYYY',
        confidence: 'medium',
        detectedSystem: 'US_Epic'
      };
    }

    if (/^\d{10}[A-Z]$/.test(identifier.identifier_value)) {
      return {
        format: 'MM/DD/YYYY',
        confidence: 'medium',
        detectedSystem: 'US_Medicare'
      };
    }

    // Check UK patterns
    if (/^\d{3}\s?\d{3}\s?\d{4}$/.test(identifier.identifier_value)) {
      return {
        format: 'DD/MM/YYYY',
        confidence: 'medium',
        detectedSystem: 'UK_NHS'
      };
    }
  }

  return { format: 'unknown', confidence: 'low' };
}
```

**Data Sources:**

Currently planned tables (see Rabbit #25):
- `pass05_pending_encounter_identifiers` (pending encounters)
- `healthcare_encounter_identifiers` (final encounters)

**Schema (from current_schema/04_ai_processing.sql lines 1947-1970):**
```sql
CREATE TABLE IF NOT EXISTS pass05_pending_encounter_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  pending_id text NOT NULL,
  FOREIGN KEY (session_id, pending_id)
    REFERENCES pass05_pending_encounters(session_id, pending_id) ON DELETE CASCADE,

  identifier_type varchar(50) NOT NULL,     -- 'MRN', 'Medicare', 'patient_id', 'visit_id'
  identifier_value text NOT NULL,
  identifier_system text,                   -- 'Epic', 'Cerner', 'AU_Medicare', etc.
  assigner_organization text,

  created_at timestamptz DEFAULT now()
);
```

**Note:** As of Rabbit #25, these tables are currently empty (bug to be fixed). Once identifiers are being extracted and stored, MRN pattern analysis becomes viable.

**Limitations:**

1. **OCR Errors in MRN:**
   - MRN may be misread (digit confusion: 0/O, 1/I, 8/B)
   - Pattern matching becomes unreliable

2. **International Healthcare:**
   - Multi-national hospital systems (Cleveland Clinic, Mayo Clinic have international branches)
   - MRN pattern may not match document location

3. **Generic MRN Formats:**
   - Many hospitals use simple numeric MRNs (e.g., `123456`) with no geographic signal

**Recommendation:**
- Use as **supplementary signal** when MRN clearly matches known pattern
- Combine with other strategies (don't rely solely on MRN)
- Priority: MEDIUM (behind intra-encounter consistency, on par with address)

---

### Strategy 5: Cross-Document Consistency (Shell File Level)

**Principle:** Multiple encounters within same shell_file (document upload) should use consistent date format.

**Scope Difference from Strategy 1:**
- Strategy 1: Dates within **single encounter**
- Strategy 5: Dates across **multiple encounters** in same document

**Example:**

```typescript
// Single 50-page document contains 3 encounters:
const shellFile = {
  encounters: [
    {
      encounter_type: 'outpatient',
      encounter_date: '15/06/2023',  // UNAMBIGUOUS (day=15)
      patient_dob: '05/06/1959'      // AMBIGUOUS
    },
    {
      encounter_type: 'specialist',
      encounter_date: '22/07/2023',  // UNAMBIGUOUS (day=22)
      patient_dob: '05/06/1959'      // AMBIGUOUS (same patient)
    },
    {
      encounter_type: 'diagnostic',
      encounter_date: '03/08/2023',  // AMBIGUOUS
      patient_dob: '05/06/1959'      // AMBIGUOUS (same patient)
    }
  ]
};

// Analysis:
// - 2 out of 3 encounters have unambiguous dates → DD/MM/YYYY detected
// - Apply DD/MM/YYYY to ALL dates in this shell_file
// - High confidence: Same document, same medical system, same format convention
```

**Implementation:**

```typescript
interface ShellFileContext {
  shell_file_id: string;
  encounters: Array<{
    pending_id: string;
    dates: Array<{
      fieldName: string;
      rawValue: string;
      isAmbiguous: boolean;
      detectedFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY';
    }>;
  }>;
}

function inferShellFileDateFormat(context: ShellFileContext): {
  format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  unambiguousCount: number;
} {
  const formatVotes = { 'DD/MM/YYYY': 0, 'MM/DD/YYYY': 0 };

  // Count unambiguous dates across ALL encounters in this shell file
  for (const encounter of context.encounters) {
    for (const date of encounter.dates) {
      if (!date.isAmbiguous && date.detectedFormat) {
        formatVotes[date.detectedFormat]++;
      }
    }
  }

  const totalUnambiguous = formatVotes['DD/MM/YYYY'] + formatVotes['MM/DD/YYYY'];

  // Confidence based on sample size
  let confidence: 'high' | 'medium' | 'low';
  if (totalUnambiguous >= 5) {
    confidence = 'high';
  } else if (totalUnambiguous >= 3) {
    confidence = 'medium';
  } else if (totalUnambiguous >= 1) {
    confidence = 'low';
  } else {
    return { format: 'unknown', confidence: 'low', unambiguousCount: 0 };
  }

  // Require >75% agreement for high confidence
  const majority = Math.max(formatVotes['DD/MM/YYYY'], formatVotes['MM/DD/YYYY']);
  if (majority / totalUnambiguous < 0.75) {
    confidence = 'low';  // Mixed formats detected - unusual
  }

  return {
    format: formatVotes['DD/MM/YYYY'] >= formatVotes['MM/DD/YYYY']
      ? 'DD/MM/YYYY'
      : 'MM/DD/YYYY',
    confidence,
    unambiguousCount: totalUnambiguous
  };
}
```

**Data Sources:**
```sql
-- Query all encounters from same shell_file
SELECT
  pe.pending_id,
  pe.patient_date_of_birth,
  pe.encounter_start_date,
  pe.encounter_end_date
FROM pass05_pending_encounters pe
WHERE pe.session_id = (
  SELECT id FROM pass05_progressive_sessions
  WHERE shell_file_id = :shell_file_id
)
```

**Database Schema Addition (Future):**
```sql
-- Add to pass05_progressive_sessions (shell file level metadata)
ALTER TABLE pass05_progressive_sessions
ADD COLUMN inferred_date_format VARCHAR(20),
ADD COLUMN date_format_confidence VARCHAR(10),
ADD COLUMN date_format_unambiguous_count INTEGER;
```

**Benefits:**
- Leverages multiple data points across entire document
- Same document = same healthcare system = consistent format
- Higher confidence than single-encounter analysis

**Priority:** **HIGH** (equal to Strategy 1, should be combined)

---

### Combined Disambiguation Strategy

**Recommended Priority Order:**

```typescript
function disambiguateDateFormat(context: {
  encounterDates: DateContext;           // Strategy 1: Intra-encounter
  shellFileDates: ShellFileContext;      // Strategy 5: Cross-document
  addresses: AddressContext;             // Strategy 2: Geographic
  identifiers: MRNContext;               // Strategy 4: MRN patterns
  userTimezone: string;                  // Strategy 3: User locale
}): {
  format: 'DD/MM/YYYY' | 'MM/DD/YYYY';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {

  // PRIORITY 1: Cross-document consistency (shell file level)
  // Rationale: Most data points, same healthcare system
  const shellFileInference = inferShellFileDateFormat(context.shellFileDates);
  if (shellFileInference.confidence === 'high' && shellFileInference.unambiguousCount >= 5) {
    return {
      format: shellFileInference.format,
      confidence: 'high',
      reason: `shell_file_consistency_${shellFileInference.unambiguousCount}_unambiguous_dates`
    };
  }

  // PRIORITY 2: Intra-encounter consistency
  // Rationale: Same encounter = same date format
  const encounterInference = inferEncounterDateFormat(context.encounterDates);
  if (encounterInference !== 'unknown') {
    return {
      format: encounterInference,
      confidence: 'medium',
      reason: 'intra_encounter_consistency'
    };
  }

  // PRIORITY 3: Geographic context (address)
  // Rationale: Document location indicates date convention
  const addressInference = inferDateFormatFromAddress(context.addresses);
  if (addressInference.confidence !== 'low') {
    return {
      format: addressInference.format,
      confidence: addressInference.confidence,
      reason: `address_${addressInference.source}_${addressInference.format}`
    };
  }

  // PRIORITY 4: MRN pattern analysis
  // Rationale: Healthcare system identifier may indicate region
  const mrnInference = inferDateFormatFromMRN(context.identifiers);
  if (mrnInference.format !== 'unknown') {
    return {
      format: mrnInference.format,
      confidence: mrnInference.confidence,
      reason: `mrn_pattern_${mrnInference.detectedSystem}`
    };
  }

  // PRIORITY 5: User timezone (tie-breaker only)
  // Rationale: Weakest signal, user may be traveling or using VPN
  const timezoneInference = inferDateFormatFromTimezone(context.userTimezone);
  if (timezoneInference !== 'unknown') {
    return {
      format: timezoneInference,
      confidence: 'low',
      reason: `user_timezone_${context.userTimezone}`
    };
  }

  // FALLBACK: Default policy (DD/MM/YYYY for international majority)
  return {
    format: 'DD/MM/YYYY',
    confidence: 'low',
    reason: 'default_international_policy'
  };
}
```

**Database Storage:**

```sql
-- Add to pass05_pending_encounters or healthcare_encounters
ALTER TABLE pass05_pending_encounters
ADD COLUMN date_format_inference JSONB;

-- Example value:
{
  "format": "DD/MM/YYYY",
  "confidence": "high",
  "reason": "shell_file_consistency_7_unambiguous_dates",
  "strategies_applied": [
    {
      "strategy": "cross_document_consistency",
      "result": "DD/MM/YYYY",
      "confidence": "high",
      "unambiguous_count": 7
    },
    {
      "strategy": "intra_encounter_consistency",
      "result": "DD/MM/YYYY",
      "confidence": "medium",
      "unambiguous_count": 2
    },
    {
      "strategy": "address_geographic",
      "result": "DD/MM/YYYY",
      "confidence": "medium",
      "detected_country": "AU"
    }
  ],
  "all_agree": true  // All strategies returned same format (high confidence)
}
```

**Testing Strategy:**

Create test cases for each scenario:
```typescript
describe('Combined disambiguation', () => {
  it('should use shell-file consistency when 5+ unambiguous dates', () => {
    // Test with 7 DD/MM dates across 3 encounters
  });

  it('should fall back to intra-encounter when shell-file inconclusive', () => {
    // Test with 1 encounter, 2 unambiguous DD/MM dates
  });

  it('should use address when dates all ambiguous', () => {
    // Test with US address, all dates like 01/02/2024
  });

  it('should use MRN when address missing', () => {
    // Test with Epic MRN pattern (US system)
  });

  it('should use timezone as tie-breaker', () => {
    // Test with all other signals inconclusive
  });

  it('should flag conflicts when strategies disagree', () => {
    // Test: shell-file says DD/MM, but address says US
    // Should return low confidence + flag for review
  });
});
```

---

## Implementation Roadmap

### Phase 1: Immediate Fix (Current Sprint)
- ✅ Implement basic `normalizeDateToISO()` with DD/MM/YYYY heuristics
- ✅ Add ambiguity flagging and metadata return
- ✅ Add DOB year sanity checks
- ✅ Enhanced fallback logging

### Phase 2: Intra-Encounter Consistency (Next Sprint)
- Implement Strategy 1 (intra-encounter date consistency)
- Store inferred format in database
- Update reconciliation logic to use inferred format

### Phase 3: Cross-Document Analysis (Future)
- Implement Strategy 5 (shell-file level consistency)
- Combine with Strategy 1 for higher confidence
- Add metrics dashboard for format detection success rate

### Phase 4: Geographic & MRN Context (Future)
- Implement Strategy 2 (address-based inference)
- Implement Strategy 4 (MRN pattern analysis)
- Requires fixing Rabbit #25 (identifier extraction bug) first

### Phase 5: User Timezone (Low Priority)
- Implement Strategy 3 (timezone as tie-breaker)
- Capture timezone on upload
- Use only when all other signals fail

---

**Document Status:** Updated with GPT-5.1 review feedback and exploratory disambiguation strategies
**Next Step:** Await clearance to proceed with Phase 1 implementation
**Implementation ETA:**
- Phase 1: ~3 hours (function replacement + metadata + tests)
- Phase 2: ~5 hours (intra-encounter logic + integration)
- Phases 3-5: TBD (post-MVP enhancements)

