# AI Clinical Events Implementation Guide

**Database Table:** `patient_clinical_events`  
**AI Component:** o3-classifier  
**Schema Reference:** [005_clinical_events_core.sql](../../database-foundation/implementation/sql/005_clinical_events_core.sql)  
**Bridge Specification:** [patient_clinical_events Bridge](../../ai-processing-v2/06-technical-specifications/database-bridge/patient_clinical_events.md)

---

## Quick Start

```typescript
// AI Classification Result using O3's two-axis model
interface ClinicalEventClassification {
  activity_type: 'observation' | 'intervention';
  clinical_purposes: Array<'screening' | 'diagnostic' | 'therapeutic' | 'monitoring' | 'preventive'>;
  event_name: string;
  confidence_score: number;
  snomed_code?: string;
  loinc_code?: string;
  cpt_code?: string;
}

// Database Population
const result = await insertClinicalEvent({
  patient_id: userId,
  activity_type: 'observation',
  clinical_purposes: ['diagnostic', 'monitoring'],
  event_name: 'Complete Blood Count',
  confidence_score: 0.95
});
```

---

## O3's Two-Axis Classification Model

### Core Classification Framework

Every medical fact extracted from documents must be classified along two axes:

```yaml
axis_1_activity_type:
  observation:
    definition: "Information gathering without changing patient state"
    examples: ["Blood pressure measurement", "Lab test", "X-ray", "Physical exam finding"]
    database_trigger: "Populates patient_observations table"
    
  intervention:
    definition: "Actions that change or intend to change patient state"
    examples: ["Medication administration", "Vaccination", "Surgery", "Therapy session"]
    database_trigger: "Populates patient_interventions table"

axis_2_clinical_purposes:
  screening:
    definition: "Looking for disease in asymptomatic patients"
    examples: ["Mammogram", "Colonoscopy", "Depression screening"]
    
  diagnostic:
    definition: "Determining the cause of symptoms"
    examples: ["Blood test for infection", "MRI for headache"]
    
  therapeutic:
    definition: "Treatment intended to cure or manage"
    examples: ["Antibiotics", "Chemotherapy", "Physical therapy"]
    
  monitoring:
    definition: "Tracking known conditions over time"
    examples: ["HbA1c for diabetes", "INR for warfarin"]
    
  preventive:
    definition: "Preventing disease before it occurs"
    examples: ["Vaccines", "Prophylactic medications"]
```

### Classification Decision Tree

```typescript
class O3ClinicalClassifier {
  async classifyMedicalFact(factText: string): Promise<ClinicalEventClassification> {
    
    // Step 1: Determine activity type (observation vs intervention)
    const activityType = await this.determineActivityType(factText);
    
    // Step 2: Determine clinical purposes (can be multiple)
    const clinicalPurposes = await this.determineClinicalPurposes(factText, activityType);
    
    // Step 3: Extract specific event name
    const eventName = await this.extractEventName(factText);
    
    // Step 4: Extract healthcare codes
    const codes = await this.extractHealthcareCodes(factText, eventName);
    
    // Step 5: Calculate confidence
    const confidence = this.calculateConfidence(factText, activityType, clinicalPurposes);
    
    return {
      activity_type: activityType,
      clinical_purposes: clinicalPurposes,
      event_name: eventName,
      confidence_score: confidence,
      ...codes
    };
  }
}
```

---

## Database Integration

### Core Table Schema

