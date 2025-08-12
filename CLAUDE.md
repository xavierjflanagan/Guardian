# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guardian is an AI-powered healthcare application designed to help users aggregate, manage, and understand their medical records. It's a patient-owned healthcare data platform built with Next.js, Supabase, and TypeScript.

## Development Commands

### Monorepo Commands (PNPM)
```bash
# Install dependencies (from root)
pnpm install

# Development server
pnpm --filter @guardian/web run dev  # Starts Next.js dev server on http://localhost:3000

# Build and deployment
pnpm --filter @guardian/web run build  # Production build
pnpm --filter @guardian/web run start  # Production server
pnpm --filter @guardian/web run lint   # ESLint code linting
pnpm --filter @guardian/web run typecheck  # TypeScript checking
pnpm --filter @guardian/web run test   # Jest test suite
```

### Environment Setup (PNPM)
```bash
corepack enable
corepack prepare pnpm@9.15.1 --activate
pnpm install
```

### Testing
Jest + React Testing Library configured with healthcare-specific patterns:
- PII sanitization in test data
- Console warning suppression for rate limiting
- Healthcare-compliant error boundary testing
- Profile and patient ID isolation testing

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15.3.4 with React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL database, Auth, Storage, Edge Functions)
- **Authentication**: Magic link authentication via Supabase Auth with PKCE flow
- **File Storage**: Supabase Storage with user-isolated folders
- **Edge Functions**: Deno runtime for document processing

### Core Systems

#### 1. Authentication System (`lib/`)
- **Client-side**: `supabaseClientSSR.ts` - Browser client with PKCE flow
- **Server-side**: `supabaseServerClient.ts` - Server client for auth callbacks
- **Middleware**: `middleware.ts` - Session management and cookie refresh
- Magic link flow with comprehensive error handling

#### 2. File Upload & Storage (`utils/uploadFile.ts`)
- Supabase Storage with `medical-docs` bucket
- User-specific folder structure: `medical-docs/{userId}/{timestamp}_{filename}`
- Atomic operations with database record creation
- Row Level Security (RLS) for user data isolation

#### 3. Document Processing Pipeline
- **Edge Function**: `supabase/functions/document-processor/`
- Deno runtime with TypeScript support
- Status tracking: uploaded → processing → completed
- Ready for OCR and AI integration

#### 4. Database Schema
- **documents table**: Core document metadata with user isolation
- **RLS policies**: Automatic user-based filtering
- **Storage policies**: User-specific folder access

### File Structure
```
guardian-web/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (main)/            # Main application pages
│   └── auth/              # Auth callbacks and errors
├── lib/                   # Supabase client configurations
├── utils/                 # Utility functions (file upload)
├── middleware.ts          # Session management
└── supabase/
    ├── config.toml        # Local development configuration
    └── functions/         # Edge Functions (Deno)
```

## Development Guidelines

### TypeScript Configuration
- Strict mode enabled with Next.js optimizations
- Path aliases: `@/*` maps to root directory
- Excludes Supabase functions from main TypeScript compilation

### Environment Setup
1. Clone repository (monorepo structure with PNPM)
2. Install dependencies with `pnpm install` from root
3. Configure Supabase project and environment variables
4. Run `pnpm --filter @guardian/web run dev` for local development

### Supabase Integration
- **Local development**: Uses `supabase/config.toml` for auth and function configuration
- **Edge Functions**: Located in `supabase/functions/` with Deno runtime
- **Database**: PostgreSQL with RLS enabled for security

### Security Considerations
- Row Level Security (RLS) enforced on all user data
- PKCE authentication flow for enhanced security
- User data isolation in both database and storage
- Input validation on file uploads

## ⚠️ CRITICAL: ID Semantics and Data Access Patterns

### ID Types and Their Meanings

**NEVER mix these ID types - they serve different purposes in Guardian's multi-profile architecture:**

- **`profile_id`**: References `user_profiles.id` - represents a specific profile (self, child, pet)
- **`patient_id`**: References `auth.users.id` - represents the clinical data subject
- **`user_id`**: References `auth.users.id` - represents the account owner (same as patient_id in v7.0)

