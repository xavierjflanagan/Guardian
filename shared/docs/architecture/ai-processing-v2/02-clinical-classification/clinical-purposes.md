# Clinical Purposes Classification

**Database Field:** `patient_clinical_events.clinical_purposes[]`  
**O3 Framework:** Secondary Classification Axis  
**Priority:** CRITICAL - Phase 1 blocking requirement  
**Values:** `screening` | `diagnostic` | `therapeutic` | `monitoring` | `preventive`

---

## Classification Overview

Clinical purposes classification is the secondary axis of O3's two-axis clinical model, determining the healthcare intent behind each medical activity. Every clinical event can serve multiple purposes simultaneously, providing rich context for healthcare analytics, patient care coordination, and clinical decision support.

Unlike activity types (which are mutually exclusive), clinical purposes are multi-value, reflecting the reality that medical activities often serve multiple healthcare goals simultaneously.

### Core Framework
```yaml
clinical_purposes_framework:
  purpose: "Identify the healthcare intent behind medical activities"
  cardinality: "multiple"  # Can have multiple purposes per event
  database_field: "clinical_purposes TEXT[]"
  validation: "At least one purpose required"
```

---

## Clinical Purposes Classifications

### Screening
**Definition:** Activities designed to detect disease or health conditions in asymptomatic patients  
**Healthcare Context:** Population health, preventive medicine, early detection  
**Database Storage:** `'screening'`

#### Core Characteristics
```yaml
screening_characteristics:
  target_population: "Asymptomatic individuals"
  primary_goal: "Early disease detection"
  timing: "Before symptoms appear"
  healthcare_value: "Prevention and early intervention"
```

#### Screening Categories and Examples

##### Population Health Screening
```yaml
routine_health_screening:
  examples:
    - "Annual physical examination"
    - "Routine blood pressure check"
    - "General health assessment"
    - "Wellness visit evaluation"
  classification_confidence: "very_high"
  database_population: "clinical_purposes = ['screening']"

age_specific_screening:
  examples:
    - "Mammography for breast cancer screening"
    - "Colonoscopy for colorectal cancer screening"  
    - "Bone density scan for osteoporosis"
    - "PSA test for prostate cancer screening"
  classification_confidence: "very_high"
  often_combined_with: ["preventive"]

occupational_screening:
  examples:
    - "Pre-employment physical"
    - "Annual occupational health check"
    - "Hearing test for noise exposure"
    - "Vision screening for drivers"
  classification_confidence: "high"
```

##### Disease-Specific Screening Programs
```yaml
cardiovascular_screening:
  examples:
    - "Cholesterol screening in healthy adults"
    - "Blood pressure screening"
    - "Cardiac risk assessment"
    - "Electrocardiogram screening"
  classification_confidence: "high"
  multi_purpose_potential: "Often combined with monitoring"

diabetes_screening:
  examples:
    - "Glucose screening for diabetes"
    - "HbA1c screening test"
    - "Gestational diabetes screening"
    - "Pre-diabetes assessment"
  classification_confidence: "high"

cancer_screening:
  examples:
    - "Pap smear for cervical cancer"
    - "Skin cancer screening"
    - "Lung cancer screening (high-risk patients)"
    - "BRCA genetic testing"
  classification_confidence: "very_high"
```

