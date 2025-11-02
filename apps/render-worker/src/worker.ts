// =============================================================================
// V3 BACKGROUND JOB PROCESSING WORKER FOR RENDER.COM
// =============================================================================
// Purpose: Process queued jobs from V3 job_queue table
// Primary focus: Document processing with AI (OCR + medical data extraction)
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import dotenv from 'dotenv';
import { Pass1EntityDetector, Pass1Input, Pass1Config, Pass1DatabaseRecords, AIProcessingJobPayload } from './pass1';
import { runPass05, Pass05Input } from './pass05';
import { calculateSHA256 } from './utils/checksum';
import { persistOCRArtifacts, loadOCRArtifacts } from './utils/ocr-persistence';
import { retryGoogleVision, retryStorageDownload } from './utils/retry';
import { createLogger, maskPatientId, Logger } from './utils/logger';
import { preprocessForOCR, type PreprocessResult } from './utils/format-processor';
import { storeProcessedImages, type ProcessedImageMetadata } from './utils/storage/store-processed-images';

// Load environment variables
dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
  },
  googleCloud: {
    apiKey: process.env.GOOGLE_CLOUD_API_KEY!,
  },
  worker: {
    // FIXED: Use deployment guide configuration
    id: process.env.WORKER_ID || `render-${process.env.RENDER_SERVICE_ID || 'local'}-${Date.now()}`,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
    maxConcurrentJobs: parseInt(process.env.WORKER_CONCURRENCY || '50'), // FIXED: 50 not 3
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
};

// =============================================================================
// TYPES
// =============================================================================

interface Job {
  id: string;
  job_type: string;
  job_lane: string | null;
  job_category: string;
  job_name: string;
  job_payload: any;
  status: string;
  priority: number;
  scheduled_at: string;
  retry_count: number;
  max_retries: number;
}

// =============================================================================
// OCR PROCESSING - MOVED FROM EDGE FUNCTION
// =============================================================================

interface OCRSpatialData {
  extracted_text: string;
  spatial_mapping: Array<{
    text: string;
    bounding_box: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence: number;
  }>;
  ocr_confidence: number;
  processing_time_ms: number;
  ocr_provider: string;
  raw_gcv_response: any; // Full GCV API response for debugging and reprocessing
}

/**
 * Sort text blocks spatially for correct reading order
 * Fixes multi-column reading bug where GCV returns text in detection order, not reading order
 *
 * Algorithm:
 * 1. Group blocks into horizontal rows by Y-coordinate
 * 2. Sort rows top-to-bottom
 * 3. Within each row, sort blocks left-to-right by X-coordinate
 *
 * @param blocks - GCV blocks with boundingBox vertices
 * @returns Sorted blocks in natural reading order (top-to-bottom, left-to-right)
 */
function sortBlocksSpatially(blocks: any[]): any[] {
  if (!blocks || blocks.length === 0) {
    return blocks;
  }

  // Calculate bbox for each block
  const blocksWithBbox = blocks.map(block => {
    const vertices = block.boundingBox?.vertices || [];
    if (vertices.length < 4) {
      return { block, y: 0, x: 0, height: 0 };
    }

    const y = Math.min(...vertices.map((v: any) => v.y || 0));
    const x = Math.min(...vertices.map((v: any) => v.x || 0));
    const maxY = Math.max(...vertices.map((v: any) => v.y || 0));
    const height = maxY - y;

    return { block, y, x, height };
  });

  // Sort by Y first (top-to-bottom)
  blocksWithBbox.sort((a, b) => a.y - b.y);

  // Group into rows (blocks with overlapping Y ranges)
  const rows: typeof blocksWithBbox[] = [];
  let currentRow: typeof blocksWithBbox = [];
  let currentRowMaxY = 0;

  for (const item of blocksWithBbox) {
    // Check if this block overlaps with current row's Y range
    // Use height-based threshold: block is in same row if it starts within current row's height
    const isInCurrentRow = currentRow.length === 0 ||
      (item.y < currentRowMaxY && item.y >= currentRow[0].y - currentRow[0].height * 0.5);

    if (isInCurrentRow) {
      currentRow.push(item);
      currentRowMaxY = Math.max(currentRowMaxY, item.y + item.height);
    } else {
      // Start new row
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [item];
      currentRowMaxY = item.y + item.height;
    }
  }

  // Don't forget last row
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Sort each row left-to-right by X
  rows.forEach(row => {
    row.sort((a, b) => a.x - b.x);
  });

  // Flatten back to sorted blocks
  return rows.flatMap(row => row.map(item => item.block));
}

/**
 * Extract text from sorted blocks in reading order
 * @param blocks - Sorted GCV blocks
 * @returns Concatenated text with proper spacing and line breaks
 */
