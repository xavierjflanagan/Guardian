/**
 * Token count analysis for medical_coding_standards schema
 * Tests V2 healthcare standards integration efficiency
 */

const fs = require('fs');
const path = require('path');

function loadMedicalCodingSchema(version) {
  const schemaPath = path.join(__dirname, '..', '..', 'schemas', version, 'medical_coding_standards.json');
  const content = fs.readFileSync(schemaPath, 'utf-8');
  return {
    schema: JSON.parse(content),
    rawContent: content
  };
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function generateMedicalCodingPrompt(schema) {
  return `MEDICAL CODING STANDARDS INTEGRATION
${schema.description}

Assign appropriate medical codes for clinical concepts:

SNOMED-CT CODES:
- Include concept_code, display_name, concept_type
- Use for: procedures, observations, conditions, medications

LOINC CODES:  
- Include loinc_code, component, scale_type
- Use for: laboratory results, vital signs, clinical measurements

CPT CODES:
- Include cpt_code, description, category
- Use for: procedures and services

ICD-10 CODES:
- Include icd10_code, description, chapter  
- Use for: diagnoses and conditions

CODING REQUIREMENTS:
- coding_confidence: 0.0-1.0 confidence score
- coding_method: automated_ai/manual_verification/hybrid_validation
- Include validation_flags for review needs
- Provide clinical_context when available

OUTPUT FORMAT:
${JSON.stringify(schema._ai_guidance || {usage: "Structure healthcare coding with confidence scores"}, null, 2)}`;
}

function runMedicalCodingAnalysis() {
  console.log('=== V2 Medical Coding Standards: Token Analysis ===\n');
  
  try {
    // Load all versions
    const source = loadMedicalCodingSchema('source');
    const sourceTokens = estimateTokens(source.rawContent);
    
    const detailed = loadMedicalCodingSchema('detailed');
    const detailedTokens = estimateTokens(detailed.rawContent);
    const detailedPrompt = generateMedicalCodingPrompt(detailed.schema);
    const detailedPromptTokens = estimateTokens(detailedPrompt);
    
    const minimal = loadMedicalCodingSchema('minimal');
    const minimalTokens = estimateTokens(minimal.rawContent);
    const minimalPrompt = generateMedicalCodingPrompt(minimal.schema);
    const minimalPromptTokens = estimateTokens(minimalPrompt);
    
    console.log('1. Medical Coding Schema Sizes:');
    console.log(`   Source:   ${sourceTokens} tokens`);
    console.log(`   Detailed: ${detailedTokens} tokens`);
    console.log(`   Minimal:  ${minimalTokens} tokens`);
    
    console.log('\n2. AI Prompt Sizes for Medical Coding:');
    console.log(`   Detailed prompt: ${detailedPromptTokens} tokens`);
    console.log(`   Minimal prompt:  ${minimalPromptTokens} tokens`);
    
    console.log('\n3. Token Efficiency Analysis:');
    const detailedReduction = Math.round(((sourceTokens - detailedTokens) / sourceTokens) * 100);
    const minimalReduction = Math.round(((sourceTokens - minimalTokens) / sourceTokens) * 100);
    const promptReduction = Math.round(((detailedPromptTokens - minimalPromptTokens) / detailedPromptTokens) * 100);
    
    console.log(`   Source → Detailed: ${detailedReduction}% reduction`);
    console.log(`   Source → Minimal:  ${minimalReduction}% reduction`);
    console.log(`   Detailed → Minimal prompt: ${promptReduction}% reduction`);
    
    console.log('\n4. V2 Integration Target Validation:');
    console.log(`   Detailed healthcare coding: ${detailedPromptTokens} tokens ${detailedPromptTokens <= 250 ? '✅ Efficient' : '❌ Too large'}`);
    console.log(`   Minimal healthcare coding:  ${minimalPromptTokens} tokens ${minimalPromptTokens <= 100 ? '✅ Very efficient' : minimalPromptTokens <= 150 ? '✅ Acceptable' : '❌ Too large'}`);
    
    console.log('\n5. Medical Coding Coverage:');
    const detailedCoverage = Object.keys(detailed.schema.properties).filter(key => key.endsWith('_codes')).length;
    const minimalCoverage = Object.keys(minimal.schema.properties).filter(key => key.endsWith('_codes')).length;
    console.log(`   Detailed covers: ${detailedCoverage} coding systems`);
    console.log(`   Minimal covers:  ${minimalCoverage} coding systems`);
    
    console.log('\n6. V2 Cost Impact Assessment:');
    const baselineTokens = 50; // Typical baseline for clinical event without coding
    const detailedOverhead = Math.round(((detailedPromptTokens / baselineTokens) - 1) * 100);
    const minimalOverhead = Math.round(((minimalPromptTokens / baselineTokens) - 1) * 100);
    console.log(`   Detailed adds: ${detailedOverhead}% token overhead`);
    console.log(`   Minimal adds:  ${minimalOverhead}% token overhead`);
    
    console.log('\n7. Sample Medical Coding Prompts:');
    console.log('\n--- DETAILED MEDICAL CODING PROMPT (first 300 chars) ---');
    console.log(detailedPrompt.substring(0, 300) + '...\n');
    
    console.log('--- MINIMAL MEDICAL CODING PROMPT (first 200 chars) ---');
    console.log(minimalPrompt.substring(0, 200) + '...\n');
    
    console.log('✅ Medical coding standards token analysis completed!\n');
    
    return {
      sourceTokens,
      detailedTokens,
      minimalTokens,
      detailedPromptTokens,
      minimalPromptTokens,
      detailedReduction,
      minimalReduction,
      promptReduction
    };
    
  } catch (error) {
    console.error('❌ Medical coding analysis failed:', error.message);
    return null;
  }
}

// Run analysis if executed directly
if (require.main === module) {
  runMedicalCodingAnalysis();
}

module.exports = { runMedicalCodingAnalysis };