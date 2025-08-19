# user_profiles Bridge Specification

**Database Table:** `user_profiles`  
**AI Component:** profile-classifier  
**Purpose:** Bridge document for Guardian's multi-profile classification system  
**Reference:** [003_user_profiles.sql](../../../../database-foundation/implementation/sql/003_user_profiles.sql)

---

## Table Overview

The `user_profiles` table enables Guardian's multi-profile architecture, allowing users to manage healthcare data for themselves, children, adult dependents, and pets. Profile classification is critical for preventing data contamination between profiles.

**Critical Requirement:** Every document must be correctly classified to the right profile to ensure data security and proper healthcare management.

---

## Schema Reference

```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core Classification (REQUIRED by AI)
    profile_type TEXT NOT NULL CHECK (profile_type IN ('self', 'child', 'adult_dependent', 'pet')),
    display_name TEXT NOT NULL,
    
    -- Profile-Specific Details (AI Extracted)
    relationship TEXT, -- 'spouse', 'parent', 'child', 'dog', 'cat'
    species TEXT, -- For pets: 'dog', 'cat', 'bird', etc.
    breed TEXT, -- For pets: 'Golden Retriever', 'Persian', etc.
    date_of_birth DATE,
    
    -- Legal & Authentication Status
    legal_status TEXT DEFAULT 'dependent' CHECK (legal_status IN ('owner', 'guardian', 'dependent')),
    auth_level TEXT DEFAULT 'soft' CHECK (auth_level IN ('none', 'soft', 'verified')),
    
    -- Profile State
    active BOOLEAN NOT NULL DEFAULT TRUE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## AI Classification Model

### Profile Detection Logic

```yaml
profile_classification_rules:
  self:
    indicators:
      - First-person language ("my results", "I received")
      - Adult healthcare providers (primary care, specialists)
      - Patient name matches account holder
      - Legal documents with signature
    confidence_threshold: 0.8
    
  child:
    indicators:
      - Pediatric healthcare providers
      - Age < 18 mentioned in document
      - Parent/guardian references
      - School health forms, immunization records
    confidence_threshold: 0.85
    age_validation: < 18 years
    
  adult_dependent:
    indicators:
      - Elderly care mentions (nursing home, geriatric care)
      - Disability support services
      - Power of attorney references
      - Adult child managing parent's care
    confidence_threshold: 0.85
    age_validation: >= 18 years
    
  pet:
    indicators:
      - Veterinary clinic letterhead
      - Animal species mentioned
      - Pet medication names
      - Vaccination records for animals
    confidence_threshold: 0.9
    species_detection: required
```

### AI Output Format

```typescript
interface ProfileClassification {
  // Core Classification (REQUIRED)
  profile_type: 'self' | 'child' | 'adult_dependent' | 'pet';
  display_name: string; // Extracted from document
  confidence_score: number; // 0.0 - 1.0
  
  // Profile Details (OPTIONAL)
  relationship?: string; // 'spouse', 'daughter', 'dog', etc.
  species?: string; // Required for pets
  breed?: string; // For pets
  date_of_birth?: string; // ISO date if extractable
  
  // Detection Context (METADATA)
  detection_signals: string[]; // What indicated this profile type
  document_context: string; // Relevant text from document
  provider_type?: string; // 'pediatric', 'veterinary', 'geriatric'
}
```

---

## Database Population Patterns

### Standard Profile Creation

```sql
INSERT INTO user_profiles (
    account_owner_id,
    profile_type,
    display_name,
    relationship,
    species,
    breed,
    date_of_birth,
    legal_status
) VALUES (
    $1::UUID,                    -- account_owner_id from context
    $2::TEXT,                    -- profile_type from AI
    $3::TEXT,                    -- display_name from AI
    $4::TEXT,                    -- relationship from AI (nullable)
    $5::TEXT,                    -- species from AI (nullable)
    $6::TEXT,                    -- breed from AI (nullable)
    $7::DATE,                    -- date_of_birth from AI (nullable)
    $8::TEXT                     -- legal_status (calculated)
) 
ON CONFLICT (account_owner_id, display_name) 
DO UPDATE SET
    profile_type = EXCLUDED.profile_type,
    relationship = COALESCE(EXCLUDED.relationship, user_profiles.relationship),
    species = COALESCE(EXCLUDED.species, user_profiles.species),
    breed = COALESCE(EXCLUDED.breed, user_profiles.breed),
    updated_at = NOW()
