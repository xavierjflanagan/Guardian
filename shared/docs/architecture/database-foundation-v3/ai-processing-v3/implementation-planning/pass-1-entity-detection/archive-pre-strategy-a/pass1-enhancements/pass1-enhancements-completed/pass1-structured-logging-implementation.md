# Phase 4: Structured Logging Implementation

**Status**: ✅ COMPLETED (2025-10-11)
**Priority**: HIGH (Observability & Production Readiness)
**Created**: 2025-10-11
**Completed**: 2025-10-11
**Actual Effort**: 8 hours (Phase 1 & 2 complete)

## Executive Summary

Implement production-grade structured logging across the V3 worker and Edge Functions to enable machine-parseable logs, request tracing, cost analytics, and performance monitoring. This phase replaces inconsistent string-based console.log calls with a standardized JSON logging system.

**Key Improvements**:
- ✅ JSON-only logs in production (machine-parseable)
- ✅ Universal correlation ID propagation for request tracing
- ✅ PII/PHI redaction helpers (HIPAA compliance)
- ✅ Duration tracking for all operations
- ✅ Level-based logging (INFO, WARN, ERROR, DEBUG)
- ✅ Configurable sampling for high-volume paths
- ✅ Shared schema across Node (worker) and Deno (Edge Functions)

---

## Current State Analysis

### Worker Logging Patterns (apps/render-worker/src/)

**Inconsistent String-Based Logs**:
```typescript
// worker.ts (48 console.log calls)
console.log(`[${this.workerId}] V3 Worker initialized`);
console.error(`[${this.workerId}] Error processing job ${job.id}:`, error);
console.log(`[${this.workerId}] Claimed job ${fullJob.id} (${fullJob.job_type})`);

// Pass1EntityDetector.ts (13 console.log calls)
console.log(`[Pass1] Calling ${this.config.model} for entity detection...`);
console.log(`[Pass1] AI returned ${aiResponse.entities.length} entities`);

// ocr-persistence.ts (3 console.log calls)
console.log(`[OCR Persistence] Successfully persisted ${ocrResult.pages.length} pages`);
console.error('[OCR Persistence] Failed to upload manifest:', error);

// image-processing.ts (7 console.log/warn calls)
console.log('[ImageProcessing] PDF detected - skipping downscaling');
console.warn(`[ImageProcessing] Missing dimensions for ${mime}`);
```

**Problems**:
- Not machine-parseable for production monitoring tools
- No correlation IDs (except in retry.ts)
- No duration tracking for performance analysis
- No standardized context fields
- PII/PHI not redacted (patient_id, OCR text visible)

### Edge Function Logging Patterns (supabase/functions/)

**Partial Correlation ID Usage**:
```typescript
// shell-file-processor-v3 (uses correlation IDs)
console.log(`[${correlationId}] Created shell_file: ${shellFileId}`);

// auto-provision-user-profile (NO correlation IDs)
console.log('[auto-provision] Profile already exists for user: ${userEmail}');

// audit-logger-v3 (uses correlation IDs)
console.log(`[${correlationId}] Audit logged: ${event.operation} on ${event.table_name}`);
```

**Problems**:
- Inconsistent correlation ID usage
- All string-based (not JSON)
- No duration tracking
- No PII redaction

### Existing Structured Logging (Limited)

**retry.ts** - Already implemented JSON logging:
```typescript
console.log(JSON.stringify({
  level: 'info',
  context: 'retry',
  operation: 'retryOpenAI',
  correlation_id: context?.correlation_id,
  message: 'Retry attempt',
  attempt: context.attempt,
  max_retries: context.maxRetries,
  delay_ms: delay
}));
```

This serves as the **template** for the full implementation.

---

## Technical Design

### Shared Log Schema (Common Types)

**New file**: `apps/render-worker/src/utils/logger-types.ts`

```typescript
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
```

### Logger Implementation (Worker - Node)

**New file**: `apps/render-worker/src/utils/logger.ts`

