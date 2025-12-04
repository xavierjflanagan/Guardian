# Data Quality Grading System

**Date:** November 17, 2024
**Status:** System-Wide Design Specification
**Scope:** Entire Exora Platform

## 1. Executive Summary

The Data Quality Grading System provides a deterministic, transparent framework for assessing and communicating the reliability of health data across the Exora platform. This system serves both patients (to understand their data) and healthcare providers (to make informed clinical decisions).

### Core Principles

1. **Deterministic Criteria**: Objective, rule-based tier assignment (no subjective AI judgments)
2. **Dual Audience**: Different views for patients vs healthcare providers
3. **Temporal Awareness**: Data quality degrades over time for certain data types
4. **Upgrade Paths**: Clear mechanisms for improving data quality
5. **Transparency**: Every quality assessment is auditable and explainable

## 2. The Four-Tier Framework

### 2.1 Quality Tiers

| Tier | Color | Icon | Patient View | Provider View | Meaning |
|------|-------|------|--------------|---------------|---------|
| **VERIFIED** | Green | ✓ | Verified | Verified | Professional attestation or trusted source |
| **HIGH** | Blue | ◆ | High Quality | High Quality | Complete patient + provider details |
| **MEDIUM** | Yellow | ○ | Good | Medium Quality | Patient details only, missing provider context |
| **LOW** | Gray | △ | Basic | Low Quality | Incomplete or unverified information |

**Note:** Patients CAN see the VERIFIED tier to encourage network-building where patients request verification from their healthcare providers. When hovering over or clicking the VERIFIED label, full attribution is shown: "Verified by Registered Healthcare Provider - Dr. Sarah Johnson, Nov 17 2024" or "Verified by Trusted Healthcare System - MyHealth Record API". 

### 2.2 Criteria Definitions

**Criteria A: Patient Identity Confirmed**
- Full name present (first + last)  //should we make it so that only 1 out of first and last name is required?
- Date of birth present
- Both fields extracted from document (not user-entered)

**Criteria B: Provider/Facility Details Confirmed**
- Provider name OR facility name present
- Encounter start date present (visit date for real encounters, document - metadata - date for pseudo-encounters)

**Note:** Advanced validation (letterhead detection, signature verification) requires Vision AI and is a Phase 2+ enhancement. Pass 0.5 uses field presence only.

**Criteria C: Healthcare Professional Verification**
- Manual attestation by registered healthcare provider in Exora
- Direct API transfer from trusted healthcare system
- Manual verification by registered provider overrides all other criteria
- Consider the scenario where a doctor uploads a PDF directly to the app, for example by sending it to the user’s Exora email, which is then auto-ingested without any user intervention. This approach is extremely clean and may feel similar to an API transfer; however, it still relies on probabilistic AI-based processing, which could, however rarely, introduce errors. Should data ingested in this manner be classified as ‘verified’? This raises a fundamental question: in the context of Exora, does ‘verified’ mean a qualified human has explicitly reviewed and confirmed the AI’s output, or does it simply mean the data was ingested in a manner that excludes the possibility of user manipulation or contamination?
- My perspective is that the "verified" tier should permit AI interpretation, meaning it does not require explicit human-in-the-loop validation of the AI’s output. Instead, "verified" should primarily signify that the data’s origin and ingestion path guarantee it was not altered or influenced by anyone other than a qualified, registered healthcare provider.

### 2.3 Tier Assignment Logic

```
IF Criteria C met → VERIFIED
ELSE IF Criteria A AND Criteria B → HIGH
ELSE IF Criteria A (but NOT Criteria B) → MEDIUM
ELSE → LOW
```

## 3. Data Quality by Data Type

### 3.1 Encounter-Level Quality

Applies to entire encounters:

```sql
-- Stored in: healthcare_encounters.data_quality_tier
-- Calculated during reconciliation

Example HIGH quality encounter:
- Patient: "John Smith, DOB: 15/03/1985"
- Provider: "Dr. Sarah Johnson, Royal Melbourne Hospital"
- Encounter start date: "2024-11-15"
```

### 3.2 Entity-Level Quality

Applies to specific clinical entities (medications, conditions, procedures):

```sql
-- Future: clinical_entities.data_quality_tier
-- Inherits from encounter or has own assessment

Medication example:
- From HIGH quality discharge summary → HIGH
- User manually confirms "still taking" → Upgrades to MEDIUM
- Doctor verifies in app → Upgrades to VERIFIED
```

