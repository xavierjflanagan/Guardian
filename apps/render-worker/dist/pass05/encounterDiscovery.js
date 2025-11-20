"use strict";
/**
 * Task 1: Healthcare Encounter Discovery - STRATEGY A (V11)
 *
 * STRATEGY A (V11):
 * - ALL documents use progressive mode (no page threshold)
 * - Cascade-based encounter continuity
 * - All encounters created as "pendings" first, reconciled later
 * - Uses aiPrompts.v11.ts via chunk-processor.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverEncounters = discoverEncounters;
const session_manager_1 = require("./progressive/session-manager");
/**
 * STRATEGY A (v11): Extract healthcare encounters using universal progressive mode
 *
 * All documents (1-1000+ pages) use the same progressive pipeline:
 * - Chunks documents into 50-page batches
 * - Processes each chunk with aiPrompts.v11 (cascade-aware)
 * - Creates pending encounters during processing
 * - Reconciles all pendings after all chunks complete
 */
async function discoverEncounters(input) {
    try {
        console.log(`[Pass 0.5] STRATEGY A (v11): Universal progressive mode for ${input.pageCount} pages`);
        const progressiveResult = await (0, session_manager_1.processDocumentProgressively)(input.shellFileId, input.patientId, input.ocrOutput.fullTextAnnotation.pages);
        return {
            success: true,
            encounters: [], // Strategy A: Encounters written to DB, query healthcare_encounters to retrieve
            page_assignments: [], // Strategy A: Handled by reconciliation, query pass05_page_assignments
            aiModel: progressiveResult.aiModel,
            aiCostUsd: progressiveResult.totalCost,
            inputTokens: progressiveResult.totalInputTokens,
            outputTokens: progressiveResult.totalOutputTokens
        };
    }
    catch (error) {
        console.error('[Pass 0.5] Encounter discovery error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            aiModel: 'unknown',
            aiCostUsd: 0,
            inputTokens: 0,
            outputTokens: 0
        };
    }
}
//# sourceMappingURL=encounterDiscovery.js.map