# Multi-Profile Support Requirement

**Database Target:** `user_profiles` table  
**Priority:** CRITICAL - Phase 1 blocking requirement  
**Purpose:** Enable family healthcare management by correctly classifying documents to profile types  
**Reference:** [database-foundation-v2/core/multi-profile.md](../../database-foundation-v2/core/multi-profile.md)

---

## Requirement Overview

Guardian must support multi-profile healthcare management, allowing families to manage healthcare data for multiple individuals and pets within a single account. This requires AI processing to correctly identify which family member or pet each medical document belongs to and route clinical data accordingly.

### Critical Safety Requirement
**Profile contamination prevention:** Medical data must NEVER be assigned to the wrong profile. A child's vaccination record cannot appear in a parent's timeline, and a pet's veterinary data cannot mix with human healthcare records.

---

## Profile Types and Classification

### Profile Type Definitions

#### self
```yaml
definition: "Account owner's own healthcare data"
legal_status: "owner"
auth_requirements: "full_access"
age_context: "Adult (typically >= 18)"
detection_indicators:
  - "First-person language (my results, I received)"
  - "Adult healthcare context (primary care, specialists)"
  - "Patient name matches account holder"
  - "No dependent relationship indicators"
```

#### child  
```yaml
definition: "Minor dependent (< 18 years)"
legal_status: "dependent" 
auth_requirements: "parental_access"
age_validation: "< 18 years"
detection_indicators:
  - "Pediatric healthcare providers"
  - "Age mentioned as < 18"
  - "School health forms and requirements"
  - "Parent/guardian signatures on documents"
  - "Childhood vaccinations and growth charts"
relationship_extraction: "son, daughter, child, dependent"
```

#### adult_dependent
```yaml
definition: "Adult requiring care management (>= 18)"  
legal_status: "dependent"
auth_requirements: "guardian_or_power_of_attorney"
age_validation: ">= 18 years" 
detection_indicators:
  - "Elderly care contexts (nursing home, geriatric)"
  - "Disability support services"
  - "Power of attorney references"
  - "Adult age with care management language"
  - "Memory care or assisted living contexts"
relationship_extraction: "parent, spouse, adult_child, dependent"
```

#### pet
```yaml
definition: "Animal companion healthcare"
legal_status: "owner"
species_required: true
veterinary_context: true
detection_indicators:
  - "Animal species identification"
  - "Veterinary clinic contexts"
  - "Pet procedures and medications"
  - "Animal-specific terminology"
  - "Breed and species information"
relationship_extraction: "dog, cat, bird, rabbit, horse, etc."
```

---

## AI Classification Algorithm Requirements

### Primary Classification Logic

#### Step 1: Context Analysis
```python
def analyze_document_context(document_content, metadata):
    context_indicators = {
        'provider_type': extract_provider_type(document_content),
        'age_mentions': extract_age_references(document_content),
        'species_mentions': extract_animal_references(document_content),
        'relationship_clues': extract_relationship_language(document_content),
        'legal_signatures': extract_signature_contexts(document_content)
    }
    return context_indicators
```

#### Step 2: Profile Type Determination
```python
def classify_profile_type(context_indicators, confidence_thresholds):
    # Priority order: pet > child > adult_dependent > self
    
    if context_indicators['species_mentions']:
        return ProfileType.PET, calculate_confidence(context_indicators, 'pet')
    
    elif context_indicators['age_mentions'] < 18:
        return ProfileType.CHILD, calculate_confidence(context_indicators, 'child')
        
    elif context_indicators['adult_dependent_indicators']:
        return ProfileType.ADULT_DEPENDENT, calculate_confidence(context_indicators, 'adult_dependent')
        
    else:
        return ProfileType.SELF, calculate_confidence(context_indicators, 'self')
```

#### Step 3: Validation and Safety Checks
```python
def validate_profile_classification(profile_type, context_indicators, existing_profiles):
    # Age consistency validation
    if profile_type == ProfileType.CHILD and context_indicators['age_mentions'] >= 18:
        raise ProfileClassificationError("Child profile cannot have age >= 18")
    
    # Species requirement for pets
    if profile_type == ProfileType.PET and not context_indicators['species_mentions']:
        raise ProfileClassificationError("Pet profile requires species identification")
        
    # Contamination prevention
    validate_no_profile_contamination(profile_type, context_indicators, existing_profiles)
```

