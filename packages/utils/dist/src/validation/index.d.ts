/**
 * Guardian Healthcare Validation Library
 *
 * Centralized validation schemas and utilities for API routes
 * Provides type-safe input validation with healthcare-specific patterns
 */
export { validateInput, validateInputWithSize, validateSecureInput, ValidationError, CommonValidators, type ValidationResult, type ValidationSuccess, type ValidationFailure } from './common';
export { AuditEventSchema, AuditEventResponseSchema, validateAuditEvent, requiresServerSideLogging, type AuditEvent, type AuditEventResponse } from './schemas/audit-events';
export { QualityFlagActionSchema, QualityResolutionSchema, QualityFlagResponseSchema, QualityPathParamsSchema, validateQualityAction, validateQualityPath, type QualityFlagAction, type QualityResolution, type QualityFlagResponse } from './schemas/quality-flags';
export { z } from 'zod';
//# sourceMappingURL=index.d.ts.map