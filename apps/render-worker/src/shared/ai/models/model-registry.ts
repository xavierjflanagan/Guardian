/**
 * AI Model Registry - Shared across all passes
 *
 * This registry defines all available AI models with their specifications,
 * pricing, and capabilities. It serves as the single source of truth for
 * model configuration across Pass 0.5, Pass 1, and future passes.
 *
 * Models are selected via environment variable toggles (true/false values).
 * Each pass has its own prefix (e.g., PASS_05_USE_*, PASS_1_USE_*).
 */

export type AIVendor = 'openai' | 'google';
export type MaxTokensParam = 'max_tokens' | 'max_completion_tokens' | 'maxOutputTokens';

export interface ModelDefinition {
  /** Environment variable name for toggle-based selection (without pass prefix) */
  envVarSuffix: string;

  /** Vendor/provider of the model */
  vendor: AIVendor;

  /** Model identifier used in API calls */
  modelId: string;

  /** Human-readable model name for logs and errors */
  displayName: string;

  /** Maximum input tokens (context window) */
  contextWindow: number;

  /** Maximum output tokens */
  maxOutput: number;

  /** Cost per million input tokens (USD) */
  inputCostPer1M: number;

  /** Cost per million output tokens (USD) */
  outputCostPer1M: number;

  /** Whether the model supports temperature parameter */
  temperatureSupported: boolean;

  /** Parameter name for max tokens - vendor-specific */
  maxTokensParam: MaxTokensParam;

  /** Which passes can use this model */
  availableForPasses: string[];
}

/**
 * Registry of all available AI models
 *
 * Pricing note: These values represent pricing as of November 2025.
 * When provider pricing changes, update these values and redeploy.
 */
export const MODEL_REGISTRY: ModelDefinition[] = [
  // ==========================================================================
  // OpenAI GPT-5 Family (Pass 0.5 - reasoning/discovery tasks)
  // ==========================================================================
  {
    envVarSuffix: 'USE_GPT5',
    vendor: 'openai',
    modelId: 'gpt-5',
    displayName: 'GPT-5',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    temperatureSupported: false,  // Reasoning model - only default temperature
    maxTokensParam: 'max_completion_tokens',
    availableForPasses: ['PASS_05']
  },
  {
    envVarSuffix: 'USE_GPT5_MINI',
    vendor: 'openai',
    modelId: 'gpt-5-mini',
    displayName: 'GPT-5-mini',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.00,
    temperatureSupported: false,
    maxTokensParam: 'max_completion_tokens',
    availableForPasses: ['PASS_05']
  },
  {
    envVarSuffix: 'USE_GPT5_NANO',
    vendor: 'openai',
    modelId: 'gpt-5-nano',
    displayName: 'GPT-5-nano',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.40,
    temperatureSupported: false,
    maxTokensParam: 'max_completion_tokens',
    availableForPasses: ['PASS_05']
  },

  // ==========================================================================
  // OpenAI GPT-4o Family (Pass 1 - entity extraction)
  // ==========================================================================
  {
    envVarSuffix: 'USE_GPT4O',
    vendor: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    contextWindow: 128_000,
    maxOutput: 16_384,
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    temperatureSupported: true,
    maxTokensParam: 'max_tokens',
    availableForPasses: ['PASS_1']
  },
  {
    envVarSuffix: 'USE_GPT4O_MINI',
    vendor: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o-mini',
    contextWindow: 128_000,
    maxOutput: 16_384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    temperatureSupported: true,
    maxTokensParam: 'max_tokens',
    availableForPasses: ['PASS_1']
  },

  // ==========================================================================
  // Google Gemini Family (available for multiple passes)
  // ==========================================================================
  {
    envVarSuffix: 'USE_GEMINI_2_5_PRO',
    vendor: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,  // 1M tokens
    maxOutput: 65_536,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens',
    availableForPasses: ['PASS_05', 'PASS_1']
  },
  {
    envVarSuffix: 'USE_GEMINI_2_5_FLASH',
    vendor: 'google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens',
    availableForPasses: ['PASS_05', 'PASS_1']
  },
  {
    envVarSuffix: 'USE_GEMINI_2_5_FLASH_LITE',
    vendor: 'google',
    modelId: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens',
    availableForPasses: ['PASS_05', 'PASS_1']
  }
];

/**
 * Get models available for a specific pass
 */
export function getModelsForPass(passPrefix: string): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.availableForPasses.includes(passPrefix));
}

/**
 * Get model definition by model ID
 */
export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.modelId === modelId);
}

/**
 * Build full environment variable name for a model and pass
 */
export function buildEnvVarName(passPrefix: string, envVarSuffix: string): string {
  return `${passPrefix}_${envVarSuffix}`;
}
