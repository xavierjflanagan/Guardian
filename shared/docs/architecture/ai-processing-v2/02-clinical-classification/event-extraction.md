# Medical Event Extraction and Normalization

**Database Fields:** `event_name`, `method`, `body_site`, `snomed_code`, `loinc_code`, `cpt_code`  
**Framework:** Clinical concept normalization and healthcare standards integration  
**Priority:** CRITICAL - Phase 1 blocking requirement  
**Purpose:** Extract and standardize medical concepts for structured clinical data storage

---

## Overview

Medical event extraction transforms raw medical text into structured, normalized clinical concepts that populate Guardian's database with standardized terminology. This process ensures consistent data representation, enables clinical analytics, and supports healthcare interoperability through standard medical coding systems.

### Core Processing Pipeline
```yaml
event_extraction_pipeline:
  input: "Raw medical text from documents"
  output: "Normalized clinical events with standard codes"
  components:
    - "Event name standardization"
    - "Method identification and categorization" 
    - "Anatomical site extraction and normalization"
    - "Healthcare standards code assignment"
  validation: "Clinical accuracy and coding standards compliance"
```

---

## Event Name Standardization

### Medical Concept Identification
Event names must be extracted and normalized to consistent medical terminology that supports clinical decision-making and healthcare analytics.

#### Event Name Categories

##### Laboratory Tests and Measurements
```yaml
laboratory_events:
  pattern: "Test name + specimen type + measurement"
  examples:
    raw_text: "CBC with diff"
    normalized: "Complete Blood Count with Differential"
    
    raw_text: "Hgb"  
    normalized: "Hemoglobin Measurement"
    
    raw_text: "Glucose finger stick"
    normalized: "Blood Glucose Point-of-Care Testing"
    
  standardization_rules:
    - "Expand common abbreviations (CBC → Complete Blood Count)"
    - "Include specimen type when relevant" 
    - "Specify measurement method when significant"
    - "Use full medical terminology over colloquialisms"
```

##### Imaging and Diagnostic Procedures
```yaml
imaging_events:
  pattern: "Imaging modality + anatomical site + purpose"
  examples:
    raw_text: "Chest X-ray"
    normalized: "Chest Radiography"
    
    raw_text: "Brain MRI with contrast"
    normalized: "Brain Magnetic Resonance Imaging with Contrast"
    
    raw_text: "Echo"
    normalized: "Echocardiogram"
    
  standardization_rules:
    - "Use full imaging modality names"
    - "Specify anatomical regions clearly"
    - "Include contrast/technique when mentioned"
    - "Distinguish between screening and diagnostic imaging"
```

##### Procedures and Interventions  
```yaml
procedure_events:
  pattern: "Procedure type + anatomical site + approach"
  examples:
    raw_text: "Flu shot"
    normalized: "Influenza Vaccination"
    
    raw_text: "Appendectomy lap"
    normalized: "Laparoscopic Appendectomy"
    
    raw_text: "Sutures to hand laceration"
    normalized: "Suture Repair of Hand Laceration"
    
  standardization_rules:
    - "Use formal procedure terminology"
    - "Specify surgical approach when relevant"
    - "Include anatomical site specificity"
    - "Normalize medication administration terms"
```

