/**
 * OpenAI Provider - Shared across all passes
 *
 * Implements AI generation using OpenAI's Chat Completions API.
 * Supports GPT-4o, GPT-4o-mini, GPT-5 family, and future models.
 */

import OpenAI from 'openai';
import { BaseAIProvider, AIResponse, GenerateOptions } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateJSON(prompt: string, options?: GenerateOptions): Promise<AIResponse> {
    // Estimate and validate prompt size
    const systemMessage = options?.systemMessage || '';
    const promptTokens = this.estimateTokens(prompt) + this.estimateTokens(systemMessage);
    this.validateContextWindow(promptTokens);

    // Build messages array
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }

    messages.push({ role: 'user', content: prompt });

    // Build request parameters
    const requestParams: any = {
      model: this.model.modelId,
      messages,
      response_format: { type: 'json_object' }  // Force JSON response
    };

    // Set max tokens parameter (GPT-5 uses max_completion_tokens, others use max_tokens)
    const maxTokens = options?.maxOutputTokens || this.model.maxOutput;
    if (this.model.maxTokensParam === 'max_completion_tokens') {
      requestParams.max_completion_tokens = maxTokens;
    } else {
      requestParams.max_tokens = maxTokens;
    }

    // Set temperature if supported
    if (this.model.temperatureSupported) {
      requestParams.temperature = options?.temperature ?? 0.1;
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
