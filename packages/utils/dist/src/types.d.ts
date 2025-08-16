/**
 * Common type definitions for the Guardian Healthcare Platform
 * Branded types prevent ID mix-ups across the application
 */
export type ProfileId = string & {
    readonly __brand: 'ProfileId';
};
export type PatientId = string & {
    readonly __brand: 'PatientId';
};
export type DocumentId = string & {
    readonly __brand: 'DocumentId';
};
export type SessionId = string & {
    readonly __brand: 'SessionId';
};
export type ProviderId = string & {
    readonly __brand: 'ProviderId';
};
export interface BaseProfile {
    id: ProfileId;
    display_name: string;
    profile_type: 'self' | 'child' | 'dependent' | 'pet';
    patient_id: PatientId;
    created_at: string;
    updated_at: string;
}
export interface AuditContext {
    profile_id: ProfileId;
    session_id: SessionId;
    user_agent?: string;
    ip_address?: string;
    timestamp: string;
}
export declare function isProfileId(value: string): value is ProfileId;
export declare function isPatientId(value: string): value is PatientId;
//# sourceMappingURL=types.d.ts.map