# smart_health_features Bridge Specification

**Database Table:** `smart_health_features`  
**AI Component:** smart-feature-detector  
**Purpose:** Bridge document for detecting context-sensitive UI feature activation  
**Reference:** [008_smart_features.sql](../../../../database-foundation/implementation/sql/008_smart_features.sql)

---

## Table Overview

The `smart_health_features` table enables Guardian to automatically activate specialized UI features based on healthcare context detected in documents. When AI identifies specific health situations (pregnancy, pediatrics, veterinary care, etc.), it triggers appropriate interface adaptations.

**Critical Requirement:** Features must activate reliably when appropriate but never create false positives that confuse users or compromise safety.

---

## Schema Reference

```sql
CREATE TABLE smart_health_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    
    -- Feature Classification (AI Detected)
    feature_type TEXT NOT NULL CHECK (feature_type IN (
        'pregnancy', 'family_planning', 'pediatric', 'adult_care', 'veterinary',
        'chronic_disease', 'mental_health', 'disability_support'
    )),
    
    -- Activation Context
    activation_source TEXT NOT NULL CHECK (activation_source IN (
        'document_content', 'user_selection', 'clinical_data_pattern', 'age_calculation'
    )),
    detection_confidence NUMERIC(4,3) CHECK (detection_confidence BETWEEN 0 AND 1),
    
    -- Feature State Management
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'user_disabled')),
    auto_activated BOOLEAN DEFAULT TRUE,
    user_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Detection Details
    trigger_document_id UUID REFERENCES documents(id),
    detection_criteria JSONB, -- What signals triggered this feature
    clinical_indicators TEXT[], -- Specific clinical terms found
    
    -- Temporal Management
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- Some features have expiration (e.g., pregnancy)
    last_confirmed_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Feature Detection Model

### Feature Type Detection Rules

```yaml
feature_detection_rules:
  pregnancy:
    clinical_indicators:
      - pregnancy_tests: ["HCG", "beta-hCG", "pregnancy test"]
      - prenatal_care: ["prenatal", "obstetric", "OB/GYN", "fetal"]
      - pregnancy_terms: ["pregnant", "gestation", "trimester", "due date"]
      - maternal_care: ["maternal", "antenatal", "prenatal vitamins"]
    confidence_threshold: 0.85
    expiration_logic: "estimated_due_date + 6_months"
    safety_critical: true
    
  family_planning:
    clinical_indicators:
      - fertility_care: ["fertility", "IVF", "ovulation", "conception"]
      - contraception: ["birth control", "contraceptive", "IUD", "implant"]
      - reproductive_health: ["reproductive endocrinology", "fertility specialist"]
    confidence_threshold: 0.8
    expiration_logic: null
    
  pediatric:
    clinical_indicators:
      - age_indicators: ["age: [0-17]", "pediatric", "child", "infant"]
      - pediatric_providers: ["pediatrician", "children's hospital", "pediatric"]
      - child_health: ["immunizations", "growth chart", "developmental milestones"]
      - school_health: ["school physical", "sports physical"]
    confidence_threshold: 0.9
    age_validation: "< 18 years"
    
  adult_care:
    clinical_indicators:
      - eldercare: ["geriatric", "elderly", "nursing home", "assisted living"]
      - disability_support: ["disability", "caregiver", "power of attorney"]
      - dependency_care: ["adult dependent", "special needs", "cognitive impairment"]
    confidence_threshold: 0.85
    age_validation: ">= 18 years"
    
  veterinary:
    clinical_indicators:
      - animal_care: ["veterinary", "animal hospital", "vet clinic"]
      - pet_identification: ["dog", "cat", "bird", "rabbit", "species"]
      - animal_procedures: ["spay", "neuter", "rabies vaccination", "heartworm"]
      - pet_medications: ["pet medication", "animal dosage"]
    confidence_threshold: 0.95
    species_detection: required
    
  chronic_disease:
    clinical_indicators:
      - diabetes: ["diabetes", "insulin", "glucose", "A1C", "diabetic"]
      - cardiovascular: ["heart disease", "hypertension", "cardiac", "cholesterol"]
      - respiratory: ["asthma", "COPD", "inhaler", "pulmonary"]
      - autoimmune: ["rheumatoid", "lupus", "multiple sclerosis", "autoimmune"]
    confidence_threshold: 0.8
    monitoring_required: true
    
  mental_health:
    clinical_indicators:
      - mental_health_care: ["psychiatry", "psychology", "counseling", "therapy"]
      - mental_health_conditions: ["depression", "anxiety", "PTSD", "bipolar"]
      - mental_health_medications: ["antidepressant", "anxiolytic", "mood stabilizer"]
    confidence_threshold: 0.85
    sensitivity_required: true