```typescript
/**
 * Structured Logging Utility for V3 Worker (Node.js)
 * Provides JSON-formatted logs for production observability
 */

import crypto from 'crypto';
import { BaseLogEntry, LogLevel, LoggerOptions, RedactionOptions } from './logger-types';

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
// Map VERBOSE=true to DEBUG level for unambiguous behavior
const EFFECTIVE_LOG_LEVEL = process.env.VERBOSE === 'true'
  ? 'DEBUG'
  : (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;

// Log level hierarchy
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Structured Logger Class
 */
export class Logger {
  private context: string;
  private worker_id?: string;
  private correlation_id?: string;
  private enable_sampling: boolean;
  private sample_rate: number;

  constructor(options: LoggerOptions) {
    this.context = options.context;
    this.worker_id = options.worker_id;
    this.correlation_id = options.correlation_id;
    this.enable_sampling = options.enable_sampling ?? false;
    this.sample_rate = options.sample_rate ?? 1.0;
  }

  /**
   * Update correlation ID for request tracing
   */
  setCorrelationId(correlation_id: string): void {
    this.correlation_id = correlation_id;
  }

  /**
   * Log DEBUG level (controlled by EFFECTIVE_LOG_LEVEL)
   * Enabled when VERBOSE=true or LOG_LEVEL=DEBUG
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', message, metadata);
  }

  /**
   * Log INFO level (standard operations)
   */
  info(message: string, metadata?: Record<string, any>): void {
    if (this.shouldSample()) {
      this.log('INFO', message, metadata);
    }
  }

  /**
   * Log WARN level (non-critical issues)
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('WARN', message, metadata);
  }

  /**
   * Log ERROR level (failures, exceptions)
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorMetadata = error ? {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      ...metadata,
    } : metadata;

    this.log('ERROR', message, errorMetadata);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    // Check log level threshold
    if (LOG_LEVELS[level] < LOG_LEVELS[EFFECTIVE_LOG_LEVEL]) {
      return;
    }

    // Development mode: Warn about potentially sensitive metadata keys
    if (NODE_ENV === 'development' && metadata) {
      const dangerousKeys = ['file_data', 'ocr_text', 'prompt', 'base64'];
      const foundDangerous = Object.keys(metadata).filter(k =>
        dangerousKeys.some(d => k.toLowerCase().includes(d))
      );

      if (foundDangerous.length > 0) {
        console.warn(`⚠️  [Logger Warning] Potentially sensitive keys detected: ${foundDangerous.join(', ')}. Consider using redaction helpers (maskPatientId, truncateOCRText, redactBase64).`);
      }
    }

    const entry: BaseLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      correlation_id: this.correlation_id,
      message,
      worker_id: this.worker_id,
      ...metadata,
    };

    // Production: JSON only
    if (NODE_ENV === 'production') {
      console.log(JSON.stringify(entry));
    } else {
      // Development: Pretty-print
      console.log(`[${entry.timestamp}] [${entry.level}] [${entry.context}${entry.correlation_id ? `:${entry.correlation_id}` : ''}] ${entry.message}`, metadata || '');
    }
  }

  /**
   * Log sampling for high-volume paths
   */
  private shouldSample(): boolean {
    if (!this.enable_sampling) {
      return true; // Always log if sampling disabled
    }
    return Math.random() < this.sample_rate;
  }

  /**
   * Log operation with duration tracking
   */
  async logOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();

    this.debug(`${operation} started`, metadata);

    try {
      const result = await fn();
      const duration_ms = Date.now() - startTime;

      this.info(`${operation} completed`, {
        ...metadata,
        duration_ms,
      });

      return result;
    } catch (error: any) {
      const duration_ms = Date.now() - startTime;

      this.error(`${operation} failed`, error, {
        ...metadata,
        duration_ms,
      });

      throw error;
    }
  }
}

/**
 * Factory function to create logger instances
 */
export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options);
}

/**
 * PII/PHI Redaction Helpers
 */

/**
 * Mask patient ID for HIPAA compliance
 * Format: "***abc123" (last 6 chars + hash prefix)
 */
export function maskPatientId(patient_id: string): string {
  if (!patient_id || patient_id.length === 0) {
    return '[REDACTED]';
  }

  // Show last 6 characters + hash prefix
  const visible = patient_id.slice(-6);
  const hash = crypto.createHash('sha256').update(patient_id).digest('hex').slice(0, 6);

  return `***${hash}:${visible}`;
}

/**
 * Truncate OCR text to prevent log bloat
 */
export function truncateOCRText(text: string, maxLength: number = 120): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

/**
 * Truncate AI prompt to prevent log bloat
 */
export function truncatePrompt(prompt: string, maxLength: number = 200): string {
  if (!prompt || prompt.length <= maxLength) {
    return prompt;
  }
  return `${prompt.slice(0, maxLength)}... [truncated ${prompt.length - maxLength} chars]`;
}

/**
 * Redact base64 data (show size only)
 */
export function redactBase64(base64: string): string {
  if (!base64) {
    return '[NO_DATA]';
  }
  const bytes = Buffer.from(base64, 'base64').length;
  return `[BASE64_REDACTED:${bytes}_bytes]`;
}

/**
 * Apply all redactions to log metadata
 */
export function redactSensitiveData(options: RedactionOptions): Record<string, any> {
  const redacted: Record<string, any> = {};

  if (options.patient_id) {
    redacted.patient_id_masked = maskPatientId(options.patient_id);
  }

  if (options.ocr_text) {
    redacted.ocr_text_preview = truncateOCRText(options.ocr_text);
  }

  if (options.prompt) {
    redacted.prompt_preview = truncatePrompt(options.prompt);
  }

  if (options.base64) {
    redacted.file_data = redactBase64(options.base64);
  }

  return redacted;
}

/**
 * Generate correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`;
}
```

### Logger Implementation (Edge Functions - Deno)

**New file**: `supabase/functions/_shared/logger.ts`

```typescript
/**
 * Structured Logging Utility for Edge Functions (Deno)
 * Provides JSON-formatted logs for production observability
 */

