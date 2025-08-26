/**
 * Pass 1 Entity Classifier for AI Processing V3
 * Lightweight entity detection with 3-category classification + V2 profile safety
 * Prepares entities for Pass 2 schema-based enrichment
 * Created: 2025-08-26
 */

import { EntityCategory, EntityDetectionResult } from './schema_loader';

interface DocumentContent {
  raw_text: string;
  ocr_data?: {
    spatial_coordinates: Array<{
      text: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      confidence: number;
    }>;
  };
  document_metadata?: {
    document_type?: string;
    source?: string;
    page_count?: number;
  };
}

interface ProfileContext {
  profile_id: string;
  patient_demographics?: {
    age?: number;
    gender?: string;
    known_conditions?: string[];
    known_allergies?: string[];
  };
}

interface Pass1ProcessingResult {
  document_id: string;
  total_entities_detected: number;
  entities_by_category: {
    clinical_event: EntityDetectionResult[];
    healthcare_context: EntityDetectionResult[];
    document_structure: EntityDetectionResult[];
  };
  profile_safety_assessment: {
    identity_verification_confidence: number;
    age_appropriateness_score: number;
    safety_flags: string[];
    requires_manual_review: boolean;
  };
  processing_metadata: {
    model_used: string;
    processing_time_ms: number;
    token_usage: number;
    classification_confidence_avg: number;
  };
}

class EntityClassifier {
  private modelConfig: {
    pass1_model: string;  // e.g., 'gpt-4o-mini' or 'claude-3-haiku'
    max_tokens_per_request: number;
    temperature: number;
    confidence_threshold: number;
  };

  constructor(modelConfig?: Partial<EntityClassifier['modelConfig']>) {
    this.modelConfig = {
      pass1_model: 'gpt-4o-mini',
      max_tokens_per_request: 4000,
      temperature: 0.1,
      confidence_threshold: 0.7,
      ...modelConfig
    };
  }

  /**
   * V3 CORE: Perform Pass 1 entity detection with 3-category classification
   */
  async classifyDocumentEntities(
    documentContent: DocumentContent,
    profileContext: ProfileContext
  ): Promise<Pass1ProcessingResult> {
    const startTime = Date.now();
    
    // Generate entity classification prompt
    const classificationPrompt = this.generateClassificationPrompt(
      documentContent, 
      profileContext
    );
    
    // Call AI model for entity classification
    const aiResponse = await this.callAIModel(classificationPrompt);
    
    // Parse and validate AI response
    const entities = this.parseEntityClassificationResponse(aiResponse);
    
    // V2 Enhancement: Perform profile safety assessment
    const safetyAssessment = await this.assessProfileSafety(
      entities, 
      profileContext,
      documentContent
    );
    
    // Categorize entities by type
    const categorizedEntities = this.categorizeEntities(entities);
    
    const endTime = Date.now();
    
    return {
      document_id: '', // Will be set by calling function
      total_entities_detected: entities.length,
      entities_by_category: categorizedEntities,
      profile_safety_assessment: safetyAssessment,
      processing_metadata: {
        model_used: this.modelConfig.pass1_model,
        processing_time_ms: endTime - startTime,
        token_usage: this.estimateTokenUsage(classificationPrompt + aiResponse),
        classification_confidence_avg: this.calculateAverageConfidence(entities)
      }
    };
  }

