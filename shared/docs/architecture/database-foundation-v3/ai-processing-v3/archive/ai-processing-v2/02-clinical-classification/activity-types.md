# Activity Types Classification

**Database Field:** `patient_clinical_events.activity_type`  
**O3 Framework:** Primary Classification Axis  
**Priority:** CRITICAL - Phase 1 blocking requirement  
**Values:** `observation` | `intervention`

---

## Classification Overview

Activity type classification is the primary axis of O3's two-axis clinical model. Every medical fact extracted from documents must be classified as either an **observation** (information gathering) or an **intervention** (action taken). This fundamental distinction determines how clinical data is processed, stored, and utilized throughout Guardian's healthcare platform.

### Core Distinction
```yaml
observation:
  definition: "Information gathering activities that do not change patient state"
  characteristic: "Measuring, testing, assessing, observing"
  database_trigger: "Populates patient_observations table"
  
intervention:
  definition: "Actions taken that change or intend to change patient state"
  characteristic: "Treating, administering, performing, prescribing"
  database_trigger: "Populates patient_interventions table"
```

---

## Observation Classification

### Definition and Scope
**Observations** are medical activities that gather information about a patient's health status without directly changing their physical or mental state. These activities are diagnostic in nature and provide data for healthcare decision-making.

### Core Characteristics
```yaml
information_gathering:
  purpose: "Collect data about patient health status"
  examples: ["Blood tests", "Physical examinations", "Imaging studies", "Vital sign measurements"]
  
non_interventional:
  purpose: "Does not directly alter patient physiology"
  examples: ["Reading blood pressure", "Observing symptoms", "Measuring weight", "Taking temperature"]
  
state_preservation:
  purpose: "Patient state remains unchanged by the activity"
  examples: ["Viewing X-rays", "Listening to heart sounds", "Checking reflexes"]
```

### Observation Categories and Examples

#### Laboratory Tests and Measurements
```yaml
blood_tests:
  examples:
    - "Complete blood count (CBC)"
    - "Blood glucose measurement"
    - "Cholesterol panel"
    - "Liver function tests"
  classification_confidence: "very_high"
  database_population: "patient_observations with lab results"

urine_tests:
  examples:
    - "Urinalysis"
    - "Urine culture"
    - "Pregnancy test (urine)"
  classification_confidence: "very_high"

other_laboratory:
  examples:
    - "Throat culture"
    - "Stool sample analysis"
    - "Tissue biopsy examination"
  classification_confidence: "high"
```

#### Physical Examinations and Assessments
```yaml
vital_signs:
  examples:
    - "Blood pressure measurement"
    - "Heart rate monitoring"  
    - "Temperature reading"
    - "Respiratory rate assessment"
    - "Oxygen saturation measurement"
  classification_confidence: "very_high"
  
physical_examination:
  examples:
    - "Cardiovascular examination"
    - "Respiratory examination"
    - "Abdominal examination"
    - "Neurological assessment"
    - "Skin examination"
  classification_confidence: "high"
  
sensory_assessments:
  examples:
    - "Vision screening"
    - "Hearing test"
    - "Balance assessment"
  classification_confidence: "high"
```

#### Imaging and Diagnostic Studies
```yaml
medical_imaging:
  examples:
    - "Chest X-ray"
    - "CT scan"
    - "MRI study"
    - "Ultrasound examination"
    - "Mammography"
  classification_confidence: "very_high"
  note: "The imaging study itself is observation; any contrast injection would be intervention"

cardiac_diagnostics:
  examples:
    - "Electrocardiogram (EKG/ECG)"
    - "Echocardiogram"
    - "Stress test monitoring"
  classification_confidence: "very_high"

specialized_diagnostics:
  examples:
    - "Endoscopy viewing"
    - "Colonoscopy examination"
    - "Bronchoscopy observation"
  classification_confidence: "high"
  note: "The diagnostic viewing is observation; any biopsy taken would be intervention"
```