#### Screening Classification Algorithm
```python
def classify_as_screening(clinical_event, patient_context):
    """Determine if clinical activity serves screening purpose"""
    
    screening_indicators = {
        # Language patterns indicating screening
        'screening_terms': ['screening', 'routine', 'annual', 'wellness', 'check-up'],
        'asymptomatic_context': ['routine', 'preventive', 'annual', 'baseline'],
        'population_terms': ['population', 'community', 'occupational', 'school'],
        
        # Age-specific screening indicators
        'age_screening': ['mammography', 'colonoscopy', 'bone density', 'PSA'],
        'routine_procedures': ['pap smear', 'blood pressure check', 'cholesterol test'],
        
        # Timing indicators
        'scheduled_timing': ['annual', 'biennial', 'routine', 'scheduled'],
        'asymptomatic_indicators': ['no symptoms', 'feeling well', 'routine check']
    }
    
    confidence_score = calculate_screening_confidence(
        clinical_event.event_name, 
        clinical_event.source_text, 
        patient_context,
        screening_indicators
    )
    
    return {
        'purpose': 'screening',
        'confidence': confidence_score,
        'supporting_evidence': extract_screening_evidence(clinical_event, screening_indicators),
        'screening_type': determine_screening_type(clinical_event)
    }

def calculate_screening_confidence(event_name, source_text, patient_context, indicators):
    """Calculate confidence that activity serves screening purpose"""
    
    confidence_factors = []
    
    # Strong indicators for screening
    combined_text = f"{event_name} {source_text}".lower()
    
    # Explicit screening language (very strong)
    if any(term in combined_text for term in indicators['screening_terms']):
        confidence_factors.append(0.4)
    
    # Asymptomatic context (strong)  
    if any(term in combined_text for term in indicators['asymptomatic_context']):
        confidence_factors.append(0.3)
    
    # Age-appropriate screening procedures (strong)
    if any(term in combined_text for term in indicators['age_screening']):
        confidence_factors.append(0.35)
    
    # Patient context factors
    if patient_context.get('has_symptoms', False) == False:
        confidence_factors.append(0.2)  # Asymptomatic patient
    
    if patient_context.get('visit_type') == 'routine':
        confidence_factors.append(0.25)
    
    # Calculate base confidence
    base_confidence = min(sum(confidence_factors), 0.95)
    
    # Reduce confidence if diagnostic language present
    if any(term in combined_text for term in ['symptoms', 'complaint', 'problem']):
        base_confidence *= 0.7
    
    return base_confidence
```

---

### Diagnostic  
**Definition:** Activities aimed at determining the cause of symptoms or investigating suspected conditions  
**Healthcare Context:** Symptom evaluation, differential diagnosis, condition confirmation  
**Database Storage:** `'diagnostic'`

#### Core Characteristics
```yaml
diagnostic_characteristics:
  target_population: "Symptomatic patients or those with suspected conditions"
  primary_goal: "Determine cause of symptoms or confirm/rule out conditions"
  timing: "After symptoms appear or when condition suspected"
  healthcare_value: "Accurate diagnosis for targeted treatment"
```

#### Diagnostic Categories and Examples

##### Symptom Investigation
```yaml
symptom_workup:
  examples:
    - "CBC for fatigue evaluation"
    - "Chest X-ray for shortness of breath"
    - "Urinalysis for urinary symptoms"
    - "Thyroid function tests for weight changes"
  classification_confidence: "high"
  often_combined_with: ["monitoring"]

pain_evaluation:
  examples:
    - "MRI for back pain evaluation"
    - "EKG for chest pain workup"
    - "CT scan for abdominal pain"
    - "Joint X-ray for joint pain"
  classification_confidence: "very_high"
  
acute_symptom_diagnosis:
  examples:
    - "Blood tests for fever workup"
    - "Throat culture for sore throat"
    - "Urine culture for UTI symptoms"
    - "Stool analysis for diarrhea"
  classification_confidence: "very_high"
```

##### Condition Confirmation
```yaml
diagnostic_confirmation:
  examples:
    - "Glucose tolerance test for suspected diabetes"
    - "Stress test for suspected coronary disease"
    - "Biopsy for suspected cancer"
    - "Sleep study for suspected sleep apnea"
  classification_confidence: "very_high"

differential_diagnosis:
  examples:
    - "Autoimmune panel for joint pain"
    - "Cardiac enzymes for chest pain"
    - "Lumbar puncture for neurological symptoms"
    - "Allergy testing for respiratory symptoms"
  classification_confidence: "high"
```

