# Pass 1 Bridge Schema and AI Prompts

**Status**: Implementation Ready - Complete AI Integration Specification
**Created**: 29 September 2025
**Last Updated**: 29 September 2025

## Overview

This document provides the complete bridge schema and prompt system for Pass 1 entity detection. It defines the exact AI model input/output format, classification taxonomy, and prompt templates needed to implement Pass 1 processing.

## Bridge Schema Definition

### Input Schema (To AI Model)
```typescript
interface Pass1InputSchema {
  document_metadata: {
    shell_file_id: string;
    filename: string;
    file_type: string;
    page_count: number;
    patient_id: string;
    processing_session_id: string;
    upload_timestamp: string;
  };

  // PRIMARY INPUT: Raw uploaded file for AI vision analysis
  raw_file: {
    file_data: Base64String;          // Original file as base64 for vision model
    file_type: string;                // 'image/jpeg', 'application/pdf', etc.
    filename: string;                 // Original filename
    file_size: number;                // File size in bytes
    mime_type: string;                // Full MIME type
  };

  // SECONDARY INPUT: OCR spatial mapping for coordinate reference
  ocr_spatial_data: {
    extracted_text: string;           // OCR's text interpretation
    spatial_mapping: SpatialMapping[]; // Bbox coordinates for each text element
    ocr_confidence: number;           // Overall OCR confidence (0.0-1.0)
    processing_time_ms: number;       // OCR processing time
    ocr_provider: string;             // 'google_vision', 'aws_textract', etc.
    page_breaks: number[];            // Positions of page breaks in text
    word_count: number;               // Total words detected by OCR
  };

  processing_context: {
    model_name: string;               // AI model being used (GPT-4o, Claude Vision)
    vision_capable: boolean;          // Whether model supports vision input
    token_budget: number;             // Maximum tokens for processing
    confidence_threshold: number;     // Minimum confidence for entities
    require_complete_coverage: boolean; // Must classify 100% of content
    enable_cross_validation: boolean; // Enable AI-OCR agreement analysis
  };

  classification_taxonomy: EntityClassificationTaxonomy; // Complete 3-category system
}

interface SpatialMapping {
  text_segment: string;               // Text segment from OCR
  page_number: number;                // Page where text appears
  bounding_box: {
    x: number;                        // Left edge pixel coordinate
    y: number;                        // Top edge pixel coordinate
    width: number;                    // Width in pixels
    height: number;                   // Height in pixels
  };
  line_number: number;                // Line position on page
  word_index: number;                 // Word position in document sequence
  confidence: number;                 // OCR confidence for this text element
}
```