### Observation Classification Algorithm
```python
def classify_as_observation(medical_text, clinical_context):
    """Determine if medical activity should be classified as observation"""
    
    observation_indicators = {
        # Measurement and testing language
        'measurement_terms': ['measured', 'tested', 'checked', 'monitored', 'assessed'],
        'result_terms': ['results', 'findings', 'values', 'levels', 'readings'],
        'examination_terms': ['examined', 'observed', 'inspected', 'reviewed'],
        
        # Laboratory and diagnostic contexts
        'laboratory_context': ['lab', 'blood test', 'urine test', 'culture'],
        'imaging_context': ['x-ray', 'CT', 'MRI', 'ultrasound', 'scan'],
        'diagnostic_context': ['EKG', 'ECG', 'endoscopy', 'biopsy examination'],
        
        # Information gathering verbs
        'gathering_verbs': ['showed', 'revealed', 'indicated', 'demonstrated', 'found']
    }
    
    confidence_score = calculate_observation_confidence(medical_text, observation_indicators)
    
    return {
        'activity_type': 'observation',
        'confidence': confidence_score,
        'supporting_evidence': extract_supporting_evidence(medical_text, observation_indicators)
    }

def calculate_observation_confidence(text, indicators):
    """Calculate confidence that activity is an observation"""
    
    confidence_factors = []
    
    # Strong indicators (high weight)
    for category, terms in indicators.items():
        matches = sum(1 for term in terms if term.lower() in text.lower())
        if matches > 0:
            if category in ['laboratory_context', 'imaging_context']:
                confidence_factors.append(0.3)  # Strong indication
            elif category in ['measurement_terms', 'result_terms']:
                confidence_factors.append(0.25)
            else:
                confidence_factors.append(0.15)
    
    # Calculate base confidence from indicators
    base_confidence = min(sum(confidence_factors), 0.95)
    
    # Adjust for context
    if 'administered' in text.lower() or 'injected' in text.lower():
        base_confidence *= 0.6  # Likely intervention
    
    if 'results' in text.lower() and any(num in text for num in '0123456789'):
        base_confidence = min(base_confidence + 0.1, 0.95)  # Results with values
    
    return base_confidence
```

---

## Intervention Classification

### Definition and Scope
**Interventions** are medical activities that directly change or intend to change a patient's physical, mental, or physiological state. These activities are therapeutic, preventive, or management-oriented and represent active medical care.

### Core Characteristics
```yaml
state_changing:
  purpose: "Directly alter patient physiology or condition"
  examples: ["Medication administration", "Surgery", "Physical therapy", "Vaccinations"]
  
therapeutic_intent:
  purpose: "Intended to treat, prevent, or manage health conditions"
  examples: ["Prescribing antibiotics", "Performing procedures", "Providing counseling"]
  
active_intervention:
  purpose: "Healthcare provider takes action affecting patient"
  examples: ["Injections", "Wound care", "Medical procedures", "Therapeutic interventions"]
```

### Intervention Categories and Examples

#### Medication Administration and Prescription
```yaml
medication_administration:
  examples:
    - "Influenza vaccine injection"
    - "Antibiotic injection"
    - "IV medication administration"
    - "Topical medication application"
  classification_confidence: "very_high"
  database_population: "patient_interventions with medication details"

prescription_writing:
  examples:
    - "Prescribed lisinopril for hypertension"
    - "Antibiotic prescription for infection"
    - "Pain medication prescribed"
  classification_confidence: "very_high"
  note: "The prescription act is intervention; monitoring effects would be observation"

over_counter_recommendations:
  examples:
    - "Recommended acetaminophen for pain"
    - "Advised probiotics for digestive health"
  classification_confidence: "high"
```

#### Medical Procedures and Treatments
```yaml
surgical_procedures:
  examples:
    - "Appendectomy performed"
    - "Suture repair of laceration"
    - "Cyst removal"
    - "Arthroscopic knee surgery"
  classification_confidence: "very_high"

minimally_invasive_procedures:
  examples:
    - "Biopsy tissue collection"
    - "Blood draw for testing"
    - "Injection administration"
    - "Catheter insertion"
  classification_confidence: "very_high"

therapeutic_procedures:
  examples:
    - "Physical therapy session"
    - "Occupational therapy"
    - "Wound dressing change"
    - "Joint manipulation"
  classification_confidence: "high"
```

#### Preventive Interventions
```yaml
vaccinations:
  examples:
    - "COVID-19 vaccination administered"
    - "Flu shot given"
    - "Childhood immunization"
    - "Travel vaccine administration"
  classification_confidence: "very_high"
  clinical_purposes: ["preventive"]

preventive_treatments:
  examples:
    - "Fluoride treatment applied"
    - "Prophylactic antibiotic given"
    - "Preventive medication started"
  classification_confidence: "high"
```