#### Diagnostic Classification Algorithm
```python
def classify_as_diagnostic(clinical_event, clinical_context):
    """Determine if clinical activity serves diagnostic purpose"""
    
    diagnostic_indicators = {
        # Symptom-related language
        'symptom_terms': ['symptoms', 'complaint', 'problem', 'pain', 'discomfort'],
        'evaluation_terms': ['evaluate', 'investigate', 'workup', 'assess', 'rule out'],
        'diagnostic_terms': ['diagnose', 'confirm', 'suspect', 'differential'],
        
        # Clinical contexts suggesting diagnosis
        'acute_contexts': ['acute', 'sudden onset', 'new symptoms', 'worsening'],
        'investigation_contexts': ['suspected', 'possible', 'rule out', 'confirm'],
        
        # Diagnostic procedures
        'diagnostic_procedures': ['biopsy', 'culture', 'panel', 'workup', 'study']
    }
    
    confidence_score = calculate_diagnostic_confidence(
        clinical_event.event_name,
        clinical_event.source_text,
        clinical_context,
        diagnostic_indicators
    )
    
    return {
        'purpose': 'diagnostic',
        'confidence': confidence_score,
        'supporting_evidence': extract_diagnostic_evidence(clinical_event, diagnostic_indicators),
        'diagnostic_type': determine_diagnostic_type(clinical_event, clinical_context)
    }

def calculate_diagnostic_confidence(event_name, source_text, context, indicators):
    """Calculate confidence that activity serves diagnostic purpose"""
    
    confidence_factors = []
    
    combined_text = f"{event_name} {source_text}".lower()
    
    # Strong diagnostic indicators
    if any(term in combined_text for term in indicators['symptom_terms']):
        confidence_factors.append(0.4)  # Symptom presence
    
    if any(term in combined_text for term in indicators['evaluation_terms']):
        confidence_factors.append(0.35)  # Evaluation language
    
    if any(term in combined_text for term in indicators['diagnostic_terms']):
        confidence_factors.append(0.3)  # Diagnostic intent
    
    # Clinical context factors
    if context.get('patient_symptomatic', False):
        confidence_factors.append(0.25)
    
    if context.get('suspected_condition'):
        confidence_factors.append(0.3)
    
    if context.get('visit_type') in ['urgent', 'problem-focused']:
        confidence_factors.append(0.2)
    
    # Calculate base confidence
    base_confidence = min(sum(confidence_factors), 0.95)
    
    # Boost confidence for clear diagnostic procedures
    if any(term in combined_text for term in indicators['diagnostic_procedures']):
        base_confidence = min(base_confidence + 0.1, 0.95)
    
    return base_confidence
```

---

### Therapeutic
**Definition:** Activities aimed at treating existing conditions or providing medical therapy  
**Healthcare Context:** Treatment delivery, condition management, therapeutic interventions  
**Database Storage:** `'therapeutic'`

#### Core Characteristics
```yaml
therapeutic_characteristics:
  target_population: "Patients with diagnosed conditions requiring treatment"
  primary_goal: "Treat existing conditions and improve health outcomes"
  timing: "After diagnosis, during active treatment phase"
  healthcare_value: "Condition improvement and symptom relief"
```

#### Therapeutic Categories and Examples

##### Medication Therapy
```yaml
pharmacological_treatment:
  examples:
    - "Antibiotic prescription for bacterial infection"
    - "Insulin therapy for diabetes management"
    - "Blood pressure medication adjustment"
    - "Pain medication for chronic pain"
  classification_confidence: "very_high"
  often_combined_with: ["monitoring"]

chronic_disease_therapy:
  examples:
    - "Cholesterol medication for cardiovascular disease"
    - "Inhaler therapy for asthma"
    - "Hormone replacement therapy"
    - "Chemotherapy for cancer treatment"
  classification_confidence: "very_high"
```

##### Procedural Therapy
```yaml
therapeutic_procedures:
  examples:
    - "Physical therapy for injury rehabilitation"
    - "Wound care treatment"
    - "Joint injection for arthritis"
    - "Dialysis for kidney disease"
  classification_confidence: "very_high"

surgical_treatment:
  examples:
    - "Appendectomy for appendicitis"
    - "Cataract surgery"
    - "Cardiac bypass surgery"
    - "Joint replacement surgery"
  classification_confidence: "very_high"
```

