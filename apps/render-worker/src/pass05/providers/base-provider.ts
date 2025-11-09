/**
 * Base AI Provider for Pass 0.5
 *
 * Abstract base class providing common interface and utilities for all
 * AI model providers (OpenAI, Google, future vendors).
 *
 * All providers must implement generateJSON() to return structured
 * encounter discovery results.
 */

import { ModelDefinition } from '../models/model-registry';

/**
 * Standardized response from AI providers
 */
export interface AIResponse {
  /** JSON content returned by the model */
  content: string;

  /** Actual model identifier used (may differ from requested) */
  model: string;

  /** Number of input tokens consumed */
  inputTokens: number;

  /** Number of output tokens generated */
  outputTokens: number;

  /** Calculated cost in USD */
  cost: number;
}

/**
 * Abstract base class for AI providers
 *
 * Provides:
 * - Cost calculation based on token usage
 * - Context window validation
 * - Common error handling patterns
 */
export abstract class BaseAIProvider {
  protected model: ModelDefinition;

  constructor(model: ModelDefinition) {
    this.model = model;
  }

  /**
   * Generate JSON response from prompt
   *
   * All providers must implement this method to:
   * 1. Send prompt to their AI model
   * 2. Ensure response is valid JSON
   * 3. Return standardized AIResponse with tokens and cost
   *
   * @param prompt - The complete prompt text
   * @returns Promise<AIResponse> with JSON content and metadata
   */
  abstract generateJSON(prompt: string): Promise<AIResponse>;

  /**
   * Calculate cost based on token usage and model pricing
   *
   * @param inputTokens - Number of input tokens used
   * @param outputTokens - Number of output tokens generated
   * @returns Cost in USD (database will round to 4 decimal places on storage)
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.model.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * this.model.outputCostPer1M;
    return inputCost + outputCost;
  }

  /**
   * Validate that prompt fits within model's context window
   *
   * Note: Assumes promptTokens includes all overhead (system messages, schema, etc.)
   *
   * @param promptTokens - Estimated token count of prompt (including all overhead)
   * @throws Error if prompt exceeds context window
   */
  protected validateContextWindow(promptTokens: number): void {
    if (promptTokens > this.model.contextWindow) {
      throw new Error(
        `Prompt exceeds ${this.model.displayName} context window: ` +
        `${promptTokens.toLocaleString()} > ${this.model.contextWindow.toLocaleString()} tokens`
      );
    }
  }

  /**
   * Estimate token count from text length
   *
   * Uses rough approximation: 1 token ≈ 4 characters
   * This is conservative and works across most models.
   *
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
