/**
 * Unit tests for structured logger
 */

import { createLogger, maskPatientId, truncateOCRText, redactBase64, truncatePrompt } from '../logger';

describe('Logger', () => {
  beforeEach(() => {
    // Spy on console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Set production mode for JSON output
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'INFO';
    process.env.VERBOSE = 'false';
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
      const logger2 = createLogger({ context: 'test' });
      logger2.debug('Debug message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"DEBUG"')
      );
    });

    test('debug logs when LOG_LEVEL=DEBUG', () => {
      process.env.VERBOSE = 'false';
      process.env.LOG_LEVEL = 'DEBUG';
      const logger = createLogger({ context: 'test' });
      logger.debug('Debug message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"DEBUG"')
      );
    });
  });

  describe('logOperation', () => {
    test('logs start, completion, and duration', async () => {
      process.env.LOG_LEVEL = 'DEBUG'; // Enable debug logs
      const logger = createLogger({ context: 'test' });

      await logger.logOperation(
        'testOperation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'success';
        }
      );

      // Check start log (debug level)
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

    test('includes metadata in operation logs', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const logger = createLogger({ context: 'test' });

      await logger.logOperation(
        'testOperation',
        async () => 'result',
        { job_id: 'job-123', shell_file_id: 'sf-456' }
      );

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"job_id":"job-123"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"shell_file_id":"sf-456"')
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

    test('truncateOCRText preserves short text', () => {
      const shortText = 'Short text';
      const result = truncateOCRText(shortText, 120);

      expect(result).toBe(shortText);
    });

    test('truncatePrompt limits prompt length', () => {
      const longPrompt = 'p'.repeat(300);
      const truncated = truncatePrompt(longPrompt, 200);

      expect(truncated).toHaveLength(200 + '... [truncated 100 chars]'.length);
      expect(truncated).toContain('[truncated 100 chars]');
    });

    test('redactBase64 shows size only', () => {
      const base64 = Buffer.from('test data').toString('base64');
      const redacted = redactBase64(base64);

      expect(redacted).toMatch(/^\[BASE64_REDACTED:\d+_bytes\]$/);
      expect(redacted).not.toContain(base64);
    });

    test('redactBase64 handles empty input', () => {
      expect(redactBase64('')).toBe('[NO_DATA]');
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

      // Expect approximately 50 logs (allow 30% variance for randomness)
      const actualLogs = (console.log as jest.Mock).mock.calls.length;
      expect(actualLogs).toBeGreaterThan(35);
      expect(actualLogs).toBeLessThan(65);
    });

    test('logs all messages when sampling disabled', () => {
      const logger = createLogger({
        context: 'test',
        enable_sampling: false
      });

      const logCount = 50;
      for (let i = 0; i < logCount; i++) {
        logger.info('Message');
      }

      expect(console.log).toHaveBeenCalledTimes(logCount);
    });

    test('never samples WARN or ERROR logs', () => {
      const logger = createLogger({
        context: 'test',
        enable_sampling: true,
        sample_rate: 0.1 // 10% sampling
      });

      // Warnings and errors should always log
      for (let i = 0; i < 10; i++) {
        logger.warn('Warning');
        logger.error('Error');
      }

      // Should have 20 logs (10 warns + 10 errors)
      expect(console.log).toHaveBeenCalledTimes(20);
    });
  });

  describe('development mode warnings', () => {
    test('warns about sensitive keys in development mode', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ context: 'test' });

      logger.info('Test', { file_data: 'sensitive', other_key: 'safe' });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('file_data')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Consider using redaction helpers')
      );
    });

    test('does not warn in production mode', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger({ context: 'test' });

      logger.info('Test', { file_data: 'sensitive' });

      expect(console.warn).not.toHaveBeenCalled();
    });

    test('warns about multiple sensitive keys', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ context: 'test' });

      logger.info('Test', {
        file_data: 'sensitive',
        ocr_text: 'also sensitive',
        safe_field: 'safe'
      });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('file_data')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('ocr_text')
      );
    });
  });

  describe('JSON output in production', () => {
    test('logs valid JSON in production mode', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger({ context: 'test' });
      logger.info('Test message', { key: 'value' });

      const logCall = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(logCall);

      expect(parsed.level).toBe('INFO');
      expect(parsed.context).toBe('test');
      expect(parsed.message).toBe('Test message');
      expect(parsed.key).toBe('value');
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('pretty-print in development', () => {
    test('logs pretty format in development mode', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ context: 'test' });
      logger.setCorrelationId('req_123');
      logger.info('Test message');

      const logCall = (console.log as jest.Mock).mock.calls[0][0];

      // Should be a string with timestamp, level, context, correlation_id
      expect(logCall).toContain('[INFO]');
      expect(logCall).toContain('[test:req_123]');
      expect(logCall).toContain('Test message');
    });
  });
});