### Output Schema (From AI Model)
```typescript
interface Pass1OutputSchema {
  processing_metadata: {
    model_used: string;               // GPT-4o, Claude Sonnet Vision, etc.
    vision_processing: boolean;       // Whether vision model was used
    processing_time_seconds: number;
    token_usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      image_tokens?: number;          // For vision models
    };
    cost_estimate: number;
    confidence_metrics: {
      overall_confidence: number;
      visual_interpretation_confidence: number;
      category_confidence: {
        clinical_event: number;
        healthcare_context: number;
        document_structure: number;
      };
    };
  };

  entities: EntityDetectionResult[];

  document_coverage: {
    total_content_processed: number;   // Total visual content analyzed
    content_classified: number;        // Content successfully classified
    coverage_percentage: number;       // Percentage of document covered
    unclassified_segments: string[];   // Any content not classified
    visual_quality_score: number;      // AI assessment of image quality
  };

  cross_validation_results: {
    ai_ocr_agreement_score: number;    // Overall agreement between AI and OCR
    high_discrepancy_count: number;    // Entities with significant disagreement
    ocr_missed_entities: number;       // Entities AI found but OCR missed
    ai_missed_ocr_text: number;        // OCR text AI didn't identify as entities
    spatial_mapping_success_rate: number; // % of AI entities mapped to OCR coordinates
  };

  quality_assessment: {
    completeness_score: number;        // 0.0-1.0
    classification_confidence: number; // 0.0-1.0
    cross_validation_score: number;    // AI-OCR agreement quality
    requires_manual_review: boolean;
    quality_flags: string[];           // low_confidence, high_discrepancy, etc.
  };

  profile_safety: {
    patient_identity_confidence: number;
    age_appropriateness_score: number;
    safety_flags: string[];
    requires_identity_verification: boolean;
  };
}

interface EntityDetectionResult {
  entity_id: string;                  // Unique identifier for this entity
  original_text: string;              // AI's interpretation of the text
  normalized_text?: string;           // Cleaned/normalized version if needed

  classification: {
    entity_category: 'clinical_event' | 'healthcare_context' | 'document_structure';
    entity_subtype: string;           // Specific subtype (vital_sign, medication, etc.)
    confidence: number;               // 0.0-1.0 overall confidence score
  };

  // DUAL-INPUT ANALYSIS
  visual_interpretation: {
    ai_sees: string;                  // What AI vision model detected
    formatting_context: string;      // Visual formatting description
    visual_quality: string;          // "clear", "blurred", "handwritten", etc.
    ai_confidence: number;           // AI's confidence in visual interpretation (0.0-1.0)
  };

  ocr_cross_reference: {
    ocr_text: string | null;         // What OCR extracted (null if OCR missed)
    ocr_confidence: number | null;   // OCR's confidence in this text
    ai_ocr_agreement: number;        // 0.0-1.0 agreement score
    discrepancy_type: string | null; // "abbreviation", "character_error", "missing_text", etc.
    discrepancy_notes: string | null; // Human-readable explanation
  };

  spatial_information: {
    page_number: number;              // Page where entity appears
    bounding_box: BoundingBox | null; // Coordinates from OCR (null if AI-only)
    unique_marker: string;            // Searchable text pattern for relocation
    location_context: string;         // AI-generated location description
    spatial_source: 'ocr_exact' | 'ocr_approximate' | 'ai_estimated' | 'none';
  };

  processing_routing: {
    requires_schemas: string[];       // Database schemas for Pass 2
    processing_priority: 'highest' | 'high' | 'medium' | 'low' | 'logging_only';
    skip_pass2: boolean;              // True for document_structure
    enrichment_complexity: 'simple' | 'moderate' | 'complex';
  };

  clinical_context?: {
    medical_relevance: 'high' | 'medium' | 'low';
    timeline_significance: boolean;   // Should appear on patient timeline
    requires_coding: boolean;         // Needs medical coding in Pass 2
    safety_critical: boolean;         // Critical for patient safety
  };

  quality_indicators: {
    detection_confidence: number;     // How sure we are this is an entity
    classification_confidence: number; // How sure we are of the category/subtype
    cross_validation_score: number;  // AI-OCR agreement quality
    text_clarity: number;            // How clear/readable the source text is
    context_availability: number;    // How much context is available
    requires_manual_review: boolean; // Flag for human review
  };
}
```

## Complete Entity Classification Taxonomy

