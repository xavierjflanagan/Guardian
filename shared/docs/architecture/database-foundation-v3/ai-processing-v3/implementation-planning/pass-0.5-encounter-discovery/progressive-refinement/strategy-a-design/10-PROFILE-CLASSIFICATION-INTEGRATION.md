# Profile Classification Integration for Strategy A Pass 0.5

**Date:** November 16, 2024
**Status:** Design Specification
**Author:** System Architecture Team

## 1. Executive Summary

This document specifies how profile classification and data quality tiers integrate with Strategy A Pass 0.5 implementation. The design ensures medical records are correctly assigned to the right profile within multi-profile accounts while maintaining data integrity and enabling smart profile creation.

### Core Principles
- **Extract in Pass 0.5, Classify Downstream**: Minimal AI burden, maximum flexibility
- **Non-Blocking Classification**: Never halt the pipeline for identity matching
- **Deterministic Quality Tiers**: Clear A/B/C criteria, no subjective judgments
- **Progressive Enhancement**: Start simple, add sophistication based on real usage

## 2. Architecture Overview

### 2.1 Pipeline Integration Points

```
Document Upload
    ↓
OCR Processing
    ↓
Pass 0.5 (Encounter Detection + Identity Extraction)
    ↓
[NEW] Profile Classification Service
    - Runs after chunk processing
    - Before reconciliation
    - Non-blocking (flags for review)
    ↓
Reconciliation (Cascade → Final Encounters)
    ↓
Pass 1/2/3 (Clinical Extraction)
```

### 2.2 Data Flow

1. **Pass 0.5 extracts** identity markers (name, DOB, provider details)
2. **Classification service** matches against account profiles
3. **Quality calculator** assigns data quality tier
4. **Reconciler** proceeds with or without classification
5. **UI layer** handles user confirmation for low-confidence matches

## 3. Pass 0.5 Modifications

### 3.1 Prompt Additions

Add to V11 prompt after encounter extraction instructions:

```markdown
Additionally, for each encounter extract the following identity and quality markers:

**Patient Identity Markers:**
- patient_full_name: The complete patient name as it appears
- patient_date_of_birth: Date of birth in any format found
- patient_address: Street address if present (optional)
- patient_phone: Phone number if present (optional)

**Provider/Facility Markers:**
- provider_name: Name of the healthcare provider
- facility_name: Name of the hospital/clinic
- encounter_start_date: Date of the encounter/visit (or document preparation date for pseudo-encounters)

**Document Identifiers:**
Extract ALL identification numbers with their context:
- For each ID found, note:
  - The ID value itself
  - What type it appears to be (MRN, Insurance ID, Medicare No, etc.)
  - Any associated organization name

Example:
"MRN: 12345 (Royal Melbourne Hospital)" →
{
  "identifier_value": "12345",
  "identifier_type": "MRN",
  "issuing_organization": "Royal Melbourne Hospital"
}
```

### 3.2 Response Structure Addition

The AI response for each encounter should include:

```json
{
  "encounter_index": 1,
  "encounter_type": "hospital_admission",
  // ... existing fields ...

  "identity_markers": {
    "patient_full_name": "John Robert Smith",
    "patient_date_of_birth": "15/03/1985",  // Raw format as found
    "patient_address": "123 Main St, Melbourne VIC 3000",
    "patient_phone": "0412 345 678"
  },

  "provider_markers": {
    "provider_name": "Dr. Sarah Johnson",
    "facility_name": "Royal Melbourne Hospital",
    "encounter_start_date": "2024-11-15"
  },

  "identifiers": [
    {
      "identifier_value": "RMH-123456",
      "identifier_type": "MRN",
      "issuing_organization": "Royal Melbourne Hospital"
    },
    {
      "identifier_value": "2345 6789 0",
      "identifier_type": "MEDICARE",
      "issuing_organization": "Medicare Australia"
    }
  ]
}
```

## 4. Database Schema Additions

### 4.1 Identity Fields in Pending Encounters

```sql
ALTER TABLE pass05_pending_encounters ADD COLUMN
  -- Identity markers (raw from AI)
  patient_full_name text,
  patient_date_of_birth text,        -- Raw format as extracted
  patient_address text,
  patient_phone varchar(50),

  -- Provider/facility markers
  provider_name text,
  facility_name text,
  encounter_start_date text,         -- Raw encounter date as extracted (visit date or document date)

  -- Classification results (populated post-processing)
  matched_profile_id uuid REFERENCES user_profiles(id),
  match_confidence numeric,           -- 0.0 to 1.0
  match_status varchar(20),           -- 'matched', 'unmatched', 'orphan', 'review'
  is_orphan_identity boolean DEFAULT false,

  -- Data quality tier (calculated post-processing)
  data_quality_tier varchar(20);      -- 'low', 'medium', 'high', 'verified'
```

