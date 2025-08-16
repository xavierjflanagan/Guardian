/**
 * Shared constants for audit events
 * Single source of truth for both API routes and Edge Functions
 */
/**
 * Healthcare-specific critical audit event types
 * Must match exactly with Edge Function implementation
 */
export declare const CriticalEventTypes: readonly ["document_access", "profile_switch", "data_export", "authentication_event", "medical_data_modification", "consent_change", "provider_access_grant", "security_event"];
export type CriticalEventType = typeof CriticalEventTypes[number];
/**
 * Privacy levels for audit events
 */
export declare const PrivacyLevels: readonly ["public", "internal", "sensitive"];
export type PrivacyLevel = typeof PrivacyLevels[number];
/**
 * Compliance categories for healthcare audit events
 */
export declare const ComplianceCategories: readonly ["hipaa", "gdpr", "clinical_decision", "consent_management"];
export type ComplianceCategory = typeof ComplianceCategories[number];
/**
 * Critical audit patterns that require server-side logging
 * Must match exactly with Edge Function implementation
 */
export declare const CRITICAL_AUDIT_PATTERNS: readonly ["data_access.document_view", "data_access.document_download", "data_access.document_export", "profile.switch", "profile.access_granted", "system.authentication_success", "system.authentication_failure", "data_access.medical_record_edit", "interaction.consent_change", "data_access.provider_access_grant", "system.security_violation", "system.unauthorized_access_attempt", "navigation.restricted_area_access"];
/**
 * Check if an event requires server-side logging
 * Shared implementation for both API and Edge Function
 */
export declare function requiresServerSideLogging(eventType: string, action: string): boolean;
/**
 * Audit event interface matching Edge Function
 */
export interface CriticalAuditEvent {
    event_type: CriticalEventType;
    action: string;
    profile_id: string;
    patient_id?: string;
    metadata: Record<string, unknown>;
    privacy_level: PrivacyLevel;
    session_id: string;
    resource_id?: string;
    resource_type?: string;
    compliance_category?: ComplianceCategory;
}
//# sourceMappingURL=audit-events.d.ts.map