### 3.3 Manual Entry Quality

User-entered data starts at LOW, can be upgraded:

```
User enters: "Currently taking aspirin 100mg daily"
  → LOW (user-generated, no documentation)

User confirms from medication box with details:
  → MEDIUM (user confirmed with product context)

Doctor reviews and verifies:
  → VERIFIED (professional attestation)
```

## 4. Quality Upgrade Paths

### 4.1 Automatic Upgrades

Upgrades that happen without user intervention:

| Trigger | From | To | Condition |
|---------|------|-----|-----------|
| Upload better document | LOW/MEDIUM | HIGH | New upload has complete criteria |
| Provider API sync | ANY | VERIFIED | Trusted source direct transfer with no user intervention touch points|
| User confirmation expires | VERIFIED → MEDIUM | MEDIUM | >2 years since last confirmation |

### 4.2 Manual Upgrades

User or provider actions:

```typescript
interface QualityUpgradeAction {
  from_tier: DataQualityTier;
  to_tier: DataQualityTier;
  trigger_action: string;
  requires_role: 'patient' | 'provider';
  max_upgrade_to: DataQualityTier;
}

const upgradeRules: QualityUpgradeAction[] = [
  {
    from_tier: 'LOW',
    to_tier: 'MEDIUM',
    trigger_action: 'patient_confirmation',
    requires_role: 'patient',
    max_upgrade_to: 'MEDIUM'  // Patients can't create HIGH
  },
  {
    from_tier: 'LOW',
    to_tier: 'VERIFIED',
    trigger_action: 'provider_verification',
    requires_role: 'provider',
    max_upgrade_to: 'VERIFIED'
  },
  {
    from_tier: 'MEDIUM',
    to_tier: 'VERIFIED',
    trigger_action: 'provider_verification',
    requires_role: 'provider',
    max_upgrade_to: 'VERIFIED'
  }
];
```

### 4.3 Downgrade Triggers

Quality can degrade over time:

- **Medications**: After 90 days without confirmation → Downgrade one tier
- **Allergies**: Never downgrade (safety-critical)
- **Conditions**: After 2 years without update → Flag as "needs review"
- **Contact Info**: After 1 year → Flag as potentially outdated

## 5. Temporal Factors (Recency System)

Separate from quality tiers, every data point has a "last updated" timestamp:

### 5.1 Recency Display

```typescript
interface RecencyInfo {
  last_updated: Date;
  freshness: 'current' | 'recent' | 'stale' | 'very_old';
  display_text: string;
}

function calculateRecency(lastUpdated: Date, dataType: string): RecencyInfo {
  const daysAgo = daysSince(lastUpdated);

  // Different thresholds for different data types
  const thresholds = {
    medication: { current: 30, recent: 90, stale: 180 },
    condition: { current: 180, recent: 365, stale: 730 },
    allergy: { current: 365, recent: 730, stale: 1095 }
  };

  const t = thresholds[dataType];

  if (daysAgo < t.current) return { freshness: 'current', display_text: 'Updated recently' };
  if (daysAgo < t.recent) return { freshness: 'recent', display_text: `${daysAgo} days ago` };
  if (daysAgo < t.stale) return { freshness: 'stale', display_text: `${Math.floor(daysAgo/30)} months ago` };
  return { freshness: 'very_old', display_text: `${Math.floor(daysAgo/365)} years ago` };
}
```

### 5.2 Combined Quality + Recency Display

```
┌─────────────────────────────────────┐
│ Aspirin 100mg daily                 │
│ Quality: ■ HIGH                     │
│ Updated: 5 days ago                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Penicillin Allergy                  │
│ Quality: ✓ VERIFIED                 │
│ Updated: 2 years ago                │
│ ⚠️ Please confirm still accurate    │
└─────────────────────────────────────┘
```

## 6. UI/UX Representation

### 6.1 Patient Dashboard

**Design Principles:**
- Primary focus on provider trust, but designed for both audiences
- Non-alarming colors (avoid red)
- Green for VERIFIED (provider verified or trusted API), Blue for HIGH (complete data)
- Progressive disclosure (details on click)
  - Compact view: Show icon and tier name
  - Hover: Show tooltip with attribution
  - Click/Expand: Full provenance and verification details
