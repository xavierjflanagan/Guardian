# Guardian AI Pipeline – Context & Roadmap  
*Last updated: 04 Jul 2025 (AEST)*  

---

## 1. Project History (condensed)

| Date (2025) | Event |
|-------------|-------|
| **Jun 26** | Supabase platform incident caused 404s on Edge Functions (`process-document`) in our *Bolt* prototype (project `dimobexqlloeicpuirjf`). |
| **Jun 27 – 30** | Prototype still useful for reference, but decision made to **start fresh** outside Bolt to avoid accumulated tech-debt. |
| **Jul 03** | New repo & Supabase project **created from scratch** (clean schema, no Edge Functions yet). |
| **Jul 04** | Current planning session – evaluating whether to re-adopt Supabase Edge Functions, move compute elsewhere, or design for hot-swappability from the outset. |

> **Legacy note:** The old *Bolt* project (and its `process-document` function) remain archived for code examples only.

---

## 2. Guiding Design Principles

1. **Pluggable “document-processor” endpoint** – All upstream agents (OCR, Triage, Comparator, Master) call a *contract*-defined URL, not a specific provider.  
2. **Stateless micro-steps** – Each agent does one job; chaining handled by event queue / webhook.  
3. **Vendor-agnostic data layer** – Preference for Postgres (Supabase or Neon) with portable RLS policies.  
4. **Solo-dev friendly** – Minimal DevOps, observable logs, pay-per-use pricing.

---

## 3. Why Keep the Pipeline Diagram Modular?

Even with a clean slate, adopting a **pluggable document-processor** now:

* Keeps **compute/vendor swaps** cheap (Cloudflare ↔ GCP ↔ AWS).  
* Allows different runtime caps (10 s edge vs 15 min Cloud Run) without re-wiring agents.  
* Future-proofs for **on-device** processing (Gemma 3N or Mistral) by targeting the same contract.

**Conclusion:** ✔️ **Yes – update (and simplify) the multi-agent diagram right away** so the new repo starts modular.

---

## 4. Architecture Options (re-evaluated)

| Option | Stack | Suitability for “clean slate” |
|--------|-------|-------------------------------|
| **A. Supabase Edge + Storage + Functions** | Same-cloud, low-latency. | Good for rapid iteration; outage risk mitigated by pluggable design. |
| **B. Supabase DB/Auth + Cloudflare Worker compute** | Keep data, move heavy lifting. | Nice balance; Workers easy to deploy; avoids 10 s cap. |
| **C. Neon Postgres + Cloudflare R2 + Workers** | Fully serverless, vendor mix. | Maximises flexibility; requires recreating RLS/Auth outside Supabase UI. |
| **D. AWS full-stack (Aurora Serverless + S3 + Lambda/Step Fn)** | Single vendor, IAM tight. | More ops overhead; only if we need enterprise-grade compliance ASAP. |

---

## 5. Immediate Action Items (new project)

| # | Task | Owner | Target |
|---|------|-------|--------|
| 1 | Create **`/docs/architecture/pipeline.md`** with updated diagram (show pluggable `document-processor`). | Xavier | 05 Jul |
| 2 | Spike **Cloudflare Worker POC**: receive dummy PDF webhook, call Vision API, write to new Supabase tables. | Xavier | 07 Jul |
| 3 | Benchmark cold-start, avg latency, cost per 1 000 docs; log in `/benchmarks/2025-07-worker-poc.md`. | — | after POC |
| 4 | Decision meeting: pick Option A, B, or C for MVP. | Team | 10 Jul |
| 5 | Draft RLS policies & Auth plan (Supabase vs external) in `/docs/security/rls-auth.md`. | Xavier | 12 Jul |

---

## 6. Open Questions

1. Do we need a **queue/bus** (e.g.\, Supabase Realtime, Upstash) between agents, or are webhooks enough for v0?  
2. Should the OCR layer be **on-device (Gemma 3N)** for mobile uploads, with cloud fallback?  
3. What is the simplest **secrets management** approach across multiple clouds (Doppler, Cloudflare Secrets, AWS SM)?  

---

## 7. Reference Links

* Supabase status incident 26 Jun 2025  
* Archived support ticket `SUP-20250626-EDGE-404` (Bolt prototype)  
* GitHub issues #1379 & #1381 – “Edge function 404” (closed)  

---

> **Next checkpoint:** Review Worker POC results on **08 Jul 2025**, then lock the MVP architecture.
