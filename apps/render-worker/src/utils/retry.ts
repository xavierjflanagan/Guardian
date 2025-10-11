/**
 * Retry Utility with Exponential Backoff
 *
 * Production-grade retry logic for external API calls with:
 * - Full jitter algorithm (AWS best practice)
 * - Retry-After header support
 * - Job rescheduling for persistent transient failures
 * - Structured JSON logging
 * - Error classification (retryable vs non-retryable)
 *
 * CRITICAL FIXES IMPLEMENTED:
 * 1. Disable OpenAI SDK retries (set maxRetries: 0 in worker)
 * 2. Use reschedule_job() RPC for persistent failures
 * 3. Retry-After header support
 * 4. Full jitter algorithm
 * 5. Structured JSON logging
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxBackoffMs: number;
  operationName: string;

  // Optional context for logging and job rescheduling
  correlationId?: string;
  jobId?: string;
  shellFileId?: string;
  supabase?: SupabaseClient;
}

export interface RetryMetrics {
  attempt: number;
  totalAttempts: number;
  delayMs: number;
  errorType: string;
  errorStatus?: number;
  errorMessage: string;
  isRetryable: boolean;
}

// =============================================================================
// ENV-CONFIGURABLE RETRY CONFIGS
// =============================================================================

export const OPENAI_CONFIG: RetryOptions = {
  maxRetries: parseInt(process.env.OPENAI_RETRY_MAX || '3'),
  baseDelayMs: parseInt(process.env.OPENAI_RETRY_BASE_MS || '2000'),
  maxBackoffMs: parseInt(process.env.OPENAI_RETRY_MAX_BACKOFF_MS || '30000'),
  operationName: 'OpenAI API'
};

export const GOOGLE_VISION_CONFIG: RetryOptions = {
  maxRetries: parseInt(process.env.GOOGLE_VISION_RETRY_MAX || '3'),
  baseDelayMs: parseInt(process.env.GOOGLE_VISION_RETRY_BASE_MS || '1000'),
  maxBackoffMs: parseInt(process.env.GOOGLE_VISION_RETRY_MAX_BACKOFF_MS || '15000'),
  operationName: 'Google Vision OCR'
};

export const STORAGE_DOWNLOAD_CONFIG: RetryOptions = {
  maxRetries: parseInt(process.env.STORAGE_RETRY_MAX || '3'),
  baseDelayMs: parseInt(process.env.STORAGE_RETRY_BASE_MS || '1000'),
  maxBackoffMs: parseInt(process.env.STORAGE_RETRY_MAX_BACKOFF_MS || '10000'),
  operationName: 'Storage Download'
};

export const STORAGE_UPLOAD_CONFIG: RetryOptions = {
  maxRetries: parseInt(process.env.STORAGE_RETRY_MAX || '3'),
  baseDelayMs: parseInt(process.env.STORAGE_RETRY_BASE_MS || '1000'),
  maxBackoffMs: parseInt(process.env.STORAGE_RETRY_MAX_BACKOFF_MS || '10000'),
  operationName: 'Storage Upload'
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse Retry-After header (RFC 7231)
 *
 * @param header - Retry-After header value (seconds or HTTP date)
 * @returns Delay in milliseconds, or null if invalid
 */
function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;

  // Try as seconds (integer)
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try as HTTP date
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

/**
 * Compute full jitter delay (AWS best practice)
 *
 * Formula: random(0, min(maxBackoff, baseDelay * 2^attempt))
 *
 * @param attempt - Current retry attempt (0-indexed)
 * @param options - Retry configuration
 * @returns Delay in milliseconds
 */
function computeFullJitter(attempt: number, options: RetryOptions): number {
  const exponential = options.baseDelayMs * Math.pow(2, attempt);
  const cap = Math.min(exponential, options.maxBackoffMs);
  return Math.floor(Math.random() * cap);
}

/**
 * Check if HTTP status code is retryable
 *
 * @param status - HTTP status code
 * @returns True if retryable
 */
function shouldRetryHttpStatus(status: number): boolean {
  if (status === 429) return true;  // Rate limit
  if (status >= 500 && status < 600) return true;  // Server errors
  return false;  // Don't retry 4xx client errors
}

/**
 * Determine if error is retryable
 *
 * Retryable errors:
 * - HTTP 429 (rate limit)
 * - HTTP 5xx (server errors)
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 * - Timeout errors
 * - OpenAI specific errors (rate_limit_exceeded, service_unavailable)
 *
 * Non-retryable errors:
 * - HTTP 4xx (client errors, except 429)
 * - Validation errors
 * - Missing resources (404)
 *
 * @param error - Error object
 * @returns True if retryable
 */
export function isRetryableError(error: any): boolean {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';

  // HTTP status codes
  if (error.status) {
    return shouldRetryHttpStatus(error.status);
  }

  // Network errors
  if (
    errorCode.includes('econnreset') ||
    errorCode.includes('etimedout') ||
    errorCode.includes('enotfound') ||
    errorCode.includes('econnrefused') ||
    errorCode.includes('socket hang up')
  ) {
    return true;
  }

  // OpenAI specific errors
  if (
    errorMessage.includes('rate_limit_exceeded') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('service_unavailable') ||
    errorMessage.includes('connection_error')
  ) {
    return true;
  }

  // Generic timeout/network errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('socket')
  ) {
    return true;
  }

  return false;
}

/**
 * Log retry attempt with structured JSON
 *
 * @param level - Log level (info, warn, error)
 * @param options - Retry options
 * @param metrics - Retry metrics
 */