```

### AI Output Format

```typescript
interface SmartFeatureDetection {
  // Feature Classification (REQUIRED)
  feature_type: 'pregnancy' | 'family_planning' | 'pediatric' | 'adult_care' | 
                'veterinary' | 'chronic_disease' | 'mental_health' | 'disability_support';
  
  // Detection Context (REQUIRED)
  detection_confidence: number; // 0.0 - 1.0
  clinical_indicators: string[]; // Specific terms that triggered detection
  activation_source: 'document_content' | 'user_selection' | 'clinical_data_pattern' | 'age_calculation';
  
  // Supporting Evidence (REQUIRED)
  trigger_document_id: string;
  detection_criteria: {
    primary_signals: string[]; // Main indicators
    supporting_signals: string[]; // Additional context
    exclusion_factors?: string[]; // What might contraindicate
  };
  
  // Temporal Context (OPTIONAL)
  estimated_duration?: string; // "pregnancy_term", "ongoing", "temporary"
  expiration_date?: string; // ISO date if applicable
  
  // Metadata
  detection_source_text: string; // Original document text
  related_profile_data?: any; // Supporting profile information
}
```

---

## Detection Examples

### Example 1: Pregnancy Feature Detection

**Document Text:** "Patient: Sarah Johnson, Positive pregnancy test, HCG level 1,200 mIU/mL, estimated due date June 15, 2025"

```json
{
  "feature_type": "pregnancy",
  "detection_confidence": 0.95,
  "clinical_indicators": ["positive pregnancy test", "HCG level", "due date"],
  "activation_source": "document_content",
  "trigger_document_id": "doc-123",
  "detection_criteria": {
    "primary_signals": ["positive pregnancy test", "HCG level 1,200"],
    "supporting_signals": ["estimated due date", "prenatal care context"],
    "exclusion_factors": []
  },
  "estimated_duration": "pregnancy_term",
  "expiration_date": "2025-12-15",
  "detection_source_text": "Positive pregnancy test, HCG level 1,200 mIU/mL"
}
```

### Example 2: Veterinary Feature Detection

**Document Text:** "Patient: Max (Golden Retriever), Annual vaccination: Rabies, DHPP, Heartworm prevention"

```json
{
  "feature_type": "veterinary",
  "detection_confidence": 0.98,
  "clinical_indicators": ["Golden Retriever", "vaccination", "rabies", "heartworm"],
  "activation_source": "document_content",
  "trigger_document_id": "doc-456",
  "detection_criteria": {
    "primary_signals": ["Golden Retriever species", "veterinary vaccinations"],
    "supporting_signals": ["animal-specific medications", "vet clinic context"],
    "exclusion_factors": []
  },
  "estimated_duration": "ongoing",
  "detection_source_text": "Max (Golden Retriever), Annual vaccination"
}
```

### Example 3: Pediatric Feature Detection

**Document Text:** "Patient: Emma Smith, Age 8, Pediatric checkup, immunizations up to date, growth percentile normal"

```json
{
  "feature_type": "pediatric",
  "detection_confidence": 0.92,
  "clinical_indicators": ["Age 8", "pediatric checkup", "immunizations", "growth percentile"],
  "activation_source": "age_calculation",
  "trigger_document_id": "doc-789",
  "detection_criteria": {
    "primary_signals": ["age under 18", "pediatric provider"],
    "supporting_signals": ["childhood immunizations", "growth tracking"],
    "exclusion_factors": []
  },
  "estimated_duration": "until_age_18",
  "related_profile_data": {
    "calculated_age": 8,
    "age_verification_source": "document_stated_age"
  }
}
```

### Example 4: Chronic Disease Feature Detection

**Document Text:** "Diabetes Type 2, A1C: 8.2%, prescribed Metformin 500mg twice daily, follow up in 3 months"

```json
{
  "feature_type": "chronic_disease",
  "detection_confidence": 0.89,
  "clinical_indicators": ["Diabetes Type 2", "A1C", "Metformin", "chronic management"],
  "activation_source": "clinical_data_pattern",
  "trigger_document_id": "doc-321",
  "detection_criteria": {
    "primary_signals": ["Diabetes Type 2 diagnosis", "A1C monitoring"],
    "supporting_signals": ["diabetes medication", "regular follow-up"],
    "exclusion_factors": []
  },
  "estimated_duration": "ongoing",
  "detection_source_text": "Diabetes Type 2, A1C: 8.2%, prescribed Metformin"
}
```

---

## Database Population Patterns

### Feature Activation Insert

```sql
INSERT INTO smart_health_features (
    profile_id,
    feature_type,
    activation_source,
    detection_confidence,
    trigger_document_id,
    detection_criteria,
    clinical_indicators,
    expires_at,
    auto_activated,
    user_confirmed
) VALUES (
    $1::UUID,                    -- profile_id from context
    $2::TEXT,                    -- feature_type from AI
    $3::TEXT,                    -- activation_source from AI
    $4::NUMERIC,                 -- detection_confidence from AI
    $5::UUID,                    -- trigger_document_id from context
    $6::JSONB,                   -- detection_criteria from AI
    $7::TEXT[],                  -- clinical_indicators from AI
    $8::TIMESTAMPTZ,             -- expires_at from AI (nullable)
    $9::BOOLEAN,                 -- auto_activated (default true)
    $10::BOOLEAN                 -- user_confirmed (default false)
)
ON CONFLICT (profile_id, feature_type) 
DO UPDATE SET
    detection_confidence = GREATEST(smart_health_features.detection_confidence, EXCLUDED.detection_confidence),
    clinical_indicators = array_cat(smart_health_features.clinical_indicators, EXCLUDED.clinical_indicators),
    updated_at = NOW()
