/**
 * Structured Logging Utility for V3 Worker (Node.js)
 * Provides JSON-formatted logs for production observability
 */

import crypto from 'crypto';
import { BaseLogEntry, LogLevel, LoggerOptions, RedactionOptions } from './logger-types';

// Helper functions to get environment values (allows testing)
function getNodeEnv(): string {
  return process.env.NODE_ENV || 'development';
}

function getEffectiveLogLevel(): LogLevel {
  // Map VERBOSE=true to DEBUG level for unambiguous behavior
  return process.env.VERBOSE === 'true'
    ? 'DEBUG'
    : (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
}

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
    const effectiveLogLevel = getEffectiveLogLevel();
    if (LOG_LEVELS[level] < LOG_LEVELS[effectiveLogLevel]) {
      return;
    }

    // Development mode: Warn about potentially sensitive metadata keys
    const nodeEnv = getNodeEnv();
    if (nodeEnv === 'development' && metadata) {
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
    if (nodeEnv === 'production') {
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
 * Format: "***abc123:xyz789" (hash prefix + last 6 chars)
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