#### Therapeutic Classification Algorithm
```python
def classify_as_therapeutic(clinical_event, treatment_context):
    """Determine if clinical activity serves therapeutic purpose"""
    
    therapeutic_indicators = {
        # Treatment language
        'treatment_terms': ['treatment', 'therapy', 'manage', 'treat', 'medication'],
        'therapeutic_actions': ['prescribed', 'administered', 'given', 'injected'],
        'improvement_terms': ['improve', 'relief', 'control', 'stabilize'],
        
        # Therapeutic contexts
        'active_treatment': ['ongoing', 'continue', 'adjust', 'increase', 'decrease'],
        'therapeutic_procedures': ['surgery', 'procedure', 'intervention', 'therapy'],
        
        # Medication indicators
        'medication_context': ['dose', 'mg', 'ml', 'prescription', 'refill']
    }
    
    confidence_score = calculate_therapeutic_confidence(
        clinical_event.event_name,
        clinical_event.source_text,
        treatment_context,
        therapeutic_indicators
    )
    
    return {
        'purpose': 'therapeutic',
        'confidence': confidence_score,
        'supporting_evidence': extract_therapeutic_evidence(clinical_event, therapeutic_indicators),
        'treatment_type': determine_treatment_type(clinical_event)
    }
```

---

### Monitoring
**Definition:** Activities aimed at tracking existing conditions, treatment responses, or ongoing health status  
**Healthcare Context:** Chronic disease management, treatment follow-up, condition surveillance  
**Database Storage:** `'monitoring'`

#### Core Characteristics
```yaml
monitoring_characteristics:
  target_population: "Patients with known conditions or undergoing treatment"
  primary_goal: "Track condition status and treatment effectiveness"
  timing: "Ongoing during chronic condition management or treatment follow-up"
  healthcare_value: "Early detection of changes and treatment optimization"
```

#### Monitoring Categories and Examples

##### Chronic Disease Monitoring
```yaml
diabetes_monitoring:
  examples:
    - "HbA1c for diabetes control monitoring"
    - "Blood glucose monitoring"
    - "Diabetic eye examination"
    - "Diabetic foot assessment"
  classification_confidence: "very_high"
  often_combined_with: ["therapeutic"]

cardiovascular_monitoring:
  examples:
    - "Blood pressure monitoring in hypertensive patient"
    - "Cholesterol monitoring on statin therapy"
    - "Heart rate monitoring with cardiac condition"
    - "Anticoagulation monitoring"
  classification_confidence: "high"
```

##### Treatment Response Monitoring
```yaml
medication_monitoring:
  examples:
    - "Liver function tests on hepatotoxic medication"
    - "Kidney function monitoring with nephrotoxic drugs"
    - "INR monitoring on warfarin therapy"
    - "Therapeutic drug level monitoring"
  classification_confidence: "very_high"

therapy_follow_up:
  examples:
    - "Post-surgical follow-up examination"
    - "Cancer treatment response monitoring"
    - "Physical therapy progress assessment"
    - "Mental health therapy follow-up"
  classification_confidence: "high"
```

#### Monitoring Classification Algorithm
```python
def classify_as_monitoring(clinical_event, patient_history):
    """Determine if clinical activity serves monitoring purpose"""
    
    monitoring_indicators = {
        # Monitoring language
        'monitoring_terms': ['monitor', 'follow-up', 'track', 'surveillance', 'watch'],
        'ongoing_terms': ['ongoing', 'routine', 'regular', 'periodic', 'serial'],
        'status_terms': ['status', 'control', 'response', 'progress', 'stability'],
        
        # Clinical contexts
        'chronic_conditions': ['diabetes', 'hypertension', 'heart disease', 'cancer'],
        'treatment_contexts': ['on medication', 'post-operative', 'under treatment'],
        
        # Temporal indicators
        'repeat_testing': ['repeat', 'follow-up', 'recheck', 'serial', 'trend']
    }
    
    confidence_score = calculate_monitoring_confidence(
        clinical_event.event_name,
        clinical_event.source_text,
        patient_history,
        monitoring_indicators
    )
    
    return {
        'purpose': 'monitoring',
        'confidence': confidence_score,
        'supporting_evidence': extract_monitoring_evidence(clinical_event, monitoring_indicators),
        'monitoring_type': determine_monitoring_type(clinical_event, patient_history)
    }
```