### Detection Patterns by Profile Type

#### Pet Profile Detection
```yaml
high_confidence_indicators:
  - "Animal species explicitly mentioned (dog, cat, bird, etc.)"
  - "Veterinary clinic or animal hospital"
  - "Pet-specific procedures (spay, neuter, heartworm test)"
  - "Animal medications and vaccinations"
  
medium_confidence_indicators:
  - "Animal behavior descriptions"
  - "Breed information"
  - "Pet insurance references"
  
validation_requirements:
  - "Species must be identified and stored"
  - "Veterinary context must be present"
  - "No human medical terminology"
```

#### Child Profile Detection
```yaml
high_confidence_indicators:
  - "Pediatric or children's hospital"
  - "Age explicitly stated as < 18"
  - "School health requirements"
  - "Childhood vaccination schedule"
  
medium_confidence_indicators:
  - "Growth charts and developmental milestones"
  - "Parent/guardian signatures"
  - "Adolescent or teenage healthcare contexts"
  
validation_requirements:
  - "Age must be < 18 if extractable"
  - "Cannot conflict with adult healthcare contexts"
  - "Parent/guardian involvement indicators"
```

#### Adult Dependent Detection
```yaml
high_confidence_indicators:
  - "Nursing home or assisted living facility"
  - "Power of attorney documentation"
  - "Memory care or dementia contexts"
  - "Geriatric or elderly care specialists"
  
medium_confidence_indicators:
  - "Adult age (>= 18) with care management"
  - "Disability support services"
  - "Family caregiver involvement"
  
validation_requirements:
  - "Age must be >= 18 if extractable"
  - "Care management context required"
  - "Cannot be confused with child profiles"
```

---

## Database Integration Specifications

### user_profiles Table Population

#### Required Fields (AI Populated)
```sql
-- Core classification
profile_type TEXT NOT NULL CHECK (profile_type IN ('self', 'child', 'adult_dependent', 'pet'))

-- Identity and relationships  
display_name TEXT NOT NULL               -- Extracted from patient name
relationship TEXT                        -- Extracted relationship to account owner

-- Pet-specific fields
species TEXT                            -- Required for pets (dog, cat, bird, etc.)
breed TEXT                              -- Optional breed information

-- Age and validation
date_of_birth DATE                      -- Extracted or calculated from age mentions

-- Classification metadata
confidence_score NUMERIC(4,3)           -- AI classification confidence
classification_source TEXT              -- Source of classification (document_analysis, user_input)
```

#### Calculated Fields (System Populated)
```sql
-- Legal and access control
legal_status TEXT DEFAULT 'dependent'   -- Calculated: owner for self/pet, dependent for others
auth_level TEXT DEFAULT 'soft'          -- Calculated based on authentication strength

-- State management
active BOOLEAN NOT NULL DEFAULT TRUE    -- Profile activation state
archived BOOLEAN NOT NULL DEFAULT FALSE -- Soft delete capability
```

### Profile Classification Confidence Requirements

#### Confidence Thresholds
```yaml
pet_profile:
  minimum_confidence: 0.95              # Very high - species detection critical
  auto_approve_threshold: 0.98          # Auto-approve if very confident
  
child_profile:
  minimum_confidence: 0.85              # High - age validation critical
  auto_approve_threshold: 0.95          # Require high confidence for auto-approval
  
adult_dependent_profile:
  minimum_confidence: 0.85              # High - legal status implications
  auto_approve_threshold: 0.90          # Moderate auto-approval threshold
  
self_profile:
  minimum_confidence: 0.80              # Lower - default assumption
  auto_approve_threshold: 0.85          # Standard auto-approval
```

