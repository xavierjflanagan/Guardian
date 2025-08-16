import { z } from 'zod';
import { QualityActionTypes, QualityFlagStatuses, QualityFlagSeverities } from '../../constants/quality-flags';
/**
 * Schema for quality flag resolution data
 */
export declare const QualityResolutionSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        resolved: "resolved";
        dismissed: "dismissed";
        escalated: "escalated";
    }>>;
    resolution_notes: z.ZodOptional<z.ZodString>;
    resolved_by: z.ZodOptional<z.ZodString>;
    resolution_timestamp: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
/**
 * Main quality flag action schema
 * Handles different action types for the quality API
 */
export declare const QualityFlagActionSchema: z.ZodObject<{
    action: z.ZodEnum<{
        list: "list";
        resolve: "resolve";
        create: "create";
        update: "update";
        delete: "delete";
    }>;
    flag_id: z.ZodOptional<z.ZodString>;
    resolution_data: z.ZodOptional<z.ZodObject<{
        status: z.ZodOptional<z.ZodEnum<{
            pending: "pending";
            resolved: "resolved";
            dismissed: "dismissed";
            escalated: "escalated";
        }>>;
        resolution_notes: z.ZodOptional<z.ZodString>;
        resolved_by: z.ZodOptional<z.ZodString>;
        resolution_timestamp: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    flag_data: z.ZodOptional<z.ZodObject<{
        severity: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        category: z.ZodString;
        description: z.ZodString;
        document_id: z.ZodOptional<z.ZodString>;
        profile_id: z.ZodString;
        metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
    filters: z.ZodOptional<z.ZodObject<{
        severity: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        status: z.ZodOptional<z.ZodEnum<{
            pending: "pending";
            resolved: "resolved";
            dismissed: "dismissed";
            escalated: "escalated";
        }>>;
        profile_id: z.ZodOptional<z.ZodString>;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Type inference for TypeScript usage
 */
export type QualityFlagAction = z.infer<typeof QualityFlagActionSchema>;
export type QualityResolution = z.infer<typeof QualityResolutionSchema>;
/**
 * Response schema for quality flag API
 */
export declare const QualityFlagResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
    pagination: z.ZodOptional<z.ZodObject<{
        total: z.ZodNumber;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
        has_more: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type QualityFlagResponse = z.infer<typeof QualityFlagResponseSchema>;
/**
 * Helper function to validate quality flag actions
 */
export declare function validateQualityAction(data: unknown): QualityFlagAction;
/**
 * Validate URL path parameters for quality flag routes
 */
export declare const QualityPathParamsSchema: z.ZodObject<{
    action: z.ZodPipe<z.ZodArray<z.ZodString>, z.ZodTransform<string, string[]>>;
}, z.core.$strip>;
export declare function validateQualityPath(params: unknown): string;
export { QualityActionTypes, QualityFlagStatuses, QualityFlagSeverities };
//# sourceMappingURL=quality-flags.d.ts.map