#### Event Name Extraction Algorithm
```python
class MedicalEventNameExtractor:
    def __init__(self):
        self.medical_abbreviations = load_medical_abbreviation_dictionary()
        self.standard_terminology = load_standard_medical_terminology()
        
    def extract_and_normalize_event_name(self, medical_text):
        """Extract and normalize medical event name from raw text"""
        
        # Step 1: Identify potential medical events
        event_candidates = self.identify_medical_events(medical_text)
        
        # Step 2: Normalize each candidate
        normalized_events = []
        for candidate in event_candidates:
            normalized_event = self.normalize_medical_term(candidate)
            if normalized_event:
                normalized_events.append(normalized_event)
        
        # Step 3: Select primary event
        primary_event = self.select_primary_event(normalized_events, medical_text)
        
        return {
            'event_name': primary_event['normalized_name'],
            'raw_text': primary_event['raw_text'],
            'confidence': primary_event['confidence'],
            'alternative_names': [e['normalized_name'] for e in normalized_events[1:]]
        }
    
    def normalize_medical_term(self, raw_term):
        """Normalize medical terminology using standardization rules"""
        
        # Expand common abbreviations
        expanded_term = self.expand_abbreviations(raw_term)
        
        # Apply medical terminology standards
        standardized_term = self.apply_standardization_rules(expanded_term)
        
        # Validate against medical terminology database
        validation_result = self.validate_medical_terminology(standardized_term)
        
        return {
            'raw_text': raw_term,
            'normalized_name': standardized_term,
            'confidence': validation_result['confidence'],
            'terminology_source': validation_result['source']
        }
    
    def expand_abbreviations(self, medical_text):
        """Expand medical abbreviations to full terms"""
        
        expanded_text = medical_text
        
        # Common laboratory abbreviations
        lab_expansions = {
            'CBC': 'Complete Blood Count',
            'BMP': 'Basic Metabolic Panel', 
            'CMP': 'Comprehensive Metabolic Panel',
            'TSH': 'Thyroid Stimulating Hormone',
            'Hgb': 'Hemoglobin',
            'Hct': 'Hematocrit',
            'WBC': 'White Blood Cell Count'
        }
        
        # Imaging abbreviations
        imaging_expansions = {
            'CXR': 'Chest X-ray',
            'CT': 'Computed Tomography',
            'MRI': 'Magnetic Resonance Imaging',
            'US': 'Ultrasound',
            'Echo': 'Echocardiogram'
        }
        
        # Apply expansions
        all_expansions = {**lab_expansions, **imaging_expansions}
        for abbrev, full_term in all_expansions.items():
            if abbrev.lower() in expanded_text.lower():
                expanded_text = re.sub(
                    r'\b' + re.escape(abbrev) + r'\b', 
                    full_term, 
                    expanded_text, 
                    flags=re.IGNORECASE
                )
        
        return expanded_text
```

---

## Method Identification and Classification

### Medical Method Categories
Methods describe how medical activities are performed, providing essential context for clinical interpretation and coding.

#### Core Method Classifications
```yaml
laboratory_methods:
  blood_test:
    description: "Blood specimen analysis"
    examples: ["blood draw", "venipuncture", "capillary stick"]
    database_value: "laboratory_blood"
    
  urine_test:
    description: "Urine specimen analysis"
    examples: ["urine collection", "clean catch", "catheter specimen"]
    database_value: "laboratory_urine"
    
  tissue_analysis:
    description: "Tissue or fluid specimen analysis"  
    examples: ["biopsy", "culture", "cytology"]
    database_value: "laboratory_tissue"

imaging_methods:
  radiography:
    description: "X-ray imaging"
    examples: ["X-ray", "plain radiography", "fluoroscopy"]
    database_value: "imaging_xray"
    
  cross_sectional:
    description: "Cross-sectional imaging"
    examples: ["CT scan", "MRI", "ultrasound"]
    database_value: "imaging_cross_sectional"
    
  nuclear_medicine:
    description: "Nuclear imaging studies"
    examples: ["PET scan", "bone scan", "nuclear stress test"]
    database_value: "imaging_nuclear"

physical_examination_methods:
  inspection:
    description: "Visual examination"
    examples: ["visual inspection", "observation", "appearance assessment"]
    database_value: "physical_exam_inspection"
    
  palpation:
    description: "Physical touch examination"
    examples: ["palpation", "physical touch", "manual examination"]
    database_value: "physical_exam_palpation"
    
  auscultation:
    description: "Listening examination"
    examples: ["stethoscope", "heart sounds", "lung sounds"]
    database_value: "physical_exam_auscultation"

intervention_methods:
  injection:
    description: "Medication or substance injection"
    examples: ["intramuscular", "intravenous", "subcutaneous"]
    database_value: "injection"
    
  surgical_procedure:
    description: "Surgical intervention"
    examples: ["incision", "laparoscopic", "minimally invasive"]
    database_value: "surgical"
    
  medication_administration:
    description: "Non-injection medication delivery"
    examples: ["oral", "topical", "inhaled", "rectal"]
    database_value: "medication"
```