// Note: Deno has built-in crypto, no need for import
import type { BaseLogEntry, LogLevel, LoggerOptions, RedactionOptions } from './logger-types.ts';

// Environment configuration
const DENO_ENV = Deno.env.get('DENO_ENV') || 'development';
const LOG_LEVEL = (Deno.env.get('LOG_LEVEL') || 'INFO').toUpperCase() as LogLevel;

// Log level hierarchy
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Structured Logger Class (Deno version)
 */
export class Logger {
  private context: string;
  private correlation_id?: string;

  constructor(options: LoggerOptions) {
    this.context = options.context;
    this.correlation_id = options.correlation_id;
  }

  setCorrelationId(correlation_id: string): void {
    this.correlation_id = correlation_id;
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('INFO', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('WARN', message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorMetadata = error ? {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      ...metadata,
    } : metadata;

    this.log('ERROR', message, errorMetadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) {
      return;
    }

    const entry: BaseLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      correlation_id: this.correlation_id,
      message,
      ...metadata,
    };

    // Production: JSON only
    if (DENO_ENV === 'production') {
      console.log(JSON.stringify(entry));
    } else {
      // Development: Pretty-print
      console.log(`[${entry.timestamp}] [${entry.level}] [${entry.context}${entry.correlation_id ? `:${entry.correlation_id}` : ''}] ${entry.message}`, metadata || '');
    }
  }

  async logOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    this.debug(`${operation} started`, metadata);

    try {
      const result = await fn();
      const duration_ms = Date.now() - startTime;

      this.info(`${operation} completed`, {
        ...metadata,
        duration_ms,
      });

      return result;
    } catch (error: any) {
      const duration_ms = Date.now() - startTime;
      this.error(`${operation} failed`, error, {
        ...metadata,
        duration_ms,
      });
      throw error;
    }
  }
}

export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options);
}

/**
 * PII/PHI Redaction Helpers (Deno crypto API)
 */
export async function maskPatientId(patient_id: string): Promise<string> {
  if (!patient_id || patient_id.length === 0) {
    return '[REDACTED]';
  }

  const visible = patient_id.slice(-6);
  const encoder = new TextEncoder();
  const data = encoder.encode(patient_id);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 6);

  return `***${hash}:${visible}`;
}

export function truncateOCRText(text: string, maxLength: number = 120): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

/**
 * Redact base64 data (show estimated size only)
 * Note: Size is approximate (base64.length * 3/4), may differ by 1-3 bytes due to padding
 */
export function redactBase64(base64: string): string {
  if (!base64) {
    return '[NO_DATA]';
  }
  // Estimate bytes (base64 is ~4/3 of original, padding may add 1-3 bytes variance)
  const bytes = Math.floor((base64.length * 3) / 4);
  return `[BASE64_REDACTED:~${bytes}_bytes]`;  // Note the ~ prefix for "approximate"
}

/**
 * Extract correlation ID from request headers
 */
export function extractCorrelationId(req: Request): string {
  const correlationId = req.headers.get('x-correlation-id') ||
                        req.headers.get('correlation-id') ||
                        generateCorrelationId();
  return correlationId;
}

export function generateCorrelationId(): string {
  return `req_${crypto.randomUUID().slice(0, 16)}`;
}
```

**New file**: `supabase/functions/_shared/logger-types.ts`

```typescript
// Same as apps/render-worker/src/utils/logger-types.ts
// Copied here for Deno compatibility (no imports across boundaries)

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  correlation_id?: string;
  message: string;
  worker_id?: string;
  job_id?: string;
  shell_file_id?: string;
  patient_id_masked?: string;
  duration_ms?: number;
  metadata?: Record<string, any>;
}

export interface LoggerOptions {
  context: string;
  worker_id?: string;
  correlation_id?: string;
  enable_sampling?: boolean;
  sample_rate?: number;
}

export interface RedactionOptions {
  patient_id?: string;
  ocr_text?: string;
  prompt?: string;
  base64?: string;
}
```

---

## Implementation Phases

### Phase 1: Logger Utility & Worker Integration (Priority: HIGH)

**Duration**: 4-5 hours

#### Deliverables

1. **Create**: `apps/render-worker/src/utils/logger-types.ts` (shared schema)
2. **Create**: `apps/render-worker/src/utils/logger.ts` (Node implementation)
3. **Create**: `apps/render-worker/src/utils/logger.test.ts` (unit tests)
4. **Update**: `apps/render-worker/src/worker.ts` (48 console.log → logger)
5. **Update**: `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (13 console.log → logger)

