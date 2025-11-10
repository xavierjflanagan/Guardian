"use strict";
/**
 * Task 1: Healthcare Encounter Discovery
 *
 * Strategy Selection (via PASS_05_STRATEGY env var):
 * - 'ocr' (default): Current baseline prompt with OCR text (gpt-5-mini)
 * - 'vision': Vision-optimized prompt with raw images (gpt-5-mini vision) - NOT YET IMPLEMENTED
 *
 * Version Selection (via PASS_05_VERSION env var):
 * - 'v2.4' (default): Current production prompt (v2.4)
 * - 'v2.7': Optimized prompt with Phase 1 improvements (token reduction, linear flow)
 * - 'v2.8': Further optimizations
 * - 'v2.9': Latest optimizations
 *
 * Progressive Mode (via PASS_05_PROGRESSIVE_ENABLED env var):
 * - Documents >100 pages are automatically split into 50-page chunks
 * - Context handoff between chunks for incomplete encounters
 * - Prevents MAX_TOKENS errors on large documents
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverEncounters = discoverEncounters;
const aiPrompts_1 = require("./aiPrompts");
const aiPrompts_v2_7_1 = require("./aiPrompts.v2.7");
const aiPrompts_v2_8_1 = require("./aiPrompts.v2.8");
const aiPrompts_v2_9_1 = require("./aiPrompts.v2.9");
const manifestBuilder_1 = require("./manifestBuilder");
const model_selector_1 = require("./models/model-selector");
const provider_factory_1 = require("./providers/provider-factory");
const session_manager_1 = require("./progressive/session-manager");
const supabase_js_1 = require("@supabase/supabase-js");
// Migration 45: Supabase client for shell_files finalization
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/**
 * Migration 45: Calculate average OCR confidence across all pages
 */
function calculateOCRConfidence(ocrOutput) {
    const confidences = ocrOutput.fullTextAnnotation.pages.map(p => p.confidence || 0);
    if (confidences.length === 0)
        return 0;
    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}
/**
 * Migration 45: Finalize shell_file with Pass 0.5 metadata (manifest-free architecture)
 */
async function finalizeShellFile(shellFileId, data) {
    const { error } = await supabase
        .from('shell_files')
        .update({
        pass_0_5_completed: data.completed,
        pass_0_5_version: data.version,
        pass_0_5_progressive: data.progressive,
        ocr_average_confidence: data.ocrConfidence
    })
        .eq('id', shellFileId);
    if (error) {
        throw new Error(`Failed to update shell_files: ${error.message}`);
    }
}
/**
 * Task 1: Extract healthcare encounters from OCR text
 * Strategy selected via PASS_05_STRATEGY environment variable
 * Progressive mode automatically enabled for documents >100 pages
 */
async function discoverEncounters(input) {
    try {
        // Read strategy and version from environment variables
        const strategy = (process.env.PASS_05_STRATEGY || 'ocr');
        const version = (process.env.PASS_05_VERSION || 'v2.9');
        console.log(`[Pass 0.5] Using strategy: ${strategy}, version: ${version}`);
        // Vision strategy requires image loading infrastructure (not yet implemented)
        if (strategy === 'vision') {
            throw new Error('Vision strategy not yet implemented. ' +
                'Requires image loading from Supabase Storage. ' +
                'Use PASS_05_STRATEGY=ocr instead.');
        }
        // PROGRESSIVE MODE: EMERGENCY DISABLED - v2.10 prompt returns zero encounters
        if ((0, session_manager_1.shouldUseProgressiveMode)(input.pageCount)) {
            throw new Error(`[Pass 0.5] PROGRESSIVE MODE DISABLED - v2.10 prompt returns zero encounters. ` +
                `Document has ${input.pageCount} pages which exceeds 100-page threshold. ` +
                `v2.10 investigation required before re-enabling. ` +
                `Temporary workaround: Manually split document into <100 page sections or wait for v2.10 fix.`);
        }
        // STANDARD MODE: Process entire document in single pass
        console.log(`[Pass 0.5] Document has ${input.pageCount} pages, using standard mode`);
        // Select prompt builder based on version
        const promptBuilder = version === 'v2.9'
            ? aiPrompts_v2_9_1.buildEncounterDiscoveryPromptV29
            : version === 'v2.8'
                ? aiPrompts_v2_8_1.buildEncounterDiscoveryPromptV28
                : version === 'v2.7'
                    ? aiPrompts_v2_7_1.buildEncounterDiscoveryPromptV27
                    : aiPrompts_1.buildEncounterDiscoveryPrompt;
        // Build prompt with OCR text
        const prompt = promptBuilder({
            fullText: input.ocrOutput.fullTextAnnotation.text,
            pageCount: input.pageCount,
            ocrPages: input.ocrOutput.fullTextAnnotation.pages
        });
        // Get selected model and create provider (multi-vendor architecture)
        const model = (0, model_selector_1.getSelectedModel)();
        const provider = provider_factory_1.AIProviderFactory.createProvider(model);
        console.log(`[Pass 0.5] Processing with ${model.displayName}`);
        // Generate JSON response using provider abstraction
        const aiResponse = await provider.generateJSON(prompt);
        // Parse AI response
        if (!aiResponse.content) {
            throw new Error('Empty response from AI');
        }
        // v2.3: Pass totalPages for page assignment validation
        const parsed = await (0, manifestBuilder_1.parseEncounterResponse)(aiResponse.content, input.ocrOutput, input.patientId, input.shellFileId, input.pageCount // v2.3: Enable page assignment validation
        );
        // Migration 45: Finalize shell_file with Pass 0.5 metadata
        await finalizeShellFile(input.shellFileId, {
            version, // Use actual version (v2.9, v2.8, etc.)
            progressive: false,
            ocrConfidence: calculateOCRConfidence(input.ocrOutput),
            completed: true
        });
        return {
            success: true,
            encounters: parsed.encounters,
            page_assignments: parsed.page_assignments, // v2.3: Include if present
            aiModel: aiResponse.model, // Model name from provider
            aiCostUsd: aiResponse.cost, // Cost calculated by provider
            inputTokens: aiResponse.inputTokens,
            outputTokens: aiResponse.outputTokens
        };
    }
    catch (error) {
        console.error('[Pass 0.5] Encounter discovery error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            aiModel: 'unknown', // No response available on error
            aiCostUsd: 0,
            inputTokens: 0,
            outputTokens: 0
        };
    }
}
//# sourceMappingURL=encounterDiscovery.js.map