#### Method Extraction Algorithm
```python
class MethodExtractor:
    def __init__(self):
        self.method_patterns = self.load_method_patterns()
        self.method_mappings = self.load_method_mappings()
    
    def extract_method(self, medical_text, event_name):
        """Extract method from medical text and event context"""
        
        method_candidates = []
        
        # Pattern-based method detection
        for method_category, patterns in self.method_patterns.items():
            for pattern in patterns:
                if re.search(pattern, medical_text, re.IGNORECASE):
                    confidence = self.calculate_method_confidence(pattern, medical_text)
                    method_candidates.append({
                        'method': method_category,
                        'confidence': confidence,
                        'supporting_text': self.extract_supporting_text(pattern, medical_text)
                    })
        
        # Event name-based method inference
        inferred_method = self.infer_method_from_event_name(event_name)
        if inferred_method:
            method_candidates.append(inferred_method)
        
        # Select best method candidate
        best_method = self.select_best_method(method_candidates)
        
        return {
            'method': best_method['method'],
            'confidence': best_method['confidence'],
            'extraction_source': best_method.get('source', 'pattern_matching'),
            'alternative_methods': [m['method'] for m in method_candidates[1:]]
        }
    
    def infer_method_from_event_name(self, event_name):
        """Infer method from standardized event name"""
        
        event_lower = event_name.lower()
        
        # Laboratory test inference
        if any(term in event_lower for term in ['blood', 'serum', 'plasma']):
            return {'method': 'laboratory_blood', 'confidence': 0.85, 'source': 'event_name_inference'}
        
        if any(term in event_lower for term in ['urine', 'urinalysis']):
            return {'method': 'laboratory_urine', 'confidence': 0.85, 'source': 'event_name_inference'}
        
        # Imaging inference
        if any(term in event_lower for term in ['x-ray', 'radiography']):
            return {'method': 'imaging_xray', 'confidence': 0.90, 'source': 'event_name_inference'}
        
        if any(term in event_lower for term in ['ct', 'mri', 'ultrasound']):
            return {'method': 'imaging_cross_sectional', 'confidence': 0.90, 'source': 'event_name_inference'}
        
        # Injection inference
        if any(term in event_lower for term in ['vaccination', 'injection', 'shot']):
            return {'method': 'injection', 'confidence': 0.88, 'source': 'event_name_inference'}
        
        return None
```

---

## Anatomical Site Extraction

### Body Site Normalization Framework
Anatomical sites must be extracted and normalized to support precise clinical documentation and enable anatomical-based analytics.

#### Anatomical Site Categories
```yaml
head_neck_sites:
  head:
    examples: ["head", "skull", "scalp"]
    normalized: "head"
    
  face:
    examples: ["face", "facial", "forehead"]
    normalized: "face"
    
  neck:
    examples: ["neck", "cervical", "throat"]
    normalized: "neck"
    
  ear:
    examples: ["ear", "otic", "auditory"]
    laterality: ["left_ear", "right_ear", "bilateral_ears"]
    normalized: "ear"

torso_sites:
  chest:
    examples: ["chest", "thorax", "thoracic"]
    normalized: "chest"
    
  abdomen:
    examples: ["abdomen", "abdominal", "belly"]
    normalized: "abdomen"
    
  back:
    examples: ["back", "spine", "spinal"]
    normalized: "back"

extremity_sites:
  arm:
    examples: ["arm", "upper extremity", "shoulder"]
    laterality: ["left_arm", "right_arm", "bilateral_arms"]
    normalized: "arm"
    
  hand:
    examples: ["hand", "finger", "wrist"]
    laterality: ["left_hand", "right_hand", "bilateral_hands"]
    normalized: "hand"
    
  leg:
    examples: ["leg", "lower extremity", "thigh"]
    laterality: ["left_leg", "right_leg", "bilateral_legs"]
    normalized: "leg"
    
  foot:
    examples: ["foot", "toe", "ankle"]
    laterality: ["left_foot", "right_foot", "bilateral_feet"]
    normalized: "foot"

organ_systems:
  cardiovascular:
    examples: ["heart", "cardiac", "vascular"]
    normalized: "cardiovascular_system"
    
  respiratory:
    examples: ["lung", "pulmonary", "respiratory"]
    normalized: "respiratory_system"
    
  gastrointestinal:
    examples: ["stomach", "intestine", "bowel"]
    normalized: "gastrointestinal_system"
```

