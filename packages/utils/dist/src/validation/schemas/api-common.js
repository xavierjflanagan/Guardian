import { z } from 'zod';
/**
 * Common API response patterns for consistency across all endpoints
 */
/**
 * Standard success response schema
 */
export const SuccessResponseSchema = z.object({
    success: z.literal(true),
    data: z.unknown().optional(),
    message: z.string().optional(),
    timestamp: z.string().datetime().optional()
});
/**
 * Standard error response schema
 */
export const ErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.unknown().optional(),
    timestamp: z.string().datetime().optional(),
    should_retry: z.boolean().optional(),
    should_use_client_fallback: z.boolean().optional()
});
/**
 * Generic API response that can be either success or error
 */
export const ApiResponseSchema = z.union([
    SuccessResponseSchema,
    ErrorResponseSchema
]);
/**
 * Pagination metadata schema
 */
export const PaginationSchema = z.object({
    total: z.number().min(0),
    limit: z.number().min(1).max(100),
    offset: z.number().min(0),
    has_more: z.boolean(),
    page: z.number().min(1).optional(),
    total_pages: z.number().min(1).optional()
});
/**
 * Paginated response schema
 */
export const PaginatedResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(z.unknown()),
    pagination: PaginationSchema,
    timestamp: z.string().datetime().optional()
});
/**
 * Health check response schema
 */
export const HealthCheckSchema = z.object({
    status: z.enum(['healthy', 'unhealthy']),
    timestamp: z.string().datetime(),
    version: z.string(),
    environment: z.string(),
    region: z.string().optional(),
    deployment: z.object({
        id: z.string(),
        url: z.string()
    }),
    checks: z.object({
        database: z.object({
            status: z.enum(['healthy', 'unhealthy']),
            responseTime: z.string(),
            error: z.string().nullable()
        }),
        memory: z.object({
            used: z.number(),
            total: z.number(),
            rss: z.number()
        })
    }),
    uptime: z.number()
});
/**
 * Common query parameter schemas
 */
export const CommonQueryParams = {
    // Standard pagination
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
    page: z.coerce.number().min(1).optional(),
    // Common filters
    profile_id: z.string().uuid().optional(),
    patient_id: z.string().uuid().optional(),
    // Sorting
    sort_by: z.string().max(50).optional(),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
    // Date ranges
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    // Search
    search: z.string().max(200).optional(),
    // Response format
    format: z.enum(['json', 'csv']).default('json')
};
/**
 * Helper functions for creating standard responses
 */
export const ResponseHelpers = {
    success: (data, message) => ({
        success: true,
        data,
        message,
        timestamp: new Date().toISOString()
    }),
    error: (error, details, options) => ({
        success: false,
        error,
        details,
        timestamp: new Date().toISOString(),
        should_retry: options?.shouldRetry,
        should_use_client_fallback: options?.shouldUseClientFallback
    }),
    paginated: (data, pagination) => ({
        success: true,
        data,
        pagination,
        timestamp: new Date().toISOString()
    })
};
