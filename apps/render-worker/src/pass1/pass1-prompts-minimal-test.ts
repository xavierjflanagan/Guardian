/**
 * EXPERIMENTAL: Minimal List-First Prompt for Testing
 * Created: 2025-10-06
 * Purpose: Test if instruction dilution is causing under-extraction
 *
 * Hypothesis: The 348-line complex prompt is overwhelming the AI,
 * causing it to summarize lists instead of extracting individual items.
 *
 * This minimal prompt strips away all complexity to test pure extraction.
 */

import { Pass1Input } from './pass1-types';

/**
 * Ultra-minimal prompt focused ONLY on list extraction
 * No taxonomy, no examples, no complex instructions
 */
export function generateMinimalListPrompt(_input: Pass1Input): string {
  return `
Extract EVERY piece of information from this medical document as SEPARATE entities.

CRITICAL RULES:
1. Each list item = separate entity (DO NOT summarize lists)
2. If you see 9 immunizations, emit 9 separate entities
3. Each phone number = separate entity
4. Each address = separate entity
5. Split multi-item lines (commas, "and", slashes) into separate entities

Return JSON with this structure:
{
  "entities": [
    {
      "id": "1",
      "text": "exact text from document",
      "category": "patient_info|clinical|facility|other",
      "bbox": {"x": 0, "y": 0, "width": 0, "height": 0}
    }
  ],
  "total_count": <number>
}

Extract EVERYTHING you see. No summarization. Each item = separate entity.
`.trim();
}

/**
 * System message for minimal test
 */
export const MINIMAL_SYSTEM_MESSAGE = `You are a medical document entity extractor. Extract EVERY piece of information as separate entities. Never summarize lists.`;
