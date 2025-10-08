/**
 * TEST 04 PHASE 1: Minimal Prompt + Entity Taxonomy
 * Created: 2025-10-07
 * Purpose: Add structured entity classification while maintaining extraction quality
 *
 * Evolution from Test 03 (baseline):
 * - Test 03: 20 lines, 53 entities avg, no classification
 * - Phase 1: ~60 lines, target 50+ entities with proper categories
 *
 * Phase 1 adds: Compact 3-tier taxonomy, disambiguation rules, combo vaccine splitting
 */
import { Pass1Input } from './pass1-types';
/**
 * Phase 1: Minimal prompt + entity taxonomy for classification
 */
export declare function generateMinimalListPrompt(_input: Pass1Input): string;
/**
 * System message for Phase 1 taxonomy test
 */
export declare const MINIMAL_SYSTEM_MESSAGE = "You are a medical document entity classifier. Extract EVERY piece of information as separate classified entities. Never summarize lists. Always split combination items into separate entities.";
//# sourceMappingURL=pass1-prompts-minimal-test.d.ts.map