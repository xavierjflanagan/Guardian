/**
 * Schema Test Example - Demonstrates AI processing with patient_clinical_events schema
 * This shows how the schema would be used in practice with an AI model
 */

// Example medical document text
const exampleMedicalText = `
Patient: John Smith
Date: July 15, 2024, 10:30 AM
Provider: Dr. Jane Wilson, Family Medicine

VITAL SIGNS:
- Blood pressure: 140/90 mmHg (elevated)
- Heart rate: 72 bpm (normal)
- Temperature: 98.6°F (normal)
- Weight: 185 lbs

ASSESSMENT:
Patient presents for routine annual physical. Blood pressure elevated at 140/90, 
consistent with stage 2 hypertension. Patient reports no symptoms.

PLAN:
- Started on Lisinopril 10mg daily for blood pressure management
- Recheck blood pressure in 4 weeks
- Continue current diet and exercise regimen
- Lab work ordered: lipid panel, glucose, kidney function

MEDICATIONS ADMINISTERED:
- Influenza vaccine given in left deltoid
- No adverse reactions observed

FOLLOW UP:
Return in 4 weeks for blood pressure recheck.
`;

// This is what the AI prompt would look like using our schema
const aiPrompt = `
Extract clinical events from this medical document and format according to the schema:

MEDICAL DOCUMENT:
${exampleMedicalText}

SCHEMA INSTRUCTIONS:
Extract data for table: patient_clinical_events
Central clinical events table using O3's two-axis classification model

REQUIRED FIELDS:
- activity_type (string): Must be 'observation' (for information gathering) or 'intervention' (for actions taken) Valid values: observation, intervention Examples: {"observation":["Blood pressure reading","Lab test result","Physical exam finding"],"intervention":["Medication administration","Surgery","Vaccination"]}
- clinical_purposes (array): At least one clinical purpose - can have multiple purposes Examples: [["screening"],["diagnostic","monitoring"],["therapeutic","monitoring"]]
- event_name (string): Descriptive, specific name for the clinical event Examples: ["Blood Pressure Measurement","Complete Blood Count","Influenza Vaccination","Appendectomy","Diabetes Monitoring Visit"]
- event_date (string): When the clinical event occurred Example: "2024-07-15T10:30:00Z"
- confidence_score (number): AI confidence in extraction accuracy (0.0-1.0)

OPTIONAL FIELDS:
- method (string): How the clinical event was performed or observed Valid values: physical_exam, laboratory, imaging, injection, surgery, assessment_tool
- body_site (string): Anatomical location where event occurred Examples: ["left_arm","chest","left_ear","abdomen","brain"]
- performed_by (string): Healthcare provider or facility who performed the event
- snomed_code (string): SNOMED CT code if you can identify one with high confidence
- loinc_code (string): LOINC code for observations and lab tests if identifiable
- cpt_code (string): CPT code for procedures if identifiable

OUTPUT FORMAT:
Return JSON array of events matching this structure:
[
  {
    "activity_type": "observation",
    "clinical_purposes": ["diagnostic"],
    "event_name": "Complete Blood Count",
    "method": "laboratory",
    "event_date": "2024-07-15T09:00:00Z",
    "performed_by": "City Hospital Lab",
    "confidence_score": 0.92
  }
]

VALIDATION RULES:
- Confidence threshold: 0.7
- Mark for review if confidence < 0.8
- event_name must be descriptive and specific
- activity_type must match the nature of the event
- clinical_purposes must be relevant to the event
- if method is provided, it must be logical for the activity_type

Extract all clinical events from the document. Return as JSON array.
`;

// Expected AI response based on the schema
const expectedAIResponse = [
  {
    "activity_type": "observation",
    "clinical_purposes": ["screening", "monitoring"],
    "event_name": "Blood Pressure Measurement",
    "method": "physical_exam",
    "event_date": "2024-07-15T10:30:00Z",
    "performed_by": "Dr. Jane Wilson",
    "confidence_score": 0.95
  },
  {
    "activity_type": "observation", 
    "clinical_purposes": ["screening", "monitoring"],
    "event_name": "Heart Rate Check",
    "method": "physical_exam",
    "event_date": "2024-07-15T10:30:00Z",
    "performed_by": "Dr. Jane Wilson",
    "confidence_score": 0.92
  },
  {
    "activity_type": "observation",
    "clinical_purposes": ["screening"],
    "event_name": "Temperature Reading", 
    "method": "physical_exam",
    "event_date": "2024-07-15T10:30:00Z",
    "performed_by": "Dr. Jane Wilson",
    "confidence_score": 0.90
  },
  {
    "activity_type": "observation",
    "clinical_purposes": ["screening"],
    "event_name": "Weight Measurement",
    "method": "physical_exam", 
    "event_date": "2024-07-15T10:30:00Z",
    "performed_by": "Dr. Jane Wilson",
    "confidence_score": 0.88
  },
  {
    "activity_type": "intervention",
    "clinical_purposes": ["therapeutic"],
    "event_name": "Lisinopril Prescription",
    "method": "physical_exam",
    "event_date": "2024-07-15T10:30:00Z", 
    "performed_by": "Dr. Jane Wilson",
    "confidence_score": 0.93
  },
  {
    "activity_type": "intervention",
    "clinical_purposes": ["preventive"],
    "event_name": "Influenza Vaccination",
    "method": "injection",
    "body_site": "left_deltoid",
    "event_date": "2024-07-15T10:30:00Z",
    "performed_by": "Dr. Jane Wilson", 
    "confidence_score": 0.96
  }
];

// Token count estimation
const promptTokens = Math.ceil(aiPrompt.length / 4); // ~4 chars per token
console.log(`Estimated prompt tokens: ${promptTokens}`);

// Validation check - would this response pass our database constraints?
const validationResults = expectedAIResponse.map((event, index) => {
  const errors = [];
  
  if (!['observation', 'intervention'].includes(event.activity_type)) {
    errors.push('Invalid activity_type');
  }
  
  if (!event.clinical_purposes || event.clinical_purposes.length === 0) {
    errors.push('clinical_purposes cannot be empty');
  }
  
  if (!event.event_name || event.event_name.length < 5) {
    errors.push('event_name too short or missing');
  }
  
  if (event.confidence_score < 0.7) {
    errors.push('Confidence below threshold - requires review');
  }
  
  return {
    event_index: index,
    event_name: event.event_name,
    valid: errors.length === 0,
    errors: errors,
    requires_review: event.confidence_score < 0.8
  };
});

console.log('Validation Results:');
validationResults.forEach(result => {
  console.log(`${result.event_name}: ${result.valid ? 'VALID' : 'INVALID'}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.join(', ')}`);
  }
  if (result.requires_review) {
    console.log(`  Requires manual review (confidence < 0.8)`);
  }
});

export {
  exampleMedicalText,
  aiPrompt,
  expectedAIResponse,
  validationResults
};