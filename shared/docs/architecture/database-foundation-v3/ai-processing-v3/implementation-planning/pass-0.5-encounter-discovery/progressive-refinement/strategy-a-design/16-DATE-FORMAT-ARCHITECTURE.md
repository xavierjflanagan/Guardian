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

**Document Status:** Ready for Review
**Next Step:** Await clearance to proceed with implementation
**Implementation ETA:** <2 hours (function replacement + scope expansion + tests)
