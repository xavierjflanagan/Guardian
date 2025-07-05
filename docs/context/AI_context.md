# AI_context.md

> **This file is the canonical project context for Guardian AI. At the end of every session, the current AI assistant should update this file to reflect the latest state, decisions, and next steps.**

## 1. Project Goal

Build a prototype of "Guardian," an AI-powered healthcare app for uploading, analyzing, and managing medical records. The app should deliver a "wow-factor" UX and be maintainable by a solo developer. For a full overview, see the [Project Overview](../PROJECT_OVERVIEW.md).

## 2. Tech Stack & Architecture

The project uses a modern, scalable, and solo-dev friendly stack.

- **Core Stack:** Next.js, Supabase (Postgres, Auth, Storage), and Vercel for deployment.
- **Architecture:** The system is designed with a modular, pluggable document processing pipeline.

For complete details, please refer to the following documents:
- [Architecture Overview](../architecture/OVERVIEW.md)
- [Document Processing Pipeline](../architecture/pipeline.md)
- [ADR 0001: Database, Storage, and Authentication Stack Choice](../decisions/0001-supabase-vs-neon.md)

## 3. Session Updates

This section serves as a running log of progress, decisions, and next steps at the end of each development session.

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
