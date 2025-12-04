/**
 * Dynamic Schema Loader for AI Processing V3 with V2 Integration
 * Loads and formats database schemas for 3-category entity classification
 * Supports entity-to-schema mapping with profile safety validation
 * Created: 2025-08-26
 */

// Node.js imports - will be replaced with appropriate imports based on environment
// For Edge Functions: use Deno APIs
// For web client: use fetch/import mechanisms  
// import * as fs from 'fs';
// import * as path from 'path';

// V3 Entity Categories for classification
type EntityCategory = 'clinical_event' | 'healthcare_context' | 'document_structure';

interface AISchema {
  table_name: string;
  description: string;
  required_fields: Record<string, any>;
  optional_fields: Record<string, any>;
  validation_rules: Record<string, any>;
  output_format_example: Record<string, any>;
  common_patterns?: Record<string, any>;
  // V2 Integration fields
  medical_coding_fields?: Record<string, any>;
  profile_safety_requirements?: Record<string, any>;
}

// V3 Entity Detection Result
interface EntityDetectionResult {
  entity_id: string;
  category: EntityCategory;
  subtype: string;
  confidence: number;
  text_content: string; // The actual extracted text content
  spatial_coordinates?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  // V2 Safety fields
  requires_profile_validation?: boolean;
  safety_risk_level?: 'low' | 'medium' | 'high' | 'critical';
}

// Schema load result with V3 + V2 enhancements
interface SchemaLoadResult {
  schema: AISchema;
  prompt_instructions: string;
  token_estimate: number;
  entity_category: EntityCategory;
  requires_pass2_enrichment: boolean;
  // V2 Integration
  safety_validation_required: boolean;
  profile_classification_needed: boolean;
}

class SchemaLoader {
  private schemasPath: string;
  private loadedSchemas: Map<string, AISchema> = new Map();
  
  // V3 Entity-to-Schema mapping configuration
  private entityToSchemaMapping: Map<EntityCategory, string[]> = new Map([
    ['clinical_event', [
      'patient_clinical_events',
      'patient_observations', 
      'patient_interventions',
      'patient_conditions',
      'patient_allergies',
      'patient_immunizations'
    ]],
    ['healthcare_context', [
      'healthcare_encounters',
      'patient_imaging_reports',
      'healthcare_provider_context'
    ]],
    ['document_structure', [
      // No schemas needed - audit logging only
    ]]
  ]);

  // V2 Safety classification requirements
  private safetyRequirements: Map<string, {
    profile_validation: boolean;
    contamination_prevention: boolean;
    safety_critical: boolean;
  }> = new Map([
    ['patient_allergies', { profile_validation: true, contamination_prevention: true, safety_critical: true }],
    ['patient_interventions', { profile_validation: true, contamination_prevention: true, safety_critical: true }],
    ['patient_conditions', { profile_validation: true, contamination_prevention: false, safety_critical: false }],
    ['patient_clinical_events', { profile_validation: true, contamination_prevention: false, safety_critical: false }],
    ['patient_observations', { profile_validation: true, contamination_prevention: false, safety_critical: false }],
    ['patient_immunizations', { profile_validation: true, contamination_prevention: true, safety_critical: true }]
  ]);

  // Schema loading function - will be injected based on environment
  private schemaLoader: (tableName: string, version: 'detailed' | 'minimal') => Promise<AISchema>;

  constructor(
    schemaLoader: (tableName: string, version: 'detailed' | 'minimal') => Promise<AISchema>
  ) {
    this.schemasPath = ''; // Not used - kept for backward compatibility
    this.schemaLoader = schemaLoader;
  }

  /**
   * Load a schema (environment-agnostic version)
   */
  async loadSchema(tableName: string, version: 'detailed' | 'minimal' = 'detailed'): Promise<AISchema> {
    const key = `${tableName}_${version}`;
    if (this.loadedSchemas.has(key)) {
      return this.loadedSchemas.get(key)!;
    }

    const schema = await this.schemaLoader(tableName, version);
    this.loadedSchemas.set(key, schema);
    return schema;
  }

