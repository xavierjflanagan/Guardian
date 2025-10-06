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
export declare function generateMinimalListPrompt(_input: Pass1Input): string;
/**
 * System message for minimal test
 */
export declare const MINIMAL_SYSTEM_MESSAGE = "You are a medical document entity extractor. Extract EVERY piece of information as separate entities. Never summarize lists.";
//# sourceMappingURL=pass1-prompts-minimal-test.d.ts.map