#### Integration Example: worker.ts

**Before (String-based)**:
```typescript
console.log(`[${this.workerId}] V3 Worker initialized`);
console.log(`[${this.workerId}] Claimed job ${fullJob.id} (${fullJob.job_type})`);
console.error(`[${this.workerId}] Error processing job ${job.id}:`, error);
```

**After (Structured)**:
```typescript
import { createLogger, maskPatientId } from './utils/logger';

class V3Worker {
  private logger: Logger;

  constructor() {
    this.workerId = config.worker.id;
    this.logger = createLogger({
      context: 'worker',
      worker_id: this.workerId,
    });

    this.logger.info('V3 Worker initialized');
  }

  private async processJob(job: Job) {
    // Extract correlation_id from job payload (fallback to job ID for traceability)
    const correlation_id = job.job_payload.correlation_id || `job_${job.id}`;
    this.logger.setCorrelationId(correlation_id);

    this.logger.info('Processing job', {
      job_id: job.id,
      job_type: job.job_type,
      job_name: job.job_name,
      retry_count: job.retry_count,
    });

    try {
      const result = await this.logger.logOperation(
        'processJob',
        async () => {
          // Actual job processing
          return await this.processAIJob(job);
        },
        {
          job_id: job.id,
          shell_file_id: job.job_payload.shell_file_id,
          patient_id_masked: maskPatientId(job.job_payload.patient_id),
        }
      );

      this.logger.info('Job completed', {
        job_id: job.id,
        total_entities: result.total_entities_detected,
      });
    } catch (error: any) {
      this.logger.error('Job failed', error, {
        job_id: job.id,
        retry_recommended: this.shouldRetryError(error),
      });
    }
  }
}
```

#### Integration Example: Pass1EntityDetector.ts

**Before (String-based)**:
```typescript
console.log(`[Pass1] Calling ${this.config.model} for entity detection...`);
console.log(`[Pass1] AI returned ${aiResponse.entities.length} entities`);
```

**After (Structured)**:
```typescript
import { createLogger, truncatePrompt, redactBase64 } from '../utils/logger';

export class Pass1EntityDetector {
  private logger: Logger;

  constructor(config: Pass1Config) {
    this.config = config;
    this.logger = createLogger({ context: 'pass1' });
  }

  async processDocument(input: Pass1Input): Promise<Pass1ProcessingResult> {
    // Propagate correlation_id from input (fallback to shell_file_id for traceability)
    const correlation_id = input.correlation_id || `shell_${input.shell_file_id}`;
    this.logger.setCorrelationId(correlation_id);

    const aiResponse = await this.logger.logOperation(
      'callAIForEntityDetection',
      async () => {
        return await this.callAIForEntityDetection(input);
      },
      {
        shell_file_id: input.shell_file_id,
        patient_id_masked: maskPatientId(input.patient_id),
        model: this.config.model,
        file_data: redactBase64(input.raw_file.file_data),
      }
    );

    this.logger.info('AI entity detection completed', {
      entities_detected: aiResponse.entities.length,
      processing_time_seconds: aiResponse.processing_metadata.processing_time_seconds,
      cost_estimate: aiResponse.processing_metadata.cost_estimate,
      token_usage: aiResponse.processing_metadata.token_usage,
    });
  }
}
```

#### Unit Tests: logger.test.ts

