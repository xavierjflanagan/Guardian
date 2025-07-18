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
- ✅ Document processing foundation ready
- ✅ User interface polished and responsive
- 🚧 Ready for AI/OCR integration phase

Next development phase focuses on integrating OCR services and AI processing capabilities into the existing Edge Function architecture.