### Category 1: Clinical Events (Full Pass 2 Enrichment)
```typescript
const CLINICAL_EVENT_SUBTYPES = {
  // Observational Data
  vital_sign: {
    description: 'Physiological measurements and vital signs',
    examples: ['blood pressure: 140/90 mmHg', 'temperature: 98.6°F', 'pulse: 72 bpm', 'oxygen saturation: 98%'],
    schemas: ['patient_clinical_events', 'patient_observations', 'patient_vitals'],
    priority: 'highest',
    timeline_relevance: true,
    requires_coding: true
  },

  lab_result: {
    description: 'Laboratory test results and diagnostic values',
    examples: ['glucose: 95 mg/dL', 'CBC: WBC 7.2', 'HbA1c: 6.1%', 'cholesterol: 180 mg/dL'],
    schemas: ['patient_clinical_events', 'patient_observations', 'patient_lab_results'],
    priority: 'highest',
    timeline_relevance: true,
    requires_coding: true
  },

  physical_finding: {
    description: 'Clinical examination findings and observations',
    examples: ['heart murmur grade 2/6', 'bilateral breath sounds clear', 'abdomen soft, non-tender'],
    schemas: ['patient_clinical_events', 'patient_observations'],
    priority: 'high',
    timeline_relevance: true,
    requires_coding: true
  },

  symptom: {
    description: 'Patient-reported symptoms and complaints',
    examples: ['chest pain', 'shortness of breath', 'headache for 3 days', 'nausea and vomiting'],
    schemas: ['patient_clinical_events', 'patient_observations'],
    priority: 'high',
    timeline_relevance: true,
    requires_coding: true
  },

  // Interventional Data
  medication: {
    description: 'Prescribed or administered medications',
    examples: ['Lisinopril 10mg daily', 'Tylenol 500mg PRN', 'Insulin 20 units BID', 'Aspirin 81mg'],
    schemas: ['patient_clinical_events', 'patient_interventions', 'patient_medications'],
    priority: 'highest',
    timeline_relevance: true,
    requires_coding: true
  },

  procedure: {
    description: 'Medical procedures and treatments performed',
    examples: ['colonoscopy', 'chest X-ray', 'physical therapy session', 'blood draw'],
    schemas: ['patient_clinical_events', 'patient_interventions'],
    priority: 'high',
    timeline_relevance: true,
    requires_coding: true
  },

  immunization: {
    description: 'Vaccines and immunizations administered',
    examples: ['COVID-19 vaccine', 'flu shot 2024', 'Tdap booster', 'MMR vaccine'],
    schemas: ['patient_clinical_events', 'patient_interventions', 'patient_immunizations'],
    priority: 'high',
    timeline_relevance: true,
    requires_coding: true
  },

  // Diagnostic Data
  diagnosis: {
    description: 'Medical diagnoses and conditions',
    examples: ['Type 2 Diabetes', 'Hypertension', 'Acute bronchitis', 'Anxiety disorder'],
    schemas: ['patient_clinical_events', 'patient_conditions'],
    priority: 'highest',
    timeline_relevance: true,
    requires_coding: true
  },

  allergy: {
    description: 'Known allergies and adverse reactions',
    examples: ['penicillin allergy', 'shellfish intolerance', 'latex sensitivity', 'pollen allergy'],
    schemas: ['patient_clinical_events', 'patient_allergies'],
    priority: 'highest',
    timeline_relevance: true,
    requires_coding: true
  },

  // Healthcare Encounters
  healthcare_encounter: {
    description: 'Clinical appointments, visits, and care encounters',
    examples: ['Follow-up visit 3/15/2024', 'Emergency room visit', 'Cardiology consultation'],
    schemas: ['patient_clinical_events', 'healthcare_encounters'],
    priority: 'high',
    timeline_relevance: true,
    requires_coding: false
  },

  // Failsafe
  clinical_other: {
    description: 'Clinical information that does not fit other subtypes',
    examples: ['Unclear medical reference', 'Complex clinical narrative', 'Ambiguous clinical finding'],
    schemas: ['patient_clinical_events'],
    priority: 'medium',
    timeline_relevance: true,
    requires_coding: false,
    manual_review_required: true
  }
};
```

