# Guardian Document Processing Pipeline

**Last updated:** 05 Jul 2025

---

## Overview

Guardian's document processing pipeline is designed to be modular, pluggable, and vendor-agnostic. The architecture enables rapid iteration, easy compute swaps (e.g., Supabase Edge, Cloudflare Workers, AWS Lambda), and future-proofs the system for new processing agents or on-device AI.

---

## Key Design Principles

1. **Pluggable "document-processor" endpoint**
   - All upstream agents (OCR, Triage, Comparator, Master) call a contract-defined URL, not a specific provider implementation.
   - This allows the backend compute to be swapped or upgraded without changing agent code.
2. **Stateless micro-steps**
   - Each agent performs a single, focused task.
   - Chaining and orchestration are handled by event queues or webhooks, not by tightly-coupled code.
3. **Vendor-agnostic data layer**
   - The data layer is built on Postgres (Supabase or Neon), with portable RLS policies.
   - Storage and compute can be moved independently as needed.
4. **Solo-dev friendly**
   - Minimal DevOps, observable logs, and pay-per-use pricing.

---

## Modular Pipeline Diagram

> **Diagram to be added:**
> - Agents (OCR, Triage, etc.) send documents to a pluggable `document-processor` endpoint.
> - The endpoint can be implemented as a Supabase Edge Function, Cloudflare Worker, or other compute service.
> - Results are written to the database and storage, with event/webhook chaining for further processing.

---

## Why Modularity Matters

- **Compute/vendor swaps** are cheap and fast (Cloudflare ↔ GCP ↔ AWS).
- Different runtime caps (10s edge vs 15min Cloud Run) are supported without re-wiring agents.
- On-device processing (e.g., Gemma 3N, Mistral) can be added by targeting the same contract.
- Outage risk is mitigated by the ability to quickly swap or redeploy the processing endpoint.

---

## Architecture Options (2025-07 Review)

| Option | Stack | Suitability |
|--------|-------|-------------|
| **A. Supabase Edge + Storage + Functions** | Same-cloud, low-latency. | Good for rapid iteration; outage risk mitigated by pluggable design. |
| **B. Supabase DB/Auth + Cloudflare Worker compute** | Keep data, move heavy lifting. | Nice balance; Workers easy to deploy; avoids 10s cap. |
| **C. Neon Postgres + Cloudflare R2 + Workers** | Fully serverless, vendor mix. | Maximises flexibility; requires recreating RLS/Auth outside Supabase UI. |
| **D. AWS full-stack (Aurora Serverless + S3 + Lambda/Step Fn)** | Single vendor, IAM tight. | More ops overhead; only if enterprise-grade compliance is needed. |

---

## Next Steps

- Implement the pluggable `document-processor` endpoint as a Supabase Edge Function or Cloudflare Worker.
- Benchmark cold-start, latency, and cost for each compute option.
- Document RLS policies and Auth plan in `/docs/security/rls-auth.md`.
- Review and update this pipeline doc as the architecture evolves.

---

## References
- See [docs/context/edge_function_context.md](../context/edge_function_context.md) for full context and design history.
- ADR-0001 for stack decision rationale. 