#### Anatomical Site Extraction Algorithm
```python
class AnatomicalSiteExtractor:
    def __init__(self):
        self.anatomical_dictionary = self.load_anatomical_dictionary()
        self.laterality_patterns = self.load_laterality_patterns()
        
    def extract_body_site(self, medical_text, event_name):
        """Extract and normalize anatomical site from medical text"""
        
        site_candidates = []
        
        # Direct anatomical term matching
        for site_category, site_data in self.anatomical_dictionary.items():
            for term in site_data['examples']:
                if term.lower() in medical_text.lower():
                    laterality = self.detect_laterality(medical_text, site_category)
                    confidence = self.calculate_site_confidence(term, medical_text)
                    
                    site_candidates.append({
                        'body_site': site_data['normalized'],
                        'laterality': laterality,
                        'confidence': confidence,
                        'supporting_text': self.extract_site_context(term, medical_text)
                    })
        
        # Event name-based site inference
        inferred_site = self.infer_site_from_event_name(event_name)
        if inferred_site:
            site_candidates.append(inferred_site)
        
        # Select primary anatomical site
        primary_site = self.select_primary_site(site_candidates)
        
        if primary_site:
            # Combine site and laterality for database storage
            if primary_site['laterality']:
                body_site = f"{primary_site['laterality']}_{primary_site['body_site']}"
            else:
                body_site = primary_site['body_site']
                
            return {
                'body_site': body_site,
                'confidence': primary_site['confidence'],
                'anatomical_category': self.get_anatomical_category(primary_site['body_site']),
                'alternative_sites': [c['body_site'] for c in site_candidates[1:]]
            }
        
        return None
    
    def detect_laterality(self, medical_text, site_category):
        """Detect left/right/bilateral specification"""
        
        text_lower = medical_text.lower()
        
        # Check for explicit laterality terms
        if any(term in text_lower for term in ['left', 'l.', 'lt', 'sinister']):
            return 'left'
        elif any(term in text_lower for term in ['right', 'r.', 'rt', 'dextra']):
            return 'right'
        elif any(term in text_lower for term in ['bilateral', 'both', 'b/l']):
            return 'bilateral'
        
        # Check if site category supports laterality
        site_data = self.anatomical_dictionary.get(site_category, {})
        if 'laterality' in site_data:
            # Default to None for sites that could be lateral but aren't specified
            return None
        
        return None
    
    def infer_site_from_event_name(self, event_name):
        """Infer anatomical site from medical event name"""
        
        event_lower = event_name.lower()
        
        # Common event name patterns with anatomical sites
        site_inferences = {
            'chest': ['chest x-ray', 'chest ct', 'chest pain', 'chest examination'],
            'heart': ['echocardiogram', 'ekg', 'cardiac', 'heart rate'],
            'blood': ['blood test', 'blood draw', 'blood pressure', 'blood glucose'],
            'head': ['head ct', 'head mri', 'head injury'],
            'abdomen': ['abdominal ct', 'abdominal examination', 'abdominal pain']
        }
        
        for site, patterns in site_inferences.items():
            if any(pattern in event_lower for pattern in patterns):
                return {
                    'body_site': site,
                    'confidence': 0.75,
                    'laterality': None,
                    'source': 'event_name_inference'
                }
        
        return None
```

---

## Healthcare Standards Integration

### Multi-Standard Code Assignment
Each extracted medical event must be assigned appropriate healthcare standard codes to ensure interoperability and clinical decision support.

