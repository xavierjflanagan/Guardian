### Guardian Frontend/Monorepo Changes — Review Report (2025-08-09 23:14:14)

Scope
- Reviewed all pending changes detected via repository status, with focus on runtime code and build/deployment config.
- Cross-referenced with `shared/docs/architecture/frontend/implementation/phase-1-foundation.md` (Phase 1/1.5) to validate claimed deliverables.
- Opened and inspected representative files from each new area: apps/web (Next.js app), packages/ui, packages/database, services/supabase (migrations & functions), shared/docs, CI, linting, and tooling.

High-level summary
- The monorepo split (apps, packages, services, shared) is coherent and future-proof.
- The Next.js app compiles on paper given configs, but there are important risks before committing:
  - Critical: Supabase CLI/project layout assumptions are broken (supabase directory moved under services), which will disrupt local dev and migrations.
  - Risk: Duplicate UI components exist in both `apps/web/components/shared` and `packages/ui`, inviting divergence.
  - Risk: CI quality workflow has paths and tools that may not match the new structure (PII scan path, bundle analyzer).
  - Risk: Realtime filter construction and RPC stubs are acceptable as stubs, but schema assumptions need settling before launch.

Files discovered as changed (summary)
- Root: .eslintrc.json, turbo.json, lighthouserc.js, .github/workflows/quality-gates.yml, package.json (workspaces), package-lock.json
- New monorepo dirs: apps/, packages/, services/, shared/, tools/
- apps/web: Next.js application relocated with app/, components/, lib/, types/, middleware, configs
- packages/ui: Initial component library (Avatar, Dropdown, etc.) with tokens and build output
- packages/database: Placeholder clients/types
- services/supabase: Migrations and Edge Functions moved here; new `021_phase1_rpc_stubs.sql`
- shared/docs: Documentation reorganized per Phase 1.5

Key findings and recommendations

1) Supabase project layout (critical)
- Finding: Supabase-related assets (migrations and edge functions) moved to `services/supabase/…`, and the original root `supabase/` folder is removed.
- Impact: Supabase CLI expects a `supabase/` directory at the repo root for local dev/`supabase start`, migrations, functions, and link to project ref. Tooling will break.
- Recommendation: Keep `supabase/` at the repository root. If you prefer `services/` for organization, use symlinks or documentation only, but the CLI operational directory must remain `./supabase`.

2) Next.js app (apps/web) configuration
- package.json: Scripts (dev/build/start/lint/typecheck/analyze) are fine. Next 15 + React 19 versions are consistent.
- tsconfig.json: `@/*` maps to app-local root, matching imports (e.g., `@/lib/*`). Good.
- tailwind.config.ts and globals.css: Content globs include pages/components/app; layout grid matches shell CSS.
- next.config.mjs: Empty; OK for now.
- middleware.ts: Proper `createServerClient` usage with cookie bridge; ensure NEXT_PUBLIC_SUPABASE_* envs present.
- Recommendation: No blocking issues; consider adding bundle analyzer only when needed (see CI section).

3) Supabase clients and providers
- apps/web/lib/supabaseClientSSR.ts: Browser client creation is correct for client components.
- apps/web/lib/supabaseServerClient.ts: Server client uses next/headers cookies; tolerant to server-component constraints. Good.
- apps/web/app/providers/ProfileProvider.tsx: Clean context, memoized value, loads profiles, resolves allowed patients via RPC, logs `profile_switch` to user_events.
  - Risk: Client-side insert into `user_events` relies on RLS policies. Ensure RLS `WITH CHECK (profile_id = auth.uid())` is present.
  - Suggestion: For audit-critical events, consider an Edge Function in future.

4) React Query configuration
- apps/web/lib/queryClient.ts: Healthcare-aware defaults (staleTime, retries). Good.

5) Data hooks and realtime
- apps/web/lib/hooks/useRealtime.ts: Subscribes with Postgres Changes channels; filters by `patient_id` using `in.(...)` or `eq.`.
  - Note: For many patient IDs, channel filter length may grow; consider splitting or server-side fan-out in the future.
  - Note: Quoting is not required for UUID in PostgREST filters, but ensure no spaces in the join.
