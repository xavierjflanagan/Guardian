/**
 * AI Provider Factory for Pass 0.5
 *
 * Factory pattern for creating vendor-specific AI providers.
 * Maps model definitions to their corresponding provider implementations.
 */

import { ModelDefinition } from '../models/model-registry';
import { BaseAIProvider } from './base-provider';
import { OpenAIProvider } from './openai-provider';
import { GoogleProvider } from './google-provider';

/**
 * Create an AI provider instance based on model vendor
 *
 * @param model - Model definition from registry
 * @returns Instantiated provider (OpenAIProvider or GoogleProvider)
 * @throws Error if vendor is not supported
 */
export class AIProviderFactory {
  static createProvider(model: ModelDefinition): BaseAIProvider {
    switch (model.vendor) {
      case 'openai':
        return new OpenAIProvider(model);

      case 'google':
        return new GoogleProvider(model);

      default:
        throw new Error(
          `Unsupported vendor: ${model.vendor}\n` +
          `Supported vendors: openai, google`
        );
    }
  }
}
