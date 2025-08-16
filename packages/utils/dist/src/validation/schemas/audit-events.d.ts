import { z } from 'zod';
import { requiresServerSideLogging } from '../../constants/audit-events';
/**
 * Audit event schema for critical healthcare compliance events
 * Matches the Edge Function audit-events implementation
 */
export declare const AuditEventSchema: z.ZodObject<{
    event_type: z.ZodEnum<{
        document_access: "document_access";
        profile_switch: "profile_switch";
        data_export: "data_export";
        authentication_event: "authentication_event";
        medical_data_modification: "medical_data_modification";
        consent_change: "consent_change";
        provider_access_grant: "provider_access_grant";
        security_event: "security_event";
    }>;
    action: z.ZodString;
    profile_id: z.ZodString;
    patient_id: z.ZodOptional<z.ZodString>;
    metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    privacy_level: z.ZodEnum<{
        public: "public";
        internal: "internal";
        sensitive: "sensitive";
    }>;
    session_id: z.ZodString;
    resource_id: z.ZodOptional<z.ZodString>;
    resource_type: z.ZodOptional<z.ZodString>;
    compliance_category: z.ZodOptional<z.ZodEnum<{
        hipaa: "hipaa";
        gdpr: "gdpr";
        clinical_decision: "clinical_decision";
        consent_management: "consent_management";
    }>>;
}, z.core.$strip>;
/**
 * Type inference for TypeScript usage
 */
export type AuditEvent = z.infer<typeof AuditEventSchema>;
/**
 * Validation for audit event API responses
 */
export declare const AuditEventResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    audit_id: z.ZodOptional<z.ZodString>;
    integrity_hash: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    should_retry: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AuditEventResponse = z.infer<typeof AuditEventResponseSchema>;
/**
 * Helper function to validate and sanitize audit events
 */
export declare function validateAuditEvent(data: unknown): AuditEvent;
export { requiresServerSideLogging };
//# sourceMappingURL=audit-events.d.ts.map