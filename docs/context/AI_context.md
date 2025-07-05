# AI_context.md

> **This file is the canonical project context for Guardian AI. At the end of every session, the current AI assistant should update this file to reflect the latest state, decisions, and next steps.**

## 1. Project Goal

Build a prototype of "Guardian," an AI-powered healthcare app for uploading, analyzing, and managing medical records. The app should deliver a "wow-factor" UX and be maintainable by a solo developer.

## 2. Chosen Tech Stack & Architecture

- **Frontend:** Next.js 14 (TypeScript)
- **Styling:** Tailwind CSS, shadcn/ui
- **Deployment:** Vercel
- **Authentication:** Supabase Auth (see docs/decisions/0001-supabase-vs-neon.md)
- **Database:** Supabase Postgres
- **File Storage:** Supabase Storage (S3-compatible, with Cloudflare R2 as a future migration path)
- **AI Orchestration:** LangGraph / LlamaIndex (planned for GCP Functions)
- **Documentation:**
    - In-repo: `docs/` (see especially `docs/decisions/0001-supabase-vs-neon.md` and `docs/guides/supabase-setup.md`)
    - Notion: "Guardian Dev Hub" (serves as navigation and planning hub)

## 3. Current Status (As of 2025-07-03)

- **Repository:** Cleaned and force-pushed to GitHub. Oversized files and history issues resolved.
- **File Structure:**
    - `guardian-web/components/ui` and `components/shared` for UI.
    - `lib/` and `utils/` for logic/helpers.
    - `app/(auth)` and `app/(main)` for route groups.
    - Clerk auth pages replaced by Supabase Auth.
- **Docs:**
    - `README.md` now links to ADR for DB/Auth/Storage decision.
    - `docs/decisions/0001-supabase-vs-neon.md` records the rationale and migration plan.
    - `docs/guides/supabase-setup.md` is the canonical setup guide.
    - Notion "Guardian Dev Hub" is organized for solo dev workflow, with direct links to repo docs.

## 4. Key Decisions

- **Supabase** chosen for DB, Auth, and Storage to maximize solo dev velocity and minimize DevOps.
- **Cloudflare R2** is the preferred S3-compatible storage if/when Supabase Storage is outgrown.
- **All major architectural decisions are documented in `docs/decisions/` and referenced in Notion.**

## 5. Next Immediate Step

- Implement Supabase Auth logic and protect routes in `guardian-web/middleware.ts`.
- Continue building out the Notion "Guardian Dev Hub" and keep it in sync with in-repo docs.
- At the end of each session, update this file with:
    - New decisions
    - Changes to stack or architecture
    - Next immediate step(s)
    - Any blockers or open questions

## 6. Session Update (2025-07-05)

**Progress:**
- Supabase Auth fully implemented: magic link sign-in replaces Clerk, with route protection via middleware.
- File upload helper and UI integrated: authenticated users can upload medical documents to Supabase Storage, with RLS and per-user bucket policies.
- Modular pipeline architecture documented in `docs/architecture/pipeline.md`, summarizing the pluggable, vendor-agnostic design and next steps.
- Linter and TypeScript errors resolved; project structure and config cleaned up for maintainability.

**Decisions:**
- All authentication and storage flows now use Supabase (see ADR-0001).
- Clerk and legacy auth code fully removed.
- `@` alias configured for imports; all source, config, and dependency files are tracked in git.

**Next Steps:**
- Implement the pluggable `document-processor` endpoint (Supabase Edge Function or Cloudflare Worker).
- Benchmark cold-start, latency, and cost for each compute option.
- Document RLS policies and Auth plan in `/docs/security/rls-auth.md`.
- Continue updating Notion "Guardian Dev Hub" and in-repo docs at the end of each session.

**Blockers/Open Questions:**
- None at this time. Ready to proceed with pipeline implementation and benchmarking.