RETURNING id;
```

### Feature Deactivation (Expiration)

```sql
-- Auto-deactivate expired features
UPDATE smart_health_features
SET 
    status = 'inactive',
    updated_at = NOW()
WHERE 
    expires_at IS NOT NULL 
    AND expires_at < NOW()
    AND status = 'active';
```

### User Confirmation Update

```sql
-- User confirms or disables auto-activated feature
UPDATE smart_health_features
SET 
    user_confirmed = $2::BOOLEAN,
    status = CASE 
        WHEN $2::BOOLEAN THEN 'active'
        ELSE 'user_disabled'
    END,
    last_confirmed_at = NOW(),
    updated_at = NOW()
WHERE 
    id = $1::UUID;
```

---

## Feature Logic Implementation

### Pregnancy Feature Logic

```typescript
function detectPregnancyFeature(document: DocumentContent): SmartFeatureDetection | null {
  const pregnancySignals = [
    'pregnancy test', 'positive HCG', 'pregnant', 'prenatal', 'obstetric',
    'trimester', 'fetal', 'due date', 'gestation', 'maternal'
  ];
  
  const matchedSignals = pregnancySignals.filter(signal => 
    document.content.toLowerCase().includes(signal.toLowerCase())
  );
  
  if (matchedSignals.length >= 2) {
    const confidence = Math.min(0.95, 0.7 + (matchedSignals.length * 0.05));
    const dueDate = extractDueDate(document.content);
    
    return {
      feature_type: 'pregnancy',
      detection_confidence: confidence,
      clinical_indicators: matchedSignals,
      activation_source: 'document_content',
      expiration_date: dueDate ? addMonths(dueDate, 6) : null,
      detection_criteria: {
        primary_signals: matchedSignals.slice(0, 3),
        supporting_signals: matchedSignals.slice(3)
      }
    };
  }
  
  return null;
}
```

### Veterinary Feature Logic

```typescript
function detectVeterinaryFeature(document: DocumentContent, profile: UserProfile): SmartFeatureDetection | null {
  const animalSpecies = ['dog', 'cat', 'bird', 'rabbit', 'hamster', 'fish'];
  const vetIndicators = ['veterinary', 'animal hospital', 'vet clinic', 'DVM'];
  const petProcedures = ['spay', 'neuter', 'rabies vaccination', 'heartworm'];
  
  const speciesFound = animalSpecies.find(species => 
    document.content.toLowerCase().includes(species)
  );
  
  const vetContext = vetIndicators.some(indicator =>
    document.content.toLowerCase().includes(indicator.toLowerCase())
  );
  
  const petMedicalContext = petProcedures.some(procedure =>
    document.content.toLowerCase().includes(procedure.toLowerCase())
  );
  
  if (speciesFound && (vetContext || petMedicalContext)) {
    return {
      feature_type: 'veterinary',
      detection_confidence: 0.95,
      clinical_indicators: [speciesFound, ...vetIndicators.filter(vi => document.content.includes(vi))],
      activation_source: 'document_content',
      detection_criteria: {
        primary_signals: [speciesFound, 'veterinary_context'],
        supporting_signals: petProcedures.filter(pp => document.content.includes(pp))
      },
      related_profile_data: {
        detected_species: speciesFound,
        profile_type_match: profile.profile_type === 'pet'
      }
    };
  }
  
  return null;
}
```

### Age-Based Pediatric Detection

```typescript
function detectPediatricFeature(document: DocumentContent, profile: UserProfile): SmartFeatureDetection | null {
  const ageMatch = document.content.match(/age:?\s*(\d+)/i);
  const pediatricTerms = ['pediatric', 'child', 'infant', 'adolescent', 'pediatrician'];
  
  let isPediatric = false;
  let confidence = 0.5;
  let indicators: string[] = [];
  
  // Age-based detection
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age < 18) {
      isPediatric = true;
      confidence = 0.9;
      indicators.push(`age_${age}`);
    }
  }
  
  // Term-based detection
  const pediatricMatches = pediatricTerms.filter(term =>
    document.content.toLowerCase().includes(term.toLowerCase())
  );
  
  if (pediatricMatches.length >= 1) {
    isPediatric = true;
    confidence = Math.max(confidence, 0.85);
    indicators.push(...pediatricMatches);
  }
  
  if (isPediatric) {
    return {
      feature_type: 'pediatric',
      detection_confidence: confidence,
      clinical_indicators: indicators,
      activation_source: ageMatch ? 'age_calculation' : 'document_content',
      estimated_duration: 'until_age_18',
      detection_criteria: {
        primary_signals: indicators,
        supporting_signals: []
      }
    };
  }
  
  return null;
}
```

---

## Feature Conflict Resolution

### Conflicting Feature Logic

```sql
-- Handle conflicting feature activations
CREATE OR REPLACE FUNCTION resolve_feature_conflicts(p_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Pediatric and adult_care are mutually exclusive
  IF EXISTS (
    SELECT 1 FROM smart_health_features 
    WHERE profile_id = p_profile_id 
    AND feature_type IN ('pediatric', 'adult_care')
    AND status = 'active'
    GROUP BY profile_id
    HAVING COUNT(DISTINCT feature_type) > 1
  ) THEN
    -- Keep the one with higher confidence
    UPDATE smart_health_features
    SET status = 'inactive'
    WHERE profile_id = p_profile_id
    AND feature_type IN ('pediatric', 'adult_care')
    AND status = 'active'
    AND detection_confidence < (
      SELECT MAX(detection_confidence)
      FROM smart_health_features
      WHERE profile_id = p_profile_id
      AND feature_type IN ('pediatric', 'adult_care')
      AND status = 'active'
    );
  END IF;
  
  -- Pregnancy and family_planning can coexist but pregnancy takes priority
  -- No conflicts to resolve here - both can be active
END;
$$ LANGUAGE plpgsql;
```

---

## UI Integration Patterns

### Feature-Based UI Activation

```typescript
interface UIFeatureActivation {
  feature_type: string;
  ui_components: string[];
  navigation_changes: string[];
  content_modifications: string[];
}

const featureUIMapping: Record<string, UIFeatureActivation> = {
  pregnancy: {
    ui_components: ['pregnancy_tracker', 'prenatal_care_reminders', 'nutrition_guide'],
    navigation_changes: ['add_pregnancy_tab', 'highlight_ob_gyn'],
    content_modifications: ['pregnancy_safe_medications', 'prenatal_appointment_scheduling']
  },
  
  pediatric: {
    ui_components: ['growth_charts', 'immunization_tracker', 'developmental_milestones'],
    navigation_changes: ['add_child_health_tab', 'pediatric_resources'],
    content_modifications: ['age_appropriate_health_info', 'school_form_templates']
  },
  
  veterinary: {
    ui_components: ['pet_health_tracker', 'vaccination_schedule', 'species_specific_care'],
    navigation_changes: ['add_pet_tab', 'veterinary_providers'],
    content_modifications: ['pet_medication_calculator', 'species_care_guides']
  }
};
```

### Feature Query for UI

```sql
-- Get active features for profile to determine UI configuration
SELECT 
    feature_type,
    detection_confidence,
    clinical_indicators,
    status,
    user_confirmed,
    activated_at,
    expires_at
FROM smart_health_features
WHERE 
    profile_id = $1::UUID
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY detection_confidence DESC;
```

---

## Quality & Safety Controls

### False Positive Prevention

```yaml
safety_controls:
  confidence_thresholds:
    pregnancy: 0.85  # High threshold due to UI impact
    veterinary: 0.95  # Very high - species detection critical
    pediatric: 0.9   # High - age validation important
    chronic_disease: 0.8  # Medium - ongoing conditions
    
  validation_rules:
    pregnancy:
      - Must have explicit pregnancy terms
      - Cannot activate for male profiles
      - Requires recent document (< 6 months)
      
    pediatric:
      - Must have age < 18 OR explicit pediatric context
      - Cannot conflict with adult_care features
      - School-age documents increase confidence
      
    veterinary:
      - Must have animal species identified
      - Must have veterinary context
      - Cannot activate for human-only documents
```

### User Override Controls

```sql
-- Allow users to manually override feature activation
UPDATE smart_health_features
SET 
    status = CASE 
        WHEN $2::BOOLEAN THEN 'active'
        ELSE 'user_disabled'
    END,
    user_confirmed = TRUE,
    auto_activated = FALSE,
    last_confirmed_at = NOW()
WHERE 
    profile_id = $1::UUID
    AND feature_type = $3::TEXT;
```

---

## Testing Requirements

### Unit Tests

```typescript
describe('SmartFeatureDetection', () => {
  test('should detect pregnancy from positive test document', async () => {
    const document = "Positive pregnancy test, HCG level 1,200 mIU/mL";
    const result = await detectSmartFeatures(document, profile);
    
    const pregnancyFeature = result.find(f => f.feature_type === 'pregnancy');
    expect(pregnancyFeature).toBeDefined();
    expect(pregnancyFeature?.detection_confidence).toBeGreaterThan(0.85);
    expect(pregnancyFeature?.clinical_indicators).toContain('positive pregnancy test');
  });
  
  test('should detect veterinary from pet document', async () => {
    const document = "Max (Golden Retriever) - Rabies vaccination administered";
    const result = await detectSmartFeatures(document, profile);
    
    const vetFeature = result.find(f => f.feature_type === 'veterinary');
    expect(vetFeature?.clinical_indicators).toContain('Golden Retriever');
    expect(vetFeature?.detection_confidence).toBeGreaterThan(0.95);
  });
  
  test('should not create false positive for ambiguous content', async () => {
    const document = "Patient discussed family planning options";
    const result = await detectSmartFeatures(document, profile);
    
    const pregnancyFeature = result.find(f => f.feature_type === 'pregnancy');
    expect(pregnancyFeature).toBeUndefined(); // Should not trigger pregnancy
  });
});
```

---

*This bridge specification ensures that AI accurately detects healthcare contexts requiring specialized UI features, enabling Guardian to provide appropriate, context-sensitive user experiences while preventing false activations that could confuse or mislead users.*