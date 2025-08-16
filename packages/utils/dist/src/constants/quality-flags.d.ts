/**
 * Shared constants for quality flags
 * Single source of truth for both API routes and Edge Functions
 */
/**
 * Quality flag action types supported by the API
 */
export declare const QualityActionTypes: readonly ["list", "resolve", "create", "update", "delete"];
export type QualityActionType = typeof QualityActionTypes[number];
/**
 * Quality flag status values
 */
export declare const QualityFlagStatuses: readonly ["pending", "resolved", "dismissed", "escalated"];
export type QualityFlagStatus = typeof QualityFlagStatuses[number];
/**
 * Quality flag severity levels
 */
export declare const QualityFlagSeverities: readonly ["low", "medium", "high", "critical"];
export type QualityFlagSeverity = typeof QualityFlagSeverities[number];
//# sourceMappingURL=quality-flags.d.ts.map