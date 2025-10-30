"use strict";
/**
 * OCR Persistence Utility
 * Handles storage and indexing of OCR results for reuse across retries and passes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistOCRArtifacts = persistOCRArtifacts;
exports.loadOCRArtifacts = loadOCRArtifacts;
const checksum_1 = require("./checksum");
const retry_1 = require("./retry");
const logger_1 = require("./logger");
async function persistOCRArtifacts(supabase, shellFileId, patientId, // Uses patient_id to match storage pattern
ocrResult, fileChecksum, correlationId) {
    const startTime = Date.now();
    const logger = (0, logger_1.createLogger)({
        context: 'ocr-persistence',
        correlation_id: correlationId,
    });
    const basePath = `${patientId}/${shellFileId}-ocr`;
    // Build page artifacts
    const pageArtifacts = ocrResult.pages.map((page, idx) => ({
        page_number: idx + 1,
        artifact_path: `page-${idx + 1}.json`,
        bytes: JSON.stringify(page).length,
        width_px: page.size?.width_px || 0,
        height_px: page.size?.height_px || 0
    }));
    // Create manifest
    const manifest = {
        shell_file_id: shellFileId,
        provider: 'google_vision',
        version: 'v1.2024.10',
        page_count: ocrResult.pages.length,
        total_bytes: pageArtifacts.reduce((sum, p) => sum + p.bytes, 0),
        checksum: await (0, checksum_1.calculateSHA256)(Buffer.from(JSON.stringify(ocrResult))),
        // CRITICAL: Store processed dimensions for unambiguous bbox normalization
        processed_width_px: ocrResult.pages[0]?.size?.width_px || 0,
        processed_height_px: ocrResult.pages[0]?.size?.height_px || 0,
        processing_metadata: {
            downscaling_applied: !!(ocrResult.pages[0]?.size?.width_px && ocrResult.pages[0]?.size?.height_px),
            original_dimensions_available: true,
            normalization_valid: !!(ocrResult.pages[0]?.size?.width_px && ocrResult.pages[0]?.size?.height_px)
        },
        pages: pageArtifacts,
        created_at: new Date().toISOString()
    };
    // Order of operations: pages → manifest → database
    // This ensures manifest isn't corrupted if DB write fails
    // 1. Upload page artifacts with retry logic
    for (let i = 0; i < ocrResult.pages.length; i++) {
        const result = await (0, retry_1.retryStorageUpload)(async () => {
            return await supabase.storage
                .from('medical-docs')
                .upload(`${basePath}/page-${i + 1}.json`, JSON.stringify(ocrResult.pages[i], null, 2), {
                contentType: 'application/json',
                upsert: true // Idempotent
            });
        });
        if (result.error) {
            const error = new Error(`Failed to upload OCR page ${i + 1}: ${result.error.message}`);
            error.status = 500;
            logger.error('Failed to upload OCR page', error, {
                shell_file_id: shellFileId,
                patient_id_masked: (0, logger_1.maskPatientId)(patientId),
                page_number: i + 1,
            });
            throw error;
        }
    }
    // 2. Upload manifest with retry logic
    const manifestResult = await (0, retry_1.retryStorageUpload)(async () => {
        return await supabase.storage
            .from('medical-docs')
            .upload(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), {
            contentType: 'application/json',
            upsert: true // Idempotent
        });
    });
    if (manifestResult.error) {
        const error = new Error(`Failed to upload OCR manifest: ${manifestResult.error.message}`);
        error.status = 500;
        logger.error('Failed to upload OCR manifest', error, {
            shell_file_id: shellFileId,
            patient_id_masked: (0, logger_1.maskPatientId)(patientId),
        });
        throw error;
    }
    // 3. Upsert database index (idempotent)
    const { error: dbError } = await supabase
        .from('ocr_artifacts')
        .upsert({
        shell_file_id: shellFileId,
        manifest_path: `${basePath}/manifest.json`,
        provider: 'google_vision',
        artifact_version: 'v1.2024.10',
        file_checksum: fileChecksum,
        checksum: manifest.checksum,
        pages: ocrResult.pages.length,
        bytes: manifest.total_bytes,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'shell_file_id'
    });
    if (dbError) {
        logger.error('Failed to update database index', dbError, {
            shell_file_id: shellFileId,
            patient_id_masked: (0, logger_1.maskPatientId)(patientId),
        });
        throw dbError;
    }
    const duration_ms = Date.now() - startTime;
    logger.info('OCR artifacts persisted successfully', {
        shell_file_id: shellFileId,
        patient_id_masked: (0, logger_1.maskPatientId)(patientId),
        page_count: ocrResult.pages.length,
        total_bytes: manifest.total_bytes,
        duration_ms,
    });
}
async function loadOCRArtifacts(supabase, shellFileId, correlationId) {
    const startTime = Date.now();
    const logger = (0, logger_1.createLogger)({
        context: 'ocr-persistence',
        correlation_id: correlationId,
    });
    // Check if OCR artifacts exist
    const { data: artifactIndex, error: indexError } = await supabase
        .from('ocr_artifacts')
        .select('manifest_path, file_checksum, pages')
        .eq('shell_file_id', shellFileId)
        .single();
    if (indexError || !artifactIndex) {
        return null; // No artifacts found
    }
    // Load manifest with retry logic
    const manifestResult = await (0, retry_1.retryStorageDownload)(async () => {
        return await supabase.storage
            .from('medical-docs')
            .download(artifactIndex.manifest_path);
    });
    if (manifestResult.error || !manifestResult.data) {
        logger.warn('Failed to load OCR manifest', {
            shell_file_id: shellFileId,
            error_message: manifestResult.error?.message,
        });
        return null;
    }
    const manifestData = manifestResult.data;
    const manifest = JSON.parse(await manifestData.text());
    // Reconstruct OCR result from artifacts with retry logic
    const ocrResult = { pages: [] };
    for (const page of manifest.pages) {
        const pagePath = artifactIndex.manifest_path.replace('manifest.json', page.artifact_path);
        const pageResult = await (0, retry_1.retryStorageDownload)(async () => {
            return await supabase.storage
                .from('medical-docs')
                .download(pagePath);
        });
        if (pageResult.error || !pageResult.data) {
            logger.warn('Failed to load OCR page', {
                shell_file_id: shellFileId,
                page_number: page.page_number,
                error_message: pageResult.error?.message,
            });
            return null; // If any page fails, return null to trigger fresh OCR
        }
        ocrResult.pages.push(JSON.parse(await pageResult.data.text()));
    }
    const duration_ms = Date.now() - startTime;
    logger.info('OCR artifacts loaded successfully', {
        shell_file_id: shellFileId,
        page_count: ocrResult.pages.length,
        duration_ms,
    });
    return ocrResult;
}
//# sourceMappingURL=ocr-persistence.js.map