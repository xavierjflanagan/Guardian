/**
 * Pass 1 Strategy-A Error Handler
 *
 * Created: 2025-11-29
 * Purpose: Error classification and retry logic
 * Reference: 05-hierarchical-observability-system.md Section 6
 */

// =============================================================================
// ERROR CODE TAXONOMY
// =============================================================================

/**
 * Standardized error codes across AI processing passes
 * From 05-hierarchical-observability-system.md Section 6
 */
export type ErrorCode =
  // API Errors (Section 6.1)
  | 'RATE_LIMIT'           // API rate limit exceeded (429)
  | 'API_TIMEOUT'          // Request timed out
  | 'API_5XX'              // Provider server error (500-599)
  | 'API_4XX'              // Client error (400-499, not 429)
  | 'API_AUTH'             // Authentication/authorization error
  // Processing Errors (Section 6.2)
  | 'PARSE_JSON'           // AI response not valid JSON
  | 'PARSE_SCHEMA'         // AI response doesn't match expected schema
  | 'CONTEXT_TOO_LARGE'    // Input exceeds model context limit
  | 'EMPTY_RESPONSE'       // AI returned empty/null response
  // Data Errors (Section 6.3)
  | 'OCR_QUALITY_LOW'      // OCR confidence below threshold
  | 'NO_ENTITIES_FOUND'    // No entities detected (may be valid)
  | 'ENCOUNTER_NOT_FOUND'  // Referenced encounter doesn't exist
  // System Errors (Section 6.4)
  | 'DB_ERROR'             // Database operation failed
  | 'INTERNAL_ERROR'       // Unexpected system error
  | 'MAX_RETRIES_EXCEEDED'; // Batch exhausted all retry attempts

/**
 * Retryable error codes
 */
const RETRYABLE_ERRORS: ErrorCode[] = [
  'RATE_LIMIT',
  'API_TIMEOUT',
  'API_5XX',
  'PARSE_JSON',      // Retry may get valid response
  'PARSE_SCHEMA',    // Retry may get valid response
  'EMPTY_RESPONSE',  // Retry may get valid response
  'DB_ERROR'         // Transient DB issues
];

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Classify an error into a standardized error code
 *
 * @param error - Error object from API call or processing
 * @returns Standardized error code
 */
export function classifyError(error: any): ErrorCode {
  // Handle null/undefined
  if (!error) {
    return 'INTERNAL_ERROR';
  }

  const message = (error.message || String(error)).toLowerCase();
  const status = error.status || error.statusCode || error.response?.status;

  // HTTP status code based classification
  if (status) {
    if (status === 429) return 'RATE_LIMIT';
    if (status === 401 || status === 403) return 'API_AUTH';
    if (status >= 500 && status < 600) return 'API_5XX';
    if (status >= 400 && status < 500) return 'API_4XX';
  }

  // OpenAI specific errors
  if (message.includes('rate_limit') || message.includes('rate limit') || message.includes('429')) {
    return 'RATE_LIMIT';
  }

  if (message.includes('timeout') || message.includes('timed out') || message.includes('etimedout')) {
    return 'API_TIMEOUT';
  }

  if (message.includes('context_length') || message.includes('context length') ||
      message.includes('maximum context') || message.includes('too many tokens')) {
    return 'CONTEXT_TOO_LARGE';
  }

  if (message.includes('authentication') || message.includes('unauthorized') ||
      message.includes('invalid api key') || message.includes('invalid_api_key')) {
    return 'API_AUTH';
  }

  // Network errors (treat as API_5XX - server-side issue)
  if (message.includes('econnreset') || message.includes('econnrefused') ||
      message.includes('enotfound') || message.includes('socket hang up') ||
      message.includes('network') || message.includes('connection')) {
    return 'API_5XX';
  }

  // JSON parsing errors
  if (message.includes('json') && (message.includes('parse') || message.includes('syntax') ||
      message.includes('unexpected token') || message.includes('invalid'))) {
    return 'PARSE_JSON';
  }

  // Schema validation errors
  if (message.includes('schema') || message.includes('validation') ||
      message.includes('missing required') || message.includes('invalid type')) {
    return 'PARSE_SCHEMA';
  }

  // Empty response
  if (message.includes('empty') && (message.includes('response') || message.includes('content'))) {
    return 'EMPTY_RESPONSE';
  }

  // Database errors
  if (message.includes('database') || message.includes('supabase') ||
      message.includes('postgres') || message.includes('constraint') ||
      message.includes('foreign key') || message.includes('duplicate key')) {
    return 'DB_ERROR';
  }

  // Encounter not found
  if (message.includes('encounter') && message.includes('not found')) {
    return 'ENCOUNTER_NOT_FOUND';
  }

  // OCR quality
  if (message.includes('ocr') && (message.includes('quality') || message.includes('confidence'))) {
    return 'OCR_QUALITY_LOW';
  }

  // Default to internal error
  return 'INTERNAL_ERROR';
}