### Intervention Classification Algorithm
```python
def classify_as_intervention(medical_text, clinical_context):
    """Determine if medical activity should be classified as intervention"""
    
    intervention_indicators = {
        # Action and treatment language
        'action_terms': ['administered', 'given', 'injected', 'prescribed', 'performed'],
        'treatment_terms': ['treated', 'managed', 'therapy', 'treatment', 'intervention'],
        'procedure_terms': ['surgery', 'procedure', 'operation', 'repair', 'removal'],
        
        # Medication contexts
        'medication_context': ['vaccine', 'injection', 'medication', 'drug', 'antibiotic'],
        'dosage_indicators': ['mg', 'ml', 'dose', 'units', 'tablets'],
        
        # Therapeutic actions
        'therapeutic_actions': ['counseled', 'advised', 'recommended', 'educated', 'instructed']
    }
    
    confidence_score = calculate_intervention_confidence(medical_text, intervention_indicators)
    
    return {
        'activity_type': 'intervention',
        'confidence': confidence_score,
        'supporting_evidence': extract_supporting_evidence(medical_text, intervention_indicators)
    }

def calculate_intervention_confidence(text, indicators):
    """Calculate confidence that activity is an intervention"""
    
    confidence_factors = []
    
    # Strong indicators (high weight)
    for category, terms in indicators.items():
        matches = sum(1 for term in terms if term.lower() in text.lower())
        if matches > 0:
            if category in ['action_terms', 'medication_context']:
                confidence_factors.append(0.35)  # Very strong indication
            elif category in ['treatment_terms', 'procedure_terms']:
                confidence_factors.append(0.3)
            elif category == 'dosage_indicators':
                confidence_factors.append(0.25)  # Strong medication indicator
            else:
                confidence_factors.append(0.2)
    
    # Calculate base confidence
    base_confidence = min(sum(confidence_factors), 0.95)
    
    # Boost confidence for clear intervention markers
    if any(term in text.lower() for term in ['injected', 'administered', 'prescribed', 'performed']):
        base_confidence = min(base_confidence + 0.1, 0.95)
    
    # Reduce confidence for observation-like language
    if any(term in text.lower() for term in ['results', 'showed', 'findings', 'measured']):
        base_confidence *= 0.8
    
    return base_confidence
```

---

## Classification Decision Framework

### Decision Tree Logic
```python
def classify_activity_type(medical_text, clinical_context):
    """Main classification function for activity type determination"""
    
    # Step 1: Pre-processing and context analysis
    normalized_text = preprocess_medical_text(medical_text)
    context_clues = extract_context_clues(clinical_context)
    
    # Step 2: Apply classification algorithms
    observation_result = classify_as_observation(normalized_text, context_clues)
    intervention_result = classify_as_intervention(normalized_text, context_clues)
    
    # Step 3: Determine primary classification
    if intervention_result['confidence'] > observation_result['confidence']:
        if intervention_result['confidence'] >= 0.8:
            return intervention_result
    
    if observation_result['confidence'] >= 0.8:
        return observation_result
    
    # Step 4: Handle ambiguous cases
    if abs(intervention_result['confidence'] - observation_result['confidence']) < 0.1:
        return handle_ambiguous_classification(medical_text, observation_result, intervention_result)
    
    # Step 5: Return higher confidence result with warning if below threshold
    result = (intervention_result if intervention_result['confidence'] > observation_result['confidence'] 
             else observation_result)
    
    if result['confidence'] < 0.8:
        result['requires_review'] = True
        result['review_reason'] = 'Low confidence classification'
    
    return result

def handle_ambiguous_classification(text, obs_result, int_result):
    """Handle cases where classification confidence is similar"""
    
    # Look for tie-breaking indicators
    if 'results' in text.lower() or 'findings' in text.lower():
        return obs_result
    
    if 'administered' in text.lower() or 'given' in text.lower():
        return int_result
    
    # Default to observation if truly ambiguous (safer for clinical data)
    obs_result['requires_review'] = True
    obs_result['review_reason'] = 'Ambiguous classification - defaulted to observation'
    return obs_result
```

### Common Edge Cases and Resolutions

