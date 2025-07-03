# Guardian AI Pipeline – Edge Function Context & Roadmap  
*Last updated: 04 Jul 2025 (AEST)*

---

## 1. Timeline & Incident Recap
| Date (2025) | Event |
|-------------|-------|
| **Jun 26, 02:46 UTC** | Supabase reported *“Elevated error rates in Edge Functions in all regions.”*<br>Symptoms: 404 `NOT_FOUND` on deployed functions. Outage lasted ~1 h (AP-SE longest). |
| Jun 26 (later) | Our function **`process-document`** re-tested → healthy. |
| Jun 28 | GitHub issues closed by Supabase maintainers as “resolved by platform fix.” |

**Takeaway:** Our support ticket was triggered by a genuine platform bug, not mis-configuration.

---

## 2. Why We Originally Chose Supabase Edge Functions

| Requirement | Edge Function Benefit |
|-------------|-----------------------|
| **Low-latency, same-cloud calls** to Postgres (`health_records`, `documents`) | Runs in Supabase PoP → round-trip < 50 ms. |
| **Secure service-role key** (avoid exposing in client) | Key auto-injected inside function runtime. |
| **Event-driven start** on file upload | Storage “object-created” webhook directly triggers Edge Function. |
| **Simple DX / billing** | One CLI (`supabase functions deploy`) and no separate invoice line-item during prototyping. |

---

## 3. Current Limitations

* Single-vendor dependency – another routing outage would stall OCR pipeline.  
* 10 s execution cap (cold starts + Vision API calls can exceed this).  
* Limited observability vs. Cloudflare/Cloud Run logs.

---

## 4. Alternative Architecture Paths

| Option | What Changes | Pros | Cons / Unknowns |
|--------|--------------|------|-----------------|
| **A. External Compute, keep Supabase data**<br>(Cloudflare Workers / Vercel Edge / AWS Lambda) | Replace `process-document` with Worker/Lambda. Use `supabase-js` + service key. | • Resilient to Supabase runtime bugs<br>• Longer execution windows | • Cross-cloud latency<br>• Manual secret rotation |
| **B. Hybrid: Neon + S3/R2, drop Supabase Storage** | Move Postgres to Neon. Keep Auth or roll your own. | • Pay-per-use DB scaling<br>• Region freedom | • Re-implement RLS & dashboard tooling |
| **C. Full vendor stack (AWS / GCP)** | Aurora Serverless + S3 + Lambda + Step Functions | • Tight IAM, single vendor<br>• Step Functions map nicely to multi-agent pipeline | • Highest DevOps overhead |
| **D. Stay on Supabase, add Fallback** | Keep Edge Function but add retry to external endpoint on 404/5xx | • Minimal code churn<br>• Quick resilience win | • Still primary-path dependency on Supabase |

---

## 5. Decision Framework

1. **Latency target:** < 500 ms from upload to DB write?  
2. **Cost ceiling:** \$X / 1 000 documents (incl. Vision API).  
3. **Ops capacity:** Solo dev for now → favour hosted / low-DevOps.  
4. **Swap-ability:** Pipeline should treat *“document-processor”* as a pluggable endpoint.

---

## 6. Immediate Action Items

| # | Task | Owner | Deadline |
|---|------|-------|----------|
| 1 | **Re-deploy** `process-document` on latest Supabase CLI (≥ v1.162) and sanity-test | Xavier | **05 Jul** |
| 2 | **Proof-of-Concept:** Cloudflare Worker that<br>• receives storage webhook<br>• calls Vision API<br>• writes to Supabase via service key | Xavier | **07 Jul** |
| 3 | Record metrics: cold-start, avg latency, cost/1k docs | — | after POC |
| 4 | Decide: Route A (external compute) vs Route D (fallback) | Team | **10 Jul** |
| 5 | Update multi-agent pipeline diagram + README | Xavier | after decision |

---

## 7. Open Questions

* Do we **need** per-page AI routing (blank-page skip etc.) in the same worker, or can it be a later micro-step?  
* If moving compute out, do we also move **Storage** to S3/R2 for higher egress limits?  
* Auth/RLS parity: how painful is it to replicate Supabase policies in Neon or Aurora?  

---

## 8. References

* Supabase status incident – 26 Jun 2025  
* GitHub issues #1379, #1381 – “Edge function 404 after successful deploy” (closed Jun 28)  
* Internal support ticket: `SUP-20250626-EDGE-404`

---

**Next checkpoint:** Review POC latency & cost numbers on 08 Jul 2025, then lock the architecture direction.