RETURNING id;
```

### Profile Update (Conflicting Data)

```sql
-- When AI detects conflicting profile classification
UPDATE user_profiles 
SET 
    profile_type = $2::TEXT,
    auth_level = 'soft',  -- Reset to soft auth for review
    updated_at = NOW()
WHERE 
    account_owner_id = $1::UUID 
    AND display_name = $3::TEXT
    AND profile_type != $2::TEXT;
```

---

## Classification Examples

### Example 1: Self Profile Detection

**Document Text:** "Patient: John Smith, DOB: 1985-03-15, Primary care visit"

```json
{
  "profile_type": "self",
  "display_name": "John Smith", 
  "confidence_score": 0.95,
  "date_of_birth": "1985-03-15",
  "relationship": null,
  "detection_signals": [
    "adult_age_range",
    "primary_care_provider",
    "patient_name_match"
  ],
  "document_context": "Primary care visit for routine checkup"
}
```

### Example 2: Child Profile Detection

**Document Text:** "Patient: Emma Smith, DOB: 2018-07-12, Pediatric immunizations"

```json
{
  "profile_type": "child",
  "display_name": "Emma Smith",
  "confidence_score": 0.92,
  "date_of_birth": "2018-07-12", 
  "relationship": "daughter",
  "detection_signals": [
    "pediatric_provider",
    "age_under_18",
    "immunization_schedule"
  ],
  "provider_type": "pediatric"
}
```

### Example 3: Pet Profile Detection

**Document Text:** "Patient: Bella, Golden Retriever, Rabies vaccination administered"

```json
{
  "profile_type": "pet",
  "display_name": "Bella",
  "confidence_score": 0.97,
  "species": "dog",
  "breed": "Golden Retriever",
  "relationship": "dog",
  "detection_signals": [
    "veterinary_service",
    "animal_species",
    "pet_vaccination"
  ],
  "provider_type": "veterinary"
}
```

### Example 4: Adult Dependent Detection

**Document Text:** "Patient: Margaret Smith, Age 82, Managed by daughter for dementia care"

```json
{
  "profile_type": "adult_dependent",
  "display_name": "Margaret Smith",
  "confidence_score": 0.89,
  "relationship": "mother",
  "detection_signals": [
    "elderly_age",
    "dementia_care_mention",
    "family_caregiver_reference"
  ],
  "document_context": "Daughter managing healthcare decisions"
}
```

---

## Validation & Safety Rules

### Pre-Insert Validation

```typescript
function validateProfileClassification(classification: ProfileClassification): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!classification.profile_type) {
    errors.push("profile_type is required");
  }
  
  if (!['self', 'child', 'adult_dependent', 'pet'].includes(classification.profile_type)) {
    errors.push("profile_type must be valid value");
  }
  
  if (!classification.display_name || classification.display_name.length < 2) {
    errors.push("display_name must be meaningful (min 2 characters)");
  }
  
  if (classification.confidence_score < 0.7) {
    errors.push("confidence_score too low for profile assignment");
  }
  
  // Profile-specific validation
  if (classification.profile_type === 'pet') {
    if (!classification.species) {
      errors.push("species is required for pet profiles");
    }
    if (classification.species && !['dog', 'cat', 'bird', 'rabbit', 'other'].includes(classification.species)) {
      errors.push("species must be recognized animal type");
    }
  }
  
  if (classification.profile_type === 'child') {
    const age = calculateAge(classification.date_of_birth);
    if (age && age >= 18) {
      errors.push("child profile cannot have age >= 18");
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
```

### Contamination Prevention

```sql
-- Check if document is being assigned to correct profile
-- Prevent medical data from being mixed between profiles
CREATE OR REPLACE FUNCTION validate_profile_assignment(
  p_document_id UUID,
  p_profile_id UUID,
  p_confidence_score NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
  existing_profile_type TEXT;
  new_profile_type TEXT;
BEGIN
  -- Get profile types for comparison
  SELECT profile_type INTO existing_profile_type
  FROM user_profiles up
  JOIN documents d ON d.profile_id = up.id
  WHERE d.id = p_document_id;
  
  SELECT profile_type INTO new_profile_type
  FROM user_profiles
  WHERE id = p_profile_id;
  
  -- Allow if no existing assignment or types match
  IF existing_profile_type IS NULL OR existing_profile_type = new_profile_type THEN
    RETURN TRUE;
  END IF;
  
  -- Flag for manual review if profile types don't match
  IF p_confidence_score < 0.9 THEN
    INSERT INTO profile_review_queue (document_id, existing_profile, new_profile)
    VALUES (p_document_id, existing_profile_type, new_profile_type);
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## Integration with Document Processing

### Document Assignment Flow

```yaml
document_processing_flow:
  step_1_upload:
    - Document uploaded to Supabase Storage
    - Initial document record created
    - Profile classification queued
    
  step_2_classification:
    - AI analyzes document content
    - Determines profile_type and display_name
    - Validates against existing profiles
    
  step_3_assignment:
    - Create profile if new (display_name not found)
    - Update profile if existing (merge details)
    - Assign document to correct profile
    
  step_4_validation:
    - Check for profile contamination
    - Flag low-confidence assignments for review
    - Ensure clinical data integrity
```

### Legal Status Assignment

```typescript
function calculateLegalStatus(profileType: string, accountOwnerId: string, profileId: string): string {
  if (profileType === 'self') {
    return 'owner'; // Account owner managing their own data
  }
  
  if (profileType === 'child' || profileType === 'adult_dependent' || profileType === 'pet') {
    return 'guardian'; // Account owner is guardian/caretaker
  }
  
  return 'dependent'; // Default for unclear cases
}
```

---

## Error Handling

### Common Classification Errors

```typescript
enum ProfileClassificationError {
  AMBIGUOUS_PROFILE = "Cannot determine if document belongs to existing profile",
  SPECIES_MISMATCH = "Pet species conflicts with existing profile data",
  AGE_VALIDATION_FAILED = "Age data conflicts with profile type",
  CONFIDENCE_TOO_LOW = "Classification confidence below threshold",
  CONTAMINATION_RISK = "Document may contaminate existing profile data"
}
```

### Recovery Strategies

```yaml
error_recovery:
  ambiguous_classification:
    strategy: "queue_for_manual_review"
    action: "create_temporary_unassigned_profile"
    user_confirmation: required
    
  species_mismatch:
    strategy: "create_new_pet_profile"
    action: "suggest_display_name_variation"
    example: "Bella (Cat)" vs "Bella (Dog)"
    
  confidence_too_low:
    strategy: "soft_assignment_with_flag"
    action: "allow_user_confirmation"
    review_required: true
    
  contamination_risk:
    strategy: "block_assignment"
    action: "require_manual_resolution"
    safety_critical: true
```

---

## Performance Optimization

### Profile Lookup Optimization

```sql
-- Optimized query for finding existing profiles
SELECT id, profile_type, display_name 
FROM user_profiles 
WHERE 
  account_owner_id = $1::UUID 
  AND active = TRUE 
  AND archived = FALSE
  AND (
    display_name ILIKE $2::TEXT || '%' OR
    display_name = $2::TEXT
  )
ORDER BY 
  CASE WHEN display_name = $2::TEXT THEN 1 ELSE 2 END,
  updated_at DESC
LIMIT 5;
```

### Batch Profile Operations

```sql
-- Batch update multiple profiles for same account
UPDATE user_profiles 
SET updated_at = NOW()
WHERE account_owner_id = $1::UUID
  AND id = ANY($2::UUID[]);
```

---

## Testing Requirements

### Unit Tests

```typescript
describe('ProfileClassification', () => {
  test('should detect self profile from adult primary care document', async () => {
    const document = "Patient: John Smith, Age 35, Annual physical exam";
    const result = await classifyProfile(document, accountId);
    
    expect(result.profile_type).toBe('self');
    expect(result.confidence_score).toBeGreaterThan(0.8);
    expect(result.display_name).toBe('John Smith');
  });
  
  test('should detect pet profile from veterinary document', async () => {
    const document = "Patient: Max (Golden Retriever), Rabies vaccination";
    const result = await classifyProfile(document, accountId);
    
    expect(result.profile_type).toBe('pet');
    expect(result.species).toBe('dog');
    expect(result.breed).toBe('Golden Retriever');
  });
  
  test('should prevent profile contamination', async () => {
    // Test that child's document doesn't get assigned to adult profile
    const childDocument = "Emma Smith, Age 5, Pediatric checkup";
    await expect(assignToAdultProfile(childDocument)).rejects.toThrow();
  });
});
```

---

## Quality Metrics

### Classification Accuracy

```yaml
success_metrics:
  classification_accuracy:
    target: "> 90% correct profile assignment"
    measurement: manual_validation_sample
    
  contamination_prevention:
    target: "0% cross-profile data contamination"
    measurement: automated_integrity_checks
    
  confidence_distribution:
    target: "> 80% classifications above 0.8 confidence"
    measurement: confidence_score_analytics
```

---

*This bridge specification ensures that AI profile classification correctly populates Guardian's multi-profile system, maintaining data integrity while enabling comprehensive family, dependent, and pet healthcare management.*