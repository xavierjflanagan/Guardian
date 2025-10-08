# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Exora** (by Exora Health Pty Ltd) is an AI-powered healthcare application designed to help users aggregate, manage, and understand their medical records. It's a patient-owned healthcare data platform built with Next.js, Supabase, Render.com, Vercel and TypeScript.

**Company:** Exora Health Pty Ltd (Australian company)
**Primary Domain:** exorahealth.com.au
**Status:** V3 architecture operational. Pass 1 entity detection implemented and running. Pass 2 and Pass 3 in design phase.

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

Exora uses a **single-branch production workflow** for simplicity:

### Environment Overview
- **Production** (`exorahealth.com.au`): Main production environment on `main` branch
- **Development**: Local development environment only

### Access Control
- **Production Access**: Requires `SITE_PASSWORD` environment variable (7-day cookie expiry)
- **Security**: Password protection for beta tester access

### Daily Development Workflow
```bash
# Work on main branch (simplified workflow)
git checkout main
# Make changes, test locally, then deploy
git add . && git commit -m "feature description" && git push
# This deploys to exorahealth.com.au automatically via Vercel
```

### V3 Background Processing Architecture
**Render.com Worker Service:** `Exora Health`
- **Deployment**: `main` branch → Render.com auto-deploy
- **Purpose**: V3 job queue processing (shell file processing, AI document analysis)
- **Integration**: Supabase service role + V3 job coordination functions
- **Configuration**: See [V3 Architecture Master Guide](shared/docs/architecture/database-foundation-v3/V3_ARCHITECTURE_MASTER_GUIDE.md)

### Testing (Updated October 2025)
Jest + React Testing Library with **production-quality infrastructure**:
- **Centralized Supabase mocking**: `test-utils/supabase-mocks.ts` for consistent, typed mocks
- **Type-safe validation testing**: `isValidationFailure()` / `isValidationSuccess()` type guards (no more `as any`)
- **Dependency injection patterns**: `useEventLogging(options)` for clean testability
- **Global test environment**: Fetch polyfill, crypto mocking, console management in `jest.setup.js`
- **Healthcare-specific patterns**: PII sanitization, audit trail testing, RLS policy validation
- **Resilient assertions**: `expect.objectContaining()` for robust, maintainable tests
- **CI Status**: Fully operational - all blocking infrastructure issues resolved

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15.3.4 with React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL database, Auth, Storage, Edge Functions)
- **Background Workers**: Render.com Node.js service for AI processing
- **Authentication**: Magic link authentication via Supabase Auth with PKCE flow
- **File Storage**: Supabase Storage with user-isolated folders
- **Edge Functions**: Deno runtime for document processing and audit logging

### Core Systems

#### 1. Authentication System (`lib/`)
- **Client-side**: `supabaseClientSSR.ts` - Browser client with PKCE flow
- **Server-side**: `supabaseServerClient.ts` - Server client for auth callbacks
- **Middleware**: `middleware.ts` - Session management and cookie refresh
- Magic link flow with comprehensive error handling

#### 2. File Upload & Storage
- Supabase Storage with user-isolated folders
- Atomic operations with database record creation
- Row Level Security (RLS) for user data isolation

#### 3. V3 Document Processing Pipeline

**Architecture:** Three-stage pipeline with job queue coordination

**Stage 1: Document Upload & Job Creation**
- User uploads document via web frontend
- `shell-file-processor-v3` Edge Function creates shell_file record
- Job enqueued to `job_queue` table via `enqueue_job_v3()` RPC

**Stage 2: Background AI Processing (Render.com Worker)**
- Worker claims job via `claim_next_job_v3()` RPC
- **Pass 1: Entity Detection** (OPERATIONAL)
  - Location: `apps/render-worker/src/pass1/`
  - Uses OpenAI GPT-4o Vision for entity detection
  - Uses Google Cloud Vision OCR for text extraction
  - Writes to 7 database tables (entity_processing_audit, ai_processing_sessions, etc.)
