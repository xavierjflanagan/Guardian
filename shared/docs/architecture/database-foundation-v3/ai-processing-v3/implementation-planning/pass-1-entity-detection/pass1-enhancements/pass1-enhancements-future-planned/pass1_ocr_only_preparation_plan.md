## Pass 1 – OCR‑Only Preparation Plan (Future‑Proofing the Pipeline)

Created: 2025-10-09

**Status:** Active reference document
**Related:** See [pass1-architectural-improvements.md](./pass1-architectural-improvements.md) for detailed implementation guidance

Purpose: Capture the minimal architectural seams we should add now so we can later switch Pass 1 to an OCR‑only input (no vision LLM by default) without a rewrite. This also improves cost/latency today.

### Why prepare now (but don’t overbuild)

- Small seams now avoid a large refactor later.
- We keep the current dual‑input path (OCR + vision) for quality while enabling a future config flip to OCR‑only.
- No need to build the full OCR‑only branch yet; just add mode, storage, and schema invariants.

### Core principles

1) Single mode flag
- `PASS1_MODE=dual|ocr_only`
- dual → OCR then vision LLM; ocr_only → OCR then text‑only LLM prompts.

2) Move OCR to worker (not Edge Function)
- Edge Function: validate + enqueue by reference only.
- Worker: download → OCR → branch by PASS1_MODE.

3) Persist OCR artifacts
- Store per `shell_file_id`: page count, per‑page text, line/word bboxes, normalized coordinates (0–1), page width/height, OCR confidences, provider metadata, processing time.
- Location: Supabase Storage (JSON blobs) or table referencing Storage paths.

4) Stable output schema
- The translator/database layer should be agnostic to vision vs OCR‑only. Same `entities` JSON shape flows into DB.
- Keep compact output options (arrays, confidence‑gated detail) to reduce tokens and latency.

5) Targeted visual fallback
- If OCR‑only confidence is low, or a visual‑only cue is required (signature/checkbox/logo), call a small vision step on that region/page.

### Minimal changes to implement now

- Add `PASS1_MODE` env var and code branch in worker.
- Refactor Edge Function to enqueue without base64 and without OCR.
- In worker, persist OCR artifacts after OCR completes; reuse on retries and downstream passes.
- Ensure prompts and translation produce identical DB schema regardless of mode.

### Later switch procedure (once Pass 2+ are stable)

1) Flip `PASS1_MODE=ocr_only` in Render env.
2) Validate on 10–20 docs: entity recall/precision, table fidelity, manual‑review rate.
3) Optionally enable visual fallback for low‑confidence pages/regions.

### Expected impact

- Cost: Avoids vision tokens on the happy path; pay vision only for targeted fallbacks.
- Latency: Skips vision generation time; faster time‑to‑first‑result; smaller outputs with compact schema.
- Quality: 70–90% of typical medical content is text‑driven; fallbacks cover visual edge cases.

### Caveats to plan for

- Visual‑only signals (logos, stamps, checkboxes, handwriting quality) aren’t in plain OCR; plan fallback or small detectors (DocAI/Form Parser or light CV).
- Require reliable reading order and normalized bboxes from OCR to reconstruct structure.

### Suggested data contracts

OCR artifact (per page):
```
{
  "page_number": 1,
  "size": { "width_px": 2550, "height_px": 3300 },
  "lines": [
    {
      "text": "IMMUNIZATIONS",
      "bbox": { "x": 120, "y": 180, "w": 830, "h": 48 },
      "bbox_norm": { "x": 0.047, "y": 0.055, "w": 0.325, "h": 0.015 },
      "confidence": 0.98,
      "reading_order": 12
    }
  ],
  "provider": "google_vision",
  "processing_time_ms": 14320
}
```

Pass 1 output (unchanged schema, compact option recommended):
```
{
  "processing_metadata": { "model_used": "gpt-4o", ... },
  "entities": [
    ["e1","vital_sign","blood_pressure",0.96,1,123,220,210,40,"e",[],null]
  ]
}
```

### Rollout checklist

1) Add PASS1_MODE branch in worker.  
2) Refactor Edge Function to enqueue by reference only.  
3) Persist OCR artifacts and reference them in DB.  
4) Keep schema stable; enable compact output.  
5) Add optional visual fallback hook (disabled by default).  
6) Document switch instructions for ops.




(me) What do you think of this response from Claude code? My primary AI bought in response to the file you just created and potentially for folding into the other main file that we have anything you want to pass on to Claude code?

gpt5:
- Overall: Strong. I agree with “Option A: merge selectively.” Keep the OCR-only plan as a separate, referenceable doc and fold only the operational bits into the main improvements file.

- Pass to Claude (merge guidance):
  - Storage choice: Use Supabase Storage for OCR artifacts; keep DB lightweight. Add a small `ocr_artifacts` index table with `shell_file_id`, `manifest_path`, `checksum`, `provider`, `pages`, `bytes`, `created_at` for discoverability and GC.
  - Bucket layout: `medical-ocr/{shell_file_id}/manifest.json` plus `page-{n}.json`. Manifest lists pages and versions.
  - Artifact schema: Normalize bboxes to 0–1 and keep pixel values; include `reading_order` at line-level, `confidence` per line, page `width_px/height_px`.
  - GC/retention: Background job to delete artifacts when `shell_files` row is deleted or after N days; log deletions.
  - Mode flags: `PASS1_MODE=dual|ocr_only` and `PASS1_VISUAL_FALLBACK=true|false`. Document behavior per mode.
  - Compact output: Keep the array form as experimental. Recommend defaulting to JSON objects with short keys and a `schema_version` field to avoid positional fragility.
  - Job payload: Remove base64; include `storage_path`, `mime_type`, `file_size_bytes`, `checksum`. Worker downloads on demand.
  - Worker: Move OCR step to worker; add image downscaling; retries; structured logs with `correlation_id`, `shell_file_id`, `job_id`; lower `POLL_INTERVAL_MS` to 1000ms.
  - Backpressure: Document how `scheduled_at` can be deferred; include tuning guidance for `api_rate_limits`.
  - KPIs to track: median p95 latency (upload→Pass1 complete), cost/doc (input/output tokens), OCR-only fallback rate, visual-fallback trigger rate, manual-review rate.
  - Rollback: Simple env flip back to `PASS1_MODE=dual`; artifacts remain compatible.

- Where to merge:
  - Into `pass1-architectural-improvements.md`:
    - Under “Move OCR to Worker”: add artifact persistence details (bucket structure, manifest, reuse).
    - Add a new “Future: OCR-Only Mode (Selective Vision)” section with mode flags, artifact schema, fallback approach, rollout checklist.
  - Keep “compact entity array format” in the OCR plan doc (experimental).

- Minimal table stub (for Claude to reference):
```sql
create table if not exists ocr_artifacts (
  shell_file_id uuid primary key references shell_files(id) on delete cascade,
  manifest_path text not null,
  provider text not null,
  checksum text not null,
  pages int not null,
  bytes bigint not null,
  created_at timestamptz not null default now()
);
```

- Decision summary:
  - Endorse Option A.
  - Use Storage + thin index table + GC.
  - Prefer short-key JSON over positional arrays by default; version the schema.