- Network-building: VERIFIED tier encourages patients to request provider validation
- Supportive prompts: Gentle guidance for improving data quality without shame

```
Example Medication List:

✓ Aspirin 100mg daily
  Verified • Verified by Dr. Sarah Johnson, Nov 1 2024
  [View verification details]

  On click/expand:
  "Verified by Registered Healthcare Provider
   Dr. Sarah Johnson (AHPRA: MED0012345)
   Verified during remote record review on November 1, 2024"

◆ Metformin 500mg BD
  High Quality • Updated 2 months ago
  [Ask your doctor to verify this medication]

○ Paracetamol as needed
  Good • Added by you 3 months ago
  [Upload prescription or medication box photo to improve quality]

△ Vitamin D
  Basic • Added by you 6 months ago
  [Add dosage and prescriber information]
  [Or request your doctor verify this on Exora]
```

### 6.2 Healthcare Provider View

**Design Principles:**
- Clinical decision support focus
- Clear reliability indicators
- Easy filtering by quality

```
Provider Dashboard:

[Filter: ✓ Verified  ◆ High  ○ Medium  △ Low]

Current Medications (5)
  ✓ VERIFIED
    Aspirin 100mg daily
    Verified by Dr. Sarah Johnson • Nov 1, 2024
    [View verification details]

  ✓ VERIFIED
    Atorvastatin 20mg nocte
    Verified via MyHealth Record API • Oct 15, 2024
    [View import details]

  ◆ HIGH
    Metformin 500mg BD
    Source: Hospital discharge 01/11/2024
    [Click to verify this medication]

  ○ MEDIUM
    Paracetamol as needed
    Source: Patient entered
    [Click to verify]

  △ LOW
    "Vitamin D" (incomplete)
    Source: Patient photo
    [Needs review]
```

### 6.3 Quality Improvement Prompts

```typescript
interface QualityPrompt {
  data_item_id: string;
  current_tier: DataQualityTier;
  suggested_action: string;
  estimated_time: string;
}

// Example prompts shown to users:
const prompts = [
  {
    item: "Aspirin",
    current_tier: "MEDIUM",
    prompt: "Upload a photo of the medication box to improve data quality",
    time: "30 seconds"
  },
  {
    item: "Penicillin Allergy",
    current_tier: "MEDIUM",
    prompt: "Ask your GP to verify this allergy during your next visit",
    time: "At next appointment"
  }
];
```

## 7. Pass 0.5 Integration

### 7.1 Quality Calculation in Pass 0.5

```typescript
// During reconciliation (after all chunks processed)
async function calculateEncounterQuality(encounter: PendingEncounter): Promise<DataQualityTier> {
  const hasPatientIdentity = !!(
    encounter.patient_full_name &&
    encounter.patient_date_of_birth
  );

  const hasProviderDetails = !!(
    (encounter.provider_name || encounter.facility_name) &&
    encounter.encounter_start_date  // Visit date for real encounters, document date for pseudo
  );

  // Note: VERIFIED can only be set via manual verification by a provider (or if data origin is direct api), never by AI
  if (!hasPatientIdentity && !hasProviderDetails) return 'LOW';
  if (hasPatientIdentity && !hasProviderDetails) return 'MEDIUM';
  if (hasPatientIdentity && hasProviderDetails) return 'HIGH';

  return 'HIGH';
}
```

### 7.2 Pseudo-Encounters and Quality Tiers

**CRITICAL: These are INDEPENDENT dimensions.**

- `is_real_world_visit` (boolean) - Can this be a timeline anchor?
- `data_quality_tier` (LOW/MEDIUM/HIGH/VERIFIED) - How reliable is the information?

**Pseudo-encounters are NOT automatically LOW quality.** Quality is determined purely by A/B/C criteria regardless of visit status.

#### Real-World Examples

**Example 1: HIGH Quality Pseudo-Encounter**
```typescript
// Medication list from GP letter
{
  is_real_world_visit: false,  // It's a list, not a visit
  patient_full_name: "John Smith",
  patient_date_of_birth: "15/03/1985",
  provider_name: "Dr. Sarah Johnson",
  facility_name: "Melbourne Medical Centre",
  encounter_start_date: "15/03/2024",  // Document preparation date

  // Quality calculation:
  // Criteria A: ✅ (name + DOB)
  // Criteria B: ✅ (provider + date)
  data_quality_tier: 'HIGH'  // HIGH quality pseudo-encounter!
}
```

