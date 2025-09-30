# Prompt Engineering Framework

**Purpose:** Sophisticated prompt design for accurate medical information extraction across diverse document types  
**Focus:** Medical document-specific prompts, chain-of-thought reasoning, and adaptive prompt optimization  
**Priority:** CRITICAL - Core AI accuracy depends on prompt quality  
**Dependencies:** GPT-4o Mini processing, medical knowledge bases, document type classification

---

## System Overview

The Prompt Engineering Framework provides the foundation for Guardian's AI extraction accuracy through meticulously crafted prompts that understand medical context, leverage healthcare domain knowledge, and adapt to different document types and clinical scenarios.

### Prompt Engineering Philosophy
```yaml
core_principles:
  medical_accuracy: "Prompts prioritize clinical accuracy over speed"
  context_awareness: "Prompts adapt to document type and medical context"
  safety_first: "Conservative extraction with confidence scoring"
  healthcare_compliance: "Prompts ensure regulatory compliance awareness"
  
design_methodology:
  iterative_refinement: "Continuous prompt optimization based on performance"
  medical_professional_review: "Healthcare expert validation of prompt accuracy"
  domain_specific_training: "Specialized prompts for different medical specialties"
  error_pattern_analysis: "Systematic identification and correction of prompt weaknesses"
```

---

## Medical Document Type-Specific Prompts

### Laboratory Results Extraction Prompt
```typescript
class LabResultsPromptEngine {
  generateLabResultsPrompt(documentContext: DocumentContext): string {
    return `
You are a medical laboratory specialist analyzing a laboratory results document. Extract all clinical information with precision and accuracy.

DOCUMENT CONTEXT:
- Document Type: ${documentContext.documentType}
- Expected Lab Types: ${documentContext.expectedLabTypes?.join(', ') || 'Various'}
- Patient Age Context: ${documentContext.patientAgeContext || 'Unknown'}
- Ordering Provider: ${documentContext.orderingProvider || 'Unknown'}

EXTRACTION REQUIREMENTS:

1. PATIENT DEMOGRAPHICS:
   - Full patient name (exactly as printed)
   - Date of birth (format: YYYY-MM-DD)
   - Medical record number or patient identifier
   - Gender (if explicitly stated)
   - Address (if visible and complete)

2. LABORATORY TEST RESULTS:
   For each test, extract:
   - Test name (use exact laboratory terminology)
   - Numeric result with units (preserve exact formatting)
   - Reference range (normal values as provided)
   - Abnormal flags (H=High, L=Low, Critical, Panic, etc.)
   - Collection date and time
   - Specimen type (blood, urine, etc.)
   - LOINC code (if present on report)

3. PROVIDER AND FACILITY INFORMATION:
   - Ordering physician name and credentials
   - Laboratory facility name
   - Laboratory director (if listed)
   - Report generation date and time
   - Laboratory accreditation numbers (if visible)

4. CRITICAL VALUES AND ALERTS:
   - Identify any critical or panic values
   - Note any laboratory comments or interpretations
   - Flag any incomplete or pending results

MEDICAL REASONING PROCESS:
1. First, identify the laboratory panel type (CBC, CMP, lipid panel, etc.)
2. Locate patient identification section (usually top of document)
3. Systematically extract each test result in order
4. Cross-reference abnormal values with reference ranges
5. Identify any critical values requiring immediate attention
6. Note any laboratory comments or clinical correlations

RESPONSE FORMAT (JSON):
{
  "documentType": "laboratory_results",
  "patientDemographics": {
    "fullName": "string",
    "dateOfBirth": "YYYY-MM-DD",
    "medicalRecordNumber": "string",
    "gender": "M/F/Other/Unknown",
    "address": "complete address if visible",
    "confidence": 0.95,
    "spatialLocation": {"x": 0, "y": 0, "width": 100, "height": 25}
  },
  "laboratoryTests": [
    {
      "testName": "Hemoglobin",
      "result": "12.5",
      "units": "g/dL",
      "referenceRange": "12.0-15.5 g/dL",
      "abnormalFlag": "Normal",
      "criticalValue": false,
      "collectionDateTime": "2024-08-19T08:30:00",
      "specimenType": "Whole Blood",
      "loincCode": "718-7",
      "confidence": 0.98,
      "spatialLocation": {"x": 10, "y": 30, "width": 80, "height": 15}
    }
  ],
  "providerInformation": {
    "orderingPhysician": "Dr. Jane Smith, MD",
    "laboratoryFacility": "Guardian Medical Laboratory",
    "labDirector": "Dr. John Doe, MD, PhD",
    "reportDateTime": "2024-08-19T14:30:00",
    "confidence": 0.92,
    "spatialLocation": {"x": 0, "y": 85, "width": 100, "height": 15}
  },
  "criticalFindings": [
    {
      "testName": "Potassium",
      "result": "2.8",
      "units": "mEq/L",
      "criticalThreshold": "<3.0 mEq/L",
      "clinicalSignificance": "Critical hypokalemia requiring immediate attention",
      "confidence": 0.99
    }
  ],
  "qualityMetrics": {
    "overallConfidence": 0.94,
    "extractionCompleteness": 0.98,
    "medicalAccuracy": 0.96,
    "spatialAccuracy": 0.92
  }
}

