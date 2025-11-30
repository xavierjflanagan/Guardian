/**
 * Model Selector - Shared across all passes
 *
 * Implements toggle-based model selection with fail-fast validation.
 * Ensures exactly one model is selected for a given pass and required
 * API keys are present.
 *
 * Each pass has its own prefix (e.g., PASS_05, PASS_1) and can only
 * select from models available for that pass.
 */

import { ModelDefinition, getModelsForPass, buildEnvVarName } from './model-registry';

/**
 * Custom error class for model selection failures
 */
export class ModelSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelSelectionError';
  }
}

/**
 * Check if an environment variable is truthy
 */
function isEnvVarTrue(value: string | undefined): boolean {
  return ['true', 'TRUE', '1', 'yes', 'YES'].includes(value || 'false');
}

/**
 * Get the API key environment variable name for a vendor
 */
function getApiKeyVarName(vendor: 'openai' | 'google'): string {
  return vendor === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_AI_API_KEY';
}

/**
 * Get the currently selected AI model for a specific pass
 *
 * Validation rules:
 * - Exactly ONE model must have its env var set to true/TRUE/1/yes/YES
 * - The model must be available for the specified pass
 * - The corresponding API key must be present
 * - If validation fails, throws ModelSelectionError
 *
 * @param passPrefix - The pass prefix (e.g., 'PASS_05', 'PASS_1')
 * @throws {ModelSelectionError} If no model selected, multiple models selected, or API key missing
 * @returns {ModelDefinition} The selected model configuration
 */
export function getSelectedModelForPass(passPrefix: string): ModelDefinition {
  const availableModels = getModelsForPass(passPrefix);
  const activeModels: ModelDefinition[] = [];

  // Check each model's environment variable
  for (const model of availableModels) {
    const envVarName = buildEnvVarName(passPrefix, model.envVarSuffix);
    const envValue = process.env[envVarName];

    if (isEnvVarTrue(envValue)) {
      activeModels.push(model);
    }
  }

  // Validation: Exactly one model must be selected
  if (activeModels.length === 0) {
    const availableVars = availableModels.map(m => {
      const envVarName = buildEnvVarName(passPrefix, m.envVarSuffix);
      const apiKey = getApiKeyVarName(m.vendor);
      return `  ${envVarName}=true  # ${m.displayName} (requires ${apiKey})`;
    }).join('\n');

    throw new ModelSelectionError(
      `CRITICAL: No AI model selected for ${passPrefix}\n\n` +
      `Set exactly ONE of these in Render.com:\n${availableVars}`
    );
  }

  if (activeModels.length > 1) {
    const activeVars = activeModels.map(m => {
      const envVarName = buildEnvVarName(passPrefix, m.envVarSuffix);
      return `  ${envVarName}=true`;
    }).join('\n');

    throw new ModelSelectionError(
      `CRITICAL: Multiple AI models selected for ${passPrefix}\n\n` +
      `Currently active:\n${activeVars}\n\n` +
      `Set all to false except the one you want to use.`
    );
  }

  // Validate API key is present
  const model = activeModels[0];
  const apiKeyVar = getApiKeyVarName(model.vendor);

  if (!process.env[apiKeyVar]) {
    throw new ModelSelectionError(
      `Missing API key for ${model.displayName}\n` +
      `Set ${apiKeyVar} in Render.com environment variables.`
    );
  }

  // Log selected model configuration
  console.log(`[${passPrefix}] Selected model: ${model.displayName} (${model.vendor}/${model.modelId})`);
  console.log(`[${passPrefix}] Context window: ${model.contextWindow.toLocaleString()} tokens`);
  console.log(`[${passPrefix}] Cost: $${model.inputCostPer1M}/1M input, $${model.outputCostPer1M}/1M output`);

  return model;
}

/**
 * Validate model selection for a pass (without throwing)
 * Returns validation result for use in health checks
 */
export function validateModelSelection(passPrefix: string): { valid: boolean; error?: string; model?: ModelDefinition } {
  try {
    const model = getSelectedModelForPass(passPrefix);
    return { valid: true, model };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Get legacy-compatible function for Pass 0.5
 * This maintains backward compatibility with existing Pass 0.5 code
 */
export function getSelectedModel(): ModelDefinition {
  return getSelectedModelForPass('PASS_05');
}
