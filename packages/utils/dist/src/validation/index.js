/**
 * Guardian Healthcare Validation Library
 *
 * Centralized validation schemas and utilities for API routes
 * Provides type-safe input validation with healthcare-specific patterns
 */
// Core validation utilities
export { validateInput, validateInputWithSize, validateSecureInput, ValidationError, CommonValidators } from './common';
// Audit events validation
export { AuditEventSchema, AuditEventResponseSchema, validateAuditEvent, requiresServerSideLogging } from './schemas/audit-events';
// Quality flags validation  
export { QualityFlagActionSchema, QualityResolutionSchema, QualityFlagResponseSchema, QualityPathParamsSchema, validateQualityAction, validateQualityPath } from './schemas/quality-flags';
// Common API patterns - will be added in Phase 2
// Re-export Zod for convenience
export { z } from 'zod';
