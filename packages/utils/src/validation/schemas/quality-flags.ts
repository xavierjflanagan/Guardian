import { z } from 'zod';
import { CommonValidators } from '../common';
import { 
  QualityActionTypes, 
  QualityFlagStatuses, 
  QualityFlagSeverities 
} from '../../constants/quality-flags';

/**
 * Schema for quality flag resolution data
 */
export const QualityResolutionSchema = z.object({
  status: z.enum(QualityFlagStatuses).optional(),
  
  resolution_notes: z.string()
    .max(1000, 'Resolution notes too long')
    .optional(),
    
  resolved_by: CommonValidators.profileId.optional(),
  
  resolution_timestamp: z.string()
    .datetime()
    .optional(),
    
  // Additional resolution metadata
  metadata: z.record(z.string(), z.unknown()).optional()
});

/**
 * Main quality flag action schema
 * Handles different action types for the quality API
 */
export const QualityFlagActionSchema = z.object({
  action: z.enum(QualityActionTypes),
  
  // Required for most actions except 'list'
  flag_id: CommonValidators.uuid.optional(),
  
  // Required for resolve/update actions
  resolution_data: QualityResolutionSchema.optional(),
  
  // For create action
  flag_data: z.object({
    severity: z.enum(QualityFlagSeverities),
    category: z.string().max(100),
    description: z.string().max(500),
    document_id: CommonValidators.uuid.optional(),
    profile_id: CommonValidators.profileId,
    metadata: z.record(z.string(), z.unknown())
  }).optional(),
  
  // Query parameters for list action
  filters: z.object({
    severity: z.enum(QualityFlagSeverities).optional(),
    status: z.enum(QualityFlagStatuses).optional(),
    profile_id: CommonValidators.profileId.optional(),
    limit: z.number().min(1).max(100),
    offset: z.number().min(0)
  }).optional()
}).refine(
  (data) => {
    // Validation rules based on action type
    if (data.action === 'list') {
      return true; // List doesn't require additional fields
    }
    
    if (['resolve', 'update', 'delete'].includes(data.action)) {
      return !!data.flag_id; // These actions require flag_id
    }
    
    if (data.action === 'create') {
      return !!data.flag_data; // Create requires flag_data
    }
    
    if (data.action === 'resolve') {
      return !!data.resolution_data; // Resolve requires resolution_data
    }
    
    return true;
  },
  {
    message: "Invalid action configuration - check required fields for action type"
  }
);

/**
 * Type inference for TypeScript usage
 */
export type QualityFlagAction = z.infer<typeof QualityFlagActionSchema>;
export type QualityResolution = z.infer<typeof QualityResolutionSchema>;

/**
 * Response schema for quality flag API
 */
export const QualityFlagResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean()
  }).optional()
});

export type QualityFlagResponse = z.infer<typeof QualityFlagResponseSchema>;

/**
 * Helper function to validate quality flag actions
 */
export function validateQualityAction(data: unknown): QualityFlagAction {
  return QualityFlagActionSchema.parse(data);
}

/**
 * Validate URL path parameters for quality flag routes
 */
export const QualityPathParamsSchema = z.object({
  action: z.array(z.string()).transform((arr) => arr.join('/'))
});

export function validateQualityPath(params: unknown): string {
  const validated = QualityPathParamsSchema.parse(params);
  return validated.action;
}

// Re-export constants for backward compatibility
export { QualityActionTypes, QualityFlagStatuses, QualityFlagSeverities };