```sql
CREATE TABLE patient_clinical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- O3's Two-Axis Classification (REQUIRED by AI)
    activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention')),
    clinical_purposes TEXT[] NOT NULL CHECK (array_length(clinical_purposes, 1) > 0),
    
    -- Event Details (REQUIRED by AI)
    event_name TEXT NOT NULL CHECK (length(event_name) >= 5),
    method TEXT, -- 'physical_exam', 'laboratory', 'imaging', 'injection'
    body_site TEXT, -- 'left_ear', 'chest', 'left_hand'
    
    -- Healthcare Standards (HIGHLY RECOMMENDED by AI)
    snomed_code TEXT,
    loinc_code TEXT,
    cpt_code TEXT,
    
    -- Temporal Context
    event_date TIMESTAMPTZ NOT NULL,
    performed_by TEXT,
    
    -- Quality Metadata (REQUIRED by AI)
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_document_id UUID REFERENCES documents(id),
    
    -- State Management
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Standard Insert Pattern

```sql
-- Single clinical event insertion
INSERT INTO patient_clinical_events (
    patient_id,
    activity_type,
    clinical_purposes,
    event_name,
    method,
    body_site,
    snomed_code,
    loinc_code,
    event_date,
    confidence_score,
    source_document_id,
    requires_review
) VALUES (
    $1::UUID,                    -- patient_id
    $2::TEXT,                    -- activity_type from AI
    $3::TEXT[],                  -- clinical_purposes array from AI
    $4::TEXT,                    -- event_name from AI
    $5::TEXT,                    -- method from AI (nullable)
    $6::TEXT,                    -- body_site from AI (nullable)
    $7::TEXT,                    -- snomed_code from AI (nullable)
    $8::TEXT,                    -- loinc_code from AI (nullable)
    $9::TIMESTAMPTZ,             -- event_date from AI
    $10::NUMERIC,                -- confidence_score from AI
    $11::UUID,                   -- source_document_id
    $12::BOOLEAN                 -- requires_review (calculated)
) RETURNING id, event_name;
```

---

## Implementation Examples

### Example 1: Laboratory Test Classification

```typescript
// Input: "Complete Blood Count - Hemoglobin: 7.2 g/dL (Low)"

const labResult = await classifier.classifyMedicalFact(
  "Complete Blood Count - Hemoglobin: 7.2 g/dL (Low)"
);

// Expected Output:
{
  activity_type: 'observation',           // It's gathering information
  clinical_purposes: ['diagnostic', 'monitoring'], // Finding cause + tracking condition
  event_name: 'Complete Blood Count',
  method: 'laboratory',
  snomed_code: '26604007',               // SNOMED for CBC
  loinc_code: '58410-2',                 // LOINC for CBC
  confidence_score: 0.95
}

// Database insertion
await insertClinicalEvent(labResult, {
  patient_id: 'user-123',
  event_date: '2024-07-15T10:00:00Z',
  source_document_id: 'doc-456'
});
```

### Example 2: Medication Administration

```typescript
// Input: "Administered influenza vaccine, 0.5ml IM left deltoid"

const vaccination = await classifier.classifyMedicalFact(
  "Administered influenza vaccine, 0.5ml IM left deltoid"
);

// Expected Output:
{
  activity_type: 'intervention',         // Taking action to change patient state
  clinical_purposes: ['preventive'],     // Preventing disease
  event_name: 'Influenza Vaccination',
  method: 'injection',
  body_site: 'left_deltoid',
  snomed_code: '86198006',              // SNOMED for flu vaccine
  cpt_code: '90686',                    // CPT for vaccine administration
  confidence_score: 0.97
}
```

### Example 3: Multiple Purpose Classification

```typescript
// Input: "Fasting glucose 250 mg/dL (high) - checking for diabetes, monitoring metformin response"

const glucoseTest = await classifier.classifyMedicalFact(
  "Fasting glucose 250 mg/dL (high) - checking for diabetes, monitoring metformin response"
);

// Expected Output:
{
  activity_type: 'observation',
  clinical_purposes: ['diagnostic', 'monitoring'], // Both purposes detected
  event_name: 'Fasting Blood Glucose Test',
  method: 'laboratory',
  loinc_code: '1558-6',                 // LOINC for fasting glucose
  confidence_score: 0.92
}
```

---

## Classification Patterns by Medical Context

### Laboratory Tests Pattern

```typescript
function classifyLaboratoryTest(testText: string): Partial<ClinicalEventClassification> {
  return {
    activity_type: 'observation',        // Always observation
    method: 'laboratory',               // Always laboratory method
    clinical_purposes: determinePurposes(testText), // Context dependent
    // Prefer LOINC codes for lab tests
    loinc_code: extractLOINCCode(testText)
  };
}

