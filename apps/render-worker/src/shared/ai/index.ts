/**
 * Shared AI Module - Public Exports
 *
 * This module provides a unified interface for AI model selection and
 * provider instantiation across all processing passes.
 *
 * Usage:
 *   import { getSelectedModelForPass, AIProviderFactory } from '../shared/ai';
 *
 *   const model = getSelectedModelForPass('PASS_1');
 *   const provider = AIProviderFactory.createProvider(model);
 *   const response = await provider.generateJSON(prompt, { systemMessage });
 */

// Model Registry
export {
  ModelDefinition,
  AIVendor,
  MaxTokensParam,
  MODEL_REGISTRY,
  getModelsForPass,
  getModelById,
  buildEnvVarName
} from './models/model-registry';

// Model Selector
export {
  ModelSelectionError,
  getSelectedModelForPass,
  getSelectedModel,  // Legacy compatibility for Pass 0.5
  validateModelSelection
} from './models/model-selector';

// Providers
export {
  AIResponse,
  GenerateOptions,
  BaseAIProvider
} from './providers/base-provider';

export { OpenAIProvider } from './providers/openai-provider';
export { GoogleProvider } from './providers/google-provider';
export { AIProviderFactory } from './providers/provider-factory';