  /**
   * V3 CORE: Get schemas needed for detected entities with category classification
   */
  async getSchemasForEntityCategory(
    category: EntityCategory, 
    version: 'detailed' | 'minimal' = 'detailed'
  ): Promise<SchemaLoadResult[]> {
    const schemaNames = this.entityToSchemaMapping.get(category) || [];
    const results: SchemaLoadResult[] = [];
    
    for (const schemaName of schemaNames) {
      const schema = await this.loadSchema(schemaName, version);
      const promptInstructions = await this.getPromptInstructions(schemaName, version);
      const safetyReqs = this.safetyRequirements.get(schemaName);
      
      results.push({
        schema,
        prompt_instructions: promptInstructions,
        token_estimate: this.estimateTokens(promptInstructions),
        entity_category: category,
        requires_pass2_enrichment: category !== 'document_structure',
        safety_validation_required: safetyReqs?.profile_validation || false,
        profile_classification_needed: safetyReqs?.contamination_prevention || false
      });
    }
    
    return results;
  }

  /**
   * V3 CORE: Get specific schema for Pass 2 enrichment based on entity detection
   */
  async getSchemaForEntityEnrichment(
    entityResult: EntityDetectionResult,
    targetTable: string,
    version: 'detailed' | 'minimal' = 'detailed'
  ): Promise<SchemaLoadResult> {
    const schema = await this.loadSchema(targetTable, version);
    const promptInstructions = await this.getEnrichmentPromptInstructions(
      schema, entityResult, version
    );
    const safetyReqs = this.safetyRequirements.get(targetTable);
    
    return {
      schema,
      prompt_instructions: promptInstructions,
      token_estimate: this.estimateTokens(promptInstructions),
      entity_category: entityResult.category,
      requires_pass2_enrichment: true,
      safety_validation_required: safetyReqs?.profile_validation || false,
      profile_classification_needed: safetyReqs?.contamination_prevention || false
    };
  }

  /**
   * V3 + V2: Enhanced prompt instructions with safety validation
   */
  async getPromptInstructions(tableName: string, version: 'detailed' | 'minimal' = 'detailed'): Promise<string> {
    const schema = await this.loadSchema(tableName, version);
    const safetyReqs = this.safetyRequirements.get(tableName);
    
    let prompt = `
Extract data for table: ${schema.table_name}
${schema.description}

REQUIRED FIELDS:
${this.formatFieldsForPrompt(schema.required_fields)}

OPTIONAL FIELDS:
${this.formatFieldsForPrompt(schema.optional_fields)}`;

    // V2 Integration: Add medical coding instructions if schema has medical coding fields
    if (schema.medical_coding_fields) {
      prompt += `

MEDICAL CODING FIELDS (V2 Healthcare Standards):
${this.formatFieldsForPrompt(schema.medical_coding_fields)}
- Use SNOMED-CT codes for clinical concepts
- Use LOINC codes for observations/lab tests  
- Use CPT codes for procedures/services
- Use ICD-10 codes for diagnoses
- Set coding_confidence (0.0-1.0) based on certainty
- Set coding_method to 'automated_ai'`;
    }

    // V2 Safety: Add profile validation requirements
    if (safetyReqs?.profile_validation) {
      prompt += `

PROFILE SAFETY REQUIREMENTS (V2):
- Verify age-appropriate medical assignment
- Check for obvious identity mismatches
- Flag safety-critical data (allergies, medications) for extra validation`;
      
      if (safetyReqs.safety_critical) {
        prompt += `
- CRITICAL: This data affects patient safety - maximum accuracy required`;
      }
    }

    prompt += `

OUTPUT FORMAT:
Return JSON matching this structure:
${JSON.stringify(schema.output_format_example, null, 2)}

VALIDATION RULES:
- Confidence threshold: ${schema.validation_rules.confidence_threshold}
- Mark for review if confidence < ${schema.validation_rules.requires_review_below}`;

    return prompt.trim();
  }

  /**
   * V3: Enhanced enrichment prompt for Pass 2 processing
   */
  private async getEnrichmentPromptInstructions(
    schema: AISchema,
    entityResult: EntityDetectionResult,
    version: 'detailed' | 'minimal'
  ): Promise<string> {
    const basePrompt = await this.getPromptInstructions(schema.table_name, version);
    
    return `
ENTITY ENRICHMENT - Pass 2 Processing
Entity ID: ${entityResult.entity_id}
Entity Category: ${entityResult.category}
Entity Type: ${entityResult.subtype}
Pass 1 Confidence: ${entityResult.confidence}

${basePrompt}

ENRICHMENT CONTEXT:
- Focus on the specific entity identified in Pass 1
- Enhance extraction accuracy using Pass 1 classification results
- Maintain spatial coordinate mapping for click-to-zoom functionality
${entityResult.spatial_coordinates ? 
`- Source coordinates: (${entityResult.spatial_coordinates.x1},${entityResult.spatial_coordinates.y1}) to (${entityResult.spatial_coordinates.x2},${entityResult.spatial_coordinates.y2})` : 
''}

${entityResult.safety_risk_level === 'critical' || entityResult.safety_risk_level === 'high' ?
'SAFETY ALERT: High-risk entity requiring maximum extraction accuracy' : ''}
    `.trim();
  }

