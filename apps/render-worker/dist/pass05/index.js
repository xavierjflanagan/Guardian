"use strict";
/**
 * Pass 0.5: Healthcare Encounter Discovery
 * Main Entry Point
 *
 * PURPOSE:
 * 1. Review ENTIRE document (all pages)
 * 2. Detect and classify encounters
 * 3. Determine batch separation points for downstream processing
 *
 * CURRENT IMPLEMENTATION:
 * - Processes files of any size (no hardcoded page limit)
 * - Batch boundary detection: Not yet implemented (returns null)
 * - GPT-5 token limit: Unknown (testing in progress)
 *
 * FUTURE CONSIDERATION (100+ page files):
 * - If file exceeds GPT-5 input token limit, may need "pre-batching"
 * - Pre-batching would split file BEFORE Pass 0.5 (rough cuts)
 * - Then Pass 0.5 runs on each pre-batch to determine real batch boundaries
 * - Without pre-batching, very large files may fail at GPT-5 token ceiling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPass05 = runPass05;
const supabase_js_1 = require("@supabase/supabase-js");
const encounterDiscovery_1 = require("./encounterDiscovery");
const databaseWriter_1 = require("./databaseWriter");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function runPass05(input) {
    const startTime = Date.now();
    try {
        // IDEMPOTENCY CHECK: Return early if already processed
        const { data: existingManifest } = await supabase
            .from('shell_file_manifests')
            .select('manifest_id, manifest_data, processing_time_ms, ai_model_used, ai_cost_usd')
            .eq('shell_file_id', input.shellFileId)
            .single();
        if (existingManifest) {
            console.log(`[Pass 0.5] Shell file ${input.shellFileId} already processed, returning existing result`);
            // Safe to return early: Transaction wrapper (write_pass05_manifest_atomic) ensures
            // if manifest exists, metrics and shell_files completion flags MUST also exist.
            // All 3 writes happen atomically - no partial failures possible.
            return {
                success: true,
                manifest: existingManifest.manifest_data,
                processingTimeMs: existingManifest.processing_time_ms || 0,
                aiCostUsd: existingManifest.ai_cost_usd || 0,
                aiModel: existingManifest.ai_model_used
            };
        }
        // TASK 1: Encounter Discovery (runs for all file sizes)
        // Note: GPT-5 token limit will organically reveal itself through testing
        // If very large files (100+ pages) fail, implement pre-batching strategy
        const encounterResult = await (0, encounterDiscovery_1.discoverEncounters)({
            shellFileId: input.shellFileId,
            patientId: input.patientId,
            ocrOutput: input.ocrOutput,
            pageCount: input.pageCount
        });
        if (!encounterResult.success) {
            return {
                success: false,
                error: encounterResult.error,
                processingTimeMs: Date.now() - startTime,
                aiCostUsd: encounterResult.aiCostUsd,
                aiModel: encounterResult.aiModel
            };
        }
        // Build manifest (Task 1 only - no batching)
        const manifest = {
            shellFileId: input.shellFileId,
            patientId: input.patientId,
            totalPages: input.pageCount,
            ocrAverageConfidence: calculateAverageConfidence(input.ocrOutput),
            encounters: encounterResult.encounters,
            page_assignments: encounterResult.page_assignments, // v2.3: Include if present
            batching: null // Phase 1: always null
        };
        // Write manifest and encounters to database
        await (0, databaseWriter_1.writeManifestToDatabase)({
            manifest,
            aiModel: encounterResult.aiModel,
            aiCostUsd: encounterResult.aiCostUsd,
            processingTimeMs: Date.now() - startTime,
            inputTokens: encounterResult.inputTokens,
            outputTokens: encounterResult.outputTokens,
            processingSessionId: input.processingSessionId // Passed from job coordinator
        });
        return {
            success: true,
            manifest,
            processingTimeMs: Date.now() - startTime,
            aiCostUsd: encounterResult.aiCostUsd,
            aiModel: encounterResult.aiModel
        };
    }
    catch (error) {
        console.error('[Pass 0.5] Unexpected error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTimeMs: Date.now() - startTime,
            aiCostUsd: 0,
            aiModel: 'n/a'
        };
    }
}
function calculateAverageConfidence(ocrOutput) {
    const confidences = ocrOutput.fullTextAnnotation.pages.map(p => p.confidence);
    if (confidences.length === 0)
        return 0;
    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}
//# sourceMappingURL=index.js.map