**Example 2: LOW Quality Pseudo-Encounter**
```typescript
// Blurry photo of medication box
{
  is_real_world_visit: false,  // Photo, not a visit
  patient_full_name: null,
  patient_date_of_birth: null,
  provider_name: null,
  facility_name: null,
  encounter_start_date: null,

  // Quality calculation:
  // Criteria A: ❌
  // Criteria B: ❌
  data_quality_tier: 'LOW'  // LOW quality pseudo-encounter
}
```

**Example 3: HIGH Quality Real Visit**
```typescript
// Hospital discharge summary
{
  is_real_world_visit: true,  // Specific admission
  patient_full_name: "John Smith",
  patient_date_of_birth: "15/03/1985",
  provider_name: "Dr. Emily Chen",
  facility_name: "Royal Melbourne Hospital",
  encounter_start_date: "10/03/2024",
  encounter_end_date: "15/03/2024",

  // Quality calculation:
  // Criteria A: ✅
  // Criteria B: ✅
  data_quality_tier: 'HIGH'  // HIGH quality real visit
}
```

#### Use Case Differentiation

```typescript
// Timeline display: Filter by is_real_world_visit
const timelineEvents = encounters.filter(e => e.is_real_world_visit);

// Clinical decision support: Filter by quality tier
const reliableData = encounters.filter(e =>
  ['HIGH', 'VERIFIED'].includes(e.data_quality_tier)
);

// Both can include pseudo-encounters:
// - Timeline excludes ALL pseudo (regardless of quality)
// - Clinical includes HIGH-quality pseudo (e.g., formal medication lists)
```

#### Quality Calculation (No Special Cases)

```typescript
async function calculateEncounterQuality(encounter: PendingEncounter): Promise<DataQualityTier> {
  // DO NOT check is_real_world_visit
  // Quality is independent of visit status

  const hasPatientIdentity = !!(
    encounter.patient_full_name &&
    encounter.patient_date_of_birth
  );

  const hasProviderDetails = !!(
    (encounter.provider_name || encounter.facility_name) &&
    encounter.encounter_start_date  // Visit date OR document date
  );

  // Standard A/B/C logic - no pseudo-encounter special case
  if (!hasPatientIdentity && !hasProviderDetails) return 'LOW';
  if (hasPatientIdentity && !hasProviderDetails) return 'MEDIUM';
  if (hasPatientIdentity && hasProviderDetails) return 'HIGH';

  return 'HIGH';
}
```

## 8. Database Schema

### 8.1 Quality Tracking Tables

```sql
-- Core quality field on encounters
ALTER TABLE healthcare_encounters ADD COLUMN
  data_quality_tier varchar(20) CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified')),
  quality_calculation_date timestamp DEFAULT CURRENT_TIMESTAMP,
  quality_criteria_met jsonb;  -- {"criteria_a": true, "criteria_b": true}

-- Quality change audit trail
CREATE TABLE data_quality_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(50),      -- 'encounter', 'medication', 'condition'
  entity_id uuid,

  from_tier varchar(20),
  to_tier varchar(20),
  change_reason varchar(100),   -- 'provider_verification', 'new_upload', 'time_decay'

  changed_by_user_id uuid,
  changed_by_role varchar(20),  -- 'patient', 'provider', 'system'

  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Manual verification records
CREATE TABLE quality_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(50),
  entity_id uuid,

  verified_by_provider_id uuid REFERENCES user_profiles(id),
  verification_date timestamp DEFAULT CURRENT_TIMESTAMP,
  verification_method varchar(50),  -- 'manual_review', 'api_sync', 'patient_visit'

  notes text,
  expires_at timestamp            -- Optional expiry for time-sensitive verifications
);
```

### 8.2 Recency Tracking - How It Actually Works

**ARCHITECTURAL CORRECTION:**

Encounters are **immutable point-in-time snapshots**. They should never be updated after creation.

**Recency is DERIVED from encounter dates, not stored as separate columns:**

#### The Recency Model

1. **Encounters have dates** (already in schema):
   - `encounter_start_date` - When the encounter occurred
   - `encounter_end_date` - When the encounter ended (optional)

