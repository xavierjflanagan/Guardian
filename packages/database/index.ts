// @guardian/database
// Shared database clients and utilities

// Re-export database clients (will be moved here in future phases)
export * from './clients';
export * from './types';

// Placeholder exports for monorepo structure
export const DATABASE_PACKAGE_VERSION = '1.0.0';

// TODO: Move database clients from apps/web/lib/ to this package
// TODO: Generate TypeScript types from Supabase schema
// TODO: Create shared database utilities and helpers