### 4.2 Pending Encounter Identifiers Table

```sql
CREATE TABLE pass05_pending_encounter_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  pending_id text NOT NULL,

  identifier_type varchar(50),        -- 'MRN', 'INSURANCE', 'MEDICARE', etc.
  identifier_value varchar(100),
  issuing_organization text,
  detected_context text,               -- Raw text where found

  created_at timestamp DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id, pending_id)
    REFERENCES pass05_pending_encounters(session_id, pending_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_pending_identifiers_value ON pass05_pending_encounter_identifiers(identifier_value);
CREATE INDEX idx_pending_identifiers_type ON pass05_pending_encounter_identifiers(identifier_type);
```

### 4.3 Healthcare Encounters Updates

```sql
ALTER TABLE healthcare_encounters ADD COLUMN
  -- Identity fields (new - not duplicates)
  patient_full_name text,
  patient_date_of_birth date,         -- Normalized to ISO format
  patient_address text,
  patient_phone varchar(50),

  -- Note: provider_name and facility_name already exist in healthcare_encounters
  -- No need to add them again

  -- Final classification
  matched_profile_id uuid REFERENCES user_profiles(id),
  match_confidence numeric,
  data_quality_tier varchar(20);
```

### 4.4 Final Encounter Identifiers Table

```sql
CREATE TABLE healthcare_encounter_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,

  identifier_type varchar(50),
  identifier_value varchar(100),
  issuing_organization text,

  -- Audit trail
  source_pending_id text,              -- Which pending created this
  migrated_at timestamp DEFAULT CURRENT_TIMESTAMP,

  -- Simplified unique constraint
  CONSTRAINT uq_encounter_identifier UNIQUE (encounter_id, identifier_type, identifier_value)
);

CREATE INDEX idx_encounter_identifiers_value ON healthcare_encounter_identifiers(identifier_value);
```

### 4.5 Orphan Identities Table (Future)

```sql
-- For tracking unmatched identities that might become profiles
CREATE TABLE orphan_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid REFERENCES auth.users(id),

  detected_name text,
  detected_dob text,
  encounter_count integer DEFAULT 1,
  first_seen timestamp DEFAULT CURRENT_TIMESTAMP,
  last_seen timestamp DEFAULT CURRENT_TIMESTAMP,

  suggested_for_profile boolean DEFAULT false,
  user_decision varchar(20),          -- 'accepted', 'rejected', 'pending'
  created_profile_id uuid REFERENCES user_profiles(id)
);
```

## 5. Classification Logic

### 5.1 Profile Matching Algorithm (Post-Pass 0.5)

#### 5.1.1 Normalization Module (profile-classifier.ts)

All identity normalization happens in the classification service, NOT in Pass 0.5:

```typescript
/**
 * Normalization module for identity matching
 * Location: apps/render-worker/src/pass05/classification/profile-classifier.ts
 */

interface NormalizedIdentity {
  normalized_name: string;
  normalized_dob: Date | null;
  parse_method: string;
  parse_confidence: number;
}

function normalizeIdentity(encounter: PendingEncounter): NormalizedIdentity {
  return {
    normalized_name: normalizeName(encounter.patient_full_name),
    normalized_dob: parseDate(
      encounter.patient_date_of_birth,
      encounter.facility_name  // For locale inference
    ),
    parse_method: 'fuzzy_au_format',
    parse_confidence: 0.95
  };
}

function normalizeName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .normalize('NFD')                // Decompose diacritics
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
}
```

#### 5.1.2 Page Assignment Ordering

**IMPORTANT:** Page assignments must be inserted during chunking, BEFORE any classification-dependent updates:

```typescript
// Correct ordering in chunk-processor.ts:
async function processChunk(chunk: Chunk) {
  // 1. Insert pending encounters
  await insertPendingEncounters(encounters);

  // 2. Insert page assignments (uses pending_id)
  await insertPageAssignments(encounters, pendingIds);

  // 3. Insert identifiers
  await insertPendingIdentifiers(encounters, pendingIds);

  // 4. Classification happens LATER, after all chunks complete
}
```