// Common lab test purposes
const labPurposePatterns = {
  'routine': ['screening'],
  'annual': ['screening', 'monitoring'],
  'follow-up': ['monitoring'],
  'suspected': ['diagnostic'],
  'checking for': ['diagnostic'],
  'monitoring': ['monitoring']
};
```

### Medication Administration Pattern

```typescript
function classifyMedicationIntervention(medText: string): Partial<ClinicalEventClassification> {
  return {
    activity_type: 'intervention',      // Always intervention
    method: extractRoute(medText),      // oral, injection, topical, etc.
    clinical_purposes: determineMedicationPurposes(medText),
    // Prefer RxNorm for medications, CPT for administration
    cpt_code: extractCPTCode(medText)
  };
}

// Medication purpose detection
const medicationPurposePatterns = {
  'antibiotic': ['therapeutic'],
  'vaccine': ['preventive'],
  'pain relief': ['therapeutic'],
  'blood pressure': ['therapeutic', 'monitoring'],
  'prophylactic': ['preventive']
};
```

### Imaging Studies Pattern

```typescript
function classifyImagingStudy(imagingText: string): Partial<ClinicalEventClassification> {
  return {
    activity_type: 'observation',       // Always observation
    method: 'imaging',                  // Always imaging method
    body_site: extractBodySite(imagingText), // Usually specified
    clinical_purposes: determineImagingPurposes(imagingText),
    // Prefer CPT codes for imaging procedures
    cpt_code: extractCPTCode(imagingText)
  };
}

