// =============================================================================
// V3 ERROR HANDLING - Edge Functions Error Processing
// =============================================================================
// PURPOSE: Standardized error handling and response formatting for V3 Edge Functions
// HEALTHCARE: Includes PII-safe error logging for medical data compliance
// =============================================================================

import { APIResponse, ProcessingError } from './types.ts';

/**
 * Standard error codes for V3 Edge Functions
 */
export enum ErrorCode {
  // Validation Errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  
  // Authentication/Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_PATIENT_ACCESS = 'INVALID_PATIENT_ACCESS',
  
  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  
  // Processing Errors
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  JOB_ENQUEUE_FAILED = 'JOB_ENQUEUE_FAILED',
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  
  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: ProcessingError,
  statusCode: number = 400,
  correlationId?: string
): Response {
  const response: APIResponse = {
    success: false,
    error: error.message,
    correlation_id: correlationId || error.correlation_id,
  };
  
  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId || error.correlation_id || '',
    },
  });
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(
  data: T,
  correlationId?: string,
  statusCode: number = 200
): Response {
  const response: APIResponse<T> = {
    success: true,
    data,
    correlation_id: correlationId,
  };
  
  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId || '',
    },
  });
}

/**
 * Handle and log errors with PII safety
 */
export function handleError(
  error: unknown,
  context: string,
  correlationId?: string
): ProcessingError {
  console.error(`[${context}] Error (${correlationId}):`, error);
  
  let processedError: ProcessingError;
  
  if (error instanceof Error) {
    processedError = {
      code: ErrorCode.INTERNAL_ERROR,
      message: sanitizeErrorMessage(error.message),
      correlation_id: correlationId,
      details: {
        context,
        timestamp: new Date().toISOString(),
      },
    };
  } else if (typeof error === 'string') {
    processedError = {
      code: ErrorCode.INTERNAL_ERROR,
      message: sanitizeErrorMessage(error),
      correlation_id: correlationId,
      details: { context },
    };
  } else {
    processedError = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      correlation_id: correlationId,
      details: { context },
    };
  }
  
  return processedError;
}

/**
 * Sanitize error messages to remove potential PII
 */
function sanitizeErrorMessage(message: string): string {
  // Remove email addresses
  message = message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove phone numbers (basic patterns)
  message = message.replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]');
  message = message.replace(/\(\d{3}\)\s*\d{3}-\d{4}/g, '[PHONE]');
  
  // Remove UUIDs (might contain sensitive IDs)
  message = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]');
  
  // Remove file paths that might contain usernames
  message = message.replace(/\/Users\/[^\/\s]+/g, '/Users/[USER]');
  message = message.replace(/C:\\Users\\[^\\s]+/g, 'C:\\Users\\[USER]');
  
  return message;
}

/**
 * Validate request method
 */
export function validateMethod(request: Request, allowedMethods: string[]): ProcessingError | null {
  if (!allowedMethods.includes(request.method)) {
    return {
      code: ErrorCode.INVALID_REQUEST,
      message: `Method ${request.method} not allowed. Allowed: ${allowedMethods.join(', ')}`,
    };
  }
  return null;
}

/**
 * Extract correlation ID from request headers
 */
export function getCorrelationId(request: Request): string {
  return request.headers.get('x-correlation-id') || 
         request.headers.get('X-Correlation-ID') || 
         crypto.randomUUID();
}

/**
 * Extract idempotency key from request headers
 */
export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get('x-idempotency-key') || 
         request.headers.get('X-Idempotency-Key');
}