#### Diagnostic Procedures with Intervention Components
```yaml
colonoscopy_with_biopsy:
  scenario: "Colonoscopy performed with tissue biopsy"
  resolution: 
    - "Colonoscopy examination = observation"
    - "Tissue biopsy collection = intervention"
  approach: "Split into separate clinical events"

cardiac_catheterization:
  scenario: "Cardiac catheterization with contrast injection"
  resolution:
    - "Cardiac assessment = observation"  
    - "Contrast injection = intervention"
  approach: "Primary classification based on main purpose"

stress_test_with_medication:
  scenario: "Stress test with pharmacological stress agent"
  resolution:
    - "Stress test monitoring = observation"
    - "Medication administration = intervention"
  approach: "Create separate events for each component"
```

#### Medication-Related Classifications
```yaml
medication_administration:
  scenario: "Nurse administered pain medication"
  classification: "intervention"
  confidence: "very_high"
  reasoning: "Direct action changing patient state"

medication_effects_monitoring:
  scenario: "Monitored patient response to medication"  
  classification: "observation"
  confidence: "high"
  reasoning: "Information gathering about medication effects"

prescription_writing:
  scenario: "Doctor prescribed antibiotic"
  classification: "intervention"
  confidence: "very_high"
  reasoning: "Therapeutic action intended to change patient state"
```

---

## Database Integration Specifications

### patient_clinical_events Table Population
```sql
-- Activity type classification results populate this field
INSERT INTO patient_clinical_events (
    patient_id,
    activity_type,           -- 'observation' or 'intervention'
    clinical_purposes,
    event_name,
    confidence_score,
    classification_metadata
) VALUES (
    $1::UUID,
    $2::TEXT,               -- From activity type classification
    $3::TEXT[],
    $4::TEXT, 
    $5::NUMERIC,            -- Classification confidence
    $6::JSONB               -- Supporting evidence and reasoning
);
```

### Downstream Table Triggers
```sql
-- Automatically populate detail tables based on activity type
CREATE OR REPLACE FUNCTION populate_clinical_details()
RETURNS TRIGGER AS $$
BEGIN
    -- If observation, prepare for patient_observations population
    IF NEW.activity_type = 'observation' THEN
        INSERT INTO patient_observation_staging (clinical_event_id, processing_status)
        VALUES (NEW.id, 'pending_extraction');
    END IF;
    
    -- If intervention, prepare for patient_interventions population  
    IF NEW.activity_type = 'intervention' THEN
        INSERT INTO patient_intervention_staging (clinical_event_id, processing_status)
        VALUES (NEW.id, 'pending_extraction');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_populate_clinical_details
    AFTER INSERT ON patient_clinical_events
    FOR EACH ROW EXECUTE FUNCTION populate_clinical_details();
```

---

## Quality Assurance and Validation

### Classification Accuracy Metrics
```yaml
target_accuracy_metrics:
  overall_classification: 90%      # Overall observation vs intervention accuracy
  high_confidence_accuracy: 95%   # Accuracy when confidence > 0.9
  medical_review_agreement: 85%   # Agreement with medical professional review
  
confidence_distribution:
  very_high_confidence: "> 0.9"   # 70% of classifications should achieve this
  high_confidence: "> 0.8"        # 85% of classifications should achieve this
  review_required: "< 0.8"        # 15% or fewer should require review

consistency_metrics:
  temporal_consistency: 95%       # Same medical facts classified consistently
  cross_document_consistency: 90% # Similar facts across documents classified same
  inter_annotator_agreement: 85%  # Multiple reviewers agree on classification
```

### Automated Validation Checks
```python
def validate_activity_classification(classification_result, medical_text):
    """Comprehensive validation of activity type classification"""
    
    validation_results = {
        'is_valid': True,
        'warnings': [],
        'errors': []
    }
    
    # Required field validation
    if not classification_result.get('activity_type'):
        validation_results['errors'].append("activity_type is required")
        validation_results['is_valid'] = False
    
    # Value validation  
    valid_types = ['observation', 'intervention']
    if classification_result.get('activity_type') not in valid_types:
        validation_results['errors'].append(f"Invalid activity_type: {classification_result.get('activity_type')}")
        validation_results['is_valid'] = False
    
    # Confidence validation
    confidence = classification_result.get('confidence', 0)
    if confidence < 0.6:
        validation_results['errors'].append("Confidence too low for reliable classification")
        validation_results['is_valid'] = False
    elif confidence < 0.8:
        validation_results['warnings'].append("Low confidence - consider manual review")
    
    # Logical consistency validation
    activity_type = classification_result.get('activity_type')
    if activity_type == 'observation':
        if any(term in medical_text.lower() for term in ['administered', 'injected', 'prescribed']):
            validation_results['warnings'].append("Observation classification with intervention language")
    elif activity_type == 'intervention':
        if any(term in medical_text.lower() for term in ['results', 'findings', 'showed']):
            validation_results['warnings'].append("Intervention classification with observation language")
    
    return validation_results
```

