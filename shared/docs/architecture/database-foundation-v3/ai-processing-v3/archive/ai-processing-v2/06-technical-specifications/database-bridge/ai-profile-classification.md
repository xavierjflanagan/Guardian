# AI Profile Classification Implementation Guide

**Database Table:** `user_profiles`  
**AI Component:** profile-classifier  
**Schema Reference:** [003_multi_profile_management.sql](../../database-foundation/implementation/sql/003_multi_profile_management.sql)  
**Bridge Specification:** [user_profiles Bridge](../../ai-processing-v2/06-technical-specifications/database-bridge/user_profiles.md)

---

## Quick Start

```typescript
// AI Classification Result
interface ProfileClassificationResult {
  profile_type: 'self' | 'child' | 'adult_dependent' | 'pet';
  display_name: string;
  confidence_score: number;
  species?: string; // Required for pets
  relationship?: string;
}

// Database Population
const result = await insertOrUpdateProfile({
  account_owner_id: userId,
  profile_type: 'child',
  display_name: 'Emma Smith',
  relationship: 'daughter',
  confidence_score: 0.92
});
```

---

## Profile Classification Model

### Detection Rules by Profile Type

```yaml
self_profile:
  confidence_threshold: 0.8
  required_indicators:
    - First-person language ("my results", "I received")
    - Adult healthcare context (primary care, specialists)
    - Patient name matches account holder
  database_fields:
    - profile_type: "self"
    - legal_status: "owner"
    - auth_level: "verified" (if strong auth signals)

child_profile:
  confidence_threshold: 0.85
  required_indicators:
    - Pediatric healthcare providers
    - Age < 18 mentioned
    - School health forms
  validation_rules:
    - Age must be < 18 if extractable
    - Cannot conflict with adult profiles
  database_fields:
    - profile_type: "child"
    - relationship: AI-extracted (son/daughter)
    - legal_status: "dependent"

adult_dependent_profile:
  confidence_threshold: 0.85
  required_indicators:
    - Elderly care context
    - Disability support services
    - Power of attorney references
  validation_rules:
    - Age must be >= 18 if extractable
    - Cannot conflict with child profiles
  database_fields:
    - profile_type: "adult_dependent"
    - relationship: AI-extracted (parent/spouse)
    - legal_status: "dependent"

pet_profile:
  confidence_threshold: 0.95
  required_indicators:
    - Animal species identification
    - Veterinary clinic context
    - Pet procedures/medications
  validation_rules:
    - Species field required
    - Veterinary context required
  database_fields:
    - profile_type: "pet"
    - species: AI-extracted (dog/cat/bird/etc)
    - breed: AI-extracted if available
    - relationship: species (e.g., "dog")
```

---

## Database Integration Patterns

### Table Schema

```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- AI Populated Fields
    profile_type TEXT NOT NULL CHECK (profile_type IN ('self', 'child', 'adult_dependent', 'pet')),
    display_name TEXT NOT NULL,
    relationship TEXT,
    species TEXT, -- Required for pets
    breed TEXT,   -- Optional for pets
    date_of_birth DATE,
    
    -- Calculated Fields
    legal_status TEXT DEFAULT 'dependent',
    auth_level TEXT DEFAULT 'soft',
    
    -- State Management
    active BOOLEAN NOT NULL DEFAULT TRUE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Insert/Update Pattern

```sql
-- Upsert pattern for profile creation/updates
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
    $1::UUID,    -- account_owner_id
    $2::TEXT,    -- profile_type from AI
    $3::TEXT,    -- display_name from AI
    $4::TEXT,    -- relationship from AI (nullable)
    $5::TEXT,    -- species from AI (nullable)
    $6::TEXT,    -- breed from AI (nullable)
    $7::DATE,    -- date_of_birth from AI (nullable)
    $8::TEXT     -- legal_status (calculated)
)
ON CONFLICT (account_owner_id, display_name)
DO UPDATE SET
    profile_type = EXCLUDED.profile_type,
    relationship = COALESCE(EXCLUDED.relationship, user_profiles.relationship),
    species = COALESCE(EXCLUDED.species, user_profiles.species),
    breed = COALESCE(EXCLUDED.breed, user_profiles.breed),
    date_of_birth = COALESCE(EXCLUDED.date_of_birth, user_profiles.date_of_birth),
    updated_at = NOW()
