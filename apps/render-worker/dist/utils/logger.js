"use strict";
/**
 * Structured Logging Utility for V3 Worker (Node.js)
 * Provides JSON-formatted logs for production observability
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.createLogger = createLogger;
exports.maskPatientId = maskPatientId;
exports.truncateOCRText = truncateOCRText;
exports.truncatePrompt = truncatePrompt;
exports.redactBase64 = redactBase64;
exports.redactSensitiveData = redactSensitiveData;
exports.generateCorrelationId = generateCorrelationId;
const crypto_1 = __importDefault(require("crypto"));
// Helper functions to get environment values (allows testing)
function getNodeEnv() {
    return process.env.NODE_ENV || 'development';
}
function getEffectiveLogLevel() {
    // Map VERBOSE=true to DEBUG level for unambiguous behavior
    return process.env.VERBOSE === 'true'
        ? 'DEBUG'
        : (process.env.LOG_LEVEL || 'INFO').toUpperCase();
}
// Log level hierarchy
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};
/**
 * Structured Logger Class
 */
class Logger {
    context;
    worker_id;
    correlation_id;
    enable_sampling;
    sample_rate;
    constructor(options) {
        this.context = options.context;
        this.worker_id = options.worker_id;
        this.correlation_id = options.correlation_id;
        this.enable_sampling = options.enable_sampling ?? false;
        this.sample_rate = options.sample_rate ?? 1.0;
    }
    /**
     * Update correlation ID for request tracing
     */
    setCorrelationId(correlation_id) {
        this.correlation_id = correlation_id;
    }
    /**
     * Log DEBUG level (controlled by EFFECTIVE_LOG_LEVEL)
     * Enabled when VERBOSE=true or LOG_LEVEL=DEBUG
     */
    debug(message, metadata) {
        this.log('DEBUG', message, metadata);
    }
    /**
     * Log INFO level (standard operations)
     */
    info(message, metadata) {
        if (this.shouldSample()) {
            this.log('INFO', message, metadata);
        }
    }
    /**
     * Log WARN level (non-critical issues)
     */
    warn(message, metadata) {
        this.log('WARN', message, metadata);
    }
    /**
     * Log ERROR level (failures, exceptions)
     */
    error(message, error, metadata) {
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
    log(level, message, metadata) {
        // Check log level threshold
        const effectiveLogLevel = getEffectiveLogLevel();
        if (LOG_LEVELS[level] < LOG_LEVELS[effectiveLogLevel]) {
            return;
        }
        // Development mode: Warn about potentially sensitive metadata keys
        const nodeEnv = getNodeEnv();
        if (nodeEnv === 'development' && metadata) {
            const dangerousKeys = ['file_data', 'ocr_text', 'prompt', 'base64'];
            const foundDangerous = Object.keys(metadata).filter(k => dangerousKeys.some(d => k.toLowerCase().includes(d)));
            if (foundDangerous.length > 0) {
                console.warn(`⚠️  [Logger Warning] Potentially sensitive keys detected: ${foundDangerous.join(', ')}. Consider using redaction helpers (maskPatientId, truncateOCRText, redactBase64).`);
            }
        }
        const entry = {
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
        }
        else {
            // Development: Pretty-print
            console.log(`[${entry.timestamp}] [${entry.level}] [${entry.context}${entry.correlation_id ? `:${entry.correlation_id}` : ''}] ${entry.message}`, metadata || '');
        }
    }
    /**
     * Log sampling for high-volume paths
     */
    shouldSample() {
        if (!this.enable_sampling) {
            return true; // Always log if sampling disabled
        }
        return Math.random() < this.sample_rate;
    }
    /**
     * Log operation with duration tracking
     */
    async logOperation(operation, fn, metadata) {
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
        }
        catch (error) {
            const duration_ms = Date.now() - startTime;
            this.error(`${operation} failed`, error, {
                ...metadata,
                duration_ms,
            });
            throw error;
        }
    }
}
exports.Logger = Logger;
/**
 * Factory function to create logger instances
 */
function createLogger(options) {
    return new Logger(options);
}
/**
 * PII/PHI Redaction Helpers
 */
/**
 * Mask patient ID for HIPAA compliance
 * Format: "***abc123:xyz789" (hash prefix + last 6 chars)
 */
function maskPatientId(patient_id) {
    if (!patient_id || patient_id.length === 0) {
        return '[REDACTED]';
    }
    // Show last 6 characters + hash prefix
    const visible = patient_id.slice(-6);
    const hash = crypto_1.default.createHash('sha256').update(patient_id).digest('hex').slice(0, 6);
    return `***${hash}:${visible}`;
}
/**
 * Truncate OCR text to prevent log bloat
 */
function truncateOCRText(text, maxLength = 120) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}
/**
 * Truncate AI prompt to prevent log bloat
 */
function truncatePrompt(prompt, maxLength = 200) {
    if (!prompt || prompt.length <= maxLength) {
        return prompt;
    }
    return `${prompt.slice(0, maxLength)}... [truncated ${prompt.length - maxLength} chars]`;
}
/**
 * Redact base64 data (show size only)
 */
function redactBase64(base64) {
    if (!base64) {
        return '[NO_DATA]';
    }
    const bytes = Buffer.from(base64, 'base64').length;
    return `[BASE64_REDACTED:${bytes}_bytes]`;
}
/**
 * Apply all redactions to log metadata
 */
function redactSensitiveData(options) {
    const redacted = {};
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
function generateCorrelationId() {
    return `req_${crypto_1.default.randomBytes(8).toString('hex')}`;
}
//# sourceMappingURL=logger.js.map