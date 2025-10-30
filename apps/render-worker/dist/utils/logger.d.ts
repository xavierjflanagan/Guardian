/**
 * Structured Logging Utility for V3 Worker (Node.js)
 * Provides JSON-formatted logs for production observability
 */
import { LoggerOptions, RedactionOptions } from './logger-types';
/**
 * Structured Logger Class
 */
export declare class Logger {
    private context;
    private worker_id?;
    private correlation_id?;
    private enable_sampling;
    private sample_rate;
    constructor(options: LoggerOptions);
    /**
     * Update correlation ID for request tracing
     */
    setCorrelationId(correlation_id: string): void;
    /**
     * Log DEBUG level (controlled by EFFECTIVE_LOG_LEVEL)
     * Enabled when VERBOSE=true or LOG_LEVEL=DEBUG
     */
    debug(message: string, metadata?: Record<string, any>): void;
    /**
     * Log INFO level (standard operations)
     */
    info(message: string, metadata?: Record<string, any>): void;
    /**
     * Log WARN level (non-critical issues)
     */
    warn(message: string, metadata?: Record<string, any>): void;
    /**
     * Log ERROR level (failures, exceptions)
     */
    error(message: string, error?: Error, metadata?: Record<string, any>): void;
    /**
     * Core logging method
     */
    private log;
    /**
     * Log sampling for high-volume paths
     */
    private shouldSample;
    /**
     * Log operation with duration tracking
     */
    logOperation<T>(operation: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T>;
}
/**
 * Factory function to create logger instances
 */
export declare function createLogger(options: LoggerOptions): Logger;
/**
 * PII/PHI Redaction Helpers
 */
/**
 * Mask patient ID for HIPAA compliance
 * Format: "***abc123:xyz789" (hash prefix + last 6 chars)
 */
export declare function maskPatientId(patient_id: string): string;
/**
 * Truncate OCR text to prevent log bloat
 */
export declare function truncateOCRText(text: string, maxLength?: number): string;
/**
 * Truncate AI prompt to prevent log bloat
 */
export declare function truncatePrompt(prompt: string, maxLength?: number): string;
/**
 * Redact base64 data (show size only)
 */
export declare function redactBase64(base64: string): string;
/**
 * Apply all redactions to log metadata
 */
export declare function redactSensitiveData(options: RedactionOptions): Record<string, any>;
/**
 * Generate correlation ID for request tracing
 */
export declare function generateCorrelationId(): string;
//# sourceMappingURL=logger.d.ts.map