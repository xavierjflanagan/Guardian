"use strict";
/**
 * Database Writer for Pass 0.5
 * Write manifest and metrics to database atomically via RPC
 *
 * FIX #1: Transaction wrapper - All 3 writes (manifest/metrics/shell_files) in single atomic RPC call
 * FIX #2: Separate planned vs pseudo encounter counts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeManifestToDatabase = writeManifestToDatabase;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/**
 * Write manifest and metrics to database atomically
 * Note: Encounters already created in parseEncounterResponse()
 */
async function writeManifestToDatabase(input) {
    // Compute metrics from encounters
    const realWorldCount = input.manifest.encounters.filter(e => e.isRealWorldVisit).length;
    // FIX #2: Separate planned vs pseudo encounters
    const plannedCount = input.manifest.encounters.filter(e => !e.isRealWorldVisit && e.encounterType.startsWith('planned_')).length;
    const pseudoCount = input.manifest.encounters.filter(e => !e.isRealWorldVisit && e.encounterType.startsWith('pseudo_')).length;
    const avgConfidence = input.manifest.encounters.length > 0
        ? input.manifest.encounters.reduce((sum, e) => sum + e.confidence, 0) / input.manifest.encounters.length
        : 0;
    const encounterTypes = [...new Set(input.manifest.encounters.map(e => e.encounterType))];
    // FIX #1: Call atomic RPC function (all 3 writes in single transaction)
    const { error } = await supabase.rpc('write_pass05_manifest_atomic', {
        // Manifest parameters
        p_shell_file_id: input.manifest.shellFileId,
        p_patient_id: input.manifest.patientId,
        p_total_pages: input.manifest.totalPages,
        p_total_encounters_found: input.manifest.encounters.length,
        p_ocr_average_confidence: input.manifest.ocrAverageConfidence,
        p_pass_0_5_version: process.env.PASS_05_VERSION || 'v2.8', // Migration 41: Track version from environment
        p_manifest_data: input.manifest,
        p_ai_model_used: input.aiModel,
        p_ai_cost_usd: input.aiCostUsd,
        p_processing_time_ms: input.processingTimeMs,
        // Metrics parameters
        p_processing_session_id: input.processingSessionId,
        p_encounters_detected: input.manifest.encounters.length,
        p_real_world_encounters: realWorldCount,
        p_planned_encounters: plannedCount, // NEW: separate count
        p_pseudo_encounters: pseudoCount, // FIX: now excludes planned
        p_input_tokens: input.inputTokens,
        p_output_tokens: input.outputTokens,
        p_encounter_confidence_average: avgConfidence,
        p_encounter_types_found: encounterTypes
    });
    if (error) {
        throw new Error(`Failed to write manifest atomically: ${error.message}`);
    }
    console.log(`[Pass 0.5] Manifest written for shell_file ${input.manifest.shellFileId}`);
    console.log(`[Pass 0.5] Found ${input.manifest.encounters.length} encounters (${realWorldCount} real, ${plannedCount} planned, ${pseudoCount} pseudo)`);
    console.log(`[Pass 0.5] Tokens: ${input.inputTokens} input, ${input.outputTokens} output`);
    console.log(`[Pass 0.5] Cost: $${input.aiCostUsd.toFixed(4)}`);
    console.log(`[Pass 0.5] Processing time: ${input.processingTimeMs}ms`);
}
//# sourceMappingURL=databaseWriter.js.map