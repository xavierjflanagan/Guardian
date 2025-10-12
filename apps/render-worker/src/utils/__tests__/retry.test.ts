/**
 * Unit tests for retry utility
 *
 * Tests cover:
 * - Immediate success (no retries)
 * - Retry on retryable errors
 * - Fast-fail on non-retryable errors
 * - Retry exhaustion
 * - Exponential backoff calculation
 * - Full jitter algorithm
 * - Retry-After header parsing
 * - Error classification
 */

import {
  retryWithBackoff,
  isRetryableError,
  GOOGLE_VISION_CONFIG,
  OPENAI_CONFIG
} from '../retry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    // Clear console spies
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, GOOGLE_VISION_CONFIG);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' })
      .mockRejectedValueOnce({ status: 503, message: 'Service unavailable' })
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, GOOGLE_VISION_CONFIG);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should fail immediately on non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue({
      status: 401,
      message: 'Unauthorized'
    });

    await expect(retryWithBackoff(fn, GOOGLE_VISION_CONFIG)).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized'
    });

    expect(fn).toHaveBeenCalledTimes(1);  // No retries
  });

  it('should fail after max retries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue({
      status: 429,
      message: 'Rate limit exceeded'
    });

    await expect(retryWithBackoff(fn, GOOGLE_VISION_CONFIG)).rejects.toMatchObject({
      status: 429
    });

    expect(fn).toHaveBeenCalledTimes(4);  // Initial + 3 retries
  });

  it('should apply exponential backoff with jitter', async () => {
    jest.useFakeTimers();

    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 503, message: 'Server error' })
      .mockRejectedValueOnce({ status: 503, message: 'Server error' })
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxBackoffMs: 10000,
      operationName: 'Test'
    });

    // Wait for first retry
    await jest.advanceTimersByTimeAsync(1500);

    // Wait for second retry
    await jest.advanceTimersByTimeAsync(3000);

    await promise;
    expect(fn).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
  });

  it('should respect Retry-After header (seconds)', async () => {
    jest.useFakeTimers();

    const fn = jest.fn()
      .mockRejectedValueOnce({
        status: 429,
        message: 'Rate limit',
        response: {
          headers: {
            get: (name) => name === 'retry-after' ? '5' : null
          }
        }
      })
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 1000,
      maxBackoffMs: 10000,
      operationName: 'Test'
    });

    // Should wait 5 seconds (from Retry-After header)
    await jest.advanceTimersByTimeAsync(5000);

    await promise;
    expect(fn).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('should respect maxBackoffMs cap', async () => {
    jest.useFakeTimers();

    const fn = jest.fn()
      .mockRejectedValueOnce({
        status: 429,
        message: 'Rate limit',
        response: {
          headers: {
            get: (name) => name === 'retry-after' ? '60' : null  // 60 seconds
          }
        }
      })
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 1000,
      maxBackoffMs: 10000,  // Cap at 10 seconds
      operationName: 'Test'
    });

    // Should wait 10 seconds (capped, not 60)
    await jest.advanceTimersByTimeAsync(10000);

    await promise;
    expect(fn).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('should log structured JSON for retries', async () => {
    const consoleWarn = jest.spyOn(console, 'warn');

    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 503, message: 'Server error' })
      .mockResolvedValue('success');

    await retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 100,
      maxBackoffMs: 1000,
      operationName: 'Test Operation',
      correlationId: 'test-correlation-123',
      jobId: 'test-job-456'
    });

    expect(consoleWarn).toHaveBeenCalled();
    const logCall = consoleWarn.mock.calls[0][0];
    const logData = JSON.parse(logCall);

    expect(logData).toMatchObject({
      level: 'warn',
      retry_attempt: 1,
      max_retries: 2,
      operation: 'Test Operation',
      error_status: 503,
      error_message: 'Server error',
      is_retryable: true,
      correlation_id: 'test-correlation-123',
      job_id: 'test-job-456'
    });

    expect(logData).toHaveProperty('timestamp');
    expect(logData).toHaveProperty('delay_ms');
  });

  it('should log error for non-retryable errors', async () => {
    const consoleError = jest.spyOn(console, 'error');

    const fn = jest.fn().mockRejectedValue({
      status: 401,
      message: 'Unauthorized'
    });

    await expect(retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 100,
      maxBackoffMs: 1000,
      operationName: 'Test Operation'
    })).rejects.toMatchObject({ status: 401 });

    expect(consoleError).toHaveBeenCalled();
    const logCall = consoleError.mock.calls[0][0];
    const logData = JSON.parse(logCall);

    expect(logData).toMatchObject({
      level: 'error',
      operation: 'Test Operation',
      error_status: 401,
      is_retryable: false
    });
  });
});

describe('isRetryableError', () => {
  it('should classify HTTP 429 as retryable', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('should classify HTTP 5xx as retryable', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 502 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 504 })).toBe(true);
  });

  it('should classify HTTP 4xx (except 429) as non-retryable', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('should classify network errors as retryable', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
    expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
  });

  it('should classify timeout errors as retryable', () => {
    expect(isRetryableError({ message: 'Request timeout' })).toBe(true);
    expect(isRetryableError({ message: 'Network timeout' })).toBe(true);
  });

  it('should classify OpenAI specific errors as retryable', () => {
    expect(isRetryableError({ message: 'rate_limit_exceeded' })).toBe(true);
    expect(isRetryableError({ message: 'service_unavailable' })).toBe(true);
    expect(isRetryableError({ message: 'connection_error' })).toBe(true);
  });

  it('should classify validation errors as non-retryable', () => {
    expect(isRetryableError({ message: 'Invalid file format' })).toBe(false);
    expect(isRetryableError({ message: 'Missing required field' })).toBe(false);
  });
});

describe('Retry configuration', () => {
  it('should use env vars for retry config', () => {
    // Test that configs respect env vars (using defaults here)
    expect(GOOGLE_VISION_CONFIG.maxRetries).toBeGreaterThan(0);
    expect(GOOGLE_VISION_CONFIG.baseDelayMs).toBeGreaterThan(0);
    expect(GOOGLE_VISION_CONFIG.maxBackoffMs).toBeGreaterThan(0);

    expect(OPENAI_CONFIG.maxRetries).toBeGreaterThan(0);
    expect(OPENAI_CONFIG.baseDelayMs).toBeGreaterThan(0);
    expect(OPENAI_CONFIG.maxBackoffMs).toBeGreaterThan(0);
  });

  it('should have sensible default values', () => {
    expect(GOOGLE_VISION_CONFIG.maxRetries).toBe(3);
    expect(GOOGLE_VISION_CONFIG.baseDelayMs).toBe(1000);
    expect(GOOGLE_VISION_CONFIG.maxBackoffMs).toBe(15000);

    expect(OPENAI_CONFIG.maxRetries).toBe(3);
    expect(OPENAI_CONFIG.baseDelayMs).toBe(2000);
    expect(OPENAI_CONFIG.maxBackoffMs).toBe(30000);
  });
});
