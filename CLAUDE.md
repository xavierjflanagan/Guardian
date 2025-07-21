# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guardian is an AI-powered healthcare application designed to help users aggregate, manage, and understand their medical records. It's a patient-owned healthcare data platform built with Next.js, Supabase, and TypeScript.

## Development Commands

### Core Web Application (guardian-web/)
```bash
# Install dependencies
cd guardian-web && npm install

# Development server
npm run dev  # Starts Next.js dev server on http://localhost:3000

# Build and deployment
npm run build  # Production build
npm start      # Production server
npm run lint   # ESLint code linting
```

### Testing
No test framework is currently configured. Check with the user before adding testing infrastructure.

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
1. Clone repository and navigate to `guardian-web/`
2. Install dependencies with `npm install`
3. Configure Supabase project and environment variables
4. Run `npm run dev` for local development

### Supabase Integration
- **Local development**: Uses `supabase/config.toml` for auth and function configuration
- **Edge Functions**: Located in `supabase/functions/` with Deno runtime
- **Database**: PostgreSQL with RLS enabled for security

### Security Considerations
- Row Level Security (RLS) enforced on all user data
- PKCE authentication flow for enhanced security
- User data isolation in both database and storage
- Input validation on file uploads

## Current Status

The core infrastructure is complete and production-ready:
- ✅ Authentication system fully functional
- ✅ File upload and storage system operational
- ✅ Document processing pipeline operational (Vision + OCR)
- ✅ User interface polished and responsive
- ✅ AI/OCR integration complete - **POC ready for testing**

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