#### 5.1.3 Matching Decision Tree

```
START: Identity extracted from encounter
    ↓
[Normalize name + DOB]
    ↓
[Compare against account profiles]
    ↓
    ├─ Exactly 1 exact match?
    │   └─→ YES → AUTO-ATTACH (confidence: 0.95)
    │            Status: 'matched'
    │
    ├─ Multiple exact matches?
    │   └─→ YES → REVIEW REQUIRED (confidence: 0.7)
    │            Status: 'review'
    │            Reason: Ambiguous (twins/siblings?)
    │
    ├─ 0 exact matches, 1 fuzzy match?
    │   └─→ YES → REVIEW REQUIRED (confidence: fuzzy_score)
    │            Status: 'review'
    │            Reason: Fuzzy name match
    │
    └─ 0 matches at all?
        └─→ Check orphan count
            ├─ Count > 2? → SUGGEST NEW PROFILE
            │              Status: 'orphan'
            └─ Count ≤ 2 → UNMATCHED
                          Status: 'unmatched'
```

#### 5.1.4 Matching Algorithm Implementation

```typescript
interface ClassificationResult {
  matched_profile_id?: string;
  match_confidence: number;
  match_status: 'matched' | 'unmatched' | 'orphan' | 'review';
  match_explanation: string;
}

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
      match_status: 'review',  // Requires user confirmation
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

// Simple exact match (start here, add complexity later)
function exactMatch(encounter: PendingEncounter, profile: UserProfile): boolean {
  const nameMatch = normalizedCompare(
    encounter.patient_full_name,
    profile.full_name
  );

  const dobMatch = dateCompare(
    encounter.patient_date_of_birth,
    profile.date_of_birth,
    encounter.facility_name  // Use facility location for date format inference
  );

  return nameMatch && dobMatch;
}
```

### 5.2 Date Format Handling with Validation Guards

```typescript
function parseAustralianDate(
  dateStr: string,
  providerLocation?: string,
  encounterStartDate?: string
): Date | null {
  // Handle AU/US format ambiguity
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length !== 3) return null;

  const [part1, part2, part3] = parts.map(p => parseInt(p));

  let parsedDate: Date;

  // If provider is Australian, assume DD/MM/YYYY
  if (providerLocation?.includes('Australia') || providerLocation?.includes('VIC')) {
    parsedDate = new Date(part3, part2 - 1, part1);  // DD/MM/YYYY
  }
  // If day > 12, must be DD/MM/YYYY (unambiguous)
  else if (part1 > 12) {
    parsedDate = new Date(part3, part2 - 1, part1);
  }
  // If month > 12, must be MM/DD/YYYY (unambiguous)
  else if (part2 > 12) {
    parsedDate = new Date(part3, part1 - 1, part2);
  }
  // Ambiguous - use provider context or default to AU format
  else {
    parsedDate = new Date(part3, part2 - 1, part1);  // Default AU: DD/MM/YYYY
  }

  // Validation guards to catch parsing errors
  const now = new Date();

  // Guard 1: DOB cannot be in the future
  if (parsedDate > now) {
    console.warn(`Invalid DOB: ${dateStr} parses to future date ${parsedDate.toISOString()}`);
    return null;
  }

  // Guard 2: DOB should be before encounter start date (if provided)
  if (encounterStartDate) {
    const encDate = new Date(encounterStartDate);
    if (parsedDate > encDate) {
      console.warn(`Invalid DOB: ${dateStr} is after encounter start date ${encounterStartDate}`);
      return null;
    }
  }

  // Guard 3: Reasonable age range (0-150 years old)
  const age = (now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (age < 0 || age > 150) {
    console.warn(`Invalid DOB: ${dateStr} results in age ${age} years`);
    return null;
  }

  return parsedDate;
}
```

## 6. Data Quality Tier Integration

### 6.1 Pass 0.5 Quality Tier Assignment

During Pass 0.5 processing, encounters receive a preliminary data quality tier based on extracted identity markers. This tier is calculated during reconciliation and stored in both pending and final encounter tables.

**For comprehensive data quality framework documentation, see:** `11-DATA-QUALITY-SYSTEM.md`

That document covers:
- Four-tier framework (LOW/MEDIUM/HIGH/VERIFIED)
- Deterministic criteria (A/B/C) and tier assignment logic
- Dual audience design (patient vs provider views)
- Temporal factors and data freshness
- Upgrade paths and manual verification workflows
- System-wide UI/UX patterns