- **Pass 2: Clinical Extraction** (DESIGNED, not yet implemented)
  - Schema complete in `current_schema/08_job_coordination.sql`
  - Bridge schemas defined
- **Pass 3: Narrative Generation** (DESIGNED, not yet implemented)
  - Schema complete
  - Bridge schemas defined

**Stage 3: Completion & Frontend Display**
- Worker completes job via `complete_job()` RPC
- Frontend displays processed medical data

#### 4. Database Schema

**CRITICAL: Source of Truth Location**
All database schemas are maintained in:
```
shared/docs/architecture/database-foundation-v3/current_schema/
├── 01_foundations.sql          # Extensions, audit logging
├── 02_profiles.sql             # User profiles, access control
├── 03_clinical_core.sql        # Shell files, clinical data
├── 04_ai_processing.sql        # AI pipeline infrastructure
├── 05_healthcare_journey.sql   # Provider relationships
├── 06_security.sql             # RLS policies
├── 07_optimization.sql         # Performance indexes
└── 08_job_coordination.sql     # V3 job queue, worker coordination, metrics tables
```

**DO NOT** read `supabase/migrations/` - those are historical deployment artifacts.
**DO** read `current_schema/*.sql` files for current database structure.

### Supabase Edge Functions

Current operational Edge Functions:
- **shell-file-processor-v3**: Document upload processing, job enqueuing
- **audit-logger-v3**: Correlation logging and audit trail
- **auto-provision-user-profile**: Automatic user profile creation

**Source of truth:** `shared/docs/architecture/database-foundation-v3/current_functions/`
**Deployed artifacts:** `supabase/functions/` (may be outdated)

### File Structure
- **Monorepo root**: `/`
- **Web application**: `apps/web/`
- **Render worker (deployed)**: `apps/render-worker/`
- **Render worker (source of truth)**: `shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/`
- **Shared packages**: `packages/`

**CRITICAL**: The `apps/render-worker/` and `current_workers/exora-v3-worker/` directories are OUT OF SYNC. Always check both locations when investigating worker behavior.

## Backend Inspection Tools

Claude Code has access to **Render.com MCP** and **Supabase MCP** for backend inspection and management:

### Supabase MCP Tools
- `mcp__supabase__execute_sql` - Run read-only SQL queries against the database
- `mcp__supabase__apply_migration` - Create and execute database migrations
- `mcp__supabase__list_tables` - List all tables in schemas (WARNING: large output, use with caution)
- `mcp__supabase__get_advisors` - Check for security vulnerabilities and performance issues
- `mcp__supabase__get_logs` - Fetch logs for debugging (last 1 minute window)
- `mcp__supabase__generate_typescript_types` - Generate types from database schema

### Render.com MCP Tools
- `mcp__render__list_services` - List all Render services (requires workspace selection first)
- `mcp__render__get_service` - Get details about a specific service
- `mcp__render__list_deploys` - List deployments for a service
- `mcp__render__get_deploy` - Get deployment details
- `mcp__render__list_logs` - Fetch service logs for debugging
- `mcp__render__get_metrics` - Get performance metrics (CPU, memory, HTTP requests)

### Usage Guidelines
- Always verify backend state using these tools rather than assumptions
- Use logs and metrics for debugging production issues
- Check database schema before making migration decisions
- For Render MCP: User must select workspace before tools can be used

## Database Migration Procedure

All database schema changes follow a strict **two-touchpoint workflow** to maintain data integrity and audit trails:

### Two-Touchpoint Workflow

**Touchpoint 1: Research + Create Script (AI single response)**
1. Research what needs to change and perform impact analysis
2. Identify which `current_schema/*.sql` files need updates (with line numbers)
3. Create complete migration script in `migration_history/`
4. Present script for human review + second AI bot review

