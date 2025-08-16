import { z } from 'zod';
import { CommonValidators } from '../common';
import { 
  CriticalEventTypes, 
  PrivacyLevels, 
  ComplianceCategories,
  requiresServerSideLogging 
} from '../../constants/audit-events';

/**
 * Audit event schema for critical healthcare compliance events
 * Matches the Edge Function audit-events implementation
 */
export const AuditEventSchema = z.object({
  event_type: z.enum(CriticalEventTypes),
  
  action: CommonValidators.auditAction,
  
  profile_id: CommonValidators.profileId,
  
  patient_id: CommonValidators.patientId.optional(),
  
  metadata: CommonValidators.metadata,
  
  privacy_level: z.enum(PrivacyLevels),
  
  session_id: CommonValidators.sessionId,
  
  // Optional resource tracking
  resource_id: z.string()
    .max(255, 'Resource ID too long')
    .optional(),
    
  resource_type: z.string()
    .max(100, 'Resource type too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid resource type format')
    .optional(),
    
  compliance_category: z.enum(ComplianceCategories).optional()
});

/**
 * Type inference for TypeScript usage
 */
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * Validation for audit event API responses
 */
export const AuditEventResponseSchema = z.object({
  success: z.boolean(),
  audit_id: z.string().optional(),
  integrity_hash: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  should_retry: z.boolean().optional()
});

export type AuditEventResponse = z.infer<typeof AuditEventResponseSchema>;

/**
 * Helper function to validate and sanitize audit events
 */
export function validateAuditEvent(data: unknown): AuditEvent {
  return AuditEventSchema.parse(data);
}

// Export the shared function for backward compatibility
export { requiresServerSideLogging };