#### Low Confidence Handling
```python
def handle_low_confidence_classification(classification_result, document_id):
    if classification_result.confidence < get_minimum_threshold(classification_result.profile_type):
        # Queue for manual review
        queue_for_manual_review(
            document_id=document_id,
            suggested_profile_type=classification_result.profile_type,
            confidence_score=classification_result.confidence,
            review_reason="Below minimum confidence threshold"
        )
        return None  # Don't auto-classify
    
    return classification_result
```

---

## Contamination Prevention Framework

### Cross-Profile Data Isolation

#### Validation Rules
```python
class ProfileContaminationPrevention:
    def validate_document_assignment(self, document_id, target_profile_id):
        # Check existing document assignments
        existing_assignment = get_document_profile_assignment(document_id)
        
        if existing_assignment and existing_assignment != target_profile_id:
            # Document already assigned to different profile
            current_profile = get_profile(existing_assignment)
            target_profile = get_profile(target_profile_id)
            
            # Flag for review if profile types don't match
            if current_profile.profile_type != target_profile.profile_type:
                raise ProfileContaminationError(
                    f"Document already assigned to {current_profile.profile_type} profile, "
                    f"cannot reassign to {target_profile.profile_type}"
                )
        
        return True
```

#### Age Consistency Validation
```python
def validate_age_profile_consistency(profile_type, extracted_age, existing_profiles):
    if not extracted_age:
        return True  # No age to validate
    
    validation_errors = []
    
    # Child profile age validation
    if profile_type == ProfileType.CHILD and extracted_age >= 18:
        validation_errors.append("Child profile cannot have age >= 18")
    
    # Adult dependent age validation  
    if profile_type == ProfileType.ADULT_DEPENDENT and extracted_age < 18:
        validation_errors.append("Adult dependent profile cannot have age < 18")
    
    # Check for conflicting ages in existing profiles with same name
    name_conflicts = check_name_age_conflicts(profile_type, extracted_age, existing_profiles)
    validation_errors.extend(name_conflicts)
    
    if validation_errors:
        raise ProfileValidationError(validation_errors)
    
    return True
```

### Profile Merge Detection
```python
def detect_profile_merge_candidates(new_profile, existing_profiles):
    """Detect if new profile might be duplicate of existing profile"""
    merge_candidates = []
    
    for existing in existing_profiles:
        similarity_score = calculate_profile_similarity(new_profile, existing)
        
        if similarity_score > 0.85:  # High similarity threshold
            merge_candidates.append({
                'existing_profile': existing,
                'similarity_score': similarity_score,
                'merge_reason': determine_merge_reason(new_profile, existing)
            })
    
    return merge_candidates
```

---

## Implementation Examples

### Example 1: Pediatric Document Classification
```python
# Input document content
document_content = """
Patient: Emma Rodriguez (Age: 5 years)
Parent/Guardian: Maria Rodriguez  
Provider: Sunny Pediatrics
Date: September 5, 2024

IMMUNIZATION RECORD
Vaccine: MMR (Measles, Mumps, Rubella) - Second Dose
"""

# AI classification process
context_analysis = {
    'patient_name': 'Emma Rodriguez',
    'age_mentions': [5],
    'provider_type': 'pediatric',
    'guardian_mentions': ['Maria Rodriguez'],
    'healthcare_context': 'immunization'
}

# Classification result
classification = {
    'profile_type': 'child',
    'display_name': 'Emma Rodriguez',
    'relationship': 'daughter',  # Inferred from name similarity
    'confidence_score': 0.94,
    'classification_reasoning': 'Age < 18, pediatric provider, guardian mentioned'
}
```

### Example 2: Veterinary Document Classification
```python
# Input document content  
document_content = """
Patient: Max (Golden Retriever, Male, 3 years old)
Owner: David Kim
Clinic: Happy Paws Veterinary

ANNUAL WELLNESS EXAM
Weight: 65 lbs
Vaccinations Updated: Rabies, DHPP
"""

# AI classification process
context_analysis = {
    'patient_name': 'Max',
    'species_mentions': ['Golden Retriever', 'dog'],
    'provider_type': 'veterinary',  
    'owner_mentions': ['David Kim'],
    'healthcare_context': 'wellness_exam'
}

# Classification result
classification = {
    'profile_type': 'pet',
    'display_name': 'Max',
    'species': 'dog',
    'breed': 'Golden Retriever',
    'relationship': 'dog',
    'confidence_score': 0.97,
    'classification_reasoning': 'Animal species identified, veterinary clinic context'
}
```