### Category 2: Healthcare Context (Limited Pass 2 Enrichment)
```typescript
const HEALTHCARE_CONTEXT_SUBTYPES = {
  // Identity Information
  patient_identifier: {
    description: 'Patient identification information',
    examples: ['John Smith', 'DOB: 01/15/1980', 'MRN: 12345678', 'Patient ID: 987654'],
    schemas: ['healthcare_encounters'],
    priority: 'high',
    profile_matching: 'critical',
    pii_sensitivity: 'high'
  },

  provider_identifier: {
    description: 'Healthcare provider information',
    examples: ['Dr. Sarah Johnson, MD', 'Cardiology Associates', 'NPI: 1234567890'],
    schemas: ['healthcare_encounters'],
    priority: 'medium',
    profile_matching: 'medium',
    pii_sensitivity: 'medium'
  },

  facility_identifier: {
    description: 'Healthcare facility information',
    examples: ['Memorial Hospital', 'Radiology Department', 'Room 204', 'Emergency Department'],
    schemas: ['healthcare_encounters'],
    priority: 'low',
    profile_matching: 'low',
    pii_sensitivity: 'low'
  },

  // Healthcare Journey
  appointment: {
    description: 'Scheduled or completed appointments',
    examples: ['Follow-up visit 3/15/2024', 'Annual physical scheduled', 'Cancelled due to weather'],
    schemas: ['healthcare_encounters'],
    priority: 'medium',
    timeline_relevance: true
  },

  referral: {
    description: 'Referrals to other providers or specialists',
    examples: ['Refer to orthopedics', 'Cardiology consultation requested', 'PT evaluation ordered'],
    schemas: ['patient_clinical_events'],
    priority: 'medium',
    timeline_relevance: true
  },

  care_coordination: {
    description: 'Care plans and coordination activities',
    examples: ['Discharge plan', 'Care transition summary', 'Follow-up instructions'],
    schemas: ['patient_clinical_events'],
    priority: 'medium',
    timeline_relevance: true
  },

  // Administrative Healthcare
  insurance_information: {
    description: 'Insurance and coverage details',
    examples: ['Blue Cross Blue Shield', 'Policy #: ABC123', 'Copay: $25', 'Prior authorization'],
    schemas: ['healthcare_encounters'],
    priority: 'low',
    compliance_relevance: 'high'
  },

  billing_code: {
    description: 'Medical billing and procedure codes',
    examples: ['CPT 99213', 'ICD-10 E11.9', 'HCPCS G0439', 'DRG 294'],
    schemas: ['healthcare_encounters'],
    priority: 'low',
    compliance_relevance: 'high'
  },

  authorization: {
    description: 'Prior authorizations and approvals',
    examples: ['Prior auth approved', 'Insurance verification', 'Coverage determination'],
    schemas: ['healthcare_encounters'],
    priority: 'low',
    compliance_relevance: 'high'
  },

  // Failsafe
  healthcare_context_other: {
    description: 'Healthcare-related information that does not fit other subtypes',
    examples: ['Unclear healthcare reference', 'Ambiguous administrative content'],
    schemas: ['healthcare_encounters'],
    priority: 'low',
    manual_review_required: true
  }
};
```

### Category 3: Document Structure (Logging Only)
```typescript
const DOCUMENT_STRUCTURE_SUBTYPES = {
  header: {
    description: 'Document headers and letterheads',
    examples: ['Memorial Hospital Letterhead', 'Patient Report', 'Confidential'],
    processing: 'log_only'
  },

  footer: {
    description: 'Document footers and disclaimers',
    examples: ['Page 1 of 3', 'Printed on 01/15/2024', 'This is a legal document'],
    processing: 'log_only'
  },

  logo: {
    description: 'Institutional logos and graphics',
    examples: ['Hospital logo', 'Medical group emblem', 'Certification badges'],
    processing: 'log_only'
  },

  page_marker: {
    description: 'Page numbers and document navigation',
    examples: ['Page 2', 'Continued on next page', 'End of report'],
    processing: 'log_only'
  },

  signature_line: {
    description: 'Signature areas and authorization fields',
    examples: ['Physician signature:', '_______________', 'Electronically signed'],
    processing: 'log_only'
  },

  watermark: {
    description: 'Document watermarks and security features',
    examples: ['COPY', 'CONFIDENTIAL', 'DRAFT'],
    processing: 'log_only'
  },

  form_structure: {
    description: 'Form fields and layout elements',
    examples: ['Name: _____', 'Date: □/□/□', 'Check all that apply:'],
    processing: 'log_only'
  },

  document_structure_other: {
    description: 'Document elements that do not fit other structural categories',
    examples: ['Unclear formatting element', 'Unknown document artifact'],
    processing: 'log_only',
    manual_review_required: true
  }
};
```