**Touchpoint 2: Execute + Finalize (AI single response, after review approval)**
1. Apply any feedback from human + second AI bot review
2. Execute migration via `mcp__supabase__apply_migration()`
3. Update source of truth: `current_schema/*.sql` files
4. Update downstream files:
   - Bridge schemas (`bridge-schemas/source/*.md`)
   - Detailed schemas (`bridge-schemas/detailed/*.json`)
   - Minimal schemas (`bridge-schemas/minimal/*.json`)
   - Worker TypeScript files (if applicable)
   - Type definitions (if applicable)
5. Mark migration header complete with execution date and checkboxes

### Key Locations
- **Migration History:** `shared/docs/architecture/database-foundation-v3/migration_history/`
- **Source of Truth Schemas:** `shared/docs/architecture/database-foundation-v3/current_schema/`
- **Migration README:** See `migration_history/README.md` for complete procedure and template

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

## CRITICAL: ID Semantics and Data Access Patterns

### THE TRUTH: Two Physical ID Types

**Exora has only TWO physical ID types in the database:**

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
SELECT * FROM shell_files WHERE patient_id = ?     -- Correct
SELECT * FROM user_events WHERE profile_id = ?     -- Correct

-- INCORRECT queries (would fail):
SELECT * FROM shell_files WHERE user_id = ?        -- Wrong column name
SELECT * FROM user_events WHERE patient_id = ?     -- Wrong context
```

### Frontend Data Access Pattern
```typescript
// CORRECT: Use ProfileProvider + resolution
const { currentProfile } = useProfile();
const { patientIds } = useAllowedPatients(); // Resolves profile→patient
await supabase.from('shell_files').select('*').in('patient_id', patientIds);

// INCORRECT: Direct user ID usage
await supabase.from('shell_files').select('*').eq('user_id', user.id);
```

### Audit Logging Pattern
```typescript
// CORRECT: Use profile-aware audit function
await supabase.rpc('log_profile_audit_event', {
  p_profile_id: currentProfile.id,  // Function resolves to patient_id
  p_operation: 'DOCUMENT_VIEW',
  // ... other params
});

// INCORRECT: Direct patient_id assignment
await supabase.rpc('log_audit_event', {
  p_patient_id: currentProfile.id,  // Wrong! profile_id ≠ patient_id
  // ... other params
});
```

### TypeScript Type Safety
Use branded types to prevent ID mix-ups:
```typescript
import { ProfileId, PatientId } from '@/types/ids';

// CORRECT: Function signature enforces correct ID type
function fetchDocuments(patientId: PatientId) { /* ... */ }
function switchProfile(profileId: ProfileId) { /* ... */ }

// INCORRECT: Generic string allows wrong ID usage
function fetchDocuments(id: string) { /* ... */ }
```

## Current Status

The core infrastructure is complete and operational:
- Authentication system fully functional
- File upload and storage system operational
- V3 architecture deployed and operational
- Pass 1 entity detection IMPLEMENTED and running on Render.com
- Pass 2 and Pass 3 schemas designed, implementation pending
- User interface polished and responsive
- Phase 0 Critical Fixes implemented (ID semantics, ProfileProvider, missing tables)

### V3 AI Processing Pipeline - Current Status

**Architecture:** Three-pass pipeline for medical document processing

#### Pass 1: Entity Detection - OPERATIONAL
- **Location:** `apps/render-worker/src/pass1/`
- **Model:** OpenAI GPT-4o Vision
- **OCR:** Google Cloud Vision
- **Purpose:** Detect and classify all entities in medical documents
- **Database Tables:** Writes to 7 tables (entity_processing_audit, ai_processing_sessions, ai_confidence_scoring, manual_review_queue, profile_classification_audit, pass1_entity_metrics, shell_files)
- **Status:** Fully implemented and operational on Render.com
- **Cost:** ~$15-30 per 1,000 documents (85-90% reduction from AWS Textract)

#### Pass 2: Clinical Extraction - DESIGNED
- **Purpose:** Extract structured clinical data from Pass 1 entities
- **Schema:** Complete bridge schemas defined in `bridge-schemas/source/pass-2/`
- **Database Tables:** Schema complete in `current_schema/08_job_coordination.sql`
- **Status:** Schema complete, implementation pending

#### Pass 3: Narrative Generation - DESIGNED
- **Purpose:** Generate patient-friendly medical summaries
- **Schema:** Designed
- **Status:** Planning phase

### Integration Points
- **Job Queue:** V3 job coordination via Supabase (`job_queue` table)
- **Worker:** Render.com service "Exora Health" processes jobs from queue
- **Edge Functions:**
  - `shell-file-processor-v3` - Document upload and job enqueuing
  - `audit-logger-v3` - Audit trail correlation
  - `auto-provision-user-profile` - Automatic profile creation

### Required Environment Variables
```bash
# Core Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Processing APIs (for Render.com worker)
OPENAI_API_KEY=your_openai_api_key          # For GPT-4o Vision analysis
GOOGLE_CLOUD_API_KEY=your_google_api_key    # For Google Cloud Vision OCR

