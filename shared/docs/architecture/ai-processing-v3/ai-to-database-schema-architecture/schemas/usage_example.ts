/**
 * Usage Example: V3 AI Processing with V2 Safety Integration
 * Demonstrates schema loader + entity classifier working together
 * Week 2 Implementation Example
 * Created: 2025-08-26
 */

import { SchemaLoader, EntityCategory, AISchema } from './schema_loader';
import { EntityClassifier, DocumentContent, ProfileContext } from './entity_classifier';

// Mock schema loader function for demonstration
async function mockSchemaLoader(tableName: string, version: 'detailed' | 'minimal'): Promise<AISchema> {
  // In production, this would load from files, database, or remote source
  return {
    table_name: tableName,
    description: `Mock schema for ${tableName} (${version} version)`,
    required_fields: {
      id: { type: 'uuid', description: 'Primary key' },
      patient_id: { type: 'uuid', description: 'Patient identifier' }
    },
    optional_fields: {
      notes: { type: 'text', description: 'Additional notes' }
    },
    validation_rules: {
      confidence_threshold: 0.8,
      requires_review_below: 0.7
    },
    output_format_example: {
      id: 'uuid',
      patient_id: 'uuid',
      notes: 'string'
    }
  };
}

async function demonstrateV3Processing() {
  console.log('=== AI Processing V3 + V2 Integration Demo ===\n');

  // Initialize components with mock schema loader
  const schemaLoader = new SchemaLoader(mockSchemaLoader);
  const entityClassifier = new EntityClassifier({
    pass1_model: 'gpt-4o-mini',
    confidence_threshold: 0.7
  });

  // Mock document content
  const documentContent: DocumentContent = {
    raw_text: `
    MEDICAL RECORD - John Doe, Age 45
    Date: March 15, 2024
    Provider: Dr. Sarah Wilson, Internal Medicine
    
    CHIEF COMPLAINT: Annual physical examination
    
    VITAL SIGNS:
    - Blood pressure: 128/84 mmHg
    - Heart rate: 72 bpm
    - Weight: 180 lbs
    - Height: 5'10"
    
    ASSESSMENT:
    - Hypertension, stage 1
    - Recommend lifestyle modifications
    
    PLAN:
    - Start Lisinopril 10mg daily
    - Follow-up in 4 weeks
    - Monitor blood pressure at home
    `,
    document_metadata: {
      document_type: 'medical_record',
      source: 'ehr_export'
    }
  };

  const profileContext: ProfileContext = {
    profile_id: 'profile_12345',
    patient_demographics: {
      age: 45,
      gender: 'male',
      known_conditions: ['hypertension'],
      known_allergies: []
    }
  };

  console.log('1. PASS 1: Entity Detection & Classification');
  console.log('=============================================');
  
  // Step 1: Pass 1 entity classification
  const pass1Result = await entityClassifier.classifyDocumentEntities(
    documentContent,
    profileContext
  );

  console.log(`Total entities detected: ${pass1Result.total_entities_detected}`);
  console.log(`Clinical events: ${pass1Result.entities_by_category.clinical_event.length}`);
  console.log(`Healthcare context: ${pass1Result.entities_by_category.healthcare_context.length}`);
  console.log(`Document structure: ${pass1Result.entities_by_category.document_structure.length}`);
  console.log(`Profile safety confidence: ${pass1Result.profile_safety_assessment.identity_verification_confidence}`);
  console.log(`Safety flags: ${pass1Result.profile_safety_assessment.safety_flags.length}`);
  
  console.log('\n2. SCHEMA LOADING: Category-Based Schema Retrieval');
  console.log('==================================================');

  // Step 2: Load schemas for detected entity categories
  for (const category of schemaLoader.getAvailableCategories()) {
    const entityCount = pass1Result.entities_by_category[category].length;
    if (entityCount === 0) continue;

    console.log(`\n--- Category: ${category.toUpperCase()} (${entityCount} entities) ---`);
    
    // Check if category requires Pass 2 enrichment
    const requiresPass2 = schemaLoader.requiresPass2Enrichment(category);
    console.log(`Requires Pass 2 enrichment: ${requiresPass2}`);
    
    if (requiresPass2) {
      // Get optimal schema version based on token budget
      const optimalVersion = await schemaLoader.getOptimalSchemaVersion(category, 1000);
      console.log(`Optimal schema version: ${optimalVersion}`);
      
      // Load schemas for this category
      const schemaResults = await schemaLoader.getSchemasForEntityCategory(category, optimalVersion);
      
      console.log(`Schemas loaded: ${schemaResults.length}`);
      schemaResults.forEach(result => {
        console.log(`  - ${result.schema.table_name}: ${result.token_estimate} tokens`);
        console.log(`    Safety validation: ${result.safety_validation_required}`);
        console.log(`    Profile classification: ${result.profile_classification_needed}`);
      });
      
      // Calculate total tokens for category
      const totalTokens = await schemaLoader.getCategoryTokenEstimate(category, optimalVersion);
      console.log(`Total tokens for category: ${totalTokens}`);
    }
  }

  console.log('\n3. PASS 2 PREPARATION: Entity-Specific Schema Loading');
  console.log('====================================================');

  // Step 3: Demonstrate Pass 2 schema loading for specific entities
  const clinicalEvents = pass1Result.entities_by_category.clinical_event;
  if (clinicalEvents.length > 0) {
    const exampleEntity = clinicalEvents[0];
    console.log(`\nPreparing Pass 2 for entity: ${exampleEntity.entity_id}`);
    console.log(`Category: ${exampleEntity.category}`);
    console.log(`Subtype: ${exampleEntity.subtype}`);
    console.log(`Confidence: ${exampleEntity.confidence}`);
    
    // Example: Load schema for clinical events table
    const enrichmentSchema = await schemaLoader.getSchemaForEntityEnrichment(
      exampleEntity,
      'patient_clinical_events',
      'detailed'
    );
    
    console.log(`Enrichment schema loaded: ${enrichmentSchema.schema.table_name}`);
    console.log(`Token estimate: ${enrichmentSchema.token_estimate}`);
    console.log(`Safety validation required: ${enrichmentSchema.safety_validation_required}`);
    
    // Validate entity safety
    const safetyValidation = schemaLoader.validateEntitySafety(exampleEntity, 'patient_clinical_events');
    console.log(`Safety validation passed: ${safetyValidation.passed}`);
    console.log(`Risk level: ${safetyValidation.risk_level}`);
    console.log(`Safety checks: ${safetyValidation.safety_checks.join(', ')}`);
  }

  console.log('\n4. V2 SAFETY SUMMARY');
  console.log('====================');
  console.log(`Identity verification: ${(pass1Result.profile_safety_assessment.identity_verification_confidence * 100).toFixed(1)}%`);
  console.log(`Age appropriateness: ${(pass1Result.profile_safety_assessment.age_appropriateness_score * 100).toFixed(1)}%`);
  console.log(`Manual review required: ${pass1Result.profile_safety_assessment.requires_manual_review}`);
  console.log(`Safety flags: ${pass1Result.profile_safety_assessment.safety_flags.length}`);

  console.log('\n5. PROCESSING EFFICIENCY METRICS');
  console.log('=================================');
  console.log(`Processing time: ${pass1Result.processing_metadata.processing_time_ms}ms`);
  console.log(`Token usage: ${pass1Result.processing_metadata.token_usage}`);
  console.log(`Average confidence: ${(pass1Result.processing_metadata.classification_confidence_avg * 100).toFixed(1)}%`);
  console.log(`Model used: ${pass1Result.processing_metadata.model_used}`);

  console.log('\n=== Demo Complete: Week 2 Foundation Ready ===');
  console.log('Next: Week 3 - Pass 1 Implementation with real AI models');
}

// Run the demonstration
if (require.main === module) {
  demonstrateV3Processing().catch(console.error);
}

export { demonstrateV3Processing };