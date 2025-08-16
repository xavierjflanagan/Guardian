import { z } from 'zod';
export declare class ValidationError extends Error {
    details: z.ZodIssue[];
    constructor(details: z.ZodIssue[]);
}
/**
 * Generic validation result types
 */
export interface ValidationSuccess<T> {
    success: true;
    data: T;
}
export interface ValidationFailure {
    success: false;
    error: string;
    details?: Array<{
        field: string;
        message: string;
        received?: unknown;
    }>;
    status: number;
}
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;
/**
 * Core validation function for parsed JSON input
 * Does NOT check request size - use validateInputWithSize for that
 */
export declare function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): ValidationResult<T>;
/**
 * Validation function that checks Content-Length before parsing
 * Use this for API routes that need size validation
 */
export declare function validateInputWithSize<T>(schema: z.ZodSchema<T>, input: unknown, request?: Request, options?: {
    maxSize?: number;
}): ValidationResult<T>;
/**
 * Validate input with additional security requirements
 */
export declare function validateSecureInput<T>(schema: z.ZodSchema<T>, input: unknown, options?: {
    maxSize?: number;
    requireAuth?: boolean;
    authToken?: string;
}): ValidationResult<T>;
/**
 * Common validation patterns for healthcare data
 */
export declare const CommonValidators: {
    uuid: z.ZodString;
    profileId: z.ZodString;
    patientId: z.ZodString;
    sessionId: z.ZodString;
    auditAction: z.ZodString;
    metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
};
//# sourceMappingURL=common.d.ts.map