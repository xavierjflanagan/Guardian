"use strict";
// =============================================================================
// V3 BACKGROUND JOB PROCESSING WORKER FOR RENDER.COM
// =============================================================================
// Purpose: Process queued jobs from V3 job_queue table
// Primary focus: Document processing with AI (OCR + medical data extraction)
//
// Architecture: Orchestrates complete document processing pipeline
//   1. Download file from Supabase Storage
//   2. Format preprocessing (extract pages, convert to JPEG)
//   3. OCR processing (Google Cloud Vision)
//   4. Pass 0.5: Encounter discovery (ACTIVE)
//   5. Pass 1: Entity detection (READY - disabled for Pass 0.5 testing)
//   6. Pass 2: Clinical extraction (PLACEHOLDER - not yet implemented)
//   7. Pass 3: Narrative generation (FUTURE - not yet designed)
//
// Version: 2.0 (Refactored 2025-11-27)
// =============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const pass1_1 = require("./pass1");
const pass05_1 = require("./pass05");
const checksum_1 = require("./utils/checksum");
const ocr_persistence_1 = require("./utils/ocr-persistence");
const retry_1 = require("./utils/retry");
const logger_1 = require("./utils/logger");
const format_processor_1 = require("./utils/format-processor");
const store_processed_images_1 = require("./utils/storage/store-processed-images");
const ocr_formatter_1 = require("./pass05/progressive/ocr-formatter");
const ocr_processing_1 = require("./utils/ocr-processing");
// Load environment variables
dotenv_1.default.config();
// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================
const config = {
    supabase: {
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
    },
    googleCloud: {
        apiKey: process.env.GOOGLE_CLOUD_API_KEY,
    },
    worker: {
        id: process.env.WORKER_ID || `render-${process.env.RENDER_SERVICE_ID || 'local'}-${Date.now()}`,
        pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
        maxConcurrentJobs: parseInt(process.env.WORKER_CONCURRENCY || '3'),
        heartbeatIntervalMs: 30000, // 30 seconds
    },
    server: {
        port: parseInt(process.env.HEALTH_CHECK_PORT || process.env.PORT || '10000'),
    },
    environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        appEnv: process.env.APP_ENV || 'staging',
        logLevel: process.env.LOG_LEVEL || 'info',
        verbose: process.env.VERBOSE === 'true',
    },
    ocr: {
        // PHASE 4: Optional raw Google Cloud Vision response storage
        // Set STORE_RAW_GCV=true to store complete GCV response for debugging
        // Note: ~2-5MB per page, deleted after 30 days via lifecycle policy
        storeRawGCV: process.env.STORE_RAW_GCV === 'true',
        batchSize: parseInt(process.env.OCR_BATCH_SIZE || '10', 10),
        timeoutMs: parseInt(process.env.OCR_TIMEOUT_MS || '30000', 10),
    },
    memory: {
        limitMB: parseInt(process.env.MEMORY_LIMIT_MB || '1800', 10), // Safety threshold for 2GB plan
    },
    passes: {
        // Control which AI passes are enabled
        pass05Enabled: true, // Encounter discovery - ALWAYS ENABLED
        pass1Enabled: process.env.ENABLE_PASS1 === 'true', // Entity detection - DISABLED by default for testing
        pass2Enabled: false, // Clinical extraction - NOT YET IMPLEMENTED
    },
};
// =============================================================================
// SECTION 3: V3 WORKER CLASS
// =============================================================================
class V3Worker {
    supabase;
    workerId;
    logger;
    activeJobs = new Map();
    heartbeatInterval;
    pass1Detector;
    // ---------------------------------------------------------------------------
    // 3.1: CONSTRUCTOR & INITIALIZATION
    // ---------------------------------------------------------------------------
    constructor() {
        this.workerId = config.worker.id;
        this.logger = (0, logger_1.createLogger)({
            context: 'worker',
            worker_id: this.workerId,
        });
        this.supabase = (0, supabase_js_1.createClient)(config.supabase.url, config.supabase.serviceRoleKey);
        // Initialize Pass 1 detector if enabled and OpenAI key is available
        if (config.passes.pass1Enabled && config.openai.apiKey) {
            const pass1Config = {
                openai_api_key: config.openai.apiKey,
                model: 'gpt-5-mini', // PRODUCTION: GPT-5-mini for optimal cost/performance
                temperature: 0.1,
                max_tokens: 32000, // Safe limit for GPT-5-mini (supports up to 128k)
                confidence_threshold: 0.7,
            };
            this.logger.debug('Pass 1 configuration', {
                model: pass1Config.model,
                max_tokens: pass1Config.max_tokens,
                temperature: pass1Config.temperature,
            });
            this.pass1Detector = new pass1_1.Pass1EntityDetector(pass1Config);
            this.logger.info('Pass 1 Entity Detector initialized');
        }
        else if (!config.passes.pass1Enabled) {
            this.logger.info('Pass 1 disabled via configuration (ENABLE_PASS1=false)');
        }
        else {
            this.logger.warn('Pass 1 disabled - OpenAI API key not found');
        }
        this.logger.info('V3 Worker initialized', {
            pass_05_enabled: config.passes.pass05Enabled,
            pass_1_enabled: config.passes.pass1Enabled,
            pass_2_enabled: config.passes.pass2Enabled,
        });
    }
    // ---------------------------------------------------------------------------
    // 3.2: WORKER LIFECYCLE
    // ---------------------------------------------------------------------------
    /**
     * Start the worker
     * Begins heartbeat and job polling loop
     */
    async start() {
        this.logger.info('Starting V3 Worker');
        // Start heartbeat for active job tracking
        this.startHeartbeat();
        // Start polling for jobs (infinite loop)
        await this.pollForJobs();
    }
    /**
     * Stop the worker gracefully
     * Waits for active jobs to complete before exiting
     */
    async stop() {
        this.logger.info('Stopping V3 Worker');
        // Clear heartbeat interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        // Wait for active jobs to complete
        while (this.activeJobs.size > 0) {
            this.logger.info('Waiting for active jobs to complete', {
                active_jobs: this.activeJobs.size,
            });
            await this.sleep(1000);
        }
        this.logger.info('V3 Worker stopped');
    }
    // ---------------------------------------------------------------------------
    // 3.3: JOB QUEUE MANAGEMENT
    // ---------------------------------------------------------------------------
    /**
     * Poll for pending jobs continuously
     * Respects max concurrent job limit
     */
    async pollForJobs() {
        while (true) {
            try {
                // Check if we have capacity
                if (this.activeJobs.size >= config.worker.maxConcurrentJobs) {
                    await this.sleep(config.worker.pollIntervalMs);
                    continue;
                }
                // Fetch next pending job
                const job = await this.fetchNextJob();
                if (job) {
                    // Process job asynchronously (don't await - allow polling to continue)
                    this.processJob(job).catch(error => {
                        this.logger.error('Error processing job', error, { job_id: job.id });
                    });
                }
                // Wait before next poll
                await this.sleep(config.worker.pollIntervalMs);
            }
            catch (error) {
                this.logger.error('Polling error', error);
                await this.sleep(config.worker.pollIntervalMs * 2); // Back off on error
            }
        }
    }
    /**
     * Fetch next job from queue using claim_next_job_v3 RPC
     * @returns Job record or null if no jobs available
     */
    async fetchNextJob() {
        const { data, error } = await this.supabase
            .rpc('claim_next_job_v3', {
            p_worker_id: this.workerId,
            p_job_types: ['ai_processing'],
            p_job_lanes: ['ai_queue_simple']
        });
        if (error) {
            this.logger.error('Error claiming job', error);
            return null;
        }
        if (data && data.length > 0) {
            const jobData = data[0];
            // Fetch full job details
            const { data: fullJob, error: fetchError } = await this.supabase
                .from('job_queue')
                .select('*')
                .eq('id', jobData.job_id)
                .single();
            if (fetchError || !fullJob) {
                this.logger.error('Error fetching job details', fetchError, { job_id: jobData.job_id });
                return null;
            }
            this.logger.info('Claimed job', {
                job_id: fullJob.id,
                job_type: fullJob.job_type,
                retry_count: fullJob.retry_count,
            });
            return fullJob;
        }
        this.logger.debug('No jobs available');
        return null;
    }
    // ---------------------------------------------------------------------------
    // 3.4: JOB PROCESSING ROUTER
    // ---------------------------------------------------------------------------
    /**
     * Process a single job
     * Handles job lifecycle: active tracking, processing, completion/failure, cleanup
     */
    async processJob(job) {
        const jobId = job.id;
        // Extract correlation_id from job payload (fallback to job ID for traceability)
        const correlationId = job.job_payload?.correlation_id || `job_${jobId}`;
        this.logger.setCorrelationId(correlationId);
        // Mark job as active
        this.activeJobs.set(jobId, true);
        try {
            await this.logger.logOperation('processJob', async () => {
                this.logger.info('Processing job', {
                    job_id: jobId,
                    job_type: job.job_type,
                    job_name: job.job_name,
                    retry_count: job.retry_count,
                });
                // Update heartbeat
                await this.updateJobHeartbeat(jobId);
                // Route to appropriate processor
                let result;
                switch (job.job_type) {
                    case 'ai_processing':
                        result = await this.processAIJob(job);
                        break;
                    default:
                        throw new Error(`Unknown job type: ${job.job_type}`);
                }
                // Mark job as completed
                await this.completeJob(jobId, result);
                this.logger.info('Job completed', { job_id: jobId });
                return result;
            }, { job_id: jobId, job_type: job.job_type });
        }
        catch (error) {
            this.logger.error('Job failed', error, {
                job_id: jobId,
                error_message: error.message,
            });
            // Check if job was rescheduled (handled by RPC)
            if (error.message && error.message.includes('Job rescheduled')) {
                this.logger.info('Job rescheduled - skipping failJob call', {
                    job_id: jobId,
                    error_message: error.message,
                });
            }
            else {
                // Mark job as failed
                await this.failJob(jobId, error.message);
            }
        }
        finally {
            // Remove from active jobs
            this.activeJobs.delete(jobId);
            // Explicit memory cleanup after each job
            await this.cleanupJobMemory(jobId);
        }
    }
    // ---------------------------------------------------------------------------
    // 3.5: DOCUMENT PROCESSING PIPELINE
    // ---------------------------------------------------------------------------
    /**
     * Process AI job (document processing)
     * Complete pipeline: Download → Preprocess → OCR → Pass 0.5 → Pass 1 (optional)
     */
    async processAIJob(job) {
        const payload = job.job_payload;
        // Validate payload structure
        if (!payload.shell_file_id || !payload.storage_path || !payload.patient_id) {
            throw new Error('Invalid AI job payload: missing required fields (shell_file_id, storage_path, patient_id)');
        }
        this.logger.info('Processing AI job', {
            shell_file_id: payload.shell_file_id,
            patient_id_masked: (0, logger_1.maskPatientId)(payload.patient_id),
            storage_path: payload.storage_path,
            file_size_bytes: payload.file_size_bytes,
            mime_type: payload.mime_type,
        });
        // Update shell_files with job tracking at start
        await this.supabase
            .from('shell_files')
            .update({
            status: 'processing',
            processing_started_at: new Date().toISOString(),
            processing_job_id: job.id,
            processing_worker_id: this.workerId
        })
            .eq('id', payload.shell_file_id);
        // Download file from storage
        const result = await (0, retry_1.retryStorageDownload)(async () => {
            return await this.supabase.storage
                .from('medical-docs')
                .download(payload.storage_path);
        });
        if (result.error || !result.data) {
            throw new Error(`Failed to download file from storage: ${result.error?.message}`);
        }
        const fileBlob = result.data;
        const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
        const fileChecksum = await (0, checksum_1.calculateSHA256)(fileBuffer);
        this.logger.debug('File checksum calculated', {
            shell_file_id: payload.shell_file_id,
            checksum: fileChecksum,
        });
        // Check for existing OCR artifacts (reuse if available)
        let ocrResult = await (0, ocr_persistence_1.loadOCRArtifacts)(this.supabase, payload.shell_file_id, this.logger['correlation_id']);
        if (ocrResult) {
            this.logger.info('Reusing existing OCR artifacts', {
                shell_file_id: payload.shell_file_id,
            });
        }
        else {
            // Run OCR processing pipeline
            ocrResult = await this.runOCRProcessing(payload, fileBuffer, job);
        }
        // Run Pass 0.5 (Encounter Discovery) - ALWAYS ENABLED
        const processingSessionId = crypto.randomUUID();
        const pass05Result = await this.runPass05(payload, ocrResult, processingSessionId);
        // Run Pass 1 (Entity Detection) - OPTIONAL (controlled by config flag)
        if (config.passes.pass1Enabled) {
            await this.runPass1(payload, ocrResult, processingSessionId, job);
            return {
                success: true,
                shell_file_id: payload.shell_file_id,
                pass_05_result: pass05Result,
                message: 'Pass 0.5 and Pass 1 completed successfully',
            };
        }
        else {
            // Pass 1 disabled - return after Pass 0.5
            this.logger.info('Pass 1 disabled - returning early after Pass 0.5', {
                shell_file_id: payload.shell_file_id,
                note: 'Set ENABLE_PASS1=true to enable Pass 1 entity detection'
            });
            return {
                success: true,
                shell_file_id: payload.shell_file_id,
                pass_05_only: true,
                pass_05_result: pass05Result,
                message: 'Pass 0.5 completed successfully. Pass 1 disabled via configuration.',
            };
        }
    }
    /**
     * Run OCR processing pipeline
     * Steps: Format preprocessing → Processed image storage → Multi-page OCR → Artifact persistence
     */
    async runOCRProcessing(payload, fileBuffer, job) {
        // STEP 1: Format preprocessing (extract pages from multi-page formats)
        this.logger.info('Format preprocessing: Extracting pages', {
            shell_file_id: payload.shell_file_id,
            mime_type: payload.mime_type,
        });
        const base64Data = fileBuffer.toString('base64');
        let preprocessResult;
        try {
            preprocessResult = await (0, format_processor_1.preprocessForOCR)(base64Data, payload.mime_type, {
                maxWidth: 1600,
                jpegQuality: 85,
                correlationId: this.logger['correlation_id'],
            });
            this.logger.info('Format preprocessing complete', {
                shell_file_id: payload.shell_file_id,
                totalPages: preprocessResult.totalPages,
                successfulPages: preprocessResult.successfulPages,
                originalFormat: preprocessResult.originalFormat,
                conversionApplied: preprocessResult.conversionApplied,
                processingTimeMs: preprocessResult.processingTimeMs,
            });
        }
        catch (error) {
            this.logger.error('Format preprocessing failed', error, {
                shell_file_id: payload.shell_file_id,
            });
            throw error;
        }
        // STEP 2: Store processed JPEG pages for click-to-source feature
        let imageMetadata;
        try {
            imageMetadata = await (0, store_processed_images_1.storeProcessedImages)(this.supabase, payload.patient_id, payload.shell_file_id, preprocessResult.pages, this.logger['correlation_id']);
            this.logger.info('Processed images stored', {
                shell_file_id: payload.shell_file_id,
                pageCount: imageMetadata.pages.length,
                totalBytes: imageMetadata.totalBytes,
                folderPath: imageMetadata.folderPath,
            });
        }
        catch (error) {
            // CRITICAL: Fail the job if image storage fails
            // Click-to-source feature requires processed images
            this.logger.error('Failed to store processed images', error, {
                shell_file_id: payload.shell_file_id,
            });
            throw new Error(`CRITICAL: Failed to store processed images: ${error.message}`);
        }
        // STEP 3: Run OCR on each page (batched parallel processing)
        const ocrPages = await this.runBatchedOCR(payload, preprocessResult, job);
        // STEP 4: Build final multi-page OCR result
        const ocrResult = { pages: ocrPages };
        // STEP 5: Update shell_files with actual page count
        const actualPageCount = ocrPages.length;
        const { error: pageCountError } = await this.supabase
            .from('shell_files')
            .update({ page_count: actualPageCount })
            .eq('id', payload.shell_file_id);
        if (pageCountError) {
            this.logger.error('Failed to update page_count', pageCountError, {
                shell_file_id: payload.shell_file_id,
                actual_page_count: actualPageCount,
            });
        }
        else {
            this.logger.info('Updated page_count with actual OCR count', {
                shell_file_id: payload.shell_file_id,
                page_count: actualPageCount,
            });
        }
        // STEP 6: Write OCR processing metrics to database
        await this.writeOCRMetrics(payload, ocrPages, job);
        // STEP 7: Persist OCR artifacts for future reuse
        const fileChecksum = await (0, checksum_1.calculateSHA256)(fileBuffer);
        await (0, ocr_persistence_1.persistOCRArtifacts)(this.supabase, payload.shell_file_id, payload.patient_id, ocrResult, fileChecksum, imageMetadata, this.logger['correlation_id']);
        // STEP 8: Generate and store enhanced OCR format (PHASE 1)
        await this.storeEnhancedOCRFormat(payload, ocrResult);
        // STEP 9: Update shell_files with processed image metadata
        if (imageMetadata) {
            const { error: updateError } = await this.supabase
                .from('shell_files')
                .update({
                processed_image_path: imageMetadata.folderPath,
                processed_image_checksum: imageMetadata.combinedChecksum,
                processed_image_mime: 'image/jpeg',
                processed_image_size_bytes: imageMetadata.totalBytes,
            })
                .eq('id', payload.shell_file_id);
            if (updateError) {
                this.logger.error('Failed to update shell_files with processed image metadata', updateError, {
                    shell_file_id: payload.shell_file_id,
                });
            }
            else {
                this.logger.info('Updated shell_files with processed image metadata', {
                    shell_file_id: payload.shell_file_id,
                    processed_image_path: imageMetadata.folderPath,
                });
            }
        }
        return ocrResult;
    }
    /**
     * Run batched parallel OCR processing
     * Processes pages in batches to manage memory usage
     */
    async runBatchedOCR(payload, preprocessResult, job) {
        this.logger.info('Running OCR on extracted pages', {
            shell_file_id: payload.shell_file_id,
            pageCount: preprocessResult.pages.length,
        });
        const ocrPages = [];
        const validPages = preprocessResult.pages.filter(p => p.base64); // Skip failed pages
        // OCR session tracking
        const ocrSessionStartTime = Date.now();
        const totalBatches = Math.ceil(validPages.length / config.ocr.batchSize);
        // Calculate queue wait time
        const jobCreatedAt = new Date(job.created_at).getTime();
        const jobStartedAt = new Date(job.started_at).getTime();
        const queueWaitMs = jobStartedAt - jobCreatedAt;
        const batchTimesMs = [];
        this.logger.info('OCR processing session started', {
            shell_file_id: payload.shell_file_id,
            correlation_id: this.logger['correlation_id'],
            total_pages: validPages.length,
            batch_size: config.ocr.batchSize,
            total_batches: totalBatches,
            ocr_provider: 'google_vision',
            retry_count: job.retry_count,
            queue_wait_ms: queueWaitMs,
            timestamp: new Date().toISOString(),
        });
        // Process pages in batches
        try {
            for (let batchStart = 0; batchStart < validPages.length; batchStart += config.ocr.batchSize) {
                const batchEnd = Math.min(batchStart + config.ocr.batchSize, validPages.length);
                const batch = validPages.slice(batchStart, batchEnd);
                const batchNumber = Math.floor(batchStart / config.ocr.batchSize) + 1;
                // Check memory before processing batch
                const memBefore = process.memoryUsage();
                const batchStartTime = Date.now();
                this.logger.info('OCR batch started', {
                    shell_file_id: payload.shell_file_id,
                    correlation_id: this.logger['correlation_id'],
                    batch_number: batchNumber,
                    total_batches: totalBatches,
                    batch_size: batch.length,
                    pages_in_batch: batch.map(p => p.pageNumber).join(','),
                    memory_before_mb: Math.round(memBefore.rss / 1024 / 1024),
                    timestamp: new Date().toISOString(),
                });
                // Safety check: abort if approaching memory limit
                const rssMB = Math.round(memBefore.rss / 1024 / 1024);
                if (rssMB > config.memory.limitMB) {
                    throw new Error(`Memory limit approaching (${rssMB} MB / ${config.memory.limitMB} MB threshold). ` +
                        `Processed ${ocrPages.length}/${validPages.length} pages before aborting.`);
                }
                // Process batch in parallel
                const batchResults = await this.processBatchParallel(batch, payload, preprocessResult.totalPages);
                // Check for failures
                const successfulPages = [];
                const failedPages = [];
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        successfulPages.push(result.value);
                    }
                    else {
                        const page = batch[index];
                        failedPages.push({
                            pageNumber: page.pageNumber,
                            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                        });
                    }
                });
                // If ANY pages failed in this batch, fail the entire job
                if (failedPages.length > 0) {
                    throw new Error(`Batch ${batchNumber} failed: ${failedPages.length}/${batch.length} pages failed. ` +
                        `Failed pages: ${failedPages.map(p => p.pageNumber).join(', ')}. ` +
                        `First error: ${failedPages[0].error}`);
                }
                // Add successful batch results to main array
                ocrPages.push(...successfulPages);
                // Memory cleanup after batch
                const memAfter = process.memoryUsage();
                const batchProcessingTime = Date.now() - batchStartTime;
                batchTimesMs.push(batchProcessingTime);
                // Calculate batch confidence
                const batchConfidences = successfulPages.map(p => {
                    let totalConfidence = 0;
                    let wordCount = 0;
                    for (const block of p.blocks) {
                        for (const paragraph of block.paragraphs) {
                            for (const word of paragraph.words) {
                                totalConfidence += word.confidence;
                                wordCount++;
                            }
                        }
                    }
                    return wordCount > 0 ? totalConfidence / wordCount : 0.85;
                });
                const avgBatchConfidence = batchConfidences.reduce((a, b) => a + b, 0) / (batchConfidences.length || 1);
                this.logger.info('OCR batch completed', {
                    shell_file_id: payload.shell_file_id,
                    correlation_id: this.logger['correlation_id'],
                    batch_number: batchNumber,
                    total_batches: totalBatches,
                    batch_size: batch.length,
                    processing_time_ms: batchProcessingTime,
                    successful_pages: successfulPages.length,
                    failed_pages: failedPages.length,
                    average_confidence: avgBatchConfidence.toFixed(4),
                    memory_after_mb: Math.round(memAfter.rss / 1024 / 1024),
                    memory_delta_mb: Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024),
                    timestamp: new Date().toISOString(),
                });
                // Force garbage collection if available
                if (global.gc) {
                    this.logger.info('Forcing garbage collection', {
                        shell_file_id: payload.shell_file_id,
                        batchNumber,
                    });
                    global.gc();
                    const memAfterGC = process.memoryUsage();
                    this.logger.info('Memory after GC', {
                        shell_file_id: payload.shell_file_id,
                        batchNumber,
                        heapUsedMB: Math.round(memAfterGC.heapUsed / 1024 / 1024),
                        heapTotalMB: Math.round(memAfterGC.heapTotal / 1024 / 1024),
                        rssMB: Math.round(memAfterGC.rss / 1024 / 1024),
                    });
                }
            }
        }
        catch (batchError) {
            this.logger.error('Batched OCR processing failed', batchError, {
                shell_file_id: payload.shell_file_id,
                pagesCompleted: ocrPages.length,
                totalPages: validPages.length,
                errorMessage: batchError instanceof Error ? batchError.message : String(batchError),
            });
            throw batchError;
        }
        // OCR session completion logging
        const totalOCRTime = Date.now() - ocrSessionStartTime;
        const avgBatchTime = totalOCRTime / totalBatches;
        const avgPageTime = totalOCRTime / validPages.length;
        // Calculate overall statistics
        let totalConfidence = 0;
        let totalWords = 0;
        let totalTextLength = 0;
        for (const page of ocrPages) {
            for (const block of page.blocks) {
                for (const paragraph of block.paragraphs) {
                    for (const word of paragraph.words) {
                        totalConfidence += word.confidence;
                        totalWords++;
                        totalTextLength += word.text.length;
                    }
                }
            }
        }
        const overallAvgConfidence = totalWords > 0 ? totalConfidence / totalWords : 0.85;
        const providerLatencies = ocrPages.map(p => p.processing_time_ms);
        const providerAvgLatency = providerLatencies.reduce((a, b) => a + b, 0) / (providerLatencies.length || 1);
        const finalMemory = process.memoryUsage();
        const peakMemoryMB = Math.round(finalMemory.rss / 1024 / 1024);
        this.logger.info('OCR processing session completed', {
            shell_file_id: payload.shell_file_id,
            correlation_id: this.logger['correlation_id'],
            total_pages: ocrPages.length,
            total_batches: totalBatches,
            batch_size: config.ocr.batchSize,
            total_processing_time_ms: totalOCRTime,
            average_batch_time_ms: Math.round(avgBatchTime),
            average_page_time_ms: Math.round(avgPageTime),
            provider_avg_latency_ms: Math.round(providerAvgLatency),
            successful_pages: ocrPages.length,
            failed_pages: 0,
            average_confidence: overallAvgConfidence.toFixed(4),
            total_text_length: totalTextLength,
            peak_memory_mb: peakMemoryMB,
            timestamp: new Date().toISOString(),
        });
        return ocrPages;
    }
    /**
     * Process a batch of pages in parallel
     * Each page gets OCR processing with timeout handling
     */
    async processBatchParallel(batch, payload, totalPages) {
        return await Promise.allSettled(batch.map(async (page) => {
            let timeoutId = null;
            try {
                this.logger.info(`Processing page ${page.pageNumber}/${totalPages}`, {
                    shell_file_id: payload.shell_file_id,
                    pageNumber: page.pageNumber,
                    width: page.width,
                    height: page.height,
                });
                // Create timeout promise with cleanup
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`OCR timeout after ${config.ocr.timeoutMs}ms`));
                    }, config.ocr.timeoutMs);
                });
                // OCR processing configuration
                const ocrConfig = {
                    googleApiKey: config.googleCloud.apiKey,
                    storeRawGCV: config.ocr.storeRawGCV,
                    correlationId: this.logger['correlation_id'],
                };
                // Raw GCV storage context (only if enabled)
                const storageContext = config.ocr.storeRawGCV ? {
                    supabase: this.supabase,
                    patientId: payload.patient_id,
                    shellFileId: payload.shell_file_id,
                    logger: this.logger,
                } : undefined;
                // Race between OCR and timeout
                const ocrPageResult = await Promise.race([
                    (0, ocr_processing_1.processWithGoogleVisionOCR)(page.base64, page.mime, ocrConfig, storageContext),
                    timeoutPromise,
                ]);
                // Clear timeout since OCR succeeded
                if (timeoutId)
                    clearTimeout(timeoutId);
                // Free memory: nullify base64 after successful OCR
                page.base64 = null;
                // Set correct page number
                ocrPageResult.page_number = page.pageNumber;
                this.logger.info(`Page ${page.pageNumber} OCR complete`, {
                    shell_file_id: payload.shell_file_id,
                    pageNumber: page.pageNumber,
                    textLength: ocrPageResult.spatially_sorted_text.length,
                    blocks: ocrPageResult.blocks.length,
                });
                return ocrPageResult;
            }
            catch (error) {
                // Clear timeout on error
                if (timeoutId)
                    clearTimeout(timeoutId);
                // Free memory even on error
                page.base64 = null;
                this.logger.error(`Page ${page.pageNumber} OCR failed`, error, {
                    shell_file_id: payload.shell_file_id,
                    pageNumber: page.pageNumber,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }));
    }
    /**
     * Write OCR processing metrics to database
     */
    async writeOCRMetrics(payload, ocrPages, job) {
        // Calculate metrics
        let totalConfidence = 0;
        let totalWords = 0;
        let totalTextLength = 0;
        for (const page of ocrPages) {
            for (const block of page.blocks) {
                for (const paragraph of block.paragraphs) {
                    for (const word of paragraph.words) {
                        totalConfidence += word.confidence;
                        totalWords++;
                        totalTextLength += word.text.length;
                    }
                }
            }
        }
        const avgConfidence = totalWords > 0 ? totalConfidence / totalWords : 0.85;
        const providerLatencies = ocrPages.map(p => p.processing_time_ms);
        const providerAvgLatency = providerLatencies.reduce((a, b) => a + b, 0) / (providerLatencies.length || 1);
        const finalMemory = process.memoryUsage();
        const peakMemoryMB = Math.round(finalMemory.rss / 1024 / 1024);
        const { error: metricsError } = await this.supabase
            .from('ocr_processing_metrics')
            .insert({
            shell_file_id: payload.shell_file_id,
            patient_id: payload.patient_id,
            correlation_id: this.logger['correlation_id'],
            batch_size: config.ocr.batchSize,
            total_batches: Math.ceil(ocrPages.length / config.ocr.batchSize),
            total_pages: ocrPages.length,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            processing_time_ms: 0, // TODO: Track actual total time
            average_batch_time_ms: 0,
            average_page_time_ms: 0,
            provider_avg_latency_ms: Math.round(providerAvgLatency),
            batch_times_ms: [],
            successful_pages: ocrPages.length,
            failed_pages: 0,
            failed_page_numbers: [],
            average_confidence: parseFloat(avgConfidence.toFixed(4)),
            total_text_length: totalTextLength,
            peak_memory_mb: peakMemoryMB,
            memory_freed_mb: null,
            estimated_cost_usd: null,
            estimated_cost_per_page_usd: null,
            ocr_provider: 'google_vision',
            environment: process.env.APP_ENV || 'development',
            app_version: process.env.npm_package_version || 'unknown',
            worker_id: process.env.WORKER_ID || 'unknown',
            retry_count: job.retry_count,
            queue_wait_ms: 0, // TODO: Calculate from job timestamps
        });
        if (metricsError) {
            this.logger.error('Failed to write OCR metrics to database', metricsError, {
                shell_file_id: payload.shell_file_id,
                correlation_id: this.logger['correlation_id'],
            });
        }
        else {
            this.logger.info('OCR metrics written to database', {
                shell_file_id: payload.shell_file_id,
                correlation_id: this.logger['correlation_id'],
                total_pages: ocrPages.length,
            });
        }
    }
    /**
     * Generate and store enhanced OCR format
     * PHASE 1: Enhanced OCR Storage for reuse across all passes
     */
    async storeEnhancedOCRFormat(payload, ocrResult) {
        this.logger.info('Generating enhanced OCR format for permanent storage', {
            shell_file_id: payload.shell_file_id,
            page_count: ocrResult.pages.length,
        });
        const enhancedOCRPages = [];
        for (let i = 0; i < ocrResult.pages.length; i++) {
            const page = ocrResult.pages[i];
            const actualPageNum = i + 1;
            // PHASE 3: Use actual blocks structure (not recreated from legacy format)
            const enhancedText = (0, ocr_formatter_1.generateEnhancedOcrFormat)({
                page_number: actualPageNum,
                dimensions: {
                    width: page.size.width_px,
                    height: page.size.height_px,
                },
                blocks: page.blocks, // Use real blocks with full hierarchy
            });
            // Add page markers
            enhancedOCRPages.push(`--- PAGE ${actualPageNum} START ---\n${enhancedText}\n--- PAGE ${actualPageNum} END ---`);
        }
        const enhancedOCRText = enhancedOCRPages.join('\n\n');
        // Store enhanced OCR permanently in Supabase Storage
        await (0, ocr_persistence_1.storeEnhancedOCR)(this.supabase, payload.patient_id, payload.shell_file_id, enhancedOCRText, this.logger['correlation_id']);
        this.logger.info('Enhanced OCR stored successfully', {
            shell_file_id: payload.shell_file_id,
            bytes: enhancedOCRText.length,
            pages: ocrResult.pages.length,
        });
    }
    // ---------------------------------------------------------------------------
    // 3.6: PASS 0.5 - ENCOUNTER DISCOVERY (ACTIVE)
    // ---------------------------------------------------------------------------
    /**
     * Run Pass 0.5 encounter discovery
     * Creates healthcare_encounters records and manifest for downstream passes
     */
    async runPass05(payload, ocrResult, processingSessionId) {
        this.logger.info('Starting Pass 0.5 encounter discovery', {
            shell_file_id: payload.shell_file_id,
            page_count: ocrResult.pages.length,
        });
        // Create ai_processing_sessions record (required before Pass 0.5)
        const { error: sessionError } = await this.supabase
            .from('ai_processing_sessions')
            .insert({
            id: processingSessionId,
            patient_id: payload.patient_id,
            shell_file_id: payload.shell_file_id,
            session_type: 'shell_file_processing',
            session_status: 'processing',
            ai_model_name: 'gpt-5-mini',
            workflow_step: 'encounter_discovery',
            total_steps: 5,
            completed_steps: 0,
            processing_started_at: new Date().toISOString()
        });
        if (sessionError) {
            throw new Error(`Failed to create processing session: ${sessionError.message}`);
        }
        // Convert OCR result to Pass 0.5 input format
        const pass05Input = {
            shellFileId: payload.shell_file_id,
            patientId: payload.patient_id,
            ocrOutput: {
                fullTextAnnotation: {
                    text: ocrResult.pages.map((p, idx) => `--- PAGE ${idx + 1} START ---\n` +
                        p.spatially_sorted_text +
                        `\n--- PAGE ${idx + 1} END ---`).join('\n\n'),
                    pages: ocrResult.pages.map((page) => ({
                        page_number: page.page_number,
                        width: page.size.width_px,
                        height: page.size.height_px,
                        confidence: 0.85, // TODO: Calculate from blocks
                        spatially_sorted_text: page.spatially_sorted_text,
                        original_gcv_text: page.original_gcv_text,
                        blocks: page.blocks // PHASE 3: Real block structure for coordinate lookup
                    }))
                }
            },
            pageCount: ocrResult.pages.length,
            processingSessionId: processingSessionId
        };
        const pass05Result = await (0, pass05_1.runPass05)(pass05Input);
        if (!pass05Result.success) {
            throw new Error(`Pass 0.5 encounter discovery failed: ${pass05Result.error}`);
        }
        this.logger.info('Pass 0.5 encounter discovery completed', {
            shell_file_id: payload.shell_file_id,
            encounters_found: pass05Result.manifest?.encounters.length || 0,
            processing_time_ms: pass05Result.processingTimeMs,
            ai_cost_usd: pass05Result.aiCostUsd,
            ai_model: pass05Result.aiModel,
        });
        return pass05Result;
    }
    // ---------------------------------------------------------------------------
    // 3.7: PASS 1 - ENTITY DETECTION (READY - DISABLED FOR TESTING)
    // ---------------------------------------------------------------------------
    /**
     * Run Pass 1 entity detection
     * Detects and classifies all entities in medical documents
     *
     * NOTE: Currently disabled by default (config.passes.pass1Enabled = false)
     * To enable: Set environment variable ENABLE_PASS1=true
     */
    async runPass1(payload, ocrResult, processingSessionId, _job) {
        this.logger.info('Starting Pass 1 entity detection', {
            shell_file_id: payload.shell_file_id,
            page_count: ocrResult.pages.length,
        });
        // Download first processed image for Vision AI
        const { data: shellFileRecord, error: shellFileError } = await this.supabase
            .from('shell_files')
            .select('processed_image_path')
            .eq('id', payload.shell_file_id)
            .single();
        if (shellFileError || !shellFileRecord?.processed_image_path) {
            throw new Error(`Failed to fetch processed_image_path for shell_file ${payload.shell_file_id}`);
        }
        const firstPagePath = `${shellFileRecord.processed_image_path}/page-1.jpg`;
        const imageDownloadResult = await (0, retry_1.retryStorageDownload)(async () => {
            return await this.supabase.storage
                .from('medical-docs')
                .download(firstPagePath);
        });
        if (imageDownloadResult.error || !imageDownloadResult.data) {
            throw new Error(`Failed to download processed image: ${imageDownloadResult.error?.message}`);
        }
        const imageBlob = imageDownloadResult.data;
        const processedImageBuffer = Buffer.from(await imageBlob.arrayBuffer());
        const processedImageBase64 = processedImageBuffer.toString('base64');
        this.logger.info('First processed image downloaded for Vision AI', {
            shell_file_id: payload.shell_file_id,
            image_path: firstPagePath,
            image_size_bytes: processedImageBuffer.length,
        });
        // Build Pass1Input
        const pass1Input = {
            shell_file_id: payload.shell_file_id,
            patient_id: payload.patient_id,
            processing_session_id: processingSessionId,
            raw_file: {
                file_data: processedImageBase64,
                file_type: 'image/jpeg',
                filename: payload.uploaded_filename,
                file_size: processedImageBuffer.length
            },
            ocr_spatial_data: {
                extracted_text: ocrResult.pages.map((p) => p.spatially_sorted_text).join(' '),
                spatial_mapping: ocrResult.pages.flatMap((page) => page.blocks.flatMap((block) => block.paragraphs.flatMap((para) => para.words.map((word) => ({
                    text: word.text,
                    page_number: page.page_number,
                    bounding_box: {
                        x: Math.min(...word.boundingBox.vertices.map((v) => v.x)),
                        y: Math.min(...word.boundingBox.vertices.map((v) => v.y)),
                        width: Math.max(...word.boundingBox.vertices.map((v) => v.x)) - Math.min(...word.boundingBox.vertices.map((v) => v.x)),
                        height: Math.max(...word.boundingBox.vertices.map((v) => v.y)) - Math.min(...word.boundingBox.vertices.map((v) => v.y))
                    },
                    line_number: 0,
                    word_index: 0,
                    confidence: word.confidence
                }))))),
                ocr_confidence: 0.85, // TODO: Calculate from blocks
                processing_time_ms: 0,
                ocr_provider: 'google_vision'
            },
            document_metadata: {
                filename: payload.uploaded_filename,
                file_type: payload.mime_type,
                page_count: ocrResult.pages.length,
                upload_timestamp: new Date().toISOString()
            }
        };
        // Process with Pass 1 entity detection
        return await this.processPass1EntityDetection(pass1Input);
    }
    /**
     * Process Pass 1 Entity Detection
     * Inserts results into 7 database tables
     */
    async processPass1EntityDetection(payload) {
        if (!this.pass1Detector) {
            throw new Error('Pass 1 detector not initialized - OpenAI API key may be missing');
        }
        this.logger.info('Running Pass 1 entity detection', {
            shell_file_id: payload.shell_file_id,
            processing_session_id: payload.processing_session_id,
            ocr_text_length: payload.ocr_spatial_data.extracted_text.length,
            spatial_mapping_elements: payload.ocr_spatial_data.spatial_mapping.length,
        });
        // Run Pass 1 processing
        const result = await this.pass1Detector.processDocument(payload);
        if (!result.success) {
            throw new Error(`Pass 1 processing failed: ${result.error}`);
        }
        this.logger.info('Pass 1 entity detection completed', {
            shell_file_id: payload.shell_file_id,
            total_entities: result.total_entities_detected,
            clinical_events: result.entities_by_category.clinical_event,
            healthcare_context: result.entities_by_category.healthcare_context,
            document_structure: result.entities_by_category.document_structure,
        });
        // Get ALL Pass 1 database records (7 tables)
        const dbRecords = await this.pass1Detector.getAllDatabaseRecords(payload);
        // Insert into ALL 7 Pass 1 tables
        await this.insertPass1DatabaseRecords(dbRecords, payload.shell_file_id);
        this.logger.info('Pass 1 complete - inserted records into 7 tables', {
            shell_file_id: payload.shell_file_id,
            entity_audit_records: result.records_created.entity_audit,
            confidence_scoring_records: result.records_created.confidence_scoring,
            manual_review_records: result.records_created.manual_review_queue,
        });
        // Update shell_files with completion tracking
        await this.supabase
            .from('shell_files')
            .update({
            status: 'pass1_complete',
            processing_completed_at: new Date().toISOString()
        })
            .eq('id', payload.shell_file_id);
        return result;
    }
    /**
     * Insert Pass 1 records into all 7 database tables
     */
    async insertPass1DatabaseRecords(records, shellFileId) {
        // 1. UPSERT ai_processing_sessions
        const { error: sessionError } = await this.supabase
            .from('ai_processing_sessions')
            .upsert(records.ai_processing_session, { onConflict: 'id' });
        if (sessionError) {
            throw new Error(`Failed to upsert ai_processing_sessions: ${sessionError.message}`);
        }
        // 2. INSERT entity_processing_audit (bulk)
        if (records.entity_processing_audit.length > 0) {
            const { error: entityError } = await this.supabase
                .from('entity_processing_audit')
                .insert(records.entity_processing_audit);
            if (entityError) {
                throw new Error(`Failed to insert entity_processing_audit: ${entityError.message}`);
            }
        }
        // 3. UPDATE shell_files
        const { error: shellError } = await this.supabase
            .from('shell_files')
            .update(records.shell_file_updates)
            .eq('id', shellFileId);
        if (shellError) {
            this.logger.warn('Failed to update shell_files (non-fatal)', {
                shell_file_id: shellFileId,
                error_message: shellError.message,
            });
        }
        // 4. INSERT profile_classification_audit
        const { error: profileError } = await this.supabase
            .from('profile_classification_audit')
            .insert(records.profile_classification_audit);
        if (profileError) {
            throw new Error(`Failed to insert profile_classification_audit: ${profileError.message}`);
        }
        // 5. INSERT pass1_entity_metrics
        const { error: metricsError } = await this.supabase
            .from('pass1_entity_metrics')
            .insert(records.pass1_entity_metrics);
        if (metricsError) {
            throw new Error(`Failed to insert pass1_entity_metrics: ${metricsError.message}`);
        }
        // 6. INSERT ai_confidence_scoring (optional)
        if (records.ai_confidence_scoring.length > 0) {
            const { error: confidenceError } = await this.supabase
                .from('ai_confidence_scoring')
                .insert(records.ai_confidence_scoring);
            if (confidenceError) {
                this.logger.warn('Failed to insert ai_confidence_scoring (non-fatal)', {
                    shell_file_id: shellFileId,
                    error_message: confidenceError.message,
                });
            }
        }
        // 7. INSERT manual_review_queue (optional)
        if (records.manual_review_queue.length > 0) {
            const { error: reviewError } = await this.supabase
                .from('manual_review_queue')
                .insert(records.manual_review_queue);
            if (reviewError) {
                this.logger.warn('Failed to insert manual_review_queue (non-fatal)', {
                    shell_file_id: shellFileId,
                    error_message: reviewError.message,
                });
            }
        }
    }
    // ---------------------------------------------------------------------------
    // 3.8: PASS 2 - CLINICAL EXTRACTION (PLACEHOLDER - NOT YET IMPLEMENTED)
    // ---------------------------------------------------------------------------
    /**
     * Run Pass 2 clinical extraction
     *
     * TODO: Implement Pass 2
     * Purpose: Extract structured clinical data from Pass 1 entities
     * Schema: Complete in current_schema/08_job_coordination.sql
     * Bridge schemas: Defined in bridge-schemas/source/pass-2/
     *
     * Implementation steps:
     * 1. Load Pass 1 entity results
     * 2. Extract clinical data (diagnoses, medications, procedures, etc.)
     * 3. Write to Pass 2 database tables
     * 4. Update shell_files.status to 'pass2_complete'
     *
     * NOTE: Placeholder for future implementation - intentionally unused until Pass 2 is implemented
     */
    // @ts-ignore - Unused placeholder for future Pass 2 implementation
    async runPass2(_payload, _ocrResult, _processingSessionId) {
        throw new Error('Pass 2 clinical extraction not yet implemented');
    }
    // ---------------------------------------------------------------------------
    // 3.9: JOB LIFECYCLE MANAGEMENT
    // ---------------------------------------------------------------------------
    /**
     * Complete a job successfully
     */
    async completeJob(jobId, result) {
        const { error } = await this.supabase
            .rpc('complete_job', {
            p_job_id: jobId,
            p_worker_id: this.workerId,
            p_job_result: result,
        });
        if (error) {
            throw new Error(`Failed to complete job: ${error.message}`);
        }
    }
    /**
     * Fail a job with error details
     */
    async failJob(jobId, errorMessage) {
        const { error } = await this.supabase
            .from('job_queue')
            .update({
            status: 'failed',
            error_details: {
                worker_id: this.workerId,
                error_message: errorMessage,
                failed_at: new Date().toISOString()
            },
            completed_at: new Date().toISOString()
        })
            .eq('id', jobId)
            .eq('worker_id', this.workerId);
        if (error) {
            this.logger.error('Failed to mark job as failed', error, { job_id: jobId });
        }
    }
    /**
     * Update job heartbeat to indicate worker is still processing
     */
    async updateJobHeartbeat(jobId) {
        try {
            const { error } = await this.supabase
                .rpc('update_job_heartbeat', {
                p_job_id: jobId,
                p_worker_id: this.workerId,
            });
            if (error) {
                this.logger.error('Heartbeat failed', error, { job_id: jobId });
            }
            else {
                this.logger.debug('Heartbeat updated', { job_id: jobId });
            }
        }
        catch (err) {
            this.logger.error('Heartbeat exception', err, { job_id: jobId });
        }
    }
    /**
     * Start heartbeat interval for all active jobs
     */
    startHeartbeat() {
        this.logger.info('Starting heartbeat interval', {
            interval_ms: config.worker.heartbeatIntervalMs,
        });
        this.heartbeatInterval = setInterval(async () => {
            const activeJobCount = this.activeJobs.size;
            if (activeJobCount > 0) {
                this.logger.debug('Heartbeat tick', { active_jobs: activeJobCount });
                for (const jobId of this.activeJobs.keys()) {
                    await this.updateJobHeartbeat(jobId);
                }
            }
        }, config.worker.heartbeatIntervalMs);
    }
    // ---------------------------------------------------------------------------
    // 3.10: MEMORY MANAGEMENT
    // ---------------------------------------------------------------------------
    /**
     * Cleanup job memory to prevent accumulation
     * Forces garbage collection if available (requires --expose-gc flag)
     */
    async cleanupJobMemory(jobId) {
        try {
            const beforeMemory = process.memoryUsage();
            const beforeHeapMB = Math.round(beforeMemory.heapUsed / 1024 / 1024);
            if (global.gc) {
                global.gc();
                const afterMemory = process.memoryUsage();
                const afterHeapMB = Math.round(afterMemory.heapUsed / 1024 / 1024);
                const freedMB = beforeHeapMB - afterHeapMB;
                this.logger.info('Memory cleanup completed', {
                    job_id: jobId,
                    heap_before_mb: beforeHeapMB,
                    heap_after_mb: afterHeapMB,
                    freed_mb: freedMB,
                });
            }
            else {
                this.logger.warn('Garbage collection not available - run Node with --expose-gc flag', {
                    job_id: jobId,
                    heap_used_mb: beforeHeapMB,
                });
            }
        }
        catch (error) {
            this.logger.error('Memory cleanup failed', error, { job_id: jobId });
        }
    }
    // ---------------------------------------------------------------------------
    // 3.11: UTILITIES
    // ---------------------------------------------------------------------------
    /**
     * Sleep utility for delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// =============================================================================
// SECTION 4: EXPRESS SERVER & HEALTH CHECK
// =============================================================================
const app = (0, express_1.default)();
const worker = new V3Worker();
// Module-level logger for server startup/shutdown
const serverLogger = (0, logger_1.createLogger)({
    context: 'server',
    worker_id: config.worker.id,
});
/**
 * Health check endpoint (required by Render.com)
 */
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        worker_id: config.worker.id,
        active_jobs: worker['activeJobs'].size,
        timestamp: new Date().toISOString(),
    });
});
/**
 * Start server and worker
 */