CRITICAL SAFETY GUIDELINES:
- If any value appears critical (outside life-threatening ranges), flag it prominently
- If text is unclear or partially obscured, lower confidence score appropriately
- If laboratory values seem clinically impossible, note in quality metrics
- Preserve exact numerical formatting (don't round or approximate)
- If reference ranges are unclear, extract exactly as shown
- When in doubt about medical terminology, use exact text from document

CONFIDENCE SCORING GUIDELINES:
- 0.95-1.0: Crystal clear text, unambiguous medical values
- 0.85-0.94: Clear text with minor formatting variations
- 0.70-0.84: Readable text but some uncertainty in interpretation
- 0.50-0.69: Partially clear text requiring verification
- Below 0.50: Unclear text requiring manual review

Remember: Laboratory results can be life-critical. Accuracy is paramount over processing speed.
`;
  }
}
```

### Clinical Notes Extraction Prompt
```typescript
class ClinicalNotesPromptEngine {
  generateClinicalNotesPrompt(documentContext: DocumentContext): string {
    return `
You are an experienced medical professional analyzing clinical notes. Extract comprehensive medical information while preserving clinical context and reasoning.

DOCUMENT CONTEXT:
- Document Type: ${documentContext.documentType}
- Medical Specialty: ${documentContext.medicalSpecialty || 'General Medicine'}
- Visit Type: ${documentContext.visitType || 'Unknown'}
- Patient Age Context: ${documentContext.patientAgeContext || 'Unknown'}

CLINICAL REASONING APPROACH:
Use the SOAP (Subjective, Objective, Assessment, Plan) framework where applicable:

1. SUBJECTIVE: Patient-reported symptoms, history, concerns
2. OBJECTIVE: Physical examination findings, vital signs, observations
3. ASSESSMENT: Clinical impression, diagnoses, differential diagnoses
4. PLAN: Treatment plan, medications, follow-up, patient education

EXTRACTION REQUIREMENTS:

1. PATIENT IDENTIFICATION:
   - Patient name and demographics
   - Visit date and time
   - Provider name and credentials
   - Facility/clinic information

2. CHIEF COMPLAINT AND HISTORY:
   - Primary reason for visit
   - History of present illness (HPI)
   - Past medical history (PMH)
   - Medications and allergies
   - Social history (if relevant)
   - Family history (if documented)

3. PHYSICAL EXAMINATION:
   - Vital signs (temperature, blood pressure, heart rate, respiratory rate)
   - General appearance and mental status
   - System-specific findings by body system
   - Any abnormal findings or positive signs

4. DIAGNOSTIC TESTS AND RESULTS:
   - Laboratory results mentioned in notes
   - Imaging results and interpretations
   - Other diagnostic procedures performed

5. CLINICAL ASSESSMENT:
   - Primary diagnosis (ICD-10 code if available)
   - Secondary diagnoses
   - Differential diagnoses considered
   - Clinical reasoning and thought process

6. TREATMENT PLAN:
   - Medications prescribed (with dosages and instructions)
   - Procedures performed or recommended
   - Follow-up appointments scheduled
   - Patient education provided
   - Referrals to specialists

MEDICAL CODING INTEGRATION:
- Apply SNOMED-CT codes for conditions and procedures where appropriate
- Use LOINC codes for any laboratory values mentioned
- Include CPT codes for procedures performed
- Map diagnoses to ICD-10 codes when possible

RESPONSE FORMAT (JSON):
{
  "documentType": "clinical_notes",
  "visitInformation": {
    "patientName": "string",
    "visitDate": "YYYY-MM-DD",
    "visitTime": "HH:MM",
    "provider": "Dr. Name, Credentials",
    "facility": "Clinic/Hospital Name",
    "visitType": "office_visit/consultation/follow_up",
    "confidence": 0.95
  },
  "chiefComplaint": {
    "primaryConcern": "Patient's main complaint in their words",
    "duration": "Timeline of symptoms",
    "severity": "Patient-reported severity scale",
    "associatedSymptoms": ["symptom1", "symptom2"],
    "confidence": 0.92
  },
  "historyOfPresentIllness": {
    "narrative": "Detailed HPI as documented",
    "timeline": "Chronological progression of illness",
    "aggravatingFactors": ["factor1", "factor2"],
    "relievingFactors": ["factor1", "factor2"],
    "confidence": 0.88
  },
  "physicalExamination": {
    "vitalSigns": {
      "temperature": {"value": "98.6", "unit": "°F"},
      "bloodPressure": {"systolic": 120, "diastolic": 80, "unit": "mmHg"},
      "heartRate": {"value": 72, "unit": "bpm"},
      "respiratoryRate": {"value": 16, "unit": "breaths/min"},
      "confidence": 0.96
    },
    "systemFindings": [
      {
        "system": "cardiovascular",
        "findings": "Regular rate and rhythm, no murmurs",
        "abnormal": false,
        "confidence": 0.90
      }
    ]
  },
  "clinicalAssessment": {
    "primaryDiagnosis": {
      "condition": "Hypertension, unspecified",
      "icd10Code": "I10",
      "snomedCode": "38341003",
      "confidence": 0.94
    },
    "secondaryDiagnoses": [
      {
        "condition": "Type 2 diabetes mellitus",
        "icd10Code": "E11.9",
        "snomedCode": "44054006",
        "confidence": 0.91
      }
    ],
    "differentialDiagnoses": ["condition1", "condition2"],
    "clinicalReasoning": "Provider's documented thought process"
  },
  "treatmentPlan": {
    "medications": [
      {
        "name": "Lisinopril",
        "dosage": "10mg",
        "frequency": "once daily",
        "route": "oral",
        "instructions": "Take with food",
        "confidence": 0.96
      }
    ],
    "procedures": [
      {
        "name": "Blood pressure monitoring",
        "cptCode": "99213",
        "frequency": "weekly",
        "confidence": 0.88
      }
    ],
    "followUp": {
      "interval": "2 weeks",
      "provider": "same",
      "instructions": "Return if symptoms worsen",
      "confidence": 0.85
    }
  },
  "qualityMetrics": {
    "overallConfidence": 0.91,
    "clinicalCoherence": 0.94,
    "medicalAccuracy": 0.89,
    "extractionCompleteness": 0.87
  }
}

CLINICAL SAFETY CONSIDERATIONS:
- Flag any mentions of suicidal ideation, self-harm, or safety concerns
- Identify any drug allergies or adverse reactions mentioned
- Note any critical vital signs or examination findings
- Preserve exact medication names and dosages (critical for safety)
- Flag any mentions of infectious diseases requiring isolation precautions

MEDICAL TERMINOLOGY HANDLING:
- Preserve medical abbreviations exactly as written (then expand in separate field)
- Maintain clinical context for ambiguous terms
- Note any non-standard terminology or apparent errors
- Use standardized anatomical position descriptions
- Preserve provider's clinical reasoning language

Remember: Clinical notes contain complex medical reasoning. Preserve the provider's clinical thought process while extracting structured data.
`;
  }
}
```

---

## Chain-of-Thought Reasoning Framework

### Medical Reasoning Prompts
```typescript
class MedicalReasoningPromptEngine {
  generateChainOfThoughtPrompt(
    documentType: string,
    medicalContext: MedicalContext
  ): string {
    
    const basePrompt = this.getBaseReasoningPrompt();
    const specializationPrompt = this.getSpecializationPrompt(documentType);
    const contextPrompt = this.getContextualPrompt(medicalContext);
    
    return `${basePrompt}\n\n${specializationPrompt}\n\n${contextPrompt}`;
  }

  private getBaseReasoningPrompt(): string {
    return `
MEDICAL REASONING FRAMEWORK:

You are an expert medical professional with deep knowledge of clinical practice, medical terminology, and healthcare documentation standards. When analyzing medical documents, follow this systematic reasoning approach:

STEP 1: DOCUMENT ORIENTATION
- Identify document type and purpose
- Assess document quality and completeness
- Note any obvious anomalies or concerns
- Establish medical context (patient age, gender, specialty)

STEP 2: MEDICAL TERMINOLOGY ANALYSIS
- Identify and validate medical terms using standard nomenclature
- Cross-reference abbreviations with medical context
- Flag any non-standard or potentially erroneous terminology
- Apply appropriate medical coding (SNOMED-CT, ICD-10, CPT, LOINC)

STEP 3: CLINICAL LOGIC VALIDATION
- Assess whether findings are clinically consistent
- Validate normal ranges and reference values
- Check for logical medical relationships
- Identify any contradictory or impossible findings

STEP 4: SAFETY AND CRITICALITY ASSESSMENT
- Identify any critical values or findings
- Flag potential safety concerns or urgent conditions
- Note any drug allergies or contraindications
- Assess for infectious disease precautions

STEP 5: CONFIDENCE AND QUALITY SCORING
- Assign confidence scores based on text clarity and medical plausibility
- Note any areas requiring medical professional review
- Identify partial or incomplete information
- Flag any extraction uncertainties

Think through each step systematically, explaining your reasoning process as you extract information.
`;
  }

  private getSpecializationPrompt(documentType: string): string {
    const specializations = {
      'laboratory_results': `
LABORATORY RESULTS SPECIALIZATION:

When analyzing laboratory results, apply these specific reasoning steps:

1. PANEL IDENTIFICATION:
   - Determine the type of laboratory panel (CBC, CMP, lipid panel, etc.)
   - Understand which tests are typically included together
   - Recognize normal test ordering patterns

2. REFERENCE RANGE VALIDATION:
   - Verify reference ranges are appropriate for patient demographics
   - Check for age-specific or gender-specific normal ranges
   - Validate units of measurement consistency

3. CRITICAL VALUE RECOGNITION:
   - Apply knowledge of life-threatening laboratory values
   - Understand which combinations of abnormal values are concerning
   - Recognize patterns suggesting specific medical conditions

4. CLINICAL CORRELATION:
   - Consider how laboratory values relate to potential diagnoses
   - Understand which values require immediate medical attention
   - Recognize laboratory patterns in common diseases
`,

      'prescription': `
PRESCRIPTION SPECIALIZATION:

When analyzing prescriptions, apply these medication safety principles:

1. MEDICATION VALIDATION:
   - Verify medication names against standard drug databases
   - Check for proper generic/brand name relationships
   - Validate dosage forms and strengths

2. DOSING ASSESSMENT:
   - Verify dosages are within normal therapeutic ranges
   - Check for age-appropriate dosing
   - Assess frequency and route appropriateness

3. SAFETY SCREENING:
   - Look for potential drug interactions
   - Check for contraindications based on patient context
   - Verify prescription completeness and legibility

4. CLINICAL APPROPRIATENESS:
   - Assess if medications match likely medical conditions
   - Check for appropriate therapy duration
   - Validate prescriber authorization level for controlled substances
`,

      'clinical_notes': `
CLINICAL NOTES SPECIALIZATION:

When analyzing clinical notes, apply these clinical reasoning principles:

1. SOAP FRAMEWORK APPLICATION:
   - Structure extraction around Subjective, Objective, Assessment, Plan
   - Maintain clinical reasoning flow and logic
   - Preserve provider's diagnostic thought process

2. DIFFERENTIAL DIAGNOSIS REASONING:
   - Understand how symptoms lead to diagnostic considerations
   - Recognize diagnostic criteria for common conditions
   - Assess completeness of workup and evaluation

3. TREATMENT APPROPRIATENESS:
   - Validate treatment plans match documented diagnoses
   - Check for evidence-based therapy selections
   - Assess medication choices and dosing rationales

4. FOLLOW-UP LOGIC:
   - Understand appropriate follow-up intervals for conditions
   - Recognize when specialist referrals are indicated
   - Assess patient education and compliance factors
`
    };

    return specializations[documentType] || specializations['clinical_notes'];
  }

  private getContextualPrompt(medicalContext: MedicalContext): string {
    let contextPrompt = '\nCONTEXTUAL CONSIDERATIONS:\n';

    if (medicalContext.patientAge) {
      if (medicalContext.patientAge < 18) {
        contextPrompt += `
PEDIATRIC CONTEXT:
- Apply pediatric normal ranges and dosing guidelines
- Consider developmental stage-appropriate medical procedures
- Be alert for age-inappropriate medications or procedures
- Recognize pediatric-specific medical conditions and presentations
`;
      } else if (medicalContext.patientAge > 65) {
        contextPrompt += `
GERIATRIC CONTEXT:
- Consider age-related changes in normal laboratory values
- Apply geriatric dosing considerations for medications
- Be alert for polypharmacy and drug interaction risks
- Recognize geriatric syndromes and age-related conditions
`;
      }
    }

    if (medicalContext.medicalSpecialty) {
      contextPrompt += `
SPECIALTY CONTEXT (${medicalContext.medicalSpecialty}):
- Apply specialty-specific normal ranges and procedures
- Use specialty-appropriate medical terminology and coding
- Understand typical diagnostic and treatment patterns for this specialty
- Recognize specialty-specific critical values and safety considerations
`;
    }

    if (medicalContext.urgencyLevel) {
      contextPrompt += `
URGENCY CONTEXT (${medicalContext.urgencyLevel}):
- Prioritize critical findings and safety concerns
- Apply appropriate urgency to abnormal values
- Consider time-sensitive medical interventions
- Flag any findings requiring immediate medical attention
`;
    }

    return contextPrompt;
  }
}
```

---

## Few-Shot Learning Examples

### Medical Document Examples Repository
```typescript
class MedicalExamplesRepository {
  getLaboratoryExamples(): FewShotExample[] {
    return [
      {
        documentType: 'laboratory_results',
        inputDescription: 'Complete Blood Count (CBC) with differential',
        expectedOutput: {
          "laboratoryTests": [
            {
              "testName": "White Blood Cell Count",
              "result": "7.2",
              "units": "x10³/μL",
              "referenceRange": "4.0-11.0 x10³/μL",
              "abnormalFlag": "Normal",
              "loincCode": "6690-2",
              "confidence": 0.98
            },
            {
              "testName": "Hemoglobin",
              "result": "8.5",
              "units": "g/dL",
              "referenceRange": "12.0-15.5 g/dL",
              "abnormalFlag": "L",
              "criticalValue": false,
              "loincCode": "718-7",
              "confidence": 0.96,
              "clinicalSignificance": "Mild anemia requiring evaluation"
            }
          ]
        },
        reasoning: "CBC results show normal WBC but low hemoglobin indicating anemia. Flagged appropriately with clinical significance noted."
      },

      {
        documentType: 'laboratory_results',
        inputDescription: 'Basic Metabolic Panel with critical potassium',
        expectedOutput: {
          "laboratoryTests": [
            {
              "testName": "Potassium",
              "result": "2.7",
              "units": "mEq/L",
              "referenceRange": "3.5-5.1 mEq/L",
              "abnormalFlag": "Critical",
              "criticalValue": true,
              "loincCode": "2823-3",
              "confidence": 0.99
            }
          ],
          "criticalFindings": [
            {
              "testName": "Potassium",
              "result": "2.7",
              "units": "mEq/L",
              "criticalThreshold": "<3.0 mEq/L",
              "clinicalSignificance": "Severe hypokalemia requiring immediate medical attention and cardiac monitoring"
            }
          ]
        },
        reasoning: "Critical potassium value properly identified and flagged for immediate medical attention with appropriate clinical context."
      }
    ];
  }

  getPrescriptionExamples(): FewShotExample[] {
    return [
      {
        documentType: 'prescription',
        inputDescription: 'Standard outpatient prescription with multiple medications',
        expectedOutput: {
          "medications": [
            {
              "name": "Lisinopril",
              "genericName": "lisinopril",
              "strength": "10mg",
              "dosageForm": "tablet",
              "directions": "Take one tablet by mouth once daily",
              "quantity": "30 tablets",
              "refills": "5",
              "daysSupply": "30",
              "confidence": 0.96
            },
            {
              "name": "Metformin",
              "genericName": "metformin hydrochloride",
              "strength": "500mg",
              "dosageForm": "tablet",
              "directions": "Take one tablet by mouth twice daily with meals",
              "quantity": "60 tablets",
              "refills": "3",
              "daysSupply": "30",
              "confidence": 0.94
            }
          ]
        },
        reasoning: "Standard chronic disease medications with appropriate dosing, quantities, and refills for ongoing management."
      }
    ];
  }

  getClinicalNotesExamples(): FewShotExample[] {
    return [
      {
        documentType: 'clinical_notes',
        inputDescription: 'Hypertension follow-up visit with medication adjustment',
        expectedOutput: {
          "chiefComplaint": {
            "primaryConcern": "Follow-up for high blood pressure",
            "duration": "3 months since last visit",
            "confidence": 0.92
          },
          "physicalExamination": {
            "vitalSigns": {
              "bloodPressure": {"systolic": 158, "diastolic": 92, "unit": "mmHg"},
              "heartRate": {"value": 76, "unit": "bpm"},
              "confidence": 0.98
            }
          },
          "clinicalAssessment": {
            "primaryDiagnosis": {
              "condition": "Essential hypertension",
              "icd10Code": "I10",
              "snomedCode": "59621000",
              "confidence": 0.96
            }
          },
          "treatmentPlan": {
            "medications": [
              {
                "name": "Lisinopril",
                "dosage": "20mg",
                "frequency": "once daily",
                "change": "increased from 10mg",
                "confidence": 0.94
              }
            ]
          }
        },
        reasoning: "Routine hypertension follow-up with medication adjustment based on elevated blood pressure readings."
      }
    ];
  }
}
```

---

## Dynamic Prompt Adaptation

### Context-Aware Prompt Generation
```typescript
class AdaptivePromptEngine {
  async generateAdaptivePrompt(
    documentAnalysis: DocumentAnalysis,
    processingContext: ProcessingContext
  ): Promise<AdaptivePrompt> {
    
    // Analyze document characteristics
    const documentComplexity = await this.assessDocumentComplexity(documentAnalysis);
    const medicalSpecialty = await this.identifyMedicalSpecialty(documentAnalysis);
    const extractionChallenges = await this.identifyExtractionChallenges(documentAnalysis);
    
    // Generate base prompt structure
    const basePrompt = await this.generateBasePrompt(documentAnalysis.documentType);
    
    // Add complexity-specific enhancements
    const complexityEnhancements = this.getComplexityEnhancements(documentComplexity);
    
    // Add specialty-specific instructions
    const specialtyInstructions = this.getSpecialtyInstructions(medicalSpecialty);
    
    // Add challenge-specific guidance
    const challengeGuidance = this.getChallengeGuidance(extractionChallenges);
    
    // Combine and optimize prompt
    const adaptivePrompt = this.combinePromptComponents(
      basePrompt,
      complexityEnhancements,
      specialtyInstructions,
      challengeGuidance
    );
    
    // Add few-shot examples if beneficial
    const fewShotExamples = await this.selectRelevantExamples(
      documentAnalysis,
      processingContext
    );
    
    return {
      prompt: adaptivePrompt,
      fewShotExamples,
      processingHints: this.generateProcessingHints(documentAnalysis),
      expectedDifficulty: documentComplexity.score,
      estimatedAccuracy: this.estimateAccuracy(documentComplexity, medicalSpecialty),
      adaptationReasons: this.documentAdaptationReasons(
        documentComplexity,
        medicalSpecialty,
        extractionChallenges
      )
    };
  }

  private async assessDocumentComplexity(
    documentAnalysis: DocumentAnalysis
  ): Promise<DocumentComplexity> {
    
    let complexityScore = 0.5; // Base complexity
    const complexityFactors: ComplexityFactor[] = [];
    
    // Image quality assessment
    if (documentAnalysis.imageQuality.score < 0.7) {
      complexityScore += 0.2;
      complexityFactors.push({
        factor: 'poor_image_quality',
        impact: 0.2,
        description: 'Low image quality requires enhanced OCR processing'
      });
    }
    
    // Handwriting detection
    if (documentAnalysis.hasHandwriting && documentAnalysis.handwritingQuality < 0.6) {
      complexityScore += 0.3;
      complexityFactors.push({
        factor: 'poor_handwriting',
        impact: 0.3,
        description: 'Poor handwriting quality requires specialized processing'
      });
    }
    
    // Layout complexity
    if (documentAnalysis.layoutComplexity > 0.7) {
      complexityScore += 0.15;
      complexityFactors.push({
        factor: 'complex_layout',
        impact: 0.15,
        description: 'Complex document layout with multiple sections'
      });
    }
    
    // Medical terminology density
    if (documentAnalysis.medicalTerminologyDensity > 0.8) {
      complexityScore += 0.1;
      complexityFactors.push({
        factor: 'high_terminology_density',
        impact: 0.1,
        description: 'High density of specialized medical terminology'
      });
    }
    
    // Multi-language content
    if (documentAnalysis.hasMultiLanguage) {
      complexityScore += 0.2;
      complexityFactors.push({
        factor: 'multi_language_content',
        impact: 0.2,
        description: 'Document contains multiple languages'
      });
    }
    
    return {
      score: Math.min(complexityScore, 1.0),
      factors: complexityFactors,
      overallAssessment: this.categorizeComplexity(complexityScore),
      processingRecommendations: this.getProcessingRecommendations(complexityScore)
    };
  }

  private getComplexityEnhancements(complexity: DocumentComplexity): string {
    if (complexity.score < 0.3) {
      return `
DOCUMENT COMPLEXITY: LOW
- Standard extraction approach is sufficient
- Focus on accuracy and completeness
- Apply normal confidence thresholds
`;
    } else if (complexity.score < 0.6) {
      return `
DOCUMENT COMPLEXITY: MODERATE
- Use enhanced OCR interpretation techniques
- Pay extra attention to unclear text areas
- Cross-validate extracted information for consistency
- Lower confidence thresholds for unclear sections
`;
    } else if (complexity.score < 0.8) {
      return `
DOCUMENT COMPLEXITY: HIGH
- Apply advanced text interpretation strategies
- Use contextual clues to resolve ambiguous text
- Consider multiple interpretations for unclear sections
- Flag areas requiring human verification
- Use medical knowledge to validate extracted information
`;
    } else {
      return `
DOCUMENT COMPLEXITY: VERY HIGH
- This document requires specialized processing approaches
- Use all available contextual information to aid interpretation
- Break down extraction into smaller, manageable sections
- Apply maximum scrutiny to all extracted information
- Consider multi-pass processing for critical sections
- Flag entire document for medical professional review if confidence is low
`;
    }
  }

  private getSpecialtyInstructions(specialty: MedicalSpecialty): string {
    const specialtyInstructions = {
      'cardiology': `
CARDIOLOGY SPECIALTY INSTRUCTIONS:
- Pay special attention to cardiac rhythm descriptions
- Understand echocardiogram and EKG terminology
- Recognize cardiac medication classes and their purposes
- Apply knowledge of cardiac procedures and interventions
- Understand hemodynamic measurements and their significance
`,
      
      'endocrinology': `
ENDOCRINOLOGY SPECIALTY INSTRUCTIONS:
- Focus on hormone levels and endocrine function tests
- Understand diabetes management terminology and measurements
- Recognize thyroid function test patterns
- Apply knowledge of hormone replacement therapies
- Understand glucose monitoring and insulin dosing
`,
      
      'pediatrics': `
PEDIATRICS SPECIALTY INSTRUCTIONS:
- Apply age-appropriate normal ranges for all values
- Understand developmental milestone assessments
- Recognize pediatric medication dosing patterns
- Be alert for age-inappropriate procedures or medications
- Understand growth chart and percentile interpretations
`,
      
      'geriatrics': `
GERIATRICS SPECIALTY INSTRUCTIONS:
- Consider age-related changes in normal laboratory values
- Apply geriatric dosing considerations for medications
- Recognize geriatric syndromes and presentations
- Be alert for polypharmacy and drug interactions
- Understand cognitive assessment tools and scores
`
    };
    
    return specialtyInstructions[specialty?.name] || `
GENERAL MEDICINE INSTRUCTIONS:
- Apply standard adult normal ranges and references
- Use general medical knowledge for interpretation
- Consider common medical conditions and presentations
- Apply standard medication dosing guidelines
`;
  }
}
```

---

## Prompt Optimization and Testing

### A/B Testing Framework for Prompts
```typescript
class PromptOptimizationEngine {
  async runPromptABTest(
    testConfiguration: PromptTestConfig
  ): Promise<PromptTestResults> {
    
    const testResults: PromptTestResult[] = [];
    
    for (const promptVariant of testConfiguration.promptVariants) {
      const variantResults = await this.testPromptVariant(
        promptVariant,
        testConfiguration.testDocuments
      );
      
      testResults.push({
        promptId: promptVariant.id,
        promptVersion: promptVariant.version,
        accuracy: variantResults.accuracy,
        processingTime: variantResults.averageProcessingTime,
        confidence: variantResults.averageConfidence,
        cost: variantResults.averageCost,
        errorRate: variantResults.errorRate,
        medicalAccuracy: variantResults.medicalAccuracy,
        detailedResults: variantResults.detailedResults
      });
    }
    
    // Analyze results and determine winning prompt
    const winningPrompt = this.analyzeTestResults(testResults);
    
    // Generate optimization recommendations
    const optimizationRecommendations = this.generateOptimizationRecommendations(
      testResults
    );
    
    return {
      testId: testConfiguration.testId,
      testDuration: testConfiguration.duration,
      winningPrompt,
      allResults: testResults,
      statisticalSignificance: this.calculateStatisticalSignificance(testResults),
      optimizationRecommendations,
      nextTestSuggestions: this.suggestNextTests(testResults)
    };
  }

  private async testPromptVariant(
    promptVariant: PromptVariant,
    testDocuments: TestDocument[]
  ): Promise<VariantTestResults> {
    
    const results: DocumentTestResult[] = [];
    
    for (const document of testDocuments) {
      const startTime = Date.now();
      
      try {
        const extractionResult = await this.gpt4oMiniProcessor.processDocument(
          document.path,
          document.metadata,
          { prompt: promptVariant.prompt }
        );
        
        const endTime = Date.now();
        
        // Compare against ground truth
        const accuracy = await this.calculateAccuracy(
          extractionResult,
          document.groundTruth
        );
        
        const medicalAccuracy = await this.calculateMedicalAccuracy(
          extractionResult,
          document.groundTruth
        );
        
        results.push({
          documentId: document.id,
          accuracy: accuracy.overallAccuracy,
          medicalAccuracy: medicalAccuracy.clinicalAccuracy,
          confidence: extractionResult.confidence,
          processingTime: endTime - startTime,
          cost: extractionResult.cost,
          errors: accuracy.errors,
          warnings: accuracy.warnings
        });
        
      } catch (error) {
        results.push({
          documentId: document.id,
          accuracy: 0,
          medicalAccuracy: 0,
          confidence: 0,
          processingTime: Date.now() - startTime,
          cost: 0,
          errors: [error.message],
          warnings: []
        });
      }
    }
    
    return {
      accuracy: this.calculateMeanAccuracy(results),
      averageProcessingTime: this.calculateMeanProcessingTime(results),
      averageConfidence: this.calculateMeanConfidence(results),
      averageCost: this.calculateMeanCost(results),
      errorRate: this.calculateErrorRate(results),
      medicalAccuracy: this.calculateMeanMedicalAccuracy(results),
      detailedResults: results
    };
  }

  async optimizePromptBasedOnErrors(
    currentPrompt: string,
    errorPatterns: ErrorPattern[]
  ): Promise<OptimizedPrompt> {
    
    const optimizations: PromptOptimization[] = [];

    // The `human_corrections` table (part of the Correction Feedback Loop) is the primary data source 
    // for identifying the `ErrorPattern[]` to be used by this function. This creates a direct link 
    // between manual review and automated prompt improvement.
    
    for (const errorPattern of errorPatterns) {
      switch (errorPattern.category) {
        case 'medical_terminology_errors':
          optimizations.push({
            type: 'terminology_enhancement',
            modification: this.generateTerminologyEnhancement(errorPattern),
            expectedImpact: 'Improved medical terminology recognition'
          });
          break;
          
        case 'numerical_extraction_errors':
          optimizations.push({
            type: 'numerical_validation',
            modification: this.generateNumericalValidation(errorPattern),
            expectedImpact: 'Better numerical value extraction and validation'
          });
          break;
          
        case 'spatial_coordinate_errors':
          optimizations.push({
            type: 'spatial_enhancement',
            modification: this.generateSpatialEnhancement(errorPattern),
            expectedImpact: 'More accurate spatial coordinate extraction'
          });
          break;
          
        case 'confidence_calibration_errors':
          optimizations.push({
            type: 'confidence_tuning',
            modification: this.generateConfidenceCalibration(errorPattern),
            expectedImpact: 'Better confidence score calibration'
          });
          break;
      }
    }
    
    // Apply optimizations to create new prompt
    const optimizedPrompt = this.applyOptimizations(currentPrompt, optimizations);
    
    return {
      originalPrompt: currentPrompt,
      optimizedPrompt,
      appliedOptimizations: optimizations,
      expectedImprovements: optimizations.map(o => o.expectedImpact),
      testingRecommendations: this.generateTestingRecommendations(optimizations)
    };
  }
}
```

---

*The Prompt Engineering Framework ensures Guardian's AI extraction achieves maximum medical accuracy through sophisticated prompt design, adaptive optimization, and continuous improvement based on real-world performance metrics and medical professional feedback.*