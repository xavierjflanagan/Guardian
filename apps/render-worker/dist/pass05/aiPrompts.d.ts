/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 *
 * VERSION HISTORY:
 * v1 (original) - Backed up as aiPrompts.v1.ts
 * v2.0 (Nov 2, 2025 10:20 AM) - Added Scenario D: Metadata Page Recognition (INITIAL)
 *    - Fixes Test 06 boundary detection issue (detected 11/12, should be 13/14)
 *    - Added weighted boundary signal priority
 *    - Added guidance: metadata pages belong to PRECEDING document
 *    - ISSUE: Too specific to Test 06 structure, assumed metadata always at end
 * v2.1 (Nov 2, 2025 10:30 AM) - Made metadata guidance GENERAL and context-based
 *    - Changed from position-based ("PRECEDING") to context-based (provider continuity)
 *    - Added Pattern A/B/C examples covering metadata at start/end/middle
 *    - Key principle: Use provider/facility matching, not page position
 *    - Handles metadata as cover pages, signature blocks, or between sections
 * v2.2 (Nov 2, 2025 11:00 PM) - Document Header vs Metadata distinction
 *    - Added critical distinction: "Encounter Summary" headers are STARTERS, not metadata
 *    - Generation dates (report printed) vs Encounter dates (clinical visit)
 *    - Prevents mistaking new encounter documents for metadata pages
 *    - Pattern D example: Don't confuse close generation dates with same encounter
 * v2.3 (Nov 3, 2025) - Page-by-Page Assignment with Justifications
 *    - Forces explicit page-to-encounter assignment for all pages
 *    - Requires brief justification (15-20 words) for each page assignment
 *    - Exposes contradictions at boundary pages through required reasoning
 *    - Addresses Test 06 failure: model ignored boundary signals in v2.2
 *    - Chain-of-thought approach to improve instruction compliance
 * v2.4 (Nov 4, 2025) - Lab Report Date Extraction Fix (Migration 38 follow-up)
 *    - CRITICAL FIX: Lab reports with specific dates now apply Timeline Test
 *    - Lab report with date + facility → real-world encounter (timeline-worthy)
 *    - Lab report without date → pseudo_lab_report (not timeline-worthy)
 *    - Resolves PASS05-001: Lab test dates now populate encounter_date field
 *    - Updated pseudo_lab_report classification to exclude dated reports
 *    - Same fix applied to imaging reports
 *    - Updated Example 3 to show dated lab report as timeline-worthy encounter
 */
import { OCRPage } from './types';
export interface PromptInput {
    fullText: string;
    pageCount: number;
    ocrPages: OCRPage[];
}
/**
 * Build prompt for encounter discovery (Task 1)
 * GPT-5-mini text analysis
 */
export declare function buildEncounterDiscoveryPrompt(input: PromptInput): string;
//# sourceMappingURL=aiPrompts.d.ts.map