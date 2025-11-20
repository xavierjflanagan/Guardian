/**
 * OpenAI Provider for Pass 0.5
 *
 * Implements AI generation using OpenAI's Chat Completions API.
 * Supports GPT-5 and GPT-5-mini models with JSON mode.
 */

import OpenAI from 'openai';
import { BaseAIProvider, AIResponse } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateJSON(prompt: string): Promise<AIResponse> {
    // Estimate and validate prompt size
    const promptTokens = this.estimateTokens(prompt);
    this.validateContextWindow(promptTokens);

    // Build request parameters
    const requestParams: any = {
      model: this.model.modelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' }  // Force JSON response
    };

    // Set max tokens parameter (GPT-5 uses max_completion_tokens)
    if (this.model.maxTokensParam === 'max_completion_tokens') {
      requestParams.max_completion_tokens = this.model.maxOutput;
    } else {
      requestParams.max_tokens = this.model.maxOutput;
    }

    // Set temperature if supported
    if (this.model.temperatureSupported) {
      requestParams.temperature = 0.1;  // Low temperature for consistent structured output
    }

    try {
      // Call OpenAI API
      const response = await this.client.chat.completions.create(requestParams);

      // Extract token counts from usage metadata
      const inputTokens = response.usage?.prompt_tokens || promptTokens;
      const outputTokens = response.usage?.completion_tokens || 0;

      // Calculate cost
      const cost = this.calculateCost(inputTokens, outputTokens);

      return {
        content: response.choices[0].message.content || '{}',
        model: response.model,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (error: any) {
      // Enhanced error handling for common OpenAI errors
      if (error.code === 'context_length_exceeded') {
        throw new Error(
          `Document too large for ${this.model.displayName}: ` +
          `Prompt requires ~${promptTokens.toLocaleString()} tokens, ` +
          `but model supports only ${this.model.contextWindow.toLocaleString()} tokens`
        );
      }

      if (error.status === 429) {
        throw new Error(
          `OpenAI rate limit exceeded for ${this.model.displayName}. ` +
          `Retry after: ${error.headers?.['retry-after'] || 'unknown'}`
        );
      }

      if (error.status === 401) {
        throw new Error('Invalid OpenAI API key. Check OPENAI_API_KEY environment variable.');
      }

      // Generic error passthrough
      throw new Error(`OpenAI API error (${this.model.displayName}): ${error.message}`);
    }
  }
}