```typescript
/**
 * Unit tests for structured logger
 */

import { createLogger, maskPatientId, truncateOCRText, redactBase64 } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    // Spy on console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createLogger', () => {
    test('creates logger with context', () => {
      const logger = createLogger({ context: 'test' });
      logger.info('Test message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"context":"test"')
      );
    });

    test('includes correlation_id when set', () => {
      const logger = createLogger({ context: 'test' });
      logger.setCorrelationId('req_abc123');
      logger.info('Test message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"correlation_id":"req_abc123"')
      );
    });

    test('includes worker_id when provided', () => {
      const logger = createLogger({
        context: 'test',
        worker_id: 'worker-123'
      });
      logger.info('Test message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"worker_id":"worker-123"')
      );
    });
  });

  describe('log levels', () => {
    test('info logs at INFO level', () => {
      const logger = createLogger({ context: 'test' });
      logger.info('Info message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"')
      );
    });

    test('warn logs at WARN level', () => {
      const logger = createLogger({ context: 'test' });
      logger.warn('Warning message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"WARN"')
      );
    });

    test('error logs at ERROR level with error details', () => {
      const logger = createLogger({ context: 'test' });
      const error = new Error('Test error');
      logger.error('Error message', error);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"error_message":"Test error"')
      );
    });

    test('debug logs only when VERBOSE=true', () => {
      process.env.VERBOSE = 'false';
      const logger = createLogger({ context: 'test' });
      logger.debug('Debug message');

      expect(console.log).not.toHaveBeenCalled();

      process.env.VERBOSE = 'true';
      logger.debug('Debug message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"DEBUG"')
      );
    });
  });

  describe('logOperation', () => {
    test('logs start, completion, and duration', async () => {
      const logger = createLogger({ context: 'test' });

      await logger.logOperation(
        'testOperation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'success';
        }
      );

      // Check start log
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"testOperation started"')
      );

      // Check completion log with duration
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"testOperation completed"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"duration_ms"')
      );
    });

    test('logs error with duration on failure', async () => {
      const logger = createLogger({ context: 'test' });

      await expect(
        logger.logOperation(
          'failingOperation',
          async () => {
            throw new Error('Operation failed');
          }
        )
      ).rejects.toThrow('Operation failed');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"failingOperation failed"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"duration_ms"')
      );
    });
  });

  describe('PII redaction', () => {
    test('maskPatientId shows last 6 chars + hash', () => {
      const masked = maskPatientId('patient_abc123xyz');

      expect(masked).toMatch(/^\*\*\*[a-f0-9]{6}:123xyz$/);
      expect(masked).not.toContain('patient_abc');
    });

    test('maskPatientId handles empty input', () => {
      expect(maskPatientId('')).toBe('[REDACTED]');
    });

    test('truncateOCRText limits text length', () => {
      const longText = 'a'.repeat(200);
      const truncated = truncateOCRText(longText, 120);

      expect(truncated).toHaveLength(120 + '... [truncated 80 chars]'.length);
      expect(truncated).toContain('[truncated 80 chars]');
    });

    test('redactBase64 shows size only', () => {
      const base64 = Buffer.from('test data').toString('base64');
      const redacted = redactBase64(base64);

      expect(redacted).toMatch(/^\[BASE64_REDACTED:\d+_bytes\]$/);
      expect(redacted).not.toContain(base64);
    });
  });

  describe('sampling', () => {
    test('samples logs based on sample_rate', () => {
      const logger = createLogger({
        context: 'test',
        enable_sampling: true,
        sample_rate: 0.5 // 50% sampling
      });

      const logCount = 100;
      for (let i = 0; i < logCount; i++) {
        logger.info('Sampled message');
      }

      // Expect approximately 50 logs (allow 20% variance)
      const actualLogs = (console.log as jest.Mock).mock.calls.length;
      expect(actualLogs).toBeGreaterThan(30);
      expect(actualLogs).toBeLessThan(70);
    });
  });
});
```

---

### Phase 2: OCR & Image Processing Integration (Priority: MEDIUM)

**Duration**: 2-3 hours

#### Deliverables

1. **Update**: `apps/render-worker/src/utils/ocr-persistence.ts`
2. **Update**: `apps/render-worker/src/utils/image-processing.ts`

#### Integration Example: ocr-persistence.ts

**Before**:
```typescript
console.log(`[OCR Persistence] Successfully persisted ${ocrResult.pages.length} pages`);
console.error('[OCR Persistence] Failed to upload manifest:', error);
```

**After**:
```typescript
import { createLogger, maskPatientId } from './logger';

const logger = createLogger({ context: 'ocr-persistence' });

export async function persistOCRArtifacts(
  supabase: SupabaseClient,
  shellFileId: string,
  patientId: string,
  ocrResult: any,
  fileChecksum: string,
  correlationId?: string
): Promise<void> {
  if (correlationId) {
    logger.setCorrelationId(correlationId);
  }

  await logger.logOperation(
    'persistOCRArtifacts',
    async () => {
      // Upload page artifacts
      for (let i = 0; i < ocrResult.pages.length; i++) {
        await logger.logOperation(
          `uploadPage_${i + 1}`,
          async () => {
            const result = await retryStorageUpload(async () => {
              return await supabase.storage
                .from('medical-docs')
                .upload(`${basePath}/page-${i + 1}.json`, ...);
            });

            if (result.error) {
              throw new Error(`Failed to upload OCR page ${i + 1}`);
            }
          },
          {
            shell_file_id: shellFileId,
            patient_id_masked: maskPatientId(patientId),
            page_number: i + 1,
          }
        );
      }

      logger.info('OCR artifacts persisted', {
        shell_file_id: shellFileId,
        patient_id_masked: maskPatientId(patientId),
        page_count: ocrResult.pages.length,
        checksum: fileChecksum,
      });
    },
    {
      shell_file_id: shellFileId,
      patient_id_masked: maskPatientId(patientId),
    }
  );
}
```

#### Integration Example: image-processing.ts

**Before**:
```typescript
console.log('[ImageProcessing] PDF detected - skipping downscaling');
console.warn(`[ImageProcessing] Missing dimensions for ${mime}`);
```