### 6.2 Pass 0.5 Specific Implementation

```typescript
// Quality tier calculator (called during reconciliation)
// Implementation: apps/render-worker/src/pass05/progressive/reconciler.ts

function calculateQualityTier(encounter: PendingEncounter): DataQualityTier {
  const hasPatientIdentity = !!(
    encounter.patient_full_name &&
    encounter.patient_date_of_birth
  );

  const hasProviderDetails = !!(
    (encounter.provider_name || encounter.facility_name) &&
    encounter.encounter_start_date
  );

  // Note: VERIFIED can only be set manually, never by AI
  // See 11-DATA-QUALITY-SYSTEM.md for complete tier definitions
  if (!hasPatientIdentity && !hasProviderDetails) return 'low';
  if (hasPatientIdentity && !hasProviderDetails) return 'medium';
  if (hasPatientIdentity && hasProviderDetails) return 'high';

  return 'high';
}
```

## 7. Reconciliation Integration

### 7.1 Identity-Aware Reconciliation

```typescript
async function reconcilePendingEncountersWithIdentity(
  sessionId: string,
  shellFileId: string
): Promise<void> {
  // Standard reconciliation by cascade_id
  const encounters = await reconcileByCascade(sessionId);

  // Post-reconciliation: Migrate identifiers
  for (const encounter of encounters) {
    await migrateIdentifiers(encounter.pending_ids, encounter.final_id);
  }

  // Flag identity conflicts within cascades (but don't split)
  await flagIdentityConflicts(encounters);
}

async function migrateIdentifiers(
  pendingIds: string[],
  finalEncounterId: string
): Promise<void> {
  // Copy identifiers from pending to final table
  // Note: Normalizes identifier_value during migration
  const query = `
    INSERT INTO healthcare_encounter_identifiers (
      encounter_id,
      identifier_type,
      identifier_value,
      issuing_organization,
      source_pending_id
    )
    SELECT
      $1 as encounter_id,
      identifier_type,
      -- Normalize: trim and collapse whitespace (preserve case for case-sensitive IDs)
      TRIM(REGEXP_REPLACE(identifier_value, '\s+', ' ', 'g')) as identifier_value,
      issuing_organization,
      pending_id as source_pending_id
    FROM pass05_pending_encounter_identifiers
    WHERE pending_id = ANY($2::text[])
    ON CONFLICT (encounter_id, identifier_type, identifier_value) DO NOTHING;  -- Prevent duplicates
  `;

  await supabase.rpc('execute_sql', {
    query,
    params: [finalEncounterId, pendingIds]
  });
}
```

### 7.2 Cascade Identity Conflicts

**Important**: We do NOT split cascades based on identity mismatches. Cascades are about document/encounter continuity, not patient identity.

```typescript
async function flagIdentityConflicts(encounters: FinalEncounter[]): Promise<void> {
  for (const encounter of encounters) {
    const identities = await getUniqueIdentities(encounter.source_pending_ids);

    if (identities.length > 1) {
      // Flag for review, but don't split
      await flagForManualReview(encounter.id, {
        reason: 'multiple_identities_in_cascade',
        identities: identities
      });
    }
  }
}
```

## 8. Pre-Screening Filter (Phase 2)

### 8.1 Architecture

```yaml
Parallel Processing:
  OCR Complete
    ├─→ Pass 0.5 API Call (starts immediately)
    └─→ Health Content Detector (parallel)
         └─→ If non-health detected:
              └─→ Cancel Pass 0.5 (if still running)
              └─→ Mark document as non-medical
```

### 8.2 Implementation