2. **Clinical entities link to encounters** (Pass 1/2):
   - `medications.encounter_id` → `healthcare_encounters.id`
   - `allergies.encounter_id` → `healthcare_encounters.id`
   - `conditions.encounter_id` → `healthcare_encounters.id`

3. **Recency = Most recent encounter date** for that entity:
   ```sql
   -- No separate last_updated_at column needed!
   -- Recency is calculated from encounter dates
   SELECT
     m.id,
     m.drug_name,
     MAX(e.encounter_start_date) as last_mentioned_date,
     COUNT(e.id) as mention_count
   FROM medications m
   JOIN healthcare_encounters e ON m.encounter_id = e.id
   GROUP BY m.id, m.drug_name
   ORDER BY last_mentioned_date DESC;
   ```

#### Example: Medication Recency

**Scenario:** Patient has Metformin mentioned in 3 documents

| Document Upload Date | Encounter Date | Medication |
|---------------------|----------------|------------|
| 2024-01-15 | 2024-01-10 | Metformin 500mg |
| 2024-06-20 | 2024-06-15 | Metformin 500mg |
| 2024-11-18 | 2024-11-15 | Metformin 500mg |

**Recency Query Result:**
- Drug: Metformin 500mg
- Last Mentioned: 2024-11-15 (from most recent encounter)
- Mention Count: 3

**No `last_updated_at` column needed!** The recency data comes from `encounter_start_date`.

#### Optional: Materialized View for Performance

```sql
-- If querying recency frequently, create materialized view
CREATE MATERIALIZED VIEW medication_recency AS
SELECT
  m.id as medication_id,
  m.drug_name,
  MAX(e.encounter_start_date) as last_mentioned_date,
  COUNT(DISTINCT e.id) as encounter_count,
  MAX(e.data_quality_tier) as highest_quality_tier
FROM medications m
JOIN healthcare_encounters e ON m.encounter_id = e.id
GROUP BY m.id, m.drug_name;

-- Refresh periodically or on-demand
REFRESH MATERIALIZED VIEW medication_recency;
```

#### User Confirmation Tracking (Optional)

If you want to track when a user/provider **confirmed** an entity is still current (separate from document mentions):

```sql
-- Optional confirmation tracking (Pass 1/2)
ALTER TABLE medications ADD COLUMN
  last_confirmed_at timestamptz,
  last_confirmed_by uuid REFERENCES auth.users(id);

-- Updated when user clicks "Yes, still taking this"
-- NOT updated automatically from encounters
```