/**
 * Check if an error code is retryable
 *
 * @param errorCode - Standardized error code
 * @returns True if the error is retryable
 */
export function isRetryable(errorCode: ErrorCode): boolean {
  return RETRYABLE_ERRORS.includes(errorCode);
}

/**
 * Check if an error object represents a retryable error
 *
 * @param error - Error object
 * @returns True if the error is retryable
 */
export function isErrorRetryable(error: any): boolean {
  const errorCode = classifyError(error);
  return isRetryable(errorCode);
}

// =============================================================================
// ERROR CONTEXT BUILDING
// =============================================================================

/**
 * Build error context for database storage
 * From 05-hierarchical-observability-system.md Section 6.5
 *
 * @param error - Original error
 * @param errorCode - Classified error code
 * @param attemptHistory - History of retry attempts
 * @returns Error context object safe for JSONB storage
 */
export function buildErrorContext(
  error: any,
  errorCode: ErrorCode,
  attemptHistory?: Array<{ attempt: number; error_code: string; error_message: string; timestamp: string; retry_delay_ms?: number }>
): Record<string, any> {
  const context: Record<string, any> = {
    error_code: errorCode,
    retryable: isRetryable(errorCode)
  };

  // Add HTTP status if available
  const status = error?.status || error?.statusCode || error?.response?.status;
  if (status) {
    context.http_status = status;
  }

  // Add provider info if available (from OpenAI errors)
  if (error?.error?.type) {
    context.provider_error_type = error.error.type;
  }

  // For MAX_RETRIES_EXCEEDED, include the underlying error and attempt history
  if (errorCode === 'MAX_RETRIES_EXCEEDED' && attemptHistory && attemptHistory.length > 0) {
    const lastAttempt = attemptHistory[attemptHistory.length - 1];
    context.final_underlying_error = lastAttempt.error_code;
    context.final_underlying_message = lastAttempt.error_message;
    context.attempt_history = attemptHistory;
  }

  return context;
}

// =============================================================================
// HUMAN-READABLE ERROR MESSAGES
// =============================================================================

/**
 * Get a human-readable error message for an error code
 *
 * @param errorCode - Standardized error code
 * @param additionalContext - Optional additional context
 * @returns Human-readable error message
 */
export function getErrorMessage(errorCode: ErrorCode, additionalContext?: string): string {
  const messages: Record<ErrorCode, string> = {
    'RATE_LIMIT': 'API rate limit exceeded. Request will be retried.',
    'API_TIMEOUT': 'API request timed out. Request will be retried.',
    'API_5XX': 'AI provider server error. Request will be retried.',
    'API_4XX': 'Invalid request to AI provider.',
    'API_AUTH': 'AI provider authentication failed. Check API key.',
    'PARSE_JSON': 'AI response was not valid JSON. Request will be retried.',
    'PARSE_SCHEMA': 'AI response did not match expected format. Request will be retried.',
    'CONTEXT_TOO_LARGE': 'Input text exceeds AI model context limit.',
    'EMPTY_RESPONSE': 'AI returned an empty response. Request will be retried.',
    'OCR_QUALITY_LOW': 'OCR text quality too low for reliable processing.',
    'NO_ENTITIES_FOUND': 'No clinical entities detected in document.',
    'ENCOUNTER_NOT_FOUND': 'Referenced healthcare encounter not found.',
    'DB_ERROR': 'Database operation failed. Request will be retried.',
    'INTERNAL_ERROR': 'An unexpected error occurred.',
    'MAX_RETRIES_EXCEEDED': 'Maximum retry attempts exhausted.'
  };

  let message = messages[errorCode] || 'Unknown error occurred.';

  if (additionalContext) {
    message += ` ${additionalContext}`;
  }

  return message;
}

// =============================================================================
// RETRY DELAY CALCULATION
// =============================================================================

/**
 * Calculate exponential backoff delay with full jitter
 * From AWS best practices
 *
 * @param attempt - Current attempt number (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param maxDelayMs - Maximum delay in milliseconds (default: 30000)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): number {
  // Exponential: baseDelay * 2^(attempt-1)
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);

  // Cap at max delay
  const capped = Math.min(exponential, maxDelayMs);

  // Full jitter: random value between 0 and capped
  return Math.floor(Math.random() * capped);
}

/**
 * Check if remaining job time allows for another retry
 * From 05-hierarchical-observability-system.md Section 9.4
 *
 * @param jobDeadlineMs - Job deadline timestamp in milliseconds
 * @param nextBackoffDelayMs - Next backoff delay in milliseconds
 * @param bufferMs - Safety buffer in milliseconds (default: 5000)
 * @returns True if retry is safe, false if would exceed job timeout
 */
export function canRetryWithinJobTimeout(
  jobDeadlineMs: number,
  nextBackoffDelayMs: number,
  bufferMs: number = 5000
): boolean {
  const remainingTime = jobDeadlineMs - Date.now();
  return (nextBackoffDelayMs + bufferMs) < remainingTime;
}