### Example 3: Adult Dependent Classification
```python
# Input document content
document_content = """
Patient: Robert Johnson (Age: 78)
Healthcare Proxy: Linda Johnson (Daughter)
Facility: Sunset Manor Assisted Living

GERIATRIC ASSESSMENT
Cognitive Status: Mild cognitive impairment
Care Plan: Medication management assistance required
"""

# AI classification process  
context_analysis = {
    'patient_name': 'Robert Johnson',
    'age_mentions': [78],
    'facility_type': 'assisted_living',
    'proxy_mentions': ['Linda Johnson'],
    'care_context': 'cognitive_impairment'
}

# Classification result
classification = {
    'profile_type': 'adult_dependent',
    'display_name': 'Robert Johnson',
    'relationship': 'parent',  # Inferred from proxy relationship
    'confidence_score': 0.91,
    'classification_reasoning': 'Adult age, assisted living facility, cognitive care needs'
}
```

---

## Testing and Validation Requirements

### Unit Testing Requirements
```python
def test_profile_classification_accuracy():
    test_cases = [
        # Pet documents
        ('veterinary_rabies_vaccine.pdf', ProfileType.PET, 0.95),
        ('dog_wellness_exam.pdf', ProfileType.PET, 0.96),
        
        # Child documents  
        ('school_physical_8_year_old.pdf', ProfileType.CHILD, 0.93),
        ('pediatric_vaccination_record.pdf', ProfileType.CHILD, 0.94),
        
        # Adult dependent documents
        ('nursing_home_assessment.pdf', ProfileType.ADULT_DEPENDENT, 0.89),
        ('elderly_care_plan.pdf', ProfileType.ADULT_DEPENDENT, 0.91),
        
        # Self documents
        ('annual_physical_adult.pdf', ProfileType.SELF, 0.87),
        ('specialist_consultation.pdf', ProfileType.SELF, 0.85)
    ]
    
    for document, expected_type, min_confidence in test_cases:
        result = classify_profile(load_test_document(document))
        assert result.profile_type == expected_type
        assert result.confidence_score >= min_confidence
```

### Integration Testing Requirements
```python
def test_contamination_prevention():
    # Test cross-profile contamination detection
    child_doc = "Emma Rodriguez (Age 8) - School Physical"
    adult_doc = "Emma Rodriguez (Age 35) - Annual Checkup"  # Same name, different age
    
    # Should detect potential contamination
    with pytest.raises(ProfileContaminationError):
        assign_document_to_profile(child_doc, adult_profile_id)
        
def test_profile_merge_detection():
    # Test duplicate profile detection
    profile1 = create_profile("John Smith", ProfileType.SELF)
    profile2 = create_profile("John Smith", ProfileType.SELF)  # Potential duplicate
    
    merge_candidates = detect_profile_merge_candidates(profile2, [profile1])
    assert len(merge_candidates) > 0
    assert merge_candidates[0]['similarity_score'] > 0.85
```

---

## Success Criteria

### Technical Success Metrics
- **95%+ classification accuracy** across all profile types
- **Zero cross-profile contamination** in testing scenarios  
- **Handles edge cases** (unclear ownership, family documents)
- **Consistent confidence scoring** aligned with classification accuracy

### Healthcare Safety Metrics
- **No medical data misassignment** between family members
- **Proper age validation** prevents child/adult profile conflicts
- **Species validation** prevents human/animal data mixing
- **Legal relationship tracking** maintains proper access controls

### User Experience Metrics
- **Automatic profile detection** reduces manual user intervention
- **Clear profile indicators** in UI prevent user confusion
- **Profile switching** maintains data isolation
- **Family coordination** enables multi-profile healthcare management

---

*Multi-profile support is the foundation requirement that enables Guardian to serve families rather than just individuals, making it possible for parents to manage their children's healthcare, adults to coordinate elderly parent care, and pet owners to track veterinary records - all while maintaining strict data isolation and safety.*