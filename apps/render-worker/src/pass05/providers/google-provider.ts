/**
 * Google Gemini Provider for Pass 0.5
 *
 * Implements AI generation using Google's Generative AI API.
 * Supports Gemini 2.5 Pro and Gemini 2.5 Flash models with JSON mode.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider, AIResponse } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  async generateJSON(prompt: string): Promise<AIResponse> {
    // Estimate and validate prompt size
    const promptTokens = this.estimateTokens(prompt);
    this.validateContextWindow(promptTokens);

    // Configure generation settings
    const genModel = this.client.getGenerativeModel({
      model: this.model.modelId,
      generationConfig: {
        temperature: this.model.temperatureSupported ? 0.1 : 1.0,
        maxOutputTokens: this.model.maxOutput,  // Use full model capability (65K for Gemini)
        responseMimeType: 'application/json'  // Force JSON response
      }
    });

    try {
      // Generate content
      const result = await genModel.generateContent(prompt);
      const response = result.response;

      // Extract token counts from metadata (with estimation fallback)
      const metadata = response.usageMetadata;
      const inputTokens = metadata?.promptTokenCount || promptTokens;
      const outputTokens = metadata?.candidatesTokenCount || this.estimateTokens(response.text());

      // Calculate cost
      const cost = this.calculateCost(inputTokens, outputTokens);

      return {
        content: response.text(),
        model: this.model.modelId,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (error: any) {
      // Enhanced error handling for common Google AI errors
      if (error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(
          `Google AI quota exceeded for ${this.model.displayName}. ` +
          `Check your API quota or try again later.`
        );
      }

      if (error.message?.includes('INVALID_ARGUMENT') && error.message?.includes('token')) {
        throw new Error(
          `Document too large for ${this.model.displayName}: ` +
          `Prompt requires ~${promptTokens.toLocaleString()} tokens, ` +
          `but model supports only ${this.model.contextWindow.toLocaleString()} tokens`
        );
      }

      if (error.message?.includes('API_KEY_INVALID') || error.status === 401) {
        throw new Error('Invalid Google AI API key. Check GOOGLE_AI_API_KEY environment variable.');
      }

      if (error.status === 429) {
        throw new Error(
          `Google AI rate limit exceeded for ${this.model.displayName}. ` +
          `Retry after a brief delay.`
        );
      }

      // Generic error passthrough
      throw new Error(`Google AI API error (${this.model.displayName}): ${error.message}`);
    }
  }
}
