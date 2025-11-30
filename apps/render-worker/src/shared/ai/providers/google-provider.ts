/**
 * Google Gemini Provider - Shared across all passes
 *
 * Implements AI generation using Google's Generative AI API.
 * Supports Gemini 2.5 Pro, Flash, and Flash-Lite models.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider, AIResponse, GenerateOptions } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  async generateJSON(prompt: string, options?: GenerateOptions): Promise<AIResponse> {
    // Estimate and validate prompt size
    const systemMessage = options?.systemMessage || '';
    const promptTokens = this.estimateTokens(prompt) + this.estimateTokens(systemMessage);
    this.validateContextWindow(promptTokens);

    // Configure generation settings
    const maxTokens = options?.maxOutputTokens || this.model.maxOutput;
    const temperature = this.model.temperatureSupported
      ? (options?.temperature ?? 0.1)
      : 1.0;

    const genModel = this.client.getGenerativeModel({
      model: this.model.modelId,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json'  // Force JSON response
      },
      systemInstruction: systemMessage || undefined
    });

    try {
      // Generate content
      const result = await genModel.generateContent(prompt);
      const response = result.response;

      // Check if response has candidates
      if (!response.candidates || response.candidates.length === 0) {
        const blockReason = (response as any).promptFeedback?.blockReason || 'UNKNOWN';
        throw new Error(
          `Gemini returned no candidates. Block reason: ${blockReason}. ` +
          `This usually indicates safety filter blocking or content policy violation.`
        );
      }

      // Check finish reason
      const candidate = response.candidates[0];
      const finishReason = candidate.finishReason;

      if (finishReason && finishReason !== 'STOP') {
        throw new Error(
          `Gemini stopped generation with reason: ${finishReason}. ` +
          `This may indicate: MAX_TOKENS (output too long), SAFETY (blocked content), ` +
          `RECITATION (copyright), or OTHER issues.`
        );
      }

      // Extract text content
      const textContent = response.text();
      if (!textContent || textContent.trim() === '') {
        throw new Error(
          `Gemini returned empty text content despite having candidates. ` +
          `Finish reason: ${finishReason || 'UNKNOWN'}`
        );
      }

      // Extract token counts from metadata
      const metadata = response.usageMetadata;
      const inputTokens = metadata?.promptTokenCount || promptTokens;
      const outputTokens = metadata?.candidatesTokenCount || this.estimateTokens(textContent);

      // Calculate cost
      const cost = this.calculateCost(inputTokens, outputTokens);

      return {
        content: textContent,
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
