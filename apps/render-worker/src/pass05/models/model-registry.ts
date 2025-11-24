/**
 * AI Model Registry for Pass 0.5 Encounter Discovery
 *
 * This registry defines all available AI models with their specifications,
 * pricing, and capabilities. It serves as the single source of truth for
 * model configuration.
 *
 * Models are selected via environment variable toggles (true/false values).
 */

export interface ModelDefinition {
  /** Environment variable name for toggle-based selection */
  envVar: string;

  /** Vendor/provider of the model */
  vendor: 'openai' | 'google';

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
  maxTokensParam: 'max_tokens' | 'max_completion_tokens' | 'maxOutputTokens';
}

/**
 * Registry of all available AI models for Pass 0.5
 *
 * Pricing note: These values represent pricing as of November 2025.
 * When provider pricing changes, update these values and redeploy.
 * For dynamic pricing, see Future Enhancements in IMPLEMENTATION_PLAN.md.
 */
export const MODEL_REGISTRY: ModelDefinition[] = [
  // OpenAI Models
  {
    envVar: 'PASS_05_USE_GPT5',
    vendor: 'openai',
    modelId: 'gpt-5',
    displayName: 'GPT-5',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    temperatureSupported: false,  // GPT-5 is a reasoning model - only supports default temperature (1.0)
    maxTokensParam: 'max_completion_tokens'  // GPT-5 uses newer parameter
  },
  {
    envVar: 'PASS_05_USE_GPT5_MINI',
    vendor: 'openai',
    modelId: 'gpt-5-mini',
    displayName: 'GPT-5-mini',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.00,
    temperatureSupported: false,  // GPT-5-mini is a reasoning model - only supports default temperature (1.0)
    maxTokensParam: 'max_completion_tokens'  // GPT-5-mini uses newer parameter
  },
  {
    envVar: 'PASS_05_USE_GPT5_NANO',
    vendor: 'openai',
    modelId: 'gpt-5-nano',
    displayName: 'GPT-5-nano',
    contextWindow: 400_000, // Assuming same window as mini unless specified otherwise
    maxOutput: 128_000,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.40,
    temperatureSupported: false,  // Assuming same behavior as other GPT-5 variants
    maxTokensParam: 'max_completion_tokens'
  },

  // Google Gemini Models
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_PRO',
    vendor: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,  // 1M tokens
    maxOutput: 65_536,
    inputCostPer1M: 1.25, // Tier 1 (<= 200k tokens)
    outputCostPer1M: 10.00, // Tier 1 (<= 200k tokens)
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens'
  },
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_FLASH',
    vendor: 'google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1_048_576,  // 1M tokens
    maxOutput: 65_536,
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.50,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens'
  },
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_FLASH_LITE',
    vendor: 'google',
    modelId: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    contextWindow: 1_048_576,  // 1M tokens
    maxOutput: 65_536,
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens'
  }
];

/**
 * Get model definition by environment variable name
 */
export function getModelByEnvVar(envVar: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.envVar === envVar);
}

/**
 * Get model definition by model ID
 */
export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.modelId === modelId);
}
