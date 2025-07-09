# AI Context

**Purpose:** Canonical project context for Guardian AI. Updated at the end of every session to reflect the latest state, decisions, and next steps.
**Last updated:** July 9, 2025
**Audience:** Developers, AI contributors, project managers
**Prerequisites:** None

---

## 1. Project Goal

Build a prototype of "Guardian," an AI-powered healthcare app for uploading, analyzing, and managing medical records. The app should deliver a "wow-factor" UX and be maintainable, initially, by a solo developer. For a full overview, see the [Project Overview](../getting-started/overview.md).

## 2. Tech Stack & Architecture

The project uses a modern, scalable, and solo-dev friendly stack.

- **Core Stack:** Next.js, Supabase (Postgres, Auth, Storage), and Vercel for deployment.
- **Architecture:** The system is designed with a modular, pluggable document processing pipeline.

For complete details, please refer to the following documents:
- [Architecture Overview](../architecture/system-design.md)
- [Document Processing Pipeline](../architecture/data-pipeline.md)
- [ADR 0001: Database, Storage, and Authentication Stack Choice](../architecture/adr/0001-database-choice.md)

## 3. Session Updates

This section serves as a running log of progress, decisions, and next steps at the end of each development session.

---

### Session Update (2025-07-09)

**Progress:**
- **Authentication System COMPLETED (Pillar 1)**: Resolved all authentication issues with comprehensive fixes
  - Fixed middleware cookie handling (replaced `getAll/setAll` with individual cookie methods)
  - Created dedicated server client for auth callbacks (`supabaseServerClient.ts`)
  - Added authentication loading states to prevent race conditions
  - Implemented proper error handling with auth-error page
  - Complete magic link flow now working: sign-in → email → callback → authenticated dashboard
- **Data Ingestion System COMPLETED (Pillar 2)**: Full end-to-end file upload and storage workflow
  - Enhanced `uploadFile.ts` to create database records after storage upload
  - Implemented atomic operations with cleanup on database failures
  - User-specific folder structure: `userId/timestamp_filename.ext`
  - Real-time document list updates after successful uploads
- **Document Processing Pipeline FOUNDATION**: Basic processing infrastructure established
  - Supabase Edge Function (`document-processor`) implemented and functional
  - Database status tracking: uploaded → processing → (future: completed)
  - CORS configuration and proper error handling
  - Ready for OCR/AI integration in next phase
- **User Interface POLISHED**: Complete user experience with responsive design
  - Authentication state management with loading indicators
  - Error/success messaging throughout the application
  - Sign-out functionality with proper session cleanup
  - Document management dashboard with real-time updates

**Critical Technical Fixes:**
- **Middleware Cookie Handling**: Replaced broken `getAll/setAll` pattern with individual cookie methods per Supabase documentation
- **Authentication Race Conditions**: Added `isAuthLoading` state to prevent premature rendering before auth verification
- **Server vs Client Context**: Created separate clients for server-side (auth callbacks) and client-side (browser) operations
- **Database Integration**: Fixed missing document record creation in upload process

**Decisions:**
- **Edge Function Choice**: Selected Supabase Edge Functions over Cloudflare Workers for document processing
- **Authentication Strategy**: Magic link only (no password-based auth) for MVP simplicity
- **File Storage Structure**: User-specific folders with timestamp prefixes for organization
- **Error Handling**: Comprehensive error pages and user feedback throughout the application

**🎯 PROOF OF CONCEPT DEADLINE: July 31, 2025 (3 weeks remaining)**

**6 KEY PILLARS STATUS:**
- ✅ **Pillar 1: Authentication System** - COMPLETE (sign-in, sign-out, user management)
- ✅ **Pillar 2: Data Ingestion** - COMPLETE (file upload, storage)
- 🚧 **Pillar 3: OCR Integration** - IN PROGRESS (any format → AI-readable text)
- 🚧 **Pillar 4: AI Engine** - PENDING (A/B testing: cheap modular vs expensive SOTA)
- 🚧 **Pillar 5: Medical Data Storage** - PENDING (tagged, traceable, metadata-rich)
- 🚧 **Pillar 6: Health Profile Interface** - PENDING (user-facing data visualization)

**Next Steps:**
- **Week 2 (July 14-20): OCR & AI Engine Implementation**
  - **Pillar 3:** OCR service integration (Google Cloud Vision/AWS Textract/Azure OCR)
  - **Pillar 4:** AI engine A/B framework (cheap vs expensive models)
  - Medical data extraction with quality comparison testing