```typescript
async function processDocumentWithPrescreen(ocrText: string, shellFileId: string) {
  // Start both in parallel
  const pass05Promise = callPass05API(ocrText, shellFileId);
  const prescreenPromise = detectHealthContent(ocrText);

  // Check pre-screen result
  const isHealthContent = await prescreenPromise;

  if (!isHealthContent) {
    // Try to cancel Pass 0.5 (best-effort, may not save input tokens)
    try {
      pass05Promise.cancel?.();  // If API supports cancellation
    } catch (error) {
      // Cancellation failure is non-fatal
      console.warn('Failed to cancel Pass 0.5 call:', error);
      // Let Pass 0.5 complete but mark result as non-medical
    }

    await markDocumentAsNonMedical(shellFileId);
    return { status: 'filtered_non_medical' };
  }

  // Continue with Pass 0.5
  try {
    return await pass05Promise;
  } catch (error) {
    // If pre-screen passed but Pass 0.5 fails, don't assume non-medical
    console.error('Pass 0.5 failed after pre-screen:', error);
    throw error;  // Propagate for retry logic
  }
}

async function detectHealthContent(text: string): Promise<boolean> {
  // Use cheap, fast model (GPT-4o-mini or Claude Haiku)
  const response = await cheapAI.complete({
    prompt: `Does this text contain medical or health-related information?
             Reply with only "YES" or "NO".
             Text: ${text.slice(0, 1000)}`,  // Sample for speed
    model: 'gpt-4o-mini',
    max_tokens: 10
  });

  return response.trim().toUpperCase() === 'YES';
}
```

## 9. Implementation Phases

### Phase 1: Core Identity Extraction (Week 1)
- [ ] Update Pass 0.5 prompt to extract identity markers
- [ ] Add identity columns to pending/final encounter tables
- [ ] Create identifier tables (pending and final)
- [ ] Deploy without active classification

### Phase 2: Classification Service (Week 2)
- [ ] Build profile matching logic (exact match only)
- [ ] Implement quality tier calculator
- [ ] Add classification to post-processing pipeline
- [ ] Enable for new uploads only

### Phase 3: User Experience (Week 3)
- [ ] Build UI for low-confidence review
- [ ] Add orphan identity suggestions
- [ ] Enable profile creation from orphans
- [ ] Add quality tier indicators to UI

### Phase 4: Optimization (Month 2)
- [ ] Add fuzzy matching if needed
- [ ] Implement pre-screening filter
- [ ] Add bulk classification tools
- [ ] Enable cross-profile analytics

## 10. Testing Requirements

### 10.1 Test Scenarios

1. **Single Profile Upload**: Verify correct profile assignment
2. **Multi-Profile Document**: Test mixed patient records
3. **Ambiguous Dates**: Test AU/US format handling with validation guards
4. **Missing DOB**: Test name-only matching scenarios
5. **Orphan Detection**: Test unknown identity clustering
6. **Quality Tiers**: Verify tier calculation during reconciliation (see 11-DATA-QUALITY-SYSTEM.md for comprehensive test matrix)
7. **Identifier Migration**: Test pending → final transfer with normalization
8. **Cascade Conflicts**: Test identity mismatch flagging without cascade splitting

### 10.2 Edge Cases

**Identity Ambiguity:**
- Empty identity markers (no name/DOB)
- Nickname variations ("Bob" vs "Robert", "Liz" vs "Elizabeth")
- Hyphenated names (Smith-Jones vs Smith vs Jones)
- Multiple middle names or initials
- Twins/siblings (same last name + DOB, requires MRN or confirmation)

**Date Parsing:**
- Date format: 01/02/2024 (AU: 1 Feb, US: 2 Jan)
- Historical dates (pre-2000, especially pre-1950 century ambiguity)
- Multiple DOB formats in one document
- Future dates (parsing error)
- DOB after encounter start date (parsing error)

**Multi-Patient Scenarios:**
- Mixed-patient letters (referral mentioning multiple people)
- Family history sections (parent/sibling DOBs)
- Comparison reports (patient A vs patient B)

**Provider Context:**
- Provider name but no facility
- Facility name but no provider
- Multiple providers on one document
- International providers (non-AU format clues)