---

### Preventive
**Definition:** Activities aimed at preventing disease or health problems from occurring  
**Healthcare Context:** Primary prevention, health promotion, risk reduction  
**Database Storage:** `'preventive'`

#### Core Characteristics
```yaml
preventive_characteristics:
  target_population: "At-risk individuals or general population"
  primary_goal: "Prevent disease occurrence or health problems"
  timing: "Before disease development"
  healthcare_value: "Risk reduction and health maintenance"
```

#### Preventive Categories and Examples

##### Immunizations and Vaccinations
```yaml
routine_vaccinations:
  examples:
    - "Annual influenza vaccination"
    - "COVID-19 vaccination"
    - "Childhood immunization series"
    - "Travel vaccinations"
  classification_confidence: "very_high"
  often_combined_with: ["screening"]

targeted_immunizations:
  examples:
    - "Pneumococcal vaccine for elderly"
    - "HPV vaccine for adolescents"
    - "Hepatitis B vaccine for healthcare workers"
    - "Shingles vaccine for adults over 50"
  classification_confidence: "very_high"
```

##### Health Promotion Activities
```yaml
lifestyle_interventions:
  examples:
    - "Smoking cessation counseling"
    - "Nutrition counseling for weight management"
    - "Exercise prescription for cardiovascular health"
    - "Alcohol abuse counseling"
  classification_confidence: "high"
  often_combined_with: ["therapeutic"]

risk_reduction_measures:
  examples:
    - "Fall prevention assessment"
    - "Osteoporosis prevention counseling"
    - "Skin protection education"
    - "Accident prevention counseling"
  classification_confidence: "high"
```

#### Preventive Classification Algorithm
```python
def classify_as_preventive(clinical_event, risk_context):
    """Determine if clinical activity serves preventive purpose"""
    
    preventive_indicators = {
        # Prevention language
        'prevention_terms': ['prevent', 'prevention', 'prophylaxis', 'protective'],
        'vaccination_terms': ['vaccine', 'vaccination', 'immunization', 'shot'],
        'health_promotion': ['counseling', 'education', 'lifestyle', 'wellness'],
        
        # Risk-based contexts
        'risk_contexts': ['high-risk', 'prevention', 'prophylactic', 'protective'],
        'health_maintenance': ['maintain', 'promote', 'enhance', 'optimize'],
        
        # Specific preventive interventions
        'preventive_procedures': ['vaccination', 'counseling', 'screening', 'assessment']
    }
    
    confidence_score = calculate_preventive_confidence(
        clinical_event.event_name,
        clinical_event.source_text,
        risk_context,
        preventive_indicators
    )
    
    return {
        'purpose': 'preventive',
        'confidence': confidence_score,
        'supporting_evidence': extract_preventive_evidence(clinical_event, preventive_indicators),
        'prevention_type': determine_prevention_type(clinical_event)
    }
```

---

## Multi-Purpose Classification Framework

### Clinical Events with Multiple Purposes
Many clinical activities serve multiple purposes simultaneously. The AI must identify all applicable purposes and assign appropriate confidence scores.

