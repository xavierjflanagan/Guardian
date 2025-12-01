/**
 * Shared Type Definitions for Render Worker
 *
 * Created: 2025-12-01
 * Purpose: Common types used across the worker codebase
 */

// =============================================================================
// JOB QUEUE PAYLOAD TYPES
// =============================================================================

/**
 * Payload structure for AI processing jobs in job_queue table
 * This is the standardized format created by shell-file-processor-v3 Edge Function
 */
export interface AIProcessingJobPayload {
  shell_file_id: string;
  patient_id: string;
  storage_path: string;        // Path to file in Supabase Storage
  mime_type: string;
  file_size_bytes: number;
  uploaded_filename: string;
  correlation_id: string;
}
