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
import { downscaleImageBase64 } from './utils/image-processing';
import { retryGoogleVision, retryStorageDownload, retryStorageUpload } from './utils/retry';
import { createLogger, maskPatientId, Logger } from './utils/logger';

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

  // Extract full text
  const extractedText = annotation.text || '';

  // Build spatial mapping from pages
  const spatialMapping: OCRSpatialData['spatial_mapping'] = [];
  
  // Process pages and blocks
  if (annotation.pages) {
    for (const page of annotation.pages) {
      if (page.blocks) {
        for (const block of page.blocks) {
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

    // Phase 2: Track processed image state for analytics
    let processed = { b64: fileBuffer.toString('base64'), width: 0, height: 0, outMime: payload.mime_type };

    if (ocrResult) {
      this.logger.info('Reusing existing OCR artifacts', {
        shell_file_id: payload.shell_file_id,
      });
    } else {
      // Phase 2: Image downscaling before OCR
      // Check for emergency bypass (future format conversion integration point)
      const BYPASS_DOWNSCALING = process.env.BYPASS_IMAGE_DOWNSCALING === 'true';
      const isImageOrPDF = /^(image\/|application\/pdf)/.test(payload.mime_type);

      if (isImageOrPDF && !BYPASS_DOWNSCALING) {
        this.logger.info('Phase 2: Processing image/PDF before OCR', {
          shell_file_id: payload.shell_file_id,
          mime_type: payload.mime_type,
        });

        try {
          processed = await downscaleImageBase64(processed.b64, payload.mime_type, 1600, 78, this.logger['correlation_id']);

          if (processed.width && processed.height) {
            this.logger.info('Image downscaled', {
              shell_file_id: payload.shell_file_id,
              width: processed.width,
              height: processed.height,
              output_mime: processed.outMime,
            });
          } else {
            this.logger.info('Image processed without dimensions', {
              shell_file_id: payload.shell_file_id,
              output_mime: processed.outMime,
            });
          }
        } catch (error: any) {
          // Handle unsupported formats gracefully
          if (error.message.includes('not yet supported') || error.message.includes('planned for Phase')) {
            this.logger.info('Unsupported format for downscaling', {
              shell_file_id: payload.shell_file_id,
              mime_type: payload.mime_type,
              error_message: error.message,
            });
            // Continue with original file for now
            processed = { b64: fileBuffer.toString('base64'), width: 0, height: 0, outMime: payload.mime_type };
          } else {
            throw error; // Re-throw unexpected errors
          }
        }
      } else if (BYPASS_DOWNSCALING) {
        this.logger.info('Image downscaling bypassed via BYPASS_IMAGE_DOWNSCALING flag', {
          shell_file_id: payload.shell_file_id,
        });
      } else {
        this.logger.debug('Non-image file, skipping downscaling', {
          shell_file_id: payload.shell_file_id,
          mime_type: payload.mime_type,
        });
      }

      // NEW: Run OCR processing (moved from Edge Function)
      this.logger.info('Running OCR processing', {
        shell_file_id: payload.shell_file_id,
        output_mime: processed.outMime,
      });
      const ocrSpatialData = await processWithGoogleVisionOCR(processed.b64, processed.outMime);

      // Transform to expected OCR result format
      // GUARDRAIL: Skip normalization if dimensions missing
      if (processed.width === 0 || processed.height === 0) {
        this.logger.warn('Missing processed image dimensions, skipping bbox normalization', {
          shell_file_id: payload.shell_file_id,
        });
        // Use raw OCR bounding boxes without normalization
        ocrResult = {
          pages: [{
            page_number: 1,
            size: { width_px: 0, height_px: 0 }, // Indicate no normalization
            lines: ocrSpatialData.spatial_mapping.map((item, idx) => ({
              text: item.text,
              bbox: {
                x: item.bounding_box.x,
                y: item.bounding_box.y,
                w: item.bounding_box.width,
                h: item.bounding_box.height
              },
              bbox_norm: null, // Skip normalization
              confidence: item.confidence,
              reading_order: idx
            })),
            tables: [],
            provider: ocrSpatialData.ocr_provider,
            processing_time_ms: ocrSpatialData.processing_time_ms
          }]
        };
      } else {
        // Normal normalization with actual dimensions
        const pageWidth = processed.width;
        const pageHeight = processed.height;
        
        ocrResult = {
          pages: [{
            page_number: 1,
            size: { width_px: pageWidth, height_px: pageHeight },
            lines: ocrSpatialData.spatial_mapping.map((item, idx) => ({
              text: item.text,
              bbox: {
                x: item.bounding_box.x,
                y: item.bounding_box.y,
                w: item.bounding_box.width,
                h: item.bounding_box.height
              },
              bbox_norm: {
                x: item.bounding_box.x / pageWidth,
                y: item.bounding_box.y / pageHeight,
                w: item.bounding_box.width / pageWidth,
                h: item.bounding_box.height / pageHeight
              },
              confidence: item.confidence,
              reading_order: idx
            })),
            tables: [],
            provider: ocrSpatialData.ocr_provider,
            processing_time_ms: ocrSpatialData.processing_time_ms
          }]
        };
      }

      // NEW: Persist OCR artifacts for future reuse
      await persistOCRArtifacts(
        this.supabase,
        payload.shell_file_id,
        payload.patient_id,
        ocrResult,
        fileChecksum,
        this.logger['correlation_id']
      );
      
      // IDEMPOTENCY: Store processed image with checksum caching
      if (isImageOrPDF && processed.width && processed.height) {
        const processedBuf = Buffer.from(processed.b64, 'base64');
        const processedChecksum = await calculateSHA256(processedBuf);
        
        // Check if already processed (avoid redundant uploads)
        const { data: sf } = await this.supabase
          .from('shell_files')
          .select('processed_image_checksum')
          .eq('id', payload.shell_file_id)
          .single();
        
        if (sf?.processed_image_checksum !== processedChecksum) {
          // STORAGE HYGIENE: Deterministic path with sanitized segments
          const sanitizedPatientId = payload.patient_id.replace(/[^a-zA-Z0-9-_]/g, '');
          const sanitizedFileId = payload.shell_file_id.replace(/[^a-zA-Z0-9-_]/g, '');
          
          // Deterministic extension based on outMime
          const ext = processed.outMime === 'image/png' ? '.png' : 
                       processed.outMime === 'image/webp' ? '.webp' : 
                       processed.outMime === 'image/tiff' ? '.tiff' : '.jpg';
          const processedPath = `${sanitizedPatientId}/${sanitizedFileId}-processed${ext}`;

          const uploadResult = await retryStorageUpload(async () => {
            return await this.supabase.storage
              .from('medical-docs')
              .upload(processedPath, processedBuf, {
                contentType: processed.outMime,
                upsert: true  // Overwrite if exists
              });
          });

          if (uploadResult.error) {
            const error: any = new Error(`Failed to upload processed image: ${uploadResult.error.message}`);
            error.status = 500;
            throw error;
          }
          
          // Update metadata
          await this.supabase
            .from('shell_files')
            .update({
              processed_image_path: processedPath,
              processed_image_checksum: processedChecksum,
              processed_image_mime: processed.outMime
            })
            .eq('id', payload.shell_file_id);


          this.logger.info('Stored processed image', {
            shell_file_id: payload.shell_file_id,
            processed_path: processedPath,
            output_mime: processed.outMime,
          });
        } else {
          this.logger.debug('Processed image unchanged (checksum match), skipping upload', {
            shell_file_id: payload.shell_file_id,
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
        ai_model_name: 'gpt-4o',
        workflow_step: 'pass_0_5_encounter_discovery',
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
    // PASS 1: ENTITY DETECTION (existing code continues)
    // =============================================================================

    // Build Pass1Input from storage-based payload + OCR result
    // Phase 2: Use processed file size for accurate analytics when downscaled
    const processedBuffer = processed?.b64 ? Buffer.from(processed.b64, 'base64') : fileBuffer;
    const pass1Input: Pass1Input = {
      shell_file_id: payload.shell_file_id,
      patient_id: payload.patient_id,
      processing_session_id: processingSessionId,  // Reuse Pass 0.5 session ID
      raw_file: {
        file_data: processed?.b64 ?? fileBuffer.toString('base64'),
        file_type: processed?.outMime ?? payload.mime_type,
        filename: payload.uploaded_filename,
        file_size: processedBuffer.length  // Use actual processed buffer size
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
    // 1. INSERT ai_processing_sessions
    const { error: sessionError } = await this.supabase
      .from('ai_processing_sessions')
      .insert(records.ai_processing_session);

    if (sessionError) {
      throw new Error(`Failed to insert ai_processing_sessions: ${sessionError.message}`);
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