app.listen(config.server.port, () => {
    serverLogger.info('Health check server listening', {
        port: config.server.port,
    });
    // Start worker
    worker.start().catch(error => {
        serverLogger.error('Worker failed to start', error);
        process.exit(1);
    });
});
/**
 * Graceful shutdown handlers
 */
process.on('SIGTERM', async () => {
    serverLogger.info('SIGTERM received, shutting down gracefully');
    await worker.stop();
    process.exit(0);
});
process.on('SIGINT', async () => {
    serverLogger.info('SIGINT received, shutting down gracefully');
    await worker.stop();
    process.exit(0);
});
// =============================================================================
// SECTION 5: REMOVED CODE LOG
// =============================================================================
//
// The following code was removed from the original worker.ts during refactoring:
//
// 1. REMOVED: processShellFile() function (Lines 627-665 in original)
//    Reason: Unused simulation code, never called in V3 architecture
//    Impact: None - function was dead code
//
// 2. REMOVED: Legacy `lines` array in OCR page results
//    Reason: Redundant with blocks structure, adds storage overhead
//    Impact: BREAKING CHANGE - Requires updates to:
//      - Pass 0.5 coordinate lookup (must use blocks instead of lines)
//      - Any other code reading page-N.json files
//    Migration: Use blocks[].paragraphs[].words[] instead of lines[]
//
// 3. MOVED: OCR processing utilities to utils/ocr-processing.ts
//    - sortBlocksSpatially()
//    - extractTextFromBlocks()
//    - processWithGoogleVisionOCR()
//    Reason: Better organization, testability, reusability
//    Impact: None - exported functions have same signatures
//
// 4. FIXED: Phase 4 Raw GCV Storage (Lines 257-276 in original)
//    Problem: Code was in standalone function, tried to use 'this' and 'payload'
//    Solution: Moved storage call to worker class with proper context passing
//    Impact: Feature now works correctly when STORE_RAW_GCV=true
//
// 5. REMOVED: Fake block structure generation (Lines 1188-1224 in original)
//    Problem: Created incorrect blocks from legacy lines array
//    Solution: Use real page.blocks directly from OCR processing
//    Impact: Enhanced OCR format now has correct block hierarchy
//
// =============================================================================
//# sourceMappingURL=worker.js.map