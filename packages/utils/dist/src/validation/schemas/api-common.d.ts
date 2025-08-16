import { z } from 'zod';
/**
 * Common API response patterns for consistency across all endpoints
 */
/**
 * Standard success response schema
 */
export declare const SuccessResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    data: z.ZodOptional<z.ZodUnknown>;
    message: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Standard error response schema
 */
export declare const ErrorResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
    timestamp: z.ZodOptional<z.ZodString>;
    should_retry: z.ZodOptional<z.ZodBoolean>;
    should_use_client_fallback: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/**
 * Generic API response that can be either success or error
 */
export declare const ApiResponseSchema: z.ZodUnion<readonly [z.ZodObject<{
    success: z.ZodLiteral<true>;
    data: z.ZodOptional<z.ZodUnknown>;
    message: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
    timestamp: z.ZodOptional<z.ZodString>;
    should_retry: z.ZodOptional<z.ZodBoolean>;
    should_use_client_fallback: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>]>;
/**
 * Pagination metadata schema
 */
export declare const PaginationSchema: z.ZodObject<{
    total: z.ZodNumber;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    has_more: z.ZodBoolean;
    page: z.ZodOptional<z.ZodNumber>;
    total_pages: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Paginated response schema
 */
export declare const PaginatedResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    data: z.ZodArray<z.ZodUnknown>;
    pagination: z.ZodObject<{
        total: z.ZodNumber;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
        has_more: z.ZodBoolean;
        page: z.ZodOptional<z.ZodNumber>;
        total_pages: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Health check response schema
 */
export declare const HealthCheckSchema: z.ZodObject<{
    status: z.ZodEnum<{
        healthy: "healthy";
        unhealthy: "unhealthy";
    }>;
    timestamp: z.ZodString;
    version: z.ZodString;
    environment: z.ZodString;
    region: z.ZodOptional<z.ZodString>;
    deployment: z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>;
    checks: z.ZodObject<{
        database: z.ZodObject<{
            status: z.ZodEnum<{
                healthy: "healthy";
                unhealthy: "unhealthy";
            }>;
            responseTime: z.ZodString;
            error: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        memory: z.ZodObject<{
            used: z.ZodNumber;
            total: z.ZodNumber;
            rss: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    uptime: z.ZodNumber;
}, z.core.$strip>;
/**
 * Common query parameter schemas
 */
export declare const CommonQueryParams: {
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    page: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    profile_id: z.ZodOptional<z.ZodString>;
    patient_id: z.ZodOptional<z.ZodString>;
    sort_by: z.ZodOptional<z.ZodString>;
    sort_order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    format: z.ZodDefault<z.ZodEnum<{
        json: "json";
        csv: "csv";
    }>>;
};
/**
 * Type inference for common types
 */
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
/**
 * Helper functions for creating standard responses
 */
export declare const ResponseHelpers: {
    success: (data?: unknown, message?: string) => SuccessResponse;
    error: (error: string, details?: unknown, options?: {
        shouldRetry?: boolean;
        shouldUseClientFallback?: boolean;
    }) => ErrorResponse;
    paginated: (data: unknown[], pagination: z.infer<typeof PaginationSchema>) => PaginatedResponse;
};
//# sourceMappingURL=api-common.d.ts.map