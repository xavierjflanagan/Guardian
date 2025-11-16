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
- encounter_date: Date of the encounter/visit

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
    "encounter_date": "2024-11-15"
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
  -- Replicate identity fields from pending
  patient_full_name text,
  patient_date_of_birth date,         -- Normalized to ISO format
  patient_address text,
  patient_phone varchar(50),

  provider_name text,
  facility_name text,

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

### 5.2 Date Format Handling

```typescript
function parseAustralianDate(dateStr: string, providerLocation?: string): Date | null {
  // Handle AU/US format ambiguity
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length !== 3) return null;

  const [part1, part2, part3] = parts.map(p => parseInt(p));

  // If provider is Australian, assume DD/MM/YYYY
  if (providerLocation?.includes('Australia') || providerLocation?.includes('VIC')) {
    return new Date(part3, part2 - 1, part1);  // DD/MM/YYYY
  }

  // If day > 12, must be DD/MM/YYYY (unambiguous)
  if (part1 > 12) {
    return new Date(part3, part2 - 1, part1);
  }

  // If month > 12, must be MM/DD/YYYY (unambiguous)
  if (part2 > 12) {
    return new Date(part3, part1 - 1, part2);
  }

  // Ambiguous - use provider context or default to AU format
  return new Date(part3, part2 - 1, part1);  // Default AU: DD/MM/YYYY
}
```

## 6. Data Quality Tier System

### 6.1 Deterministic Criteria

**Criteria A**: Patient identity confirmed
- Full name present AND
- Date of birth present

**Criteria B**: Provider/facility details confirmed
- (Provider name OR Facility name) present AND
- Encounter date present

**Criteria C**: Healthcare professional verification
- Manual attestation by registered provider
- Direct API transfer from trusted source

### 6.2 Tier Calculation

```typescript
enum DataQualityTier {
  LOW = 'low',           // Neither A nor B
  MEDIUM = 'medium',     // A confirmed, not B
  HIGH = 'high',         // Both A and B
  VERIFIED = 'verified'  // C confirmed (manual only)
}

function calculateQualityTier(encounter: PendingEncounter): DataQualityTier {
  const hasPatientIdentity = !!(
    encounter.patient_full_name &&
    encounter.patient_date_of_birth
  );

  const hasProviderDetails = !!(
    (encounter.provider_name || encounter.facility_name) &&
    encounter.encounter_date
  );

  // Note: VERIFIED can only be set manually, never by AI
  if (!hasPatientIdentity && !hasProviderDetails) return DataQualityTier.LOW;
  if (hasPatientIdentity && !hasProviderDetails) return DataQualityTier.MEDIUM;
  if (hasPatientIdentity && hasProviderDetails) return DataQualityTier.HIGH;

  return DataQualityTier.HIGH;  // Both confirmed
}
```

### 6.3 Examples

| Scenario | Criteria A | Criteria B | Quality Tier |
|----------|------------|------------|--------------|
| Orphaned medication photo | ❌ | ❌ | LOW |
| Medication box with patient name | ✅ | ❌ | MEDIUM |
| Complete discharge summary | ✅ | ✅ | HIGH |
| GP-verified medical history | Any | Any | VERIFIED |
| Provider letter, no patient name | ❌ | ✅ | LOW* |

*Requires user confirmation of identity

## 7. Reconciliation Integration

### 7.1 Identity-Aware Reconciliation

```typescript
async function reconcilePendingEncountersWithIdentity(
  sessionId: string,
  shellFileId: string
): Promise<void> {
  // Standard reconciliation by cascade_id
  const encounters = await reconcileByC ascade(sessionId);

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
      identifier_value,
      issuing_organization,
      pending_id as source_pending_id
    FROM pass05_pending_encounter_identifiers
    WHERE pending_id = ANY($2::text[])
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
    // Try to cancel Pass 0.5
    pass05Promise.cancel?.();  // If API supports cancellation

    await markDocumentAsNonMedical(shellFileId);
    return { status: 'filtered_non_medical' };
  }

  // Continue with Pass 0.5
  return await pass05Promise;
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

1. **Single Profile Upload**: Verify correct assignment
2. **Multi-Profile Document**: Test mixed patient records
3. **Ambiguous Dates**: Test AU/US format handling
4. **Missing DOB**: Test name-only matching
5. **Orphan Detection**: Test unknown identity clustering
6. **Quality Tiers**: Verify all tier combinations
7. **Identifier Migration**: Test pending → final transfer
8. **Cascade Conflicts**: Test identity mismatch flagging

### 10.2 Edge Cases

- Empty identity markers (no name/DOB)
- Nickname variations ("Bob" vs "Robert")
- Hyphenated names
- Date format: 01/02/2024 (ambiguous)
- Multiple DOBs in one encounter
- Provider name but no facility
- Historical dates (pre-2000)

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

## 13. Success Metrics

- **Match Rate**: >90% of encounters correctly classified
- **Orphan Detection**: Identify family members within 3 uploads
- **Quality Tiers**: 70% HIGH, 20% MEDIUM, 10% LOW
- **User Confirmations**: <5% require manual intervention
- **False Positives**: <1% wrong profile assignment

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

  2. Classification:
     - Exact match with Profile #1
     - Confidence: 0.95
     - Status: 'matched'

  3. Quality Tier:
     - Criteria A: ✅ (name + DOB)
     - Criteria B: ✅ (if provider present)
     - Tier: HIGH

  4. Result:
     - Encounter assigned to Profile #1
     - High quality tier
     - No user intervention needed
```

---

**END OF SPECIFICATION**

This design provides a robust foundation for multi-profile support while maintaining Strategy A's simplicity and focus on encounter detection.