#### Healthcare Standards Mapping
```yaml
code_assignment_priorities:
  all_events:
    primary: "SNOMED-CT"  # Comprehensive clinical terminology
    rationale: "Broad coverage of clinical concepts"
    
  observations:
    primary: "LOINC"      # Laboratory and clinical observations  
    secondary: "SNOMED-CT"
    rationale: "LOINC specializes in test and measurement identification"
    
  procedures:
    primary: "CPT"        # Procedures and services
    secondary: "SNOMED-CT"
    rationale: "CPT provides procedure billing and coding standards"
    
  conditions:
    primary: "ICD-10"     # Disease classification
    secondary: "SNOMED-CT"
    rationale: "ICD-10 for diagnostic coding, SNOMED for clinical concepts"
```

#### Standards Integration Algorithm
```python
class HealthcareStandardsIntegrator:
    def __init__(self):
        self.snomed_service = SNOMEDService()
        self.loinc_service = LOINCService() 
        self.cpt_service = CPTService()
        self.icd10_service = ICD10Service()
        
    def assign_healthcare_codes(self, event_data):
        """Assign all applicable healthcare standard codes"""
        
        assigned_codes = {}
        
        # Always attempt SNOMED-CT (comprehensive coverage)
        snomed_code = self.assign_snomed_code(event_data)
        if snomed_code:
            assigned_codes['snomed_code'] = snomed_code
        
        # LOINC for observations and measurements
        if event_data['activity_type'] == 'observation':
            loinc_code = self.assign_loinc_code(event_data)
            if loinc_code:
                assigned_codes['loinc_code'] = loinc_code
        
        # CPT for procedures and interventions
        if event_data['activity_type'] == 'intervention':
            cpt_code = self.assign_cpt_code(event_data)
            if cpt_code:
                assigned_codes['cpt_code'] = cpt_code
        
        # ICD-10 for conditions (handled separately in conditions table)
        # Not directly assigned to clinical events
        
        return {
            'assigned_codes': assigned_codes,
            'code_confidence_scores': self.calculate_code_confidences(assigned_codes, event_data),
            'coding_completeness': self.assess_coding_completeness(assigned_codes, event_data)
        }
    
    def assign_snomed_code(self, event_data):
        """Assign SNOMED-CT code for clinical concept"""
        
        search_terms = [
            event_data['event_name'],
            f"{event_data['event_name']} {event_data.get('method', '')}",
            f"{event_data['event_name']} {event_data.get('body_site', '')}"
        ]
        
        best_match = None
        highest_confidence = 0
        
        for term in search_terms:
            matches = self.snomed_service.search_concept(term.strip())
            if matches:
                for match in matches[:3]:  # Top 3 matches
                    semantic_similarity = self.calculate_semantic_similarity(term, match['display'])
                    if semantic_similarity > highest_confidence:
                        highest_confidence = semantic_similarity
                        best_match = {
                            'code': match['code'],
                            'display': match['display'],
                            'confidence': semantic_similarity
                        }
        
        return best_match if best_match and best_match['confidence'] > 0.75 else None
    
    def assign_loinc_code(self, event_data):
        """Assign LOINC code for observations and measurements"""
        
        # LOINC specializes in laboratory tests and clinical measurements
        if event_data.get('method', '').startswith('laboratory'):
            
            # Extract measurement component from event name
            component = self.extract_measurement_component(event_data['event_name'])
            if component:
                loinc_matches = self.loinc_service.search_observation(
                    component,
                    specimen_type=self.infer_specimen_type(event_data)
                )
                
                if loinc_matches:
                    best_match = max(loinc_matches, key=lambda x: x['confidence'])
                    if best_match['confidence'] > 0.70:
                        return {
                            'code': best_match['code'],
                            'display': best_match['display'],
                            'confidence': best_match['confidence']
                        }
        
        return None
    
    def extract_measurement_component(self, event_name):
        """Extract the measured component from event name"""
        
        # Common laboratory component patterns
        components = {
            'hemoglobin': ['hemoglobin', 'hgb', 'hb'],
            'glucose': ['glucose', 'blood sugar', 'blood glucose'],
            'cholesterol': ['cholesterol', 'total cholesterol', 'chol'],
            'creatinine': ['creatinine', 'creat', 'cr'],
            'sodium': ['sodium', 'na+', 'na'],
            'potassium': ['potassium', 'k+', 'k']
        }
        
        event_lower = event_name.lower()
        for component, patterns in components.items():
            if any(pattern in event_lower for pattern in patterns):
                return component
        
        return None
```