#### Common Multi-Purpose Combinations
```yaml
screening_and_monitoring:
  example: "Blood pressure check in hypertensive patient during routine visit"
  purposes: ["screening", "monitoring"]
  reasoning: "Screening for complications + monitoring known condition"

diagnostic_and_monitoring:
  example: "HbA1c test for diabetes symptom evaluation in known diabetic"
  purposes: ["diagnostic", "monitoring"]  
  reasoning: "Investigating symptoms + monitoring chronic condition"

therapeutic_and_monitoring:
  example: "Blood pressure medication adjustment with BP measurement"
  purposes: ["therapeutic", "monitoring"]
  reasoning: "Treatment modification + monitoring response"

preventive_and_screening:
  example: "Mammography in asymptomatic 50-year-old woman"
  purposes: ["preventive", "screening"]
  reasoning: "Cancer prevention + early detection screening"
```

#### Multi-Purpose Classification Algorithm
```python
def classify_multiple_purposes(clinical_event, comprehensive_context):
    """Identify all applicable clinical purposes for a medical activity"""
    
    all_purposes = []
    
    # Test each purpose independently
    screening_result = classify_as_screening(clinical_event, comprehensive_context)
    if screening_result['confidence'] >= 0.7:
        all_purposes.append(screening_result)
    
    diagnostic_result = classify_as_diagnostic(clinical_event, comprehensive_context)
    if diagnostic_result['confidence'] >= 0.7:
        all_purposes.append(diagnostic_result)
    
    therapeutic_result = classify_as_therapeutic(clinical_event, comprehensive_context)
    if therapeutic_result['confidence'] >= 0.7:
        all_purposes.append(therapeutic_result)
    
    monitoring_result = classify_as_monitoring(clinical_event, comprehensive_context)
    if monitoring_result['confidence'] >= 0.7:
        all_purposes.append(monitoring_result)
    
    preventive_result = classify_as_preventive(clinical_event, comprehensive_context)
    if preventive_result['confidence'] >= 0.7:
        all_purposes.append(preventive_result)
    
    # Validate logical consistency of multi-purpose assignments
    validated_purposes = validate_purpose_combinations(all_purposes, clinical_event)
    
    return {
        'clinical_purposes': [p['purpose'] for p in validated_purposes],
        'purpose_confidence_scores': {p['purpose']: p['confidence'] for p in validated_purposes},
        'multi_purpose_reasoning': generate_multi_purpose_reasoning(validated_purposes),
        'requires_review': len(validated_purposes) == 0 or any(p['confidence'] < 0.8 for p in validated_purposes)
    }

def validate_purpose_combinations(purposes, clinical_event):
    """Validate that purpose combinations are clinically logical"""
    
    # Remove logically inconsistent combinations
    filtered_purposes = []
    
    purpose_names = [p['purpose'] for p in purposes]
    
    # Screening and diagnostic are often mutually exclusive for same test
    if 'screening' in purpose_names and 'diagnostic' in purpose_names:
        # Keep the one with higher confidence
        screening_conf = next(p['confidence'] for p in purposes if p['purpose'] == 'screening')
        diagnostic_conf = next(p['confidence'] for p in purposes if p['purpose'] == 'diagnostic')
        
        if abs(screening_conf - diagnostic_conf) < 0.1:
            # Too close - needs manual review
            for p in purposes:
                if p['purpose'] in ['screening', 'diagnostic']:
                    p['requires_review'] = True
            filtered_purposes = purposes
        else:
            # Keep higher confidence purpose
            filtered_purposes = [p for p in purposes if not (
                p['purpose'] in ['screening', 'diagnostic'] and 
                p['confidence'] < max(screening_conf, diagnostic_conf)
            )]
    else:
        filtered_purposes = purposes
    
    return filtered_purposes
```

---

## Database Integration Specifications

### patient_clinical_events Table Integration
```sql
-- Clinical purposes are stored as array for multi-purpose support
ALTER TABLE patient_clinical_events 
ADD COLUMN clinical_purposes TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN purpose_confidence_scores JSONB,
ADD COLUMN multi_purpose_reasoning TEXT,
ADD CONSTRAINT valid_clinical_purposes 
  CHECK (array_length(clinical_purposes, 1) > 0 AND 
         array_length(clinical_purposes, 1) <= 5);

-- Create index for efficient purpose-based queries
CREATE INDEX idx_patient_clinical_events_purposes 
ON patient_clinical_events 
USING GIN (clinical_purposes);

-- Example insert with multiple purposes
INSERT INTO patient_clinical_events (
    patient_id, 
    activity_type, 
    clinical_purposes, 
    event_name,
    purpose_confidence_scores,
    multi_purpose_reasoning
) VALUES (
    $1, 
    'observation',
    ARRAY['screening', 'monitoring']::TEXT[],
    'Blood pressure measurement during routine visit',
    '{"screening": 0.85, "monitoring": 0.82}'::JSONB,
    'Routine screening for new patients with monitoring of previously elevated readings'
);
```