function logRetry(level: 'info' | 'warn' | 'error', options: RetryOptions, metrics: RetryMetrics): void {
  const logData = {
    level,
    timestamp: new Date().toISOString(),
    retry_attempt: metrics.attempt,
    max_retries: metrics.totalAttempts,
    operation: options.operationName,
    delay_ms: metrics.delayMs,
    error_type: metrics.errorType,
    error_status: metrics.errorStatus,
    error_message: metrics.errorMessage,
    is_retryable: metrics.isRetryable,
    correlation_id: options.correlationId,
    job_id: options.jobId,
    shell_file_id: options.shellFileId
  };

  // Remove undefined fields for cleaner logs
  Object.keys(logData).forEach(key => {
    if (logData[key as keyof typeof logData] === undefined) {
      delete logData[key as keyof typeof logData];
    }
  });

  if (level === 'error') {
    console.error(JSON.stringify(logData));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logData));
  } else {
    console.log(JSON.stringify(logData));
  }
}

// =============================================================================
// CORE RETRY FUNCTION
// =============================================================================

/**
 * Retry function with exponential backoff and all critical fixes
 *
 * Features:
 * - Full jitter algorithm (AWS best practice)
 * - Retry-After header support
 * - Job rescheduling for persistent transient failures
 * - Structured JSON logging
 * - Fast-fail on non-retryable errors
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Promise resolving to function result
 * @throws Error if all retries exhausted or non-retryable error
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      // Attempt the operation
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Classify error
      const isRetryable = isRetryableError(error);

      // Extract Retry-After header if available
      const retryAfterMs = parseRetryAfter(
        error.response?.headers?.get?.('retry-after') ||
        error.headers?.['retry-after']
      );

      // Fast-fail on non-retryable errors
      if (!isRetryable) {
        logRetry('error', options, {
          attempt: attempt + 1,
          totalAttempts: options.maxRetries + 1,
          delayMs: 0,
          errorType: error.constructor?.name || 'Error',
          errorStatus: error.status,
          errorMessage: error.message || String(error),
          isRetryable: false
        });
        throw error;
      }

      // Exhausted retries
      if (attempt === options.maxRetries) {
        // CRITICAL FIX #2: Reschedule job for persistent transient failures
        if (options.jobId && options.supabase) {
          try {
            await options.supabase.rpc('reschedule_job', {
              p_job_id: options.jobId,
              p_delay_seconds: 300, // 5 minutes
              p_reason: `${options.operationName} retries exhausted: ${error.message}`,
              p_add_jitter: true
            });

            logRetry('warn', options, {
              attempt: attempt + 1,
              totalAttempts: options.maxRetries + 1,
              delayMs: 300000, // 5 minutes
              errorType: 'JobRescheduled',
              errorStatus: error.status,
              errorMessage: `Job rescheduled after ${attempt + 1} retry attempts`,
              isRetryable: true
            });

            throw new Error(`${options.operationName}: Job rescheduled after ${attempt + 1} retry attempts`);
          } catch (rescheduleError: any) {
            // If rescheduling fails, log and throw original error
            console.error(JSON.stringify({
              level: 'error',
              message: 'Failed to reschedule job',
              error: rescheduleError.message,
              job_id: options.jobId,
              operation: options.operationName
            }));
          }
        }

        // No job context or rescheduling failed - throw original error
        logRetry('error', options, {
          attempt: attempt + 1,
          totalAttempts: options.maxRetries + 1,
          delayMs: 0,
          errorType: error.constructor?.name || 'Error',
          errorStatus: error.status,
          errorMessage: error.message || String(error),
          isRetryable: true
        });
        throw error;
      }

      // Calculate delay with Retry-After support and full jitter
      const baseDelay = computeFullJitter(attempt, options);
      const delay = retryAfterMs !== null
        ? Math.min(retryAfterMs, options.maxBackoffMs)
        : baseDelay;

      // Log retry attempt
      logRetry('warn', options, {
        attempt: attempt + 1,
        totalAttempts: options.maxRetries + 1,
        delayMs: delay,
        errorType: error.constructor?.name || 'Error',
        errorStatus: error.status,
        errorMessage: error.message || String(error),
        isRetryable: true
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here (loop always returns or throws)
  throw lastError;
}

// =============================================================================
// CONVENIENCE WRAPPERS
// =============================================================================

/**
 * Retry wrapper for OpenAI API calls
 *
 * CRITICAL: Ensure OpenAI client is configured with maxRetries: 0
 * to avoid retry amplification (SDK retries × our retries = 12x)
 */
export const retryOpenAI = <T>(
  fn: () => Promise<T>,
  context?: { correlationId?: string; jobId?: string; shellFileId?: string; supabase?: SupabaseClient }
) => retryWithBackoff(fn, { ...OPENAI_CONFIG, ...context });

/**
 * Retry wrapper for Google Vision OCR calls
 */
export const retryGoogleVision = <T>(
  fn: () => Promise<T>,
  context?: { correlationId?: string; jobId?: string; shellFileId?: string; supabase?: SupabaseClient }
) => retryWithBackoff(fn, { ...GOOGLE_VISION_CONFIG, ...context });

/**
 * Retry wrapper for Supabase Storage downloads
 */
export const retryStorageDownload = <T>(
  fn: () => Promise<T>,
  context?: { correlationId?: string; jobId?: string; shellFileId?: string; supabase?: SupabaseClient }
) => retryWithBackoff(fn, { ...STORAGE_DOWNLOAD_CONFIG, ...context });

/**
 * Retry wrapper for Supabase Storage uploads
 */
export const retryStorageUpload = <T>(
  fn: () => Promise<T>,
  context?: { correlationId?: string; jobId?: string; shellFileId?: string; supabase?: SupabaseClient }
) => retryWithBackoff(fn, { ...STORAGE_UPLOAD_CONFIG, ...context });