**Key Principles:**
- **Encounters = Immutable** (dates never change)
- **Recency = Derived** (from encounter dates via JOIN)
- **Confirmation = Optional** (separate user action, not automatic)
- **No redundant storage** (don't duplicate encounter dates on entities)

## 9. Quality-Based Features

### 9.1 Smart Filtering

```typescript
// Allow users to filter by quality for decision-making
interface QualityFilter {
  min_tier?: DataQualityTier;
  include_tiers?: DataQualityTier[];
  max_age_days?: number;
}

// Examples:
const filters = {
  // "Show only verified data"
  providerview: { min_tier: 'VERIFIED' },

  // "Show reliable recent data"
  clinical: { include_tiers: ['HIGH', 'VERIFIED'], max_age_days: 180 },

  // "Show everything (patient view)"
  patient: {}  // No restrictions
};
```

### 9.2 Quality-Weighted Analytics

```sql
-- Calculate quality score for patient profile
SELECT
  patient_id,
  COUNT(*) as total_encounters,
  AVG(CASE data_quality_tier
    WHEN 'VERIFIED' THEN 1.0
    WHEN 'HIGH' THEN 0.8
    WHEN 'MEDIUM' THEN 0.5
    WHEN 'LOW' THEN 0.2
  END) as quality_score
FROM healthcare_encounters
GROUP BY patient_id;
```

### 9.3 Quality Improvement Campaigns

```typescript
// Identify low-quality data for improvement campaigns
async function getQualityImprovementOpportunities(patientId: string) {
  const lowQualityItems = await db.query(`
    SELECT
      id,
      encounter_type,
      data_quality_tier,
      CASE
        WHEN patient_full_name IS NULL THEN 'missing_patient_name'
        WHEN patient_date_of_birth IS NULL THEN 'missing_dob'
        WHEN provider_name IS NULL AND facility_name IS NULL THEN 'missing_provider'
        ELSE 'missing_date'
      END as improvement_opportunity
    FROM healthcare_encounters
    WHERE patient_id = $1
    AND data_quality_tier IN ('LOW', 'MEDIUM')
    ORDER BY created_at DESC
    LIMIT 10
  `, [patientId]);

  return lowQualityItems.map(item => ({
    item_id: item.id,
    suggested_action: getSuggestedAction(item.improvement_opportunity),
    estimated_effort: 'low'
  }));
}
```

## 10. Provider Trust Building

### 10.1 Quality Metrics Dashboard

Healthcare providers need confidence in Exora data:

```
Provider Dashboard Summary:

Patient: John Smith
Overall Data Quality: 78% (Good)

Breakdown:
  ✓ Verified:   45 items (35%)
  ◆ High:       52 items (40%)
  ○ Medium:     20 items (15%)
  △ Low:        13 items (10%)

Recent Activity:
  • 5 items verified by you this month
  • 12 new uploads (3 HIGH, 7 MEDIUM, 2 LOW)
  • 3 items pending your review

[Review Low Quality Items] [Verify Recent Uploads]
```

### 10.2 Quality Certification

```sql
-- Provider can "certify" a patient's data as reviewed
CREATE TABLE provider_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES user_profiles(id),
  provider_id uuid REFERENCES user_profiles(id),

  certification_date timestamp DEFAULT CURRENT_TIMESTAMP,
  scope varchar(50),                    -- 'full_profile', 'medications_only', 'allergies_only'
  items_verified integer,
  items_corrected integer,

  notes text,
  expires_at timestamp                  -- Certification validity period
);
```

## 11. Future Enhancements

### 11.1 Machine Learning Quality Prediction

```python
# Future: ML model to predict quality tier from document features
def predict_quality_tier(document_features):
    features = {
        'has_letterhead': bool,
        'num_stamps': int,
        'provider_mentions': int,
        'date_count': int,
        'patient_id_present': bool
    }

    # Train model on historical verified classifications
    # Output: probability distribution over tiers
    return {'VERIFIED': 0.05, 'HIGH': 0.70, 'MEDIUM': 0.20, 'LOW': 0.05}
```

### 11.2 Cross-Document Quality Validation

```typescript
// Verify consistency across documents
async function validateCrossdocumentConsistency(patientId: string) {
  // Example: DOB should be consistent across all documents
  const dobs = await db.query(`
    SELECT DISTINCT patient_date_of_birth
    FROM healthcare_encounters
    WHERE patient_id = $1
    AND patient_date_of_birth IS NOT NULL
  `, [patientId]);

  if (dobs.length > 1) {
    flagForReview({
      issue: 'inconsistent_dob',
      patient_id: patientId,
      values: dobs
    });
  }
}
```

### 11.3 Blockchain Verification (Future)

```typescript
// Future: Immutable quality verification record
interface BlockchainVerification {
  entity_id: string;
  verified_by: string;          // Provider digital signature
  verification_timestamp: number;
  verification_hash: string;     // Hash of entity data at verification time
  blockchain_tx_id: string;      // Immutable record
}
```

## 12. Implementation Roadmap

### Phase 1: Core Quality Framework (Pass 0.5 Integration)
- [ ] Implement A/B/C criteria calculation
- [ ] Add quality tier field to encounters
- [ ] Store quality reasoning in jsonb field
- [ ] Basic UI indicators (colors/icons)

### Phase 2: Manual Verification Flows
- [ ] Provider verification workflow
- [ ] Quality change audit trail
- [ ] Patient quality improvement suggestions

### Phase 3: Temporal/Recency System
- [ ] Last updated tracking
- [ ] Freshness calculations
- [ ] Time-based downgrades

### Phase 4: Advanced Features
- [ ] Quality-weighted analytics
- [ ] Provider certifications
- [ ] Cross-document validation

## 13. Success Metrics

- **Data Reliability**: >70% of data HIGH or VERIFIED within 6 months
- **Provider Trust**: 90% of providers rate data quality as "reliable" or "very reliable"
- **User Engagement**: 40% of users take at least one quality improvement action
- **Verification Rate**: 20% of patient data verified by healthcare provider within 1 year

---

**This system ensures Exora becomes a trusted source of health data for both patients and healthcare providers, with clear quality indicators and transparent upgrade paths.**