- apps/web/lib/hooks/useEventLogging.ts: Privacy-aware sanitization + rate limiting; inserts into `user_events`.
  - Ensure RLS and indexes exist; session ID generation is sound.

6) Error boundaries
- apps/web/components/error/*: Application/page/component/data boundaries implemented with a clear fallback UX; logs to `user_events`. Good for resilience.

7) RPC stubs (services/supabase/migrations/021_phase1_rpc_stubs.sql)
- Creates `get_documents_for_profile` and `get_timeline_for_profile` with SECURITY DEFINER and basic ownership checks.
- Returns reasonable columns and handles non-existent tables with NOTICEs.
- Suggestion: Before launch, replace stubs with production implementations, add explicit schema qualifying (public.) and deterministic ordering, plus pagination (cursor-based) for scale.

8) UI library vs in-app shared components (duplication risk)
- `apps/web/components/shared/*` and `packages/ui/components/*` both contain Avatar/Dropdown/etc.
- Risk: Drift and inconsistent UX.
- Recommendation: Choose one source of truth (prefer `packages/ui`) and migrate app imports to `@guardian/ui`. Remove or archive duplicates from the app in Phase 2.

9) CI/workflows and quality gates
- .github/workflows/quality-gates.yml
  - Installs with `working-directory: apps/web` and runs `npm ci`. In workspaces, consider installing at repo root for hoisting/cache efficiency, or keep per-app install intentionally (document choice).
  - Bundle analysis step sets `ANALYZE=true` but there is no next-bundle-analyzer configured in `next.config.mjs`. This step will likely no-op or fail.
  - PII scan step looks under `src/` but the app uses `app/`. Will never scan real code.
  - Lighthouse CI and axe CLI steps look fine (use `wait-on` via npx).
- lighthouserc.js: Sensible budgets for healthcare; keep thresholds under review.
- turbo.json: Reasonable defaults.
- Recommendation:
  - Either add bundle analyzer plugin or disable the step until configured.
  - Update PII scan paths to include `apps/web/app`, `apps/web/components`, `apps/web/lib`.
  - Consider running installs at root with workspaces to reduce duplication.

10) Packages/database
- Currently placeholders. Fine for Phase 1.5, but avoid importing from here until clients/types exist.

11) Types and imports
- In earlier non-monorepo code, there were type-only import corrections flagged. In the current `apps/web` code, imports do not appear to misuse value vs type imports.
- Keep enforcing type-only imports when importing types from runtime modules to avoid bundling types into client output.

12) Security and compliance
- Event logging sanitizes common PII fields; good. Keep a central allowlist for metadata fields over time.
- Ensure RLS for `user_events` exists and indexes: `(profile_id, created_at)` and retention policies.
- Realtime and RPC paths do not expose secrets; good.

Actionable recommendations (ordered)
1. Restore Supabase project directory at repo root (`./supabase/`):
   - Move `services/supabase/migrations` back to `./supabase/migrations`.
   - Keep functions under `./supabase/functions` (or symlink from services if you need parallel structure).
   - Verify `supabase/config.toml`, project ref, and CLI flows.
2. Resolve UI component duplication:
   - Adopt `packages/ui` as the source of truth; update app imports; remove or archive `apps/web/components/shared/*` duplicates.
3. Fix CI workflow mismatches:
   - Update PII scan to target `apps/web/app`, `apps/web/components`, `apps/web/lib`.
   - Add bundle analyzer config or skip that step for now.
   - Decide on install strategy (root vs per-app) and align cache behavior.
4. RPC functions: plan production implementations
   - Add stable ordering and pagination (cursor-based) to RPCs.
   - Schema-qualify references explicitly and add tests.
5. Realtime scalability
   - For many patient IDs, consider multiple smaller channels or server-side fan-out strategies.
6. Event logging hardening
   - Confirm RLS policies and create indexes; consider Edge Function for privileged/validated logging.

What is currently staged/untracked (for your commit)
- Many legacy files are marked as deleted (D) at the repo root, reflecting the monorepo move.
- New monorepo directories are untracked (??): `apps/`, `packages/`, `services/`, `shared/`, plus root configs like `.eslintrc.json`, `turbo.json`, `lighthouserc.js`, and the CI workflow.
- Note: Because the Supabase folder at root is deleted in this change, please decide on item (1) above before committing to main, or commit this on a branch and fix immediately after.

Confidence
- The app will likely run locally under `apps/web` once dependencies are installed; however, Supabase CLI flows (migrations, functions) will be broken until `./supabase` is restored.

Appendix: Files explicitly reviewed
- apps/web: package.json, tsconfig.json, tailwind.config.ts, next.config.mjs, middleware.ts, app/layout.tsx, app/providers.tsx, app/globals.css, app/providers/ProfileProvider.tsx, lib/queryClient.ts, lib/supabaseClientSSR.ts, lib/supabaseServerClient.ts, lib/hooks/useRealtime.ts, lib/hooks/useEventLogging.ts, components/error/*, types/guardian.ts
- packages/ui: package.json, components/Avatar.tsx, components/Dropdown.tsx, index.ts (tokens & helpers)
- packages/database: index.ts, clients/index.ts, types/index.ts (placeholders)
- services/supabase: migrations/021_phase1_rpc_stubs.sql
- Root/Tooling: .eslintrc.json, turbo.json, lighthouserc.js, .github/workflows/quality-gates.yml, package.json

---

## Additional Issues from Claude PR Review (2025-08-09)

**Critical Issues (Must Fix)**

13. **CI Workflow Workspace Name Mismatch (High Priority)**
   - Finding: CI workflow uses `npm run -w apps/web <command>` but the workspace name is `@guardian/web` not `apps/web`
   - Impact: CI fallback commands will fail when executed (lines 28, 31, 34, 61, 63 in quality-gates.yml)
   - Recommendation: Update workspace references to match package.json names or adjust workspace structure

**Medium Priority Issues**

14. **Testing Framework Missing (High Priority for Healthcare App)**
   - Finding: No testing framework configured despite placeholder test scripts in apps/web/package.json
   - Impact: High-risk for healthcare application without comprehensive testing
   - Recommendation: Add Jest + React Testing Library setup with healthcare-specific test patterns

15. **Performance Scaling Concern**
   - Finding: ProfileProvider's loadAllowedPatients may scale poorly with many patient IDs
   - Impact: Realtime subscriptions could become inefficient with large patient lists
   - Recommendation: Consider server-side fan-out for realtime subscriptions

**Low Priority Issues**

16. **Import Path Consistency Monitoring**
   - Finding: Need to monitor for potential confused value/type imports as monorepo structure evolves
   - Impact: Could lead to bundle bloat if types are imported as values
   - Recommendation: Continue enforcing type-only imports during development

17. **Event Logging Architecture Enhancement**
   - Finding: Current client-side inserts to user_events rely on RLS policies
   - Impact: Potential security risk for audit-critical events
   - Recommendation: Consider Edge Functions for critical audit events vs client-side inserts

**Updated Priority Order for Next Actions**

**Before Next Commit (Critical)**
1. Fix CI workspace name references in .github/workflows/quality-gates.yml
2. Restore Supabase project directory at repo root (./supabase/) - **RESOLVED**
3. Test CI pipeline end-to-end to ensure all steps complete successfully

**Next PR (High Priority)**
4. Add comprehensive testing framework (Jest + React Testing Library)
5. Resolve UI component duplication (standardize on packages/ui)
6. Replace RPC stubs with production implementations
7. Fix remaining CI workflow issues (PII scan paths, bundle analyzer)

**Future PRs (Medium Priority)**
8. Performance optimization for realtime subscriptions
9. Security hardening with Edge Functions for audit events
10. Development workflow documentation


