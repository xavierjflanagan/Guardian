import { z } from 'zod';
const REQUEST_SIZE_LIMIT = 1024 * 1024; // 1MB
export class ValidationError extends Error {
    constructor(details) {
        super('Validation failed');
        this.details = details;
        this.name = 'ValidationError';
    }
}
/**
 * Core validation function for parsed JSON input
 * Does NOT check request size - use validateInputWithSize for that
 */
export function validateInput(schema, input) {
    try {
        // Basic input validation
        if (input == null) {
            return {
                success: false,
                error: 'Input cannot be null or undefined',
                status: 400
            };
        }
        // Validate against schema
        const data = schema.parse(input);
        return { success: true, data };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: 'Validation failed',
                details: error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                    received: 'received' in issue ? issue.received : undefined
                })),
                status: 400
            };
        }
        // Unknown error
        return {
            success: false,
            error: 'Validation error',
            details: [{
                    field: 'unknown',
                    message: error instanceof Error ? error.message : 'Unknown error'
                }],
            status: 500
        };
    }
}
/**
 * Validation function that checks Content-Length before parsing
 * Use this for API routes that need size validation
 */
export function validateInputWithSize(schema, input, request, options = {}) {
    const maxSize = options.maxSize || REQUEST_SIZE_LIMIT;
    // Check Content-Length header if request is provided
    if (request) {
        const contentLength = request.headers.get('content-length');
        if (contentLength) {
            const size = parseInt(contentLength, 10);
            if (isNaN(size)) {
                return {
                    success: false,
                    error: 'Invalid Content-Length header',
                    status: 400
                };
            }
            if (size > maxSize) {
                return {
                    success: false,
                    error: 'Request payload too large',
                    details: [{
                            field: 'content-length',
                            message: `Exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`,
                            received: `${Math.round(size / 1024 / 1024)}MB`
                        }],
                    status: 413
                };
            }
        }
    }
    // Delegate to standard validation for schema checking
    return validateInput(schema, input);
}
/**
 * Validate input with additional security requirements
 */
export function validateSecureInput(schema, input, options = {}) {
    // Authentication check if required
    if (options.requireAuth) {
        if (!options.authToken || !options.authToken.startsWith('Bearer ')) {
            return {
                success: false,
                error: 'Authentication required',
                status: 401
            };
        }
    }
    // Use standard validation (no size checking in this function)
    return validateInput(schema, input);
}
/**
 * Common validation patterns for healthcare data
 */
export const CommonValidators = {
    uuid: z.string().uuid('Invalid UUID format'),
    profileId: z.string().uuid('Invalid profile ID'),
    patientId: z.string().uuid('Invalid patient ID'),
    sessionId: z.string().uuid('Invalid session ID'),
    // Healthcare-specific patterns
    auditAction: z.string()
        .min(1, 'Action cannot be empty')
        .max(100, 'Action too long')
        .regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid action format'),
    metadata: z.record(z.string(), z.unknown())
        .refine((obj) => JSON.stringify(obj).length <= 5000, { message: "Metadata exceeds 5KB limit" }),
    // Note: privacyLevel and complianceCategory moved to shared constants
    // Import from @guardian/utils instead of using these
};
