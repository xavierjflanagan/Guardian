/**
 * AI Provider Factory - Shared across all passes
 *
 * Factory pattern for creating vendor-specific AI providers.
 * Maps model definitions to their corresponding provider implementations.
 */

import { ModelDefinition } from '../models/model-registry';
import { BaseAIProvider } from './base-provider';
import { OpenAIProvider } from './openai-provider';
import { GoogleProvider } from './google-provider';

/**
 * Factory for creating AI provider instances
 */
export class AIProviderFactory {
  /**
   * Create an AI provider instance based on model vendor
   *
   * @param model - Model definition from registry
   * @returns Instantiated provider (OpenAIProvider or GoogleProvider)
   * @throws Error if vendor is not supported
   */
  static createProvider(model: ModelDefinition): BaseAIProvider {
    switch (model.vendor) {
      case 'openai':
        return new OpenAIProvider(model);

      case 'google':
        return new GoogleProvider(model);

      default:
        throw new Error(
          `Unsupported vendor: ${(model as any).vendor}\n` +
          `Supported vendors: openai, google`
        );
    }
  }
}