**Classification Edge Cases:**
- Orphan identity appearing once (don't suggest profile yet)
- Orphan identity appearing 3+ times (suggest profile creation)
- Multiple fuzzy matches (require user selection)
- Case sensitivity in identifiers (preserve for MRN/insurance IDs)

## 11. Security Considerations

### 11.1 Data Protection

- Identity fields already protected by existing RLS (patient_id based)
- No additional encryption needed (Supabase handles at-rest encryption)
- Audit all classification decisions

### 11.2 Privacy

```sql
-- Audit table for classification decisions
CREATE TABLE profile_classification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_encounter_id text,
  attempted_match jsonb,        -- Sanitized matching attempt
  result varchar(50),
  confidence numeric,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);
```

## 12. Rollback Plan

If classification causes issues:

1. **Disable classification**: Set feature flag to bypass
2. **Continue pipeline**: Encounters process without profile assignment
3. **Manual cleanup**: Bulk reassign using admin tools
4. **Preserve data**: Keep extracted identity markers for future use

## 13. User Intervention Workflow (Unmatched/Orphan Cases)

### 13.1 When User Intervention is Triggered

User intervention is required when classification results in:
- `match_status = 'unmatched'` - No profile match found
- `match_status = 'orphan'` - Repeated identity pattern suggests new person
- `match_status = 'review'` - Fuzzy match or ambiguous (requires confirmation)

### 13.2 User Prompting Flow

**Scenario A: Unmatched Identity (1-2 Occurrences)**

```typescript
// UI displays notification
{
  title: "Document uploaded - Profile assignment needed",
  message: "We found medical records for 'Sarah Smith' but couldn't match them to an existing profile.",
  extracted_identity: {
    name: "Sarah Smith",
    dob: "1985-03-15"
  },
  options: [
    "Assign to existing profile",  // Shows dropdown of account profiles
    "Create new profile"           // Opens profile creation form
  ]
}
```

**User selects "Assign to existing profile":**
```typescript
// User manually selects from dropdown
selected_profile = "Emma Smith (Daughter)"

// Backend updates encounters
UPDATE healthcare_encounters
SET
  patient_id = selected_profile_id,
  matched_profile_id = selected_profile_id,
  match_status = 'matched',
  match_confidence = 1.0,  // User-confirmed = 100%
  is_orphan_identity = false
WHERE matched_profile_id IS NULL
  AND patient_full_name = 'Sarah Smith';
```

**User selects "Create new profile":**
```typescript
// Profile creation form pre-populated with extracted data
new_profile_form = {
  full_name: "Sarah Smith",          // Pre-filled from extraction
  date_of_birth: "1985-03-15",      // Pre-filled from extraction
  relationship: "Daughter",          // User selects
  // ... other profile fields
}

// After profile creation
new_profile_id = createProfile(new_profile_form);

// Update all encounters with this identity
UPDATE healthcare_encounters
SET
  patient_id = new_profile_id,
  matched_profile_id = new_profile_id,
  match_status = 'matched',
  match_confidence = 1.0,
  is_orphan_identity = false
WHERE matched_profile_id IS NULL
  AND patient_full_name = 'Sarah Smith';
```

---

**Scenario B: Orphan Identity (3+ Occurrences)**

```typescript
// UI displays stronger suggestion
{
  title: "New family member detected",
  message: "We've found 5 medical documents for 'Sarah Smith (DOB: 1985-03-15)' who isn't in your profile list.",
  suggestion: "This appears to be a family member or dependent. Would you like to create a profile for them?",
  extracted_identity: {
    name: "Sarah Smith",
    dob: "1985-03-15",
    encounter_count: 5,  // Shows pattern strength
    date_range: "2022-01-15 to 2024-11-18"
  },
  recommended_action: "Create new profile",  // Suggested default
  options: [
    "Create new profile for Sarah",  // Highlighted/recommended
    "Assign to existing profile",    // Alternative option
    "Review documents first"          // Shows document list
  ]
}
```

**Why orphan detection matters:**
- After 3+ uploads with same identity, probability of new person is high
- Proactive suggestion reduces user friction
- Batch processing: update all encounters at once when profile created

---

**Scenario C: Fuzzy Match Requiring Review**

```typescript
// UI requests confirmation
{
  title: "Confirm profile match",
  message: "We found a possible match but want your confirmation:",
  extracted_identity: {
    name: "Jon Smith",     // Note slight spelling difference
    dob: "1985-03-15"
  },
  suggested_match: {
    profile_name: "John Smith",
    profile_dob: "1985-03-15",
    confidence: 0.85,
    reason: "Similar name (possible typo), exact DOB match"
  },
  options: [
    "Yes, this is John Smith",         // Confirms match
    "No, this is a different person",  // Rejects, creates new
    "Show me the documents"            // Review before deciding
  ]
}
```

### 13.3 Batch Re-Assignment

When user creates a new profile or manually assigns, **all unmatched encounters with the same identity should update:**

```typescript
async function reassignEncountersAfterProfileCreation(
  identitySignature: { name: string; dob: string },
  newProfileId: string
) {
  // Find all unmatched encounters with this identity
  const { data: encounters } = await supabase
    .from('healthcare_encounters')
    .select('id')
    .is('matched_profile_id', null)
    .eq('patient_full_name', identitySignature.name)
    .eq('patient_date_of_birth', identitySignature.dob);

  // Batch update to new profile
  await supabase
    .from('healthcare_encounters')
    .update({
      patient_id: newProfileId,
      matched_profile_id: newProfileId,
      match_status: 'matched',
      match_confidence: 1.0,  // User confirmed
      is_orphan_identity: false
    })
    .in('id', encounters.map(e => e.id));

  // Log the batch reassignment
  await logAuditEvent({
    event_type: 'BULK_PROFILE_REASSIGNMENT',
    profile_id: newProfileId,
    encounter_count: encounters.length,
    reason: 'new_profile_created'
  });
}
```

### 13.4 Temporary Orphan Profile Strategy

**Before user intervention, where does `patient_id` point?**

**Option 1: Account Owner's Profile (Simpler)**
```sql
-- When no match found, default to account owner
patient_id = account_owner_profile_id
matched_profile_id = NULL
match_status = 'unmatched'
```

**Option 2: Dedicated Orphan Profile (Cleaner)**
```sql
-- Create special "Unassigned" profile per account
patient_id = account_orphan_profile_id  -- Special profile: "Unassigned Records"
matched_profile_id = NULL
match_status = 'unmatched'
```

**Recommendation:** Option 2 (Dedicated Orphan Profile)
- Cleaner separation of concerns
- Easy to query "all unassigned records"
- Doesn't pollute account owner's data

### 13.5 UI States Summary

| Classification State | UI Action | Backend State |
|---------------------|-----------|---------------|
| `matched` (auto) | None - silent assignment | `patient_id = profile_id`, `match_confidence = 0.95` |
| `unmatched` (1-2 docs) | Prompt: "Assign or Create?" | `patient_id = orphan_id`, `matched_profile_id = NULL` |
| `orphan` (3+ docs) | Strong suggestion: "Create profile for Sarah?" | `patient_id = orphan_id`, `is_orphan_identity = true` |
| `review` (fuzzy) | Confirm: "Is this John Smith?" | `patient_id = orphan_id`, suggested match shown |

## 14. Success Metrics

### Profile Classification Metrics
- **Match Rate**: >90% of encounters correctly assigned to profiles
- **Orphan Detection**: Identify family members within 3 uploads
- **User Confirmations**: <5% require manual intervention for ambiguous matches
- **False Positives**: <1% wrong profile assignment

### Data Quality Metrics
See `11-DATA-QUALITY-SYSTEM.md` Section 12 for comprehensive quality tier metrics and success criteria.

## 14. Future Enhancements

### Not in Scope for Initial Implementation

1. **Complex Matching**: Phonetic algorithms, ML-based matching
2. **Auto-Profile Creation**: Require user confirmation initially
3. **Cross-Account Matching**: Stay within account boundaries
4. **Retroactive Reclassification**: New profiles apply to future uploads only
5. **Field-Level Encryption**: Rely on Supabase's at-rest encryption

## Appendix A: Decision Log

| Decision | Rationale |
|----------|-----------|
| Extract raw text only | Keep Pass 0.5 simple, normalize downstream |
| Non-blocking classification | Never halt document processing |
| Simple matching first | Exact match covers 90% of cases |
| No cascade splitting | Cascades about continuity, not identity |
| Deterministic quality tiers | Objective criteria, no AI subjectivity |
| Manual verification only | "Verified" tier requires human attestation |

## Appendix B: Sample Classification Flow

```yaml
Input:
  Document with "Jane Smith, DOB: 15/03/1985"
  Account has profiles: ["Jane Smith (1985)", "Tom Smith (2015)"]

Process:
  1. Pass 0.5 extracts:
     - patient_full_name: "Jane Smith"
     - patient_date_of_birth: "15/03/1985"
     - provider_name: "Dr. Sarah Johnson"
     - encounter_start_date: "2024-11-15"

  2. Profile Classification:
     - Exact match with Profile #1 (Jane Smith 1985)
     - Confidence: 0.95
     - Status: 'matched'

  3. Quality Tier:
     - Calculated as HIGH (complete identity + provider details)
     - See 11-DATA-QUALITY-SYSTEM.md for tier calculation logic

  4. Result:
     - Encounter assigned to Profile #1
     - No user intervention needed
```

---

**END OF SPECIFICATION**

This design provides a robust foundation for multi-profile support while maintaining Strategy A's simplicity and focus on encounter detection.