# Worker Configuration
NODE_ENV=production
WORKER_CONCURRENCY=50
HEALTH_CHECK_PORT=10000
```

### API Endpoints
- `POST /functions/v1/shell-file-processor-v3` - Process and enqueue document for AI analysis
- `POST /functions/v1/audit-logger-v3` - Log audit events with correlation
- `POST /functions/v1/auto-provision-user-profile` - Auto-create user profile

## Key Architecture Documents

For deep understanding of the V3 system, consult these documents:

### Master Architecture Guide
- **V3 Architecture Master Guide**: `shared/docs/architecture/database-foundation-v3/V3_ARCHITECTURE_MASTER_GUIDE.md`
  - Complete system overview
  - Source of truth vs deployment artifacts explanation
  - Integration patterns
  - Development workflow

### Database Documentation
- **Current Schema Files**: `shared/docs/architecture/database-foundation-v3/current_schema/*.sql`
  - Always read these for current database structure
  - Never read `supabase/migrations/` (historical artifacts)

### Migration Documentation
- **Migration Procedure**: `shared/docs/architecture/database-foundation-v3/migration_history/README.md`
  - Two-touchpoint workflow
  - Migration script template
  - Best practices

### Worker Documentation
- **Render.com Deployment Guide**: `shared/docs/architecture/database-foundation-v3/render-com-deployment-guide.md`
- **Worker Architecture**: `shared/docs/architecture/database-foundation-v3/current_workers/WORKER_ARCHITECTURE.md`

### Bridge Schemas
- **Pass 1 Schemas**: `shared/docs/architecture/database-foundation-v3/ai-processing-v3/bridge-schema-architecture/bridge-schemas/source/pass-1/`
- **Pass 2 Schemas**: `shared/docs/architecture/database-foundation-v3/ai-processing-v3/bridge-schema-architecture/bridge-schemas/source/pass-2/`

## Important Notes

1. **Source of Truth Pattern**: Always check `current_*` directories in `shared/docs/architecture/database-foundation-v3/` for current code. Deployment artifacts (`apps/render-worker/`, `supabase/functions/`) may be outdated.

2. **Worker Sync Issue**: `apps/render-worker/` and `current_workers/exora-v3-worker/` are OUT OF SYNC. Check both when investigating issues.

3. **Pass 1 Only**: Only Pass 1 entity detection is currently implemented. Pass 2 and Pass 3 are schema-complete but not yet coded.

4. **Google Cloud Vision**: Currently using Google Cloud Vision for OCR (not AWS Textract).

5. **Single Branch Workflow**: Everything deploys from `main` branch (staging branch workflow was discontinued).

6. **Job Queue Architecture**: All background processing goes through `job_queue` table with RPC functions (`enqueue_job_v3`, `claim_next_job_v3`, `complete_job`).