### Purpose-Based Analytics Views
```sql
-- Create analytics views for purpose-based queries
CREATE VIEW clinical_events_by_purpose AS
SELECT 
    patient_id,
    unnest(clinical_purposes) as clinical_purpose,
    activity_type,
    event_name,
    event_date,
    COUNT(*) OVER (PARTITION BY patient_id, unnest(clinical_purposes)) as purpose_count
FROM patient_clinical_events;

-- Function for purpose-based event filtering
CREATE OR REPLACE FUNCTION get_events_by_purpose(
    p_patient_id UUID,
    p_purposes TEXT[],
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    activity_type TEXT,
    clinical_purposes TEXT[],
    event_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pce.id,
        pce.event_name,
        pce.activity_type, 
        pce.clinical_purposes,
        pce.event_date
    FROM patient_clinical_events pce
    WHERE pce.patient_id = p_patient_id
      AND (p_purposes IS NULL OR pce.clinical_purposes && p_purposes)
      AND (p_date_range_start IS NULL OR pce.event_date >= p_date_range_start)
      AND (p_date_range_end IS NULL OR pce.event_date <= p_date_range_end)
    ORDER BY pce.event_date DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## Quality Assurance and Validation

### Purpose Classification Accuracy Metrics
```yaml
target_accuracy_metrics:
  single_purpose_accuracy: 92%        # Accuracy for events with one clear purpose
  multi_purpose_accuracy: 85%         # Accuracy for events with multiple purposes  
  purpose_completeness: 90%           # All applicable purposes identified
  medical_professional_agreement: 87% # Agreement with clinical reviewers

confidence_distribution_targets:
  high_confidence_single: 80%         # Single purpose events > 0.9 confidence
  high_confidence_multi: 65%          # Multi-purpose events > 0.8 confidence
  manual_review_rate: 15%             # Events requiring review
```

### Automated Quality Validation
```python
def validate_clinical_purposes_quality(classified_events):
    """Comprehensive validation of clinical purposes classification"""
    
    validation_metrics = {
        'total_events': len(classified_events),
        'single_purpose_events': 0,
        'multi_purpose_events': 0,
        'high_confidence_single': 0,
        'high_confidence_multi': 0,
        'requires_review': 0,
        'purpose_distribution': {},
        'common_combinations': {}
    }
    
    for event in classified_events:
        # Count purpose distribution
        num_purposes = len(event.clinical_purposes)
        if num_purposes == 1:
            validation_metrics['single_purpose_events'] += 1
            purpose = event.clinical_purposes[0]
            confidence = event.purpose_confidence_scores.get(purpose, 0)
            if confidence >= 0.9:
                validation_metrics['high_confidence_single'] += 1
        else:
            validation_metrics['multi_purpose_events'] += 1
            avg_confidence = np.mean(list(event.purpose_confidence_scores.values()))
            if avg_confidence >= 0.8:
                validation_metrics['high_confidence_multi'] += 1
        
        # Track purpose combinations
        if num_purposes > 1:
            combination = tuple(sorted(event.clinical_purposes))
            if combination not in validation_metrics['common_combinations']:
                validation_metrics['common_combinations'][combination] = 0
            validation_metrics['common_combinations'][combination] += 1
        
        # Count review requirements
        if event.requires_review:
            validation_metrics['requires_review'] += 1
        
        # Track individual purpose distribution
        for purpose in event.clinical_purposes:
            if purpose not in validation_metrics['purpose_distribution']:
                validation_metrics['purpose_distribution'][purpose] = 0
            validation_metrics['purpose_distribution'][purpose] += 1
    
    # Calculate percentages
    validation_metrics['single_purpose_percentage'] = (
        validation_metrics['single_purpose_events'] / validation_metrics['total_events'] * 100
    )
    validation_metrics['multi_purpose_percentage'] = (
        validation_metrics['multi_purpose_events'] / validation_metrics['total_events'] * 100
    )
    validation_metrics['review_rate'] = (
        validation_metrics['requires_review'] / validation_metrics['total_events'] * 100
    )
    
    return validation_metrics