## AI Prompt Templates

### Dual-Input Classification Prompt
```typescript
const ENHANCED_PASS1_CLASSIFICATION_PROMPT = `
You are a medical document entity detection system using DUAL INPUTS for maximum accuracy.

INPUT 1 - RAW DOCUMENT IMAGE:
[Base64 image data provided to vision model]

INPUT 2 - OCR SPATIAL REFERENCE:
OCR Text: "${ocr_data.extracted_text}"
Spatial Coordinates: ${JSON.stringify(ocr_data.spatial_mapping)}
OCR Confidence: ${ocr_data.ocr_confidence}
OCR Provider: ${ocr_data.ocr_provider}

PROCESSING INSTRUCTIONS:
1. PRIMARY ANALYSIS: Use your vision capabilities to interpret the raw document image
2. SPATIAL MAPPING: For each entity you identify visually, map it to the closest OCR spatial coordinates
3. CROSS-VALIDATION: Use OCR text as reference but trust your visual interpretation for accuracy
4. DISCREPANCY DETECTION: Note where your vision differs from OCR interpretation
5. QUALITY ASSESSMENT: Evaluate visual quality and readability of each entity

CRITICAL REQUIREMENTS:
1. Analyze the RAW IMAGE as your primary source of truth
2. Use OCR data for spatial coordinates and cross-validation
3. Flag significant discrepancies between your vision and OCR
4. Identify 100% of document content visible in the image
5. Map each visual entity to the closest OCR spatial coordinates when available
6. Mark spatial_source appropriately based on coordinate accuracy

CLASSIFICATION CATEGORIES:

=== CLINICAL EVENTS (Full medical analysis required) ===
These entities require full Pass 2 medical enrichment and timeline integration:

• vital_sign: Physiological measurements (BP: 140/90, temp: 98.6°F, pulse: 72 bpm)
• lab_result: Laboratory test results (glucose: 95 mg/dL, HbA1c: 6.1%)
• physical_finding: Clinical examination findings (heart murmur, clear breath sounds)
• symptom: Patient-reported symptoms (chest pain, shortness of breath)
• medication: Prescribed medications (Lisinopril 10mg daily, Tylenol PRN)
• procedure: Medical procedures (colonoscopy, chest X-ray, blood draw)
• immunization: Vaccines administered (COVID-19 vaccine, flu shot)
• diagnosis: Medical diagnoses (Type 2 Diabetes, Hypertension)
• allergy: Known allergies (penicillin allergy, shellfish intolerance)
• healthcare_encounter: Clinical visits (follow-up visit, ER visit, consultation)
• clinical_other: Clinical information not fitting other subtypes (requires manual review)

=== HEALTHCARE CONTEXT (Profile matching and context) ===
These entities require limited Pass 2 enrichment for context and compliance:

