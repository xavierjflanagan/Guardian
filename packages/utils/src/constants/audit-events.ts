/**
 * Shared constants for audit events
 * Single source of truth for both API routes and Edge Functions
 */

/**
 * Healthcare-specific critical audit event types
 * Must match exactly with Edge Function implementation
 */
export const CriticalEventTypes = [
  'document_access',
  'profile_switch', 
  'data_export',
  'authentication_event',
  'medical_data_modification',
  'consent_change',
  'provider_access_grant',
  'security_event'
] as const;

export type CriticalEventType = typeof CriticalEventTypes[number];

/**
 * Privacy levels for audit events
 */
export const PrivacyLevels = [
  'public', 
  'internal', 
  'sensitive'
] as const;

export type PrivacyLevel = typeof PrivacyLevels[number];

/**
 * Compliance categories for healthcare audit events
 */
export const ComplianceCategories = [
  'hipaa', 
  'gdpr', 
  'clinical_decision', 
  'consent_management'
] as const;

export type ComplianceCategory = typeof ComplianceCategories[number];

/**
 * Critical audit patterns that require server-side logging
 * Must match exactly with Edge Function implementation
 */
export const CRITICAL_AUDIT_PATTERNS = [
  // Document access patterns
  'data_access.document_view',
  'data_access.document_download', 
  'data_access.document_export',
  
  // Profile and authentication events
  'profile.switch',
  'profile.access_granted',
  'system.authentication_success',
  'system.authentication_failure',
  
  // Medical data modifications
  'data_access.medical_record_edit',
  'interaction.consent_change',
  'data_access.provider_access_grant',
  
  // Security events
  'system.security_violation',
  'system.unauthorized_access_attempt',
  'navigation.restricted_area_access'
] as const;

/**
 * Check if an event requires server-side logging
 * Shared implementation for both API and Edge Function
 */
export function requiresServerSideLogging(eventType: string, action: string): boolean {
  const eventKey = `${eventType}.${action}`;
  return CRITICAL_AUDIT_PATTERNS.includes(eventKey as any) || 
         CriticalEventTypes.includes(eventType as any);
}

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
  
  // Optional resource tracking
  resource_id?: string;
  resource_type?: string;
  compliance_category?: ComplianceCategory;
}