---

## Complete Event Extraction Pipeline

### Integrated Extraction Workflow
```python
class MedicalEventExtractor:
    def __init__(self):
        self.name_extractor = MedicalEventNameExtractor()
        self.method_extractor = MethodExtractor()
        self.site_extractor = AnatomicalSiteExtractor()
        self.standards_integrator = HealthcareStandardsIntegrator()
        
    def extract_complete_medical_event(self, raw_medical_text, clinical_context):
        """Complete extraction pipeline for medical events"""
        
        # Step 1: Extract and normalize event name
        event_name_data = self.name_extractor.extract_and_normalize_event_name(raw_medical_text)
        
        # Step 2: Extract method
        method_data = self.method_extractor.extract_method(
            raw_medical_text, 
            event_name_data['event_name']
        )
        
        # Step 3: Extract anatomical site
        site_data = self.site_extractor.extract_body_site(
            raw_medical_text,
            event_name_data['event_name']
        )
        
        # Step 4: Create structured event data
        event_data = {
            'event_name': event_name_data['event_name'],
            'method': method_data['method'] if method_data else None,
            'body_site': site_data['body_site'] if site_data else None,
            'activity_type': clinical_context.get('activity_type'),
            'source_text': raw_medical_text
        }
        
        # Step 5: Assign healthcare standard codes
        coding_data = self.standards_integrator.assign_healthcare_codes(event_data)
        
        # Step 6: Compile complete extraction result
        complete_event = {
            **event_data,
            **coding_data['assigned_codes'],
            'extraction_confidence': self.calculate_overall_confidence([
                event_name_data['confidence'],
                method_data['confidence'] if method_data else 0.5,
                site_data['confidence'] if site_data else 0.5
            ]),
            'code_confidence_scores': coding_data['code_confidence_scores'],
            'extraction_metadata': {
                'alternative_event_names': event_name_data.get('alternative_names', []),
                'alternative_methods': method_data.get('alternative_methods', []) if method_data else [],
                'alternative_sites': site_data.get('alternative_sites', []) if site_data else [],
                'coding_completeness': coding_data['coding_completeness']
            }
        }
        
        return complete_event
    
    def calculate_overall_confidence(self, confidence_scores):
        """Calculate overall extraction confidence"""
        valid_scores = [score for score in confidence_scores if score > 0]
        if valid_scores:
            return sum(valid_scores) / len(valid_scores)
        return 0.0
```

---

## Database Integration Specifications

### patient_clinical_events Table Population
```sql
-- Event extraction populates core clinical events table
INSERT INTO patient_clinical_events (
    patient_id,
    activity_type,
    clinical_purposes,
    event_name,              -- From event name extraction
    method,                  -- From method extraction  
    body_site,               -- From anatomical site extraction
    snomed_code,             -- From healthcare standards integration
    loinc_code,              -- From healthcare standards integration
    cpt_code,                -- From healthcare standards integration
    extraction_confidence,
    code_confidence_scores,
    extraction_metadata
) VALUES (
    $1::UUID,
    $2::TEXT,
    $3::TEXT[],
    $4::TEXT,               -- Normalized event name
    $5::TEXT,               -- Normalized method
    $6::TEXT,               -- Normalized body site with laterality
    $7::TEXT,               -- SNOMED-CT code
    $8::TEXT,               -- LOINC code (if applicable)
    $9::TEXT,               -- CPT code (if applicable)
    $10::NUMERIC,           -- Overall extraction confidence
    $11::JSONB,             -- Code-specific confidence scores
    $12::JSONB              -- Alternative extractions and metadata
);
```

### Event Extraction Quality Tracking
```sql
CREATE TABLE event_extraction_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    
    -- Extraction statistics
    total_events_extracted INTEGER,
    successful_event_names INTEGER,
    successful_methods INTEGER,
    successful_body_sites INTEGER,
    successful_snomed_codes INTEGER,
    successful_loinc_codes INTEGER,
    successful_cpt_codes INTEGER,
    
    -- Quality metrics
    average_extraction_confidence NUMERIC(4,3),
    average_code_confidence NUMERIC(4,3),
    events_requiring_review INTEGER,
    
    -- Processing performance
    extraction_algorithm_version TEXT,
    processing_time_ms INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Examples

### Example 1: Laboratory Result Extraction
```python
# Input raw medical text
raw_text = "Complete Blood Count - Hemoglobin: 7.2 g/dL (Low), White blood cell count: 8,500/uL (Normal)"