  /**
   * Generate V3 + V2 enhanced classification prompt
   */
  private generateClassificationPrompt(
    documentContent: DocumentContent,
    profileContext: ProfileContext
  ): string {
    return `
MEDICAL DOCUMENT ENTITY CLASSIFICATION - Pass 1

DOCUMENT CONTENT:
${documentContent.raw_text}

PROFILE CONTEXT (V2 Safety):
- Profile ID: ${profileContext.profile_id}
- Age: ${profileContext.patient_demographics?.age || 'unknown'}
- Gender: ${profileContext.patient_demographics?.gender || 'unknown'}
- Known conditions: ${profileContext.patient_demographics?.known_conditions?.join(', ') || 'none listed'}
- Known allergies: ${profileContext.patient_demographics?.known_allergies?.join(', ') || 'none listed'}

CLASSIFICATION TASK:
Identify and classify ALL medical entities in this document using the 3-category system:

1. CLINICAL_EVENT: Direct medical actions, observations, or findings
   - Subtypes: vital_sign, lab_result, procedure, medication, diagnosis, allergy, immunization, physical_exam
   - Examples: "Blood pressure 120/80", "Prescribed Lisinopril 10mg", "Diagnosed with hypertension"

2. HEALTHCARE_CONTEXT: Provider and encounter information
   - Subtypes: provider_info, facility_info, encounter_details, appointment_info
   - Examples: "Dr. Smith, Cardiologist", "Main Street Clinic", "Follow-up visit on 2024-03-15"

3. DOCUMENT_STRUCTURE: Document formatting and administrative elements
   - Subtypes: header, footer, date_stamp, signature, page_number, form_field
   - Examples: Document headers, page numbers, signature lines

V2 SAFETY REQUIREMENTS:
- Verify age-appropriate medical assignments
- Flag potential identity mismatches
- Identify safety-critical data (allergies, medications, procedures)
- Assess contamination prevention requirements

OUTPUT FORMAT:
Return JSON array of entities:
[
  {
    "entity_id": "unique_identifier",
    "category": "clinical_event|healthcare_context|document_structure",
    "subtype": "specific_subtype",
    "text_content": "extracted_text",
    "confidence": 0.0-1.0,
    "spatial_coordinates": {
      "x1": number,
      "y1": number, 
      "x2": number,
      "y2": number
    },
    "requires_profile_validation": boolean,
    "safety_risk_level": "low|medium|high|critical"
  }
]

VALIDATION RULES:
- Minimum confidence: ${this.modelConfig.confidence_threshold}
- Include spatial coordinates if OCR data available
- Flag safety-critical entities (allergies, medications) as high/critical risk
- Mark age-inappropriate assignments for review
    `.trim();
  }

  /**
   * V2: Assess profile safety and contamination prevention
   */
  private async assessProfileSafety(
    entities: EntityDetectionResult[],
    profileContext: ProfileContext,
    documentContent: DocumentContent
  ): Promise<Pass1ProcessingResult['profile_safety_assessment']> {
    const safetyFlags: string[] = [];
    let identityConfidence = 0.9; // Default high confidence
    let ageAppropriatenessScore = 0.9; // Default appropriate
    let requiresReview = false;

    // Check for age appropriateness
    const age = profileContext.patient_demographics?.age;
    if (age) {
      const ageIssues = this.checkAgeAppropriateness(entities, age);
      if (ageIssues.length > 0) {
        safetyFlags.push(...ageIssues);
        ageAppropriatenessScore = 0.6;
        requiresReview = true;
      }
    }

    // Check for safety-critical entities
    const safetyCriticalEntities = entities.filter(e => 
      e.safety_risk_level === 'critical' || e.safety_risk_level === 'high'
    );
    
    if (safetyCriticalEntities.length > 0) {
      safetyFlags.push(`${safetyCriticalEntities.length} safety-critical entities detected`);
      requiresReview = true;
    }

    // Identity verification (basic checks)
    const identityMismatches = this.checkIdentityConsistency(entities, profileContext);
    if (identityMismatches.length > 0) {
      safetyFlags.push(...identityMismatches);
      identityConfidence = 0.5;
      requiresReview = true;
    }

    return {
      identity_verification_confidence: identityConfidence,
      age_appropriateness_score: ageAppropriatenessScore,
      safety_flags: safetyFlags,
      requires_manual_review: requiresReview
    };
  }

  /**
   * Check age appropriateness of medical assignments
   */
  private checkAgeAppropriateness(entities: EntityDetectionResult[], age: number): string[] {
    const issues: string[] = [];
    
    entities.forEach(entity => {
      if (entity.category === 'clinical_event') {
        // Age-specific checks
        if (age < 18 && entity.text_content.toLowerCase().includes('colonoscopy')) {
          issues.push('Colonoscopy screening typically inappropriate for age < 18');
        }
        if (age < 21 && entity.text_content.toLowerCase().includes('pap smear')) {
          issues.push('Pap smear screening typically starts at age 21');
        }
        if (age > 80 && entity.text_content.toLowerCase().includes('sports physical')) {
          issues.push('Sports physical unusual for age > 80');
        }
      }
    });
    
    return issues;
  }

