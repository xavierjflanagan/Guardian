/**
 * Shared constants for quality flags
 * Single source of truth for both API routes and Edge Functions
 */

/**
 * Quality flag action types supported by the API
 */
export const QualityActionTypes = [
  'list',
  'resolve', 
  'create',
  'update',
  'delete'
] as const;

export type QualityActionType = typeof QualityActionTypes[number];

/**
 * Quality flag status values
 */
export const QualityFlagStatuses = [
  'pending',
  'resolved',
  'dismissed',
  'escalated'
] as const;

export type QualityFlagStatus = typeof QualityFlagStatuses[number];

/**
 * Quality flag severity levels
 */
export const QualityFlagSeverities = [
  'low',
  'medium', 
  'high',
  'critical'
] as const;

export type QualityFlagSeverity = typeof QualityFlagSeverities[number];