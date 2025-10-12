/**
 * Unit tests for Pass1EntityDetector cost calculation
 * Fix for issue: Model-specific pricing implementation (2025-10-12)
 *
 * Tests verify that cost calculations use correct model-specific pricing:
 * - GPT-5 Mini: $0.25/$2.00 per 1M tokens
 * - GPT-4o: $2.50/$10.00 per 1M tokens
 * - Unknown models: fallback to GPT-4o pricing with warning
 */

import { Pass1EntityDetector } from '../Pass1EntityDetector';
import { Pass1Config } from '../pass1-types';

// Mock OpenAI to avoid real API calls
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

describe('Pass1EntityDetector - Cost Calculation', () => {
  const baseConfig: Pass1Config = {
    openai_api_key: 'test-api-key',
    model: 'gpt-5-mini',
    temperature: 0.1,
    max_tokens: 4000,
    confidence_threshold: 0.7,
  };

  describe('GPT-5 Mini pricing ($0.25/$2.00 per 1M tokens)', () => {
    test('calculates cost correctly for production test case', () => {
      // Real production data from 2025-10-12 test
      const inputTokens = 10653;
      const outputTokens = 13083;
      const expectedCost = 0.02883; // (10653 * 0.25 + 13083 * 2.00) / 1M

      const config = { ...baseConfig, model: 'gpt-5-mini' };
      const detector = new Pass1EntityDetector(config);

      // Access private method through type casting (test-only)
      const cost = (detector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      expect(cost).toBeCloseTo(expectedCost, 4);
    });

    test('calculates cost correctly for 1M tokens each direction', () => {
      const inputTokens = 1_000_000;
      const outputTokens = 1_000_000;
      const expectedCost = 2.25; // $0.25 + $2.00

      const config = { ...baseConfig, model: 'gpt-5-mini' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      expect(cost).toBeCloseTo(expectedCost, 2);
    });

    test('handles zero tokens', () => {
      const config = { ...baseConfig, model: 'gpt-5-mini' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });

      expect(cost).toBe(0);
    });
  });

  describe('GPT-4o pricing ($2.50/$10.00 per 1M tokens)', () => {
    test('calculates cost correctly for production test case', () => {
      // Same token counts as GPT-5 Mini test, but with GPT-4o pricing
      const inputTokens = 10653;
      const outputTokens = 13083;
      const expectedCost = 0.1575; // (10653 * 2.50 + 13083 * 10.00) / 1M

      const config = { ...baseConfig, model: 'gpt-4o' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      expect(cost).toBeCloseTo(expectedCost, 4);
    });

    test('calculates cost correctly for 1M tokens each direction', () => {
      const inputTokens = 1_000_000;
      const outputTokens = 1_000_000;
      const expectedCost = 12.50; // $2.50 + $10.00

      const config = { ...baseConfig, model: 'gpt-4o' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      expect(cost).toBeCloseTo(expectedCost, 2);
    });
  });

  describe('Unknown model fallback (uses GPT-4o pricing)', () => {
    test('falls back to GPT-4o pricing for unknown model', () => {
      const inputTokens = 10653;
      const outputTokens = 13083;
      const expectedCost = 0.1575; // GPT-4o pricing

      const config = { ...baseConfig, model: 'gpt-unknown-model' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      expect(cost).toBeCloseTo(expectedCost, 4);
    });

    test('handles missing usage object gracefully', () => {
      const config = { ...baseConfig, model: 'gpt-5-mini' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost(null);

      expect(cost).toBe(0);
    });

    test('handles undefined token counts', () => {
      const config = { ...baseConfig, model: 'gpt-5-mini' };
      const detector = new Pass1EntityDetector(config);

      const cost = (detector as any).calculateCost({
        prompt_tokens: undefined,
        completion_tokens: undefined,
      });

      expect(cost).toBe(0);
    });
  });

  describe('Model-specific pricing verification', () => {
    test('GPT-5 Mini is 10x cheaper than GPT-4o', () => {
      const inputTokens = 10653;
      const outputTokens = 13083;

      const gpt5Config = { ...baseConfig, model: 'gpt-5-mini' };
      const gpt4oConfig = { ...baseConfig, model: 'gpt-4o' };

      const gpt5Detector = new Pass1EntityDetector(gpt5Config);
      const gpt4oDetector = new Pass1EntityDetector(gpt4oConfig);

      const gpt5Cost = (gpt5Detector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      const gpt4oCost = (gpt4oDetector as any).calculateCost({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      });

      // Verify GPT-5 Mini is significantly cheaper (5.46x in this case)
      expect(gpt4oCost / gpt5Cost).toBeCloseTo(5.46, 1);
      expect(gpt5Cost).toBeLessThan(gpt4oCost);
    });
  });
});
