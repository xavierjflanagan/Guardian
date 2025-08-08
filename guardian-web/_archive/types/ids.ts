/**
 * Type-safe ID handling for Guardian multi-profile architecture
 * 
 * These branded types prevent accidental mixing of different ID types,
 * catching errors at compile time rather than runtime.
 */

// Branded type definitions
export type ProfileId = string & { readonly __brand: 'ProfileId' };
export type PatientId = string & { readonly __brand: 'PatientId' };
export type UserId = string & { readonly __brand: 'UserId' };
export type DocumentId = string & { readonly __brand: 'DocumentId' };

// Type guard functions
export const isProfileId = (id: string): id is ProfileId => {
  // In production, could add validation logic here
  return typeof id === 'string' && id.length > 0;
};

export const isPatientId = (id: string): id is PatientId => {
  return typeof id === 'string' && id.length > 0;
};

export const isUserId = (id: string): id is UserId => {
  return typeof id === 'string' && id.length > 0;
};

export const isDocumentId = (id: string): id is DocumentId => {
  return typeof id === 'string' && id.length > 0;
};

// Constructor functions with validation
export const ProfileId = (id: string): ProfileId => {
  if (!isProfileId(id)) {
    throw new Error(`Invalid ProfileId: ${id}`);
  }
  return id as ProfileId;
};

export const PatientId = (id: string): PatientId => {
  if (!isPatientId(id)) {
    throw new Error(`Invalid PatientId: ${id}`);
  }
  return id as PatientId;
};

export const UserId = (id: string): UserId => {
  if (!isUserId(id)) {
    throw new Error(`Invalid UserId: ${id}`);
  }
  return id as UserId;
};

export const DocumentId = (id: string): DocumentId => {
  if (!isDocumentId(id)) {
    throw new Error(`Invalid DocumentId: ${id}`);
  }
  return id as DocumentId;
};

// Utility functions for safe conversion
export const toProfileId = (id: string): ProfileId => ProfileId(id);
export const toPatientId = (id: string): PatientId => PatientId(id);
export const toUserId = (id: string): UserId => UserId(id);
export const toDocumentId = (id: string): DocumentId => DocumentId(id);

// Extract raw string from branded types (for database operations)
export const unwrapId = <T extends string>(brandedId: T): string => brandedId as string;

/**
 * ID Semantics in Guardian v7:
 * 
 * - ProfileId: References user_profiles.id - represents a specific profile (self, child, pet)
 * - PatientId: References auth.users.id - represents the clinical data subject 
 * - UserId: References auth.users.id - represents the account owner
 * - DocumentId: References documents.id - represents a uploaded document
 * 
 * KEY DISTINCTION:
 * In Guardian v7.0: ProfileId === PatientId (profile IS the patient)
 * In Guardian v7.1+: ProfileId can map to multiple PatientIds via get_allowed_patient_ids()
 * 
 * Always use the branded types in function signatures:
 * ✅ function fetchDocuments(patientId: PatientId)
 * ❌ function fetchDocuments(patientId: string)
 */

// Common type unions for function parameters
export type AnyId = ProfileId | PatientId | UserId | DocumentId;

// Helper to determine ID type from context (runtime check)
export const inferIdType = (id: string, context: 'profile' | 'patient' | 'user' | 'document'): AnyId => {
  switch (context) {
    case 'profile': return ProfileId(id);
    case 'patient': return PatientId(id);
    case 'user': return UserId(id);
    case 'document': return DocumentId(id);
    default:
      throw new Error(`Unknown ID context: ${context}`);
  }
};