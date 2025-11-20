/**
 * Model Selector for Pass 0.5
 *
 * Implements toggle-based model selection with fail-fast validation.
 * Ensures exactly one model is selected and required API keys are present.
 *
 * This module validates configuration on load in production, causing the
 * worker to fail immediately if misconfigured (preventing bad deployments).
 */

import { MODEL_REGISTRY, ModelDefinition } from './model-registry';

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
 * Get the currently selected AI model based on environment variables
 *
 * Validation rules:
 * - Exactly ONE model must have its env var set to true/TRUE/1/yes/YES
 * - The corresponding API key must be present
 * - If validation fails, throws ModelSelectionError
 *
 * @throws {ModelSelectionError} If no model selected, multiple models selected, or API key missing
 * @returns {ModelDefinition} The selected model configuration
 */
export function getSelectedModel(): ModelDefinition {
  const activeModels: ModelDefinition[] = [];

  // Check each model's environment variable
  for (const model of MODEL_REGISTRY) {
    const envValue = process.env[model.envVar];
    const isActive = ['true', 'TRUE', '1', 'yes', 'YES'].includes(envValue || 'false');

    if (isActive) {
      activeModels.push(model);
    }
  }

  // Validation: Exactly one model must be selected
  if (activeModels.length === 0) {
    const availableVars = MODEL_REGISTRY.map(m => {
      const apiKey = m.vendor === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_AI_API_KEY';
      return `  ${m.envVar}=true  # ${m.displayName} (requires ${apiKey})`;
    }).join('\n');
    throw new ModelSelectionError(
      `CRITICAL: No AI model selected for Pass 0.5\n\n` +
      `Set exactly ONE of these in Render.com:\n${availableVars}`
    );
  }

  if (activeModels.length > 1) {
    const activeVars = activeModels.map(m => `  ${m.envVar}=true`).join('\n');
    throw new ModelSelectionError(
      `CRITICAL: Multiple AI models selected\n\n` +
      `Currently active:\n${activeVars}\n\n` +
      `Set all to false except the one you want to use.`
    );
  }

  // Validate API key is present
  const model = activeModels[0];
  const apiKeyVar = model.vendor === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_AI_API_KEY';

  if (!process.env[apiKeyVar]) {
    throw new ModelSelectionError(
      `Missing API key for ${model.displayName}\n` +
      `Set ${apiKeyVar} in Render.com environment variables.`
    );
  }

  // Log selected model configuration
  console.log(`[Pass 0.5] Selected model: ${model.displayName} (${model.vendor}/${model.modelId})`);
  console.log(`[Pass 0.5] Context window: ${model.contextWindow.toLocaleString()} tokens`);
  console.log(`[Pass 0.5] Cost: $${model.inputCostPer1M}/1M input, $${model.outputCostPer1M}/1M output`);

  return model;
}

/**
 * Validate model selection on module load (fail-fast in production)
 *
 * This runs when the module is imported, ensuring the worker fails to start
 * if misconfigured. This prevents bad deployments from processing jobs.
 */
if (process.env.NODE_ENV === 'production') {
  try {
    getSelectedModel();
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('WORKER STARTUP FAILED - MODEL CONFIGURATION ERROR');
    console.error('='.repeat(80));
    console.error((error as Error).message);
    console.error('='.repeat(80) + '\n');
    process.exit(1);  // Fail-fast in production
  }
}