### Medical Professional Review Integration
```python
def queue_for_medical_review(classification_result, review_criteria):
    """Queue classification results for medical professional review"""
    
    review_record = {
        'classification_result': classification_result,
        'review_reason': determine_review_reason(classification_result),
        'priority': calculate_review_priority(classification_result),
        'medical_text': classification_result.get('source_text'),
        'ai_confidence': classification_result.get('confidence'),
        'supporting_evidence': classification_result.get('supporting_evidence'),
        'created_at': datetime.utcnow(),
        'status': 'pending_review'
    }
    
    # High priority items for immediate review
    if (classification_result.get('confidence', 0) < 0.7 or 
        'medication' in classification_result.get('source_text', '').lower()):
        review_record['priority'] = 'high'
        notify_medical_reviewers(review_record)
    
    insert_medical_review_queue(review_record)
```

---

## Implementation Examples

### Example 1: Blood Test Classification
```python
# Input medical text
medical_text = "Complete blood count performed, hemoglobin 7.2 g/dL (low)"

# Classification process
classification_result = classify_activity_type(medical_text, clinical_context={})

# Expected result
expected_classification = {
    'activity_type': 'observation',
    'confidence': 0.94,
    'supporting_evidence': [
        'Laboratory test context',
        'Results with numerical values',
        'No intervention language present'
    ],
    'reasoning': 'Blood test with results indicates information gathering activity'
}
```

### Example 2: Vaccination Classification
```python
# Input medical text
medical_text = "Influenza vaccine administered intramuscularly, 0.5ml left deltoid"

# Classification process  
classification_result = classify_activity_type(medical_text, clinical_context={})

# Expected result
expected_classification = {
    'activity_type': 'intervention',
    'confidence': 0.97,
    'supporting_evidence': [
        'Vaccine administration language',
        'Route and dosage specified', 
        'Active administration described'
    ],
    'reasoning': 'Vaccine administration directly changes patient immunity status'
}
```

### Example 3: Ambiguous Case Resolution
```python
# Input medical text (ambiguous case)
medical_text = "Cardiac catheterization showed 70% blockage in left anterior descending artery"

# Classification process
classification_result = classify_activity_type(medical_text, clinical_context={})

# Expected result (defaults to observation due to "showed" results language)
expected_classification = {
    'activity_type': 'observation',
    'confidence': 0.82,
    'requires_review': True,
    'review_reason': 'Procedure with diagnostic findings - verify classification',
    'supporting_evidence': [
        'Diagnostic findings reported',
        'Results language ("showed")',
        'Information gathering from procedure'
    ],
    'alternative_classification': {
        'activity_type': 'intervention',
        'confidence': 0.78,
        'reasoning': 'Catheterization procedure involves intervention'
    }
}
```

---

## Success Criteria

### Technical Success Metrics
- **90%+ classification accuracy** validated against medical professional review
- **95%+ accuracy for high-confidence classifications** (confidence > 0.9)
- **85%+ consistency** across similar medical concepts and documents
- **Complete database integration** with automatic downstream table population

### Clinical Validation Metrics
- **Medical professional agreement** on classification approach and results
- **Clinical workflow integration** supporting healthcare provider decision-making
- **Healthcare standards alignment** with medical terminology and practice patterns
- **Patient safety assurance** through accurate clinical data classification

### Implementation Quality Metrics
- **Comprehensive edge case handling** for ambiguous medical activities
- **Robust confidence scoring** enabling appropriate manual review thresholds
- **Efficient processing performance** suitable for real-time clinical data processing
- **Maintainable algorithm architecture** supporting continuous improvement and medical review feedback

---

*Activity type classification forms the foundation of Guardian's clinical intelligence, ensuring that every medical fact is properly understood as either information gathering (observation) or action taken (intervention), enabling accurate clinical data storage and supporting advanced healthcare features.*