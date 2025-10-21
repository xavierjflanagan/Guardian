// @ts-nocheck
/**
 * Simple mock logger for testing Pass 1.5 without dependencies
 */

export const logger = {
  debug: (message: string, meta?: any) => {
    // Silent for tests
  },
  info: (message: string, meta?: any) => {
    console.log(`INFO: ${message}`, meta || '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`WARN: ${message}`, meta || '');
  },
  error: (message: string, meta?: any) => {
    console.error(`ERROR: ${message}`, meta || '');
  },
};