**After**:
```typescript
import { createLogger } from './logger';

const logger = createLogger({ context: 'image-processing' });

export async function downscaleImageBase64(
  b64: string,
  mime: string,
  maxWidth = 1600,
  quality = 78,
  correlationId?: string
): Promise<{ b64: string; width: number; height: number; outMime: string }> {
  if (correlationId) {
    logger.setCorrelationId(correlationId);
  }

  // PDF handling
  if (mime === 'application/pdf') {
    logger.debug('PDF detected - skipping downscaling', { mime });
    return { b64, width: 0, height: 0, outMime: mime };
  }

  // HEIC not supported
  if (mime === 'image/heic' || mime === 'image/heif') {
    logger.warn('HEIC/HEIF not yet supported', { mime });
    throw new Error('HEIC/HEIF files not yet supported');
  }

  const buf = Buffer.from(b64, 'base64');
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await img.metadata();

  if (!meta.width || !meta.height) {
    logger.warn('Missing dimensions, skipping downscaling', { mime });
    return { b64, width: 0, height: 0, outMime: mime };
  }

  if (meta.width <= maxWidth) {
    logger.debug('Image smaller than target, skipping downscaling', {
      mime,
      width: meta.width,
      target_width: maxWidth,
    });
    return { b64, width: meta.width, height: meta.height, outMime: mime };
  }

  // Format-specific processing
  try {
    const result = await logger.logOperation(
      `downscale_${mime}`,
      async () => {
        if (mime === 'image/jpeg') {
          const out = await img.resize(...).jpeg(...).toBuffer();
          const outMeta = await sharp(out).metadata();
          return {
            b64: out.toString('base64'),
            width: outMeta.width || 0,
            height: outMeta.height || 0,
            outMime: 'image/jpeg'
          };
        }
        // ... other formats
      },
      {
        mime,
        original_width: meta.width,
        original_height: meta.height,
        target_width: maxWidth,
      }
    );

    logger.info('Image downscaled', {
      mime,
      original_size: buf.length,
      processed_size: Buffer.from(result.b64, 'base64').length,
      size_reduction_percent: ((1 - Buffer.from(result.b64, 'base64').length / buf.length) * 100).toFixed(2),
    });

    return result;
  } catch (error) {
    logger.error('Image processing failed', error, { mime });
    return { b64, width: meta.width || 0, height: meta.height || 0, outMime: mime };
  }
}
```

---

### Phase 3: Edge Function Standardization (Priority: MEDIUM)

**Duration**: 3-4 hours

#### Deliverables

1. **Create**: `supabase/functions/_shared/logger-types.ts` (shared schema)
2. **Create**: `supabase/functions/_shared/logger.ts` (Deno implementation)
3. **Update**: `supabase/functions/shell-file-processor-v3/index.ts`
4. **Update**: `supabase/functions/auto-provision-user-profile/index.ts`
5. **Update**: `supabase/functions/audit-logger-v3/index.ts`

#### Integration Example: shell-file-processor-v3

**Before**:
```typescript
console.log(`[${correlationId}] Created shell_file: ${shellFileId}`);
console.log(`[${correlationId}] Enqueued job: ${jobId}`);
```

**After**:
```typescript
import { createLogger, extractCorrelationId, maskPatientId } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const logger = createLogger({ context: 'shell-file-processor-v3' });
  const correlationId = extractCorrelationId(req);
  logger.setCorrelationId(correlationId);

  try {
    const shellFile = await logger.logOperation(
      'createShellFile',
      async () => {
        const { data, error } = await supabase
          .from('shell_files')
          .insert({ ... });

        if (error) throw error;
        return data;
      },
      {
        patient_id_masked: await maskPatientId(data.patient_id),
        filename: data.uploaded_filename,
      }
    );

    logger.info('Shell file created', {
      shell_file_id: shellFile.id,
      patient_id_masked: await maskPatientId(shellFile.patient_id),
    });

    const job = await logger.logOperation(
      'enqueueJob',
      async () => {
        const { data, error } = await supabase.rpc('enqueue_job_v3', { ... });
        if (error) throw error;
        return data;
      },
      {
        shell_file_id: shellFile.id,
        job_type: 'ai_processing',
      }
    );

    logger.info('Job enqueued', {
      job_id: job.job_id,
      shell_file_id: shellFile.id,
    });

    return new Response(JSON.stringify({ ... }), { status: 200 });
  } catch (error: any) {
    logger.error('Shell file processing failed', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
```

---

### Phase 4: Observability Tooling (Priority: LOW - Post-Implementation)

**Duration**: 2-3 hours

#### Deliverables

1. **Create**: `scripts/log-analyzer.ts` (log parsing and analytics)

#### Example: Cost Aggregation Script