  /**
   * Check identity consistency across document
   */
  private checkIdentityConsistency(
    entities: EntityDetectionResult[], 
    profileContext: ProfileContext
  ): string[] {
    const issues: string[] = [];
    
    // Look for name mismatches, gender inconsistencies, etc.
    // This is a simplified implementation - production would be more sophisticated
    
    const genderReferences = entities.filter(e => 
      e.text_content.toLowerCase().includes('he/him') || 
      e.text_content.toLowerCase().includes('she/her') ||
      e.text_content.toLowerCase().includes('male') ||
      e.text_content.toLowerCase().includes('female')
    );
    
    if (genderReferences.length > 0 && profileContext.patient_demographics?.gender) {
      // Basic gender consistency check
      const profileGender = profileContext.patient_demographics.gender.toLowerCase();
      const documentHasOppositeGender = genderReferences.some(e => {
        const content = e.text_content.toLowerCase();
        return (profileGender === 'male' && (content.includes('she/her') || content.includes('female'))) ||
               (profileGender === 'female' && (content.includes('he/him') || content.includes('male')));
      });
      
      if (documentHasOppositeGender) {
        issues.push('Potential gender mismatch detected');
      }
    }
    
    return issues;
  }

  /**
   * Parse AI model response into EntityDetectionResult objects
   */
  private parseEntityClassificationResponse(aiResponse: string): EntityDetectionResult[] {
    try {
      const parsedResponse = JSON.parse(aiResponse);
      if (!Array.isArray(parsedResponse)) {
        throw new Error('Expected array of entities');
      }
      
      return parsedResponse.map((entity, index) => ({
        entity_id: entity.entity_id || `entity_${index}`,
        category: entity.category as EntityCategory,
        subtype: entity.subtype || 'unknown',
        confidence: entity.confidence || 0.5,
        spatial_coordinates: entity.spatial_coordinates,
        requires_profile_validation: entity.requires_profile_validation || false,
        safety_risk_level: entity.safety_risk_level || 'low'
      }));
    } catch (error) {
      console.error('Failed to parse entity classification response:', error);
      return [];
    }
  }

  /**
   * Categorize entities by V3 classification system
   */
  private categorizeEntities(entities: EntityDetectionResult[]): Pass1ProcessingResult['entities_by_category'] {
    const categorized: Pass1ProcessingResult['entities_by_category'] = {
      clinical_event: [],
      healthcare_context: [],
      document_structure: []
    };
    
    entities.forEach(entity => {
      if (categorized[entity.category]) {
        categorized[entity.category].push(entity);
      }
    });
    
    return categorized;
  }

  /**
   * Calculate average confidence across all entities
   */
  private calculateAverageConfidence(entities: EntityDetectionResult[]): number {
    if (entities.length === 0) return 0;
    const total = entities.reduce((sum, entity) => sum + entity.confidence, 0);
    return total / entities.length;
  }

  /**
   * Estimate token usage for a text string
   */
  private estimateTokenUsage(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Mock AI model call - would be replaced with actual API calls
   */
  private async callAIModel(prompt: string): Promise<string> {
    // This would be replaced with actual API calls to GPT-4o-mini, Claude Haiku, etc.
    // For now, return a mock response structure
    return `[
      {
        "entity_id": "bp_reading_001",
        "category": "clinical_event",
        "subtype": "vital_sign",
        "text_content": "Blood pressure 120/80 mmHg",
        "confidence": 0.95,
        "spatial_coordinates": {"x1": 100, "y1": 200, "x2": 300, "y2": 220},
        "requires_profile_validation": false,
        "safety_risk_level": "low"
      }
    ]`;
  }
}

export { EntityClassifier, DocumentContent, ProfileContext, Pass1ProcessingResult };