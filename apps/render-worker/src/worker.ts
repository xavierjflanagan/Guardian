// =============================================================================
// V3 BACKGROUND JOB PROCESSING WORKER FOR RENDER.COM
// =============================================================================
// Purpose: Process queued jobs from V3 job_queue table
// Primary focus: Document processing with AI (OCR + medical data extraction)
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';

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
// WORKER CLASS
// =============================================================================

class V3Worker {
  private supabase: SupabaseClient;
  private workerId: string;
  private activeJobs: Map<string, boolean> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;

  constructor() {
    this.workerId = config.worker.id;
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
    
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
        p_job_types: ['shell_file_processing'], // Start with document processing
        p_job_lanes: null  // Optional parameter
      });
    
    if (error) {
      console.error(`[${this.workerId}] Error claiming job:`, error);
      return null;
    }
    
    if (data && data.length > 0) {
      // FIXED: Function returns job_id, job_type, job_payload, retry_count
      const jobData = data[0];
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

  // Process AI job
  private async processAIJob(job: Job): Promise<any> {
    // TODO: Implement AI processing
    console.log(`[${this.workerId}] Processing AI job ${job.id}`);
    await this.sleep(3000);
    
    return {
      status: 'completed',
      message: 'AI processing completed (simulation)',
    };
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
    const { error } = await this.supabase
      .rpc('update_job_heartbeat', {
        p_job_id: jobId,
        p_worker_id: this.workerId,
      });
    
    if (error) {
      console.error(`[${this.workerId}] Failed to update heartbeat:`, error);
    }
  }

  // Start heartbeat for all active jobs
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      for (const jobId of this.activeJobs.keys()) {
        await this.updateJobHeartbeat(jobId);
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