- **Week 3 (July 21-31): Medical Data & Health Profile**
  - **Pillar 5:** Medical data storage with comprehensive metadata tagging
    - Data source traceability (link back to exact source on original document)
    - AI justification (why AI deemed information medically relevant)
    - Metadata tags: 'medication', 'allergy', 'condition', 'procedure', 'test_result'
    - Cross-referencing: Single data point in multiple profile sections
  - **Pillar 6:** Health profile interface (factual medical information display)
    - No AI interpretation in primary view
    - Clear AI attribution when content is "AI-generated/interpreted"
    - Professional source priority: Verbatim from qualified health professionals

**Pipeline Architecture:**
```
Document Upload → OCR Text Extraction → AI Analysis → Medical Data Storage → Health Profile Display
```
**Current Status:** Pillars 1-2 complete, Pillar 3 (OCR) starting implementation

**Blockers:**
- None - all critical infrastructure is now functional and ready for AI integration

**Success Metrics for Proof of Concept:**
- OCR accuracy: >98%
- AI medical data extraction accuracy: >98% (CRITICAL FOR PATIENT SAFETY)
- Critical medical information accuracy: >99% (medications, allergies, conditions)
- Dosage and numerical data accuracy: >99.5% (medication dosages, test values)
- Data traceability: 100%
- Health profile completeness: >95%
- End-to-end workflow completion: >90%
- Human review flagging: 100% of extractions with confidence <95%

---

### Session Update (2025-07-07)

**Progress:**
- Researched dual AI engine pipeline approach: expensive multimodal AI vs modulated cheaper models for A/B testing and cost optimization
- Extensive business development research: company registration, trading names, ABN, CBN, trademarking, internationalization considerations
- Documentation system optimization and enhanced sign-in/sign-off protocol implementation
- Identified redundancy in sole trader ABN setup due to company registration plans

**Decisions:**
- **Dual AI Pipeline Strategy**: Implement two parallel AI engines for comparative analysis and A/B testing culture
- **Company Name Pivot**: Guardian name has trademark conflicts, need to pivot to new company/trading name
- **Business Structure**: Moving from sole trader to company registration structure

**Context Evolution:**
- Project now includes business development considerations alongside technical implementation
- AI pipeline architecture expanded to include cost optimization and A/B testing framework
- Documentation protocols enhanced for better session management and context preservation

**Next Steps:**
- Local deployment testing (email and login functionality)
- AI pipeline implementation following dual-engine approach
- Company/trading name finalization and selection
- Focus on product implementation over documentation

**Blockers:**
- Guardian name trademark conflicts requiring urgent pivot to new name
- AI pipeline still in research phase, need to move to concrete implementation

---

### Session Update (2025-07-05)

**Progress:**
- Supabase Auth fully implemented: magic link sign-in replaces Clerk, with route protection via middleware.
- File upload helper and UI integrated: authenticated users can upload medical documents to Supabase Storage, with RLS and per-user bucket policies.
- Modular pipeline architecture documented in `docs/architecture/pipeline.md`, summarizing the pluggable, vendor-agnostic design and next steps.
- Linter and TypeScript errors resolved; project structure and config cleaned up for maintainability.

**Decisions:**
- All authentication and storage flows now use Supabase (see [ADR-0001](../decisions/0001-supabase-vs-neon.md)).
- Clerk and legacy auth code fully removed.
- `@` alias configured for imports; all source, config, and dependency files are tracked in git.

**Next Steps:**
- Implement the pluggable `document-processor` endpoint (Supabase Edge Function or Cloudflare Worker).
- Benchmark cold-start, latency, and cost for each compute option.
- Document RLS policies and Auth plan in a new `docs/security/rls-auth.md` file.

**Blockers/Open Questions:**
- None at this time. Ready to proceed with pipeline implementation and benchmarking.

---

### Previous Session (2025-07-03)

- **Repository:** Cleaned and force-pushed to GitHub.
- **File Structure:** Re-organized for clarity (`app/(auth)`, `app/(main)`, etc.).
- **Docs:** Key architectural decisions and setup guides were created. See [ADR-0001](../decisions/0001-supabase-vs-neon.md) and the [Supabase Setup Guide](../guides/supabase-setup.md).
