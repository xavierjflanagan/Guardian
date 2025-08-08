## Guardian Frontend Unified Strategy — GPT-5 Review (v4)

**Date/Time:** Fri Aug  8 10:05:51 AEST 2025
**Scope:** Review of unified plan across `docs/architecture/frontend/` with synthesis from `frontend-gemini-and-opus4-discussion-07-08-2025.md`, plus subfolder files (`guides/README.md`, `implementation/README.md`, `implementation/phase-1-foundation.md`, `components/README.md`).

---

## Executive summary

**Verdict:** Adopt the unified plan as-is with minor, high-leverage refinements. It balances platform thinking with pragmatic Next.js execution, aligns cleanly with the pipeline (ingestion → AI → normalization → UI), and front-loads multi-profile and privacy concerns.

**Key refinements to apply immediately:**
- **Consolidate provider composition** in a single `Providers` wrapper to avoid double-wrapping contexts.
- **Standardize data fetching on TanStack Query** with SSR hydration and sensible defaults.
- **Harden real-time strategy**: initial real-time for documents only; timeline stays fetch-first until needed.
- **Codify event logging contract** (schema, PII redaction, retention, rate-limiting); keep metadata minimal.
- **Unify profile scoping**: ensure all queries/subscriptions use a consistent key (`profile_id`) matching schema and RLS.

Outcome: faster first implementation, fewer regressions, strong privacy posture, and a stable base for the component library.

---

## What’s strong and should be preserved

- **Provider hierarchy:** `Auth → Profile → Privacy → Data → Notification` provides clear seams for multi-profile, privacy settings, and data concerns without custom engines.
- **Standardized component contracts:** Platform-aware, profile-aware props (see `components/README.md`) future-proof web/mobile/provider portal and enable reuse.
- **Event logging posture:** Lightweight `logUserEvent` across components collects valuable signals for future AI/analytics without committing to event sourcing.
- **Value → Trust → Narrative order:** Dashboard (value), Documents (traceability with real-time), Timeline (narrative) sequence builds confidence before deep history.
- **Quality gates in implementation docs:** Performance, accessibility, and testing standards are already defined and actionable.

---

## Clarifications and fixes from subfolder review

- **Provider composition:** In `implementation/phase-1-foundation.md`, avoid re-wrapping `AuthContext.Provider` inside `ProfileProvider`. Compose all providers once in `app/providers.tsx` and mount via `app/layout.tsx`.
- **Real-time filter keys:** Align on a single key (recommended: `profile_id`) across snippets and hooks; some examples mix `patient_id`.
- **Capability detection:** Return a memoized array to prevent prop-diff churn and unnecessary re-renders.
- **SSR data strategy:** Explicitly standardize TanStack Query with hydration to avoid bespoke fetch patterns and enable consistent caching per profile.

---

## Implementation refinements to de-risk and scale

1) **Data fetching/caching**
- Adopt TanStack Query globally with SSR hydration (`QueryClientProvider` + `Hydrate`).
- Establish defaults: `staleTime` tuned for read-mostly clinical data; retry/backoff; background refetch.
- Enable Devtools in development and document usage in `guides/state-management.md`.

2) **Event logging contract**
- Minimal schema: `id`, `action`, `metadata jsonb`, `profile_id`, `session_id`, `timestamp`, `privacy_level`.
- Enforce PII redaction at the logging function edge; keep metadata terse and non-identifying.
- Set a retention window and lightweight client-side rate limit per session.

3) **RLS alignment by default**
- Bake `profile_id` scoping into all read/write hooks so components cannot query across profiles accidentally.
- Mirror RLS expectations in frontend types and hooks.

4) **Responsive navigation rules**
- Codify desktop (sidebar) vs mobile (bottom nav/hamburger) in shell CSS Grid. Components remain layout-agnostic.

5) **Performance budgets as CI gates**
- Turn the stated budgets (load <500ms, updates <100ms, <1MB initial bundle, virtualized lists) into CI checks (Lighthouse CI, bundle analyzer).

6) **Testing + docs workflow**
- Add Storybook for component specs and Playwright for tab flows. Keep `guides/README.md` checklists as PR acceptance gates.
- Add AA accessibility expectations into the review checklist and externalize strings early for future i18n.

---

## Phase updates with concrete deliverables

### Phase 1 — Foundation & Shell
- Single `Providers` wrapper composing `Auth`, `Profile`, `Privacy`, TanStack Query, and `Notification` providers.
- Responsive shell grid with explicit mobile layout rules.
- Real-time: documents only; timeline fetch-first. Centralized subscription hook with cleanup and connection status.
- Event logging scaffold with sanitization and no-PII policy.

### Phase 2 — Component Library
- Export standardized types: `GuardianComponentProps`, `Capability`, `DateRange`, `UserEvent` in `types/`.
- Ship first platform-aware components: `MedicationList`, `DocumentUploader`, `ProcessingStatus`, `ProfileSwitcher`.
- Storybook stories and tests co-located with components.

### Phase 3 — Feature Assembly
- Tabs assembled in Value → Trust → Narrative order; cross-tab navigation and shared profile context verified.
- Timeline uses virtualization for large lists; fetch-first with pagination.

### Phase 4 — Polish & Production
- Performance/AA gates in CI; error boundaries and loading skeletons standardized across components.

---

## Immediate next steps (low-effort, high-leverage)

1) **Provider skeletons**
- Add `app/providers.tsx` to compose the hierarchy once; referenced from `app/layout.tsx`.

2) **Shared types**
- Publish `GuardianComponentProps`, `Capability`, `DateRange`, `UserEvent` in `types/guardian.ts` (or `types/frontend.ts`).

3) **TanStack Query setup**
- Create `lib/queryClient.ts` with SSR hydration; document usage in `guides/state-management.md`.

4) **Event table draft**
- Define `user_events` schema and retention policy; when ready, add migration under `supabase/migrations`.

5) **POC component**
- Implement `MedicationList` using the standardized props, a typed data hook, and profile-scoped queries; include Storybook + tests.

---

## Risks and mitigations

- **Prop surface creep**
  - Mitigation: Group `context`, `capabilities`, `dateRange`, `onEvent` into a single `componentContext` prop where practical.

- **Subscription sprawl**
  - Mitigation: Centralize channel management and cleanup; monitor connection health; prefer fetch-first unless real-time is essential.

- **Performance drift**
  - Mitigation: Enforce budgets via CI; mandate virtualization for lists >100 rows; profile and memoize heavy components.

- **Privacy leaks**
  - Mitigation: “No PII in events” rule; sanitize at logging edge; align retention with privacy policy.

---

## Success metrics (launch-quality baselines)

- **Performance:** <500ms initial load, <100ms UI updates on mid-range devices; <1MB initial bundle.
- **Reliability:** Real-time document status updates with stable reconnect behavior; zero unhandled promise rejections.
- **Security/Privacy:** All queries scoped by `profile_id`; no PII in user events; AA accessibility passed.
- **Quality:** >80% test coverage for new code; Storybook coverage for core components; Lighthouse >90 across metrics.

---

## References

- `docs/architecture/frontend/_archive/frontend-gemini-and-opus4-discussion-07-08-2025.md`
- `docs/architecture/frontend/guides/README.md`
- `docs/architecture/frontend/implementation/README.md`
- `docs/architecture/frontend/implementation/phase-1-foundation.md`
- `docs/architecture/frontend/components/README.md`