  /**
   * Format fields for AI prompt consumption
   */
  private formatFieldsForPrompt(fields: Record<string, any>): string {
    return Object.entries(fields)
      .map(([fieldName, fieldDef]) => {
        const type = fieldDef.type || 'string';
        const description = fieldDef.description || '';
        const examples = fieldDef.examples ? ` Examples: ${JSON.stringify(fieldDef.examples)}` : '';
        const enums = fieldDef.enum ? ` Valid values: ${fieldDef.enum.join(', ')}` : '';
        
        return `- ${fieldName} (${type}): ${description}${enums}${examples}`;
      })
      .join('\n');
  }

  /**
   * V3: Get available entity categories for Pass 1 classification
   */
  getAvailableCategories(): EntityCategory[] {
    return Array.from(this.entityToSchemaMapping.keys());
  }

  /**
   * V3: Check if category requires Pass 2 enrichment
   */
  requiresPass2Enrichment(category: EntityCategory): boolean {
    return category !== 'document_structure';
  }

  /**
   * V2: Get safety requirements for table
   */
  getSafetyRequirements(tableName: string) {
    return this.safetyRequirements.get(tableName) || {
      profile_validation: false,
      contamination_prevention: false,
      safety_critical: false
    };
  }

  /**
   * V3: Get all schemas for a category with token estimation
   */
  async getCategoryTokenEstimate(
    category: EntityCategory,
    version: 'detailed' | 'minimal' = 'detailed'
  ): Promise<number> {
    const schemaResults = await this.getSchemasForEntityCategory(category, version);
    return schemaResults.reduce((total, result) => total + result.token_estimate, 0);
  }

  /**
   * V3: Get optimal schema version based on token budget
   */
  async getOptimalSchemaVersion(
    category: EntityCategory,
    maxTokens: number = 1000
  ): Promise<'detailed' | 'minimal'> {
    const detailedTokens = await this.getCategoryTokenEstimate(category, 'detailed');
    const minimalTokens = await this.getCategoryTokenEstimate(category, 'minimal');
    
    if (detailedTokens <= maxTokens) {
      return 'detailed';
    } else if (minimalTokens <= maxTokens) {
      return 'minimal';
    } else {
      // Still use minimal if over budget - will need entity batching
      return 'minimal';
    }
  }

  /**
   * V2: Validate entity against profile safety requirements  
   */
  validateEntitySafety(entityResult: EntityDetectionResult, targetTable: string): {
    passed: boolean;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    safety_checks: string[];
  } {
    const safetyReqs = this.getSafetyRequirements(targetTable);
    const checks: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    if (safetyReqs.safety_critical) {
      riskLevel = 'critical';
      checks.push('safety_critical_data');
    }
    
    if (safetyReqs.contamination_prevention) {
      checks.push('contamination_prevention_required');
      if (riskLevel === 'low') riskLevel = 'medium';
    }
    
    if (safetyReqs.profile_validation) {
      checks.push('profile_validation_required');
      if (riskLevel === 'low') riskLevel = 'medium';
    }
    
    // Override with entity's assessed risk level if higher
    if (entityResult.safety_risk_level) {
      const entityRiskLevels = { 'low': 0, 'medium': 1, 'high': 2, 'critical': 3 };
      const currentRiskLevel = entityRiskLevels[riskLevel];
      const entityRisk = entityRiskLevels[entityResult.safety_risk_level];
      
      if (entityRisk > currentRiskLevel) {
        riskLevel = entityResult.safety_risk_level;
      }
    }
    
    return {
      passed: entityResult.confidence >= 0.8 || riskLevel === 'low',
      risk_level: riskLevel,
      safety_checks: checks
    };
  }

  /**
   * Estimate token count for prompt instructions
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export { 
  SchemaLoader, 
  AISchema, 
  SchemaLoadResult, 
  EntityCategory, 
  EntityDetectionResult 
};