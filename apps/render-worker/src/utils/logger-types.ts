/**
 * Shared log schema for Worker (Node) and Edge Functions (Deno)
 * Ensures consistent structure across all logging systems
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface BaseLogEntry {
  // Universal fields (always present)
  timestamp: string;           // ISO 8601 format
  level: LogLevel;
  context: string;             // Component name (e.g., 'worker', 'pass1', 'ocr')
  correlation_id?: string;     // Request tracing ID
  message: string;             // Human-readable message

  // Worker-specific fields (optional)
  worker_id?: string;          // Worker identifier
  job_id?: string;             // Job queue ID

  // Healthcare-specific fields (optional, redacted)
  shell_file_id?: string;      // Document identifier
  patient_id_masked?: string;  // Masked patient ID (last 6 + hash)

  // Performance tracking (optional)
  duration_ms?: number;        // Operation duration

  // Additional context (optional, flexible)
  metadata?: Record<string, any>;  // Extra fields (error details, entity counts, etc.)
}

export interface LoggerOptions {
  context: string;              // Component name
  worker_id?: string;           // Worker identifier (if applicable)
  correlation_id?: string;      // Request correlation ID
  enable_sampling?: boolean;    // Enable log sampling for high-volume paths
  sample_rate?: number;         // Sampling rate (0.0 - 1.0, default: 1.0)
}

export interface RedactionOptions {
  patient_id?: string;          // Patient ID to mask
  ocr_text?: string;            // OCR text to truncate
  prompt?: string;              // AI prompt to truncate
  base64?: string;              // Base64 data to redact
}
