"use strict";
// @ts-nocheck
/**
 * Simple mock logger for testing Pass 1.5 without dependencies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    debug: (message, meta) => {
        // Silent for tests
    },
    info: (message, meta) => {
        console.log(`INFO: ${message}`, meta || '');
    },
    warn: (message, meta) => {
        console.warn(`WARN: ${message}`, meta || '');
    },
    error: (message, meta) => {
        console.error(`ERROR: ${message}`, meta || '');
    },
};
//# sourceMappingURL=test-logger.js.map