// Imaging purpose patterns
const imagingPurposePatterns = {
  'screening mammogram': ['screening', 'preventive'],
  'diagnostic CT': ['diagnostic'],
  'follow-up MRI': ['monitoring'],
  'routine chest x-ray': ['screening']
};
```

---

## Validation and Quality Control

### Pre-Insert Validation

```typescript
function validateClinicalEventClassification(
  classification: ClinicalEventClassification
): ValidationResult {
  const errors: string[] = [];
  
  // Required fields validation
  if (!classification.activity_type) {
    errors.push("activity_type is required");
  }
  
  if (!['observation', 'intervention'].includes(classification.activity_type)) {
    errors.push("activity_type must be 'observation' or 'intervention'");
  }
  
  if (!classification.clinical_purposes || classification.clinical_purposes.length === 0) {
    errors.push("clinical_purposes array cannot be empty");
  }
  
  const validPurposes = ['screening', 'diagnostic', 'therapeutic', 'monitoring', 'preventive'];
  const invalidPurposes = classification.clinical_purposes.filter(p => !validPurposes.includes(p));
  if (invalidPurposes.length > 0) {
    errors.push(`Invalid clinical purposes: ${invalidPurposes.join(', ')}`);
  }
  
  if (!classification.event_name || classification.event_name.length < 5) {
    errors.push("event_name must be descriptive (min 5 characters)");
  }
  
  // Confidence validation
  if (classification.confidence_score < 0.5) {
    errors.push("confidence_score too low for clinical event");
  }
  
  // Healthcare code validation
  if (classification.snomed_code && !/^[0-9]+$/.test(classification.snomed_code)) {
    errors.push("snomed_code must be numeric");
  }
  
  if (classification.loinc_code && !/^[0-9]+-[0-9]+$/.test(classification.loinc_code)) {
    errors.push("loinc_code must match pattern XXXXX-X");
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
```

### Confidence-Based Review Logic

```typescript
function calculateRequiresReview(
  classification: ClinicalEventClassification,
  medicalContext: string
): boolean {
  
  // Low confidence always requires review
  if (classification.confidence_score < 0.7) {
    return true;
  }
  
  // Safety-critical contexts require higher confidence
  const safetyCriticalTerms = ['medication', 'allergy', 'surgery', 'emergency'];
  const isSafetyCritical = safetyCriticalTerms.some(term => 
    medicalContext.toLowerCase().includes(term)
  );
  
  if (isSafetyCritical && classification.confidence_score < 0.9) {
    return true;
  }
  
  // Generic event names require review
  const genericTerms = ['test', 'procedure', 'medication', 'visit'];
  if (genericTerms.some(term => 
    classification.event_name.toLowerCase() === term
  )) {
    return true;
  }
  
  return false;
}
```

---

## Batch Processing Patterns

### Multiple Clinical Events from One Document

```typescript
async function processClinicalDocument(
  documentContent: string,
  patientId: string,
  documentId: string
): Promise<string[]> {
  
  // Step 1: Extract all medical facts from document
  const medicalFacts = await extractMedicalFacts(documentContent);
  
  // Step 2: Classify each fact using O3 model
  const classifications = await Promise.all(
    medicalFacts.map(fact => classifier.classifyMedicalFact(fact.text))
  );
  
  // Step 3: Validate all classifications
  const validatedClassifications = classifications.filter(c => {
    const validation = validateClinicalEventClassification(c);
    if (!validation.isValid) {
      console.warn('Invalid classification:', validation.errors);
      return false;
    }
    return true;
  });
  
  // Step 4: Batch insert to database
  const insertedEvents = await batchInsertClinicalEvents(
    validatedClassifications,
    patientId,
    documentId
  );
  
  return insertedEvents.map(e => e.id);
}

async function batchInsertClinicalEvents(
  classifications: ClinicalEventClassification[],
  patientId: string,
  documentId: string
): Promise<{ id: string; event_name: string }[]> {
  
  const { data, error } = await supabase
    .from('patient_clinical_events')
    .insert(
      classifications.map(c => ({
        patient_id: patientId,
        activity_type: c.activity_type,
        clinical_purposes: c.clinical_purposes,
        event_name: c.event_name,
        method: c.method,
        body_site: c.body_site,
        snomed_code: c.snomed_code,
        loinc_code: c.loinc_code,
        cpt_code: c.cpt_code,
        confidence_score: c.confidence_score,
        source_document_id: documentId,
        requires_review: calculateRequiresReview(c, c.event_name),
        event_date: extractEventDate(documentContent) || new Date()
      }))
    )
    .select('id, event_name');
  
  if (error) {
    throw new Error(`Batch clinical event insertion failed: ${error.message}`);
  }
  
  return data;
}
```

---

## Testing Patterns

### Classification Accuracy Tests

```typescript
describe('O3ClinicalClassifier', () => {
  const classifier = new O3ClinicalClassifier();
  
  test('should classify blood pressure reading as observation/monitoring', async () => {
    const result = await classifier.classifyMedicalFact("BP: 120/80 mmHg");
    
    expect(result.activity_type).toBe('observation');
    expect(result.clinical_purposes).toContain('monitoring');
    expect(result.event_name).toContain('Blood Pressure');
    expect(result.method).toBe('physical_exam');
    expect(result.confidence_score).toBeGreaterThan(0.8);
  });
  
  test('should classify flu shot as intervention/preventive', async () => {
    const result = await classifier.classifyMedicalFact(
      "Administered influenza vaccine, 0.5ml IM"
    );
    
    expect(result.activity_type).toBe('intervention');
    expect(result.clinical_purposes).toContain('preventive');
    expect(result.event_name).toContain('Influenza');
    expect(result.method).toBe('injection');
    expect(result.confidence_score).toBeGreaterThan(0.9);
  });
  
  test('should handle multiple clinical purposes', async () => {
    const result = await classifier.classifyMedicalFact(
      "Fasting glucose - checking for diabetes, monitoring current treatment"
    );
    
    expect(result.clinical_purposes).toHaveLength(2);
    expect(result.clinical_purposes).toContain('diagnostic');
    expect(result.clinical_purposes).toContain('monitoring');
  });
  
  test('should reject low confidence classifications', async () => {
    const result = await classifier.classifyMedicalFact("unclear medical text");
    
    if (result.confidence_score < 0.5) {
      const validation = validateClinicalEventClassification(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('confidence_score too low for clinical event');
    }
  });
});
```

---

*This implementation guide provides complete patterns for integrating AI clinical event classification with Guardian's O3-based clinical events architecture, ensuring every medical fact is properly normalized and stored.*