• patient_identifier: Patient ID info (John Smith, DOB: 01/15/1980, MRN: 12345)
• provider_identifier: Healthcare provider info (Dr. Sarah Johnson, NPI: 1234567890)
• facility_identifier: Healthcare facility info (Memorial Hospital, Room 204)
• appointment: Scheduled appointments (follow-up visit 3/15/2024, annual physical)
• referral: Provider referrals (refer to orthopedics, cardiology consultation)
• care_coordination: Care plans (discharge plan, follow-up instructions)
• insurance_information: Coverage details (Blue Cross, Policy #: ABC123)
• billing_code: Medical codes (CPT 99213, ICD-10 E11.9)
• authorization: Prior authorizations (insurance verification, prior auth approved)
• healthcare_context_other: Healthcare info not fitting other subtypes

=== DOCUMENT STRUCTURE (Logging only - no medical enrichment) ===
These entities are logged for completeness but require no medical processing:

• header: Document headers and letterheads
• footer: Document footers and disclaimers
• logo: Institutional logos and graphics
• page_marker: Page numbers and navigation elements
• signature_line: Signature areas and authorization fields
• watermark: Document watermarks and security features
• form_structure: Form fields and layout elements
• document_structure_other: Structural elements not fitting other categories

ENTITY DISAMBIGUATION RULES:
- If substance name with dosage → medication; if condition name → diagnosis
- If scheduled/future → appointment; if performed/completed → procedure
- If with credentials/title → provider_identifier; if signature line → signature_line
- When entity spans multiple categories, split into separate entities
- When uncertain, prefer clinical relevance over document structure

RESPONSE FORMAT:
Return a JSON object with this exact structure:

{
  "processing_metadata": {
    "model_used": "${model_name}",
    "vision_processing": true,
    "total_entities_detected": <number>,
    "processing_time_estimate": <seconds>,
    "overall_confidence": <0.0-1.0>,
    "visual_interpretation_confidence": <0.0-1.0>
  },
  "entities": [
    {
      "entity_id": "ent_001",
      "original_text": "what_you_see_in_image",
      "entity_category": "clinical_event|healthcare_context|document_structure",
      "entity_subtype": "specific_subtype_from_above",
      "confidence": 0.95,
      "visual_interpretation": {
        "ai_sees": "exact_visual_text",
        "formatting_context": "bold header with indented values",
        "visual_quality": "clear typed text",
        "ai_confidence": 0.95
      },
      "ocr_cross_reference": {
        "ocr_text": "what_ocr_extracted",
        "ocr_confidence": 0.88,
        "ai_ocr_agreement": 0.92,
        "discrepancy_type": "abbreviation",
        "discrepancy_notes": "OCR abbreviated 'Blood Pressure' as 'BP'"
      },
      "spatial_information": {
        "page_number": 1,
        "bounding_box": {"x": 245, "y": 356, "width": 185, "height": 18},
        "location_context": "page 1, vital signs section",
        "spatial_source": "ocr_exact"
      },
      "quality_indicators": {
        "detection_confidence": 0.95,
        "classification_confidence": 0.93,
        "cross_validation_score": 0.92,
        "requires_manual_review": false
      }
    }
  ],
  "document_coverage": {
    "total_content_processed": <number>,
    "content_classified": <number>,
    "coverage_percentage": <0-100>,
    "unclassified_segments": ["any content not classified"],
    "visual_quality_score": <0.0-1.0>
  },
  "cross_validation_results": {
    "ai_ocr_agreement_score": <0.0-1.0>,
    "high_discrepancy_count": <number>,
    "ocr_missed_entities": <number>,
    "ai_missed_ocr_text": <number>,
    "spatial_mapping_success_rate": <0.0-1.0>
  },
  "quality_assessment": {
    "completeness_score": <0.0-1.0>,
    "classification_confidence": <0.0-1.0>,
    "cross_validation_score": <0.0-1.0>,
    "requires_manual_review": true/false,
    "quality_flags": ["low_confidence", "high_discrepancy", etc.]
  }
}

DOCUMENT PROCESSING:
Raw Image: [Provided as base64 image input to vision model]
OCR Reference Text: ${ocr_data.extracted_text}
OCR Spatial Mapping: ${JSON.stringify(ocr_data.spatial_mapping)}

Process this document using both visual analysis and OCR cross-validation.
`;
```

### Validation Prompt (For Quality Assurance)
```typescript
const PASS1_VALIDATION_PROMPT = `
You are a medical document validation system. Review the entity classification results and identify any issues.

VALIDATION CRITERIA:
1. Document Coverage: Is 100% of the text classified?
2. Category Accuracy: Are entities in the correct categories?
3. Subtype Precision: Are subtypes appropriate for the text?
4. Confidence Levels: Are confidence scores realistic?
5. Medical Relevance: Are clinical entities properly identified?

ORIGINAL DOCUMENT:
{{document_text}}

CLASSIFICATION RESULTS:
{{classification_results}}

VALIDATION RESPONSE FORMAT:
{
  "validation_results": {
    "coverage_validation": {
      "complete_coverage": true/false,
      "missing_segments": ["text not classified"],
      "coverage_score": <0.0-1.0>
    },
    "category_validation": {
      "category_accuracy": <0.0-1.0>,
      "misclassified_entities": [
        {
          "entity_id": "ent_001",
          "current_category": "healthcare_context",
          "suggested_category": "clinical_event",
          "reason": "Blood pressure reading should be clinical_event"
        }
      ]
    },
    "confidence_validation": {
      "confidence_distribution": {
        "high_confidence": <count>,
        "medium_confidence": <count>,
        "low_confidence": <count>
      },
      "concerning_entities": ["entity_ids with suspiciously high/low confidence"]
    },
    "medical_relevance": {
      "clinical_entities_identified": <count>,
      "missed_clinical_content": ["potential clinical entities not identified"],
      "over_identified": ["non-clinical content marked as clinical"]
    }
  },
  "overall_quality": {
    "validation_score": <0.0-1.0>,
    "ready_for_pass2": true/false,
    "requires_human_review": true/false,
    "critical_issues": ["list of blocking issues"]
  },
  "recommendations": [
    "Specific recommendations for improvement"
  ]
}
`;
```

### Error Recovery Prompt
```typescript
const PASS1_ERROR_RECOVERY_PROMPT = `
The initial entity classification encountered issues. Please perform a focused re-classification.

ORIGINAL ISSUES IDENTIFIED:
{{error_details}}

FOCUS AREAS FOR RE-CLASSIFICATION:
1. Ensure complete document coverage
2. Resolve category ambiguities
3. Improve confidence scoring
4. Identify missed clinical content

Use the same classification system as before, but pay special attention to the identified issues.

DOCUMENT SECTION TO RE-PROCESS:
{{document_segment}}

Return corrected classification using the same JSON format.
`;
```

## Implementation Integration

### TypeScript Implementation Example
```typescript
import { OpenAI } from 'openai';

class Pass1EntityDetector {
  private openai: OpenAI;
  private taxonomyPrompt: string;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
    this.taxonomyPrompt = PASS1_CLASSIFICATION_PROMPT;
  }

  async detectEntities(input: Pass1InputSchema): Promise<Pass1OutputSchema> {
    const startTime = Date.now();

    try {
      // Prepare the prompt with document content
      const prompt = this.taxonomyPrompt
        .replace('{{document_text}}', input.document_content.extracted_text)
        .replace('{{spatial_mapping_data}}', JSON.stringify(input.document_content.spatial_mapping));

      // Call OpenAI API
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a medical document entity detection system. Classify all entities using the provided taxonomy.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,  // Low temperature for consistent classification
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const processingTime = (Date.now() - startTime) / 1000;
      const rawResult = JSON.parse(response.choices[0].message.content || '{}');

      // Transform to our output schema
      return this.transformToOutputSchema(rawResult, response.usage, processingTime, input);

    } catch (error) {
      throw new Pass1ProcessingError(`Entity detection failed: ${error.message}`);
    }
  }

  private transformToOutputSchema(
    rawResult: any,
    usage: any,
    processingTime: number,
    input: Pass1InputSchema
  ): Pass1OutputSchema {
    return {
      processing_metadata: {
        model_used: 'gpt-4o-mini',
        processing_time_seconds: processingTime,
        token_usage: {
          prompt_tokens: usage?.prompt_tokens || 0,
          completion_tokens: usage?.completion_tokens || 0,
          total_tokens: usage?.total_tokens || 0
        },
        cost_estimate: this.calculateCost(usage),
        confidence_metrics: this.calculateConfidenceMetrics(rawResult.entities)
      },
      entities: this.enhanceEntities(rawResult.entities, input),
      document_coverage: rawResult.document_coverage,
      quality_assessment: rawResult.quality_assessment,
      profile_safety: this.assessProfileSafety(rawResult.entities, input)
    };
  }

  private enhanceEntities(entities: any[], input: Pass1InputSchema): EntityDetectionResult[] {
    return entities.map((entity, index) => ({
      ...entity,
      entity_id: entity.entity_id || `ent_${String(index + 1).padStart(3, '0')}`,
      processing_routing: this.determineProcessingRouting(entity),
      clinical_context: this.assessClinicalContext(entity),
      quality_indicators: this.assessEntityQuality(entity),
      spatial_information: this.enhanceSpatialInfo(entity, input.document_content.spatial_mapping)
    }));
  }

  private determineProcessingRouting(entity: any) {
    const schemaMapping = SCHEMA_MAPPING[entity.entity_subtype] || [];

    return {
      requires_schemas: schemaMapping,
      processing_priority: this.determinePriority(entity.entity_category, entity.entity_subtype),
      skip_pass2: entity.entity_category === 'document_structure',
      enrichment_complexity: this.assessComplexity(entity)
    };
  }
}
```

## Performance Optimization

### Token Usage Optimization
- **Taxonomy Size**: ~415 tokens for complete classification system
- **Document Content**: 2000-4000 tokens typical
- **Total Budget**: 4500 tokens average per document
- **Cost Target**: $0.0002-0.0005 per document with GPT-4o-mini

### Batch Processing Optimization
```typescript
interface BatchProcessingConfig {
  max_documents_per_batch: number;
  token_budget_per_batch: number;
  parallel_processing_limit: number;
  retry_configuration: RetryConfig;
}

const BATCH_CONFIG: BatchProcessingConfig = {
  max_documents_per_batch: 10,
  token_budget_per_batch: 45000,  // 10 documents × 4500 tokens
  parallel_processing_limit: 5,
  retry_configuration: {
    max_retries: 3,
    backoff_strategy: 'exponential',
    error_recovery_prompt: true
  }
};
```

## Quality Assurance Integration

### Confidence Thresholds
```typescript
const CONFIDENCE_THRESHOLDS = {
  clinical_events: {
    minimum_confidence: 0.8,
    manual_review_threshold: 0.7,
    automatic_retry_threshold: 0.5
  },
  healthcare_context: {
    minimum_confidence: 0.7,
    manual_review_threshold: 0.6,
    automatic_retry_threshold: 0.4
  },
  document_structure: {
    minimum_confidence: 0.9,
    manual_review_threshold: 0.8,
    automatic_retry_threshold: 0.6
  }
};
```

### Validation Pipeline
1. **Completeness Check**: Ensure 100% document coverage
2. **Confidence Validation**: Flag entities below thresholds
3. **Category Consistency**: Validate entity categories make sense
4. **Medical Accuracy**: Check clinical entities for medical plausibility
5. **Profile Safety**: Verify patient identity consistency

## Success Criteria

### Technical Performance
- **Entity Detection Rate**: 100% document coverage
- **Classification Accuracy**: >95% correct category assignment
- **Processing Speed**: <2 seconds per document
- **Cost Efficiency**: <$0.0005 per document

### Clinical Quality
- **Medical Entity Accuracy**: >95% for clinical_events
- **Context Entity Accuracy**: >92% for healthcare_context
- **Structure Entity Accuracy**: >98% for document_structure
- **Profile Safety**: 100% patient identity verification

### Integration Success
- **Database Integration**: Clean insertion into entity_processing_audit
- **Pass 2 Preparation**: Structured handoff for targeted enrichment
- **Spatial Preservation**: Accurate click-to-zoom coordinate mapping
- **Audit Trail**: Complete processing metadata for compliance

---

This bridge schema and prompt system provides the complete AI integration specification for Pass 1 entity detection, enabling accurate, efficient, and compliant medical document processing.