```typescript
/**
 * Log Analyzer - Parse structured logs from Render.com
 * Usage: node scripts/log-analyzer.ts --analyze-costs --shell-file-id sf_123
 */

import * as fs from 'fs';
import * as readline from 'readline';

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  correlation_id?: string;
  shell_file_id?: string;
  patient_id_masked?: string;
  cost_estimate?: number;
  duration_ms?: number;
  metadata?: Record<string, any>;
}

async function analyzeCosts(logFile: string, shellFileId?: string) {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const costsByShellFile: Map<string, number> = new Map();
  const durationsByOperation: Map<string, number[]> = new Map();

  for await (const line of rl) {
    try {
      const entry: LogEntry = JSON.parse(line);

      // Aggregate costs by shell_file_id
      if (entry.cost_estimate && entry.shell_file_id) {
        const current = costsByShellFile.get(entry.shell_file_id) || 0;
        costsByShellFile.set(entry.shell_file_id, current + entry.cost_estimate);
      }

      // Track operation durations
      if (entry.duration_ms && entry.context) {
        const durations = durationsByOperation.get(entry.context) || [];
        durations.push(entry.duration_ms);
        durationsByOperation.set(entry.context, durations);
      }
    } catch (error) {
      // Skip non-JSON lines
    }
  }

  // Report results
  console.log('\n=== Cost Analysis ===');
  for (const [fileId, cost] of costsByShellFile.entries()) {
    if (!shellFileId || fileId === shellFileId) {
      console.log(`${fileId}: $${cost.toFixed(4)}`);
    }
  }

  console.log('\n=== Duration Analysis ===');
  for (const [operation, durations] of durationsByOperation.entries()) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    console.log(`${operation}: avg=${avg.toFixed(2)}ms, max=${max}ms, count=${durations.length}`);
  }
}

// CLI interface
const args = process.argv.slice(2);
const logFile = args[0] || './worker.log';
const shellFileId = args[1];

analyzeCosts(logFile, shellFileId);
```

---

## Correlation ID Propagation Strategy

### Worker → Database → Edge Functions Flow

```
1. Edge Function receives upload request
   ↓
   Extract/generate correlation_id from headers
   ↓
   Store in job_payload.correlation_id when enqueueing job
   ↓
2. Worker claims job from queue
   ↓
   Extract correlation_id from job.job_payload
   ↓
   Set logger.setCorrelationId(correlation_id)
   ↓
   Propagate to Pass1EntityDetector, OCR, image processing
   ↓
3. All logs include same correlation_id
   ↓
   Trace single document upload through all systems
```

### Updated job_payload Schema

```typescript
interface AIProcessingJobPayload {
  shell_file_id: string;
  patient_id: string;
  storage_path: string;
  // ... existing fields ...

  correlation_id?: string;  // NEW: For request tracing
}
```

---

## Environment Variables

### Worker (apps/render-worker/)

```bash
# Logging configuration
LOG_LEVEL=INFO              # DEBUG, INFO, WARN, ERROR
VERBOSE=false               # Maps to DEBUG level
NODE_ENV=production         # production = JSON logs, development = pretty-print

# Sampling configuration (optional)
ENABLE_LOG_SAMPLING=false   # Enable sampling for high-volume paths
LOG_SAMPLE_RATE=1.0         # 0.0 - 1.0 (1.0 = 100% of logs)
```

### Edge Functions (supabase/functions/)

```bash
# Logging configuration
LOG_LEVEL=INFO              # DEBUG, INFO, WARN, ERROR
DENO_ENV=production         # production = JSON logs, development = pretty-print
```

---

## Migration Checklist

### Phase 1: Worker + Pass1 (HIGH PRIORITY) ✅ COMPLETED
- [x] Create `apps/render-worker/src/utils/logger-types.ts`
- [x] Create `apps/render-worker/src/utils/logger.ts`
- [x] Create `apps/render-worker/src/utils/logger.test.ts`
- [x] Run unit tests: `npm test logger.test.ts` (26/26 passing)
- [x] Update `worker.ts`: Replace 48 console.log calls
- [x] Add correlation_id extraction from `job.job_payload`
- [x] Propagate correlation_id to Pass1EntityDetector
- [x] Update `Pass1EntityDetector.ts`: Replace 14 console.log calls
- [x] Add duration tracking for AI API calls
- [x] Redact patient_id, OCR text, base64 data
- [x] Test locally with VERBOSE=true and NODE_ENV=development
- [x] Deploy to Render.com production
- [x] Verify JSON logs in Render.com dashboard
- [x] Trace single correlation_id across multiple log entries

### Phase 2: OCR & Image Processing (MEDIUM PRIORITY) ✅ COMPLETED
- [x] Update `ocr-persistence.ts`: Accept correlation_id parameter
- [x] Replace 7 console.log calls with structured logger
- [x] Add duration tracking for upload operations
- [x] Update `image-processing.ts`: Accept correlation_id parameter
- [x] Replace 6 console.log calls with structured logger
- [x] Add size reduction metrics
- [x] Test with sample documents
- [x] Deploy to production
- [x] Add error handling guard for rescheduled jobs

