## Guardian Codebase Quality Review — GPT-5 (General Coding)

**Date/Time:** Fri Aug  8 14:49:45 AEST 2025

---

### Overall verdict

**Clean, readable, and thoughtfully structured.** SQL migrations show strong indexing/RLS/audit design; React components are small and idiomatic; utilities are defensive and explicit. A few critical ID‑semantics issues and one client/server Supabase concern should be corrected during implementation.

---

### Strengths

- **SQL architecture**: Clear module boundaries, explicit indexes for hot paths (timeline, clinical), RLS everywhere, and audit triggers with a canonical `log_audit_event()` function.
- **React components**: Focused components with clear props and meaningful names (`DocumentList`, `DocumentManagementPanel`, `ExtractedInfoPanel`).
- **Utilities**: `AIOutputValidator` is well-structured, with explicit thresholds, completeness scoring, and report generation.

---

### Issues to address (actionable)

- **ID mismatch: documents query uses user_id, schema uses patient_id**
  - Schema (documents):
  - `/supabase/migrations/004_core_clinical_tables.sql`
    - `patient_id UUID NOT NULL REFERENCES auth.users(id)`
  - Frontend query:
  - `/app/(main)/dashboard/page.tsx`
    - `.eq("user_id", user.id)` → should use `patient_id` (or a profile→patient mapping in hooks).

- **Audit logging: wrong patient context passed**
  - `/lib/quality/flagEngine.ts`
    - `p_patient_id: flag.profile_id` → should be a real `patient_id` for clinical audit context; profile_id is different.

- **Timeline filters must remain patient_id-based**
  - `/supabase/migrations/006_healthcare_journey.sql`
    - Table and indexes are keyed on `patient_id`. Frontend hooks should be profile‑scoped but resolve allowed `patient_id`(s) internally.

- **Supabase client usage split**
  - Ensure client components import a browser client; server code uses `createServerClient`. Double‑check `supabaseClientSSR.ts` vs server/client imports to avoid hydration/session issues.

---

### Efficiency and readability

- **SQL**: Verbose but purposeful; indexes and policies target real workloads. Good.
- **TypeScript utilities**: Verbose for clarity. Acceptable now; candidates for consolidation later (e.g., extract common validation helpers).
- **React**: Compact and idiomatic. Planned move to TanStack Query/provider wrappers will further standardize data flow and caching.

---

### Recommendations (no changes applied here)

- **Fix ID semantics end‑to‑end**
  - Documents: query/subscribe by `patient_id` (or map `profile_id → patient_id(s)` in standardized hooks).
  - Quality engine: pass actual `patient_id` to `log_audit_event`.
  - Timeline/clinical: keep filters on `patient_id`; profile‑scoped hooks resolve allowed patients.

- **Harden Supabase client boundaries**
  - Client components use a browser client factory; server code uses `createServerClient`. Avoid mixing to prevent session/hydration bugs.

- **Type safety for IDs**
  - Introduce branded types `ProfileId` and `PatientId` to catch accidental misuse at compile time.

- **Proceed with planned frontend architecture**
  - TanStack Query with SSR hydration; unified `<Providers>`; documents‑only real‑time; `user_events` as PII‑safe telemetry with 90‑day retention.

---

### Sampled files

- `/supabase/migrations/004_core_clinical_tables.sql` — solid schema, indexes, RLS, audit triggers.
- `/supabase/migrations/006_healthcare_journey.sql` — timeline keyed on `patient_id`, rich functions and views.
- `/app/(main)/dashboard/page.tsx` — clean component; fix documents filter to `patient_id`.
- `/lib/quality/flagEngine.ts` — clear rule engine; fix `p_patient_id` usage.
- `/utils/validateAIOutput.ts` — structured validator with clear reporting.
- `/components/DocumentList.tsx`, `/components/DocumentManagementPanel.tsx`, `/components/ExtractedInfoPanel.tsx` — small, readable, idiomatic.