RETURNING id, profile_type, display_name;
```

---

## Implementation Example

### TypeScript Implementation

```typescript
import { supabase } from '@/lib/supabase';

interface DocumentAnalysis {
  content: string;
  metadata: {
    provider_type?: string;
    patient_age?: number;
    provider_name?: string;
  };
}

class ProfileClassifier {
  async classifyProfile(
    document: DocumentAnalysis, 
    accountOwnerId: string
  ): Promise<ProfileClassificationResult> {
    
    // Step 1: Detect profile type
    const profileType = await this.detectProfileType(document);
    
    // Step 2: Extract profile details
    const profileDetails = await this.extractProfileDetails(document, profileType);
    
    // Step 3: Validate classification
    const validation = this.validateClassification(profileType, profileDetails);
    
    if (!validation.isValid) {
      throw new Error(`Profile classification failed: ${validation.errors.join(', ')}`);
    }
    
    return {
      profile_type: profileType,
      display_name: profileDetails.displayName,
      confidence_score: profileDetails.confidence,
      species: profileDetails.species,
      relationship: profileDetails.relationship,
      date_of_birth: profileDetails.dateOfBirth
    };
  }
  
  private async detectProfileType(document: DocumentAnalysis): Promise<ProfileType> {
    // Age-based detection
    if (document.metadata.patient_age) {
      if (document.metadata.patient_age < 18) {
        return 'child';
      } else if (document.metadata.patient_age >= 65 || 
                 document.content.includes('elderly') || 
                 document.content.includes('nursing home')) {
        return 'adult_dependent';
      }
    }
    
    // Provider context detection
    if (document.metadata.provider_type === 'pediatric' || 
        document.content.toLowerCase().includes('pediatric')) {
      return 'child';
    }
    
    if (document.metadata.provider_type === 'veterinary' || 
        document.content.toLowerCase().includes('veterinary')) {
      return 'pet';
    }
    
    // Species detection for pets
    const animalSpecies = ['dog', 'cat', 'bird', 'rabbit', 'hamster'];
    for (const species of animalSpecies) {
      if (document.content.toLowerCase().includes(species)) {
        return 'pet';
      }
    }
    
    // Default to self if adult context
    return 'self';
  }
  
  private async extractProfileDetails(
    document: DocumentAnalysis, 
    profileType: ProfileType
  ): Promise<ProfileDetails> {
    
    // Extract display name
    const nameMatch = document.content.match(/Patient:?\s*([A-Za-z\s]+)/);
    const displayName = nameMatch ? nameMatch[1].trim() : 'Unknown';
    
    let species = null;
    let breed = null;
    let relationship = null;
    
    if (profileType === 'pet') {
      // Extract species and breed for pets
      species = this.extractSpecies(document.content);
      breed = this.extractBreed(document.content);
      relationship = species; // Default relationship is the species
    } else {
      // Extract relationship for family members
      relationship = this.extractRelationship(document.content);
    }
    
    const dateOfBirth = this.extractDateOfBirth(document.content);
    const confidence = this.calculateConfidence(profileType, document);
    
    return {
      displayName,
      species,
      breed,
      relationship,
      dateOfBirth,
      confidence
    };
  }
  
