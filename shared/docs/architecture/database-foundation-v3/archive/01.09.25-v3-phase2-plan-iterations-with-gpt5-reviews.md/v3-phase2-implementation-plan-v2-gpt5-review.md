GPT review of shared/docs/architecture/database-foundation-v3/v3-phase2-consensus-implementation-plan-v2.md
DATE: 31/08/2025


Overall: Strong improvement. Hybrid with Render is the right call. Before implementation, fix the red flags below to avoid reliability and security gaps.

Key improvements since last version
- Clear Render+Supabase split (L69‑86, L630‑655).
- Concrete RPCs for enqueue and claim (L141‑181, L183‑209).
- Idempotent upload flow and SLOs added (L301‑342, L467‑485).
- Risk level kept MEDIUM‑HIGH until validation (L557).

Blocking issues and concrete fixes
- Schema drift vs V3 SQL
  - L33‑41, L129: `shell_files.processing_error JSONB` is referenced, but 03_clinical_core.sql originally used TEXT. Decide JSONB (recommended), then add an update to change the type and index if needed.
  - L303‑325: `shell_files.idempotency_key` used in upsert; ensure the column and a UNIQUE index exist in schema.
- Job queue contract completeness
  - L44‑67: “enhanced job_queue” aligns with claim query (status, scheduled_at, priority, created_at), good. Add:
    - Heartbeat/timeout columns (e.g., `heartbeat_at`) to reclaim stuck jobs.
    - Optional `dead_letter_at` to timestamp DLQ events.
  - L183‑209: `claim_next_job` lacks SECURITY DEFINER and explicit permission model. Add SECURITY DEFINER and restrict execution to service role or a dedicated worker role. Consider a companion `update_job_status(job_id, status, error, next_retry_at)` RPC for consistent transitions and audit.
  - Missing retry/DLQ RPCs: define `retry_job(job_id, next_time)` and `dead_letter_job(job_id, error)` or document worker-side SQL.
- RLS policy model
  - L487‑505: Proposed `shell_files` policy only allows owner access; it ignores delegated access and provider flows. Replace with the V3 functions (`has_profile_access` / `has_profile_access_level`) or a single, tested semantic policy to avoid OR‑widening. Add explicit “worker runs with service role” note to bypass RLS appropriately.
  - job_queue RLS: Make job_queue fully service‑role only; ensure users cannot list or read job payloads.
- Worker lifecycle specifics
  - L247‑257, L343‑429: Good skeleton. Add:
    - Heartbeat updates (e.g., every N seconds) to mark active processing; a cron to requeue timed‑out jobs.
    - Backoff stored in DB: worker must update `retry_count` and `scheduled_at` atomically with error info (and set `status='pending'`) to avoid races.
    - Idempotency: add a dedicated uniqueness key per job (e.g., shell_file_id + job_type) if you want at‑most‑once per stage, or document at‑least‑once behavior with idempotent writes.
- Security and secrets
  - L509‑530: Worker uses SUPABASE_SERVICE_ROLE_KEY—correct, but:
    - Scope all write paths through RPCs where possible (defense in depth).
    - Never expose service role key outside Render. Add a check that Edge Functions use anon keys with RLS, not service role.
- External API limits and quotas
  - No mention of OpenAI/Vision API rate limits. Add concurrency caps per worker and token budgets to avoid throttling. Include backpressure by leaving jobs “pending” when concurrency is saturated.
- Observability and audit
  - L467‑485: Good SLOs. Add correlation IDs:
    - Include `job_id` in every log line and audit event; store `job_id` on clinical tables or in audit metadata for traceability.
  - Ensure every write to clinical tables is accompanied by `log_audit_event(..., p_patient_id)` (state this explicitly in worker write‑back steps).
- Storage and access
  - Worker file download (L93‑105, L381‑399): Clarify access method: signed URL vs service role + storage SDK. If using service role, ensure bucket policies prevent accidental public access. Document large file handling/memory bounds.
- Cutover and rollback
  - L277‑282, L589‑593: Keep legacy code in repo (non‑deployed) until post‑deployment validation completes. Add a one‑page runbook with exact steps, health checks, and rollback (switch worker off, stop enqueues, revert functions).

Minor issues and polish
- Naming consistency
  - Use one name for the AI worker: the plan uses both “ai queue” and earlier “ai‑processor” in prior docs; here it lists only core functions (good). If you’ll add an “ai‑coordinator‑v3” later, keep naming consistent.
- Render YAML (L532‑551)
  - Verify Render autoscaling keys (targetCPUPercent/targetMemoryPercent) match current spec. Fine as plan-level pseudo‑IaC, but expect adjustment.
- Testing
  - L585‑586, L589‑592: Add tests for RLS using real user JWTs (not only service role), and a chaos test for network failures between Render and Supabase.

What’s good and can proceed
- Hybrid architecture and two‑queue split (L121‑129) match your scale goal (1,000+ concurrent).
- RPC designs are close to production-ready; only minor hardening needed.
- Idempotent upload path and SLOs are solid.

Bottom line
- Approve direction with the specific fixes above:
  - Align schema (processing_error JSONB, idempotency_key).
  - Complete job lifecycle (heartbeat/timeout, DLQ fields, secured RPCs).
  - Use V3 access functions for RLS; lock job_queue to service role.
  - Add rate‑limit backpressure and a cutover runbook.

Once these are addressed, this plan is implementation‑ready for a robust pre‑launch deployment targeting 1,000 concurrent uploads.