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
export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxBackoffMs: number;
    operationName: string;
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
export declare const OPENAI_CONFIG: RetryOptions;
export declare const GOOGLE_VISION_CONFIG: RetryOptions;
export declare const STORAGE_DOWNLOAD_CONFIG: RetryOptions;
export declare const STORAGE_UPLOAD_CONFIG: RetryOptions;
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
export declare function isRetryableError(error: any): boolean;
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
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
/**
 * Retry wrapper for OpenAI API calls
 *
 * CRITICAL: Ensure OpenAI client is configured with maxRetries: 0
 * to avoid retry amplification (SDK retries × our retries = 12x)
 */
export declare const retryOpenAI: <T>(fn: () => Promise<T>, context?: {
    correlationId?: string;
    jobId?: string;
    shellFileId?: string;
    supabase?: SupabaseClient;
}) => Promise<T>;
/**
 * Retry wrapper for Google Vision OCR calls
 */
export declare const retryGoogleVision: <T>(fn: () => Promise<T>, context?: {
    correlationId?: string;
    jobId?: string;
    shellFileId?: string;
    supabase?: SupabaseClient;
}) => Promise<T>;
/**
 * Retry wrapper for Supabase Storage downloads
 */
export declare const retryStorageDownload: <T>(fn: () => Promise<T>, context?: {
    correlationId?: string;
    jobId?: string;
    shellFileId?: string;
    supabase?: SupabaseClient;
}) => Promise<T>;
/**
 * Retry wrapper for Supabase Storage uploads
 */
export declare const retryStorageUpload: <T>(fn: () => Promise<T>, context?: {
    correlationId?: string;
    jobId?: string;
    shellFileId?: string;
    supabase?: SupabaseClient;
}) => Promise<T>;
//# sourceMappingURL=retry.d.ts.map