  async insertOrUpdateProfile(
    classification: ProfileClassificationResult,
    accountOwnerId: string
  ): Promise<{ id: string; created: boolean }> {
    
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        account_owner_id: accountOwnerId,
        profile_type: classification.profile_type,
        display_name: classification.display_name,
        relationship: classification.relationship,
        species: classification.species,
        date_of_birth: classification.date_of_birth,
        legal_status: this.calculateLegalStatus(classification.profile_type)
      }, {
        onConflict: 'account_owner_id,display_name',
        ignoreDuplicates: false
      })
      .select('id');
    
    if (error) {
      throw new Error(`Profile insertion failed: ${error.message}`);
    }
    
    return {
      id: data[0].id,
      created: true
    };
  }
  
  private calculateLegalStatus(profileType: string): string {
    return profileType === 'self' ? 'owner' : 'dependent';
  }
}
```

---

## Safety and Validation

### Contamination Prevention

```typescript
// Prevent profile data contamination
async function validateProfileAssignment(
  documentId: string,
  profileId: string,
  confidence: number
): Promise<boolean> {
  
  // Check if document already assigned to different profile type
  const { data: existingAssignment } = await supabase
    .from('documents')
    .select('profile_id, user_profiles(profile_type)')
    .eq('id', documentId)
    .single();
  
  if (existingAssignment && existingAssignment.profile_id !== profileId) {
    const { data: newProfile } = await supabase
      .from('user_profiles')
      .select('profile_type')
      .eq('id', profileId)
      .single();
    
    // Flag for manual review if profile types don't match
    if (confidence < 0.9) {
      await supabase
        .from('profile_review_queue')
        .insert({
          document_id: documentId,
          existing_profile_type: existingAssignment.user_profiles.profile_type,
          new_profile_type: newProfile.profile_type,
          confidence_score: confidence
        });
      
      return false; // Block assignment pending review
    }
  }
  
  return true;
}
```

### Age Validation

```typescript
function validateAgeProfileConsistency(
  profileType: string,
  extractedAge?: number
): ValidationResult {
  
  if (!extractedAge) return { isValid: true, errors: [] };
  
  const errors: string[] = [];
  
  if (profileType === 'child' && extractedAge >= 18) {
    errors.push('Child profile cannot have age >= 18');
  }
  
  if (profileType === 'adult_dependent' && extractedAge < 18) {
    errors.push('Adult dependent profile cannot have age < 18');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
```

---

## Testing Patterns

### Unit Tests

```typescript
describe('ProfileClassifier', () => {
  const classifier = new ProfileClassifier();
  
  test('should classify pediatric document as child profile', async () => {
    const document = {
      content: "Patient: Emma Smith, Age 8, Pediatric checkup",
      metadata: { provider_type: 'pediatric', patient_age: 8 }
    };
    
    const result = await classifier.classifyProfile(document, 'user-123');
    
    expect(result.profile_type).toBe('child');
    expect(result.display_name).toBe('Emma Smith');
    expect(result.confidence_score).toBeGreaterThan(0.85);
  });
  
  test('should classify veterinary document as pet profile', async () => {
    const document = {
      content: "Patient: Bella (Golden Retriever), Rabies vaccination",
      metadata: { provider_type: 'veterinary' }
    };
    
    const result = await classifier.classifyProfile(document, 'user-123');
    
    expect(result.profile_type).toBe('pet');
    expect(result.species).toBe('dog');
    expect(result.confidence_score).toBeGreaterThan(0.95);
  });
  
  test('should prevent age validation conflicts', async () => {
    const document = {
      content: "Patient: John Smith, Age 25",
      metadata: { patient_age: 25 }
    };
    
    // Should not classify as child due to age > 18
    const result = await classifier.classifyProfile(document, 'user-123');
    expect(result.profile_type).not.toBe('child');
  });
});
```

---

## Performance Optimization

### Efficient Profile Lookups

```sql
-- Optimized profile lookup query
SELECT id, profile_type, display_name, species, relationship
FROM user_profiles
WHERE 
  account_owner_id = $1::UUID
  AND active = TRUE
  AND (
    display_name ILIKE $2::TEXT || '%' OR
    display_name = $2::TEXT
  )
ORDER BY 
  CASE WHEN display_name = $2::TEXT THEN 1 ELSE 2 END,
  updated_at DESC
LIMIT 5;

-- Uses index: idx_user_profiles_account_owner_name
```

### Batch Processing

```typescript
async function batchProfileClassification(
  documents: DocumentAnalysis[],
  accountOwnerId: string
): Promise<ProfileClassificationResult[]> {
  
  // Process documents in parallel
  const classifications = await Promise.all(
    documents.map(doc => classifier.classifyProfile(doc, accountOwnerId))
  );
  
  // Batch insert profiles
  const { data } = await supabase
    .from('user_profiles')
    .upsert(
      classifications.map(c => ({
        account_owner_id: accountOwnerId,
        profile_type: c.profile_type,
        display_name: c.display_name,
        relationship: c.relationship,
        species: c.species
      })),
      { onConflict: 'account_owner_id,display_name' }
    )
    .select('id, display_name');
  
  return classifications;
}
```

---

*This implementation guide provides complete patterns for AI profile classification integration with Guardian's multi-profile database architecture.*