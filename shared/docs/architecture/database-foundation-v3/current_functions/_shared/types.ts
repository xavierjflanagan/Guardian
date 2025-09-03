// =============================================================================
// V3 SHARED TYPES - Edge Functions TypeScript Definitions
// =============================================================================
// PURPOSE: Centralized type definitions for V3 Edge Functions
// INTEGRATION: Used by shell-file-processor-v3 and audit-logger-v3
// =============================================================================

// V3 Database Types
export interface ShellFileRecord {
  id: string;
  patient_id: string;
  filename: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  upload_status: 'uploaded' | 'processing' | 'completed' | 'failed';
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  idempotency_key: string;
  ai_confidence?: number;
  requires_review?: boolean;
  created_at: string;
  updated_at: string;
}

// V3 Job Queue Types
export interface JobPayload {
  shell_file_id: string;
  patient_id: string;
  file_path: string;
  estimated_tokens?: number;
  processing_priority?: number;
  correlation_id?: string;
}

export interface EnqueueJobResponse {
  job_id: string;
  scheduled_at: string;
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  correlation_id?: string;
}

export interface UploadProcessingResponse {
  shell_file_id: string;
  job_id: string;
  status: 'enqueued';
  estimated_processing_time?: string;
}

// Error Types
export interface ProcessingError {
  code: string;
  message: string;
  details?: Record<string, any>;
  correlation_id?: string;
}

// Request Types
export interface ShellFileUploadRequest {
  filename: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  patient_id: string;
  idempotency_key?: string;
  estimated_pages?: number;
}

// Audit Event Types
export interface AuditEventData {
  operation: string;
  table_name: string;
  record_id: string;
  job_id?: string;
  patient_id?: string;
  correlation_id?: string;
  metadata?: Record<string, any>;
}

// Usage Tracking Types
export interface UsageTrackingData {
  profile_id: string;
  shell_file_id: string;
  file_size_bytes: number;
  estimated_pages?: number;
  job_id?: string;
}

// Environment Types
export interface EdgeFunctionEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
}

// HTTP Method Types
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

// CORS Configuration
export interface CORSConfig {
  origin: string[];
  methods: HTTPMethod[];
  headers: string[];
  credentials: boolean;
}