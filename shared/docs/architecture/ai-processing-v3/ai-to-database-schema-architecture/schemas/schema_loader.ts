/**
 * Schema Loader for AI Processing v3
 * Loads and formats database schemas for AI consumption
 */

import * as fs from 'fs';
import * as path from 'path';

interface AISchema {
  table_name: string;
  description: string;
  required_fields: Record<string, any>;
  optional_fields: Record<string, any>;
  validation_rules: Record<string, any>;
  output_format_example: Record<string, any>;
  common_patterns?: Record<string, any>;
}

interface SchemaLoadResult {
  schema: AISchema;
  prompt_instructions: string;
  token_estimate: number;
}

class SchemaLoader {
  private schemasPath: string;
  private loadedSchemas: Map<string, AISchema> = new Map();

  constructor(schemasBasePath: string) {
    this.schemasPath = schemasBasePath;
  }

  /**
   * Load a schema from JSON file (detailed or minimal version)
   */
  async loadSchema(tableName: string, version: 'detailed' | 'minimal' = 'detailed'): Promise<AISchema> {
    const key = `${tableName}_${version}`;
    if (this.loadedSchemas.has(key)) {
      return this.loadedSchemas.get(key)!;
    }

    const schemaPath = path.join(this.schemasPath, version, `${tableName}.json`);
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema: AISchema = JSON.parse(schemaContent);
    
    this.loadedSchemas.set(key, schema);
    return schema;
  }

  /**
   * Convert schema to AI-optimized prompt instructions
   */
  async getPromptInstructions(tableName: string, version: 'detailed' | 'minimal' = 'detailed'): Promise<string> {
    const schema = await this.loadSchema(tableName, version);
    
    return `
Extract data for table: ${schema.table_name}
${schema.description}

REQUIRED FIELDS:
${this.formatFieldsForPrompt(schema.required_fields)}

OPTIONAL FIELDS:
${this.formatFieldsForPrompt(schema.optional_fields)}

OUTPUT FORMAT:
Return JSON matching this structure:
${JSON.stringify(schema.output_format_example, null, 2)}

VALIDATION RULES:
- Confidence threshold: ${schema.validation_rules.confidence_threshold}
- Mark for review if confidence < ${schema.validation_rules.requires_review_below}
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
   * Estimate token count for prompt instructions
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export { SchemaLoader, AISchema, SchemaLoadResult };