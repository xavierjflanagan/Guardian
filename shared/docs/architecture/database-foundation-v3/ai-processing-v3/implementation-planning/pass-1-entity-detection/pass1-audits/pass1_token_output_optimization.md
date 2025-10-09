## Pass 1 Token Output Optimization (Cost + Latency)

Created: 2025-10-09

Purpose: Reduce completion (output) tokens and end-to-end wall time for Pass 1 while preserving downstream fidelity for Pass 2/3.

### Background

- Current Pass 1 uses a dual-input prompt (vision + OCR cross-check) and emits rich per-entity JSON (classification, confidences, OCR cross-ref, spatial data, quality flags).
- Typical single-page medical docs yield 40–60 entities; strict list splitting multiplies counts.
- Observed usage: ~6k input tokens, ~19k output tokens per doc.
- OpenAI pricing (Standard): output tokens cost ~8–10x more than input; cached-input discounts help only reused input segments, not output.

### Why output is high (root causes)

1) Verbose per-entity objects (repeated long keys)  
2) Strict list/table splitting increases entity count  
3) Multiple free-text fields per entity  
4) Spatial data encoded as verbose objects  
5) Global metadata included in every entity instead of once

### Optimization Goals

- Cut completion tokens by 40–60% without losing data needed for Pass 2.
- Improve model latency (less text to generate) and time-to-first-result.
- Keep a single vision pass to avoid double vision cost; enable parallel text-only work if we split features later.

### High-Impact Tactics (implement in order)

1) Compact Entity Encoding (arrays instead of objects)
- Emit entities as arrays with a fixed column order; send a single header mapping.  
- Example fields: [entityId, type, subtype, conf, page, x, y, w, h, sourceCode, flags, notes?]
- Server expands arrays back into objects for storage/UI.  
- Expected savings: 40–60% of completion tokens.

2) Confidence-Gated Detail
- For confidence ≥ 0.90: emit only minimal fields (no ai_sees, ocr_text, long reasoning).  
- For < 0.90 or requires_manual_review=true: include extended diagnostics.  
- Expected savings: 10–25% depending on doc mix.

3) Aggressive Free-Text Limits
- Lower caps from 120 chars → 40–60 chars; drop ai_sees and ocr_text for high-confidence items.  
- Replace prose reasoning with short codes where possible.  
- Expected savings: 5–15%.

4) Spatial Data Compression
- Encode bbox as [x,y,w,h]; encode source as one of ["e","a","n","o"] for exact/approx/ai/none.  
- Expected savings: 3–8%.

5) Lift Repeated Constants
- Move taxonomy/version and other invariants to a single top-level section; remove from entities.  
- Compute document_coverage metrics server-side where feasible.  
- Expected savings: 2–5%.

### Prompt/Schema Changes (concise)

- In `pass1-prompts.ts` → OUTPUT FORMAT: define compact array columns explicitly and require minimal fields for high-confidence items.  
- In `Pass1EntityDetector.ts`: set `response_format: { type: 'json_object' }` but instruct compact arrays; enforce via post-parse validation.  
- In `pass1-translation.ts`: add expander to map arrays → DB objects; add strict validators.  
- In `pass1-schema-mapping.ts`: update mappers to read compact arrays.

### Example Compact Output

Header (once):  
```
{
  "version": "pass1-compact-v1",
  "entity_columns": [
    "id","type","subtype","conf","page","x","y","w","h","src","flags","note"
  ]
}
```

Entities:  
```
{
  "entities": [
    ["e1","vital_sign","blood_pressure",0.96,1,123,220,210,40,"e",[],null],
    ["e2","medication","rx",0.93,1,140,780,520,38,"a",[],null],
    ["e3","patient_identifier","full_name",0.62,1,80,150,460,34,"a",["review"],"Low OCR clarity" ]
  ]
}
```

### Latency Improvements (beyond tokens)

- Keep one vision pass → optional parallel text-only branches if splitting features (e.g., entity vs profile).  
- Lower worker polling to 1000ms; increase safe concurrency.  
- Stream partial results to UI (page-first or chunked entities) for faster “wow” moment.

### Cost Notes

- Cached input (OpenAI): discounts reused input only; outputs remain full price.  
- Splitting into 1a/1b only helps cost if the second call avoids vision and emits fewer output tokens than the single-call baseline.

### Rollout Plan

1) Implement compact encoding + confidence-gated detail behind env flag `PASS1_COMPACT_OUTPUT=true`.  
2) A/B test on 20 docs; record input/output tokens, wall time, and quality metrics.  
3) Tune thresholds (0.85–0.92) for minimal vs detailed emission.  
4) Promote to default; remove legacy path after verification.

### Success Criteria

- ≥40% reduction in completion tokens on average.  
- ≥20% reduction in Pass 1 wall time.  
- No decrease in downstream extraction quality (measured via review queue rate, Pass 2 enrichment success).


