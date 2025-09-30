/**
 * Token count comparison for detailed vs minimal schemas
 * Tests the schema loader and measures token efficiency
 */

const fs = require('fs');
const path = require('path');

function loadSchema(version) {
  const schemaPath = path.join(__dirname, '..', '..', 'schemas', version, 'patient_clinical_events.json');
  const content = fs.readFileSync(schemaPath, 'utf-8');
  return {
    schema: JSON.parse(content),
    rawContent: content
  };
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function generatePromptInstructions(schema) {
  return `Extract data for table: ${schema.table_name}
${schema.description}

REQUIRED FIELDS:
${Object.entries(schema.required_fields).map(([field, def]) => 
  `- ${field}: ${def.description || def.enum?.join(', ') || 'No description'}`
).join('\n')}

OPTIONAL FIELDS:
${Object.entries(schema.optional_fields).map(([field, def]) => 
  `- ${field}: ${def.description || def.enum?.join(', ') || 'No description'}`
).join('\n')}

OUTPUT FORMAT:
${JSON.stringify(schema.output_format_example || schema.output_example, null, 2)}

VALIDATION RULES:
- Confidence threshold: ${schema.validation_rules?.confidence_threshold || schema.validation?.confidence_threshold}
- Mark for review if confidence < ${schema.validation_rules?.requires_review_below || schema.validation?.requires_review_below}`;
}

function runTokenAnalysis() {
  console.log('=== AI Processing v3: Schema Token Analysis ===\n');
  
  try {
    // Load source schema
    const source = loadSchema('source');
    const sourceTokens = estimateTokens(source.rawContent);
    
    // Load detailed schema  
    const detailed = loadSchema('detailed');
    const detailedTokens = estimateTokens(detailed.rawContent);
    const detailedPrompt = generatePromptInstructions(detailed.schema);
    const detailedPromptTokens = estimateTokens(detailedPrompt);
    
    // Load minimal schema
    const minimal = loadSchema('minimal');
    const minimalTokens = estimateTokens(minimal.rawContent);
    const minimalPrompt = generatePromptInstructions(minimal.schema);
    const minimalPromptTokens = estimateTokens(minimalPrompt);
    
    console.log('1. Raw Schema Sizes:');
    console.log(`   Source:   ${sourceTokens} tokens`);
    console.log(`   Detailed: ${detailedTokens} tokens`);
    console.log(`   Minimal:  ${minimalTokens} tokens`);
    
    console.log('\n2. Generated AI Prompt Sizes:');
    console.log(`   Detailed prompt: ${detailedPromptTokens} tokens`);
    console.log(`   Minimal prompt:  ${minimalPromptTokens} tokens`);
    
    console.log('\n3. Token Reduction Analysis:');
    const detailedReduction = Math.round(((sourceTokens - detailedTokens) / sourceTokens) * 100);
    const minimalReduction = Math.round(((sourceTokens - minimalTokens) / sourceTokens) * 100);
    const promptReduction = Math.round(((detailedPromptTokens - minimalPromptTokens) / detailedPromptTokens) * 100);
    
    console.log(`   Source → Detailed: ${detailedReduction}% reduction`);
    console.log(`   Source → Minimal:  ${minimalReduction}% reduction`);
    console.log(`   Detailed → Minimal prompt: ${promptReduction}% reduction`);
    
    console.log('\n4. Target Validation:');
    console.log(`   Detailed target: ~300 tokens (actual: ${detailedPromptTokens}) ${detailedPromptTokens <= 350 ? '✅' : '❌'}`);
    console.log(`   Minimal target:  ~100 tokens (actual: ${minimalPromptTokens}) ${minimalPromptTokens <= 120 ? '✅' : '❌'}`);
    
    console.log('\n5. Schema Field Comparison:');
    console.log(`   Source required fields:   ${Object.keys(source.schema.required_fields).length}`);
    console.log(`   Detailed required fields: ${Object.keys(detailed.schema.required_fields).length}`);
    console.log(`   Minimal required fields:  ${Object.keys(minimal.schema.required_fields).length}`);
    console.log(`   Source optional fields:   ${Object.keys(source.schema.optional_fields).length}`);
    console.log(`   Detailed optional fields: ${Object.keys(detailed.schema.optional_fields).length}`);
    console.log(`   Minimal optional fields:  ${Object.keys(minimal.schema.optional_fields).length}`);
    
    // Preview prompts
    console.log('\n6. Sample Prompts Preview:');
    console.log('\n--- DETAILED PROMPT (first 200 chars) ---');
    console.log(detailedPrompt.substring(0, 200) + '...\n');
    
    console.log('--- MINIMAL PROMPT (first 200 chars) ---');
    console.log(minimalPrompt.substring(0, 200) + '...\n');
    
    console.log('✅ Token analysis completed successfully!\n');
    
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
    console.error('❌ Token analysis failed:', error.message);
    return null;
  }
}

// Run analysis if executed directly
if (require.main === module) {
  runTokenAnalysis();
}

module.exports = { runTokenAnalysis };