# Complete extraction result
extracted_event = {
    'event_name': 'Complete Blood Count',
    'method': 'laboratory_blood',
    'body_site': None,  # No specific anatomical site for CBC
    'snomed_code': '26604007',  # Complete blood count procedure
    'loinc_code': '58410-2',    # Complete blood count panel
    'cpt_code': '85027',        # Complete blood count (hemogram)
    'extraction_confidence': 0.92,
    'code_confidence_scores': {
        'snomed_confidence': 0.94,
        'loinc_confidence': 0.91,
        'cpt_confidence': 0.89
    },
    'extraction_metadata': {
        'alternative_event_names': ['CBC', 'Full Blood Count'],
        'alternative_methods': ['laboratory_whole_blood'],
        'coding_completeness': 0.95
    }
}
```

### Example 2: Imaging Procedure Extraction
```python
# Input raw medical text
raw_text = "Chest X-ray performed, right lower lobe pneumonia visible"

# Complete extraction result
extracted_event = {
    'event_name': 'Chest Radiography',
    'method': 'imaging_xray',
    'body_site': 'chest',
    'snomed_code': '399208008',  # Chest X-ray
    'loinc_code': '30746-2',     # Chest X-ray study
    'cpt_code': '71020',         # Chest X-ray, 2 views
    'extraction_confidence': 0.89,
    'code_confidence_scores': {
        'snomed_confidence': 0.93,
        'loinc_confidence': 0.87,
        'cpt_confidence': 0.91
    },
    'extraction_metadata': {
        'alternative_event_names': ['Chest X-ray', 'CXR'],
        'alternative_methods': ['imaging_radiography'],
        'coding_completeness': 0.92
    }
}
```

### Example 3: Vaccination Extraction
```python
# Input raw medical text  
raw_text = "Influenza vaccine administered intramuscularly in left deltoid, 0.5ml"

# Complete extraction result
extracted_event = {
    'event_name': 'Influenza Vaccination',
    'method': 'injection',
    'body_site': 'left_arm',
    'snomed_code': '86198006',   # Administration of vaccine product
    'loinc_code': None,          # Not applicable for interventions
    'cpt_code': '90686',         # Influenza virus vaccine administration
    'extraction_confidence': 0.91,
    'code_confidence_scores': {
        'snomed_confidence': 0.95,
        'cpt_confidence': 0.93
    },
    'extraction_metadata': {
        'alternative_event_names': ['Flu Shot', 'Influenza Immunization'],
        'alternative_methods': ['injection_intramuscular'],
        'alternative_sites': ['deltoid', 'upper_arm'],
        'coding_completeness': 0.88
    }
}
```

---

## Success Criteria

### Technical Success Metrics
- **90%+ event name normalization accuracy** validated against medical terminology standards
- **85%+ method classification accuracy** for medical procedure categorization
- **80%+ anatomical site extraction accuracy** with correct laterality identification  
- **Healthcare code assignment coverage** meeting minimum thresholds per coding system

### Clinical Validation Metrics
- **Medical professional validation** of extraction accuracy and clinical appropriateness
- **Healthcare standards compliance** verified by coding experts and medical institutions
- **Terminology consistency** across similar medical concepts and events
- **Clinical decision support readiness** through structured, coded medical data

### Quality Assurance Metrics
- **Comprehensive extraction coverage** ensuring no critical medical information is lost
- **Confidence-based review workflows** enabling appropriate human oversight for low-confidence extractions
- **Continuous improvement** incorporating feedback from medical professionals and coding specialists
- **Performance optimization** suitable for real-time clinical document processing

---

*Medical event extraction and normalization transforms Guardian's raw medical text into structured, interoperable clinical data that supports advanced healthcare analytics, clinical decision-making, and seamless integration with healthcare systems and provider workflows.*