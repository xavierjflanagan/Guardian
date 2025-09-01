# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Exora** (by Exora Health Pty Ltd) is an AI-powered healthcare application designed to help users aggregate, manage, and understand their medical records. It's a patient-owned healthcare data platform built with Next.js, Supabase, and TypeScript.

**Company:** Exora Health Pty Ltd (Australian company)  
**Primary Domain:** exorahealth.com.au  
**Status:** Still building out the product, currently designing the ai processing component of the pipeline to perfectly fit the database table format.

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

## Staging/Production Deployment Workflow

Exora uses a **dual-environment deployment strategy** for safe development and controlled user testing:

### Environment Overview
- **Production** (`exorahealth.com.au`): Password-protected for beta testers, clean UI
- **Staging** (`staging.exorahealth.com.au`): Developer-only access via Vercel authentication, orange staging banners

### Access Control
- **Production Access**: Requires `SITE_PASSWORD` environment variable (7-day cookie expiry)
- **Staging Access**: Vercel deployment protection - only team members with Vercel account access
- **Security**: Dual-layer protection ensures proper environment isolation

### Daily Development Workflow
```bash
# 1. Work on staging branch
git checkout staging
# Make changes, test features, iterate safely
git add . && git commit -m "feature description" && git push
# This deploys to staging.exorahealth.com.au automatically

# 2. Release to beta testers (when ready)
git checkout main
git merge staging    # Brings staging changes to production
git push            # This deploys to exorahealth.com.au for beta testers
```

### Environment Indicators
- **Staging**: Orange banner with "🚧 STAGING ENVIRONMENT" on all pages
- **Production**: Clean interface with no development indicators
- **Browser Titles**: "[STAGING]" suffix on staging environment only

### V3 Background Processing Architecture
**Render.com Worker Service:** `exora-v3-worker`
- **Staging Deployment**: `staging` branch → Render.com with enhanced debugging
- **Production Deployment**: `main` branch → Render.com with production optimization
- **Purpose**: V3 job queue processing (shell file processing, AI document analysis)
- **Integration**: Supabase service role + V3 job coordination functions
- **Configuration**: See [Render.com Deployment Guide](shared/docs/architecture/database-foundation-v3/render-com-deployment-guide.md)

### Testing (Updated August 2025)
Jest + React Testing Library with **production-quality infrastructure**:
- **Centralized Supabase mocking**: `test-utils/supabase-mocks.ts` for consistent, typed mocks
- **Type-safe validation testing**: `isValidationFailure()` / `isValidationSuccess()` type guards (no more `as any`)
- **Dependency injection patterns**: `useEventLogging(options)` for clean testability
- **Global test environment**: Fetch polyfill, crypto mocking, console management in `jest.setup.js`
- **Healthcare-specific patterns**: PII sanitization, audit trail testing, RLS policy validation
- **Resilient assertions**: `expect.objectContaining()` for robust, maintainable tests
- **CI Status**: ✅ Fully operational - all blocking infrastructure issues resolved

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
 - look it up, changes a lot.

## Development Guidelines

### UI/UX Standards
- **NO EMOJIS**: Never use emojis in user-facing content (UI text, error messages, notifications, etc.) unless explicitly requested by the user
- **NO EMOJIS IN DOCUMENTATION**: Never use emojis in documentation headers, sections, content, README files, architecture docs, technical specifications, or code comments
- Professional healthcare application requires clean, emoji-free interface and documentation
- This applies to all frontend components, API responses, user communications, and technical documentation
- Use clear text headers and bullet points instead of emoji decorations

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

### THE TRUTH: Two Physical ID Types

**Guardian has only TWO physical ID types in the database:**

- **`auth.users.id`**: Account owners (subscription holders, auth entities)
- **`user_profiles.id`**: Individual profiles/patients (the actual medical data subjects)

### Semantic Labeling (Context-Dependent)
The **same physical `user_profiles.id`** gets different semantic labels:
- **`profile_id`**: When used in UI/UX context
- **`patient_id`**: When used in clinical/medical data context
- **They are the SAME VALUE** - just different semantic meaning

### Current v7.0 Reality
**Profile IS the patient** - All clinical data belongs to profiles, not auth users:
- Documents table uses `patient_id` which stores `user_profiles.id` values
- Clinical tables reference `user_profiles.id` (despite schema comments claiming otherwise)
- `get_allowed_patient_ids(profile_id)` returns the same profile_id as patient_id
- Frontend components use `profile_id`, clinical code uses `patient_id` - same physical value

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
- ✅ Phase 3.1 Performance Optimization complete (production deployment ready)
- 🚧 Phase 3.2 Security Hardening in progress (documentation complete, domain acquired, configuration pending)

### Security Infrastructure

Comprehensive security framework established (Phase 3.2):
- **Security Documentation:** Complete security checklist and procedures
- **Compliance Framework:** Australian Privacy Act + HIPAA readiness documentation
- **Testing Framework:** RLS policy testing and security validation procedures
- **Incident Response:** Complete breach response and notification procedures
- **Edge Functions:** Server-side audit logging for critical UI events (implemented)
- **Domain Acquired:** exorahealth.com.au selected as primary (transfer to company pending)
- **BLOCKING:** Domain configuration in Vercel required for CORS/CSP security implementation

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

## AI Processing Pipeline Development Plan

**Current Priority**: Schema Research & AI Integration Strategy

**Problem Identified**: The two-call AI architecture approach needs precise database schema understanding to work effectively. Currently "flying blind" without knowing exact table structures and field requirements.

**Action Plan**:
1. **Deep Database Schema Analysis**: Research all Exora database tables to understand:
   - Exact field structures and data types for each clinical table
   - Required vs optional fields for AI extraction
   - Relationships between tables (foreign keys, joins)
   - Validation rules and constraints

2. **Schema-to-AI Mapping Strategy**: Work backwards from database requirements:
   - Map each table to specific AI extraction requirements
   - Determine minimum viable schema guides for AI models
   - Consider unified generalized schema approach vs table-specific schemas

3. **AI Processing Optimization**: Once schema requirements are clear:
   - Refine two-call vs single-call architecture decision
   - Optimize context window usage based on actual schema sizes
   - Ensure AI output format matches database insertion requirements

**Current Status**: Pipeline architecture documented in `shared/docs/architecture/ai-processing-v2/draft-ai-processing-pipeline-flow.md` - parked pending schema research completion.

**Key Insight**: Need to understand destination (database tables) before optimizing the journey (AI processing pipeline).