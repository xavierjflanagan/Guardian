/**
 * Database Writer for Pass 0.5
 * Write manifest and metrics to database atomically via RPC
 *
 * FIX #1: Transaction wrapper - All 3 writes (manifest/metrics/shell_files) in single atomic RPC call
 * FIX #2: Separate planned vs pseudo encounter counts
 */
import { ShellFileManifest } from './types';
export interface WriteManifestInput {
    manifest: ShellFileManifest;
    aiModel: string;
    aiCostUsd: number;
    processingTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    processingSessionId: string;
}
/**
 * Write manifest and metrics to database atomically
 * Note: Encounters already created in parseEncounterResponse()
 */
export declare function writeManifestToDatabase(input: WriteManifestInput): Promise<void>;
//# sourceMappingURL=databaseWriter.d.ts.map