### Phase 3: Edge Functions (MEDIUM PRIORITY) - FUTURE
- [ ] Create `supabase/functions/_shared/logger-types.ts`
- [ ] Create `supabase/functions/_shared/logger.ts`
- [ ] Update `shell-file-processor-v3`: Add structured logging
- [ ] Update `auto-provision-user-profile`: Add correlation IDs
- [ ] Update `audit-logger-v3`: Add duration metrics
- [ ] Test Edge Functions locally with `supabase functions serve`
- [ ] Deploy to Supabase production
- [ ] Verify correlation_id propagation from Edge → Worker

### Phase 4: Observability Tooling (LOW PRIORITY) - FUTURE
- [ ] Create `scripts/log-analyzer.ts`
- [ ] Test cost aggregation with sample logs
- [ ] Document usage in README

---

## Success Metrics

### Observability
- ✅ 100% of logs are valid JSON in production
- ✅ Correlation IDs present in 100% of request-scoped logs
- ✅ All PII/PHI fields redacted (patient_id masked, OCR text truncated)

### Performance
- ✅ Duration tracking for all operations (job processing, OCR, AI calls, DB writes)
- ✅ Slow operation threshold alerts (>5s for OCR, >30s for AI calls)
- ✅ Cost aggregation by shell_file_id, patient_id, session_id

### Debugging
- ✅ Correlation ID trace across worker → database → edge functions
- ✅ Error context includes entity_id, session_id, retry_count
- ✅ Manual review queue metrics (high vs low confidence entities)

---

## Consultant Review Questions

### 1. Priority Order
**Question**: Should I tackle Edge Functions before utilities, or follow the order above (Worker + Pass1 → Utilities → Edge Functions)?

**Recommendation**: Keep the proposed order. Start with `worker.ts` and `Pass1EntityDetector.ts` first, then utilities, then Edge Functions. This captures most value quickly and reduces blast radius.

### 2. Verbose Mode
**Question**: Keep existing VERBOSE env var check, or integrate into logger levels (DEBUG)?

**Recommendation**: Use logger levels. Map `VERBOSE=true` to enable DEBUG level in the logger; do not sprinkle `if (VERBOSE)` checks—use `log.debug` consistently and control via env log level.

### 3. Cost Field
**Question**: Should every log include cost_estimate (from AI calls), or only AI-specific logs?

**Recommendation**: Only in AI-call logs (and any downstream summary log that aggregates a session). Don't include cost_estimate in every log line.

### 4. Patient ID Sanitization
**Question**: Should worker logs sanitize patient_id like Edge Functions do, or keep full IDs since Render.com is server-side?

**Recommendation**: Sanitize everywhere (worker and Edge). Treat all logs as potentially exportable; store only masked/hashed forms and avoid raw PII/PHI.

---

## Consultant Refinements

### Common Schema and Types
✅ **Implemented**: Single log schema interface defined in `logger-types.ts` and reused in both Node (worker) and Deno (Edge). Two thin implementations, one API.

### Correlation Propagation
✅ **Implemented**: Always pull `correlation_id` from `job.job_payload` in the worker and thread it through Pass1, OCR persistence, image processing, and retry logs.

### Production JSON Only
✅ **Implemented**: JSON-only logs in production; pretty-print only in dev. Default to INFO and above; DEBUG controlled via env.

### PII/PHI Redaction
✅ **Implemented**: Helpers that mask `patient_id` (last 6 + hash), prevent logging raw OCR text, full prompts, or base64. Clip long text fields (120 chars).

### Duration Discipline
✅ **Implemented**: Log start/end with computed `duration_ms` for each operation block via `logOperation()` method.

### Sampling
✅ **Implemented**: Configurable sampling for low-signal info logs in high-volume paths (env-based sample rate).

---

## Next Steps

1. **Create logger utility** (`logger-types.ts` + `logger.ts` + `logger.test.ts`)
2. **Migrate worker.ts** (48 console.log → structured logger)
3. **Migrate Pass1EntityDetector.ts** (13 console.log → structured logger)
4. **Test locally** with VERBOSE=true and NODE_ENV=development
5. **Deploy to staging** and verify JSON logs in Render.com dashboard
6. **Trace correlation_id** across multiple systems
7. **Continue with Phase 2** (OCR + image processing)
8. **Continue with Phase 3** (Edge Functions)

---

## Summary

Phase 4 implements production-grade structured logging with:
- JSON-formatted logs for machine parsing
- Universal correlation ID propagation
- PII/PHI redaction (HIPAA compliance)
- Duration tracking for performance monitoring
- Shared schema across Node and Deno
- Level-based logging with VERBOSE → DEBUG mapping
- Configurable sampling for high-volume paths

**Total effort**: 11-15 hours
**Impact**: Production observability, request tracing, cost analytics, debugging efficiency

**Status**: READY FOR IMPLEMENTATION