```

---

## Implementation Examples

### Example 1: Multi-Purpose Blood Pressure Check
```python
# Input: Blood pressure measurement in routine visit for hypertensive patient
clinical_event = {
    'event_name': 'Blood pressure measurement',
    'source_text': 'Routine blood pressure check: 140/90 mmHg during annual physical',
    'activity_type': 'observation',
    'patient_context': {
        'has_hypertension': True,
        'visit_type': 'routine_annual',
        'symptoms': None
    }
}

# AI classification result
classification_result = {
    'clinical_purposes': ['screening', 'monitoring'],
    'purpose_confidence_scores': {
        'screening': 0.83,  # Routine annual screening component
        'monitoring': 0.88  # Known hypertension monitoring
    },
    'multi_purpose_reasoning': 'Annual screening for cardiovascular risk with monitoring of known hypertension',
    'requires_review': False
}
```

### Example 2: Single-Purpose Diagnostic Test
```python
# Input: Specific diagnostic test for symptom evaluation
clinical_event = {
    'event_name': 'Throat culture',
    'source_text': 'Throat culture ordered for persistent sore throat and fever',
    'activity_type': 'observation',
    'patient_context': {
        'symptoms': ['sore throat', 'fever'],
        'visit_type': 'problem-focused',
        'duration': '5 days'
    }
}

# AI classification result  
classification_result = {
    'clinical_purposes': ['diagnostic'],
    'purpose_confidence_scores': {
        'diagnostic': 0.94
    },
    'multi_purpose_reasoning': 'Clear diagnostic intent for symptomatic patient',
    'requires_review': False
}
```

### Example 3: Preventive Vaccination
```python
# Input: Routine vaccination
clinical_event = {
    'event_name': 'Influenza vaccination',
    'source_text': 'Annual flu shot administered intramuscularly',
    'activity_type': 'intervention',
    'patient_context': {
        'symptoms': None,
        'visit_type': 'preventive',
        'high_risk_factors': ['elderly', 'chronic_conditions']
    }
}

# AI classification result
classification_result = {
    'clinical_purposes': ['preventive'],
    'purpose_confidence_scores': {
        'preventive': 0.97
    },
    'multi_purpose_reasoning': 'Primary prevention of influenza infection',
    'requires_review': False
}
```

---

## Success Criteria

### Technical Success Metrics
- **90%+ single-purpose accuracy** for events with one clear clinical purpose
- **85%+ multi-purpose accuracy** for events serving multiple healthcare goals
- **Complete purpose identification** ensuring no applicable purposes are missed
- **Logical purpose combinations** validated for clinical consistency

### Clinical Validation Metrics
- **Medical professional agreement** on purpose classification approach and results
- **Healthcare workflow integration** supporting clinical decision-making processes
- **Care coordination enhancement** through purpose-based event organization
- **Analytics enablement** supporting population health and quality metrics

### Implementation Quality Metrics
- **Robust multi-purpose handling** for complex clinical scenarios
- **Confidence-based review workflows** enabling appropriate human oversight
- **Performance optimization** suitable for real-time clinical data processing
- **Continuous improvement** incorporating medical professional feedback

---

*Clinical purposes classification provides the essential healthcare context that transforms Guardian's clinical events from simple activity records into purpose-driven healthcare intelligence, enabling advanced care coordination, clinical analytics, and patient-centered healthcare delivery.*