### Current v7.0 Semantics
In Guardian v7.0: **Profile IS the patient** (`profile_id === patient_id`)
- Documents table uses `patient_id` (NOT `user_id`)
- Clinical data uses `patient_id` for data isolation
- Frontend components use `profile_id` for user experience
- `get_allowed_patient_ids(profile_id)` resolves profile→patient mapping

### Critical Database Tables
```sql
-- CORRECT queries (post Phase 0 fixes):
SELECT * FROM documents WHERE patient_id = ?     -- ✅ Correct
SELECT * FROM user_events WHERE profile_id = ?   -- ✅ Correct 

-- INCORRECT queries (would fail):
SELECT * FROM documents WHERE user_id = ?        -- ❌ Wrong column name
SELECT * FROM user_events WHERE patient_id = ?   -- ❌ Wrong context
```

### Frontend Data Access Pattern
```typescript
// ✅ CORRECT: Use ProfileProvider + resolution
const { currentProfile } = useProfile();
const { patientIds } = useAllowedPatients(); // Resolves profile→patient
await supabase.from('documents').select('*').in('patient_id', patientIds);

// ❌ INCORRECT: Direct user ID usage
await supabase.from('documents').select('*').eq('user_id', user.id);
```

### Audit Logging Pattern
```typescript
// ✅ CORRECT: Use profile-aware audit function
await supabase.rpc('log_profile_audit_event', {
  p_profile_id: currentProfile.id,  // Function resolves to patient_id
  p_operation: 'DOCUMENT_VIEW',
  // ... other params
});

// ❌ INCORRECT: Direct patient_id assignment
await supabase.rpc('log_audit_event', {
  p_patient_id: currentProfile.id,  // Wrong! profile_id ≠ patient_id
  // ... other params  
});
```

### TypeScript Type Safety
Use branded types to prevent ID mix-ups:
```typescript
import { ProfileId, PatientId } from '@/types/ids';

// ✅ CORRECT: Function signature enforces correct ID type
function fetchDocuments(patientId: PatientId) { /* ... */ }
function switchProfile(profileId: ProfileId) { /* ... */ }

// ❌ INCORRECT: Generic string allows wrong ID usage
function fetchDocuments(id: string) { /* ... */ }
```

## Current Status

The core infrastructure is complete and production-ready:
- ✅ Authentication system fully functional
- ✅ File upload and storage system operational
- ✅ Document processing pipeline operational (Vision + OCR)
- ✅ User interface polished and responsive
- ✅ AI/OCR integration complete - **POC ready for testing**
- ✅ Phase 0 Critical Fixes implemented (ID semantics, ProfileProvider, missing tables)

### Document Processing Pipeline

The application now includes a cost-optimized **Vision + OCR Safety Net** pipeline:

#### Required Environment Variables
```bash
# Core Supabase (existing)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# New AI Processing APIs
OPENAI_API_KEY=your_openai_api_key          # For GPT-4o Mini vision analysis
GOOGLE_CLOUD_API_KEY=your_google_api_key    # For Google Cloud Vision OCR

# Legacy (can be removed)
AWS_ACCESS_KEY_ID=optional                  # Old Textract integration
AWS_SECRET_ACCESS_KEY=optional              # Old Textract integration
AWS_REGION=optional                         # Old Textract integration
```

#### Pipeline Architecture
1. **Google Cloud Vision OCR** (~$1.50/1K docs) - Text extraction safety net
2. **GPT-4o Mini Vision** (~$15-30/1K docs) - Medical data analysis with OCR cross-validation
3. **Database Storage** - Structured medical data with confidence scores

#### Cost Analysis
- **Previous**: AWS Textract ~$250/1K docs
- **Current**: Vision + OCR ~$16.50-31.50/1K docs (**85-90% cost reduction**)

#### API Endpoints
- `POST /functions/v1/document-processor` - Process uploaded documents
- Returns structured medical data with confidence scores