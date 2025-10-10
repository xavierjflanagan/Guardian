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
import { calculateSHA256 } from './utils/checksum';
import { persistOCRArtifacts, loadOCRArtifacts } from './utils/ocr-persistence';

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

  // Call Google Cloud Vision API
  const response = await fetch(
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

  if (!response.ok) {
    throw new Error(`Google Vision API failed: ${response.status} ${response.statusText}`);
  }

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
  private activeJobs: Map<string, boolean> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private pass1Detector?: Pass1EntityDetector;

  constructor() {
    this.workerId = config.worker.id;
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
      console.log(`[${this.workerId}] 🔧 Pass 1 Config: model=${pass1Config.model}, max_tokens=${pass1Config.max_tokens}`);
      this.pass1Detector = new Pass1EntityDetector(pass1Config);
      console.log(`[${this.workerId}] Pass 1 Entity Detector initialized`);
    } else {
      console.warn(`[${this.workerId}] OpenAI API key not found - Pass 1 disabled`);
    }

    console.log(`[${this.workerId}] V3 Worker initialized`);
  }

  // Start the worker
  async start() {
    console.log(`[${this.workerId}] Starting V3 Worker...`);
    
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
            console.error(`[${this.workerId}] Error processing job ${job.id}:`, error);
          });
        }
        
        // Wait before next poll
        await this.sleep(config.worker.pollIntervalMs);
        
      } catch (error) {
        console.error(`[${this.workerId}] Polling error:`, error);
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
    console.log(`[${this.workerId}] RPC claim_next_job_v3 response:`, {
      hasError: !!error,
      error: error,
      dataType: typeof data,
      dataIsArray: Array.isArray(data),
      dataLength: data ? (Array.isArray(data) ? data.length : 'NOT_ARRAY') : 'NULL',
      dataValue: data
    });

    if (error) {
      console.error(`[${this.workerId}] Error claiming job:`, error);
      return null;
    }

    if (data && data.length > 0) {
      // FIXED: Function returns job_id, job_type, job_payload, retry_count
      const jobData = data[0];
      console.log(`[${this.workerId}] Job data from RPC:`, jobData);

      // Need to fetch full job details
      const { data: fullJob, error: fetchError } = await this.supabase
        .from('job_queue')
        .select('*')
        .eq('id', jobData.job_id)
        .single();

      if (fetchError || !fullJob) {
        console.error(`[${this.workerId}] Error fetching job details:`, fetchError);
        return null;
      }

      console.log(`[${this.workerId}] Claimed job ${fullJob.id} (${fullJob.job_type})`);
      return fullJob;
    }

    console.log(`[${this.workerId}] No jobs available (data empty or null)`);
    return null;
  }

  // Process a single job
  private async processJob(job: Job) {
    const jobId = job.id;
    
    // Mark job as active
    this.activeJobs.set(jobId, true);
    
    try {
      console.log(`[${this.workerId}] Processing job ${jobId}: ${job.job_name}`);
      
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
      
      console.log(`[${this.workerId}] Completed job ${jobId}`);
      
    } catch (error: any) {
      console.error(`[${this.workerId}] Job ${jobId} failed:`, error);
      
      // Mark job as failed
      await this.failJob(jobId, error.message);
      
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(jobId);
    }
  }

  // Process shell file (document upload)
  private async processShellFile(job: Job): Promise<any> {
    const { shell_file_id, patient_id } = job.job_payload;  // FIXED: Removed unused file_path
    
    console.log(`[${this.workerId}] Processing shell file ${shell_file_id}`);
    
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

    console.log(`[${this.workerId}] Processing AI job for shell_file ${payload.shell_file_id}`);
    console.log(`[${this.workerId}] - Storage path: ${payload.storage_path}`);
    console.log(`[${this.workerId}] - File size: ${payload.file_size_bytes} bytes`);
    console.log(`[${this.workerId}] - MIME type: ${payload.mime_type}`);

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

    // NEW: Download file from storage
    const { data: fileBlob, error: downloadError } = await this.supabase.storage
      .from('medical-docs')
      .download(payload.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
    }

    // NEW: Calculate checksum for integrity verification
    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
    const fileChecksum = await calculateSHA256(fileBuffer);
    console.log(`[${this.workerId}] File checksum: ${fileChecksum}`);

    // NEW: Check for existing OCR artifacts (reuse if available)
    let ocrResult = await loadOCRArtifacts(this.supabase, payload.shell_file_id);
    
    if (ocrResult) {
      console.log(`[${this.workerId}] Reusing existing OCR artifacts for shell_file ${payload.shell_file_id}`);
    } else {
      // NEW: Run OCR processing (moved from Edge Function)
      console.log(`[${this.workerId}] Running OCR processing for shell_file ${payload.shell_file_id}`);
      const base64Data = fileBuffer.toString('base64');
      const ocrSpatialData = await processWithGoogleVisionOCR(base64Data, payload.mime_type);
      
      // Transform to expected OCR result format
      ocrResult = {
        pages: [{
          page_number: 1,
          size: { width_px: 1000, height_px: 1000 }, // Default values
          lines: ocrSpatialData.spatial_mapping.map((item, idx) => ({
            text: item.text,
            bbox: {
              x: item.bounding_box.x,
              y: item.bounding_box.y,
              w: item.bounding_box.width,
              h: item.bounding_box.height
            },
            bbox_norm: {
              x: item.bounding_box.x / 1000,
              y: item.bounding_box.y / 1000,
              w: item.bounding_box.width / 1000,
              h: item.bounding_box.height / 1000
            },
            confidence: item.confidence,
            reading_order: idx
          })),
          tables: [], // No table detection in current implementation
          provider: ocrSpatialData.ocr_provider,
          processing_time_ms: ocrSpatialData.processing_time_ms
        }]
      };

      // NEW: Persist OCR artifacts for future reuse
      await persistOCRArtifacts(
        this.supabase,
        payload.shell_file_id,
        payload.patient_id,
        ocrResult,
        fileChecksum
      );
      console.log(`[${this.workerId}] OCR artifacts persisted for shell_file ${payload.shell_file_id}`);
    }

    // Build Pass1Input from storage-based payload + OCR result
    const pass1Input: Pass1Input = {
      shell_file_id: payload.shell_file_id,
      patient_id: payload.patient_id,
      processing_session_id: `session_${payload.shell_file_id}_${Date.now()}`,
      raw_file: {
        file_data: fileBuffer.toString('base64'),
        file_type: payload.mime_type,
        filename: payload.uploaded_filename,
        file_size: payload.file_size_bytes
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
    console.log(`[${this.workerId}] Starting Pass 1 entity detection with storage-based input`);
    return await this.processPass1EntityDetection({ ...job, job_payload: pass1Input });
  }

  // Process Pass 1 Entity Detection
  private async processPass1EntityDetection(job: Job): Promise<any> {
    if (!this.pass1Detector) {
      throw new Error('Pass 1 detector not initialized - OpenAI API key may be missing');
    }

    const payload = job.job_payload as Pass1Input;

    console.log(`[${this.workerId}] Starting Pass 1 entity detection for shell_file ${payload.shell_file_id}`);
    console.log(`[${this.workerId}] - Processing session: ${payload.processing_session_id}`);
    console.log(`[${this.workerId}] - OCR extracted text length: ${payload.ocr_spatial_data.extracted_text.length}`);
    console.log(`[${this.workerId}] - Spatial mapping elements: ${payload.ocr_spatial_data.spatial_mapping.length}`);

    // Run Pass 1 processing
    const result = await this.pass1Detector.processDocument(payload);

    if (!result.success) {
      throw new Error(`Pass 1 processing failed: ${result.error}`);
    }

    console.log(`[${this.workerId}] Pass 1 detected ${result.total_entities_detected} entities`);
    console.log(`[${this.workerId}] - Clinical events: ${result.entities_by_category.clinical_event}`);
    console.log(`[${this.workerId}] - Healthcare context: ${result.entities_by_category.healthcare_context}`);
    console.log(`[${this.workerId}] - Document structure: ${result.entities_by_category.document_structure}`);

    // Get ALL Pass 1 database records (7 tables)
    console.log(`[${this.workerId}] Building Pass 1 database records (7 tables)...`);
    const dbRecords = await this.pass1Detector.getAllDatabaseRecords(payload);

    // Insert into ALL 7 Pass 1 tables
    await this.insertPass1DatabaseRecords(dbRecords, payload.shell_file_id);

    console.log(`[${this.workerId}] Pass 1 complete - inserted records into 7 tables`);
    console.log(`[${this.workerId}] - entity_processing_audit: ${result.records_created.entity_audit}`);
    console.log(`[${this.workerId}] - ai_confidence_scoring: ${result.records_created.confidence_scoring}`);
    console.log(`[${this.workerId}] - manual_review_queue: ${result.records_created.manual_review_queue}`);

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
      console.warn(`[${this.workerId}] Failed to update shell_files:`, shellError);
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
        console.warn(`[${this.workerId}] Failed to insert ai_confidence_scoring:`, confidenceError);
        // Non-fatal - continue
      }
    }

    // 7. INSERT manual_review_queue (optional - may be empty)
    if (records.manual_review_queue.length > 0) {
      const { error: reviewError } = await this.supabase
        .from('manual_review_queue')
        .insert(records.manual_review_queue);

      if (reviewError) {
        console.warn(`[${this.workerId}] Failed to insert manual_review_queue:`, reviewError);
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
        last_error: errorMessage,
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
      console.error(`[${this.workerId}] Failed to mark job as failed:`, error);
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
        console.error(`[${this.workerId}] HEARTBEAT FAILED for job ${jobId}:`, error);
      } else {
        if (config.environment.verbose) {
          console.log(`[${this.workerId}] Heartbeat updated for job ${jobId}`);
        }
      }
    } catch (err) {
      console.error(`[${this.workerId}] HEARTBEAT EXCEPTION for job ${jobId}:`, err);
    }
  }

  // Start heartbeat for all active jobs
  private startHeartbeat() {
    console.log(`[${this.workerId}] Starting heartbeat interval (every ${config.worker.heartbeatIntervalMs}ms)`);
    this.heartbeatInterval = setInterval(async () => {
      const activeJobCount = this.activeJobs.size;
      if (activeJobCount > 0) {
        console.log(`[${this.workerId}] Heartbeat tick: ${activeJobCount} active job(s)`);
        for (const jobId of this.activeJobs.keys()) {
          await this.updateJobHeartbeat(jobId);
        }
      }
    }, config.worker.heartbeatIntervalMs);
  }

  // Stop the worker
  async stop() {
    console.log(`[${this.workerId}] Stopping V3 Worker...`);
    
    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Wait for active jobs to complete
    while (this.activeJobs.size > 0) {
      console.log(`[${this.workerId}] Waiting for ${this.activeJobs.size} jobs to complete...`);
      await this.sleep(1000);
    }
    
    console.log(`[${this.workerId}] V3 Worker stopped`);
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
  console.log(`Health check server listening on port ${config.server.port}`);
  
  // Start worker
  worker.start().catch(error => {
    console.error('Worker failed to start:', error);
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});