function extractTextFromBlocks(blocks: any[]): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    if (block.paragraphs) {
      for (const paragraph of block.paragraphs) {
        if (paragraph.words) {
          const paragraphText = paragraph.words
            .map((word: any) => word.symbols?.map((s: any) => s.text).join('') || '')
            .filter((text: string) => text.length > 0)
            .join(' ');

          if (paragraphText) {
            textParts.push(paragraphText);
          }
        }
      }
    }
  }

  return textParts.join('\n');
}

/**
 * Process document with Google Cloud Vision OCR
 * Moved from Edge Function to Worker for instant upload response
 */
async function processWithGoogleVisionOCR(
  base64Data: string,
  _mimeType: string  // Currently unused but may be needed for future format-specific processing
): Promise<OCRSpatialData> {
  const googleApiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!googleApiKey) {
    throw new Error('GOOGLE_CLOUD_API_KEY not configured');
  }

  const startTime = Date.now();

  // Call Google Cloud Vision API with retry logic
  const response = await retryGoogleVision(async () => {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Data },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );

    if (!res.ok) {
      const error: any = new Error(`Google Vision API failed: ${res.status} ${res.statusText}`);
      error.status = res.status;
      error.response = res; // Preserve response for Retry-After header
      throw error;
    }

    return res;
  });

  const result = await response.json() as any;
  const annotation = result.responses?.[0]?.fullTextAnnotation;

  if (!annotation) {
    throw new Error('No text detected in document');
  }

  // SPATIAL SORTING FIX: Sort blocks spatially before extracting text
  // This fixes multi-column reading bug where GCV returns text in detection order
  let extractedText = '';
  if (annotation.pages && annotation.pages[0]?.blocks) {
    const sortedBlocks = sortBlocksSpatially(annotation.pages[0].blocks);
    extractedText = extractTextFromBlocks(sortedBlocks);
  } else {
    // Fallback to GCV's text if no blocks found (should be rare)
    extractedText = annotation.text || '';
  }

  // Build spatial mapping from pages (keeping original structure for bbox data)
  const spatialMapping: OCRSpatialData['spatial_mapping'] = [];

  // Process pages and blocks
  if (annotation.pages) {
    for (const page of annotation.pages) {
      if (page.blocks) {
        // Use spatially sorted blocks for consistent ordering
        const sortedBlocks = sortBlocksSpatially(page.blocks);

        for (const block of sortedBlocks) {
          if (block.paragraphs) {
            for (const paragraph of block.paragraphs) {
              if (paragraph.words) {
                for (const word of paragraph.words) {
                  const text = word.symbols?.map((s: any) => s.text).join('') || '';
                  if (text && word.boundingBox?.vertices?.length >= 4) {
                    const vertices = word.boundingBox.vertices;
                    const x = Math.min(...vertices.map((v: any) => v.x || 0));
                    const y = Math.min(...vertices.map((v: any) => v.y || 0));
                    const maxX = Math.max(...vertices.map((v: any) => v.x || 0));
                    const maxY = Math.max(...vertices.map((v: any) => v.y || 0));

                    spatialMapping.push({
                      text,
                      bounding_box: {
                        x,
                        y,
                        width: maxX - x,
                        height: maxY - y,
                      },
                      confidence: word.confidence || 0.85,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Calculate average confidence
  const totalConfidence = spatialMapping.reduce((sum, item) => sum + item.confidence, 0);
  const confidenceCount = spatialMapping.length;
  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.85;
  const processingTime = Date.now() - startTime;

  return {
    extracted_text: extractedText,
    spatial_mapping: spatialMapping,
    ocr_confidence: avgConfidence,
    processing_time_ms: processingTime,
    ocr_provider: 'google_cloud_vision',
    raw_gcv_response: result.responses?.[0] || null, // Store for debugging and reprocessing
  };
}

// =============================================================================
// WORKER CLASS
// =============================================================================

class V3Worker {
  private supabase: SupabaseClient;
  private workerId: string;
  private logger: Logger;
  private activeJobs: Map<string, boolean> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private pass1Detector?: Pass1EntityDetector;

  constructor() {
    this.workerId = config.worker.id;
    this.logger = createLogger({
      context: 'worker',
      worker_id: this.workerId,
    });

    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );

    // Initialize Pass 1 detector if OpenAI key is available
    if (config.openai.apiKey) {
      const pass1Config: Pass1Config = {
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
      this.pass1Detector = new Pass1EntityDetector(pass1Config);
      this.logger.info('Pass 1 Entity Detector initialized');
    } else {
      this.logger.warn('OpenAI API key not found - Pass 1 disabled');
    }

    this.logger.info('V3 Worker initialized');
  }

  // Start the worker
  async start() {
    this.logger.info('Starting V3 Worker');

    // Start heartbeat
    this.startHeartbeat();

    // Start polling for jobs
    await this.pollForJobs();
  }

  // Poll for pending jobs
  private async pollForJobs() {
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
          // Process job asynchronously
          this.processJob(job).catch(error => {
            this.logger.error('Error processing job', error as Error, { job_id: job.id });
          });
        }

        // Wait before next poll
        await this.sleep(config.worker.pollIntervalMs);

      } catch (error) {
        this.logger.error('Polling error', error as Error);
        await this.sleep(config.worker.pollIntervalMs * 2); // Back off on error
      }
    }
  }

  // Fetch next job from queue using CORRECT function name and parameters
  private async fetchNextJob(): Promise<Job | null> {
    const { data, error } = await this.supabase
      .rpc('claim_next_job_v3', {  // FIXED: Correct function name
        p_worker_id: this.workerId,   // FIXED: Correct parameter name (with p_ prefix)
        p_job_types: ['ai_processing'], // FIXED: Match Edge Function job type
        p_job_lanes: ['ai_queue_simple']  // FIXED: Match Edge Function job lane
      });

    // VERBOSE LOGGING: See what RPC actually returns
    this.logger.debug('RPC claim_next_job_v3 response', {
      hasError: !!error,
      error: error,
      dataType: typeof data,
      dataIsArray: Array.isArray(data),
      dataLength: data ? (Array.isArray(data) ? data.length : 'NOT_ARRAY') : 'NULL',
      dataValue: data
    });

    if (error) {
      this.logger.error('Error claiming job', error as Error);
      return null;
    }

    if (data && data.length > 0) {
      // FIXED: Function returns job_id, job_type, job_payload, retry_count
      const jobData = data[0];
      this.logger.debug('Job data from RPC', jobData);

      // Need to fetch full job details
      const { data: fullJob, error: fetchError } = await this.supabase
        .from('job_queue')
        .select('*')
        .eq('id', jobData.job_id)
        .single();

      if (fetchError || !fullJob) {
        this.logger.error('Error fetching job details', fetchError as Error, { job_id: jobData.job_id });
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

  // Process a single job
  private async processJob(job: Job) {
    const jobId = job.id;

    // Extract correlation_id from job payload (fallback to job ID for traceability)
    const correlationId = job.job_payload?.correlation_id || `job_${jobId}`;
    this.logger.setCorrelationId(correlationId);

    // Mark job as active
    this.activeJobs.set(jobId, true);

    try {
      await this.logger.logOperation(
        'processJob',
        async () => {
          this.logger.info('Processing job', {
            job_id: jobId,
            job_type: job.job_type,
            job_name: job.job_name,
            retry_count: job.retry_count,
          });

          // Update heartbeat
          await this.updateJobHeartbeat(jobId);

          // Process based on job type
          let result: any;

          switch (job.job_type) {
            case 'shell_file_processing':
              result = await this.processShellFile(job);
              break;

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
        },
        { job_id: jobId, job_type: job.job_type }
      );

    } catch (error: any) {
      this.logger.error('Job failed', error, {
        job_id: jobId,
        error_message: error.message,
      });

      // GUARD: Don't call failJob if the job was rescheduled (already handled by RPC)
      if (error.message && error.message.includes('Job rescheduled')) {
        this.logger.info('Job rescheduled - skipping failJob call', {
          job_id: jobId,
          error_message: error.message,
        });
      } else {
        // Mark job as failed
        await this.failJob(jobId, error.message);
      }

    } finally {
      // Remove from active jobs
      this.activeJobs.delete(jobId);
    }
  }

  // Process shell file (document upload)
  private async processShellFile(job: Job): Promise<any> {
    const { shell_file_id, patient_id } = job.job_payload;  // FIXED: Removed unused file_path

    this.logger.info('Processing shell file', {
      shell_file_id,
      patient_id_masked: maskPatientId(patient_id),
    });

    // TODO: Implement actual document processing
    // 1. Download file from storage
    // 2. Run OCR if needed
    // 3. Extract medical data with AI
    // 4. Create clinical narratives
    // 5. Update shell_files status

    // For now, just simulate processing
    await this.sleep(2000);

    // Update shell file status
    const { error } = await this.supabase
      .from('shell_files')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', shell_file_id);

    if (error) {
      throw new Error(`Failed to update shell file: ${error.message}`);
    }

    return {
      shell_file_id,
      patient_id,
      status: 'completed',
      message: 'Document processed successfully (simulation)',
    };
  }

  // Process AI job (NEW: storage-based payload structure)
  private async processAIJob(job: Job): Promise<any> {
    const payload = job.job_payload as AIProcessingJobPayload;

    // Validate storage-based payload structure
    if (!payload.shell_file_id || !payload.storage_path || !payload.patient_id) {
      throw new Error('Invalid AI job payload: missing required fields (shell_file_id, storage_path, patient_id)');
    }

    this.logger.info('Processing AI job', {
      shell_file_id: payload.shell_file_id,
      patient_id_masked: maskPatientId(payload.patient_id),
      storage_path: payload.storage_path,
      file_size_bytes: payload.file_size_bytes,
      mime_type: payload.mime_type,
    });

    // NEW: Update shell_files with job tracking at start
    await this.supabase
      .from('shell_files')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        processing_job_id: job.id,
        processing_worker_id: this.workerId
      })
      .eq('id', payload.shell_file_id);

    // NEW: Download file from storage with retry logic
    const result = await retryStorageDownload(async () => {
      return await this.supabase.storage
        .from('medical-docs')
        .download(payload.storage_path);
    });

    if (result.error || !result.data) {
      const error: any = new Error(`Failed to download file from storage: ${result.error?.message}`);
      error.status = 500;
      throw error;
    }

    const fileBlob = result.data;

    // NEW: Calculate checksum for integrity verification
    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
    const fileChecksum = await calculateSHA256(fileBuffer);
    this.logger.debug('File checksum calculated', {
      shell_file_id: payload.shell_file_id,
      checksum: fileChecksum,
    });

    // NEW: Check for existing OCR artifacts (reuse if available)
    let ocrResult = await loadOCRArtifacts(this.supabase, payload.shell_file_id, this.logger['correlation_id']);

    if (ocrResult) {
      this.logger.info('Reusing existing OCR artifacts', {
        shell_file_id: payload.shell_file_id,
      });
    } else {
      // PHASE 1: FORMAT PREPROCESSING (Extract pages from multi-page formats)
      this.logger.info('Format preprocessing: Extracting pages', {
        shell_file_id: payload.shell_file_id,
        mime_type: payload.mime_type,
      });

      const base64Data = fileBuffer.toString('base64');
      let preprocessResult: PreprocessResult;

      try {
        preprocessResult = await preprocessForOCR(base64Data, payload.mime_type, {
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
      } catch (error: any) {
        this.logger.error('Format preprocessing failed', error as Error, {
          shell_file_id: payload.shell_file_id,
        });
        throw error;
      }

      // NEW: Store processed JPEG pages for click-to-source feature
      let imageMetadata: ProcessedImageMetadata | undefined;
      try {
        imageMetadata = await storeProcessedImages(
          this.supabase,
          payload.patient_id,
          payload.shell_file_id,
          preprocessResult.pages,
          this.logger['correlation_id']
        );

        this.logger.info('Processed images stored', {
          shell_file_id: payload.shell_file_id,
          pageCount: imageMetadata.pages.length,
          totalBytes: imageMetadata.totalBytes,
          folderPath: imageMetadata.folderPath,
        });
      } catch (error: any) {
        // CRITICAL: Fail the job if image storage fails
        // Click-to-source feature requires processed images
        this.logger.error('Failed to store processed images', error as Error, {
          shell_file_id: payload.shell_file_id,
        });
        throw new Error(`CRITICAL: Failed to store processed images: ${error.message}`);
      }

      // PHASE 2: OCR EACH PAGE
      this.logger.info('Running OCR on extracted pages', {
        shell_file_id: payload.shell_file_id,
        pageCount: preprocessResult.pages.length,
      });

      const ocrPages: any[] = [];

      // Batched parallel OCR processing (10 pages at a time)
      const BATCH_SIZE = parseInt(process.env.OCR_BATCH_SIZE || '10', 10);
      const OCR_TIMEOUT_MS = parseInt(process.env.OCR_TIMEOUT_MS || '30000', 10); // 30 sec per page
      const MEMORY_LIMIT_MB = 480; // Safety threshold (512 MB limit - 32 MB buffer)
      const validPages = preprocessResult.pages.filter(p => p.base64); // Skip failed pages

      this.logger.info('Starting batched parallel OCR', {
        shell_file_id: payload.shell_file_id,
        totalPages: preprocessResult.pages.length,
        validPages: validPages.length,
        batchSize: BATCH_SIZE,
      });

      // Process pages in batches with comprehensive error handling
      try {
        for (let batchStart = 0; batchStart < validPages.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, validPages.length);
          const batch = validPages.slice(batchStart, batchEnd);
          const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(validPages.length / BATCH_SIZE);

          this.logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
            shell_file_id: payload.shell_file_id,
            batchStart: batchStart + 1,
            batchEnd,
            batchSize: batch.length,
          });

          // Check memory before processing batch
          const memBefore = process.memoryUsage();
          const rssMB = Math.round(memBefore.rss / 1024 / 1024);

          this.logger.info('Memory before batch', {
            shell_file_id: payload.shell_file_id,
            batchNumber,
            heapUsedMB: Math.round(memBefore.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memBefore.heapTotal / 1024 / 1024),
            rssMB,
          });

          // Safety check: abort if approaching memory limit
          if (rssMB > MEMORY_LIMIT_MB) {
            throw new Error(
              `Memory limit approaching (${rssMB} MB / ${MEMORY_LIMIT_MB} MB threshold). ` +
              `Processed ${ocrPages.length}/${validPages.length} pages before aborting.`
            );
          }

          // Process batch in parallel with improved timeout handling
          const batchResults = await Promise.allSettled(
            batch.map(async (page) => {
              let timeoutId: NodeJS.Timeout | null = null;

              try {
                this.logger.info(`Processing page ${page.pageNumber}/${preprocessResult.totalPages}`, {
                  shell_file_id: payload.shell_file_id,
                  pageNumber: page.pageNumber,
                  width: page.width,
                  height: page.height,
                });

                // Create timeout promise with cleanup
                const timeoutPromise = new Promise<never>((_, reject) => {
                  timeoutId = setTimeout(() => {
                    reject(new Error(`OCR timeout after ${OCR_TIMEOUT_MS}ms`));
                  }, OCR_TIMEOUT_MS);
                });

                // Race between OCR and timeout
                const ocrSpatialData = await Promise.race([
                  processWithGoogleVisionOCR(page.base64!, page.mime),
                  timeoutPromise,
                ]);

                // Clear timeout since OCR succeeded
                if (timeoutId) clearTimeout(timeoutId);

                // Free memory: nullify base64 after successful OCR
                page.base64 = null;

                // Transform to OCR page format
                const ocrPage = {
                  page_number: page.pageNumber,
                  size: { width_px: page.width || 0, height_px: page.height || 0 },
                  lines: ocrSpatialData.spatial_mapping.map((item, idx) => ({
                    text: item.text,
                    bbox: {
                      x: item.bounding_box.x,
                      y: item.bounding_box.y,
                      w: item.bounding_box.width,
                      h: item.bounding_box.height,
                    },
                    bbox_norm:
                      page.width && page.height
                        ? {
                            x: item.bounding_box.x / page.width,
                            y: item.bounding_box.y / page.height,
                            w: item.bounding_box.width / page.width,
                            h: item.bounding_box.height / page.height,
                          }
                        : null,
                    confidence: item.confidence,
                    reading_order: idx,
                  })),
                  tables: [],
                  provider: ocrSpatialData.ocr_provider,
                  processing_time_ms: ocrSpatialData.processing_time_ms,
                  raw_gcv_response: ocrSpatialData.raw_gcv_response, // Store for debugging
                };

                this.logger.info(`Page ${page.pageNumber} OCR complete`, {
                  shell_file_id: payload.shell_file_id,
                  pageNumber: page.pageNumber,
                  textLength: ocrSpatialData.extracted_text.length,
                  confidence: ocrSpatialData.ocr_confidence,
                });

                return ocrPage;
              } catch (error) {
                // Clear timeout on error
                if (timeoutId) clearTimeout(timeoutId);

                // Free memory even on error
                page.base64 = null;

                this.logger.error(`Page ${page.pageNumber} OCR failed`, error as Error, {
                  shell_file_id: payload.shell_file_id,
                  pageNumber: page.pageNumber,
                  errorMessage: error instanceof Error ? error.message : String(error),
                });

                throw error;
              }
            })
          );

          // Process batch results - check for failures
          const successfulPages: any[] = [];
          const failedPages: Array<{ pageNumber: number; error: string }> = [];

          batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              successfulPages.push(result.value);
            } else {
              const page = batch[index];
              failedPages.push({
                pageNumber: page.pageNumber,
                error: result.reason instanceof Error ? result.reason.message : String(result.reason),
              });
            }
          });

          // If ANY pages failed in this batch, fail the entire job
          if (failedPages.length > 0) {
            throw new Error(
              `Batch ${batchNumber} failed: ${failedPages.length}/${batch.length} pages failed. ` +
              `Failed pages: ${failedPages.map(p => p.pageNumber).join(', ')}. ` +
              `First error: ${failedPages[0].error}`
            );
          }

          // Add successful batch results to main array
          ocrPages.push(...successfulPages);

          // Memory cleanup after batch
          const memAfter = process.memoryUsage();
          this.logger.info(`Batch ${batchNumber}/${totalBatches} complete`, {
            shell_file_id: payload.shell_file_id,
            batchNumber,
            pagesProcessed: ocrPages.length,
            totalPages: validPages.length,
            heapUsedMB: Math.round(memAfter.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memAfter.heapTotal / 1024 / 1024),
            rssMB: Math.round(memAfter.rss / 1024 / 1024),
          });

          // Force garbage collection if available (requires --expose-gc flag)
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
      } catch (batchError) {
        // Comprehensive error logging for batch processing failures
        this.logger.error('Batched OCR processing failed', batchError as Error, {
          shell_file_id: payload.shell_file_id,
          pagesCompleted: ocrPages.length,
          totalPages: validPages.length,
          errorMessage: batchError instanceof Error ? batchError.message : String(batchError),
        });
        throw batchError;
      }

      // Build final multi-page OCR result
      ocrResult = {
        pages: ocrPages,
      };

      this.logger.info('All pages OCR complete', {
        shell_file_id: payload.shell_file_id,
        totalPages: ocrPages.length,
      });

      // Persist OCR artifacts for future reuse (with processed image references)
      await persistOCRArtifacts(
        this.supabase,
        payload.shell_file_id,
        payload.patient_id,
        ocrResult,
        fileChecksum,
        imageMetadata,  // NEW: Include processed image metadata
        this.logger['correlation_id']
      );

      // Store raw GCV responses in shell_files for debugging and analysis
      const rawGCVResponses = ocrResult.pages
        .filter((p: any) => p.raw_gcv_response)
        .map((p: any) => ({
          page_number: p.page_number,
          raw_response: p.raw_gcv_response
        }));

      if (rawGCVResponses.length > 0) {
        const { error: ocrStorageError } = await this.supabase
          .from('shell_files')
          .update({
            ocr_raw_jsonb: { pages: rawGCVResponses }
          })
          .eq('id', payload.shell_file_id);

        if (ocrStorageError) {
          this.logger.error('Failed to store raw OCR responses', ocrStorageError as Error, {
            shell_file_id: payload.shell_file_id,
          });
          // Log error but don't fail - this is for debugging only
        } else {
          this.logger.info('Stored raw OCR responses in database', {
            shell_file_id: payload.shell_file_id,
            pages_stored: rawGCVResponses.length,
          });
        }
      }

      // Update shell_files record with processed image metadata
      if (imageMetadata) {
        const { error: updateError } = await this.supabase
          .from('shell_files')
          .update({
            processed_image_path: imageMetadata.folderPath,
            processed_image_checksum: imageMetadata.combinedChecksum,
            processed_image_mime: 'image/jpeg',
          })
          .eq('id', payload.shell_file_id);

        if (updateError) {
          this.logger.error('Failed to update shell_files with processed image metadata', updateError as Error, {
            shell_file_id: payload.shell_file_id,
          });
          // Log error but don't fail the job - OCR and images are already stored
        } else {
          this.logger.info('Updated shell_files with processed image metadata', {
            shell_file_id: payload.shell_file_id,
            processed_image_path: imageMetadata.folderPath,
          });
        }
      }
    }

    // =============================================================================
    // PASS 0.5: ENCOUNTER DISCOVERY (NEW - October 2025)
    // =============================================================================
    // Run Pass 0.5 encounter discovery before Pass 1 entity detection
    // Creates healthcare_encounters records and manifest for downstream passes

    this.logger.info('Starting Pass 0.5 encounter discovery', {
      shell_file_id: payload.shell_file_id,
      page_count: ocrResult.pages.length,
    });

    // Generate processing session ID (shared by Pass 0.5 and Pass 1)
    const processingSessionId = crypto.randomUUID();

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
        workflow_step: 'entity_detection',
        total_steps: 5,
        completed_steps: 0,
        processing_started_at: new Date().toISOString()
      });

    if (sessionError) {
      throw new Error(`Failed to create processing session: ${sessionError.message}`);
    }

    // Convert OCR result to Pass 0.5 input format
    const pass05Input: Pass05Input = {
      shellFileId: payload.shell_file_id,
      patientId: payload.patient_id,
      ocrOutput: {
        fullTextAnnotation: {
          text: ocrResult.pages.map((p: any) => p.lines.map((l: any) => l.text).join(' ')).join('\n'),
          pages: ocrResult.pages.map((page: any) => ({
            width: page.size.width_px || 1000,
            height: page.size.height_px || 1400,
            confidence: page.lines.reduce((sum: number, l: any) => sum + l.confidence, 0) / (page.lines.length || 1),
            blocks: page.lines.map((line: any) => ({
              boundingBox: {
                vertices: [
                  { x: line.bbox.x, y: line.bbox.y },
                  { x: line.bbox.x + line.bbox.w, y: line.bbox.y },
                  { x: line.bbox.x + line.bbox.w, y: line.bbox.y + line.bbox.h },
                  { x: line.bbox.x, y: line.bbox.y + line.bbox.h }
                ]
              },
              confidence: line.confidence,
              paragraphs: []
            }))
          }))
        }
      },
      pageCount: ocrResult.pages.length,
      processingSessionId: processingSessionId
    };

    const pass05Result = await runPass05(pass05Input);

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

    // =============================================================================
    // TEMPORARY: PASS 1 DISABLED FOR PASS 0.5 BASELINE VALIDATION TESTING
    // =============================================================================
    // Date: October 31, 2025
    // Purpose: Validate Pass 0.5 baseline prompt improvements without burning tokens on Pass 1
    // Test Plan: shared/docs/.../test-03-ocr-vs-vision-strategy/BASELINE_VALIDATION_PLAN.md
    // TODO: Remove this block after baseline validation complete
    // =============================================================================
    this.logger.info('Pass 1 DISABLED for testing - returning early after Pass 0.5', {
      shell_file_id: payload.shell_file_id,
      note: 'Temporary modification for baseline validation testing'
    });

    return {
      success: true,
      shell_file_id: payload.shell_file_id,
      pass_05_only: true,
      pass_05_result: pass05Result,
      message: 'Pass 0.5 completed successfully. Pass 1 temporarily disabled for testing.'
    };
    // =============================================================================
    // END TEMPORARY MODIFICATION
    // =============================================================================

    // =============================================================================
    // PASS 1: ENTITY DETECTION (existing code continues)
    // =============================================================================

    // =============================================================================
    // PHASE 1.5: DOWNLOAD FIRST PROCESSED IMAGE FOR VISION AI
    // =============================================================================
    // CRITICAL: Vision AI must use the same processed JPEG that OCR used
    // This ensures format consistency (JPEG not HEIC/TIFF/PDF) and dimension matching

    this.logger.info('Downloading first processed image for Vision AI', {
      shell_file_id: payload.shell_file_id,
    });

    // Get processed image path from shell_files (set during format preprocessing)
    const { data: shellFileRecord, error: shellFileError } = await this.supabase
      .from('shell_files')
      .select('processed_image_path')
      .eq('id', payload.shell_file_id)
      .single();

    if (shellFileError) {
      throw new Error(`Database error fetching shell_file record: ${shellFileError?.message || 'Unknown error'}`);
    }

    if (!shellFileRecord) {
      throw new Error(`Shell file ${payload.shell_file_id} not found in database`);
    }

    if (!shellFileRecord!.processed_image_path) {
      throw new Error(
        `Missing processed_image_path for shell_file ${payload.shell_file_id}. ` +
        `This should have been set during format preprocessing.`
      );
    }

    // Non-null assertions: validated by error checks above
    const processedImagePath: string = shellFileRecord!.processed_image_path!;
    const firstPagePath = `${processedImagePath}/page-1.jpg`;

    const imageDownloadResult = await retryStorageDownload(async () => {
      return await this.supabase.storage
        .from('medical-docs')
        .download(firstPagePath);
    });

    if (imageDownloadResult.error || !imageDownloadResult.data) {
      throw new Error(
        `Failed to download processed image for Vision AI: ${imageDownloadResult.error?.message}`
      );
    }

    // Non-null assertion: validated by error check above
    const imageBlob = imageDownloadResult.data!;
    const processedImageBuffer = Buffer.from(await imageBlob.arrayBuffer());
    const processedImageBase64 = processedImageBuffer.toString('base64');

    this.logger.info('First processed image downloaded for Vision AI', {
      shell_file_id: payload.shell_file_id,
      image_path: firstPagePath,
      image_size_bytes: processedImageBuffer.length,
    });

    // Build Pass1Input from storage-based payload + OCR result
    // CRITICAL: Use first processed JPEG page (not original file) for format consistency
    const pass1Input: Pass1Input = {
      shell_file_id: payload.shell_file_id,
      patient_id: payload.patient_id,
      processing_session_id: processingSessionId,  // Reuse Pass 0.5 session ID
      raw_file: {
        file_data: processedImageBase64,           // ✅ Processed JPEG from storage (same as OCR input)
        file_type: 'image/jpeg',                   // ✅ Consistent format (not original MIME type)
        filename: payload.uploaded_filename,
        file_size: processedImageBuffer.length
      },
      ocr_spatial_data: {
        extracted_text: ocrResult.pages.map((p: any) => p.lines.map((l: any) => l.text).join(' ')).join(' '),
        spatial_mapping: ocrResult.pages.flatMap((page: any) => 
          page.lines.map((line: any) => ({
            text: line.text,
            page_number: page.page_number,
            bounding_box: {
              x: line.bbox.x,
              y: line.bbox.y,
              width: line.bbox.w,
              height: line.bbox.h
            },
            line_number: line.reading_order,
            word_index: 0,
            confidence: line.confidence
          }))
        ),
        ocr_confidence: ocrResult.pages[0]?.lines.reduce((sum: number, line: any) => sum + line.confidence, 0) / (ocrResult.pages[0]?.lines.length || 1) || 0.85,
        processing_time_ms: ocrResult.pages[0]?.processing_time_ms || 0,
        ocr_provider: ocrResult.pages[0]?.provider || 'google_vision'
      },
      document_metadata: {
        filename: payload.uploaded_filename,
        file_type: payload.mime_type,
        page_count: ocrResult.pages.length,
        upload_timestamp: new Date().toISOString()
      }
    };

    // Process with Pass 1 entity detection
    this.logger.info('Starting Pass 1 entity detection with storage-based input', {
      shell_file_id: pass1Input.shell_file_id,
    });
    return await this.processPass1EntityDetection({ ...job, job_payload: pass1Input });
  }

  // Process Pass 1 Entity Detection
  private async processPass1EntityDetection(job: Job): Promise<any> {
    if (!this.pass1Detector) {
      throw new Error('Pass 1 detector not initialized - OpenAI API key may be missing');
    }

    const payload = job.job_payload as Pass1Input;

    this.logger.info('Starting Pass 1 entity detection', {
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
    this.logger.debug('Building Pass 1 database records (7 tables)', {
      shell_file_id: payload.shell_file_id,
    });
    const dbRecords = await this.pass1Detector.getAllDatabaseRecords(payload);

    // Insert into ALL 7 Pass 1 tables
    await this.insertPass1DatabaseRecords(dbRecords, payload.shell_file_id);

    this.logger.info('Pass 1 complete - inserted records into 7 tables', {
      shell_file_id: payload.shell_file_id,
      entity_audit_records: result.records_created.entity_audit,
      confidence_scoring_records: result.records_created.confidence_scoring,
      manual_review_records: result.records_created.manual_review_queue,
    });

    // NEW: Update shell_files with completion tracking
    await this.supabase
      .from('shell_files')
      .update({
        status: 'pass1_complete',
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', payload.shell_file_id);

    return result;
  }

  // Insert Pass 1 records into all 7 database tables
  private async insertPass1DatabaseRecords(
    records: Pass1DatabaseRecords,
    shellFileId: string
  ): Promise<void> {
    // 1. UPSERT ai_processing_sessions (may already exist from Pass 0.5)
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
      // Non-fatal - continue
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

    // 6. INSERT ai_confidence_scoring (optional - may be empty)
    if (records.ai_confidence_scoring.length > 0) {
      const { error: confidenceError } = await this.supabase
        .from('ai_confidence_scoring')
        .insert(records.ai_confidence_scoring);

      if (confidenceError) {
        this.logger.warn('Failed to insert ai_confidence_scoring (non-fatal)', {
          shell_file_id: shellFileId,
          error_message: confidenceError.message,
        });
        // Non-fatal - continue
      }
    }

    // 7. INSERT manual_review_queue (optional - may be empty)
    if (records.manual_review_queue.length > 0) {
      const { error: reviewError } = await this.supabase
        .from('manual_review_queue')
        .insert(records.manual_review_queue);

      if (reviewError) {
        this.logger.warn('Failed to insert manual_review_queue (non-fatal)', {
          shell_file_id: shellFileId,
          error_message: reviewError.message,
        });
        // Non-fatal - continue
      }
    }
  }

  // Complete a job
  private async completeJob(jobId: string, result: any) {
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

  // Fail a job - NO fail_job RPC function exists, update directly
  private async failJob(jobId: string, errorMessage: string) {
    // Since there's no fail_job RPC, we need to update the job_queue directly
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
      .eq('worker_id', this.workerId);  // Ensure we only update jobs we own

    if (error) {
      this.logger.error('Failed to mark job as failed', error as Error, { job_id: jobId });
    }
  }

  // Update job heartbeat
  private async updateJobHeartbeat(jobId: string) {
    try {
      const { error } = await this.supabase
        .rpc('update_job_heartbeat', {
          p_job_id: jobId,
          p_worker_id: this.workerId,
        });

      if (error) {
        this.logger.error('Heartbeat failed', error as Error, { job_id: jobId });
      } else {
        this.logger.debug('Heartbeat updated', { job_id: jobId });
      }
    } catch (err) {
      this.logger.error('Heartbeat exception', err as Error, { job_id: jobId });
    }
  }

  // Start heartbeat for all active jobs
  private startHeartbeat() {
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

  // Stop the worker
  async stop() {
    this.logger.info('Stopping V3 Worker');

    // Clear heartbeat
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

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// EXPRESS SERVER (for health checks)
// =============================================================================

const app = express();
const worker = new V3Worker();

// Module-level logger for server startup/shutdown
const serverLogger = createLogger({
  context: 'server',
  worker_id: config.worker.id,
});

// Health check endpoint (required by Render.com)
app.get('/health', (_req: express.Request, res: express.Response) => {  // FIXED: Added types
  res.json({
    status: 'healthy',
    worker_id: config.worker.id,
    active_jobs: worker['activeJobs'].size,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(config.server.port, () => {
  serverLogger.info('Health check server listening', {
    port: config.server.port,
  });

  // Start worker
  worker.start().catch(error => {
    serverLogger.error('Worker failed to start', error as Error);
    process.exit(1);
  });
});

// Graceful shutdown
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